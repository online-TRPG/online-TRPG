import json
from typing import get_args

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.harness import InterpreterHarnessRequest, InterpreterHarnessResponse
from app.schemas.interpreter import (
    InterpreterExtractionProviderOutput,
    InterpreterOutput,
    InterpreterProviderOutput,
    SceneTransitionCandidateContract,
    SceneTransitionContract,
    StructuredAction,
)
from app.srd.models import RuleFragment, Spell, SrdEntityMatch
from app.srd.retrieval import SrdRetriever
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    mutable_provider_output_schema,
)


class InterpreterService:
    PROMPT_VERSION = "interpreter.v1.md"
    EXTRACTION_PROMPT_VERSION = "interpreter.extract.v1.md"
    SPELL_ACTION_TYPES = {"MAP_CAST_SPELL", "USE_SPELL_CREATIVELY"}
    CLASS_FEATURE_ACTION_TYPES = {"MAP_USE_CLASS_FEATURE"}
    GENERAL_REQUEST_INTENTS = {None, "GENERAL_GM_REQUEST"}
    SPELL_CONTEXT_INTENTS = {"MAP_CAST_SPELL", "USE_SPELL_CREATIVELY"}
    RULE_CONTEXT_INTENTS = {"ASK_RULE", "TACTIC_QUERY"}
    TRANSITION_INTENTS = {"REQUEST_SCENE_TRANSITION"}
    ACTION_TYPES = frozenset(get_args(StructuredAction.model_fields["type"].annotation))

    def __init__(self, client: GoogleAiStudioClient, settings: Settings, srd_retriever: SrdRetriever | None = None):
        self._client = client
        self._settings = settings
        self._srd_retriever = srd_retriever or SrdRetriever()

    def run(self, request: InterpreterHarnessRequest) -> InterpreterHarnessResponse:
        self._validate_request_intent(request)
        prompt_version = (
            self.PROMPT_VERSION
            if request.requestIntent in self.GENERAL_REQUEST_INTENTS
            else self.EXTRACTION_PROMPT_VERSION
        )
        system_prompt = load_role_prompt(prompt_version)
        model = request.model or self._settings.model_for_role("interpreter")
        prompt_context = self._build_prompt_context(request)
        user_prompt = self._format_prompt(request, prompt_context)
        response_json_schema = self._response_json_schema(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=response_json_schema,
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_interpreter,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._parse_and_validate_output(
                result.parsed_json,
                request,
                prompt_context,
            ),
            validation_error_prefix="Interpreter schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            InterpreterHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="interpreter",
                    prompt_version=prompt_version,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @classmethod
    def _validate_request_intent(cls, request: InterpreterHarnessRequest) -> None:
        if (
            request.requestIntent not in cls.GENERAL_REQUEST_INTENTS
            and request.requestIntent not in cls.ACTION_TYPES
        ):
            raise AiClientError(
                message=f"Unsupported Interpreter requestIntent: {request.requestIntent}",
                failure_type="bad_request",
                retryable=False,
                status_code=422,
                attempts=0,
            )

    def _parse_and_validate_output(
        self,
        payload: dict,
        request: InterpreterHarnessRequest,
        prompt_context: dict[str, object],
    ) -> InterpreterOutput:
        is_known_intent = request.requestIntent in self.ACTION_TYPES
        provider_model = (
            InterpreterExtractionProviderOutput if is_known_intent else InterpreterProviderOutput
        )
        self._reject_uncontracted_provider_fields(payload, request)
        provider_output = provider_model.model_validate(payload)
        provider_payload = provider_output.model_dump(exclude={"action", "sceneTransition"})
        provider_action = provider_output.action.model_dump()
        if is_known_intent:
            action_type = request.requestIntent
            confidence = 0.0 if provider_output.needsClarification else 1.0
        else:
            action_type = provider_action.pop("type")
            reported_confidence = provider_action.pop("confidence")
            confidence = 0.0 if provider_output.needsClarification else reported_confidence
        parsed = InterpreterOutput(
            **provider_payload,
            action=StructuredAction(
                **provider_action,
                type=action_type,
                actorCharacterId=request.actorCharacterId,
                confidence=confidence,
            ),
            sceneTransition=self._enrich_scene_transition(provider_output.sceneTransition),
        )
        parsed = self._apply_authoritative_selections(parsed, request, prompt_context)
        parsed = self._normalize_class_feature_output(parsed, prompt_context, request.rawText)
        self._validate_output_contract(parsed, request, prompt_context)
        return parsed

    @classmethod
    def _reject_uncontracted_provider_fields(
        cls,
        payload: dict,
        request: InterpreterHarnessRequest,
    ) -> None:
        forbidden_top_level: set[str] = set()
        forbidden_action: set[str] = set()
        if not request.transitionCandidates:
            forbidden_top_level.add("sceneTransition")
        if request.targetId is not None:
            forbidden_action.add("targetId")
        if request.spellId is not None:
            forbidden_action.add("spellId")
            forbidden_top_level.add("mentionedSpellId")
        if request.itemId is not None:
            forbidden_top_level.add("mentionedItemId")

        unexpected_top_level = forbidden_top_level.intersection(payload)
        action_payload = payload.get("action")
        unexpected_action = (
            forbidden_action.intersection(action_payload)
            if isinstance(action_payload, dict)
            else set()
        )
        if unexpected_top_level or unexpected_action:
            fields = sorted(
                [
                    *unexpected_top_level,
                    *(f"action.{field}" for field in unexpected_action),
                ]
            )
            raise ValueError(
                "Interpreter provider returned fields excluded by the active contract: "
                + ", ".join(fields)
            )

    @classmethod
    def _apply_authoritative_selections(
        cls,
        parsed: InterpreterOutput,
        request: InterpreterHarnessRequest,
        prompt_context: dict[str, object],
    ) -> InterpreterOutput:
        action_updates: dict[str, object] = {}
        output_updates: dict[str, object] = {}
        if request.targetId is not None:
            action_updates["targetId"] = request.targetId
        if (
            request.spellId is not None
            and parsed.action.type in cls.SPELL_ACTION_TYPES
        ):
            action_updates["spellId"] = request.spellId
            output_updates["mentionedSpellId"] = request.spellId
        if request.itemId is not None:
            related_entity_matches = prompt_context["related_entity_matches"]
            if isinstance(related_entity_matches, list) and any(
                isinstance(entity, SrdEntityMatch)
                and entity.kind == "magic_item"
                and entity.id == request.itemId
                for entity in related_entity_matches
            ):
                output_updates["mentionedItemId"] = request.itemId

        if action_updates:
            output_updates["action"] = parsed.action.model_copy(update=action_updates)
        return parsed.model_copy(update=output_updates) if output_updates else parsed

    @staticmethod
    def _enrich_scene_transition(provider_transition) -> SceneTransitionContract | None:
        if provider_transition is None:
            return None
        return SceneTransitionContract(
            selectedTargetNodeId=None,
            candidates=[
                SceneTransitionCandidateContract(
                    **candidate.model_dump(),
                    confidence=1.0 if candidate.requirements else 0.0,
                    rationale=None,
                )
                for candidate in provider_transition.candidates
            ],
        )

    @staticmethod
    def _response_json_schema(request: InterpreterHarnessRequest) -> dict[str, object]:
        is_known_intent = request.requestIntent in InterpreterService.ACTION_TYPES
        provider_model = (
            InterpreterExtractionProviderOutput
            if is_known_intent
            else InterpreterProviderOutput
        )
        schema = mutable_provider_output_schema(provider_model)
        defs = schema.get("$defs")
        action_definition_name = (
            "InterpreterExtractionAction"
            if is_known_intent
            else "InterpreterProviderAction"
        )
        action_schema = (
            defs.get(action_definition_name)
            if isinstance(defs, dict)
            else None
        )
        if request.targetId is not None and isinstance(action_schema, dict):
            InterpreterService._drop_schema_property(action_schema, "targetId")
        if request.spellId is not None:
            if isinstance(action_schema, dict):
                InterpreterService._drop_schema_property(action_schema, "spellId")
            InterpreterService._drop_schema_property(schema, "mentionedSpellId")
        if request.itemId is not None:
            InterpreterService._drop_schema_property(schema, "mentionedItemId")

        if request.transitionCandidates:
            return schema

        InterpreterService._drop_schema_property(schema, "sceneTransition")
        if isinstance(defs, dict):
            for key in (
                "SceneTransitionContract",
                "SceneTransitionCandidateContract",
                "ProviderSceneTransitionContract",
                "ProviderSceneTransitionCandidateContract",
                "SceneTransitionRequirement",
            ):
                defs.pop(key, None)
        return schema

    @staticmethod
    def _drop_schema_property(schema: dict[str, object], field: str) -> None:
        properties = schema.get("properties")
        if isinstance(properties, dict):
            properties.pop(field, None)
        required = schema.get("required")
        if isinstance(required, list):
            schema["required"] = [item for item in required if item != field]

    def _build_prompt_context(self, request: InterpreterHarnessRequest) -> dict[str, object]:
        if (
            request.targetId
            and request.targetId != request.actorCharacterId
            and request.targetId not in request.availableTargets
        ):
            raise AiClientError(
                message=f"Unknown selected targetId: {request.targetId}",
                failure_type="bad_request",
                retryable=False,
                status_code=422,
                attempts=0,
            )
        is_general = request.requestIntent in self.GENERAL_REQUEST_INTENTS
        needs_spell_context = (
            is_general
            or request.spellId is not None
            or request.requestIntent in self.SPELL_CONTEXT_INTENTS
        )
        needs_rule_context = (
            is_general
            or needs_spell_context
            or request.requestIntent in self.RULE_CONTEXT_INTENTS
            or request.requestIntent in self.CLASS_FEATURE_ACTION_TYPES
        )
        needs_entity_context = needs_rule_context or request.itemId is not None
        needs_hook_context = (
            is_general
            or request.requestIntent in self.CLASS_FEATURE_ACTION_TYPES
        )

        matched_spells = (
            self._srd_retriever.find_spells(request.rawText, limit=3)
            if needs_spell_context
            else []
        )
        if request.spellId:
            selected_spell = self._srd_retriever.get_spell(request.spellId)
            if selected_spell is None:
                raise AiClientError(
                    message=f"Unknown selected spellId: {request.spellId}",
                    failure_type="bad_request",
                    retryable=False,
                    status_code=422,
                    attempts=0,
                )
            matched_spells = [
                selected_spell,
                *(spell for spell in matched_spells if spell.id != selected_spell.id),
            ][:3]
        related_entity_matches = (
            self._srd_retriever.related_entities_for_text(request.rawText, limit=8)
            if needs_entity_context
            else []
        )
        if request.itemId:
            selected_item = self._srd_retriever.get_magic_item(request.itemId)
            if request.itemId.startswith("magic_item.") and selected_item is None:
                raise AiClientError(
                    message=f"Unknown selected itemId: {request.itemId}",
                    failure_type="bad_request",
                    retryable=False,
                    status_code=422,
                    attempts=0,
                )
            if selected_item is not None:
                selected_item_match = SrdEntityMatch(
                    id=selected_item.id,
                    nameEn=selected_item.nameEn,
                    nameKo=selected_item.nameKo,
                    kind="magic_item",
                    summaryKo=selected_item.playReference,
                    source=selected_item.source,
                )
                related_entity_matches = [
                    selected_item_match,
                    *(
                        entity
                        for entity in related_entity_matches
                        if entity.id != selected_item.id
                    ),
                ][:8]
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
                }
            )
            added_entity_ids.add(spell.id)
        for entity in related_entity_matches:
            if entity.id in added_entity_ids:
                continue
            related_entities.append(self._entity_payload(entity))
            added_entity_ids.add(entity.id)
        related_rule_fragments = (
            self._srd_retriever.related_rule_fragments_for_text(
                request.rawText,
                spells=matched_spells,
                limit=6,
            )
            if needs_rule_context
            else []
        )
        related_rule_hooks = (
            self._srd_retriever.related_rule_hooks_for_text(
                request.rawText,
                entities=[
                    entity
                    for entity in related_entity_matches
                    if entity.kind in {"spell", "magic_item", "condition", "class", "race"}
                ],
                rule_fragments=related_rule_fragments,
                limit=4,
            )
            if needs_hook_context
            else []
        )
        related_rules = [
            {
                "id": rule.id,
                "domain": rule.domain,
                "titleKo": rule.titleKo,
                "engineOwned": rule.engineOwned,
                "summaryKo": rule.summaryKo,
                "aiForbiddenUse": rule.aiForbiddenUse,
            }
            for rule in related_rule_fragments
        ]
        related_engine_hooks = [
            {
                "titleKo": hook.titleKo,
                "sourceEntityIds": hook.sourceEntityIds,
            }
            for hook in related_rule_hooks
            if hook.domain == "class_feature"
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
        available_target_ids = set(request.availableTargets)
        targets = {
            detail.id: {
                key: value
                for key, value in {
                    "id": detail.id,
                    "name": detail.name,
                    "kind": detail.kind,
                    "summary": detail.summary,
                    "disposition": detail.disposition,
                }.items()
                if value is not None
            }
            for detail in request.availableTargetDetails
            if detail.id in available_target_ids
        }
        for target_id in request.availableTargets:
            targets.setdefault(target_id, {"id": target_id})
        if request.targetId in targets:
            targets[request.targetId]["selected"] = True

        related_entity_payloads = [
            entity
            for entity in prompt_context["related_entities_payload"]
            if isinstance(entity, dict)
        ]
        related_entity_ids = {
            entity_id
            for entity in related_entity_payloads
            if isinstance((entity_id := entity.get("id")), str)
        }
        selected_entity_ids = {
            selected_id
            for selected_id in (request.itemId, request.spellId)
            if selected_id is not None and selected_id in related_entity_ids
        }
        related_entities = [
            {
                **entity,
                **({"selected": True} if entity.get("id") in selected_entity_ids else {}),
            }
            for entity in related_entity_payloads
        ]
        selected = {
            key: value
            for key, value in {
                "selfTarget": (
                    True
                    if request.targetId == request.actorCharacterId
                    else None
                ),
                "mapPoint": request.mapPoint.model_dump() if request.mapPoint else None,
            }.items()
            if value is not None
        }
        payload = {
            "requestIntent": request.requestIntent,
            "rawText": request.rawText,
            "sceneSummary": request.sceneSummary,
            "recentLogs": request.recentLogs,
            "targets": list(targets.values()),
            "selected": selected,
            "relatedIntent": request.relatedIntent,
            "relatedEntities": related_entities,
            "relatedRules": prompt_context["related_rules_payload"],
            "classFeatureCandidates": prompt_context["related_engine_hooks_payload"],
        }
        if request.requestIntent in self.GENERAL_REQUEST_INTENTS:
            payload["screenType"] = request.screenType
        if request.transitionCandidates:
            payload["transitionCandidates"] = [
                candidate.model_dump(exclude_none=True)
                for candidate in request.transitionCandidates
            ]
        payload = {key: value for key, value in payload.items() if value not in (None, [], {}, "")}
        return "구조화 액션 후보를 반환하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    @staticmethod
    def _validate_output_contract(
        parsed: InterpreterOutput,
        request: InterpreterHarnessRequest,
        prompt_context: dict[str, object],
    ) -> None:
        if parsed.action.actorCharacterId != request.actorCharacterId:
            raise ValueError("action.actorCharacterId must match request.actorCharacterId")
        allowed_target_ids = set(request.availableTargets)
        if request.targetId == request.actorCharacterId:
            allowed_target_ids.add(request.actorCharacterId)
        if parsed.action.targetId is not None and parsed.action.targetId not in allowed_target_ids:
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
        allowed_rule_ids = {fragment.id for fragment in related_rule_fragments}
        related_rule_hooks = prompt_context["related_rule_hooks"]
        allowed_feature_ids = {
            source_id
            for hook in related_rule_hooks
            for source_id in hook.sourceEntityIds
            if source_id.startswith("class.")
        }

        if parsed.action.type in InterpreterService.SPELL_ACTION_TYPES:
            if parsed.action.spellId is None:
                raise ValueError("spell action requires action.spellId")
            if parsed.action.featureId is not None:
                raise ValueError("spell action cannot include action.featureId")
            if parsed.mentionedSpellId != parsed.action.spellId:
                raise ValueError("spell action requires mentionedSpellId to match action.spellId")
            if parsed.action.spellId not in allowed_spell_ids:
                raise ValueError("spell action.spellId must be one of retrieved spell IDs")
            if parsed.action.attackKind is None and any("spell_attack" in rule_id for rule_id in allowed_rule_ids):
                raise ValueError("spell attack actions require action.attackKind")
        elif parsed.action.type in InterpreterService.CLASS_FEATURE_ACTION_TYPES:
            if parsed.action.featureId is None:
                raise ValueError("class feature action requires action.featureId")
            if parsed.action.featureId not in allowed_feature_ids:
                raise ValueError("class feature action.featureId must be one of retrieved class feature IDs")
            if parsed.action.spellId is not None:
                raise ValueError("class feature action cannot include action.spellId")
        elif parsed.action.spellId is not None:
            raise ValueError("action.spellId is only allowed for spell action types")
        elif parsed.action.featureId is not None:
            raise ValueError("action.featureId is only allowed for class feature action types")

        if parsed.mentionedItemId is not None and parsed.mentionedItemId not in allowed_item_ids:
            raise ValueError("mentionedItemId must be one of retrieved magic item IDs")

        unexpected_rule_ids = set(parsed.requiredRuleCheckIds) - allowed_rule_ids
        if unexpected_rule_ids:
            raise ValueError(f"requiredRuleCheckIds include unavailable rule IDs: {sorted(unexpected_rule_ids)}")

        if parsed.sceneTransition is not None:
            allowed_transition_node_ids = {
                candidate.targetNodeId
                for candidate in request.transitionCandidates
            }
            allowed_transition_ids = {
                candidate.transitionId
                for candidate in request.transitionCandidates
                if candidate.transitionId is not None
            }
            if parsed.sceneTransition.selectedTargetNodeId is not None:
                if parsed.sceneTransition.selectedTargetNodeId not in allowed_transition_node_ids:
                    raise ValueError("sceneTransition.selectedTargetNodeId must be one of transitionCandidates")
            for candidate in parsed.sceneTransition.candidates:
                if candidate.targetNodeId not in allowed_transition_node_ids:
                    raise ValueError("sceneTransition candidate targetNodeId must be one of transitionCandidates")
                if candidate.transitionId is not None and candidate.transitionId not in allowed_transition_ids:
                    raise ValueError("sceneTransition candidate transitionId must be one of transitionCandidates")

    @staticmethod
    def _normalize_class_feature_output(
        parsed: InterpreterOutput,
        prompt_context: dict[str, object],
        raw_text: str,
    ) -> InterpreterOutput:
        if parsed.action.type in InterpreterService.SPELL_ACTION_TYPES:
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
        if parsed.action.type == "MAP_USE_CLASS_FEATURE" and parsed.action.featureId == chosen_feature_id:
            return parsed

        normalized_action = StructuredAction(
            **{
                **parsed.action.model_dump(),
                "type": "MAP_USE_CLASS_FEATURE",
                "spellId": None,
                "featureId": chosen_feature_id,
                "attackKind": None,
            }
        )
        return parsed.model_copy(update={"action": normalized_action})

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
