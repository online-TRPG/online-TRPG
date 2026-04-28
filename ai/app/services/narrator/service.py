import json
from pathlib import Path

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.harness import NarratorHarnessRequest, NarratorHarnessResponse
from app.schemas.narrator import NarratorOutput


class NarratorService:
    PROMPT_VERSION = "narrator.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: NarratorHarnessRequest) -> NarratorHarnessResponse:
        self._validate_request_constraints(request)
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
                    response_json_schema=NarratorOutput.model_json_schema(),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_narrator,
                )
                parsed = NarratorOutput.model_validate(result.parsed_json)
                break
            except ValidationError as exc:
                last_error = AiClientError(
                    message=f"Narrator schema validation failed: {exc}",
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

        return NarratorHarnessResponse(
            provider=result.provider,
            model=result.model,
            latencyMs=result.latency_ms,
            promptVersion=self.PROMPT_VERSION,
            rawOutput=result.raw_text,
            finishReason=result.finish_reason,
            providerRequestId=result.provider_request_id,
            trace={
                "role": "narrator",
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
    def _validate_request_constraints(request: NarratorHarnessRequest) -> None:
        if request.constraints.noNewFacts is not True:
            raise AiClientError(
                message="Narrator requires constraints.noNewFacts=true",
                failure_type="schema_validation",
                retryable=False,
                status_code=400,
                attempts=1,
            )

    @staticmethod
    def _build_prompt(request: NarratorHarnessRequest) -> str:
        payload = {
            "rawInput": request.rawInput,
            "action": request.action.model_dump() if request.action else None,
            "checkRequest": request.checkRequest.model_dump() if request.checkRequest else None,
            "diceResult": request.diceResult.model_dump() if request.diceResult else None,
            "stateDiffSummary": request.stateDiffSummary.model_dump() if request.stateDiffSummary else None,
            "scene": request.scene.model_dump(),
            "constraints": request.constraints.model_dump(),
            "legacy": {
                "actionSummary": request.actionSummary,
                "diceSummary": request.diceSummary,
                "sceneTone": request.sceneTone,
            },
        }
        lines = [
            "다음 확정 결과를 한국어 GM 서술로 요약하라.",
            "JSON 입력:",
            json.dumps(payload, ensure_ascii=False, indent=2),
        ]
        if request.diceSummary:
            lines.append("legacy diceSummary는 diceResult가 없을 때만 참고한다.")
        return "\n".join(lines)
