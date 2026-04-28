import json
from pathlib import Path

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.harness import InterpreterHarnessRequest, InterpreterHarnessResponse
from app.schemas.interpreter import InterpreterOutput, StructuredAction
from app.srd.models import RuleFragment, Spell, SrdEntityMatch
from app.srd.retrieval import SrdRetriever


class InterpreterService:
    PROMPT_VERSION = "interpreter.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings, srd_retriever: SrdRetriever | None = None):
        self._client = client
        self._settings = settings
        self._srd_retriever = srd_retriever or SrdRetriever()

    def run(self, request: InterpreterHarnessRequest) -> InterpreterHarnessResponse:
        prompt_path = Path(__file__).resolve().parents[2] / "prompts" / self.PROMPT_VERSION
        system_prompt = prompt_path.read_text(encoding="utf-8")
        model = request.model or self._settings.model_for_role("interpreter")
        prompt_context = self._build_prompt_context(request)
        user_prompt = self._format_prompt(request, prompt_context)
        last_error: AiClientError | None = None
        attempts = self._settings.ai_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                result = self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=InterpreterOutput.model_json_schema(),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_interpreter,
                )
                parsed = InterpreterOutput.model_validate(result.parsed_json)
                parsed = self._normalize_class_feature_output(parsed, prompt_context, request.rawText)
                self._validate_output_contract(parsed, request, prompt_context)
                break
            except (ValidationError, ValueError) as exc:
                last_error = AiClientError(
                    message=f"Interpreter schema validation failed: {exc}",
                    failure_type="schema_validation",
                    retryable=attempt < attempts,
                    status_code=502,
                    attempts=attempt,
                )
            except AiClientError as exc:
                exc.attempts = attempt
                last_error = exc
                if not exc.retryable or attempt >= attempts:
                    raise exc
            if attempt >= attempts and last_error is not None:
                raise last_error

        return InterpreterHarnessResponse(
            provider=result.provider,
            model=result.model,
            latencyMs=result.latency_ms,
            promptVersion=self.PROMPT_VERSION,
            rawOutput=result.raw_text,
            finishReason=result.finish_reason,
            providerRequestId=result.provider_request_id,
            trace={
                "role": "interpreter",
                "provider": result.provider,
                "model": result.model,
                "promptVersion": self.PROMPT_VERSION,
                "latencyMs": result.latency_ms,
                "attempts": attempt,
                "failureType": None,
                "finishReason": result.finish_reason,
                "providerRequestId": result.provider_request_id,
            },
            parsed=parsed,
        )

    def _build_prompt_context(self, request: InterpreterHarnessRequest) -> dict[str, object]:
        matched_spells = self._srd_retriever.find_spells(request.rawText, limit=3)
        related_entity_matches = self._srd_retriever.related_entities_for_text(request.rawText, limit=8)
        related_entities = []
        added_entity_ids: set[str] = set()
        for spell in matched_spells:
            related_entities.append(
                {
                    "id": spell.id,
                    "kind": "spell",
                    "nameEn": spell.nameEn,
                    "nameKo": spell.nameKo,
                    "level": spell.level,
                    "castingTime": spell.castingTime.raw if spell.castingTime else None,
                    "range": spell.range.raw if spell.range else None,
                    "components": spell.components.raw if spell.components else None,
                    "duration": spell.duration.raw if spell.duration else None,
                    "concentration": spell.concentration,
                    "mechanicHints": self._spell_mechanic_hints(spell.playReference),
                    "attackKindKo": self._spell_attack_kind(spell.playReference),
                    "source": spell.source.model_dump(),
                }
            )
            added_entity_ids.add(spell.id)
        for entity in related_entity_matches:
            if entity.id in added_entity_ids:
                continue
            related_entities.append(self._entity_payload(entity))
            added_entity_ids.add(entity.id)
        related_rule_fragments = self._srd_retriever.related_rule_fragments_for_text(
            request.rawText,
            spells=matched_spells,
            limit=6,
        )
        related_rule_hooks = self._srd_retriever.related_rule_hooks_for_text(
            request.rawText,
            entities=[
                entity
                for entity in related_entity_matches
                if entity.kind in {"spell", "magic_item", "condition", "class", "race"}
            ],
            rule_fragments=related_rule_fragments,
            limit=4,
        )
        related_rules = [
            {
                "id": rule.id,
                "domain": rule.domain,
                "titleKo": rule.titleKo,
                "engineOwned": rule.engineOwned,
                "summaryKo": rule.summaryKo,
                "aiForbiddenUse": rule.aiForbiddenUse,
                "source": rule.source.model_dump(),
            }
            for rule in related_rule_fragments
        ]
        related_engine_hooks = [
            {
                "id": hook.id,
                "domain": hook.domain,
                "titleKo": hook.titleKo,
                "engineFunction": hook.engineFunction,
                "trigger": hook.trigger,
                "sourceRuleIds": hook.sourceRuleIds,
                "sourceEntityIds": hook.sourceEntityIds,
            }
            for hook in related_rule_hooks
        ]
        return {
            "matched_spells": matched_spells,
            "related_entity_matches": related_entity_matches,
            "related_rule_fragments": related_rule_fragments,
            "related_rule_hooks": related_rule_hooks,
            "related_entities_payload": related_entities,
            "related_rules_payload": related_rules,
            "related_engine_hooks_payload": related_engine_hooks,
        }

    def _format_prompt(self, request: InterpreterHarnessRequest, prompt_context: dict[str, object]) -> str:
        targets = ", ".join(request.availableTargets)
        related_entities = prompt_context["related_entities_payload"]
        related_rules = prompt_context["related_rules_payload"]
        related_engine_hooks = prompt_context["related_engine_hooks_payload"]
        return (
            "다음 플레이어 입력을 구조화 액션으로 바꿔라.\n"
            f"- actorCharacterId: {request.actorCharacterId}\n"
            f"- sceneSummary: {request.sceneSummary}\n"
            f"- availableTargets: {targets}\n"
            f"- rawText: {request.rawText}\n"
            "\n"
            "relatedEntities는 SRD 번역본에서 추출한 구조화 참고 후보일 뿐이다. "
            "relatedRules는 현재 행동에 필요한 작은 SRD 규칙 조각일 뿐이다. "
            "relatedEngineHooks는 백엔드가 나중에 확정해야 할 deterministic 처리 계약일 뿐이다. "
            "AI는 이 후보를 근거로 상태 변화, 명중, 피해, DC, 슬롯 소비를 확정하면 안 된다.\n"
            "relatedEngineHooks 중 domain이 class_feature인 항목이 플레이어 입력과 직접 맞으면 "
            "action.type='use_class_feature'로 두고 sourceEntityIds의 class feature ID를 action.featureId에 복사하라.\n"
            f"relatedEntities: {json.dumps(related_entities, ensure_ascii=False)}\n"
            f"relatedRules: {json.dumps(related_rules, ensure_ascii=False)}\n"
            f"relatedEngineHooks: {json.dumps(related_engine_hooks, ensure_ascii=False)}\n"
        )

    @staticmethod
    def _validate_output_contract(
        parsed: InterpreterOutput,
        request: InterpreterHarnessRequest,
        prompt_context: dict[str, object],
    ) -> None:
        if parsed.action.actorCharacterId != request.actorCharacterId:
            raise ValueError("action.actorCharacterId must match request.actorCharacterId")
        if parsed.action.targetId is not None and parsed.action.targetId not in request.availableTargets:
            raise ValueError("action.targetId must be one of availableTargets")

        matched_spells = prompt_context["matched_spells"]
        related_entity_matches = prompt_context["related_entity_matches"]
        related_rule_fragments = prompt_context["related_rule_fragments"]
        if not isinstance(matched_spells, list) or not all(isinstance(spell, Spell) for spell in matched_spells):
            raise ValueError("prompt context matched_spells is invalid")
        if not isinstance(related_entity_matches, list) or not all(
            isinstance(entity, SrdEntityMatch) for entity in related_entity_matches
        ):
            raise ValueError("prompt context related_entity_matches is invalid")
        if not isinstance(related_rule_fragments, list) or not all(
            isinstance(fragment, RuleFragment) for fragment in related_rule_fragments
        ):
            raise ValueError("prompt context related_rule_fragments is invalid")
        allowed_spell_ids = {spell.id for spell in matched_spells}
        allowed_item_ids = {entity.id for entity in related_entity_matches if entity.kind == "magic_item"}
        allowed_condition_ids = {entity.id for entity in related_entity_matches if entity.kind == "condition"}
        allowed_rule_ids = {fragment.id for fragment in related_rule_fragments}
        related_rule_hooks = prompt_context["related_rule_hooks"]
        allowed_feature_ids = {
            source_id
            for hook in related_rule_hooks
            for source_id in hook.sourceEntityIds
            if source_id.startswith("class.")
        }

        if parsed.action.type == "cast_spell":
            if parsed.action.spellId is None:
                raise ValueError("cast_spell action requires action.spellId")
            if parsed.action.featureId is not None:
                raise ValueError("cast_spell action cannot include action.featureId")
            if parsed.mentionedSpellId != parsed.action.spellId:
                raise ValueError("cast_spell action requires mentionedSpellId to match action.spellId")
            if parsed.action.spellId not in allowed_spell_ids:
                raise ValueError("cast_spell action.spellId must be one of retrieved spell IDs")
            if parsed.action.attackKind is None and any("spell_attack" in rule_id for rule_id in allowed_rule_ids):
                raise ValueError("spell attack actions require action.attackKind")
        elif parsed.action.type == "use_class_feature":
            if parsed.action.featureId is None:
                raise ValueError("use_class_feature action requires action.featureId")
            if parsed.action.featureId not in allowed_feature_ids:
                raise ValueError("use_class_feature action.featureId must be one of retrieved class feature IDs")
            if parsed.action.spellId is not None:
                raise ValueError("use_class_feature action cannot include action.spellId")
        elif parsed.action.spellId is not None:
            raise ValueError("action.spellId is only allowed for cast_spell actions")
        elif parsed.action.featureId is not None:
            raise ValueError("action.featureId is only allowed for use_class_feature actions")

        if parsed.mentionedItemId is not None and parsed.mentionedItemId not in allowed_item_ids:
            raise ValueError("mentionedItemId must be one of retrieved magic item IDs")

        unexpected_condition_ids = set(parsed.mentionedConditionIds) - allowed_condition_ids
        if unexpected_condition_ids:
            raise ValueError(
                f"mentionedConditionIds include unavailable condition IDs: {sorted(unexpected_condition_ids)}"
            )

        unexpected_rule_ids = set(parsed.requiredRuleCheckIds) - allowed_rule_ids
        if unexpected_rule_ids:
            raise ValueError(f"requiredRuleCheckIds include unavailable rule IDs: {sorted(unexpected_rule_ids)}")

    @staticmethod
    def _normalize_class_feature_output(
        parsed: InterpreterOutput,
        prompt_context: dict[str, object],
        raw_text: str,
    ) -> InterpreterOutput:
        if parsed.action.type == "cast_spell":
            return parsed
        related_rule_hooks = prompt_context["related_rule_hooks"]
        seen_feature_ids: set[str] = set()
        class_feature_ids: list[str] = []
        for hook in related_rule_hooks:
            if hook.domain != "class_feature":
                continue
            for source_id in hook.sourceEntityIds:
                if source_id.startswith("class.") and source_id not in seen_feature_ids:
                    class_feature_ids.append(source_id)
                    seen_feature_ids.add(source_id)
        matched_feature_ids = [
            feature_id
            for feature_id in class_feature_ids
            if InterpreterService._feature_id_matches_text(feature_id, raw_text)
        ]
        if matched_feature_ids:
            chosen_feature_id = matched_feature_ids[0]
        elif len(class_feature_ids) == 1:
            chosen_feature_id = class_feature_ids[0]
        else:
            return parsed
        if parsed.action.type == "use_class_feature" and parsed.action.featureId == chosen_feature_id:
            return parsed

        normalized_action = StructuredAction(
            **{
                **parsed.action.model_dump(),
                "type": "use_class_feature",
                "spellId": None,
                "featureId": chosen_feature_id,
                "attackKind": None,
            }
        )
        safety_notes = list(parsed.safetyNotes)
        if not safety_notes:
            safety_notes.append("class feature result and state changes are backend engine owned")
        return parsed.model_copy(update={"action": normalized_action, "safetyNotes": safety_notes})

    @staticmethod
    def _feature_id_matches_text(feature_id: str, raw_text: str) -> bool:
        feature_name = feature_id.rsplit(".", 1)[-1].replace("_", "")
        normalized_text = "".join(ch for ch in raw_text.casefold() if ch.isalnum())
        return feature_name.casefold() in normalized_text

    @staticmethod
    def _spell_mechanic_hints(play_reference: str) -> list[str]:
        hints: list[str] = []
        if "원거리 주문 공격" in play_reference:
            hints.append("ranged_spell_attack")
        elif "근접 주문 공격" in play_reference:
            hints.append("melee_spell_attack")
        elif "주문 공격" in play_reference:
            hints.append("spell_attack")
        if "내성 굴림" in play_reference:
            hints.append("saving_throw")
        if "피해" in play_reference:
            hints.append("damage")
        if "히트 포인트를 회복할 수 없다" in play_reference:
            hints.append("blocks_hit_point_recovery")
        return hints

    @staticmethod
    def _entity_payload(entity: SrdEntityMatch) -> dict[str, object]:
        return {
            "id": entity.id,
            "kind": entity.kind,
            "nameEn": entity.nameEn,
            "nameKo": entity.nameKo,
            "summaryKo": entity.summaryKo[:320],
            "source": entity.source.model_dump(),
        }

    @staticmethod
    def _spell_attack_kind(play_reference: str) -> str | None:
        if "원거리 주문 공격" in play_reference:
            return "원거리 주문 공격"
        if "근접 주문 공격" in play_reference:
            return "근접 주문 공격"
        if "주문 공격" in play_reference:
            return "주문 공격"
        return None
