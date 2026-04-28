import json
from pathlib import Path

from app.srd.build import (
    build,
    build_backend_engine_p0_contracts,
    build_interpreter_backend_handoff_cases,
    build_narrator_input_fixture_cases,
    build_magic_items,
    build_class_options,
    build_rule_cards,
    build_rule_fragments,
    build_rule_hook_fixtures,
    build_spells,
    parse_conditions,
    P0_BACKEND_HOOK_IDS,
)
from app.schemas.harness import NarratorHarnessRequest
from app.srd.retrieval import load_rule_hooks
from app.srd.retrieval import SrdRetriever


def test_rule_hook_fixtures_cover_narrow_engine_owned_slice():
    hooks = build_rule_hook_fixtures()
    hook_ids = {hook.id for hook in hooks}

    assert hook_ids == {
        "hook.combat.resolve_attack_roll",
        "hook.damage.apply_resistance_vulnerability",
        "hook.condition.apply_prone_modifiers",
        "hook.spell.cast_chill_touch",
        "hook.item.bag_of_holding_capacity",
        "hook.class.fighter.second_wind",
        "hook.class.fighter.action_surge",
        "hook.class.fighter.champion_critical_threshold",
        "hook.class.barbarian.rage",
        "hook.class.rogue.sneak_attack",
        "hook.class.rogue.cunning_action",
        "hook.class.barbarian.frenzy",
    }
    assert all(hook.consumes for hook in hooks)
    assert all(hook.produces for hook in hooks)
    assert all("decide_game_truth" in hook.aiForbiddenUse for hook in hooks)


def test_rule_hook_fixture_source_ids_resolve_to_generated_catalogs():
    hooks = build_rule_hook_fixtures()
    rule_ids = {card.id for card in build_rule_cards()} | {fragment.id for fragment in build_rule_fragments()}
    entity_ids = (
        {spell.id for spell in build_spells()}
        | {condition.id for condition in parse_conditions()}
        | {item.id for item in build_magic_items()}
    )
    for class_option in build_class_options():
        entity_ids.add(class_option.id)
        entity_ids.update(feature["id"] for feature in class_option.featureReferences)

    missing_rule_ids = sorted(
        source_id
        for hook in hooks
        for source_id in hook.sourceRuleIds
        if source_id not in rule_ids
    )
    missing_entity_ids = sorted(
        source_id
        for hook in hooks
        for source_id in hook.sourceEntityIds
        if source_id not in entity_ids
    )

    assert missing_rule_ids == []
    assert missing_entity_ids == []


def test_chill_touch_hook_keeps_spell_cast_engine_owned():
    hook = next(hook for hook in build_rule_hook_fixtures() if hook.id == "hook.spell.cast_chill_touch")

    assert hook.engineFunction == "resolve_spell_cast"
    assert "spell.chill_touch" in hook.sourceEntityIds
    assert "rule.spellcasting.cantrip" in hook.sourceRuleIds
    assert "rule.combat.attack_roll" in hook.sourceRuleIds
    assert any("no spell slot" in check for check in hook.acceptanceChecks)
    assert any("ranged spell attack" in check for check in hook.acceptanceChecks)


def test_build_writes_rules_hooks_json():
    output_dir = Path("runtime_logs_test") / "srd_rule_hooks_build"
    result = build(output_dir)
    hooks_path = output_dir / "rules_hooks.json"

    assert result["rule_hook_fixtures"] == 12
    assert hooks_path.exists()
    payload = json.loads(hooks_path.read_text(encoding="utf-8"))
    assert len(payload["hooks"]) == 12
    assert load_rule_hooks(hooks_path)[0].id.startswith("hook.")


def test_backend_engine_p0_contracts_match_rule_hook_io():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}
    cases = build_backend_engine_p0_contracts(list(hooks.values()))
    case_ids = {case.hookId for case in cases}
    contract_case_ids = {case.caseId for case in cases}

    assert case_ids == P0_BACKEND_HOOK_IDS
    assert len(contract_case_ids) == len(cases)
    assert len(cases) == 12

    for case in cases:
        hook = hooks[case.hookId]
        request = case.request
        expected_response = case.expectedResponse
        request_input = request["input"]
        produced = expected_response["produced"]

        assert case.priority == "P0"
        assert case.engineFunction == hook.engineFunction
        assert request["hookId"] == case.hookId
        assert expected_response["hookId"] == case.hookId
        assert expected_response["accepted"] in {True, False}
        assert set(hook.consumes) <= set(request_input)
        assert set(hook.produces) <= set(produced)
        assert "sourceAction" in request
        assert "statePatch" in expected_response
        assert "turnLogEvents" in expected_response
        assert "rejectedReason" in expected_response
        if expected_response["accepted"]:
            assert expected_response["rejectedReason"] is None
        else:
            assert expected_response["rejectedReason"]
        assert case.assertions


def test_build_writes_backend_engine_p0_contracts_json():
    output_dir = Path("runtime_logs_test") / "backend_engine_p0_contracts_build"
    result = build(output_dir)
    contracts_path = output_dir / "backend_engine_p0_contracts.json"

    assert result["backend_engine_p0_contracts"] == 12
    assert contracts_path.exists()
    payload = json.loads(contracts_path.read_text(encoding="utf-8"))
    assert {case["hookId"] for case in payload["cases"]} == P0_BACKEND_HOOK_IDS
    assert len({case["caseId"] for case in payload["cases"]}) == 12
    assert all(case["priority"] == "P0" for case in payload["cases"])


def test_interpreter_backend_handoff_cases_reference_p0_hooks_and_contract_shape():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}
    contract_hook_ids = {case.hookId for case in build_backend_engine_p0_contracts(list(hooks.values()))}
    handoff_cases = build_interpreter_backend_handoff_cases(list(hooks.values()))

    assert {case.caseId for case in handoff_cases} == {
        "handoff.chill_touch_spell_attack",
        "handoff.weapon_attack_with_damage",
        "handoff.prone_stand_then_attack",
    }

    for handoff in handoff_cases:
        assert set(handoff.expectedHookIds) <= contract_hook_ids
        assert [request["hookId"] for request in handoff.hookRequests] == handoff.expectedHookIds
        assert handoff.interpreterOutput["needsClarification"] is False
        action = handoff.interpreterOutput["action"]
        assert isinstance(action, dict)
        for request in handoff.hookRequests:
            hook = hooks[request["hookId"]]
            request_input = request["input"]
            assert set(hook.consumes) <= set(request_input)
            assert request["sourceAction"]["actorCharacterId"] == action["actorCharacterId"]
            assert request["sourceAction"]["type"] == action["type"]
            assert request["sourceTraceId"] is not None


def test_build_writes_interpreter_backend_handoff_cases_json():
    output_dir = Path("runtime_logs_test") / "interpreter_backend_handoff_build"
    result = build(output_dir)
    handoff_path = output_dir / "interpreter_backend_handoff_cases.json"

    assert result["interpreter_backend_handoff_cases"] == 3
    assert handoff_path.exists()
    payload = json.loads(handoff_path.read_text(encoding="utf-8"))
    assert len(payload["cases"]) == 3
    assert payload["cases"][0]["expectedHookIds"] == [
        "hook.combat.resolve_attack_roll",
        "hook.spell.cast_chill_touch",
        "hook.damage.apply_resistance_vulnerability",
    ]


def test_narrator_input_fixture_cases_validate_against_harness_request_schema():
    handoff_case_ids = {case.caseId for case in build_interpreter_backend_handoff_cases()}
    narrator_cases = build_narrator_input_fixture_cases()

    assert {case.caseId for case in narrator_cases} == {
        "narrator.chill_touch_hit",
        "narrator.weapon_attack_hit",
        "narrator.prone_stand_rejected",
    }

    for case in narrator_cases:
        assert case.sourceHandoffCaseId in handoff_case_ids
        request = NarratorHarnessRequest(**case.narratorRequest)
        assert request.constraints.noNewFacts is True
        assert request.constraints.language == "ko"
        assert request.stateDiffSummary is not None
        assert request.stateDiffSummary.summary
        assert case.expectedVisibleSummary
        assert case.forbiddenNarrationFacts
        if any(result["accepted"] is False for result in case.backendHookResults):
            assert request.checkRequest is None
            assert request.diceResult is None


def test_build_writes_narrator_input_fixtures_json():
    output_dir = Path("runtime_logs_test") / "narrator_input_fixtures_build"
    result = build(output_dir)
    narrator_path = output_dir / "narrator_input_fixtures.json"

    assert result["narrator_input_fixtures"] == 3
    assert narrator_path.exists()
    payload = json.loads(narrator_path.read_text(encoding="utf-8"))
    assert len(payload["cases"]) == 3
    assert payload["cases"][0]["narratorRequest"]["constraints"]["noNewFacts"] is True
    assert "stateDiffSummary" in payload["cases"][0]["narratorRequest"]
    assert payload["cases"][2]["narratorRequest"]["diceResult"] is None


def test_backend_engine_integration_plan_mentions_all_rule_hooks():
    plan = Path("BACKEND_ENGINE_INTEGRATION_PLAN.md").read_text(encoding="utf-8")

    for hook in build_rule_hook_fixtures():
        assert hook.id in plan
        assert hook.engineFunction in plan


def test_retrieval_returns_spell_and_attack_hooks_for_chill_touch():
    retriever = SrdRetriever(
        spells=build_spells(),
        conditions=parse_conditions(),
        magic_items=build_magic_items(),
        rule_fragments=build_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )
    text = "싸늘한 손길을 적 고블린에게 시전한다"
    entities = retriever.related_entities_for_text(text)
    fragments = retriever.related_rule_fragments_for_text(text)

    hooks = retriever.related_rule_hooks_for_text(text, entities=entities, rule_fragments=fragments)
    hook_ids = {hook.id for hook in hooks}

    assert "hook.spell.cast_chill_touch" in hook_ids
    assert "hook.combat.resolve_attack_roll" in hook_ids
    assert "hook.class.fighter.champion_critical_threshold" not in hook_ids


def test_retrieval_returns_item_hook_for_bag_of_holding_capacity():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=build_magic_items(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    hooks = retriever.related_rule_hooks_for_text("보유의 주머니에 600파운드짜리 금화를 넣는다")

    assert [hook.id for hook in hooks][:1] == ["hook.item.bag_of_holding_capacity"]


def test_class_feature_hooks_cover_fighter_engine_owned_features():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}

    second_wind = hooks["hook.class.fighter.second_wind"]
    action_surge = hooks["hook.class.fighter.action_surge"]
    critical = hooks["hook.class.fighter.champion_critical_threshold"]

    assert second_wind.engineFunction == "apply_second_wind"
    assert "class.fighter.feature.재기의_숨결" in second_wind.sourceEntityIds
    assert any("1d10 + fighterLevel" in check for check in second_wind.acceptanceChecks)
    assert action_surge.engineFunction == "apply_action_surge"
    assert "rule.combat.행동" in action_surge.sourceRuleIds
    assert "class.fighter.feature.행동_연쇄" in action_surge.sourceEntityIds
    assert critical.engineFunction == "apply_critical_threshold_modifier"
    assert "class.fighter.subclass_feature.향상된_치명타" in critical.sourceEntityIds
    assert "class.fighter.subclass_feature.우월한_치명타" in critical.sourceEntityIds


def test_retrieval_returns_class_feature_hooks_for_fighter_text():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=[],
        rule_fragments=build_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    second_wind_hooks = retriever.related_rule_hooks_for_text("파이터가 재기의 숨결로 회복한다")
    action_surge_hooks = retriever.related_rule_hooks_for_text("행동 연쇄를 써서 추가 행동을 얻는다")
    critical_hooks = retriever.related_rule_hooks_for_text("챔피언의 향상된 치명타가 적용되는지 확인한다")

    assert second_wind_hooks[0].id == "hook.class.fighter.second_wind"
    assert action_surge_hooks[0].id == "hook.class.fighter.action_surge"
    assert critical_hooks[0].id == "hook.class.fighter.champion_critical_threshold"


def test_class_feature_hooks_cover_barbarian_and_rogue_engine_owned_features():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}

    rage = hooks["hook.class.barbarian.rage"]
    sneak_attack = hooks["hook.class.rogue.sneak_attack"]
    cunning_action = hooks["hook.class.rogue.cunning_action"]
    frenzy = hooks["hook.class.barbarian.frenzy"]

    assert rage.engineFunction == "apply_rage"
    assert "class.barbarian.feature.격노" in rage.sourceEntityIds
    assert "rule.damage.저항과_취약" in rage.sourceRuleIds
    assert any("heavy armor" in check for check in rage.acceptanceChecks)
    assert any("concentration" in check for check in rage.acceptanceChecks)

    assert sneak_attack.engineFunction == "apply_sneak_attack"
    assert "class.rogue.feature.암습" in sneak_attack.sourceEntityIds
    assert "rule.combat.attack_roll" in sneak_attack.sourceRuleIds
    assert any("at most once per turn" in check for check in sneak_attack.acceptanceChecks)
    assert any("finesse weapon or ranged weapon" in check for check in sneak_attack.acceptanceChecks)

    assert cunning_action.engineFunction == "apply_cunning_action"
    assert "class.rogue.feature.교활한_행동" in cunning_action.sourceEntityIds
    assert any("Dash, Disengage, or Hide" in check for check in cunning_action.acceptanceChecks)

    assert frenzy.engineFunction == "apply_frenzy"
    assert "class.barbarian.subclass_feature.광분" in frenzy.sourceEntityIds
    assert any("only when entering rage" in check for check in frenzy.acceptanceChecks)
    assert any("exhaustion" in check for check in frenzy.acceptanceChecks)


def test_retrieval_returns_class_feature_hooks_for_barbarian_and_rogue_text():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=[],
        rule_fragments=build_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    rage_hooks = retriever.related_rule_hooks_for_text("바바리안이 격노를 사용한다")
    sneak_attack_hooks = retriever.related_rule_hooks_for_text("로그가 암습 피해를 적용할 수 있는지 확인한다")
    cunning_action_hooks = retriever.related_rule_hooks_for_text("로그가 교활한 행동으로 숨기를 시도한다")
    frenzy_hooks = retriever.related_rule_hooks_for_text("광전사 바바리안이 광분을 선언한다")

    assert rage_hooks[0].id == "hook.class.barbarian.rage"
    assert sneak_attack_hooks[0].id == "hook.class.rogue.sneak_attack"
    assert cunning_action_hooks[0].id == "hook.class.rogue.cunning_action"
    assert frenzy_hooks[0].id == "hook.class.barbarian.frenzy"


def test_retrieval_does_not_return_entity_specific_spell_hook_from_attack_rule_only():
    retriever = SrdRetriever(
        spells=build_spells(),
        conditions=parse_conditions(),
        magic_items=build_magic_items(),
        rule_fragments=build_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    text = "넘어짐 상태에서 일어나서 적을 공격하려고 한다"
    entities = retriever.related_entities_for_text(text)
    fragments = retriever.related_rule_fragments_for_text(text)
    hooks = retriever.related_rule_hooks_for_text(text, entities=entities, rule_fragments=fragments)
    hook_ids = {hook.id for hook in hooks}

    assert "hook.condition.apply_prone_modifiers" in hook_ids
    assert "hook.combat.resolve_attack_roll" in hook_ids
    assert "hook.spell.cast_chill_touch" not in hook_ids
