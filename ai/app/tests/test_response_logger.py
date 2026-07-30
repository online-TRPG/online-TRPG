import json

import pytest

from app.core.config import Settings
from app.core.errors import AiClientError
from app.core.response_logger import HarnessResponseLogger
from app.services.trace_service import AiTraceService


def _trace_payload(index: int) -> dict:
    return {
        "parsed": {"content": "x" * 200},
        "rawOutput": "secret raw payload",
        "fallback": False,
        "trace": {
            "role": "director",
            "provider": "test",
            "model": "test-model",
            "promptVersion": "director.v1.md",
            "latencyMs": index,
            "providerLatencyMs": index,
            "attemptLatenciesMs": [index],
            "schemaValidationRetries": 0,
            "attempts": 1,
            "failureType": None,
            "promptTokenCount": 10,
            "outputTokenCount": 2,
            "totalTokenCount": 12,
        },
    }


def test_response_logger_rotates_and_omits_payloads_by_default(tmp_path):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_log_max_bytes=64 * 1024,
        ai_log_backup_count=2,
        ai_log_payloads=False,
    )
    logger = HarnessResponseLogger(settings)
    for index in range(300):
        logger.log_success(
            endpoint="director",
            request_payload={"sessionId": "session-1", "question": "secret"},
            response_payload=_trace_payload(index),
        )

    history_files = list(tmp_path.glob("harness_history.jsonl*"))
    assert len(history_files) <= 3
    assert all(
        path.stat().st_size <= settings.ai_log_max_bytes for path in history_files
    )
    assert sum(path.stat().st_size for path in history_files) <= (
        settings.ai_log_max_bytes * (settings.ai_log_backup_count + 1)
    )
    latest = json.loads((tmp_path / "director.latest.json").read_text(encoding="utf-8"))
    assert latest["request"] == {"sessionId": "session-1"}
    assert "parsed" not in latest["response"]
    assert "rawOutput" not in latest["response"]
    assert latest["aiTrace"]["totalTokenCount"] == 12


def test_response_logger_compacts_one_event_larger_than_file_limit(tmp_path):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_log_max_bytes=64 * 1024,
        ai_log_backup_count=1,
        ai_log_payloads=True,
    )
    logger = HarnessResponseLogger(settings)

    logger.log_success(
        endpoint="director",
        request_payload={"sessionId": "session-1", "question": "x" * (80 * 1024)},
        response_payload={**_trace_payload(1), "parsed": {"content": "y" * (80 * 1024)}},
    )

    history = tmp_path / "harness_history.jsonl"
    latest = tmp_path / "director.latest.json"
    assert history.stat().st_size <= settings.ai_log_max_bytes
    assert latest.stat().st_size <= settings.ai_log_max_bytes
    event = json.loads(latest.read_text(encoding="utf-8"))
    assert event["payloadTruncated"] is True
    assert event["request"] == {"sessionId": "session-1"}
    assert "parsed" not in event["response"]


def test_response_logger_restores_bounds_after_settings_are_reduced(tmp_path):
    max_bytes = 64 * 1024
    history = tmp_path / "harness_history.jsonl"
    history.write_bytes(b"x" * (max_bytes + 1))
    (tmp_path / "harness_history.jsonl.1").write_bytes(b"x" * (max_bytes + 1))
    (tmp_path / "harness_history.jsonl.2").write_text("{}\n", encoding="utf-8")
    (tmp_path / "director.latest.json").write_bytes(b"x" * (max_bytes + 1))
    unrelated = tmp_path / "harness_history.jsonl.notes"
    unrelated.write_text("keep", encoding="utf-8")
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_log_max_bytes=max_bytes,
        ai_log_backup_count=1,
        ai_log_payloads=False,
    )

    HarnessResponseLogger(settings).log_success(
        endpoint="director",
        request_payload={"sessionId": "session-1"},
        response_payload=_trace_payload(1),
    )

    history_files = list(tmp_path.glob("harness_history.jsonl*"))
    bounded_history_files = [
        path for path in history_files if path == history or path.name.removeprefix(
            "harness_history.jsonl."
        ).isdigit()
    ]
    assert all(path.stat().st_size <= max_bytes for path in bounded_history_files)
    assert all(
        path == history
        or int(path.name.removeprefix("harness_history.jsonl.")) <= 1
        for path in bounded_history_files
    )
    assert sum(path.stat().st_size for path in bounded_history_files) <= max_bytes * 2
    assert (tmp_path / "director.latest.json").stat().st_size <= max_bytes
    assert unrelated.read_text(encoding="utf-8") == "keep"


def test_response_logger_always_bounds_provider_error_messages(tmp_path):
    settings = Settings(ai_log_dir=str(tmp_path), ai_log_payloads=False)
    logger = HarnessResponseLogger(settings)

    logger.log_failure(
        endpoint="director",
        request_payload={"sessionId": "session-1"},
        error=AiClientError(
            "provider detail\n" + ("x" * 5000),
            "upstream_error",
            True,
        ),
    )

    event = json.loads((tmp_path / "director.latest.json").read_text(encoding="utf-8"))
    assert len(event["error"]["message"]) == 1000
    assert event["request"] == {"sessionId": "session-1"}


def test_response_logger_serialization_failure_does_not_escape(tmp_path):
    settings = Settings(ai_log_dir=str(tmp_path), ai_log_payloads=True)
    logger = HarnessResponseLogger(settings)

    result = logger.log_success(
        endpoint="director",
        request_payload={"sessionId": "session-1", "invalid": object()},
        response_payload=_trace_payload(1),
    )

    assert result == {}


def test_trace_reader_skips_malformed_rows_inside_bounded_tail(tmp_path):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_trace_scan_max_bytes=64 * 1024,
    )
    history = tmp_path / "harness_history.jsonl"
    history.write_text(
        "not-json\n"
        + json.dumps(
            {
                "timestamp": "2026-07-15T00:00:00Z",
                "endpoint": "director",
                "status": "success",
                "aiTrace": {"role": "director", "attempts": 1},
            }
        )
        + "\n",
        encoding="utf-8",
    )

    result = AiTraceService(settings, HarnessResponseLogger(settings)).list_traces()

    assert result.total == 1
    assert result.filtered == 1
    assert result.malformedRows == 1
    assert result.scannedBytes == history.stat().st_size
    assert result.scanTruncated is False
    assert result.items[0].role == "director"


def test_trace_reader_scans_rotated_files_with_one_total_byte_budget(tmp_path):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_log_backup_count=2,
        ai_trace_scan_max_bytes=64 * 1024,
    )
    current = tmp_path / "harness_history.jsonl"
    backup = tmp_path / "harness_history.jsonl.1"
    backup.write_text(
        json.dumps(
            {
                "timestamp": "2026-07-15T00:00:00Z",
                "endpoint": "actor",
                "status": "success",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    current.write_text(
        json.dumps(
            {
                "timestamp": "2026-07-15T00:01:00Z",
                "endpoint": "director",
                "status": "success",
            }
        )
        + "\n",
        encoding="utf-8",
    )

    service = AiTraceService(settings, HarnessResponseLogger(settings))
    response = service.list_traces(size=10)

    assert [item.endpoint for item in response.items] == ["director", "actor"]
    assert response.total == 2
    assert response.scannedBytes == current.stat().st_size + backup.stat().st_size
    assert response.scanTruncated is False


def test_trace_reader_skips_schema_invalid_json_rows(tmp_path):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_trace_scan_max_bytes=64 * 1024,
    )
    history = tmp_path / "harness_history.jsonl"
    history.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "timestamp": "2026-07-15T00:00:00Z",
                        "endpoint": "director",
                        "status": "unknown-status",
                        "response": [],
                        "error": "not-an-object",
                    }
                ),
                json.dumps(
                    {
                        "timestamp": "2026-07-15T00:01:00Z",
                        "endpoint": "actor",
                        "status": "success",
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    response = AiTraceService(settings, HarnessResponseLogger(settings)).list_traces()

    assert [item.endpoint for item in response.items] == ["actor"]
    assert response.filtered == 1
    assert response.malformedRows == 1


def test_local_preflight_fallback_is_not_a_schema_retry_sample(tmp_path):
    settings = Settings(ai_log_dir=str(tmp_path))
    service = AiTraceService(settings, HarnessResponseLogger(settings))

    trace = service.fallback_trace(
        role="director",
        error=AiClientError(
            "missing config",
            "config",
            False,
            status_code=503,
            attempts=0,
        ),
    )

    assert trace["attempts"] == 0
    assert trace["schemaValidationRetries"] is None


def test_provider_failure_before_output_validation_is_not_a_schema_retry_sample(tmp_path):
    settings = Settings(ai_log_dir=str(tmp_path))
    service = AiTraceService(settings, HarnessResponseLogger(settings))

    trace = service.fallback_trace(
        role="director",
        error=AiClientError(
            "provider timeout",
            "timeout",
            False,
            status_code=504,
            attempts=1,
            attempt_latencies_ms=[1000],
        ),
    )

    assert trace["attempts"] == 1
    assert trace["schemaValidationRetries"] is None


@pytest.mark.parametrize("row_count", [1, 1_000, 100_000])
def test_trace_reader_stops_after_requested_latest_size_at_scale(tmp_path, row_count):
    settings = Settings(
        ai_log_dir=str(tmp_path),
        ai_trace_scan_max_bytes=2 * 1024 * 1024,
    )
    history = tmp_path / "harness_history.jsonl"
    with history.open("w", encoding="utf-8") as stream:
        for index in range(row_count):
            stream.write(
                json.dumps(
                {
                    "timestamp": "2026-07-15T00:00:00Z",
                    "endpoint": "director",
                    "status": "success",
                    "diagnosticRef": f"harness_history.jsonl#trace-{index}",
                }
            )
                + "\n"
            )

    response = AiTraceService(settings, HarnessResponseLogger(settings)).list_traces(size=1)

    assert len(response.items) == 1
    assert response.items[0].diagnosticRef == f"harness_history.jsonl#trace-{row_count - 1}"
    assert response.scannedBytes <= 8 * 1024
    assert response.scanTruncated is (row_count > 1)
