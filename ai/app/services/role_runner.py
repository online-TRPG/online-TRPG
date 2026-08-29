from collections.abc import Callable
from typing import TypeVar

from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.services.fallback_policy import AiFallbackPolicy
from app.services.provider_execution import role_elapsed_ms, role_request_timing
from app.services.trace_service import AiTraceService

RequestT = TypeVar("RequestT")
ResponseT = TypeVar("ResponseT")


class AiRoleRunner:
    def __init__(
        self,
        *,
        response_logger: HarnessResponseLogger,
        fallback_policy: AiFallbackPolicy,
        trace_service: AiTraceService,
    ):
        self._response_logger = response_logger
        self._fallback_policy = fallback_policy
        self._trace_service = trace_service

    def run(
        self,
        *,
        endpoint: str,
        request: RequestT,
        run_service: Callable[[RequestT], ResponseT],
        build_fallback_response: Callable[[AiClientError], ResponseT],
    ) -> ResponseT:
        with role_request_timing() as started_at:
            request_payload = request.model_dump()
            try:
                response = run_service(request)
            except AiClientError as exc:
                exc.latency_ms = max(exc.latency_ms, role_elapsed_ms(started_at))
                if not self._fallback_policy.should_fallback(exc):
                    raise
                fallback_response = build_fallback_response(exc)
                fallback_response.trace.latencyMs = max(
                    fallback_response.trace.latencyMs,
                    role_elapsed_ms(started_at),
                )
                fallback_response = self._trace_service.log_fallback_response(
                    endpoint=endpoint,
                    request_payload=request_payload,
                    response=fallback_response,
                    error=exc,
                )
                fallback_response.trace.latencyMs = max(
                    fallback_response.trace.latencyMs,
                    role_elapsed_ms(started_at),
                )
                exc.latency_ms = max(exc.latency_ms, fallback_response.trace.latencyMs)
                return fallback_response

            response.trace.latencyMs = max(
                response.trace.latencyMs,
                role_elapsed_ms(started_at),
            )
            response_payload = response.model_dump()
            diagnostic_raw_output = getattr(response, "_diagnostic_raw_output", "")
            if diagnostic_raw_output:
                response_payload["rawOutput"] = diagnostic_raw_output
            self._response_logger.log_success(
                endpoint=endpoint,
                request_payload=request_payload,
                response_payload=response_payload,
            )
            # Product trace/DB latency includes best-effort diagnostic I/O. The
            # JSONL record itself remains a pre-write diagnostic snapshot.
            response.trace.latencyMs = max(
                response.trace.latencyMs,
                role_elapsed_ms(started_at),
            )
            return response
