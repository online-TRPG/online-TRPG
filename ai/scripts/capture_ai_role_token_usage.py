from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROLE_ENDPOINTS = {
    "interpreter": "interpreter",
    "narrator": "narrator",
    "director": "director",
    "summarizer": "summarizer",
    "actor": "actor",
    "npc_dialogue": "npc-dialogue",
    "check_result": "check-result",
}
EXPECTATION_FIELDS = {
    "requiredPaths",
    "equals",
    "allowedValues",
    "maxLengths",
    "forbiddenSubstrings",
    "requiredSubstrings",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Capture matched role fixture token usage from a running AI server. "
            "The server performs real provider calls; this script never retries."
        )
    )
    parser.add_argument("--base-url", required=True, help="AI server URL, for example http://127.0.0.1:8000")
    parser.add_argument("--label", required=True, choices=["before", "after"])
    parser.add_argument(
        "--fixtures",
        default="benchmarks/role_token_cases.json",
        help="Role fixture JSON file.",
    )
    parser.add_argument("--out", required=True, help="Output JSONL path.")
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--model", default=None, help="Force the same provider model for every role.")
    parser.add_argument("--timeout-seconds", type=float, default=45.0)
    parser.add_argument("--delay-ms", type=int, default=0)
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace an existing output file instead of refusing to mix captures.",
    )
    return parser.parse_args()


def load_cases(path: Path, *, limit: int | None = None) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not value:
        raise ValueError("role fixtures must be a non-empty JSON array")
    cases: list[dict[str, Any]] = []
    seen_case_ids: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("every role fixture must be an object")
        case_id = item.get("caseId")
        role = item.get("role")
        request_payload = item.get("request")
        expectation = item.get("expect", {})
        if not isinstance(case_id, str) or not case_id:
            raise ValueError("every role fixture requires a non-empty caseId")
        if case_id in seen_case_ids:
            raise ValueError(f"duplicate role fixture caseId: {case_id}")
        if role not in ROLE_ENDPOINTS:
            raise ValueError(f"{case_id}: unsupported role {role!r}")
        if not isinstance(request_payload, dict):
            raise ValueError(f"{case_id}: request must be an object")
        if not isinstance(expectation, dict):
            raise ValueError(f"{case_id}: expect must be an object")
        validate_expectation(case_id, expectation)
        seen_case_ids.add(case_id)
        cases.append(item)
    return cases[:limit] if limit is not None else cases


def validate_expectation(case_id: str, expectation: dict[str, Any]) -> None:
    unexpected = sorted(set(expectation) - EXPECTATION_FIELDS)
    if unexpected:
        raise ValueError(f"{case_id}: unsupported expect fields: {unexpected}")

    required_paths = expectation.get("requiredPaths", [])
    if (
        not isinstance(required_paths, list)
        or any(not isinstance(path, str) or not path for path in required_paths)
    ):
        raise ValueError(f"{case_id}: expect.requiredPaths must be a string array")

    equals = expectation.get("equals", {})
    if not isinstance(equals, dict) or any(
        not isinstance(path, str) or not path for path in equals
    ):
        raise ValueError(f"{case_id}: expect.equals must be an object keyed by paths")

    allowed_values = expectation.get("allowedValues", {})
    if not isinstance(allowed_values, dict) or any(
        not isinstance(path, str)
        or not path
        or not isinstance(values, list)
        or not values
        for path, values in allowed_values.items()
    ):
        raise ValueError(
            f"{case_id}: expect.allowedValues must map paths to non-empty arrays"
        )

    max_lengths = expectation.get("maxLengths", {})
    if not isinstance(max_lengths, dict) or any(
        not isinstance(path, str)
        or not path
        or isinstance(maximum, bool)
        or not isinstance(maximum, int)
        or maximum <= 0
        for path, maximum in max_lengths.items()
    ):
        raise ValueError(
            f"{case_id}: expect.maxLengths must map paths to positive integers"
        )

    for field in ("forbiddenSubstrings", "requiredSubstrings"):
        substring_contract = expectation.get(field, {})
        if not isinstance(substring_contract, dict) or any(
            not isinstance(path, str)
            or not path
            or not isinstance(values, list)
            or not values
            or any(not isinstance(value, str) or not value for value in values)
            for path, values in substring_contract.items()
        ):
            raise ValueError(
                f"{case_id}: expect.{field} must map paths to non-empty string arrays"
            )

    if not any(
        (
            required_paths,
            equals,
            allowed_values,
            max_lengths,
            expectation.get("forbiddenSubstrings", {}),
            expectation.get("requiredSubstrings", {}),
        )
    ):
        raise ValueError(f"{case_id}: expect must contain at least one quality assertion")


def value_at_path(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            raise KeyError(path)
        current = current[part]
    return current


def fixture_fingerprint(case: dict[str, Any]) -> str:
    contract = {
        "caseId": case.get("caseId"),
        "role": case.get("role"),
        "request": case.get("request"),
        "expect": case.get("expect", {}),
    }
    canonical = json.dumps(
        contract,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def fixture_set_fingerprint(cases: list[dict[str, Any]]) -> str:
    identities = sorted(
        (
            case["caseId"],
            case["role"],
            fixture_fingerprint(case),
        )
        for case in cases
    )
    canonical = json.dumps(
        identities,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def evaluate_quality(parsed: Any, expectation: dict[str, Any], *, fallback: bool) -> dict[str, Any]:
    failures: list[str] = []
    if fallback:
        failures.append("response used fallback")
    if not isinstance(parsed, dict):
        return {
            "sessionContinuable": False,
            "failures": [*failures, "parsed response is not an object"],
        }

    for path in expectation.get("requiredPaths", []):
        try:
            candidate = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing required path: {path}")
            continue
        if candidate is None or candidate == "":
            failures.append(f"empty required path: {path}")

    for path, expected in expectation.get("equals", {}).items():
        try:
            actual = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing equality path: {path}")
            continue
        if actual != expected:
            failures.append(f"{path} expected {expected!r}, got {actual!r}")

    for path, allowed in expectation.get("allowedValues", {}).items():
        try:
            actual = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing allowed-value path: {path}")
            continue
        if actual not in allowed:
            failures.append(f"{path} value {actual!r} is not allowed")

    for path, maximum in expectation.get("maxLengths", {}).items():
        try:
            actual = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing max-length path: {path}")
            continue
        if not isinstance(actual, str) or len(actual) > maximum:
            failures.append(f"{path} exceeds max length {maximum}")

    for path, forbidden_values in expectation.get("forbiddenSubstrings", {}).items():
        try:
            actual = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing forbidden-substring path: {path}")
            continue
        if not isinstance(actual, str):
            failures.append(f"{path} is not text")
            continue
        for forbidden in forbidden_values:
            if forbidden in actual:
                failures.append(f"{path} contains forbidden text: {forbidden!r}")

    for path, required_values in expectation.get("requiredSubstrings", {}).items():
        try:
            actual = value_at_path(parsed, path)
        except KeyError:
            failures.append(f"missing required-substring path: {path}")
            continue
        if not isinstance(actual, str):
            failures.append(f"{path} is not text")
            continue
        for required in required_values:
            if required not in actual:
                failures.append(f"{path} is missing required text: {required!r}")

    return {
        "sessionContinuable": not failures,
        "failures": failures,
    }


def request_role(
    *,
    base_url: str,
    role: str,
    payload: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    endpoint = ROLE_ENDPOINTS[role]
    request = Request(
        f"{base_url.rstrip('/')}/internal/ai/{endpoint}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        body = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, dict):
        raise ValueError("AI server response must be a JSON object")
    return body


def capture_case(
    *,
    case: dict[str, Any],
    base_url: str,
    label: str,
    repeat_index: int,
    model: str | None,
    timeout_seconds: float,
) -> dict[str, Any]:
    request_payload = dict(case["request"])
    if model:
        request_payload["model"] = model
    try:
        response = request_role(
            base_url=base_url,
            role=case["role"],
            payload=request_payload,
            timeout_seconds=timeout_seconds,
        )
        trace = response.get("trace") if isinstance(response.get("trace"), dict) else response
        parsed = response.get("parsed")
        fallback = response.get("fallback") is True
        score = evaluate_quality(parsed, case.get("expect", {}), fallback=fallback)
        return {
            "caseId": case["caseId"],
            "fixtureFingerprint": fixture_fingerprint(case),
            "description": case.get("description"),
            "repeatIndex": repeat_index,
            "mode": label,
            "role": case["role"],
            "requestIntent": request_payload.get("requestIntent"),
            "model": trace.get("model"),
            "provider": trace.get("provider"),
            "promptVersion": trace.get("promptVersion"),
            "promptTokenCount": trace.get("promptTokenCount"),
            "outputTokenCount": trace.get("outputTokenCount"),
            "cachedTokenCount": trace.get("cachedTokenCount"),
            "totalTokenCount": trace.get("totalTokenCount"),
            "latencyMs": trace.get("latencyMs"),
            "fallback": fallback,
            "qualityPassed": score["sessionContinuable"],
            "score": score,
            "failureType": trace.get("failureType"),
        }
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        return {
            "caseId": case["caseId"],
            "fixtureFingerprint": fixture_fingerprint(case),
            "description": case.get("description"),
            "repeatIndex": repeat_index,
            "mode": label,
            "role": case["role"],
            "requestIntent": request_payload.get("requestIntent"),
            "model": model,
            "provider": None,
            "promptVersion": None,
            "promptTokenCount": None,
            "outputTokenCount": None,
            "cachedTokenCount": None,
            "totalTokenCount": None,
            "latencyMs": None,
            "fallback": False,
            "qualityPassed": False,
            "score": {
                "sessionContinuable": False,
                "failures": [str(error)[:1000]],
            },
            "failureType": "capture_error",
        }


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    args = parse_args()
    if args.repeat < 1:
        raise ValueError("--repeat must be at least 1")
    if args.timeout_seconds <= 0:
        raise ValueError("--timeout-seconds must be positive")
    if args.delay_ms < 0:
        raise ValueError("--delay-ms cannot be negative")
    cases = load_cases(Path(args.fixtures), limit=args.limit)
    capture_set_fingerprint = fixture_set_fingerprint(cases)
    capture_set_size = len(cases)
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not args.overwrite:
        raise FileExistsError(
            f"{output_path} already exists; use a separate file or pass --overwrite"
        )
    output_path.write_text("", encoding="utf-8")

    for repeat_index in range(args.repeat):
        for case in cases:
            row = capture_case(
                case=case,
                base_url=args.base_url,
                label=args.label,
                repeat_index=repeat_index,
                model=args.model,
                timeout_seconds=args.timeout_seconds,
            )
            row["fixtureSetFingerprint"] = capture_set_fingerprint
            row["fixtureSetSize"] = capture_set_size
            row["expectedRepeatCount"] = args.repeat
            append_jsonl(output_path, row)
            print(
                f"{args.label} {case['caseId']} r{repeat_index}: "
                f"tokens={row['promptTokenCount']} quality={row['qualityPassed']}"
            )
            if args.delay_ms:
                time.sleep(args.delay_ms / 1000)


if __name__ == "__main__":
    main()
