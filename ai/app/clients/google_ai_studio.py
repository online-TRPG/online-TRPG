from __future__ import annotations

import time
import json
import re
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
    _UNSAFE_RESPONSE_JSON_SCHEMA_KEYS = {
        "default",
        "enum",
        "maxItems",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
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
        # Google AI Studio는 JSON Schema 전체를 받는 것처럼 보이지만,
        # Pydantic이 만드는 일부 키워드는 400 INVALID_ARGUMENT를 유발한다.
        config_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "response_mime_type": "application/json",
            "response_json_schema": self._sanitize_response_json_schema(response_json_schema),
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

        return GeneratedJsonResult(
            raw_text=raw_text,
            parsed_json=parsed_json,
            model=model,
            provider=self._settings.ai_provider,
            latency_ms=elapsed_ms,
            finish_reason=str(finish_reason) if finish_reason is not None else None,
            provider_request_id=str(provider_request_id) if provider_request_id is not None else None,
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
        provider_status = GoogleAiStudioClient._extract_provider_status(message)
        if provider_status == 400 or "invalid_argument" in lowered:
            return AiClientError(
                message=message or "Google AI Studio rejected the request format.",
                failure_type="bad_request",
                retryable=False,
                status_code=400,
            )
        if provider_status in {401, 403}:
            return AiClientError(
                message=message or "Google AI Studio authentication failed.",
                failure_type="auth",
                retryable=False,
                status_code=provider_status,
            )
        if provider_status == 429:
            failure_type = "quota" if "quota" in lowered else "rate_limit"
            return AiClientError(
                message=message or "Google AI Studio rate limited the request.",
                failure_type=failure_type,
                retryable=False,
                status_code=429,
            )
        if provider_status is not None and provider_status >= 500:
            return AiClientError(
                message=message or "Google AI Studio returned an upstream error.",
                failure_type="upstream_error",
                retryable=True,
                status_code=502,
            )
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

    @classmethod
    def _extract_provider_status(cls, message: str) -> int | None:
        match = cls._PROVIDER_STATUS_RE.search(message)
        if match is None:
            return None
        return int(match.group(1))
