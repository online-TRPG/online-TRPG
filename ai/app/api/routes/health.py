from fastapi import APIRouter

from app.core.config import get_settings


router = APIRouter(tags=["health"])


@router.get("/internal/ai/health")
def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "provider": settings.ai_provider,
        "defaultModel": settings.ai_model_default,
        "hasApiKey": bool(settings.google_api_key),
    }
