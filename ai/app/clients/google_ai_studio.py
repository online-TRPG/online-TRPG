from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.errors import AiClientError


@dataclass(slots=True)
class GeneratedJsonResult:
    raw_text: str
    parsed_json: dict[str, Any]
    model: str
    provider: str
    latency_ms: int
    finish_reason: str | None = None
    provider_request_id: str | None = None


class GoogleAiStudioClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        if not self._settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is not configured.")

        try:
            from google import genai
        except ImportError as exc:
            raise RuntimeError(
                "google-genai is not installed. Run `python -m pip install -e .[dev]` in the ai folder."
            ) from exc

        self._client = genai.Client(api_key=self._settings.google_api_key)
        return self._client

    def generate_json(
        self,
        *,
        model: str,
        prompt: str,
        response_json_schema: dict[str, Any],
        system_instruction: str | None = None,
        temperature: float = 0.2,
    ) -> GeneratedJsonResult:
        client = self._get_client()
        started_at = time.perf_counter()
        genai_types = self._get_genai_types()
        config_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "response_mime_type": "application/json",
            "response_json_schema": response_json_schema,
        }
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        if self._settings.ai_thinking_level and model.startswith("gemma-4-"):
            config_kwargs["thinking_config"] = genai_types.ThinkingConfig(
                thinking_level=self._settings.ai_thinking_level
            )
        config = genai_types.GenerateContentConfig(**config_kwargs)

        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    client.models.generate_content,
                    model=model,
                    contents=prompt,
                    config=config,
                )
                response = future.result(timeout=self._settings.ai_timeout_ms / 1000)
        except FutureTimeoutError as exc:
            raise AiClientError(
                message=f"Google AI Studio request timed out after {self._settings.ai_timeout_ms}ms.",
                failure_type="timeout",
                retryable=True,
                status_code=504,
            ) from exc
        except Exception as exc:
            raise self._classify_exception(exc) from exc

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        raw_text = response.text or "{}"
        parsed_json = getattr(response, "parsed", None)
        if isinstance(parsed_json, list):
            raise AiClientError(
                message="Expected object JSON output but received a list.",
                failure_type="invalid_response",
                retryable=True,
                status_code=502,
            )
        if not isinstance(parsed_json, dict):
            raise AiClientError(
                message="Expected object JSON output from Google AI Studio.",
                failure_type="invalid_response",
                retryable=True,
                status_code=502,
            )

        finish_reason = None
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            finish_reason = getattr(candidates[0], "finish_reason", None)
        provider_request_id = (
            getattr(response, "response_id", None)
            or getattr(response, "request_id", None)
            or getattr(response, "id", None)
        )

        return GeneratedJsonResult(
            raw_text=raw_text,
            parsed_json=parsed_json,
            model=model,
            provider=self._settings.ai_provider,
            latency_ms=elapsed_ms,
            finish_reason=str(finish_reason) if finish_reason is not None else None,
            provider_request_id=str(provider_request_id) if provider_request_id is not None else None,
        )

    def _get_genai_types(self):
        try:
            from google.genai import types
        except ImportError as exc:
            raise RuntimeError(
                "google-genai is not installed. Run `python -m pip install -e .[dev]` in the ai folder."
            ) from exc
        return types

    @staticmethod
    def _classify_exception(exc: Exception) -> AiClientError:
        message = str(exc)
        lowered = message.lower()
        if "quota" in lowered:
            return AiClientError(
                message=message or "Google AI Studio quota exceeded.",
                failure_type="quota",
                retryable=False,
                status_code=429,
            )
        if "rate" in lowered and "limit" in lowered:
            return AiClientError(
                message=message or "Google AI Studio rate limited the request.",
                failure_type="rate_limit",
                retryable=False,
                status_code=429,
            )
        if "api key" in lowered or "permission" in lowered or "unauthorized" in lowered:
            return AiClientError(
                message=message or "Google AI Studio authentication failed.",
                failure_type="auth",
                retryable=False,
                status_code=401,
            )
        if "network" in lowered or "connection" in lowered or "dns" in lowered:
            return AiClientError(
                message=message or "Network error while calling Google AI Studio.",
                failure_type="network",
                retryable=True,
                status_code=503,
            )
        return AiClientError(
            message=message or "Unexpected Google AI Studio error.",
            failure_type="upstream_error",
            retryable=True,
            status_code=502,
        )
