from collections.abc import Callable
from typing import TypeVar

from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.services.fallback_policy import AiFallbackPolicy
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
        request_payload = request.model_dump()
        try:
            response = run_service(request)
        except AiClientError as exc:
            if not self._fallback_policy.should_fallback(exc):
                raise
            return self._trace_service.log_fallback_response(
                endpoint=endpoint,
                request_payload=request_payload,
                response=build_fallback_response(exc),
                error=exc,
            )

        log_paths = self._response_logger.log_success(
            endpoint=endpoint,
            request_payload=request_payload,
            response_payload=response.model_dump(),
        )
        response.logPaths = log_paths
        return response
