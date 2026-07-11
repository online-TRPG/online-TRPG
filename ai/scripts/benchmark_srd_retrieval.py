import argparse
import json
import time
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from app.srd.retrieval import (
    SrdRetriever,
    load_classes,
    load_conditions,
    load_magic_items,
    load_monsters,
    load_races,
    load_rule_cards,
    load_rule_fragments,
    load_rule_hooks,
    load_spells,
)


ModelT = TypeVar("ModelT", bound=BaseModel)
QUERIES = (
    "산성 화살을 고블린에게 쏜다",
    "I cast Acid Arrow at the goblin",
    "넘어짐 상태에서 공격 굴림을 처리한다",
    "보유의 주머니에 물건을 넣는다",
    "파이터가 재기의 숨결과 행동 연쇄를 사용한다",
    "로그가 암습 피해를 적용한다",
)


def scale_catalog(items: list[ModelT], factor: int) -> list[ModelT]:
    if factor <= 1:
        return items

    scaled = list(items)
    for copy_index in range(1, factor):
        for item_index, item in enumerate(items):
            synthetic_key = f"{copy_index}-{item_index}"
            updates: dict[str, object] = {"id": f"{item.id}.bench.{copy_index}"}
            if hasattr(item, "nameEn"):
                updates["nameEn"] = f"Synthetic Catalog Entry {synthetic_key}"
            if hasattr(item, "nameKo"):
                updates["nameKo"] = f"합성 카탈로그 항목 {synthetic_key}"
            if hasattr(item, "titleKo"):
                updates["titleKo"] = f"합성 카탈로그 제목 {synthetic_key}"
            if hasattr(item, "summaryKo"):
                updates["summaryKo"] = f"확장성 측정용 합성 카탈로그 설명 {synthetic_key}"
            if hasattr(item, "domain"):
                updates["domain"] = f"benchmark_{copy_index}"
            if hasattr(item, "engineFunction"):
                updates["engineFunction"] = f"benchmark_handler_{synthetic_key}"
            if hasattr(item, "sourceEntityIds"):
                updates["sourceEntityIds"] = []
            if hasattr(item, "sourceRuleIds"):
                updates["sourceRuleIds"] = []
            scaled.append(item.model_copy(update=updates))
    return scaled


def percentile(values: list[float], percentile_value: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * percentile_value))
    return round(ordered[index], 3)


def measure_scale(scale: int, iterations: int) -> dict[str, object]:
    catalogs = {
        "spells": scale_catalog(load_spells(), scale),
        "conditions": scale_catalog(load_conditions(), scale),
        "magic_items": scale_catalog(load_magic_items(), scale),
        "monsters": scale_catalog(load_monsters(), scale),
        "races": scale_catalog(load_races(), scale),
        "classes": scale_catalog(load_classes(), scale),
        "rule_cards": scale_catalog(load_rule_cards(), scale),
        "rule_hooks": scale_catalog(load_rule_hooks(), scale),
    }
    build_started_at = time.perf_counter()
    retriever = SrdRetriever(
        **catalogs,
        rule_fragments=load_rule_fragments(),
    )
    construction_ms = round((time.perf_counter() - build_started_at) * 1000, 3)

    durations_ms: list[float] = []
    result_ids: dict[str, list[str]] = {}
    for _ in range(iterations):
        for query in QUERIES:
            started_at = time.perf_counter()
            entities = retriever.related_entities_for_text(query)
            cards = retriever.related_rule_cards_for_text(query)
            hooks = retriever.related_rule_hooks_for_text(query, entities=entities)
            durations_ms.append((time.perf_counter() - started_at) * 1000)
            result_ids[query] = [
                *(entity.id for entity in entities),
                *(card.id for card in cards),
                *(hook.id for hook in hooks),
            ]

    return {
        "scale": scale,
        "iterations": iterations,
        "construction_ms": construction_ms,
        "index": retriever.index_stats,
        "search": {
            "sample_count": len(durations_ms),
            "p50_ms": percentile(durations_ms, 0.50),
            "p95_ms": percentile(durations_ms, 0.95),
            "max_ms": round(max(durations_ms, default=0.0), 3),
        },
        "result_ids": result_ids,
    }


def compare_result_ids(results: list[dict[str, object]]) -> dict[str, object]:
    if not results:
        return {"pass": False, "baseline_scale": None, "mismatches": ["no results"]}

    baseline = results[0]
    baseline_ids = baseline["result_ids"]
    mismatches: list[dict[str, object]] = []
    for result in results[1:]:
        result_ids = result["result_ids"]
        for query in QUERIES:
            expected = baseline_ids[query]
            actual = result_ids[query]
            if actual != expected:
                mismatches.append(
                    {
                        "scale": result["scale"],
                        "query": query,
                        "expected": expected,
                        "actual": actual,
                    }
                )
    return {
        "pass": not mismatches,
        "baseline_scale": baseline["scale"],
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark indexed SRD retrieval at 1x/10x/100x.")
    parser.add_argument("--scales", nargs="+", type=int, default=[1, 10, 100])
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.iterations < 1:
        parser.error("--iterations must be a positive integer")
    if not args.scales or any(scale < 1 for scale in args.scales):
        parser.error("--scales must contain positive integers")
    if len(set(args.scales)) != len(args.scales):
        parser.error("--scales must not contain duplicates")

    results = [measure_scale(scale, args.iterations) for scale in args.scales]
    payload = {
        "benchmark": "srd_retrieval_index",
        "results": results,
        "result_consistency": compare_result_ids(results),
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(f"{rendered}\n", encoding="utf-8")
    print(rendered)
    if not payload["result_consistency"]["pass"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
