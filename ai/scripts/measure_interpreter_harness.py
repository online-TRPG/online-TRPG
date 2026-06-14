from __future__ import annotations

import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import get_settings
from app.core.errors import AiClientError
from app.schemas.harness import InterpreterHarnessRequest
from app.schemas.interpreter import InterpreterOutput
from app.services.harness import get_ai_harness_service
from app.services.interpreter.service import InterpreterService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure interpreter AI response quality before and after the harness path."
    )
    parser.add_argument(
        "--cases",
        default="benchmarks/interpreter_harness_cases.json",
        help="Path to benchmark cases JSON.",
    )
    parser.add_argument(
        "--out",
        default="runtime_logs/interpreter_harness_benchmark.jsonl",
        help="Path to write JSONL result rows.",
    )
    parser.add_argument(
        "--mode",
        choices=["before", "after", "both"],
        default="both",
        help="Which path to execute.",
    )
    parser.add_argument("--repeat", type=int, default=1, help="Repeat count per case and mode.")
    parser.add_argument("--limit", type=int, default=None, help="Optional maximum case count.")
    parser.add_argument("--model", default=None, help="Override model for all cases.")
    parser.add_argument(
        "--log-dir",
        default="runtime_logs/benchmark_interpreter",
        help="AI harness log directory for after-mode trace logs.",
    )
    return parser.parse_args()


def load_cases(path: Path, *, limit: int | None) -> list[dict[str, Any]]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cases, list):
        raise ValueError("cases file must contain a JSON array")
    return cases[:limit] if limit is not None else cases


def build_request(case: dict[str, Any], model: str | None) -> InterpreterHarnessRequest:
    payload = dict(case["request"])
    if model:
        payload["model"] = model
    return InterpreterHarnessRequest.model_validate(payload)


def build_interpreter_prompt(service: InterpreterService, request: InterpreterHarnessRequest) -> tuple[str, str, dict]:
    prompt_context = service._build_prompt_context(request)
    user_prompt = service._format_prompt(request, prompt_context)
    system_prompt = (
        Path(__file__).resolve().parents[1] / "app" / "prompts" / service.PROMPT_VERSION
    ).read_text(encoding="utf-8")
    return system_prompt, user_prompt, prompt_context


def call_without_harness_schema(
    *,
    request: InterpreterHarnessRequest,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.google_api_key:
        raise ValueError("GOOGLE_API_KEY is not configured.")

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise RuntimeError("google-genai is not installed. Run `python -m pip install -e .[dev]`.") from exc

    client = genai.Client(api_key=settings.google_api_key)
    model = request.model or settings.model_for_role("interpreter")
    config = types.GenerateContentConfig(
        temperature=settings.ai_temperature_interpreter,
        response_mime_type="application/json",
        system_instruction=system_prompt,
    )
    started_at = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                client.models.generate_content,
                model=model,
                contents=user_prompt,
                config=config,
            )
            response = future.result(timeout=settings.ai_timeout_ms / 1000)
    except FutureTimeoutError as exc:
        raise AiClientError(
            message=f"Google AI Studio request timed out after {settings.ai_timeout_ms}ms.",
            failure_type="timeout",
            retryable=True,
            status_code=504,
        ) from exc
    except Exception as exc:
        raise GoogleAiStudioClient(settings)._classify_exception(exc) from exc

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    raw_text = response.text or ""
    parsed_json = getattr(response, "parsed", None)
    if parsed_json is None and raw_text:
        parsed_json = GoogleAiStudioClient._parse_json_text(raw_text)

    finish_reason = None
    candidates = getattr(response, "candidates", None) or []
    if candidates:
        finish_reason = getattr(candidates[0], "finish_reason", None)

    return {
        "provider": settings.ai_provider,
        "model": model,
        "latencyMs": elapsed_ms,
        "rawOutput": raw_text,
        "parsedJson": parsed_json,
        "finishReason": str(finish_reason) if finish_reason is not None else None,
        "providerRequestId": str(
            getattr(response, "response_id", None)
            or getattr(response, "request_id", None)
            or getattr(response, "id", None)
            or ""
        )
        or None,
    }


def score_output(
    *,
    case: dict[str, Any],
    request: InterpreterHarnessRequest,
    parsed_json: Any,
    prompt_context: dict[str, Any] | None,
    service: InterpreterService,
    fallback: bool,
) -> dict[str, Any]:
    expected_action_type = case.get("expectedActionType")
    expected_target_id = case.get("expectedTargetId")
    expected_needs_clarification = case.get("expectedNeedsClarification")

    json_parsed = isinstance(parsed_json, dict)
    schema_valid = False
    contract_valid = False
    intent_matched = False
    target_matched = expected_target_id is None
    clarification_matched = expected_needs_clarification is None
    action_type = None
    target_id = None
    validation_error = None

    parsed_model = None
    if json_parsed:
        try:
            parsed_model = InterpreterOutput.model_validate(parsed_json)
            schema_valid = True
            action_type = parsed_model.action.type
            target_id = parsed_model.action.targetId
            intent_matched = action_type == expected_action_type
            target_matched = expected_target_id is None or target_id == expected_target_id
            clarification_matched = (
                expected_needs_clarification is None
                or parsed_model.needsClarification == expected_needs_clarification
            )
            if prompt_context is not None:
                service._validate_output_contract(parsed_model, request, prompt_context)
            contract_valid = True
        except (ValidationError, ValueError) as exc:
            validation_error = str(exc)

    provider_usable = (
        json_parsed
        and schema_valid
        and contract_valid
        and intent_matched
        and target_matched
        and clarification_matched
        and not fallback
    )
    session_continuable = (
        json_parsed
        and schema_valid
        and contract_valid
        and intent_matched
        and target_matched
        and clarification_matched
    )

    return {
        "jsonParsed": json_parsed,
        "schemaValid": schema_valid,
        "contractValid": contract_valid,
        "intentMatched": intent_matched,
        "targetMatched": target_matched,
        "clarificationMatched": clarification_matched,
        "providerUsable": provider_usable,
        "sessionContinuable": session_continuable,
        "actualActionType": action_type,
        "actualTargetId": target_id,
        "validationError": validation_error,
    }


def run_before(case: dict[str, Any], request: InterpreterHarnessRequest, service: InterpreterService) -> dict[str, Any]:
    system_prompt, user_prompt, prompt_context = build_interpreter_prompt(service, request)
    try:
        response = call_without_harness_schema(
            request=request,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        score = score_output(
            case=case,
            request=request,
            parsed_json=response["parsedJson"],
            prompt_context=prompt_context,
            service=service,
            fallback=False,
        )
        return {
            "status": "success" if score["jsonParsed"] else "failure",
            "failureType": None if score["jsonParsed"] else "invalid_response",
            "latencyMs": response["latencyMs"],
            "model": response["model"],
            "finishReason": response["finishReason"],
            "fallback": False,
            "score": score,
            "rawOutput": response["rawOutput"],
        }
    except AiClientError as exc:
        return error_result(exc.failure_type, exc.message)
    except Exception as exc:
        return error_result("unexpected_error", str(exc))


def run_after(case: dict[str, Any], request: InterpreterHarnessRequest, service: InterpreterService) -> dict[str, Any]:
    try:
        harness = get_ai_harness_service()
        response = harness.run_interpreter(request)
        prompt_context = service._build_prompt_context(request)
        score = score_output(
            case=case,
            request=request,
            parsed_json=response.parsed.model_dump(),
            prompt_context=prompt_context,
            service=service,
            fallback=response.fallback,
        )
        return {
            "status": "fallback" if response.fallback else "success",
            "failureType": response.trace.failureType,
            "latencyMs": response.latencyMs,
            "model": response.model,
            "finishReason": response.finishReason,
            "fallback": response.fallback,
            "score": score,
            "rawOutput": response.rawOutput,
            "logPaths": response.logPaths,
        }
    except AiClientError as exc:
        return error_result(exc.failure_type, exc.message)
    except Exception as exc:
        return error_result("unexpected_error", str(exc))


def error_result(failure_type: str | None, message: str) -> dict[str, Any]:
    return {
        "status": "failure",
        "failureType": failure_type,
        "latencyMs": None,
        "model": None,
        "finishReason": None,
        "fallback": False,
        "score": {
            "jsonParsed": False,
            "schemaValid": False,
            "contractValid": False,
            "intentMatched": False,
            "targetMatched": False,
            "clarificationMatched": False,
            "providerUsable": False,
            "sessionContinuable": False,
            "actualActionType": None,
            "actualTargetId": None,
            "validationError": message,
        },
        "rawOutput": "",
    }


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    args = parse_args()
    os.environ["AI_LOG_DIR"] = args.log_dir
    cases = load_cases(Path(args.cases), limit=args.limit)
    out_path = Path(args.out)
    settings = get_settings()
    client = GoogleAiStudioClient(settings)
    service = InterpreterService(client=client, settings=settings)
    modes = ["before", "after"] if args.mode == "both" else [args.mode]

    for repeat_index in range(args.repeat):
        for case in cases:
            request = build_request(case, args.model)
            for mode in modes:
                if mode == "before":
                    result = run_before(case, request, service)
                else:
                    result = run_after(case, request, service)
                row = {
                    "caseId": case["caseId"],
                    "description": case.get("description"),
                    "repeatIndex": repeat_index,
                    "mode": mode,
                    "expectedActionType": case.get("expectedActionType"),
                    "expectedTargetId": case.get("expectedTargetId"),
                    "requestIntent": request.requestIntent,
                    "rawText": request.rawText,
                    **result,
                }
                append_jsonl(out_path, row)
                print(
                    f"{mode} {case['caseId']} r{repeat_index}: "
                    f"status={row['status']} action={row['score']['actualActionType']} "
                    f"usable={row['score']['providerUsable']} continuable={row['score']['sessionContinuable']}"
                )


if __name__ == "__main__":
    main()
