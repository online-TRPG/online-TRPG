from app.clients.google_ai_studio import GeneratedJsonResult
from app.core.config import Settings
from app.core.errors import AiClientError
from app.services import provider_execution


def _result(payload: dict) -> GeneratedJsonResult:
    return GeneratedJsonResult(
        raw_text="{}",
        parsed_json=payload,
        model="test-model",
        provider="test-provider",
        latency_ms=1,
    )


def test_retry_attempts_share_one_total_deadline(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(provider_execution.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(
        provider_execution.time,
        "sleep",
        lambda seconds: clock.__setitem__(0, clock[0] + seconds),
    )
    settings = Settings(
        ai_timeout_ms=1_000,
        ai_max_retries=1,
        ai_retry_base_delay_ms=100,
        ai_retry_max_delay_ms=100,
        ai_retry_jitter_ms=0,
    )
    calls: list[int] = []

    def request_once(remaining_ms: int) -> GeneratedJsonResult:
        calls.append(remaining_ms)
        clock[0] += 0.4 if len(calls) == 1 else 0.6
        raise AiClientError("temporary", "upstream_error", True, 502)

    try:
        provider_execution.execute_provider_request(
            settings=settings,
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
        raise AssertionError("deadline error expected")
    except AiClientError as error:
        assert error.failure_type == "timeout"
        assert error.attempts == 2
        assert error.schema_validation_retries is None
        assert 1_099 <= error.latency_ms <= 1_100
        assert len(calls) == 2
        assert calls[0] <= 1_000
        assert calls[1] < calls[0]


def test_schema_validation_retries_are_counted():
    settings = Settings(
        ai_timeout_ms=1_000,
        ai_max_retries=1,
        ai_retry_base_delay_ms=0,
        ai_retry_max_delay_ms=0,
        ai_retry_jitter_ms=0,
    )
    calls = 0

    def parse_response(result: GeneratedJsonResult) -> dict:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ValueError("bad schema")
        return result.parsed_json

    execution = provider_execution.execute_provider_request(
        settings=settings,
        request_once=lambda _: _result({"ok": True}),
        parse_response=parse_response,
        validation_error_prefix="invalid",
    )

    assert execution.attempts == 2
    assert execution.schema_validation_retries == 1


def test_two_invalid_outputs_report_one_schema_retry():
    try:
        provider_execution.execute_provider_request(
            settings=Settings(
                ai_timeout_ms=1_000,
                ai_max_retries=1,
                ai_retry_base_delay_ms=0,
                ai_retry_max_delay_ms=0,
                ai_retry_jitter_ms=0,
            ),
            request_once=lambda _: _result({"ok": False}),
            parse_response=lambda _result: (_ for _ in ()).throw(
                ValueError("bad schema")
            ),
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "schema_validation"
        assert error.attempts == 2
        assert error.schema_validation_retries == 1
    else:
        raise AssertionError("schema validation error expected")


def test_invalid_output_without_follow_up_attempt_reports_zero_schema_retries():
    try:
        provider_execution.execute_provider_request(
            settings=Settings(ai_timeout_ms=1_000, ai_max_retries=0),
            request_once=lambda _: _result({"ok": False}),
            parse_response=lambda _result: (_ for _ in ()).throw(
                ValueError("bad schema")
            ),
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "schema_validation"
        assert error.attempts == 1
        assert error.schema_validation_retries == 0
    else:
        raise AssertionError("schema validation error expected")


def test_role_preprocessing_time_is_part_of_deadline_and_latency(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(provider_execution.time, "monotonic", lambda: clock[0])
    remaining: list[int] = []

    with provider_execution.role_request_timing():
        clock[0] += 0.2

        def request_once(remaining_ms: int) -> GeneratedJsonResult:
            remaining.append(remaining_ms)
            clock[0] += 0.1
            return _result({"ok": True})

        execution = provider_execution.execute_provider_request(
            settings=Settings(ai_timeout_ms=1_000, ai_max_retries=0),
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )

    assert 799 <= remaining[0] <= 800
    assert 299 <= execution.latency_ms <= 300


def test_local_preflight_failure_does_not_count_as_provider_attempt():
    settings = Settings(ai_timeout_ms=1_000, ai_max_retries=1)

    try:
        provider_execution.execute_provider_request(
            settings=settings,
            request_once=lambda _remaining: (_ for _ in ()).throw(
                AiClientError("missing config", "config", False, 503, attempts=0)
            ),
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.attempts == 0
        assert error.attempt_latencies_ms == []
        assert error.schema_validation_retries is None
    else:
        raise AssertionError("config error expected")


def test_provider_rejected_request_is_not_retried():
    calls = 0

    def request_once(_remaining_ms: int) -> GeneratedJsonResult:
        nonlocal calls
        calls += 1
        raise AiClientError(
            "provider rejected generated request",
            "provider_request",
            False,
            502,
        )

    try:
        provider_execution.execute_provider_request(
            settings=Settings(ai_timeout_ms=1_000, ai_max_retries=1),
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "provider_request"
        assert error.attempts == 1
        assert len(error.attempt_latencies_ms) == 1
        assert error.schema_validation_retries is None
    else:
        raise AssertionError("provider request error expected")

    assert calls == 1


def test_provider_success_returned_after_deadline_is_discarded(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(provider_execution.time, "monotonic", lambda: clock[0])

    def request_once(_remaining_ms: int) -> GeneratedJsonResult:
        clock[0] += 1.1
        return _result({"ok": True})

    try:
        provider_execution.execute_provider_request(
            settings=Settings(ai_timeout_ms=1_000, ai_max_retries=1),
            request_once=request_once,
            parse_response=lambda result: result.parsed_json,
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "timeout"
        assert error.attempts == 1
        assert len(error.attempt_latencies_ms) == 1
        assert error.schema_validation_retries == 0
        assert 1_099 <= error.attempt_latencies_ms[0] <= 1_100
    else:
        raise AssertionError("late success must not escape the total deadline")


def test_provider_failure_after_schema_retry_keeps_the_observed_retry_count():
    calls = 0

    def request_once(_remaining_ms: int) -> GeneratedJsonResult:
        nonlocal calls
        calls += 1
        if calls == 1:
            return _result({"ok": False})
        raise AiClientError("temporary network failure", "network", False, 503)

    def parse_response(result: GeneratedJsonResult) -> dict:
        if result.parsed_json["ok"] is False:
            raise ValueError("bad schema")
        return result.parsed_json

    try:
        provider_execution.execute_provider_request(
            settings=Settings(
                ai_timeout_ms=1_000,
                ai_max_retries=1,
                ai_retry_base_delay_ms=0,
                ai_retry_max_delay_ms=0,
                ai_retry_jitter_ms=0,
            ),
            request_once=request_once,
            parse_response=parse_response,
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "network"
        assert error.attempts == 2
        assert error.schema_validation_retries == 1
    else:
        raise AssertionError("network error expected")


def test_schema_retry_that_fails_before_provider_call_is_not_counted():
    calls = 0

    def request_once(_remaining_ms: int) -> GeneratedJsonResult:
        nonlocal calls
        calls += 1
        if calls == 1:
            return _result({"ok": False})
        raise AiClientError(
            "provider config became unavailable",
            "config",
            False,
            503,
            attempts=0,
        )

    def parse_response(result: GeneratedJsonResult) -> dict:
        if result.parsed_json["ok"] is False:
            raise ValueError("bad schema")
        return result.parsed_json

    try:
        provider_execution.execute_provider_request(
            settings=Settings(
                ai_timeout_ms=1_000,
                ai_max_retries=1,
                ai_retry_base_delay_ms=0,
                ai_retry_max_delay_ms=0,
                ai_retry_jitter_ms=0,
            ),
            request_once=request_once,
            parse_response=parse_response,
            validation_error_prefix="invalid",
        )
    except AiClientError as error:
        assert error.failure_type == "config"
        assert error.attempts == 1
        assert len(error.attempt_latencies_ms) == 1
        assert error.schema_validation_retries == 0
    else:
        raise AssertionError("config error expected")
