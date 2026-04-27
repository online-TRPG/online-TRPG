from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.core.errors import AiClientError


class HarnessResponseLogger:
    def __init__(self, settings: Settings):
        self._base_dir = settings.ai_log_path

    def log_success(
        self,
        *,
        endpoint: str,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any],
    ) -> dict[str, str]:
        event = self._build_event(
            endpoint=endpoint,
            status="success",
            request_payload=request_payload,
            response_payload=response_payload,
        )
        return self._write_event(endpoint=endpoint, event=event)

    def log_failure(
        self,
        *,
        endpoint: str,
        request_payload: dict[str, Any],
        error: AiClientError,
    ) -> dict[str, str]:
        event = self._build_event(
            endpoint=endpoint,
            status="failure",
            request_payload=request_payload,
            response_payload=None,
            error_payload=error.as_dict(),
        )
        return self._write_event(endpoint=endpoint, event=event)

    def _build_event(
        self,
        *,
        endpoint: str,
        status: str,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any] | None,
        error_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "endpoint": endpoint,
            "status": status,
            "request": request_payload,
            "response": response_payload,
            "error": error_payload,
        }

    def _write_event(self, *, endpoint: str, event: dict[str, Any]) -> dict[str, str]:
        self._base_dir.mkdir(parents=True, exist_ok=True)
        latest_path = self._base_dir / f"{endpoint}.latest.json"
        history_path = self._base_dir / "harness_history.jsonl"

        latest_path.write_text(
            json.dumps(event, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        with history_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")

        return {
            "latest": str(latest_path.resolve()),
            "history": str(history_path.resolve()),
        }
