import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.harness import router as harness_router
from app.api.routes.health import readiness_problems, router as health_router
from app.core.config import get_settings


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    problems = readiness_problems(settings)
    if problems:
        logger.error(
            "ai_server_not_ready provider=%s problems=%s",
            settings.ai_provider,
            problems,
        )
    else:
        logger.info(
            "ai_server_ready provider=%s default_model=%s",
            settings.ai_provider,
            settings.ai_model_default,
        )
    yield


app = FastAPI(
    title="S14P31A201 AI Harness",
    version="0.1.0",
    description="Internal Google AI Studio gateway for Online TRPG AI roles.",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(harness_router)
