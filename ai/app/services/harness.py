from functools import lru_cache
import json
import re

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import get_settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import (
    ActorHarnessRequest,
    ActorHarnessResponse,
    CheckResultHarnessRequest,
    CheckResultHarnessResponse,
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
from app.schemas.check_result import CheckResultOutput
from app.services.actor.service import ActorService
from app.services.check_result.service import CheckResultService
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
        check_result_service: CheckResultService,
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
        self._check_result_service = check_result_service
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

    def run_check_result(self, request: CheckResultHarnessRequest) -> CheckResultHarnessResponse:
        try:
            response = self._check_result_service.run(request)
        except AiClientError as exc:
            if not self._should_fallback(exc):
                raise
            return self._log_and_return_fallback(
                endpoint="check-result",
                request_payload=request.model_dump(),
                response=self._fallback_check_result(request, exc),
                error=exc,
            )
        log_paths = self._response_logger.log_success(
            endpoint="check-result",
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
        parsed = self._build_interpreter_fallback_output(request)
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

    def _build_interpreter_fallback_output(self, request: InterpreterHarnessRequest) -> InterpreterOutput:
        fallback_action = self._infer_general_gm_fallback_action(request)
        if fallback_action is not None:
            action_type, target_id = fallback_action
            return InterpreterOutput(
                action=StructuredAction(
                    type=action_type,
                    actorCharacterId=request.actorCharacterId,
                    targetId=target_id,
                    approach=self._fallback_approach(request.rawText),
                    confidence=0.62,
                    requiresRoll=False,
                ),
                needsClarification=False,
                clarificationQuestion=None,
                safetyNotes=["AI 해석 실패로 로컬 fallback 분류를 사용함", "게임 상태는 변경하지 않음"],
            )

        return InterpreterOutput(
            action=StructuredAction(
                type="OUT_OF_SCOPE",
                actorCharacterId=request.actorCharacterId,
                approach=self._fallback_approach(request.rawText),
                confidence=0.0,
                requiresRoll=False,
            ),
            needsClarification=True,
            clarificationQuestion="행동을 조금 더 구체적으로 선택해 주세요.",
            safetyNotes=["AI 해석 실패로 템플릿 fallback을 사용함", "게임 상태는 변경하지 않음"],
        )

    def _infer_general_gm_fallback_action(
        self, request: InterpreterHarnessRequest
    ) -> tuple[str, str | None] | None:
        if (request.requestIntent or "").strip().upper() != "GENERAL_GM_REQUEST":
            return None

        text = request.rawText.strip()
        normalized_text = self._normalize_fallback_text(text)
        if not normalized_text:
            return None

        npc_target_id = self._resolve_fallback_target_id(request, required_kind="NPC")
        # AI 호출 실패 시에도 명확한 자유 입력은 기존 main-command 라우팅으로 살려 보낸다.
        # 결과 확정은 백엔드 handler가 계속 담당하므로, 여기서는 좁은 범위의 intent만 분류한다.
        if (npc_target_id and self._looks_like_npc_dialogue(normalized_text)) or self._looks_like_clear_dialogue_action(
            normalized_text
        ):
            return ("TALK_TO_NPC", npc_target_id)

        if self._contains_any(
            normalized_text,
            [
                "힌트",
                "도움",
                "막혔",
                "뭐하면",
                "무엇을하면",
                "뭘해야",
                "어떻게해야",
                "다음에뭘",
                "다음행동",
            ],
        ):
            return ("ASK_HINT", None)

        if self._contains_any(
            normalized_text,
            [
                "요약",
                "정리",
                "지금까지",
                "이전내용",
                "지난내용",
                "로그",
            ],
        ):
            return ("ASK_SUMMARY", None)

        if self._looks_like_scene_info_question(normalized_text):
            return ("ASK_SCENE_INFO", None)

        return None

    def _resolve_fallback_target_id(
        self, request: InterpreterHarnessRequest, *, required_kind: str | None = None
    ) -> str | None:
        available_target_ids = set(request.availableTargets)
        if request.targetId and request.targetId in available_target_ids:
            return request.targetId

        normalized_text = self._normalize_fallback_text(request.rawText)
        for detail in request.availableTargetDetails:
            if detail.id not in available_target_ids:
                continue
            if required_kind and (detail.kind or "").strip().upper() != required_kind:
                continue
            if any(name and name in normalized_text for name in self._fallback_target_name_candidates(detail.name)):
                return detail.id
        return None

    @staticmethod
    def _fallback_approach(raw_text: str) -> str:
        approach = raw_text.strip()
        return approach[:300] if approach else "자유 입력 요청"

    @staticmethod
    def _normalize_fallback_text(value: str) -> str:
        return re.sub(r"[^0-9a-zA-Z가-힣]+", "", value.casefold())

    @classmethod
    def _fallback_target_name_candidates(cls, name: str) -> list[str]:
        normalized_name = cls._normalize_fallback_text(name)
        parts = [
            cls._normalize_fallback_text(part)
            for part in re.split(r"[\s()/,]+", name)
            if part.strip()
        ]
        return [candidate for candidate in [normalized_name, *parts] if len(candidate) >= 2]

    @staticmethod
    def _contains_any(text: str, needles: list[str]) -> bool:
        return any(needle in text for needle in needles)

    def _looks_like_npc_dialogue(self, text: str) -> bool:
        return self._contains_any(
            text,
            [
                "말을건",
                "말을겁",
                "말건",
                "말을걸",
                "말걸",
                "대화",
                "인사",
                "안녕",
                "묻",
                "물어",
                "질문",
                "얘기",
                "이야기",
            ],
        )

    def _looks_like_clear_dialogue_action(self, text: str) -> bool:
        return self._looks_like_npc_dialogue(text) and self._contains_any(
            text,
            [
                "에게",
                "한테",
                "에게서",
                "한테서",
                "와대화",
                "과대화",
                "와말",
                "과말",
                "와얘기",
                "과얘기",
                "와이야기",
                "과이야기",
                "에게말",
                "한테말",
            ],
        )

    def _looks_like_scene_info_question(self, text: str) -> bool:
        return self._contains_any(
            text,
            [
                "뭐가보",
                "무엇이보",
                "장면정보",
                "현재장면",
                "상황알려",
                "상황이뭐",
                "여기어디",
                "어디야",
                "주변에뭐",
                "보이는것",
            ],
        )

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

    def _fallback_check_result(
        self, request: CheckResultHarnessRequest, error: AiClientError
    ) -> CheckResultHarnessResponse:
        target = request.targetName or "대상"
        if request.outcome == "SUCCESS":
            reward = request.targetSummary or request.targetDisposition or (
                request.publicClues[0] if request.publicClues else request.actionSummary
            )
            narration = f"판정에 성공했습니다. {target}에게서 의미 있는 정보를 얻습니다. {reward}"
        else:
            reward = "정보 보상 없음"
            narration = f"판정에 실패했습니다. {target}의 반응은 확실한 정보로 이어지지 않습니다."
        parsed = CheckResultOutput(
            narration=narration,
            rewardInfo=reward,
            safetyNotes=["AI 판정 결과 생성 실패로 템플릿 fallback을 사용함"],
        )
        return CheckResultHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="check_result.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._fallback_trace(role="check_result", error=error),
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
    check_result_service = CheckResultService(client=client, settings=settings)
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
        check_result_service=check_result_service,
        response_logger=response_logger,
    )
