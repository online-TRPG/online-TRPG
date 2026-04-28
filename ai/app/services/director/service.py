import json
from pathlib import Path

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.director import DirectorOutput
from app.schemas.harness import DirectorHarnessRequest, DirectorHarnessResponse


class DirectorService:
    PROMPT_VERSION = "director.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: DirectorHarnessRequest) -> DirectorHarnessResponse:
        prompt_path = Path(__file__).resolve().parents[2] / "prompts" / self.PROMPT_VERSION
        system_prompt = prompt_path.read_text(encoding="utf-8")
        model = request.model or self._settings.model_for_role("director")
        user_prompt = self._build_prompt(request)
        last_error: AiClientError | None = None
        attempts = self._settings.ai_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                result = self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=DirectorOutput.model_json_schema(),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_director,
                )
                parsed = DirectorOutput.model_validate(result.parsed_json)
                break
            except ValidationError as exc:
                last_error = AiClientError(
                    message=f"Director schema validation failed: {exc}",
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

        return DirectorHarnessResponse(
            provider=result.provider,
            model=result.model,
            latencyMs=result.latency_ms,
            promptVersion=self.PROMPT_VERSION,
            rawOutput=result.raw_text,
            finishReason=result.finish_reason,
            providerRequestId=result.provider_request_id,
            trace={
                "role": "director",
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
    def _build_prompt(request: DirectorHarnessRequest) -> str:
        payload = {
            "hintLevel": request.hintLevel,
            "question": request.question,
            "sceneSummary": request.sceneSummary,
            "recentLogs": request.recentLogs,
            "publicClues": request.publicClues,
            "triedApproaches": request.triedApproaches,
            "constraints": {
                "noHiddenFacts": True,
                "noStateChanges": True,
                "language": "ko",
            },
        }
        return "공개 정보 안에서 진행 힌트를 작성하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        )
