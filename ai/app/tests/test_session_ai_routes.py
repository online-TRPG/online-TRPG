import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/v1/sessions/session-1/ai/hint"),
        ("POST", "/api/v1/sessions/session-1/ai/npc-dialogue"),
        ("POST", "/api/v1/sessions/session-1/ai/narration"),
        ("POST", "/api/v1/sessions/session-1/ai/summary"),
        ("GET", "/api/v1/sessions/session-1/ai-traces"),
    ],
)
def test_product_session_ai_routes_are_not_registered(method: str, path: str):
    response = TestClient(app).request(method, path, json={})
    assert response.status_code == 404
