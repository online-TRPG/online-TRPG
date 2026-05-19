from typing import Any

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.schemas.interpreter import InterpreterOutput


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
    assert not _has_key(sanitized, "enum")
    assert not _has_key(sanitized, "maxItems")
    assert not _has_key(sanitized, "minLength")
    assert not _has_key(sanitized, "maxLength")
    assert not _has_key(sanitized, "minimum")
    assert not _has_key(sanitized, "maximum")
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
    assert "minimum" not in sanitized["properties"]["minLength"]
    assert "enum" not in sanitized["properties"]["enum"]


def test_google_ai_studio_client_classifies_provider_status_codes():
    bad_request = GoogleAiStudioClient._classify_exception(
        Exception(
            "400 INVALID_ARGUMENT. {'error': {'code': 400, "
            "'message': 'Request contains an invalid argument.'}}"
        )
    )
    upstream = GoogleAiStudioClient._classify_exception(
        Exception("500 INTERNAL. {'error': {'code': 500, 'message': 'Internal error encountered.'}}")
    )

    assert bad_request.failure_type == "bad_request"
    assert bad_request.status_code == 400
    assert bad_request.retryable is False
    assert upstream.failure_type == "upstream_error"
    assert upstream.status_code == 502
    assert upstream.retryable is True


def test_thinking_config_is_not_sent_for_gemma_models():
    assert GoogleAiStudioClient._supports_thinking_config("gemma-4-31b-it") is False
    assert GoogleAiStudioClient._supports_thinking_config("gemini-2.5-flash") is True
