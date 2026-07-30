import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.check_result import CheckResultOutput, CheckResultProviderOutput
from app.schemas.harness import CheckResultHarnessRequest, CheckResultHarnessResponse
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    provider_output_schema,
)


class CheckResultService:
    PROMPT_VERSION = "check_result.v1.md"
    INFORMATION_REWARD_INTENTS = {
        "SOCIAL_PERSUADE",
        "SOCIAL_INTIMIDATE",
        "SOCIAL_DECEIVE",
        "READ_EMOTION",
    }

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: CheckResultHarnessRequest) -> CheckResultHarnessResponse:
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("check_result")
        user_prompt = self._build_prompt(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=provider_output_schema(CheckResultProviderOutput),
                    system_instruction=system_prompt,
                    temperature=(
                        self._settings.ai_temperature_check_result
                        if self._settings.ai_temperature_check_result is not None
                        else self._settings.ai_temperature_narrator
                    ),
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._normalize_output(result.parsed_json, request),
            validation_error_prefix="CheckResult schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            CheckResultHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="check_result",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _normalize_output(
        payload: dict,
        request: CheckResultHarnessRequest,
    ) -> CheckResultOutput:
        provider_output = CheckResultProviderOutput.model_validate(payload)
        if (
            request.outcome == "SUCCESS"
            and request.intent in CheckResultService.INFORMATION_REWARD_INTENTS
        ):
            if not request.allowedRewardFacts:
                return CheckResultOutput(
                    narration="판정에 성공했지만 새로운 사실은 드러나지 않습니다."
                )

            # The provider may select a backend-approved fact, but it does not
            # own the final factual prose. Returning the exact selected fact
            # discards any additional model-authored claim.
            selected_fact = next(
                (
                    fact
                    for fact in request.allowedRewardFacts
                    if fact in provider_output.narration
                ),
                None,
            )
            if selected_fact is None:
                raise ValueError(
                    "CheckResult narration must copy one allowedRewardFacts entry exactly"
                )
            return CheckResultOutput(narration=selected_fact)
        return CheckResultOutput(narration=provider_output.narration)

    @staticmethod
    def _build_prompt(request: CheckResultHarnessRequest) -> str:
        payload: dict[str, object | None] = {
            "outcome": request.outcome,
            "intent": request.intent,
            "targetName": request.targetName,
            "allowedRewardFacts": request.allowedRewardFacts,
            "outputMode": request.outputMode,
        }
        if request.intent not in CheckResultService.INFORMATION_REWARD_INTENTS:
            payload.update(
                {
                    "actionSummary": request.actionSummary,
                    "targetSummary": request.targetSummary,
                    "targetDisposition": request.targetDisposition,
                    "sceneSummary": request.sceneSummary,
                    "visibleEntities": request.visibleEntities,
                }
            )
        payload = {key: value for key, value in payload.items() if value not in (None, [], "")}
        return "판정 결과에 맞는 한국어 TRPG 결과 지문을 생성하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
