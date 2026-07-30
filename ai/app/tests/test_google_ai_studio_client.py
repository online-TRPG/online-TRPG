from typing import Any

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.schemas.actor import ActorProviderOutput
from app.schemas.interpreter import InterpreterOutput, InterpreterProviderOutput


def _has_key(value: Any, target_key: str) -> bool:
    if isinstance(value, dict):
        return target_key in value or any(_has_key(child, target_key) for child in value.values())
    if isinstance(value, list):
        return any(_has_key(child, target_key) for child in value)
    return False


def test_response_json_schema_sanitizer_removes_google_unsafe_keywords():
    schema = InterpreterOutput.model_json_schema()

    sanitized = GoogleAiStudioClient._sanitize_response_json_schema(schema)

    assert _has_key(schema, "default")
    assert _has_key(schema, "minLength")
    assert _has_key(schema, "maxLength")
    assert not _has_key(sanitized, "default")
    assert _has_key(sanitized, "enum")
    assert _has_key(sanitized, "maxItems")
    assert not _has_key(sanitized, "minLength")
    assert not _has_key(sanitized, "maxLength")
    assert _has_key(sanitized, "minimum")
    assert _has_key(sanitized, "maximum")
    assert not _has_key(sanitized, "title")
    assert not _has_key(sanitized, "anyOf")
    assert not _has_key(sanitized, "$ref")
    assert "$defs" not in sanitized
    assert sanitized["properties"]["action"]["type"] == "object"
    assert sanitized["properties"]["sceneTransition"]["type"] == "object"
    assert sanitized["properties"]["action"]["properties"]["confidence"]["type"] == "number"


def test_response_json_schema_sanitizer_keeps_property_names_that_match_keywords():
    schema = {
        "type": "object",
        "properties": {
            "default": {"type": "string", "default": "value"},
            "minLength": {"type": "number", "minimum": 1},
            "enum": {"type": "string", "enum": ["A"]},
        },
        "required": ["default", "minLength", "enum"],
    }

    sanitized = GoogleAiStudioClient._sanitize_response_json_schema(schema)

    assert "default" in sanitized["properties"]
    assert "minLength" in sanitized["properties"]
    assert "enum" in sanitized["properties"]
    assert "default" not in sanitized["properties"]["default"]
    assert sanitized["properties"]["minLength"]["minimum"] == 1
    assert sanitized["properties"]["enum"]["enum"] == ["A"]


def test_response_json_schema_sanitizer_preserves_extra_forbid_constraint():
    schema = ActorProviderOutput.model_json_schema()

    sanitized = GoogleAiStudioClient._sanitize_response_json_schema(schema)

    assert schema["additionalProperties"] is False
    assert sanitized["additionalProperties"] is False


def test_response_json_schema_sanitizer_preserves_nested_extra_forbid_constraints():
    sanitized = GoogleAiStudioClient._sanitize_response_json_schema(
        InterpreterProviderOutput.model_json_schema()
    )

    action = sanitized["properties"]["action"]
    transition = sanitized["properties"]["sceneTransition"]
    candidate = transition["properties"]["candidates"]["items"]
    requirement = candidate["properties"]["requirements"]["items"]

    assert sanitized["additionalProperties"] is False
    assert action["additionalProperties"] is False
    assert transition["additionalProperties"] is False
    assert candidate["additionalProperties"] is False
    assert requirement["additionalProperties"] is False


def test_google_ai_studio_client_classifies_provider_status_codes():
    rejected_request = GoogleAiStudioClient._classify_exception(
        Exception(
            "400 INVALID_ARGUMENT. {'error': {'code': 400, "
            "'message': 'Request contains an invalid argument.'}}"
        )
    )
    missing_model = GoogleAiStudioClient._classify_exception(
        Exception("404 NOT_FOUND. {'error': {'code': 404, 'message': 'Model not found.'}}")
    )
    conflict = GoogleAiStudioClient._classify_exception(
        Exception("409 ABORTED. {'error': {'code': 409, 'message': 'Request rejected.'}}")
    )
    auth = GoogleAiStudioClient._classify_exception(
        Exception("403 PERMISSION_DENIED. {'error': {'code': 403, 'message': 'Invalid API key.'}}")
    )
    rate_limit = GoogleAiStudioClient._classify_exception(
        Exception("429 TOO_MANY_REQUESTS. {'error': {'code': 429, 'message': 'Rate limited.'}}")
    )
    timeout = GoogleAiStudioClient._classify_exception(
        Exception("408 REQUEST_TIMEOUT. {'error': {'code': 408, 'message': 'Request expired.'}}")
    )
    upstream = GoogleAiStudioClient._classify_exception(
        Exception("500 INTERNAL. {'error': {'code': 500, 'message': 'Internal error encountered.'}}")
    )

    assert rejected_request.failure_type == "provider_request"
    assert rejected_request.status_code == 502
    assert rejected_request.retryable is False
    assert missing_model.failure_type == "config"
    assert missing_model.status_code == 503
    assert missing_model.retryable is False
    assert conflict.failure_type == "provider_request"
    assert conflict.status_code == 502
    assert conflict.retryable is False
    assert auth.failure_type == "auth"
    assert auth.status_code == 503
    assert auth.retryable is False
    assert rate_limit.failure_type == "rate_limit"
    assert rate_limit.status_code == 429
    assert rate_limit.retryable is False
    assert timeout.failure_type == "timeout"
    assert timeout.status_code == 504
    assert timeout.retryable is True
    assert upstream.failure_type == "upstream_error"
    assert upstream.status_code == 502
    assert upstream.retryable is True


def test_google_ai_studio_client_does_not_retry_unclassified_sdk_errors():
    error = GoogleAiStudioClient._classify_exception(
        RuntimeError("Unexpected local SDK failure")
    )

    assert error.failure_type == "upstream_error"
    assert error.status_code == 502
    assert error.retryable is False


def test_google_ai_studio_client_prioritizes_quota_over_provider_status():
    error = GoogleAiStudioClient._classify_exception(
        Exception("503 RESOURCE_EXHAUSTED: quota limit exceeded")
    )

    assert error.failure_type == "quota"
    assert error.status_code == 429
    assert error.retryable is False


def test_google_ai_studio_client_reads_structured_provider_status():
    class StructuredProviderError(Exception):
        code = 404

        def __str__(self) -> str:
            return "model lookup failed"

    error = GoogleAiStudioClient._classify_exception(StructuredProviderError())

    assert error.failure_type == "config"
    assert error.status_code == 503
    assert error.retryable is False


def test_google_ai_studio_client_bounds_diagnostic_metadata():
    class Usage:
        prompt_token_count = -1
        candidates_token_count = True
        cached_content_token_count = 2_147_483_648
        total_token_count = 12

    assert GoogleAiStudioClient._optional_int(Usage(), "prompt_token_count") is None
    assert GoogleAiStudioClient._optional_int(Usage(), "candidates_token_count") is None
    assert GoogleAiStudioClient._optional_int(Usage(), "cached_content_token_count") is None
    assert GoogleAiStudioClient._optional_int(Usage(), "total_token_count") == 12
    assert (
        GoogleAiStudioClient._bounded_optional_text("x" * 600, max_length=500)
        == "x" * 500
    )


def test_google_ai_studio_client_preserves_valid_partial_usage_independently():
    class PartialUsage:
        prompt_token_count = 10
        candidates_token_count = None
        cached_content_token_count = 0
        total_token_count = "10"

    usage = PartialUsage()

    assert GoogleAiStudioClient._optional_int(usage, "prompt_token_count") == 10
    assert GoogleAiStudioClient._optional_int(usage, "candidates_token_count") is None
    assert GoogleAiStudioClient._optional_int(usage, "cached_content_token_count") == 0
    assert GoogleAiStudioClient._optional_int(usage, "total_token_count") is None
    assert GoogleAiStudioClient._optional_int(usage, "missing_token_count") is None


def test_thinking_config_is_not_sent_for_gemma_models():
    assert GoogleAiStudioClient._supports_thinking_config("gemma-4-31b-it") is False
    assert GoogleAiStudioClient._supports_thinking_config("gemini-2.5-flash") is True


def test_generate_json_passes_remaining_deadline_and_collects_usage(monkeypatch):
    captured: dict[str, object] = {}

    class FakeTypes:
        class HttpRetryOptions:
            def __init__(self, **kwargs):
                captured["retry_options"] = kwargs

        class HttpOptions:
            def __init__(self, **kwargs):
                captured["http_options"] = kwargs

        class GenerateContentConfig:
            def __init__(self, **kwargs):
                captured["config"] = kwargs

    class FakeModels:
        @staticmethod
        def generate_content(**kwargs):
            captured["request"] = kwargs
            usage = type(
                "Usage",
                (),
                {
                    "prompt_token_count": 10,
                    "candidates_token_count": 4,
                    "cached_content_token_count": 2,
                    "total_token_count": 14,
                },
            )()
            return type(
                "Response",
                (),
                {
                    "text": '{"ok":true}',
                    "parsed": {"ok": True},
                    "candidates": [],
                    "usage_metadata": usage,
                    "response_id": "response-1",
                },
            )()

    client = GoogleAiStudioClient(Settings(google_api_key="test-key"))
    client._client = type("FakeClient", (), {"models": FakeModels()})()
    monkeypatch.setattr(client, "_get_genai_types", lambda: FakeTypes)

    result = client.generate_json(
        model="gemma-test",
        prompt="{}",
        response_json_schema={"type": "object"},
        timeout_ms=321,
    )

    assert captured["retry_options"] == {"attempts": 1}
    assert captured["http_options"] == {
        "timeout": 321,
        "retry_options": captured["http_options"]["retry_options"],
    }
    assert result.prompt_token_count == 10
    assert result.output_token_count == 4
    assert result.cached_token_count == 2
    assert result.total_token_count == 14


def test_generate_json_rejects_oversized_prompt_before_provider_call():
    client = GoogleAiStudioClient(
        Settings(google_api_key="test-key", ai_prompt_max_bytes=4 * 1024)
    )
    client._client = object()

    try:
        client.generate_json(
            model="test-model",
            prompt="x" * 4097,
            response_json_schema={"type": "object"},
        )
        raise AssertionError("input_too_large error expected")
    except AiClientError as error:
        assert error.failure_type == "input_too_large"
        assert error.status_code == 422


def test_generate_json_accepts_exact_combined_prompt_budget_and_rejects_one_byte_over(
    monkeypatch,
):
    provider_calls = 0

    class FakeTypes:
        class HttpRetryOptions:
            def __init__(self, **_kwargs):
                pass

        class HttpOptions:
            def __init__(self, **_kwargs):
                pass

        class GenerateContentConfig:
            def __init__(self, **_kwargs):
                pass

    class FakeModels:
        @staticmethod
        def generate_content(**_kwargs):
            nonlocal provider_calls
            provider_calls += 1
            return type(
                "Response",
                (),
                {
                    "text": '{"ok":true}',
                    "parsed": {"ok": True},
                    "candidates": [],
                    "usage_metadata": None,
                },
            )()

    limit = 4 * 1024
    schema = {"type": "object"}
    client = GoogleAiStudioClient(
        Settings(google_api_key="test-key", ai_prompt_max_bytes=limit)
    )
    client._client = type("FakeClient", (), {"models": FakeModels()})()
    monkeypatch.setattr(client, "_get_genai_types", lambda: FakeTypes)
    schema_bytes = len(
        client._cached_sanitized_response_schema_json(
            '{"type":"object"}'
        ).encode("utf-8")
    )
    exact_prompt = "x" * (limit - schema_bytes)

    client.generate_json(
        model="test-model",
        prompt=exact_prompt,
        response_json_schema=schema,
    )

    try:
        client.generate_json(
            model="test-model",
            prompt=exact_prompt + "x",
            response_json_schema=schema,
        )
        raise AssertionError("one-byte-over prompt must be rejected")
    except AiClientError as error:
        assert error.failure_type == "input_too_large"
        assert error.status_code == 422
    assert provider_calls == 1


def test_generate_json_classifies_local_sdk_config_errors_without_provider_call(monkeypatch):
    provider_called = False

    class FakeTypes:
        class HttpRetryOptions:
            def __init__(self, **_kwargs):
                pass

        class HttpOptions:
            def __init__(self, **_kwargs):
                raise ValueError("timeout option is unsupported")

    class FakeModels:
        @staticmethod
        def generate_content(**_kwargs):
            nonlocal provider_called
            provider_called = True

    client = GoogleAiStudioClient(Settings(google_api_key="test-key"))
    client._client = type("FakeClient", (), {"models": FakeModels()})()
    monkeypatch.setattr(client, "_get_genai_types", lambda: FakeTypes)

    try:
        client.generate_json(
            model="test-model",
            prompt="hello",
            response_json_schema={"type": "object"},
            timeout_ms=100,
        )
    except AiClientError as error:
        assert error.failure_type == "config"
        assert error.retryable is False
        assert error.status_code == 503
        assert error.attempts == 0
    else:
        raise AssertionError("expected local request config failure")
    assert provider_called is False
