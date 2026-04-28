from typing import Any

from app.schemas.harness import AiTraceSummary, TraceListItem
from app.schemas.interpreter import StructuredAction
from app.schemas.narrator import CheckRequest, DiceResult, NarratorStateDiffSummary


TRACE_STATUS_TO_VALIDATION_STATUS = {
    "success": "passed",
    "fallback": "fallback",
    "failure": "failed",
}


def structured_action_to_backend(action: StructuredAction) -> dict[str, Any]:
    return action.model_dump(exclude_none=True)


def check_request_to_backend(check_request: CheckRequest) -> dict[str, Any]:
    payload = check_request.model_dump(exclude_none=True)
    payload["kind"] = payload.pop("checkType")
    if "difficultyClass" in payload:
        payload["dc"] = payload.pop("difficultyClass")
    return payload


def dice_result_to_backend(dice_result: DiceResult) -> dict[str, Any]:
    payload = dice_result.model_dump(exclude_none=True)
    payload["expression"] = payload.pop("formula")
    return payload


def narrator_state_diff_summary_to_backend(summary: NarratorStateDiffSummary) -> dict[str, Any]:
    return summary.model_dump(exclude_none=True)


def trace_summary_to_backend(
    trace: AiTraceSummary,
    *,
    status: str,
    trace_id: str | None = None,
    session_id: str | None = None,
    turn_id: str | None = None,
    actor_character_id: str | None = None,
    raw_output: str | None = None,
    parsed_output: dict[str, Any] | None = None,
    log_paths: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "id": trace_id,
        "sessionId": session_id,
        "turnId": turn_id,
        "actorCharacterId": actor_character_id,
        "role": trace.role,
        "provider": trace.provider,
        "model": trace.model,
        "promptVersion": trace.promptVersion,
        "latencyMs": trace.latencyMs,
        "attempts": trace.attempts,
        "failureType": trace.failureType,
        "finishReason": trace.finishReason,
        "providerRequestId": trace.providerRequestId,
        "validationStatus": TRACE_STATUS_TO_VALIDATION_STATUS.get(status, status),
        "rawOutput": raw_output,
        "parsedOutput": parsed_output,
        "logPaths": log_paths,
    }


def trace_list_item_to_backend(item: TraceListItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "createdAt": item.timestamp,
        "endpoint": item.endpoint,
        "sessionId": item.sessionId,
        "turnId": item.turnId,
        "actorCharacterId": item.actorCharacterId,
        "role": item.role,
        "provider": item.provider,
        "model": item.model,
        "promptVersion": item.promptVersion,
        "latencyMs": item.latencyMs,
        "attempts": item.attempts,
        "failureType": item.failureType,
        "finishReason": item.finishReason,
        "providerRequestId": item.providerRequestId,
        "validationStatus": TRACE_STATUS_TO_VALIDATION_STATUS.get(item.status, item.status),
        "logPaths": item.logPaths,
    }
