from pathlib import Path

import pytest

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings


def google_ai_studio_settings() -> Settings:
    settings = Settings(
        ai_timeout_ms=60_000,
        ai_max_retries=0,
        ai_log_dir=str(Path("runtime_logs_test") / "live_google_ai_studio"),
    )
    if not settings.google_api_key:
        pytest.skip("GOOGLE_API_KEY is not configured.")
    return settings


def test_google_ai_studio_json_connectivity():
    settings = google_ai_studio_settings()
    client = GoogleAiStudioClient(settings)

    result = client.generate_json(
        model=settings.model_for_role("interpreter"),
        prompt='Return JSON only: {"ok": true, "message": "pong"}',
        response_json_schema={
            "type": "object",
            "properties": {
                "ok": {"type": "boolean"},
                "message": {"type": "string"},
            },
            "required": ["ok", "message"],
        },
        system_instruction="Return only the requested JSON object.",
        temperature=0,
    )

    assert result.provider == "google-ai-studio"
    assert result.model == settings.model_for_role("interpreter")
    assert result.parsed_json["ok"] is True
    assert result.parsed_json["message"] == "pong"
    assert result.latency_ms >= 0
