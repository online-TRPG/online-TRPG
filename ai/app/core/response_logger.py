from __future__ import annotations

import json
from uuid import uuid4
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

    def log_fallback(
        self,
        *,
        endpoint: str,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any],
        error: AiClientError,
    ) -> dict[str, str]:
        event = self._build_event(
            endpoint=endpoint,
            status="fallback",
            request_payload=request_payload,
            response_payload=response_payload,
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
        timestamp = datetime.now(timezone.utc).isoformat()
        return {
            "timestamp": timestamp,
            "endpoint": endpoint,
            "status": status,
            "request": request_payload,
            "response": response_payload,
            "error": error_payload,
            "aiTrace": self._build_ai_trace_record(
                timestamp=timestamp,
                endpoint=endpoint,
                status=status,
                request_payload=request_payload,
                response_payload=response_payload,
                error_payload=error_payload,
            ),
        }

    def _write_event(self, *, endpoint: str, event: dict[str, Any]) -> dict[str, str]:
        self._base_dir.mkdir(parents=True, exist_ok=True)
        latest_path = self._base_dir / f"{endpoint}.latest.json"
        history_path = self._base_dir / "harness_history.jsonl"
        log_paths = {
            "latest": str(latest_path.resolve()),
            "history": str(history_path.resolve()),
        }
        event["logPaths"] = log_paths
        if isinstance(event.get("aiTrace"), dict):
            event["aiTrace"]["logPaths"] = log_paths

        latest_path.write_text(
            json.dumps(event, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        with history_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")

        return log_paths

    def _build_ai_trace_record(
        self,
        *,
        timestamp: str,
        endpoint: str,
        status: str,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any] | None,
        error_payload: dict[str, Any] | None,
    ) -> dict[str, Any]:
        trace = (response_payload or {}).get("trace") or {}
        return {
            "id": f"trace-{uuid4()}",
            "sessionId": request_payload.get("sessionId"),
            "turnId": request_payload.get("turnId"),
            "actorCharacterId": request_payload.get("actorCharacterId"),
            "endpoint": endpoint,
            "role": trace.get("role") or endpoint,
            "status": status,
            "provider": trace.get("provider"),
            "model": trace.get("model"),
            "promptVersion": trace.get("promptVersion"),
            "latencyMs": trace.get("latencyMs"),
            "attempts": trace.get("attempts"),
            "failureType": trace.get("failureType")
            or (error_payload or {}).get("failureType")
            or (error_payload or {}).get("failure_type"),
            "finishReason": trace.get("finishReason"),
            "providerRequestId": trace.get("providerRequestId"),
            "createdAt": timestamp,
            "logPaths": None,
        }
