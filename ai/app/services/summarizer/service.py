import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.harness import SummarizerHarnessRequest, SummarizerHarnessResponse
from app.schemas.summarizer import SummarizerOutput, SummarizerProviderOutput
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    provider_output_schema,
)


class SummarizerService:
    PROMPT_VERSION = "summarizer.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: SummarizerHarnessRequest) -> SummarizerHarnessResponse:
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("summarizer")
        user_prompt = self._build_prompt(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=provider_output_schema(SummarizerProviderOutput),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_summarizer,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._normalize_output(result.parsed_json, request),
            validation_error_prefix="Summarizer schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            SummarizerHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="summarizer",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _normalize_output(payload: dict, _request: SummarizerHarnessRequest) -> SummarizerOutput:
        provider_output = SummarizerProviderOutput.model_validate(payload)
        return SummarizerOutput(content=provider_output.content)

    @staticmethod
    def _build_prompt(request: SummarizerHarnessRequest) -> str:
        selected_logs = (
            request.logs[-request.lastLogCount :]
            if request.lastLogCount is not None
            else request.logs
        )
        payload = {
            "summaryType": request.summaryType,
            "logs": selected_logs,
        }
        return "확정된 로그만 사실 요약으로 압축하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
