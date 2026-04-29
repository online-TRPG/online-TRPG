from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.errors import AiClientError
from app.schemas.harness import (
    DirectorHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SummarizerHarnessRequest,
)
from app.services.harness import AiHarnessService, get_ai_harness_service


router = APIRouter(prefix="/api/v1/sessions/{session_id}", tags=["session-ai"])


def _with_session_id(request, session_id: str):
    return request.model_copy(update={"sessionId": session_id})


def _raise_logged_error(
    *,
    endpoint: str,
    request_payload: dict,
    service: AiHarnessService,
    error: AiClientError,
):
    log_paths = service.log_failure(endpoint, request_payload, error)
    detail = error.as_dict()
    detail["logPaths"] = log_paths
    raise HTTPException(status_code=error.status_code, detail=detail) from error


@router.post("/ai/hint")
def create_ai_hint(
    session_id: str,
    request: DirectorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    scoped_request = _with_session_id(request, session_id)
    try:
        return service.run_director(scoped_request)
    except AiClientError as exc:
        _raise_logged_error(
            endpoint="ai-hint",
            request_payload=scoped_request.model_dump(),
            service=service,
            error=exc,
        )


@router.post("/ai/npc-dialogue")
def create_ai_npc_dialogue(
    session_id: str,
    request: NpcDialogueHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    scoped_request = _with_session_id(request, session_id)
    try:
        return service.run_npc_dialogue(scoped_request)
    except AiClientError as exc:
        _raise_logged_error(
            endpoint="ai-npc-dialogue",
            request_payload=scoped_request.model_dump(),
            service=service,
            error=exc,
        )


@router.post("/ai/narration")
def create_ai_narration(
    session_id: str,
    request: NarratorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    scoped_request = _with_session_id(request, session_id)
    try:
        return service.run_narrator(scoped_request)
    except AiClientError as exc:
        _raise_logged_error(
            endpoint="ai-narration",
            request_payload=scoped_request.model_dump(),
            service=service,
            error=exc,
        )


@router.post("/ai/summary")
def create_ai_summary(
    session_id: str,
    request: SummarizerHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    scoped_request = _with_session_id(request, session_id)
    try:
        return service.run_summarizer(scoped_request)
    except AiClientError as exc:
        _raise_logged_error(
            endpoint="ai-summary",
            request_payload=scoped_request.model_dump(),
            service=service,
            error=exc,
        )


@router.get("/ai-traces")
def list_session_ai_traces(
    session_id: str,
    role: str | None = None,
    status: str | None = None,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return service.list_traces(role=role, status=status, size=size, session_id=session_id)
