from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.harness import SummarizerHarnessRequest
from app.services.harness import get_ai_harness_service
from test_harness_service import build_service


def test_session_ai_hint_route_logs_session_trace():
    log_dir = Path("runtime_logs_test") / "session_ai_hint"
    log_dir.mkdir(parents=True, exist_ok=True)
    for path in log_dir.glob("*"):
        if path.is_file():
            path.unlink()

    service, _fake_client = build_service(log_dir)
    app.dependency_overrides[get_ai_harness_service] = lambda: service

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/sessions/session-1/ai/hint",
            json={
                "hintLevel": "NORMAL",
                "question": "다음에 뭘 하면 좋을까?",
                "sceneSummary": "낡은 석문 앞. 손잡이는 차갑고 바닥에는 긁힌 자국이 있다.",
                "recentLogs": ["손잡이를 당겼지만 열리지 않았다."],
                "publicClues": ["바닥 긁힌 자국", "문틈의 먼지"],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["parsed"]["hintLevel"] == "NORMAL"

    traces = service.list_traces(session_id="session-1", role="director")
    assert traces.filtered == 1
    assert traces.items[0].sessionId == "session-1"
    assert traces.items[0].role == "director"


def test_session_ai_trace_route_filters_by_session_id():
    log_dir = Path("runtime_logs_test") / "session_ai_trace_filter"
    log_dir.mkdir(parents=True, exist_ok=True)
    for path in log_dir.glob("*"):
        if path.is_file():
            path.unlink()

    service, _fake_client = build_service(log_dir)
    service.run_summarizer(
        SummarizerHarnessRequest(
            sessionId="session-1",
            logs=["석문은 아직 열리지 않았다."],
        )
    )
    service.run_summarizer(
        SummarizerHarnessRequest(
            sessionId="session-2",
            logs=["고블린이 물러났다."],
        )
    )
    app.dependency_overrides[get_ai_harness_service] = lambda: service

    try:
        client = TestClient(app)
        response = client.get("/api/v1/sessions/session-2/ai-traces?role=summarizer")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["filtered"] == 1
    assert body["items"][0]["sessionId"] == "session-2"
