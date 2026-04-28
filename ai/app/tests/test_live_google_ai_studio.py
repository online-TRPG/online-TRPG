import os
from pathlib import Path
from typing import Any

import pytest

from app.clients.google_ai_studio import GoogleAiStudioClient
from app.core.config import Settings
from app.schemas.harness import InterpreterHarnessRequest
from app.services.interpreter.service import InterpreterService


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_GOOGLE_AI_STUDIO") != "1",
    reason="Set RUN_LIVE_GOOGLE_AI_STUDIO=1 to call Google AI Studio.",
)


def live_settings() -> Settings:
    settings = Settings(
        ai_timeout_ms=60_000,
        ai_max_retries=1,
        ai_log_dir=str(Path("runtime_logs_test") / "live_google_ai_studio"),
    )
    if not settings.google_api_key:
        pytest.skip("GOOGLE_API_KEY is not configured.")
    return settings


def build_live_service() -> InterpreterService:
    settings = live_settings()
    return InterpreterService(client=GoogleAiStudioClient(settings), settings=settings)


def context_ids(prompt_context: dict[str, object], key: str) -> set[str]:
    values = prompt_context[key]
    return {value.id for value in values}  # type: ignore[attr-defined]


def payload_ids(prompt_context: dict[str, object], key: str = "related_entities_payload") -> set[str]:
    values = prompt_context[key]
    assert isinstance(values, list)
    return {str(value["id"]) for value in values if isinstance(value, dict)}


LIVE_INTERPRETER_CASES: list[dict[str, Any]] = [
    {
        "id": "chill_touch_spell_attack",
        "request": InterpreterHarnessRequest(
            actorCharacterId="wizard-1",
            rawText="싸늘한 손길을 적 고블린에게 시전한다.",
            sceneSummary="전투 중. 적 고블린은 90피트 떨어져 있고 시야에 보인다.",
            availableTargets=["goblin-1"],
        ),
        "expected_entity_ids": {"spell.chill_touch"},
        "expected_hook_ids": {"hook.spell.cast_chill_touch", "hook.combat.resolve_attack_roll"},
        "forbidden_hook_ids": {"hook.class.fighter.champion_critical_threshold"},
        "assert_response": lambda response: (
            response.parsed.action.type == "cast_spell"
            and response.parsed.action.targetId == "goblin-1"
            and response.parsed.action.spellId == "spell.chill_touch"
            and response.parsed.action.attackKind == "ranged_spell_attack"
            and response.parsed.mentionedSpellId == "spell.chill_touch"
            and "rule.spellcasting.spell_attack" in response.parsed.requiredRuleCheckIds
            and "rule.combat.attack_roll" in response.parsed.requiredRuleCheckIds
        ),
    },
    {
        "id": "bag_of_holding_item_capacity",
        "request": InterpreterHarnessRequest(
            actorCharacterId="rogue-1",
            rawText="보유의 주머니에 금화와 장비를 더 넣는다.",
            sceneSummary="전리품을 정리하는 중이다.",
            availableTargets=["magic_item.bag_of_holding"],
        ),
        "expected_entity_ids": {"magic_item.bag_of_holding"},
        "expected_hook_ids": {"hook.item.bag_of_holding_capacity"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type in {"use_item", "interact", "freeform"}
            and response.parsed.mentionedItemId == "magic_item.bag_of_holding"
            and response.parsed.action.spellId is None
            and response.parsed.action.featureId is None
        ),
    },
    {
        "id": "prone_condition_context",
        "request": InterpreterHarnessRequest(
            actorCharacterId="fighter-1",
            rawText="넘어짐 상태에서 일어나서 적을 공격하려고 한다.",
            sceneSummary="전투 중. 파이터가 바닥에 넘어져 있다.",
            availableTargets=["goblin-1"],
        ),
        "expected_entity_ids": {"condition.prone"},
        "expected_hook_ids": {"hook.condition.apply_prone_modifiers", "hook.combat.resolve_attack_roll"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type in {"move", "attack", "freeform"}
            and "condition.prone" in response.parsed.mentionedConditionIds
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "fighter_second_wind_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="fighter-1",
            rawText="파이터가 재기의 숨결을 사용한다.",
            sceneSummary="전투 중. 파이터가 크게 다쳤다.",
            availableTargets=["fighter-1"],
        ),
        "expected_entity_ids": {"class.fighter"},
        "expected_hook_ids": {"hook.class.fighter.second_wind"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.fighter.feature.재기의_숨결"
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "fighter_action_surge_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="fighter-1",
            rawText="파이터가 행동 연쇄를 사용해서 한 번 더 행동하려고 한다.",
            sceneSummary="전투 중. 파이터의 턴이다.",
            availableTargets=["fighter-1", "goblin-1"],
        ),
        "expected_entity_ids": {"class.fighter"},
        "expected_hook_ids": {"hook.class.fighter.action_surge"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.fighter.feature.행동_연쇄"
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "barbarian_rage_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="barbarian-1",
            rawText="바바리안이 격노를 사용한다.",
            sceneSummary="전투 중. 바바리안의 턴이고 아직 추가 행동을 쓰지 않았다.",
            availableTargets=["barbarian-1"],
        ),
        "expected_entity_ids": {"class.barbarian"},
        "expected_hook_ids": {"hook.class.barbarian.rage"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch", "hook.class.barbarian.frenzy"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.barbarian.feature.격노"
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "rogue_sneak_attack_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="rogue-1",
            rawText="로그가 레이피어 명중 후 암습을 적용하려고 한다.",
            sceneSummary="전투 중. 로그가 유리함을 받고 적을 명중시켰다.",
            availableTargets=["goblin-1"],
        ),
        "expected_entity_ids": {"class.rogue"},
        "expected_hook_ids": {"hook.class.rogue.sneak_attack", "hook.combat.resolve_attack_roll"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.rogue.feature.암습"
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "rogue_cunning_action_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="rogue-1",
            rawText="로그가 교활한 행동으로 숨기를 시도한다.",
            sceneSummary="전투 중. 로그의 턴이고 아직 추가 행동을 쓰지 않았다.",
            availableTargets=["rogue-1"],
        ),
        "expected_entity_ids": {"class.rogue"},
        "expected_hook_ids": {"hook.class.rogue.cunning_action"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch", "hook.class.rogue.sneak_attack"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.rogue.feature.교활한_행동"
            and response.parsed.action.spellId is None
        ),
    },
    {
        "id": "barbarian_frenzy_feature",
        "request": InterpreterHarnessRequest(
            actorCharacterId="barbarian-1",
            rawText="바바리안이 격노에 들어가면서 광분을 선언한다.",
            sceneSummary="전투 중. 광전사의 길 바바리안이 격노를 시작하려 한다.",
            availableTargets=["barbarian-1"],
        ),
        "expected_entity_ids": {"class.barbarian"},
        "expected_hook_ids": {"hook.class.barbarian.frenzy"},
        "forbidden_hook_ids": {"hook.spell.cast_chill_touch"},
        "assert_response": lambda response: (
            response.parsed.action.type == "use_class_feature"
            and response.parsed.action.featureId == "class.barbarian.subclass_feature.광분"
            and response.parsed.action.spellId is None
        ),
    },
]


@pytest.mark.parametrize("case", LIVE_INTERPRETER_CASES, ids=[case["id"] for case in LIVE_INTERPRETER_CASES])
def test_live_google_ai_studio_interpreter_srd_context_and_schema(case: dict[str, Any]):
    service = build_live_service()
    request = case["request"]
    prompt_context = service._build_prompt_context(request)
    hook_ids = context_ids(prompt_context, "related_rule_hooks")
    entity_ids = payload_ids(prompt_context)

    assert case["expected_entity_ids"] <= entity_ids
    assert case["expected_hook_ids"] <= hook_ids
    assert hook_ids.isdisjoint(case["forbidden_hook_ids"])

    response = service.run(request)

    assert response.provider == "google-ai-studio"
    assert response.finishReason is not None
    assert response.parsed.action.actorCharacterId == request.actorCharacterId
    assert case["assert_response"](response), response.parsed.model_dump()
