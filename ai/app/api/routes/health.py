from fastapi import APIRouter, HTTPException

from app.core.config import Settings, get_settings


router = APIRouter(tags=["health"])


@router.get("/internal/ai/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/internal/ai/health/ready")
def ready() -> dict[str, str | bool]:
    settings = get_settings()
    problems = readiness_problems(settings)
    if problems:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "provider": settings.ai_provider,
                "problems": problems,
            },
        )
    return {
        "status": "ok",
        "provider": settings.ai_provider,
        "defaultModel": settings.ai_model_default,
        "hasApiKey": True,
    }


def readiness_problems(settings: Settings) -> list[str]:
    """Return sanitized capability failures safe for health responses and startup logs."""

    problems: list[str] = []
    if settings.ai_provider != "google-ai-studio":
        problems.append("unsupported AI_PROVIDER")
    if not settings.google_api_key or not settings.google_api_key.strip():
        problems.append("GOOGLE_API_KEY is not configured")
    if not settings.ai_model_default.strip():
        problems.append("AI_MODEL_DEFAULT is not configured")
    try:
        from google.genai import types as genai_types
    except ImportError:
        problems.append("google-genai is not installed")
    except Exception:
        problems.append("google-genai failed to import")
    else:
        http_options = getattr(genai_types, "HttpOptions", None)
        retry_options = getattr(genai_types, "HttpRetryOptions", None)
        generate_config = getattr(genai_types, "GenerateContentConfig", None)
        if http_options is None:
            problems.append("google-genai HttpOptions is unavailable")
        elif not {"timeout", "retry_options"}.issubset(
            getattr(http_options, "model_fields", {})
        ):
            problems.append("google-genai timeout/retry controls are unavailable")
        if retry_options is None or "attempts" not in getattr(retry_options, "model_fields", {}):
            problems.append("google-genai HttpRetryOptions is unavailable")
        if generate_config is None:
            problems.append("google-genai GenerateContentConfig is unavailable")
        elif not {"response_json_schema", "http_options"}.issubset(
            getattr(generate_config, "model_fields", {})
        ):
            problems.append("google-genai structured output controls are unavailable")
    return problems


@router.get("/internal/ai/health")
def health() -> dict[str, str | bool]:
    """Backward-compatible readiness alias."""

    return ready()
