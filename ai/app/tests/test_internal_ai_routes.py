"""Route registration tests for /internal/ai/* path realignment.

Verifies API spec AI-SERVER-001~007 are exposed under the new prefix and
the legacy /api/harness/* paths return 404.
"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.api.routes import harness as harness_routes
from app.api.routes import health as health_routes
from app.core.config import Settings
from app.core.errors import AiClientError
from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/internal/ai/health"),
        ("GET", "/internal/ai/health/live"),
        ("GET", "/internal/ai/health/ready"),
        ("POST", "/internal/ai/smoke"),
        ("POST", "/internal/ai/interpreter"),
        ("POST", "/internal/ai/narrator"),
        ("POST", "/internal/ai/director"),
        ("POST", "/internal/ai/summarizer"),
        ("POST", "/internal/ai/actor"),
        ("POST", "/internal/ai/npc-dialogue"),
        ("POST", "/internal/ai/check-result"),
        ("GET", "/internal/ai/traces"),
    ],
)
def test_route_is_registered(client: TestClient, method: str, path: str):
    routes = {(r.path, tuple(sorted(r.methods))) for r in app.routes if hasattr(r, "methods")}
    assert any(p == path and method in m for p, m in routes), f"{method} {path} not registered"


def test_live_health_returns_ok(client: TestClient):
    response = client.get("/internal/ai/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readiness_rejects_missing_api_key(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        health_routes,
        "get_settings",
        lambda: Settings(google_api_key=None),
    )
    assert client.get("/internal/ai/health/ready").status_code == 503
    assert client.get("/internal/ai/health").status_code == 503


def test_readiness_accepts_valid_configuration(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        health_routes,
        "get_settings",
        lambda: Settings(google_api_key="test-key"),
    )
    response = client.get("/internal/ai/health/ready")
    assert response.status_code == 200
    assert response.json()["hasApiKey"] is True


def test_common_role_route_logs_failure_before_building_error_detail(monkeypatch):
    class Request(BaseModel):
        sessionId: str

    class Service:
        logged = None

        def log_failure(self, endpoint, request_payload, error):
            self.logged = (endpoint, request_payload, error)

    clock = iter((1.0, 2.0))
    monkeypatch.setattr(harness_routes.time, "monotonic", lambda: next(clock))
    service = Service()
    error = AiClientError(
        "provider rejected generated request",
        "provider_request",
        False,
        502,
        latency_ms=10,
    )

    with pytest.raises(HTTPException) as caught:
        harness_routes._run_with_failure_trace(
            endpoint="director",
            request=Request(sessionId="session-1"),
            service=service,
            run=lambda _request: (_ for _ in ()).throw(error),
        )

    assert service.logged == (
        "director",
        {"sessionId": "session-1"},
        error,
    )
    assert caught.value.status_code == 502
    assert caught.value.detail["latencyMs"] == 1_010


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/health"),
        ("POST", "/api/harness/smoke"),
        ("POST", "/api/harness/interpreter"),
        ("POST", "/api/harness/narrator"),
        ("POST", "/api/harness/director"),
        ("POST", "/api/harness/summarizer"),
        ("POST", "/api/harness/actor"),
        ("POST", "/api/harness/npc-dialogue"),
        ("GET", "/api/harness/traces"),
    ],
)
def test_legacy_path_is_gone(client: TestClient, method: str, path: str):
    response = client.request(method, path, json={})
    assert response.status_code == 404, f"{method} {path} should be 404 after rename"
