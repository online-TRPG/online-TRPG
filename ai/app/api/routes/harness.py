from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Annotated

from app.core.errors import AiClientError
from app.schemas.harness import (
    ActorHarnessRequest,
    DirectorHarnessRequest,
    InterpreterHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SmokeHarnessRequest,
    SummarizerHarnessRequest,
)
from app.services.harness import AiHarnessService, get_ai_harness_service


router = APIRouter(prefix="/internal/ai", tags=["internal-ai"])


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


@router.get("/traces")
def list_traces(
    role: str | None = None,
    status: str | None = None,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return service.list_traces(role=role, status=status, size=size)


@router.post("/director")
def run_director(
    request: DirectorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_director(request)
    except AiClientError as exc:
        log_paths = service.log_failure("director", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@router.post("/summarizer")
def run_summarizer(
    request: SummarizerHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_summarizer(request)
    except AiClientError as exc:
        log_paths = service.log_failure("summarizer", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@router.post("/actor")
def run_actor(
    request: ActorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_actor(request)
    except AiClientError as exc:
        log_paths = service.log_failure("actor", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@router.post("/npc-dialogue")
def run_npc_dialogue(
    request: NpcDialogueHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    try:
        return service.run_npc_dialogue(request)
    except AiClientError as exc:
        log_paths = service.log_failure("npc-dialogue", request.model_dump(), exc)
        detail = exc.as_dict()
        detail["logPaths"] = log_paths
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
