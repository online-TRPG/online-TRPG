from functools import lru_cache
import json

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import get_settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import (
    ActorHarnessRequest,
    ActorHarnessResponse,
    DirectorHarnessRequest,
    DirectorHarnessResponse,
    InterpreterHarnessRequest,
    InterpreterHarnessResponse,
    NarratorHarnessRequest,
    NarratorHarnessResponse,
    NpcDialogueHarnessRequest,
    NpcDialogueHarnessResponse,
    SmokeHarnessRequest,
    SummarizerHarnessRequest,
    SummarizerHarnessResponse,
    TraceListItem,
    TraceListResponse,
)
from app.schemas.interpreter import InterpreterOutput
from app.schemas.interpreter import StructuredAction
from app.schemas.narrator import NarratorOutput
from app.schemas.npc_dialogue import NpcDialogueOutput
from app.schemas.director import DirectorOutput
from app.schemas.summarizer import SummarizerOutput
from app.schemas.actor import ActorOutput
from app.services.actor.service import ActorService
from app.services.director.service import DirectorService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService
from app.services.npc_dialogue.service import NpcDialogueService
from app.services.summarizer.service import SummarizerService


class AiHarnessService:
    def __init__(
        self,
        settings,
        client: GoogleAiStudioClient,
        interpreter_service: InterpreterService,
        narrator_service: NarratorService,
        director_service: DirectorService,
        summarizer_service: SummarizerService,
        actor_service: ActorService,
        npc_dialogue_service: NpcDialogueService,
        response_logger: HarnessResponseLogger,
    ):
        self._settings = settings
        self._client = client
        self._interpreter_service = interpreter_service
        self._narrator_service = narrator_service
        self._director_service = director_service
        self._summarizer_service = summarizer_service
        self._actor_service = actor_service
        self._npc_dialogue_service = npc_dialogue_service
        self._response_logger = response_logger

    def run_smoke_test(self, request: SmokeHarnessRequest):
        settings = self._settings
        last_error: AiClientError | None = None
        attempts = settings.ai_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                response = self._client.generate_json(
                    model=request.model or settings.ai_model_default,
                    prompt=request.prompt,
                    response_json_schema=InterpreterOutput.model_json_schema(),
                    system_instruction=(
                        "Return a plausible TRPG interpreter response as JSON. "
                        "Use player-1 as actorCharacterId when not inferable."
                    ),
                    temperature=settings.ai_temperature_interpreter,
                )
                parsed = InterpreterOutput.model_validate(response.parsed_json)
                payload = {
                    "provider": response.provider,
                    "model": response.model,
                    "latencyMs": response.latency_ms,
                    "rawOutput": response.raw_text,
                    "finishReason": response.finish_reason,
                    "providerRequestId": response.provider_request_id,
                    "trace": {
                        "role": "smoke",
                        "provider": response.provider,
                        "model": response.model,
                        "promptVersion": "smoke.v1.inline",
                        "latencyMs": response.latency_ms,
                        "attempts": attempt,
                        "failureType": None,
                        "finishReason": response.finish_reason,
                        "providerRequestId": response.provider_request_id,
                    },
                    "parsed": parsed.model_dump(),
                }
                log_paths = self._response_logger.log_success(
                    endpoint="smoke",
                    request_payload=request.model_dump(),
                    response_payload=payload,
                )
                payload["logPaths"] = log_paths
                return payload
            except ValidationError as exc:
                last_error = AiClientError(
                    message=f"Smoke schema validation failed: {exc}",
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
        if last_error is not None:
            raise last_error

    def run_interpreter(
        self, request: InterpreterHarnessRequest
    ) -> InterpreterHarnessResponse:
        try:
            response = self._interpreter_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="interpreter",
                request_payload=request.model_dump(),
                response=self._fallback_interpreter(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="interpreter",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_narrator(self, request: NarratorHarnessRequest) -> NarratorHarnessResponse:
        try:
            response = self._narrator_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="narrator",
                request_payload=request.model_dump(),
                response=self._fallback_narrator(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="narrator",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_director(self, request: DirectorHarnessRequest) -> DirectorHarnessResponse:
        try:
            response = self._director_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="director",
                request_payload=request.model_dump(),
                response=self._fallback_director(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="director",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_summarizer(self, request: SummarizerHarnessRequest) -> SummarizerHarnessResponse:
        try:
            response = self._summarizer_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="summarizer",
                request_payload=request.model_dump(),
                response=self._fallback_summarizer(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="summarizer",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_actor(self, request: ActorHarnessRequest) -> ActorHarnessResponse:
        try:
            response = self._actor_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="actor",
                request_payload=request.model_dump(),
                response=self._fallback_actor(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="actor",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_npc_dialogue(self, request: NpcDialogueHarnessRequest) -> NpcDialogueHarnessResponse:
        try:
            response = self._npc_dialogue_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="npc-dialogue",
                request_payload=request.model_dump(),
                response=self._fallback_npc_dialogue(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="npc-dialogue",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def _should_fallback(self, error: AiClientError) -> bool:
        if error.status_code < 500:
            return False
        return error.failure_type in {
            "timeout",
            "rate_limit",
            "quota",
            "network",
            "invalid_response",
            "schema_validation",
            "upstream_error",
        }

    def _fallback_trace(self, *, role: str, error: AiClientError) -> dict[str, object]:
        return {
            "role": role,
            "provider": "template-fallback",
            "model": "local-template",
            "promptVersion": f"{role}.fallback.v1",
            "latencyMs": 0,
            "attempts": max(1, error.attempts),
            "failureType": error.failure_type,
            "finishReason": "FALLBACK",
            "providerRequestId": None,
        }

    def _log_and_return_fallback(self, *, endpoint: str, request_payload: dict, response, error: AiClientError):
        log_paths = self._response_logger.log_fallback(
            endpoint=endpoint,
            request_payload=request_payload,
            response_payload=response.model_dump(),
            error=error,
        )
        response.logPaths = log_paths
        return response

    def _fallback_interpreter(
        self, request: InterpreterHarnessRequest, error: AiClientError
    ) -> InterpreterHarnessResponse:
        parsed = self._template_interpreter_output(request)
        return InterpreterHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="interpreter.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="interpreter", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def _template_interpreter_output(self, request: InterpreterHarnessRequest) -> InterpreterOutput:
        raw_text = request.rawText.strip()
        haystack = raw_text.lower()
        target = self._select_fallback_target(request.availableTargets, haystack)

        spell_id: str | None = None
        if any(term in haystack for term in ["magic missile", "마법 화살", "매직 미사일"]):
            spell_id = "spell.magic_missile"
        elif any(term in haystack for term in ["cure wounds", "상처 치료", "치유"]):
            spell_id = "spell.cure_wounds"
        elif any(term in haystack for term in ["fire bolt", "파이어볼트", "화염 화살"]):
            spell_id = "spell.fire_bolt"
        elif any(term in haystack for term in ["chill touch", "싸늘한 손길"]):
            spell_id = "spell.chill_touch"

        if spell_id:
            return InterpreterOutput(
                action=StructuredAction(
                    type="cast_spell",
                    actorCharacterId=request.actorCharacterId,
                    targetId=target,
                    spellId=spell_id,
                    approach=raw_text,
                    confidence=0.55,
                    requiresRoll=spell_id not in {"spell.magic_missile", "spell.cure_wounds"},
                ),
                needsClarification=target is None,
                clarificationQuestion=None if target else "주문 대상을 알려 주세요.",
                mentionedSpellId=spell_id,
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        if any(term in haystack for term in ["potion", "물약"]):
            return InterpreterOutput(
                action=StructuredAction(
                    type="use_item",
                    actorCharacterId=request.actorCharacterId,
                    targetId=target or request.actorCharacterId,
                    approach=raw_text,
                    confidence=0.5,
                    requiresRoll=True,
                ),
                needsClarification=False,
                mentionedItemId="magic_item.potion_of_healing",
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        if any(term in haystack for term in ["second wind", "재기의 숨결", "재기"]):
            return InterpreterOutput(
                action=StructuredAction(
                    type="use_class_feature",
                    actorCharacterId=request.actorCharacterId,
                    targetId=request.actorCharacterId,
                    featureId="class.fighter.feature.second_wind",
                    approach=raw_text,
                    confidence=0.5,
                    requiresRoll=True,
                ),
                needsClarification=False,
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        if any(term in haystack for term in ["attack", "공격", "때린", "쏜다", "베어"]):
            return InterpreterOutput(
                action=StructuredAction(
                    type="attack",
                    actorCharacterId=request.actorCharacterId,
                    targetId=target,
                    attackKind="weapon_attack",
                    approach=raw_text,
                    confidence=0.5,
                    requiresRoll=True,
                ),
                needsClarification=target is None,
                clarificationQuestion=None if target else "공격 대상을 알려 주세요.",
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        if any(term in haystack for term in ["investigate", "check", "조사", "살핀", "수색", "발자국"]):
            return InterpreterOutput(
                action=StructuredAction(
                    type="skill_check",
                    actorCharacterId=request.actorCharacterId,
                    targetId=target,
                    ability="intelligence",
                    skill="investigation",
                    approach=raw_text,
                    confidence=0.5,
                    requiresRoll=True,
                    suggestedDifficulty="easy",
                ),
                needsClarification=False,
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        if any(term in haystack for term in ["이동", "들어간", "안쪽", "살펴", "마무리"]):
            return InterpreterOutput(
                action=StructuredAction(
                    type="interact",
                    actorCharacterId=request.actorCharacterId,
                    targetId=target,
                    approach=raw_text,
                    confidence=0.45,
                    requiresRoll=False,
                ),
                needsClarification=False,
                safetyNotes=["provider 실패로 MVP 템플릿 해석을 사용함"],
            )

        return InterpreterOutput(
            action=StructuredAction(
                type="freeform",
                actorCharacterId=request.actorCharacterId,
                approach=raw_text,
                confidence=0.0,
                requiresRoll=False,
            ),
            needsClarification=True,
            clarificationQuestion="행동을 조금 더 구체적으로 선택해 주세요.",
            safetyNotes=["AI 해석 실패로 템플릿 fallback을 사용함", "게임 상태는 변경하지 않음"],
        )

    @staticmethod
    def _select_fallback_target(available_targets: list[str], haystack: str) -> str | None:
        for target in available_targets:
            normalized = target.lower()
            if normalized and normalized in haystack:
                return target
        for target in available_targets:
            normalized = target.lower()
            if any(term in haystack for term in ["고블린", "goblin"]) and "goblin" in normalized:
                return target
            if any(term in haystack for term in ["파이터", "fighter"]) and "fighter" in normalized:
                return target
            if any(term in haystack for term in ["로그", "rogue"]) and "rogue" in normalized:
                return target
            if any(term in haystack for term in ["문", "door"]) and "door" in normalized:
                return target
        return available_targets[0] if len(available_targets) == 1 else None

    def _fallback_narrator(self, request: NarratorHarnessRequest, error: AiClientError) -> NarratorHarnessResponse:
        summary = (
            request.stateDiffSummary.summary
            if request.stateDiffSummary
            else request.actionSummary or "결과가 확정되었습니다."
        )
        narration = f"{summary} 자세한 묘사는 잠시 생략하고, 확정된 결과만 반영합니다."
        parsed = NarratorOutput(narration=narration, visibleSummary=summary[:120])
        return NarratorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="narrator.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="narrator", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def _fallback_director(self, request: DirectorHarnessRequest, error: AiClientError) -> DirectorHarnessResponse:
        suggestion = request.publicClues[0] if request.publicClues else "이미 드러난 단서를 한 번 더 살펴보세요."
        parsed = DirectorOutput(
            hintLevel=request.hintLevel,
            content="AI 힌트를 만들지 못했습니다. 공개된 단서 안에서 다음 시도 후보만 제안합니다.",
            sourceScope="scene",
            spoilerLevel="low",
            suggestions=[suggestion],
            safetyNotes=["새 사실을 추가하지 않는 fallback 힌트"],
        )
        return DirectorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="director.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="director", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def _fallback_summarizer(
        self, request: SummarizerHarnessRequest, error: AiClientError
    ) -> SummarizerHarnessResponse:
        selected_logs = request.logs[-(request.lastLogCount or min(3, len(request.logs))) :]
        content = " / ".join(selected_logs)[:1000]
        parsed = SummarizerOutput(
            summaryType=request.summaryType,
            coveredTurnRange=request.rangeType,
            content=content,
            keyFacts=selected_logs[:5],
            safetyNotes=["원문 로그를 압축한 fallback 요약"],
        )
        return SummarizerHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="summarizer.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="summarizer", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def _fallback_actor(self, request: ActorHarnessRequest, error: AiClientError) -> ActorHarnessResponse:
        selected = request.allowedActions[0]
        parsed = ActorOutput(
            selectedActionId=selected.id,
            reason="AI 판단 실패로 허용된 첫 행동 후보를 안전 fallback으로 선택합니다.",
            safetyNotes=["허용된 action ID만 선택함", "상태 변경은 백엔드가 확정해야 함"],
        )
        return ActorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="actor.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="actor", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def _fallback_npc_dialogue(
        self, request: NpcDialogueHarnessRequest, error: AiClientError
    ) -> NpcDialogueHarnessResponse:
        npc_name = request.npcName or request.npcEntityId
        parsed = NpcDialogueOutput(
            dialogue=f"{npc_name}: 지금은 말보다 행동으로 답하겠다.",
            tone=request.disposition,
            safetyNotes=["NPC 대사 fallback이며 행동 선택이나 상태 변경은 포함하지 않음"],
        )
        return NpcDialogueHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="npc_dialogue.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="npc_dialogue", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def log_failure(self, endpoint: str, request_payload: dict, error: AiClientError) -> dict[str, str]:
        return self._response_logger.log_failure(
            endpoint=endpoint,
            request_payload=request_payload,
            error=error,
        )

    def list_traces(
        self,
        *,
        role: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        size: int = 20,
    ) -> TraceListResponse:
        history_path = self._settings.ai_log_path / "harness_history.jsonl"
        if not history_path.exists():
            return TraceListResponse(items=[], total=0, filtered=0)

        rows = [
            json.loads(line)
            for line in history_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        filtered_rows = []
        for row in rows:
            trace = row.get("aiTrace") or (row.get("response") or {}).get("trace") or {}
            row_role = trace.get("role") or row.get("endpoint")
            if session_id and trace.get("sessionId") != session_id:
                continue
            if role and row_role != role:
                continue
            if status and row.get("status") != status:
                continue
            filtered_rows.append(row)

        selected = filtered_rows[-size:]
        items = []
        for row in reversed(selected):
            trace = row.get("aiTrace") or (row.get("response") or {}).get("trace") or {}
            error = row.get("error") or {}
            items.append(
                TraceListItem(
                    id=trace.get("id"),
                    timestamp=str(trace.get("createdAt") or row.get("timestamp") or ""),
                    endpoint=str(trace.get("endpoint") or row.get("endpoint") or ""),
                    status=str(trace.get("status") or row.get("status") or ""),
                    sessionId=trace.get("sessionId"),
                    turnId=trace.get("turnId"),
                    actorCharacterId=trace.get("actorCharacterId"),
                    role=trace.get("role") or row.get("endpoint"),
                    provider=trace.get("provider"),
                    model=trace.get("model"),
                    promptVersion=trace.get("promptVersion"),
                    latencyMs=trace.get("latencyMs"),
                    attempts=trace.get("attempts"),
                    failureType=trace.get("failureType") or error.get("failure_type"),
                    finishReason=trace.get("finishReason"),
                    providerRequestId=trace.get("providerRequestId"),
                    logPaths=trace.get("logPaths") or row.get("logPaths"),
                )
            )
        return TraceListResponse(items=items, total=len(rows), filtered=len(filtered_rows))


@lru_cache
def get_ai_harness_service() -> AiHarnessService:
    settings = get_settings()
    client = GoogleAiStudioClient(settings)
    interpreter_service = InterpreterService(client=client, settings=settings)
    narrator_service = NarratorService(client=client, settings=settings)
    director_service = DirectorService(client=client, settings=settings)
    summarizer_service = SummarizerService(client=client, settings=settings)
    actor_service = ActorService(client=client, settings=settings)
    npc_dialogue_service = NpcDialogueService(client=client, settings=settings)
    response_logger = HarnessResponseLogger(settings)
    return AiHarnessService(
        settings=settings,
        client=client,
        interpreter_service=interpreter_service,
        narrator_service=narrator_service,
        director_service=director_service,
        summarizer_service=summarizer_service,
        actor_service=actor_service,
        npc_dialogue_service=npc_dialogue_service,
        response_logger=response_logger,
    )
