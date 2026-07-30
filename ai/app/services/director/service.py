import json
from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.director import DirectorOutput, DirectorProviderOutput
from app.schemas.harness import DirectorHarnessRequest, DirectorHarnessResponse
from app.services.provider_execution import (
    attach_role_diagnostics,
    build_role_response_metadata,
    execute_provider_request,
    load_role_prompt,
    mutable_provider_output_schema,
)


class DirectorService:
    PROMPT_VERSION = "director.v1.md"

    def __init__(self, client: GoogleAiStudioClient, settings: Settings):
        self._client = client
        self._settings = settings

    def run(self, request: DirectorHarnessRequest) -> DirectorHarnessResponse:
        system_prompt = load_role_prompt(self.PROMPT_VERSION)
        model = request.model or self._settings.model_for_role("director")
        user_prompt = self._build_prompt(request)
        response_json_schema = self._response_json_schema(request)
        execution = execute_provider_request(
            settings=self._settings,
            request_once=lambda timeout_ms: self._client.generate_json(
                    model=model,
                    prompt=user_prompt,
                    response_json_schema=response_json_schema,
                    system_instruction=system_prompt,
                    temperature=self._settings.ai_temperature_director,
                    timeout_ms=timeout_ms,
                ),
            parse_response=lambda result: self._normalize_provider_output(
                result.parsed_json,
                request,
            ),
            validation_error_prefix="Director schema validation failed",
        )
        parsed = execution.parsed

        return attach_role_diagnostics(
            DirectorHarnessResponse(
                **build_role_response_metadata(
                    execution=execution,
                    role="director",
                    prompt_version=self.PROMPT_VERSION,
                ),
                parsed=parsed,
            ),
            execution=execution,
            settings=self._settings,
        )

    @staticmethod
    def _normalize_provider_output(
        payload: dict,
        request: DirectorHarnessRequest,
    ) -> DirectorOutput:
        if request.responseMode == "HINT" and "suggestions" in payload:
            raise ValueError(
                "Director provider returned suggestions excluded by the HINT contract"
            )
        provider_output = DirectorProviderOutput.model_validate(payload)
        return DirectorOutput(
            content=provider_output.content,
            suggestions=(
                provider_output.suggestions
                if request.responseMode == "HUMAN_GM_ASSIST"
                else []
            ),
        )

    @staticmethod
    def _response_json_schema(request: DirectorHarnessRequest) -> dict:
        schema = mutable_provider_output_schema(DirectorProviderOutput)
        if request.responseMode == "HUMAN_GM_ASSIST":
            return schema
        schema["properties"].pop("suggestions", None)
        required = schema.get("required")
        if isinstance(required, list):
            schema["required"] = [field for field in required if field != "suggestions"]
        return schema

    @staticmethod
    def _build_prompt(request: DirectorHarnessRequest) -> str:
        payload = {
            "hintLevel": request.hintLevel,
            "question": request.question,
            "sceneSummary": request.sceneSummary,
            "recentLogs": request.recentLogs,
            "publicClues": request.publicClues,
            "triedApproaches": request.triedApproaches,
            "responseMode": request.responseMode,
        }
        payload = {key: value for key, value in payload.items() if value not in (None, [], "")}
        return "공개 정보 안에서 진행 힌트를 작성하라.\nJSON 입력:\n" + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
