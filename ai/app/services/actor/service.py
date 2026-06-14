import json
from pathlib import Path

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.actor import ActorDecision, ActorOutput
from app.schemas.harness import ActorHarnessRequest, ActorHarnessResponse


class ActorService:
    PROMPT_VERSION = "actor.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: ActorHarnessRequest) -> ActorHarnessResponse:
        prompt_path = Path(__file__).resolve().parents[2] / "prompts" / self.PROMPT_VERSION
        system_prompt = prompt_path.read_text(encoding="utf-8")
        model = request.model or self._settings.model_for_role("actor")
        user_prompt = self._build_prompt(request)
        allowed_action_ids = {action.id for action in request.allowedActions}
        last_error: AiClientError | None = None
        attempts = self._settings.ai_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                result = self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=ActorOutput.model_json_schema(),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_actor,
                )
                parsed = ActorOutput.model_validate(result.parsed_json)
                ActorDecision(output=parsed, allowedActionIds=allowed_action_ids)
                break
            except ValidationError as exc:
                last_error = AiClientError(
                    message=f"Actor schema validation failed: {exc}",
                    failure_type="schema_validation",
                    retryable=attempt < attempts,
                    status_code=502,
                    attempts=attempt,
                )
            except ValueError as exc:
                last_error = AiClientError(
                    message=f"Actor rule validation failed: {exc}",
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

        return ActorHarnessResponse(
            provider=result.provider,
            model=result.model,
            latencyMs=result.latency_ms,
            promptVersion=self.PROMPT_VERSION,
            rawOutput=result.raw_text,
            finishReason=result.finish_reason,
            providerRequestId=result.provider_request_id,
            trace={
                "role": "actor",
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
    def _build_prompt(request: ActorHarnessRequest) -> str:
        payload = {
            "npcEntityId": request.npcEntityId,
            "npcSummary": request.npcSummary,
            "disposition": request.disposition,
            "hpStatus": request.hpStatus,
            "conditions": request.conditions,
            "sceneSummary": request.sceneSummary,
            "allowedActions": [action.model_dump() for action in request.allowedActions],
            "constraints": {
                "copyOnlyAllowedActionId": True,
                "noStateChanges": True,
                "language": "ko",
            },
        }
        return "NPC가 사용할 행동 후보 하나를 선택하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        )
