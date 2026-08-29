import threading
import time

import pytest
from pydantic import BaseModel

from app.clients.google_ai_studio import GeneratedJsonResult, GoogleAiStudioClient
from app.core.config import Settings
from app.core.errors import AiClientError
from app.services import provider_execution, role_runner
from app.services.fallback_policy import AiFallbackPolicy
from app.services.role_runner import AiRoleRunner


class _Request(BaseModel):
    sessionId: str


class _Trace(BaseModel):
    latencyMs: int


class _Response(BaseModel):
    trace: _Trace


class _CapturingLogger:
    def __init__(self):
        self.response_payload = None

    def log_success(self, **kwargs):
        self.response_payload = kwargs["response_payload"]
        return {}


class _UnusedTraceService:
    def log_fallback_response(self, **kwargs):
        return kwargs["response"]


def test_role_runner_returned_latency_includes_diagnostic_logging(monkeypatch):
    elapsed_values = iter((10, 35))
    monkeypatch.setattr(
        role_runner,
        "role_elapsed_ms",
        lambda _started_at: next(elapsed_values),
    )
    logger = _CapturingLogger()
    runner = AiRoleRunner(
        response_logger=logger,
        fallback_policy=AiFallbackPolicy(),
        trace_service=_UnusedTraceService(),
    )

    response = runner.run(
        endpoint="director",
        request=_Request(sessionId="session-1"),
        run_service=lambda _request: _Response(trace=_Trace(latencyMs=5)),
        build_fallback_response=lambda _error: None,
    )

    assert logger.response_payload["trace"]["latencyMs"] == 10
    assert response.trace.latencyMs == 35


def test_role_runner_fallback_latency_includes_diagnostic_logging(monkeypatch):
    elapsed_values = iter((10, 20, 40))
    monkeypatch.setattr(
        role_runner,
        "role_elapsed_ms",
        lambda _started_at: next(elapsed_values),
    )
    runner = AiRoleRunner(
        response_logger=_CapturingLogger(),
        fallback_policy=AiFallbackPolicy(),
        trace_service=_UnusedTraceService(),
    )

    response = runner.run(
        endpoint="director",
        request=_Request(sessionId="session-1"),
        run_service=lambda _request: (_ for _ in ()).throw(
            AiClientError("provider timeout", "timeout", False, 504)
        ),
        build_fallback_response=lambda _error: _Response(trace=_Trace(latencyMs=0)),
    )

    assert response.trace.latencyMs == 40


def test_slow_provider_wall_clock_falls_back_within_total_deadline_without_workers():
    settings = Settings(
        ai_timeout_ms=1_000,
        ai_max_retries=1,
        ai_retry_base_delay_ms=0,
        ai_retry_max_delay_ms=0,
        ai_retry_jitter_ms=0,
    )
    provider_calls = 0
    fallback_calls = 0
    threads_before = {thread.ident for thread in threading.enumerate()}
    runner = AiRoleRunner(
        response_logger=_CapturingLogger(),
        fallback_policy=AiFallbackPolicy(),
        trace_service=_UnusedTraceService(),
    )

    def run_slow_provider(_request: _Request) -> _Response:
        def request_once(remaining_ms: int) -> GeneratedJsonResult:
            nonlocal provider_calls
            provider_calls += 1
            # A real SDK call receives this same remaining deadline. Sleeping
            # for exactly that allowance models a network timeout without
            # creating a worker thread that could survive the response.
            time.sleep(remaining_ms / 1_000)
            raise AiClientError(
                "slow provider timed out",
                "timeout",
                True,
                504,
            )

        execution = provider_execution.execute_provider_request(
            settings=settings,
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
        return _Response(trace=_Trace(latencyMs=execution.latency_ms))

    def build_fallback(_error: AiClientError) -> _Response:
        nonlocal fallback_calls
        fallback_calls += 1
        return _Response(trace=_Trace(latencyMs=0))

    started_at = time.monotonic()
    response = runner.run(
        endpoint="director",
        request=_Request(sessionId="session-1"),
        run_service=run_slow_provider,
        build_fallback_response=build_fallback,
    )
    elapsed_seconds = time.monotonic() - started_at

    assert provider_calls == 1
    assert fallback_calls == 1
    assert 0.9 <= elapsed_seconds < 1.5
    assert 900 <= response.trace.latencyMs < 1_500
    assert {thread.ident for thread in threading.enumerate()} == threads_before


@pytest.mark.parametrize(
    ("provider_error", "failure_type", "status_code", "expected_calls"),
    [
        (
            Exception("400 INVALID_ARGUMENT: rejected request"),
            "provider_request",
            502,
            1,
        ),
        (Exception("404 NOT_FOUND: model missing"), "config", 503, 1),
        (Exception("409 ABORTED: request conflict"), "provider_request", 502, 1),
        (Exception("401 UNAUTHORIZED: invalid API key"), "auth", 503, 1),
        (Exception("403 PERMISSION_DENIED: invalid API key"), "auth", 503, 1),
        (Exception("408 REQUEST_TIMEOUT: request expired"), "timeout", 504, 2),
        (Exception("429 TOO_MANY_REQUESTS: rate limited"), "rate_limit", 429, 1),
        (Exception("503 RESOURCE_EXHAUSTED: quota exceeded"), "quota", 429, 1),
        (ConnectionError("network connection reset"), "network", 503, 2),
        (Exception("500 INTERNAL: upstream failed"), "upstream_error", 502, 2),
    ],
)
def test_provider_error_injection_keeps_classification_call_limit_and_fallback(
    provider_error: Exception,
    failure_type: str,
    status_code: int,
    expected_calls: int,
):
    settings = Settings(
        ai_timeout_ms=1_000,
        ai_max_retries=1,
        ai_retry_base_delay_ms=0,
        ai_retry_max_delay_ms=0,
        ai_retry_jitter_ms=0,
    )
    provider_calls = 0
    fallback_errors: list[AiClientError] = []
    runner = AiRoleRunner(
        response_logger=_CapturingLogger(),
        fallback_policy=AiFallbackPolicy(),
        trace_service=_UnusedTraceService(),
    )

    def run_provider(_request: _Request) -> _Response:
        def request_once(_remaining_ms: int) -> GeneratedJsonResult:
            nonlocal provider_calls
            provider_calls += 1
            raise GoogleAiStudioClient._classify_exception(provider_error)

        execution = provider_execution.execute_provider_request(
            settings=settings,
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
        return _Response(trace=_Trace(latencyMs=execution.latency_ms))

    response = runner.run(
        endpoint="director",
        request=_Request(sessionId="session-1"),
        run_service=run_provider,
        build_fallback_response=lambda error: (
            fallback_errors.append(error)
            or _Response(trace=_Trace(latencyMs=error.latency_ms))
        ),
    )

    assert provider_calls == expected_calls
    assert len(fallback_errors) == 1
    assert fallback_errors[0].failure_type == failure_type
    assert fallback_errors[0].status_code == status_code
    assert fallback_errors[0].attempts == expected_calls
    assert response.trace.latencyMs >= fallback_errors[0].latency_ms
