import time
from collections.abc import Callable
from typing import Annotated
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.errors import AiClientError
from app.schemas.harness import (
    ActorHarnessRequest,
    CheckResultHarnessRequest,
    DirectorHarnessRequest,
    InterpreterHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SmokeHarnessRequest,
    SummarizerHarnessRequest,
)
from app.services.harness import AiHarnessService, get_ai_harness_service


router = APIRouter(prefix="/internal/ai", tags=["internal-ai"])
RequestT = TypeVar("RequestT", bound=BaseModel)
ResponseT = TypeVar("ResponseT")


def _run_with_failure_trace(
    *,
    endpoint: str,
    request: RequestT,
    service: AiHarnessService,
    run: Callable[[RequestT], ResponseT],
) -> ResponseT:
    try:
        return run(request)
    except AiClientError as exc:
        log_started_at = time.monotonic()
        service.log_failure(endpoint, request.model_dump(), exc)
        exc.latency_ms += max(0, int((time.monotonic() - log_started_at) * 1000))
        raise HTTPException(status_code=exc.status_code, detail=exc.as_dict()) from exc


@router.post("/smoke")
def smoke_test(
    request: SmokeHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="smoke",
        request=request,
        service=service,
        run=service.run_smoke_test,
    )


@router.post("/interpreter")
def run_interpreter(
    request: InterpreterHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="interpreter",
        request=request,
        service=service,
        run=service.run_interpreter,
    )


@router.post("/narrator")
def run_narrator(
    request: NarratorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="narrator",
        request=request,
        service=service,
        run=service.run_narrator,
    )


@router.get("/traces")
def list_traces(
    role: str | None = None,
    status: str | None = None,
    sessionId: str | None = None,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return service.list_traces(role=role, status=status, session_id=sessionId, size=size)


@router.post("/director")
def run_director(
    request: DirectorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="director",
        request=request,
        service=service,
        run=service.run_director,
    )


@router.post("/summarizer")
def run_summarizer(
    request: SummarizerHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="summarizer",
        request=request,
        service=service,
        run=service.run_summarizer,
    )


@router.post("/actor")
def run_actor(
    request: ActorHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="actor",
        request=request,
        service=service,
        run=service.run_actor,
    )


@router.post("/npc-dialogue")
def run_npc_dialogue(
    request: NpcDialogueHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="npc-dialogue",
        request=request,
        service=service,
        run=service.run_npc_dialogue,
    )


@router.post("/check-result")
def run_check_result(
    request: CheckResultHarnessRequest,
    service: AiHarnessService = Depends(get_ai_harness_service),
):
    return _run_with_failure_trace(
        endpoint="check-result",
        request=request,
        service=service,
        run=service.run_check_result,
    )
