from functools import lru_cache

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import get_settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import (
    InterpreterHarnessRequest,
    InterpreterHarnessResponse,
    NarratorHarnessRequest,
    NarratorHarnessResponse,
    SmokeHarnessRequest,
)
from app.schemas.interpreter import InterpreterOutput
from app.services.interpreter.service import InterpreterService
from app.services.narrator.service import NarratorService


class AiHarnessService:
    def __init__(
        self,
        settings,
        client: GoogleAiStudioClient,
        interpreter_service: InterpreterService,
        narrator_service: NarratorService,
        response_logger: HarnessResponseLogger,
    ):
        self._settings = settings
        self._client = client
        self._interpreter_service = interpreter_service
        self._narrator_service = narrator_service
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
        response = self._interpreter_service.run(request)
        log_paths = self._response_logger.log_success(
            endpoint="interpreter",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def run_narrator(self, request: NarratorHarnessRequest) -> NarratorHarnessResponse:
        response = self._narrator_service.run(request)
        log_paths = self._response_logger.log_success(
            endpoint="narrator",
            request_payload=request.model_dump(),
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response

    def log_failure(self, endpoint: str, request_payload: dict, error: AiClientError) -> dict[str, str]:
        return self._response_logger.log_failure(
            endpoint=endpoint,
            request_payload=request_payload,
            error=error,
        )


@lru_cache
def get_ai_harness_service() -> AiHarnessService:
    settings = get_settings()
    client = GoogleAiStudioClient(settings)
    interpreter_service = InterpreterService(client=client, settings=settings)
    narrator_service = NarratorService(client=client, settings=settings)
    response_logger = HarnessResponseLogger(settings)
    return AiHarnessService(
        settings=settings,
        client=client,
        interpreter_service=interpreter_service,
        narrator_service=narrator_service,
        response_logger=response_logger,
    )
