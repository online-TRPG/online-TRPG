import json
from pathlib import Path

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.check_result import CheckResultOutput
from app.schemas.harness import CheckResultHarnessRequest, CheckResultHarnessResponse


class CheckResultService:
    PROMPT_VERSION = "check_result.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: CheckResultHarnessRequest) -> CheckResultHarnessResponse:
        prompt_path = Path(__file__).resolve().parents[2] / "prompts" / self.PROMPT_VERSION
        system_prompt = prompt_path.read_text(encoding="utf-8")
        model = request.model or self._settings.model_for_role("narrator")
        user_prompt = self._build_prompt(request)
        last_error: AiClientError | None = None
        attempts = self._settings.ai_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                result = self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=CheckResultOutput.model_json_schema(),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_narrator,
                )
                parsed = CheckResultOutput.model_validate(result.parsed_json)
                break
            except ValidationError as exc:
                last_error = AiClientError(
                    message=f"CheckResult schema validation failed: {exc}",
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

        return CheckResultHarnessResponse(
            provider=result.provider,
            model=result.model,
            latencyMs=result.latency_ms,
            promptVersion=self.PROMPT_VERSION,
            rawOutput=result.raw_text,
            finishReason=result.finish_reason,
            providerRequestId=result.provider_request_id,
            trace={
                "role": "check_result",
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

    @staticmethod
    def _build_prompt(request: CheckResultHarnessRequest) -> str:
        payload = request.model_dump()
        return "판정 결과에 맞는 한국어 TRPG 결과 지문을 생성하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        )
