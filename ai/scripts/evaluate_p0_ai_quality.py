from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent


def load_srd_catalog_fingerprint() -> dict[str, Any]:
    fingerprint_path = REPO_ROOT / "srd-data" / "generated" / "srd" / "catalog-fingerprint.json"
    return load_json(fingerprint_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the P0 offline-labelled AI quality evaluation against the AI service."
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("AI_SERVICE_URL", "http://localhost:8000"),
        help="AI service base URL. Defaults to AI_SERVICE_URL or http://localhost:8000.",
    )
    parser.add_argument(
        "--output",
        default=str(ROOT / "runtime_logs" / "p0_ai_quality_report.json"),
    )
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def post_json(base_url: str, path: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def rate(passed: int, total: int) -> float:
    return round(passed / total, 4) if total else 0.0


def require_dict(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object.")
    return value


def require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string.")
    return value


def validate_interpreter_response(raw: dict[str, Any]) -> dict[str, Any]:
    parsed = require_dict(raw.get("parsed"), "parsed")
    action = require_dict(parsed.get("action"), "parsed.action")
    require_string(action.get("type"), "parsed.action.type")
    require_string(action.get("actorCharacterId"), "parsed.action.actorCharacterId")
    require_string(action.get("approach"), "parsed.action.approach")
    if not isinstance(action.get("confidence"), (int, float)):
        raise ValueError("parsed.action.confidence must be a number.")
    if not isinstance(action.get("requiresRoll"), bool):
        raise ValueError("parsed.action.requiresRoll must be a boolean.")
    if not isinstance(parsed.get("needsClarification"), bool):
        raise ValueError("parsed.needsClarification must be a boolean.")
    return parsed


def validate_narrator_response(raw: dict[str, Any]) -> dict[str, str]:
    parsed = require_dict(raw.get("parsed"), "parsed")
    narration = require_string(parsed.get("narration"), "parsed.narration")
    visible_summary = require_string(parsed.get("visibleSummary"), "parsed.visibleSummary")
    if len(narration) > 1200:
        raise ValueError("parsed.narration exceeds 1200 characters.")
    if len(visible_summary) > 300:
        raise ValueError("parsed.visibleSummary exceeds 300 characters.")
    if len(visible_summary) >= len(narration):
        raise ValueError("parsed.visibleSummary must be shorter than parsed.narration.")
    return {"narration": narration, "visibleSummary": visible_summary}


def evaluate_interpreter(
    base_url: str, cases: list[dict[str, Any]], timeout: float
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    results: list[dict[str, Any]] = []
    schema_passes = 0
    intent_passes = 0
    for case in cases:
        result: dict[str, Any] = {
            "caseId": case["caseId"],
            "expectedActionType": case["expectedActionType"],
            "schemaPassed": False,
            "intentPassed": False,
        }
        try:
            raw = post_json(base_url, "/internal/ai/interpreter", case["request"], timeout)
            parsed = validate_interpreter_response(raw)
            action = require_dict(parsed["action"], "parsed.action")
            actual_type = action["type"]
            actual_target = action.get("targetId")
            target_matches = (
                "expectedTargetId" not in case
                or actual_target == case.get("expectedTargetId")
            )
            result.update(
                {
                    "schemaPassed": True,
                    "actualActionType": actual_type,
                    "actualTargetId": actual_target,
                    "intentPassed": actual_type == case["expectedActionType"] and target_matches,
                    "fallback": bool(raw.get("fallback", False)),
                }
            )
            schema_passes += 1
            intent_passes += int(result["intentPassed"])
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            result["error"] = str(error)
        results.append(result)
    return results, {
        "schemaPassRate": rate(schema_passes, len(cases)),
        "intentAccuracy": rate(intent_passes, len(cases)),
    }


def evaluate_narrator(
    base_url: str, cases: list[dict[str, Any]], timeout: float
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    results: list[dict[str, Any]] = []
    schema_passes = 0
    violations = 0
    for case in cases:
        result: dict[str, Any] = {
            "caseId": case["caseId"],
            "schemaPassed": False,
            "noNewFactsViolation": False,
        }
        try:
            raw = post_json(base_url, "/internal/ai/narrator", case["request"], timeout)
            parsed = validate_narrator_response(raw)
            output = f"{parsed['narration']}\n{parsed['visibleSummary']}".casefold()
            matched = [
                phrase
                for phrase in case.get("forbiddenPhrases", [])
                if phrase.casefold() in output
            ]
            violation = bool(matched)
            result.update(
                {
                    "schemaPassed": True,
                    "noNewFactsViolation": violation,
                    "matchedForbiddenPhrases": matched,
                    "fallback": bool(raw.get("fallback", False)),
                }
            )
            schema_passes += 1
            violations += int(violation)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            result["error"] = str(error)
        results.append(result)
    return results, {
        "schemaPassRate": rate(schema_passes, len(cases)),
        "noNewFactsViolationRate": rate(violations, len(cases)),
    }


def main() -> int:
    args = parse_args()
    interpreter_cases = load_json(ROOT / "benchmarks" / "interpreter_harness_cases.json")
    narrator_cases = load_json(ROOT / "benchmarks" / "narrator_quality_cases.json")
    if args.limit:
        interpreter_cases = interpreter_cases[: args.limit]
        narrator_cases = narrator_cases[: args.limit]

    interpreter_results, interpreter_metrics = evaluate_interpreter(
        args.base_url, interpreter_cases, args.timeout
    )
    narrator_results, narrator_metrics = evaluate_narrator(
        args.base_url, narrator_cases, args.timeout
    )
    thresholds = {
        "interpreterSchemaPassRate": 0.90,
        "interpreterIntentAccuracy": 0.80,
        "narratorSchemaPassRate": 0.90,
        "narratorNoNewFactsViolationRate": 0.05,
    }
    checks = {
        "interpreterSchemaPassed": interpreter_metrics["schemaPassRate"]
        >= thresholds["interpreterSchemaPassRate"],
        "interpreterIntentPassed": interpreter_metrics["intentAccuracy"]
        >= thresholds["interpreterIntentAccuracy"],
        "narratorSchemaPassed": narrator_metrics["schemaPassRate"]
        >= thresholds["narratorSchemaPassRate"],
        "narratorNoNewFactsPassed": narrator_metrics["noNewFactsViolationRate"]
        <= thresholds["narratorNoNewFactsViolationRate"],
    }
    srd_catalog = load_srd_catalog_fingerprint()
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baseUrl": args.base_url,
        "srdCatalog": srd_catalog,
        "thresholds": thresholds,
        "metrics": {
            "interpreter": interpreter_metrics,
            "narrator": narrator_metrics,
        },
        "checks": checks,
        "passed": all(checks.values()),
        "results": {
            "interpreter": interpreter_results,
            "narrator": narrator_results,
        },
        "notes": [
            "Intent accuracy compares labelled action type and labelled target ID when present.",
            "Narrator no-new-facts is a deterministic forbidden-phrase check; semantic review remains recommended for failed or borderline cases.",
        ],
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))
    print(f"srdCatalogFingerprint={srd_catalog['sha256'][:12]}")
    print(f"report={output}")
    print(f"passed={report['passed']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
