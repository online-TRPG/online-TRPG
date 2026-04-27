from fastapi import APIRouter, Depends, HTTPException

from app.core.errors import AiClientError
from app.schemas.harness import (
    InterpreterHarnessRequest,
    NarratorHarnessRequest,
    SmokeHarnessRequest,
)
from app.services.harness import AiHarnessService, get_ai_harness_service


router = APIRouter(prefix="/api/harness", tags=["harness"])


@router.post("/smoke")
def smoke_test(
    request: SmokeHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_smoke_test(request)
    except AiClientError as exc:
        log_paths = service.log_failure("smoke", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@router.post("/interpreter")
def run_interpreter(
    request: InterpreterHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_interpreter(request)
    except AiClientError as exc:
        log_paths = service.log_failure("interpreter", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@router.post("/narrator")
def run_narrator(
    request: NarratorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_narrator(request)
    except AiClientError as exc:
        log_paths = service.log_failure("narrator", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
