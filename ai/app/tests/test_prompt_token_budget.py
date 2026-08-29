from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError


def test_prompt_budget_counts_system_instruction_and_user_prompt_together():
    client = GoogleAiStudioClient(
        Settings(google_api_key="test-key", ai_prompt_max_bytes=4 * 1024)
    )
    client._client = object()

    try:
        client.generate_json(
            model="test-model",
            prompt="가" * 1_000,
            system_instruction="나" * 400,
            response_json_schema={"type": "object"},
        )
        raise AssertionError("combined prompt budget error expected")
    except AiClientError as error:
        assert error.failure_type == "input_too_large"
        assert error.status_code == 422
