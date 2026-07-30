import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.harness import NarratorHarnessRequest, NarratorHarnessResponse
from app.schemas.narrator import NarratorOutput, NarratorProviderOutput
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    provider_output_schema,
)


class NarratorService:
    PROMPT_VERSION = "narrator.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: NarratorHarnessRequest) -> NarratorHarnessResponse:
        self._validate_request_constraints(request)
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("narrator")
        user_prompt = self._build_prompt(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=provider_output_schema(NarratorProviderOutput),
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_narrator,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._validate_output(result.parsed_json, request),
            validation_error_prefix="Narrator schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            NarratorHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="narrator",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _validate_request_constraints(request: NarratorHarnessRequest) -> None:
        if request.constraints.noNewFacts is not True:
            raise AiClientError(
                message="Narrator requires constraints.noNewFacts=true",
                failure_type="schema_validation",
                retryable=False,
                status_code=400,
                attempts=0,
            )

    @staticmethod
    def _validate_output(payload: dict, request: NarratorHarnessRequest) -> NarratorOutput:
        provider_output = NarratorProviderOutput.model_validate(payload)
        if len(provider_output.narration) > request.constraints.maxLength:
            raise ValueError(
                f"narration exceeds constraints.maxLength={request.constraints.maxLength}"
            )
        return NarratorOutput(narration=provider_output.narration)

    @staticmethod
    def _build_prompt(request: NarratorHarnessRequest) -> str:
        scene = request.scene.model_dump(exclude_none=True)
        action = None
        if request.action:
            action = {
                key: value
                for key, value in {
                    "type": request.action.type,
                    "approach": request.action.approach,
                    "requiresRoll": request.action.requiresRoll,
                    "attackKind": request.action.attackKind,
                    "ability": request.action.ability,
                    "skill": request.action.skill,
                }.items()
                if value is not None
            }
        check_request = None
        if request.checkRequest:
            check_request = {
                key: value
                for key, value in {
                    "checkType": request.checkRequest.checkType,
                    "ability": request.checkRequest.ability,
                    "skill": request.checkRequest.skill,
                    "difficultyClass": request.checkRequest.difficultyClass,
                    "reason": request.checkRequest.reason,
                }.items()
                if value is not None
            }
        dice_result = None
        if request.diceResult:
            dice_result = {
                key: value
                for key, value in {
                    "formula": request.diceResult.formula,
                    "total": request.diceResult.total,
                    "naturalD20": request.diceResult.naturalD20,
                    "success": request.diceResult.success,
                }.items()
                if value is not None
            }
        state_diff_summary = None
        if request.stateDiffSummary:
            state_diff_summary = {
                key: value
                for key, value in {
                    "summary": request.stateDiffSummary.summary,
                    "hpChanges": request.stateDiffSummary.hpChanges,
                    "inventoryChanges": request.stateDiffSummary.inventoryChanges,
                    "conditionChanges": request.stateDiffSummary.conditionChanges,
                }.items()
                if value not in (None, [], "")
            }
        payload = {
            "action": action,
            "checkRequest": check_request,
            "diceResult": dice_result,
            "stateDiffSummary": state_diff_summary,
            "scene": scene,
            "maxLength": request.constraints.maxLength,
        }
        if request.action is None:
            payload["legacyActionSummary"] = request.actionSummary or request.rawInput
        if request.diceResult is None and request.diceSummary:
            payload["legacyDiceSummary"] = request.diceSummary
        payload = {key: value for key, value in payload.items() if value not in (None, [], "")}
        lines = [
            "다음 확정 결과를 한국어 GM 서술로 요약하라.",
            "JSON 입력:",
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        ]
        return "\n".join(lines)
