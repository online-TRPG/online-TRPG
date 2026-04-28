from fastapi import FastAPI

from app.api.routes.harness import router as harness_router
from app.api.routes.health import router as health_router


app = FastAPI(
    title="S14P31A201 AI Harness",
    version="0.1.0",
    description="Minimal Google AI Studio harness for interpreter and narrator roles.",
)

app.include_router(health_router)
app.include_router(harness_router)
