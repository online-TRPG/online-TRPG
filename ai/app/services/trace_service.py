import json

from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.schemas.harness import TraceListItem, TraceListResponse


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
            "latencyMs": 0,
            "attempts": max(1, error.attempts),
            "failureType": error.failure_type,
            "finishReason": "FALLBACK",
            "providerRequestId": None,
        }

    def log_fallback_response(
        self,
        *,
        endpoint: str,
        request_payload: dict,
        response,
        error: AiClientError,
    ):
        log_paths = self._response_logger.log_fallback(
            endpoint=endpoint,
            request_payload=request_payload,
            response_payload=response.model_dump(),
            error=error,
        )
        response.logPaths = log_paths
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
        if not history_path.exists():
            return TraceListResponse(items=[], total=0, filtered=0)

        rows = [
            json.loads(line)
            for line in history_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        filtered_rows = []
        for row in rows:
            trace = row.get("aiTrace") or (row.get("response") or {}).get("trace") or {}
            row_role = trace.get("role") or row.get("endpoint")
            if session_id and trace.get("sessionId") != session_id:
                continue
            if role and row_role != role:
                continue
            if status and row.get("status") != status:
                continue
            filtered_rows.append(row)

        selected = filtered_rows[-size:]
        items = []
        for row in reversed(selected):
            trace = row.get("aiTrace") or (row.get("response") or {}).get("trace") or {}
            error = row.get("error") or {}
            items.append(
                TraceListItem(
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
                    logPaths=trace.get("logPaths") or row.get("logPaths"),
                )
            )
        return TraceListResponse(items=items, total=len(rows), filtered=len(filtered_rows))
