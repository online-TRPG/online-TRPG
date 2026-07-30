from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


OVERALL_MIN_REDUCTION_PERCENT = 30.0
KNOWN_INTENT_MIN_REDUCTION_PERCENT = 40.0
GENERAL_INTENT_MIN_REDUCTION_PERCENT = 20.0
REQUIRED_COMPLETION_PROVIDER = "google-ai-studio"
REQUIRED_COMPLETION_ROLES = frozenset(
    {
        "interpreter",
        "narrator",
        "director",
        "summarizer",
        "actor",
        "npc_dialogue",
        "check_result",
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare matched before/after AI fixture JSONL captures and enforce "
            "the remediation plan's prompt-token and semantic-quality gates."
        )
    )
    parser.add_argument("--before", required=True, help="Baseline JSONL capture.")
    parser.add_argument("--after", required=True, help="Remediated JSONL capture.")
    parser.add_argument(
        "--before-mode",
        default=None,
        help="Optional mode value used to filter the baseline JSONL.",
    )
    parser.add_argument(
        "--after-mode",
        default=None,
        help="Optional mode value used to filter the remediated JSONL.",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Optional path for the machine-readable comparison report.",
    )
    parser.add_argument(
        "--allow-partial-roles",
        action="store_true",
        help="Diagnostic only: do not require all seven production roles.",
    )
    return parser.parse_args()


def load_rows(path: Path, *, mode: str | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number} must contain a JSON object")
        if mode is not None and value.get("mode") != mode:
            continue
        rows.append(value)
    return rows


def row_key(row: dict[str, Any]) -> tuple[str, int, str]:
    case_id = row.get("caseId") or row.get("fixtureId")
    if not isinstance(case_id, str) or not case_id:
        raise ValueError("Every row must have a non-empty caseId or fixtureId")
    repeat_index = row.get("repeatIndex", 0)
    if not isinstance(repeat_index, int) or repeat_index < 0:
        raise ValueError(f"{case_id}: repeatIndex must be a non-negative integer")
    role = row.get("role", "interpreter")
    if not isinstance(role, str) or not role:
        raise ValueError(f"{case_id}: role must be a non-empty string")
    return case_id, repeat_index, role


def index_rows(rows: list[dict[str, Any]], label: str) -> dict[tuple[str, int, str], dict[str, Any]]:
    indexed: dict[tuple[str, int, str], dict[str, Any]] = {}
    for row in rows:
        key = row_key(row)
        if key in indexed:
            raise ValueError(f"Duplicate {label} row for {key}")
        indexed[key] = row
    return indexed


def fixture_set_fingerprint_from_identities(
    identities: set[tuple[str, str, str]],
) -> str:
    canonical = json.dumps(
        sorted(identities),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def validate_capture_integrity(
    rows: list[dict[str, Any]],
    label: str,
    *,
    required_roles: frozenset[str] | None,
) -> dict[str, Any]:
    if not rows:
        raise ValueError(f"{label} capture is empty")
    set_fingerprints = {row.get("fixtureSetFingerprint") for row in rows}
    if len(set_fingerprints) != 1:
        raise ValueError(f"{label} capture has inconsistent fixtureSetFingerprint values")
    set_fingerprint = next(iter(set_fingerprints))
    if not isinstance(set_fingerprint, str) or not set_fingerprint:
        raise ValueError(f"{label} capture requires fixtureSetFingerprint")

    set_sizes = {row.get("fixtureSetSize") for row in rows}
    if len(set_sizes) != 1:
        raise ValueError(f"{label} capture has inconsistent fixtureSetSize values")
    set_size = next(iter(set_sizes))
    if not isinstance(set_size, int) or isinstance(set_size, bool) or set_size <= 0:
        raise ValueError(f"{label} capture requires a positive fixtureSetSize")

    expected_repeat_counts = {row.get("expectedRepeatCount") for row in rows}
    if len(expected_repeat_counts) != 1:
        raise ValueError(f"{label} capture has inconsistent expectedRepeatCount values")
    expected_repeat_count = next(iter(expected_repeat_counts))
    if (
        not isinstance(expected_repeat_count, int)
        or isinstance(expected_repeat_count, bool)
        or expected_repeat_count <= 0
    ):
        raise ValueError(f"{label} capture requires a positive expectedRepeatCount")

    rows_by_repeat: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        _, repeat_index, _ = row_key(row)
        rows_by_repeat.setdefault(repeat_index, []).append(row)
    repeat_indices = sorted(rows_by_repeat)
    if repeat_indices != list(range(expected_repeat_count)):
        raise ValueError(
            f"{label} capture repeat set is incomplete: expected indexes "
            f"0..{expected_repeat_count - 1}, got {repeat_indices}"
        )

    expected_identities: set[tuple[str, str, str]] | None = None
    for repeat_index, repeat_rows in rows_by_repeat.items():
        identities: set[tuple[str, str, str]] = set()
        for row in repeat_rows:
            case_id, _, role = row_key(row)
            fingerprint = row.get("fixtureFingerprint")
            if not isinstance(fingerprint, str) or not fingerprint:
                raise ValueError(
                    f"{label} repeat {repeat_index} case {case_id} requires fixtureFingerprint"
                )
            identities.add((case_id, role, fingerprint))
        if len(repeat_rows) != set_size or len(identities) != set_size:
            raise ValueError(
                f"{label} repeat {repeat_index} is incomplete: "
                f"expected {set_size} fixtures, got {len(identities)}"
            )
        if expected_identities is None:
            expected_identities = identities
        elif identities != expected_identities:
            raise ValueError(f"{label} capture fixture identities differ between repeats")

    if expected_identities is None:
        raise ValueError(f"{label} capture has no fixture identities")
    calculated_set_fingerprint = fixture_set_fingerprint_from_identities(
        expected_identities
    )
    if set_fingerprint != calculated_set_fingerprint:
        raise ValueError(
            f"{label} fixtureSetFingerprint does not match captured fixture identities"
        )

    roles = {row_key(row)[2] for row in rows}
    if required_roles is not None:
        missing_roles = sorted(required_roles - roles)
        if missing_roles:
            raise ValueError(f"{label} capture is missing required roles: {missing_roles}")
    return {
        "fixtureSetFingerprint": set_fingerprint,
        "fixtureSetSize": set_size,
        "repeatCount": expected_repeat_count,
        "roles": sorted(roles),
    }


def prompt_tokens(row: dict[str, Any], key: tuple[str, int, str]) -> int:
    value = row.get("promptTokenCount")
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{key}: promptTokenCount must be a positive integer")
    return value


def matching_model(
    before_row: dict[str, Any],
    after_row: dict[str, Any],
    key: tuple[str, int, str],
) -> str:
    before_model = before_row.get("model")
    after_model = after_row.get("model")
    if not isinstance(before_model, str) or not before_model:
        raise ValueError(f"{key}: baseline model is required")
    if before_model != after_model:
        raise ValueError(
            f"{key}: model mismatch (before={before_model!r}, after={after_model!r})"
        )
    return before_model


def matching_provider(
    before_row: dict[str, Any],
    after_row: dict[str, Any],
    key: tuple[str, int, str],
    *,
    required_provider: str | None,
) -> str:
    before_provider = before_row.get("provider")
    after_provider = after_row.get("provider")
    if not isinstance(before_provider, str) or not before_provider:
        raise ValueError(f"{key}: baseline provider is required")
    if before_provider != after_provider:
        raise ValueError(
            f"{key}: provider mismatch "
            f"(before={before_provider!r}, after={after_provider!r})"
        )
    if required_provider is not None and before_provider != required_provider:
        raise ValueError(
            f"{key}: provider must be {required_provider!r}, got {before_provider!r}"
        )
    return before_provider


def matching_fixture_fingerprint(
    before_row: dict[str, Any],
    after_row: dict[str, Any],
    key: tuple[str, int, str],
) -> str:
    before_fingerprint = before_row.get("fixtureFingerprint")
    after_fingerprint = after_row.get("fixtureFingerprint")
    if not isinstance(before_fingerprint, str) or not before_fingerprint:
        raise ValueError(f"{key}: baseline fixtureFingerprint is required")
    if before_fingerprint != after_fingerprint:
        raise ValueError(
            f"{key}: fixture fingerprint mismatch "
            f"(before={before_fingerprint!r}, after={after_fingerprint!r})"
        )
    return before_fingerprint


def quality_passed(row: dict[str, Any], key: tuple[str, int, str]) -> bool:
    explicit = row.get("qualityPassed")
    if isinstance(explicit, bool):
        return explicit
    score = row.get("score")
    if isinstance(score, dict) and isinstance(score.get("sessionContinuable"), bool):
        return score["sessionContinuable"]
    raise ValueError(
        f"{key}: qualityPassed or score.sessionContinuable is required to prove semantic preservation"
    )


def reduction_percent(before_tokens: int, after_tokens: int) -> float | None:
    if before_tokens <= 0:
        return None
    return round((before_tokens - after_tokens) * 100.0 / before_tokens, 4)


def summarize_group(pairs: list[dict[str, Any]], minimum: float) -> dict[str, Any]:
    before_tokens = sum(pair["beforePromptTokens"] for pair in pairs)
    after_tokens = sum(pair["afterPromptTokens"] for pair in pairs)
    reduction = reduction_percent(before_tokens, after_tokens)
    return {
        "fixtureCount": len(pairs),
        "beforePromptTokens": before_tokens,
        "afterPromptTokens": after_tokens,
        "reductionPercent": reduction,
        "minimumReductionPercent": minimum,
        "passed": bool(pairs) and reduction is not None and reduction >= minimum,
    }


def build_report(
    before_rows: list[dict[str, Any]],
    after_rows: list[dict[str, Any]],
    *,
    required_roles: frozenset[str] | None = None,
    required_provider: str | None = None,
) -> dict[str, Any]:
    before_integrity = validate_capture_integrity(
        before_rows,
        "before",
        required_roles=required_roles,
    )
    after_integrity = validate_capture_integrity(
        after_rows,
        "after",
        required_roles=required_roles,
    )
    if before_integrity["fixtureSetFingerprint"] != after_integrity["fixtureSetFingerprint"]:
        raise ValueError("before/after fixtureSetFingerprint values differ")
    if before_integrity["fixtureSetSize"] != after_integrity["fixtureSetSize"]:
        raise ValueError("before/after fixtureSetSize values differ")
    before = index_rows(before_rows, "before")
    after = index_rows(after_rows, "after")
    missing_after = sorted(str(key) for key in before.keys() - after.keys())
    extra_after = sorted(str(key) for key in after.keys() - before.keys())
    if missing_after or extra_after:
        raise ValueError(
            f"Fixture sets differ: missingAfter={missing_after}, extraAfter={extra_after}"
        )

    pairs: list[dict[str, Any]] = []
    baseline_quality_failures: list[str] = []
    after_quality_failures: list[str] = []
    quality_regressions: list[str] = []
    for key in sorted(before):
        before_row = before[key]
        after_row = after[key]
        before_quality = quality_passed(before_row, key)
        after_quality = quality_passed(after_row, key)
        if not before_quality:
            baseline_quality_failures.append(str(key))
        if not after_quality:
            after_quality_failures.append(str(key))
        if before_quality and not after_quality:
            quality_regressions.append(str(key))
        before_intent = before_row.get("requestIntent")
        after_intent = after_row.get("requestIntent")
        if before_intent != after_intent:
            raise ValueError(
                f"{key}: requestIntent mismatch (before={before_intent!r}, after={after_intent!r})"
            )
        pair = {
            "key": str(key),
            "fixtureFingerprint": matching_fixture_fingerprint(before_row, after_row, key),
            "role": key[2],
            "model": matching_model(before_row, after_row, key),
            "provider": matching_provider(
                before_row,
                after_row,
                key,
                required_provider=required_provider,
            ),
            "requestIntent": before_intent,
            "beforePromptTokens": prompt_tokens(before_row, key),
            "afterPromptTokens": prompt_tokens(after_row, key),
            "beforeQualityPassed": before_quality,
            "afterQualityPassed": after_quality,
        }
        pairs.append(pair)

    known_intent_pairs = [
        pair
        for pair in pairs
        if pair["role"] == "interpreter"
        and pair["requestIntent"] not in (None, "GENERAL_GM_REQUEST")
    ]
    general_intent_pairs = [
        pair
        for pair in pairs
        if pair["role"] == "interpreter"
        and pair["requestIntent"] in (None, "GENERAL_GM_REQUEST")
    ]
    groups = {
        "overall": summarize_group(pairs, OVERALL_MIN_REDUCTION_PERCENT),
        "knownIntentInterpreter": summarize_group(
            known_intent_pairs, KNOWN_INTENT_MIN_REDUCTION_PERCENT
        ),
        "generalInterpreter": summarize_group(
            general_intent_pairs, GENERAL_INTENT_MIN_REDUCTION_PERCENT
        ),
    }
    quality_gate_passed = (
        not baseline_quality_failures
        and not after_quality_failures
        and not quality_regressions
    )
    gates_passed = (
        all(group["passed"] for group in groups.values())
        and quality_gate_passed
    )
    return {
        "gatesPassed": gates_passed,
        "qualityGatePassed": quality_gate_passed,
        "baselineQualityFailureCount": len(baseline_quality_failures),
        "baselineQualityFailures": baseline_quality_failures,
        "afterQualityFailureCount": len(after_quality_failures),
        "afterQualityFailures": after_quality_failures,
        "qualityRegressionCount": len(quality_regressions),
        "qualityRegressions": quality_regressions,
        "captureIntegrity": {
            "before": before_integrity,
            "after": after_integrity,
        },
        "groups": groups,
        "pairs": pairs,
    }


def main() -> None:
    args = parse_args()
    report = build_report(
        load_rows(Path(args.before), mode=args.before_mode),
        load_rows(Path(args.after), mode=args.after_mode),
        required_roles=(None if args.allow_partial_roles else REQUIRED_COMPLETION_ROLES),
        required_provider=REQUIRED_COMPLETION_PROVIDER,
    )
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if not report["gatesPassed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
