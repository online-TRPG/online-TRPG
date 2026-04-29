"""Route registration tests for /internal/ai/* path realignment.

Verifies API spec AI-SERVER-001~007 are exposed under the new prefix and
the legacy /api/harness/* paths return 404.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/internal/ai/health"),
        ("POST", "/internal/ai/smoke"),
        ("POST", "/internal/ai/interpreter"),
        ("POST", "/internal/ai/narrator"),
        ("POST", "/internal/ai/director"),
        ("POST", "/internal/ai/summarizer"),
        ("POST", "/internal/ai/actor"),
        ("POST", "/internal/ai/npc-dialogue"),
        ("GET", "/internal/ai/traces"),
    ],
)
def test_route_is_registered(client: TestClient, method: str, path: str):
    routes = {(r.path, tuple(sorted(r.methods))) for r in app.routes if hasattr(r, "methods")}
    assert any(p == path and method in m for p, m in routes), f"{method} {path} not registered"


def test_health_returns_ok(client: TestClient):
    response = client.get("/internal/ai/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


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
