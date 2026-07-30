import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.actor import ActorDecision, ActorOutput, ActorProviderOutput
from app.schemas.harness import ActorHarnessRequest, ActorHarnessResponse
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    provider_output_schema,
)


class ActorService:
    PROMPT_VERSION = "actor.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: ActorHarnessRequest) -> ActorHarnessResponse:
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("actor")
        user_prompt = self._build_prompt(request)
        allowed_action_ids = {action.id for action in request.allowedActions}
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=provider_output_schema(ActorProviderOutput),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_actor,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._validate_output(
                result.parsed_json,
                allowed_action_ids,
            ),
            validation_error_prefix="Actor output validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            ActorHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="actor",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _validate_output(payload: dict, allowed_action_ids: set[str]) -> ActorOutput:
        provider_output = ActorProviderOutput.model_validate(payload)
        parsed = ActorOutput(selectedActionId=provider_output.selectedActionId)
        ActorDecision(output=parsed, allowedActionIds=allowed_action_ids)
        return parsed

    @staticmethod
    def _build_prompt(request: ActorHarnessRequest) -> str:
        payload = {
            "npcSummary": request.npcSummary,
            "disposition": request.disposition,
            "hpStatus": (
                request.hpStatus
                if request.hpStatus != "unknown"
                else None
            ),
            "conditions": request.conditions,
            "sceneSummary": request.sceneSummary,
            "allowedActions": [action.model_dump(exclude_none=True) for action in request.allowedActions],
        }
        payload = {
            key: value
            for key, value in payload.items()
            if value not in (None, [], "")
        }
        return "NPC가 사용할 행동 후보 하나를 선택하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
