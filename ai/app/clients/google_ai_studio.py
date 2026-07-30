from __future__ import annotations

import time
import json
import re
from dataclasses import dataclass
from functools import lru_cache
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
    prompt_token_count: int | None = None
    output_token_count: int | None = None
    cached_token_count: int | None = None
    total_token_count: int | None = None


class GoogleAiStudioClient:
    _UNSAFE_RESPONSE_JSON_SCHEMA_KEYS = {
        "default",
        "minLength",
        "maxLength",
        "pattern",
        "title",
    }
    _PROVIDER_STATUS_RE = re.compile(r"\b(400|401|403|404|408|409|429|500|502|503|504)\b")

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        if not self._settings.google_api_key:
            raise AiClientError(
                message="GOOGLE_API_KEY is not configured.",
                failure_type="config",
                retryable=False,
                status_code=503,
                attempts=0,
            )

        try:
            from google import genai
        except ImportError as exc:
            raise AiClientError(
                message="google-genai is not installed. Run `python -m pip install -e .[dev]` in the ai folder.",
                failure_type="config",
                retryable=False,
                status_code=503,
                attempts=0,
            ) from exc

        try:
            self._client = genai.Client(api_key=self._settings.google_api_key)
        except Exception as exc:
            raise AiClientError(
                message=f"Failed to initialize Google AI Studio client: {exc}",
                failure_type="config",
                retryable=False,
                status_code=503,
                attempts=0,
            ) from exc
        return self._client

    def generate_json(
        self,
        *,
        model: str,
        prompt: str,
        response_json_schema: dict[str, Any],
        system_instruction: str | None = None,
        temperature: float = 0.2,
        timeout_ms: int | None = None,
    ) -> GeneratedJsonResult:
        schema_json = json.dumps(
            response_json_schema,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        provider_schema_json = self._cached_sanitized_response_schema_json(schema_json)
        provider_schema = json.loads(provider_schema_json)
        prompt_bytes = (
            len(prompt.encode("utf-8"))
            + len((system_instruction or "").encode("utf-8"))
            + len(provider_schema_json.encode("utf-8"))
        )
        if prompt_bytes > self._settings.ai_prompt_max_bytes:
            raise AiClientError(
                message=(
                    f"AI prompt is {prompt_bytes} bytes; maximum is "
                    f"{self._settings.ai_prompt_max_bytes} bytes."
                ),
                failure_type="input_too_large",
                retryable=False,
                status_code=422,
                attempts=0,
            )
        client = self._get_client()
        started_at = time.perf_counter()
        try:
            genai_types = self._get_genai_types()
        except RuntimeError as exc:
            raise AiClientError(
                message=str(exc),
                failure_type="config",
                retryable=False,
                status_code=503,
                attempts=0,
            ) from exc
        # Google AI Studio는 JSON Schema 전체를 받는 것처럼 보이지만,
        # Pydantic이 만드는 일부 키워드는 400 INVALID_ARGUMENT를 유발한다.
        try:
            config_kwargs: dict[str, Any] = {
                "temperature": temperature,
                "response_mime_type": "application/json",
                "response_json_schema": provider_schema,
                "http_options": genai_types.HttpOptions(
                    timeout=max(1, timeout_ms or self._settings.ai_timeout_ms),
                    retry_options=genai_types.HttpRetryOptions(attempts=1),
                ),
            }
            if system_instruction:
                config_kwargs["system_instruction"] = system_instruction
            # Gemma 4에 thinking_config를 붙이면 Google 쪽 500이 재현되어,
            # 실제 지원이 확인된 모델 계열에만 옵션을 전달한다.
            if self._settings.ai_thinking_level and self._supports_thinking_config(model):
                config_kwargs["thinking_config"] = genai_types.ThinkingConfig(
                    thinking_level=self._settings.ai_thinking_level
                )
            config = genai_types.GenerateContentConfig(**config_kwargs)
        except Exception as exc:
            raise AiClientError(
                message=f"Failed to build Google AI Studio request config: {exc}",
                failure_type="config",
                retryable=False,
                status_code=503,
                attempts=0,
            ) from exc

        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:
            raise self._classify_exception(exc) from exc

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        raw_text = response.text or "{}"
        parsed_json = getattr(response, "parsed", None)
        if parsed_json is None and raw_text:
            parsed_json = self._parse_json_text(raw_text)
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
        usage_metadata = getattr(response, "usage_metadata", None)

        return GeneratedJsonResult(
            raw_text=raw_text,
            parsed_json=parsed_json,
            model=model,
            provider=self._settings.ai_provider,
            latency_ms=elapsed_ms,
            finish_reason=self._bounded_optional_text(finish_reason, max_length=100),
            provider_request_id=self._bounded_optional_text(
                provider_request_id,
                max_length=500,
            ),
            prompt_token_count=self._optional_int(usage_metadata, "prompt_token_count"),
            output_token_count=self._optional_int(usage_metadata, "candidates_token_count"),
            cached_token_count=self._optional_int(usage_metadata, "cached_content_token_count"),
            total_token_count=self._optional_int(usage_metadata, "total_token_count"),
        )

    @staticmethod
    def _parse_json_text(raw_text: str) -> dict[str, Any] | list[Any] | None:
        candidates = [raw_text.strip()]
        stripped = raw_text.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            candidates.append("\n".join(lines).strip())
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start != -1 and end != -1 and start < end:
            candidates.append(raw_text[start : end + 1])
        for candidate in candidates:
            if not candidate:
                continue
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
        return None

    def _get_genai_types(self):
        try:
            from google.genai import types
        except ImportError as exc:
            raise RuntimeError(
                "google-genai is not installed. Run `python -m pip install -e .[dev]` in the ai folder."
            ) from exc
        return types

    @classmethod
    def _sanitize_response_json_schema(cls, schema: dict[str, Any]) -> dict[str, Any]:
        stripped_schema = cls._strip_unsafe_schema_keywords(schema)
        inlined_schema = cls._inline_local_schema_refs(stripped_schema)
        return cls._collapse_anyof_schema(inlined_schema)

    @classmethod
    @lru_cache(maxsize=64)
    def _cached_sanitized_response_schema_json(cls, schema_json: str) -> str:
        """Cache deterministic Google-compatible schema variants across role calls."""

        schema = json.loads(schema_json)
        sanitized = cls._sanitize_response_json_schema(schema)
        return json.dumps(
            sanitized,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )

    @classmethod
    def _strip_unsafe_schema_keywords(cls, value: Any, *, parent_key: str | None = None) -> Any:
        if isinstance(value, dict):
            return {
                key: cls._strip_unsafe_schema_keywords(child, parent_key=key)
                for key, child in value.items()
                if parent_key in {"properties", "$defs"} or key not in cls._UNSAFE_RESPONSE_JSON_SCHEMA_KEYS
            }
        if isinstance(value, list):
            return [cls._strip_unsafe_schema_keywords(child, parent_key=parent_key) for child in value]
        return value

    @classmethod
    def _inline_local_schema_refs(cls, schema: dict[str, Any]) -> dict[str, Any]:
        definitions = schema.get("$defs", {})

        def resolve(value: Any, seen_definition_names: set[str]) -> Any:
            if isinstance(value, dict):
                ref = value.get("$ref")
                if isinstance(ref, str) and ref.startswith("#/$defs/"):
                    definition_name = ref.removeprefix("#/$defs/")
                    definition = definitions.get(definition_name)
                    if not isinstance(definition, dict) or definition_name in seen_definition_names:
                        return {"type": "object"}
                    return resolve(definition, {*seen_definition_names, definition_name})
                return {
                    key: resolve(child, seen_definition_names)
                    for key, child in value.items()
                    if key != "$defs"
                }
            if isinstance(value, list):
                return [resolve(child, seen_definition_names) for child in value]
            return value

        return resolve(schema, set())

    @classmethod
    def _collapse_anyof_schema(cls, value: Any) -> Any:
        # nullable anyOf가 많은 스키마는 Gemma structured output에서 500이 잦아,
        # provider에는 대표 타입만 보내고 실제 null 허용 여부는 Pydantic 검증에 맡긴다.
        if isinstance(value, dict):
            if "anyOf" in value and isinstance(value["anyOf"], list):
                chosen_schema = cls._first_non_null_schema(value["anyOf"])
                sibling_schema = {
                    key: child
                    for key, child in value.items()
                    if key != "anyOf"
                }
                collapsed_schema = cls._collapse_anyof_schema(chosen_schema)
                collapsed_siblings = cls._collapse_anyof_schema(sibling_schema)
                if isinstance(collapsed_schema, dict) and isinstance(collapsed_siblings, dict):
                    return {**collapsed_schema, **collapsed_siblings}
                return collapsed_schema
            return {key: cls._collapse_anyof_schema(child) for key, child in value.items()}
        if isinstance(value, list):
            return [cls._collapse_anyof_schema(child) for child in value]
        return value

    @staticmethod
    def _first_non_null_schema(any_of: list[Any]) -> Any:
        for schema in any_of:
            if not (isinstance(schema, dict) and schema.get("type") == "null"):
                return schema
        return any_of[0] if any_of else {"type": "string"}

    @staticmethod
    def _supports_thinking_config(model: str) -> bool:
        normalized_model = model.casefold()
        return normalized_model.startswith("gemini-2.5-")

    @staticmethod
    def _classify_exception(exc: Exception) -> AiClientError:
        message = str(exc)
        lowered = message.lower()
        exception_names = {cls.__name__.casefold() for cls in type(exc).__mro__}
        provider_status = GoogleAiStudioClient._provider_status(exc, message)
        if (
            provider_status == 408
            or any("timeout" in name for name in exception_names)
            or "timed out" in lowered
            or "deadline exceeded" in lowered
        ):
            return AiClientError(
                message=message or "Google AI Studio request timed out.",
                failure_type="timeout",
                retryable=True,
                status_code=504,
            )
        if "quota" in lowered:
            return AiClientError(
                message=message or "Google AI Studio quota exceeded.",
                failure_type="quota",
                retryable=False,
                status_code=429,
            )
        if provider_status == 429 or ("rate" in lowered and "limit" in lowered):
            return AiClientError(
                message=message or "Google AI Studio rate limited the request.",
                failure_type="rate_limit",
                retryable=False,
                status_code=429,
            )
        if (
            provider_status in {401, 403}
            or "api key" in lowered
            or "permission" in lowered
            or "unauthorized" in lowered
        ):
            return AiClientError(
                message=message or "Google AI Studio authentication failed.",
                failure_type="auth",
                retryable=False,
                # Provider credentials are server configuration. Never expose
                # the upstream 401/403 as if the product caller were unauthenticated.
                status_code=503,
            )
        if provider_status == 404:
            return AiClientError(
                message=message or "Google AI Studio model or endpoint was not found.",
                failure_type="config",
                retryable=False,
                status_code=503,
            )
        if provider_status in {400, 409} or "invalid_argument" in lowered:
            return AiClientError(
                message=message or "Google AI Studio rejected the provider request.",
                failure_type="provider_request",
                retryable=False,
                status_code=502,
            )
        if provider_status is not None and provider_status >= 500:
            return AiClientError(
                message=message or "Google AI Studio returned an upstream error.",
                failure_type="upstream_error",
                retryable=True,
                status_code=502,
            )
        if (
            any(
                marker in name
                for name in exception_names
                for marker in ("connection", "network", "transport")
            )
            or "network" in lowered
            or "connection" in lowered
            or "dns" in lowered
        ):
            return AiClientError(
                message=message or "Network error while calling Google AI Studio.",
                failure_type="network",
                retryable=True,
                status_code=503,
            )
        return AiClientError(
            message=message or "Unexpected Google AI Studio error.",
            failure_type="upstream_error",
            # The remediation contract retries only explicit network/timeout/5xx
            # failures. An unclassified SDK exception falls back without replaying.
            retryable=False,
            status_code=502,
        )

    @classmethod
    def _provider_status(cls, exc: Exception, message: str) -> int | None:
        for candidate in (
            getattr(exc, "code", None),
            getattr(exc, "status_code", None),
            getattr(getattr(exc, "response", None), "status_code", None),
        ):
            if isinstance(candidate, int) and 100 <= candidate <= 599:
                return candidate
        return cls._extract_provider_status(message)

    @classmethod
    def _extract_provider_status(cls, message: str) -> int | None:
        match = cls._PROVIDER_STATUS_RE.search(message)
        if match is None:
            return None
        return int(match.group(1))

    @staticmethod
    def _optional_int(value: Any, attribute: str) -> int | None:
        candidate = getattr(value, attribute, None) if value is not None else None
        if (
            isinstance(candidate, bool)
            or not isinstance(candidate, int)
            or candidate < 0
            or candidate > 2_147_483_647
        ):
            return None
        return candidate

    @staticmethod
    def _bounded_optional_text(value: Any, *, max_length: int) -> str | None:
        if value is None:
            return None
        return str(value)[:max_length]
