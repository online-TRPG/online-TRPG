from __future__ import annotations

import json
from contextlib import contextmanager
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from collections.abc import Iterator

from app.core.config import Settings
from app.core.errors import AiClientError


class HarnessResponseLogger:
    def __init__(self, settings: Settings):
        self._base_dir = settings.ai_log_path
        self._max_bytes = settings.ai_log_max_bytes
        self._backup_count = settings.ai_log_backup_count
        self._log_payloads = settings.ai_log_payloads
        self._write_lock = Lock()
        self._existing_bounds_checked = False

    @contextmanager
    def history_access(self) -> Iterator[None]:
        """Serialize history reads with rotate/append in this process."""

        with self._write_lock:
            yield

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
            "request": request_payload if self._log_payloads else self._request_reference(request_payload),
            "response": response_payload if self._log_payloads else self._response_reference(response_payload),
            "error": self._bounded_error(error_payload),
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
        with self._write_lock:
            return self._write_event_locked(endpoint=endpoint, event=event)

    def _write_event_locked(self, *, endpoint: str, event: dict[str, Any]) -> dict[str, str]:
        try:
            self._base_dir.mkdir(parents=True, exist_ok=True)
            if not self._existing_bounds_checked:
                self._enforce_existing_log_bounds()
                self._existing_bounds_checked = True
            latest_path = self._base_dir / f"{endpoint}.latest.json"
            history_path = self._base_dir / "harness_history.jsonl"
            log_paths = {
                "latest": str(latest_path),
                "history": str(history_path),
            }
            if isinstance(event.get("aiTrace"), dict):
                trace_id = event["aiTrace"].get("id")
                diagnostic_ref = (
                    f"{history_path.name}#{trace_id}" if trace_id else history_path.name
                )
                event["diagnosticRef"] = diagnostic_ref
                event["aiTrace"]["diagnosticRef"] = diagnostic_ref

            event, compact_event = self._bounded_event(event)
            self._rotate_history_if_needed(history_path, len(compact_event.encode("utf-8")) + 1)
            latest_path.write_text(
                compact_event,
                encoding="utf-8",
            )
            with history_path.open("a", encoding="utf-8") as stream:
                stream.write(compact_event + "\n")
            return log_paths
        except (OSError, TypeError, ValueError):
            # Diagnostic logging must never turn a valid role response into a failure.
            return {}

    def _enforce_existing_log_bounds(self) -> None:
        """Restore configured bounds after max-size or backup-count reductions."""

        history_path = self._base_dir / "harness_history.jsonl"
        history_prefix = f"{history_path.name}."
        for candidate in self._base_dir.glob(f"{history_path.name}*"):
            backup_index: int | None = None
            if candidate != history_path:
                suffix = candidate.name.removeprefix(history_prefix)
                if not suffix.isdigit():
                    continue
                backup_index = int(suffix)
            if (
                (backup_index is not None and backup_index > self._backup_count)
                or candidate.stat().st_size > self._max_bytes
            ):
                candidate.unlink()

        for latest_path in self._base_dir.glob("*.latest.json"):
            if latest_path.stat().st_size > self._max_bytes:
                latest_path.unlink()

    def _bounded_event(self, event: dict[str, Any]) -> tuple[dict[str, Any], str]:
        compact_event = json.dumps(event, ensure_ascii=False)
        if len(compact_event.encode("utf-8")) + 1 <= self._max_bytes:
            return event, compact_event

        request_payload = event.get("request")
        response_payload = event.get("response")
        error_payload = event.get("error")
        bounded_event = {
            "timestamp": event.get("timestamp"),
            "endpoint": event.get("endpoint"),
            "status": event.get("status"),
            "request": self._request_reference(
                request_payload if isinstance(request_payload, dict) else {}
            ),
            "response": self._response_reference(
                response_payload if isinstance(response_payload, dict) else None
            ),
            "error": self._bounded_error(error_payload),
            "aiTrace": event.get("aiTrace"),
            "diagnosticRef": event.get("diagnosticRef"),
            "payloadTruncated": True,
        }
        compact_event = json.dumps(bounded_event, ensure_ascii=False)
        if len(compact_event.encode("utf-8")) + 1 <= self._max_bytes:
            return bounded_event, compact_event

        trace = event.get("aiTrace") if isinstance(event.get("aiTrace"), dict) else {}
        minimal_event = {
            "timestamp": event.get("timestamp"),
            "endpoint": event.get("endpoint"),
            "status": event.get("status"),
            "error": self._bounded_error(error_payload),
            "aiTrace": {
                key: trace.get(key)
                for key in (
                    "id",
                    "role",
                    "status",
                    "latencyMs",
                    "attempts",
                    "failureType",
                    "createdAt",
                )
            },
            "payloadTruncated": True,
        }
        return minimal_event, json.dumps(minimal_event, ensure_ascii=False)

    @staticmethod
    def _bounded_error(error_payload: Any) -> dict[str, Any] | None:
        if not isinstance(error_payload, dict):
            return None
        bounded = {
            key: error_payload.get(key)
            for key in (
                "failureType",
                "failure_type",
                "retryable",
                "attempts",
                "latencyMs",
                "attemptLatenciesMs",
                "schemaValidationRetries",
            )
            if error_payload.get(key) is not None
        }
        message = error_payload.get("message")
        if message is not None:
            bounded["message"] = str(message)[:1000]
        return bounded

    def _rotate_history_if_needed(self, history_path: Path, incoming_bytes: int) -> None:
        current_bytes = history_path.stat().st_size if history_path.exists() else 0
        if current_bytes + incoming_bytes <= self._max_bytes:
            return
        oldest = history_path.with_suffix(f"{history_path.suffix}.{self._backup_count}")
        if oldest.exists():
            oldest.unlink()
        for index in range(self._backup_count - 1, 0, -1):
            source = history_path.with_suffix(f"{history_path.suffix}.{index}")
            if source.exists():
                source.replace(history_path.with_suffix(f"{history_path.suffix}.{index + 1}"))
        if history_path.exists():
            history_path.replace(history_path.with_suffix(f"{history_path.suffix}.1"))

    @staticmethod
    def _request_reference(request_payload: dict[str, Any]) -> dict[str, Any]:
        return {
            key: request_payload.get(key)
            for key in ("sessionId", "turnId", "actorCharacterId")
            if request_payload.get(key) is not None
        }

    @staticmethod
    def _response_reference(response_payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if response_payload is None:
            return None
        return {
            "fallback": response_payload.get("fallback", False),
            "trace": response_payload.get("trace"),
        }

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
            "providerLatencyMs": trace.get("providerLatencyMs"),
            "attemptLatenciesMs": trace.get("attemptLatenciesMs") or [],
            "attempts": trace.get("attempts"),
            "schemaValidationRetries": trace.get("schemaValidationRetries"),
            "failureType": trace.get("failureType")
            or (error_payload or {}).get("failureType")
            or (error_payload or {}).get("failure_type"),
            "finishReason": trace.get("finishReason"),
            "providerRequestId": trace.get("providerRequestId"),
            "promptTokenCount": trace.get("promptTokenCount"),
            "outputTokenCount": trace.get("outputTokenCount"),
            "cachedTokenCount": trace.get("cachedTokenCount"),
            "totalTokenCount": trace.get("totalTokenCount"),
            "createdAt": timestamp,
            "diagnosticRef": None,
        }
