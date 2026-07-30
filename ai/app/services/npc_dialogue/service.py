import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.harness import NpcDialogueHarnessRequest, NpcDialogueHarnessResponse
from app.schemas.npc_dialogue import NpcDialogueOutput, NpcDialogueProviderOutput
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    provider_output_schema,
)


class NpcDialogueService:
    PROMPT_VERSION = "npc_dialogue.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: NpcDialogueHarnessRequest) -> NpcDialogueHarnessResponse:
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("npc_dialogue")
        user_prompt = self._build_prompt(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=provider_output_schema(NpcDialogueProviderOutput),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_npc_dialogue,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._validate_output(result.parsed_json, request),
            validation_error_prefix="NpcDialogue schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            NpcDialogueHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="npc_dialogue",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _validate_output(payload: dict, request: NpcDialogueHarnessRequest) -> NpcDialogueOutput:
        provider_output = NpcDialogueProviderOutput.model_validate(payload)
        if len(provider_output.dialogue) > request.maxLength:
            raise ValueError(f"dialogue exceeds request.maxLength={request.maxLength}")
        return NpcDialogueOutput(dialogue=provider_output.dialogue)

    @staticmethod
    def _build_prompt(request: NpcDialogueHarnessRequest) -> str:
        payload = {
            "npcName": request.npcName,
            "npcSummary": request.npcSummary,
            "disposition": request.disposition,
            "sceneSummary": request.sceneSummary,
            "recentContext": request.recentContext,
            "dialogueIntent": request.dialogueIntent,
            "maxLength": request.maxLength,
        }
        payload = {key: value for key, value in payload.items() if value not in (None, [], "")}
        return "NPC 대사 한 줄을 생성하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
