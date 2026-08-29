from __future__ import annotations

import random
import time
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.clients.google_ai_studio import GeneratedJsonResult
from app.core.config import Settings
from app.core.errors import AiClientError


ParsedT = TypeVar("ParsedT")
ResponseT = TypeVar("ResponseT", bound=BaseModel)
PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
_ROLE_REQUEST_STARTED_AT: ContextVar[float | None] = ContextVar(
    "ai_role_request_started_at",
    default=None,
)


@contextmanager
def role_request_timing():
    """Share one monotonic start across prompt construction, provider work, and fallback."""

    started_at = time.monotonic()
    token = _ROLE_REQUEST_STARTED_AT.set(started_at)
    try:
        yield started_at
    finally:
        _ROLE_REQUEST_STARTED_AT.reset(token)


def role_elapsed_ms(started_at: float) -> int:
    return _elapsed_ms(started_at)


@lru_cache(maxsize=32)
def load_role_prompt(prompt_version: str) -> str:
    return (PROMPT_DIR / prompt_version).read_text(encoding="utf-8")


@lru_cache(maxsize=32)
def provider_output_schema(model: type[BaseModel]) -> dict[str, object]:
    return model.model_json_schema()


def mutable_provider_output_schema(model: type[BaseModel]) -> dict[str, object]:
    return deepcopy(provider_output_schema(model))


@dataclass(slots=True)
class ProviderExecution(Generic[ParsedT]):
    result: GeneratedJsonResult
    parsed: ParsedT
    attempts: int
    latency_ms: int
    attempt_latencies_ms: list[int]
    schema_validation_retries: int


def build_role_response_metadata(
    *,
    execution: ProviderExecution,
    role: str,
    prompt_version: str,
) -> dict[str, object]:
    result = execution.result
    return {
        "trace": {
            "role": role,
            "provider": result.provider,
            "model": result.model,
            "promptVersion": prompt_version,
            "latencyMs": execution.latency_ms,
            "providerLatencyMs": result.latency_ms,
            "attemptLatenciesMs": execution.attempt_latencies_ms,
            "schemaValidationRetries": execution.schema_validation_retries,
            "attempts": execution.attempts,
            "failureType": None,
            "finishReason": result.finish_reason,
            "providerRequestId": result.provider_request_id,
            "promptTokenCount": result.prompt_token_count,
            "outputTokenCount": result.output_token_count,
            "cachedTokenCount": result.cached_token_count,
            "totalTokenCount": result.total_token_count,
        },
    }


def attach_role_diagnostics(
    response: ResponseT,
    *,
    execution: ProviderExecution,
    settings: Settings,
) -> ResponseT:
    """Keep provider payload available to the file logger, never the HTTP model."""

    if settings.ai_log_payloads and hasattr(response, "_diagnostic_raw_output"):
        response._diagnostic_raw_output = execution.result.raw_text
    return response


def execute_provider_request(
    *,
    settings: Settings,
    request_once: Callable[[int], GeneratedJsonResult],
    parse_response: Callable[[GeneratedJsonResult], ParsedT],
    validation_error_prefix: str,
) -> ProviderExecution[ParsedT]:
    """Run one role request inside a single end-to-end deadline."""

    role_started_at = _ROLE_REQUEST_STARTED_AT.get()
    started_at = role_started_at if role_started_at is not None else time.monotonic()
    deadline = started_at + settings.ai_timeout_ms / 1000
    max_attempts = settings.ai_max_retries + 1
    attempt_latencies_ms: list[int] = []
    schema_validation_retries = 0
    schema_validation_observed = False
    pending_schema_retry = False
    last_error: AiClientError | None = None

    for attempt in range(1, max_attempts + 1):
        remaining_ms = _remaining_ms(deadline)
        if remaining_ms <= 0:
            error = _deadline_error(settings, attempt - 1)
            error.schema_validation_retries = _schema_retry_metric(
                observed=schema_validation_observed,
                retries=schema_validation_retries,
            )
            raise _with_metrics(
                error,
                started_at,
                attempt_latencies_ms,
            )

        schema_retry_for_attempt = pending_schema_retry
        pending_schema_retry = False
        schema_retry_counted = False

        attempt_started_at = time.monotonic()
        provider_attempted = True
        successful_result: tuple[GeneratedJsonResult, ParsedT] | None = None
        try:
            result = request_once(remaining_ms)
            if schema_retry_for_attempt:
                # The follow-up reached the provider boundary. A local/config
                # preflight failure with attempts=0 is not a provider retry.
                schema_validation_retries += 1
                schema_retry_counted = True
            schema_validation_observed = True
            parsed = parse_response(result)
            attempt_latencies_ms.append(_elapsed_ms(attempt_started_at))
            successful_result = (result, parsed)
        except (ValidationError, ValueError) as exc:
            if schema_retry_for_attempt and not schema_retry_counted:
                schema_validation_retries += 1
            pending_schema_retry = True
            last_error = AiClientError(
                message=f"{validation_error_prefix}: {exc}",
                failure_type="schema_validation",
                retryable=attempt < max_attempts,
                status_code=502,
                attempts=attempt,
                schema_validation_retries=schema_validation_retries,
            )
        except AiClientError as exc:
            provider_attempted = exc.attempts > 0
            if (
                schema_retry_for_attempt
                and provider_attempted
                and not schema_retry_counted
            ):
                schema_validation_retries += 1
            exc.attempts = len(attempt_latencies_ms) + (1 if provider_attempted else 0)
            exc.schema_validation_retries = _schema_retry_metric(
                observed=schema_validation_observed,
                retries=schema_validation_retries,
            )
            last_error = exc
        finally:
            if provider_attempted and len(attempt_latencies_ms) < attempt:
                attempt_latencies_ms.append(_elapsed_ms(attempt_started_at))

        if _remaining_ms(deadline) <= 0:
            error = _deadline_error(settings, len(attempt_latencies_ms))
            error.schema_validation_retries = _schema_retry_metric(
                observed=schema_validation_observed,
                retries=schema_validation_retries,
            )
            raise _with_metrics(error, started_at, attempt_latencies_ms)

        if successful_result is not None:
            result, parsed = successful_result
            return ProviderExecution(
                result=result,
                parsed=parsed,
                attempts=len(attempt_latencies_ms),
                latency_ms=_elapsed_ms(started_at),
                attempt_latencies_ms=attempt_latencies_ms,
                schema_validation_retries=schema_validation_retries,
            )

        if last_error is None:
            continue
        if not last_error.retryable or attempt >= max_attempts:
            raise _with_metrics(last_error, started_at, attempt_latencies_ms)

        try:
            _wait_before_retry(settings, deadline, attempt)
        except AiClientError as exc:
            exc.schema_validation_retries = _schema_retry_metric(
                observed=schema_validation_observed,
                retries=schema_validation_retries,
            )
            raise _with_metrics(exc, started_at, attempt_latencies_ms) from exc

    if last_error is not None:
        raise _with_metrics(last_error, started_at, attempt_latencies_ms)
    error = _deadline_error(settings, len(attempt_latencies_ms))
    error.schema_validation_retries = _schema_retry_metric(
        observed=schema_validation_observed,
        retries=schema_validation_retries,
    )
    raise _with_metrics(
        error,
        started_at,
        attempt_latencies_ms,
    )


def _wait_before_retry(settings: Settings, deadline: float, attempt: int) -> None:
    base_delay_ms = settings.ai_retry_base_delay_ms * (2 ** (attempt - 1))
    jitter_ms = random.uniform(0, settings.ai_retry_jitter_ms)
    delay_ms = min(base_delay_ms + jitter_ms, settings.ai_retry_max_delay_ms)
    remaining_ms = _remaining_ms(deadline)
    if remaining_ms <= 0 or delay_ms >= remaining_ms:
        raise _deadline_error(settings, attempt)
    time.sleep(delay_ms / 1000)


def _remaining_ms(deadline: float) -> int:
    return max(0, int((deadline - time.monotonic()) * 1000))


def _elapsed_ms(started_at: float) -> int:
    return max(0, int((time.monotonic() - started_at) * 1000))


def _schema_retry_metric(*, observed: bool, retries: int) -> int | None:
    return retries if observed else None


def _deadline_error(settings: Settings, attempts: int) -> AiClientError:
    return AiClientError(
        message=f"AI role request exceeded the {settings.ai_timeout_ms}ms total deadline.",
        failure_type="timeout",
        retryable=False,
        status_code=504,
        attempts=max(0, attempts),
    )


def _with_metrics(
    error: AiClientError,
    started_at: float,
    attempt_latencies_ms: list[int],
) -> AiClientError:
    error.latency_ms = _elapsed_ms(started_at)
    error.attempt_latencies_ms = list(attempt_latencies_ms)
    return error
