from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any


METRICS = [
    "jsonParsed",
    "schemaValid",
    "contractValid",
    "intentMatched",
    "targetMatched",
    "clarificationMatched",
    "providerUsable",
    "sessionContinuable",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize interpreter harness benchmark JSONL results.")
    parser.add_argument(
        "--input",
        default="runtime_logs/interpreter_harness_benchmark.jsonl",
        help="Benchmark JSONL result path.",
    )
    parser.add_argument(
        "--out-json",
        default="runtime_logs/interpreter_harness_benchmark_summary.json",
        help="Path to write summary JSON.",
    )
    parser.add_argument(
        "--out-csv",
        default="runtime_logs/interpreter_harness_benchmark_summary.csv",
        help="Path to write summary CSV.",
    )
    return parser.parse_args()


def load_rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def percentile(values: list[int], p: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * p)))
    return ordered[index]


def summarize_mode(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    latencies = [row["latencyMs"] for row in rows if isinstance(row.get("latencyMs"), int)]
    status_counts = Counter(row.get("status") for row in rows)
    failure_counts = Counter(row.get("failureType") or "none" for row in rows)
    action_mismatches = [
        {
            "caseId": row["caseId"],
            "expected": row.get("expectedActionType"),
            "actual": (row.get("score") or {}).get("actualActionType"),
            "status": row.get("status"),
            "failureType": row.get("failureType"),
        }
        for row in rows
        if not (row.get("score") or {}).get("intentMatched")
    ]
    metric_rates = {}
    for metric in METRICS:
        passed = sum(1 for row in rows if (row.get("score") or {}).get(metric))
        metric_rates[metric] = {
            "passed": passed,
            "total": total,
            "rate": round(passed / total, 4) if total else 0.0,
        }

    return {
        "total": total,
        "statusCounts": dict(status_counts),
        "failureTypeCounts": dict(failure_counts),
        "metrics": metric_rates,
        "latencyMs": {
            "avg": round(mean(latencies), 2) if latencies else None,
            "p50": percentile(latencies, 0.5),
            "p95": percentile(latencies, 0.95),
            "min": min(latencies) if latencies else None,
            "max": max(latencies) if latencies else None,
        },
        "actionMismatches": action_mismatches,
    }


def build_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_mode: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_mode[row["mode"]].append(row)

    summary = {mode: summarize_mode(mode_rows) for mode, mode_rows in sorted(by_mode.items())}
    before = summary.get("before", {}).get("metrics", {})
    after = summary.get("after", {}).get("metrics", {})
    deltas = {}
    for metric in METRICS:
        if metric in before and metric in after:
            deltas[metric] = round(after[metric]["rate"] - before[metric]["rate"], 4)
    return {"modes": summary, "deltas": deltas}


def write_csv(path: Path, summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for mode, mode_summary in summary["modes"].items():
        for metric, value in mode_summary["metrics"].items():
            rows.append(
                {
                    "mode": mode,
                    "metric": metric,
                    "passed": value["passed"],
                    "total": value["total"],
                    "rate": value["rate"],
                }
            )
        latency = mode_summary["latencyMs"]
        for metric in ("avg", "p50", "p95", "min", "max"):
            rows.append(
                {
                    "mode": mode,
                    "metric": f"latencyMs.{metric}",
                    "passed": latency[metric],
                    "total": "",
                    "rate": "",
                }
            )

    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["mode", "metric", "passed", "total", "rate"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    rows = load_rows(Path(args.input))
    summary = build_summary(rows)
    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(Path(args.out_csv), summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
