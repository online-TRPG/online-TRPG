from functools import lru_cache

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
    TraceListResponse,
)
from app.services.actor.service import ActorService
from app.services.check_result.service import CheckResultService
from app.services.director.service import DirectorService
from app.services.fallback_policy import AiFallbackPolicy
from app.services.fallback_response_factory import RoleFallbackResponseFactory
from app.services.interpreter_fallback import InterpreterFallbackService
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService
from app.services.npc_dialogue.service import NpcDialogueService
from app.services.role_fallback_templates import RoleFallbackTemplates
from app.services.role_runner import AiRoleRunner
from app.services.smoke_runner import AiSmokeRunner
from app.services.summarizer.service import SummarizerService
from app.services.trace_service import AiTraceService


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
        fallback_policy: AiFallbackPolicy | None = None,
        interpreter_fallback_service: InterpreterFallbackService | None = None,
        role_fallback_templates: RoleFallbackTemplates | None = None,
        trace_service: AiTraceService | None = None,
        role_runner: AiRoleRunner | None = None,
        smoke_runner: AiSmokeRunner | None = None,
        fallback_response_factory: RoleFallbackResponseFactory | None = None,
    ):
        self._interpreter_service = interpreter_service
        self._narrator_service = narrator_service
        self._director_service = director_service
        self._summarizer_service = summarizer_service
        self._actor_service = actor_service
        self._npc_dialogue_service = npc_dialogue_service
        self._check_result_service = check_result_service
        self._fallback_policy = fallback_policy or AiFallbackPolicy()
        self._trace_service = trace_service or AiTraceService(settings, response_logger)
        self._role_runner = role_runner or AiRoleRunner(
            response_logger=response_logger,
            fallback_policy=self._fallback_policy,
            trace_service=self._trace_service,
        )
        self._smoke_runner = smoke_runner or AiSmokeRunner(
            settings=settings,
            client=client,
            response_logger=response_logger,
        )
        self._fallback_response_factory = (
            fallback_response_factory
            or RoleFallbackResponseFactory(
                trace_service=self._trace_service,
                interpreter_fallback_service=interpreter_fallback_service,
                role_fallback_templates=role_fallback_templates,
            )
        )

    def run_smoke_test(self, request: SmokeHarnessRequest):
        return self._smoke_runner.run(request)

    def run_interpreter(
        self, request: InterpreterHarnessRequest
    ) -> InterpreterHarnessResponse:
        return self._role_runner.run(
            endpoint="interpreter",
            request=request,
            run_service=self._interpreter_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.interpreter(
                request, exc
            ),
        )

    def run_narrator(self, request: NarratorHarnessRequest) -> NarratorHarnessResponse:
        return self._role_runner.run(
            endpoint="narrator",
            request=request,
            run_service=self._narrator_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.narrator(
                request, exc
            ),
        )

    def run_director(self, request: DirectorHarnessRequest) -> DirectorHarnessResponse:
        return self._role_runner.run(
            endpoint="director",
            request=request,
            run_service=self._director_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.director(
                request, exc
            ),
        )

    def run_summarizer(self, request: SummarizerHarnessRequest) -> SummarizerHarnessResponse:
        return self._role_runner.run(
            endpoint="summarizer",
            request=request,
            run_service=self._summarizer_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.summarizer(
                request, exc
            ),
        )

    def run_actor(self, request: ActorHarnessRequest) -> ActorHarnessResponse:
        return self._role_runner.run(
            endpoint="actor",
            request=request,
            run_service=self._actor_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.actor(
                request, exc
            ),
        )

    def run_npc_dialogue(self, request: NpcDialogueHarnessRequest) -> NpcDialogueHarnessResponse:
        return self._role_runner.run(
            endpoint="npc-dialogue",
            request=request,
            run_service=self._npc_dialogue_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.npc_dialogue(
                request, exc
            ),
        )

    def run_check_result(self, request: CheckResultHarnessRequest) -> CheckResultHarnessResponse:
        return self._role_runner.run(
            endpoint="check-result",
            request=request,
            run_service=self._check_result_service.run,
            build_fallback_response=lambda exc: self._fallback_response_factory.check_result(
                request, exc
            ),
        )

    def log_failure(self, endpoint: str, request_payload: dict, error: AiClientError) -> dict[str, str]:
        return self._trace_service.log_failure(endpoint, request_payload, error)

    def list_traces(
        self,
        *,
        role: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        size: int = 20,
    ) -> TraceListResponse:
        return self._trace_service.list_traces(
            role=role,
            status=status,
            session_id=session_id,
            size=size,
        )


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
