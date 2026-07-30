import json
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import TraceListItem, TraceListResponse


@dataclass(slots=True)
class TraceScan:
    items: list[TraceListItem]
    total_rows: int
    filtered_rows: int
    scanned_bytes: int
    malformed_rows: int
    truncated: bool


class AiTraceService:
    def __init__(self, settings: Settings, response_logger: HarnessResponseLogger):
        self._settings = settings
        self._response_logger = response_logger

    def fallback_trace(self, *, role: str, error: AiClientError) -> dict[str, object]:
        return {
            "role": role,
            "provider": "template-fallback",
            "model": "local-template",
            "promptVersion": f"{role}.fallback.v1",
            "latencyMs": error.latency_ms,
            "providerLatencyMs": None,
            "attemptLatenciesMs": error.attempt_latencies_ms,
            "schemaValidationRetries": error.schema_validation_retries,
            "attempts": max(0, error.attempts),
            "failureType": error.failure_type,
            "finishReason": "FALLBACK",
            "providerRequestId": None,
            "promptTokenCount": None,
            "outputTokenCount": None,
            "cachedTokenCount": None,
            "totalTokenCount": None,
        }

    def log_fallback_response(
        self,
        *,
        endpoint: str,
        request_payload: dict,
        response,
        error: AiClientError,
    ):
        self._response_logger.log_fallback(
            endpoint=endpoint,
            request_payload=request_payload,
            response_payload=response.model_dump(),
            error=error,
        )
        return response

    def log_failure(self, endpoint: str, request_payload: dict, error: AiClientError) -> dict[str, str]:
        return self._response_logger.log_failure(
            endpoint=endpoint,
            request_payload=request_payload,
            error=error,
        )

    def list_traces(
        self,
        *,
        role: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        size: int = 20,
    ) -> TraceListResponse:
        history_path = self._settings.ai_log_path / "harness_history.jsonl"
        with self._response_logger.history_access():
            history_paths = self._history_paths_newest_first(history_path)
            if not history_paths:
                return TraceListResponse(items=[], total=0, filtered=0)
            scan = self._scan_latest_items(
                history_paths,
                role=role,
                status=status,
                session_id=session_id,
                size=size,
            )
        return TraceListResponse(
            items=scan.items,
            total=scan.total_rows,
            filtered=scan.filtered_rows,
            scannedBytes=scan.scanned_bytes,
            malformedRows=scan.malformed_rows,
            scanTruncated=scan.truncated,
        )

    @staticmethod
    def _record(value: object) -> dict:
        return value if isinstance(value, dict) else {}

    def _history_paths_newest_first(self, history_path: Path) -> list[Path]:
        candidates = [
            history_path,
            *(
                history_path.with_suffix(f"{history_path.suffix}.{index}")
                for index in range(1, self._settings.ai_log_backup_count + 1)
            ),
        ]
        return [path for path in candidates if path.exists()]

    def _scan_latest_items(
        self,
        history_paths: list[Path],
        *,
        role: str | None,
        status: str | None,
        session_id: str | None,
        size: int,
    ) -> TraceScan:
        remaining_bytes = self._settings.ai_trace_scan_max_bytes
        scanned_bytes = 0
        malformed_rows = 0
        truncated = False
        total_rows = 0
        filtered_rows = 0
        items: list[TraceListItem] = []
        chunk_size = min(8 * 1024, remaining_bytes)

        for path_index, history_path in enumerate(history_paths):
            if remaining_bytes <= 0:
                truncated = True
                break
            file_size = history_path.stat().st_size
            position = file_size
            pending = b""
            with history_path.open("rb") as stream:
                while position > 0 and remaining_bytes > 0:
                    read_size = min(chunk_size, position, remaining_bytes)
                    position -= read_size
                    stream.seek(position)
                    payload = stream.read(read_size)
                    scanned_bytes += len(payload)
                    remaining_bytes -= len(payload)
                    parts = (payload + pending).split(b"\n")
                    pending = parts[0]
                    newest_lines = list(reversed(parts[1:]))

                    for line_index, raw_line in enumerate(newest_lines):
                        if not raw_line.strip():
                            continue
                        try:
                            row = json.loads(raw_line.decode("utf-8"))
                        except (UnicodeDecodeError, json.JSONDecodeError):
                            malformed_rows += 1
                            continue
                        if not isinstance(row, dict):
                            malformed_rows += 1
                            continue
                        total_rows += 1
                        try:
                            item = self._trace_item(
                                row,
                                role=role,
                                status=status,
                                session_id=session_id,
                            )
                        except ValidationError:
                            malformed_rows += 1
                            continue
                        if item is None:
                            continue
                        filtered_rows += 1
                        items.append(item)
                        if len(items) >= size:
                            older_line_in_chunk = any(
                                candidate.strip()
                                for candidate in newest_lines[line_index + 1 :]
                            )
                            truncated = bool(
                                older_line_in_chunk
                                or pending.strip()
                                or position > 0
                                or path_index + 1 < len(history_paths)
                            )
                            return TraceScan(
                                items=items,
                                total_rows=total_rows,
                                filtered_rows=filtered_rows,
                                scanned_bytes=scanned_bytes,
                                malformed_rows=malformed_rows,
                                truncated=truncated,
                            )

                if position == 0 and pending.strip():
                    try:
                        row = json.loads(pending.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        malformed_rows += 1
                    else:
                        if isinstance(row, dict):
                            total_rows += 1
                            try:
                                item = self._trace_item(
                                    row,
                                    role=role,
                                    status=status,
                                    session_id=session_id,
                                )
                            except ValidationError:
                                malformed_rows += 1
                            else:
                                if item is not None:
                                    filtered_rows += 1
                                    items.append(item)
                        else:
                            malformed_rows += 1

            if position > 0:
                truncated = True
                break
            if len(items) >= size:
                truncated = path_index + 1 < len(history_paths)
                break
            if path_index + 1 < len(history_paths) and remaining_bytes <= 0:
                truncated = True

        return TraceScan(
            items=items[:size],
            total_rows=total_rows,
            filtered_rows=min(filtered_rows, size),
            scanned_bytes=scanned_bytes,
            malformed_rows=malformed_rows,
            truncated=truncated,
        )

    def _trace_item(
        self,
        row: dict,
        *,
        role: str | None,
        status: str | None,
        session_id: str | None,
    ) -> TraceListItem | None:
        response = self._record(row.get("response"))
        trace = self._record(row.get("aiTrace")) or self._record(response.get("trace"))
        row_role = trace.get("role") or row.get("endpoint")
        if session_id and trace.get("sessionId") != session_id:
            return None
        if role and row_role != role:
            return None
        if status and row.get("status") != status:
            return None
        error = self._record(row.get("error"))
        return TraceListItem(
            id=trace.get("id"),
            timestamp=str(trace.get("createdAt") or row.get("timestamp") or ""),
            endpoint=str(trace.get("endpoint") or row.get("endpoint") or ""),
            status=str(trace.get("status") or row.get("status") or ""),
            sessionId=trace.get("sessionId"),
            turnId=trace.get("turnId"),
            actorCharacterId=trace.get("actorCharacterId"),
            role=trace.get("role") or row.get("endpoint"),
            provider=trace.get("provider"),
            model=trace.get("model"),
            promptVersion=trace.get("promptVersion"),
            latencyMs=trace.get("latencyMs"),
            attempts=trace.get("attempts"),
            failureType=trace.get("failureType") or error.get("failure_type"),
            finishReason=trace.get("finishReason"),
            providerRequestId=trace.get("providerRequestId"),
            diagnosticRef=trace.get("diagnosticRef") or row.get("diagnosticRef"),
        )
