from typing import Any

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import SmokeHarnessRequest
from app.schemas.provider import StrictProviderModel
from app.services.provider_execution import (
    build_role_response_metadata,
    execute_provider_request,
    provider_output_schema,
)


class SmokeProviderOutput(StrictProviderModel):
    ok: bool


class AiSmokeRunner:
    def __init__(
        self,
        *,
        settings,
        client: GoogleAiStudioClient,
        response_logger: HarnessResponseLogger,
    ):
        self._settings = settings
        self._client = client
        self._response_logger = response_logger

    def run(self, request: SmokeHarnessRequest) -> dict[str, Any]:
        settings = self._settings
        execution = execute_provider_request(
            settings=settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                model=request.model or settings.ai_model_default,
                prompt=request.prompt,
                response_json_schema=provider_output_schema(SmokeProviderOutput),
                system_instruction="Return JSON with ok=true to confirm structured output connectivity.",
                temperature=settings.ai_temperature_interpreter,
                timeout_ms=timeout_ms,
            ),
            parse_response=lambda result: SmokeProviderOutput.model_validate(result.parsed_json),
            validation_error_prefix="Smoke schema validation failed",
        )
        parsed = execution.parsed
        payload = {
            **build_role_response_metadata(
                execution=execution,
                role="smoke",
                prompt_version="smoke.v1.inline",
            ),
            "parsed": parsed.model_dump(),
        }
        log_payload = dict(payload)
        if settings.ai_log_payloads:
            log_payload["rawOutput"] = execution.result.raw_text
        self._response_logger.log_success(
            endpoint="smoke",
            request_payload=request.model_dump(),
            response_payload=log_payload,
        )
        return payload
