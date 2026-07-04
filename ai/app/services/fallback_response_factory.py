from app.core.errors import AiClientError
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
    SummarizerHarnessRequest,
    SummarizerHarnessResponse,
)
from app.services.interpreter_fallback import InterpreterFallbackService
from app.services.role_fallback_templates import RoleFallbackTemplates
from app.services.trace_service import AiTraceService


class RoleFallbackResponseFactory:
    def __init__(
        self,
        *,
        trace_service: AiTraceService,
        interpreter_fallback_service: InterpreterFallbackService | None = None,
        role_fallback_templates: RoleFallbackTemplates | None = None,
    ):
        self._trace_service = trace_service
        self._interpreter_fallback_service = (
            interpreter_fallback_service or InterpreterFallbackService()
        )
        self._role_fallback_templates = role_fallback_templates or RoleFallbackTemplates()

    def interpreter(
        self, request: InterpreterHarnessRequest, error: AiClientError
    ) -> InterpreterHarnessResponse:
        parsed = self._interpreter_fallback_service.build_output(request)
        return InterpreterHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="interpreter.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="interpreter", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def narrator(
        self, request: NarratorHarnessRequest, error: AiClientError
    ) -> NarratorHarnessResponse:
        parsed = self._role_fallback_templates.narrator(request)
        return NarratorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="narrator.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="narrator", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def director(
        self, request: DirectorHarnessRequest, error: AiClientError
    ) -> DirectorHarnessResponse:
        parsed = self._role_fallback_templates.director(request)
        return DirectorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="director.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="director", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def summarizer(
        self, request: SummarizerHarnessRequest, error: AiClientError
    ) -> SummarizerHarnessResponse:
        parsed = self._role_fallback_templates.summarizer(request)
        return SummarizerHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="summarizer.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="summarizer", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def actor(self, request: ActorHarnessRequest, error: AiClientError) -> ActorHarnessResponse:
        parsed = self._role_fallback_templates.actor(request)
        return ActorHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="actor.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="actor", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def npc_dialogue(
        self, request: NpcDialogueHarnessRequest, error: AiClientError
    ) -> NpcDialogueHarnessResponse:
        parsed = self._role_fallback_templates.npc_dialogue(request)
        return NpcDialogueHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="npc_dialogue.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="npc_dialogue", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )

    def check_result(
        self, request: CheckResultHarnessRequest, error: AiClientError
    ) -> CheckResultHarnessResponse:
        parsed = self._role_fallback_templates.check_result(request)
        return CheckResultHarnessResponse(
            provider="template-fallback",
            model="local-template",
            latencyMs=0,
            promptVersion="check_result.fallback.v1",
            rawOutput="",
            finishReason="FALLBACK",
            trace=self._trace_service.fallback_trace(role="check_result", error=error),
            parsed=parsed,
            fallback=True,
            fallbackReason=error.message,
        )
