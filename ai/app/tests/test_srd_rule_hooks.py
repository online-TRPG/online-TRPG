from pathlib import Path

from app.srd.build import (
    build_backend_engine_p0_contracts,
    build_interpreter_backend_handoff_cases,
    build_narrator_input_fixture_cases,
    build_rule_hook_fixtures,
    P0_BACKEND_HOOK_IDS,
)
from app.schemas.harness import NarratorHarnessRequest
from app.srd.retrieval import (
    load_classes,
    load_conditions,
    load_magic_items,
    load_rule_cards,
    load_rule_fragments,
    load_spells,
)
from app.srd.retrieval import SrdRetriever


def test_rule_hook_fixtures_cover_narrow_engine_owned_slice():
    hooks = build_rule_hook_fixtures()
    hook_ids = {hook.id for hook in hooks}

    assert hook_ids == {
        "hook.combat.resolve_attack_roll",
        "hook.damage.apply_resistance_vulnerability",
        "hook.check.resolve_ability_or_skill_check",
        "hook.condition.apply_prone_modifiers",
        "hook.spell.cast_chill_touch",
        "hook.spell.cast_fire_bolt",
        "hook.spell.cast_magic_missile",
        "hook.spell.cast_cure_wounds",
        "hook.item.bag_of_holding_capacity",
        "hook.item.use_potion_of_healing",
        "hook.item.apply_flat_magic_bonus",
        "hook.class.ranger.fighting_style_archery",
        "hook.class.ranger.natural_explorer_check",
        "hook.class.fighter.second_wind",
        "hook.class.fighter.action_surge",
        "hook.class.fighter.champion_critical_threshold",
        "hook.class.rogue.sneak_attack",
        "hook.class.rogue.cunning_action",
    }
    assert all(hook.consumes for hook in hooks)
    assert all(hook.produces for hook in hooks)
    assert all("decide_game_truth" in hook.aiForbiddenUse for hook in hooks)


def test_rule_hook_fixture_source_ids_resolve_to_generated_catalogs():
    hooks = build_rule_hook_fixtures()
    rule_ids = {card.id for card in load_rule_cards()} | {fragment.id for fragment in load_rule_fragments()}
    entity_ids = (
        {spell.id for spell in load_spells()}
        | {condition.id for condition in load_conditions()}
        | {item.id for item in load_magic_items()}
    )
    for class_option in load_classes():
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

def test_backend_engine_p0_contracts_match_rule_hook_io():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}
    cases = build_backend_engine_p0_contracts(list(hooks.values()))
    case_ids = {case.hookId for case in cases}
    contract_case_ids = {case.caseId for case in cases}

    assert case_ids == P0_BACKEND_HOOK_IDS
    assert len(contract_case_ids) == len(cases)
    assert len(cases) == 22

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

def test_interpreter_backend_handoff_cases_reference_p0_hooks_and_contract_shape():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}
    contract_hook_ids = {case.hookId for case in build_backend_engine_p0_contracts(list(hooks.values()))}
    handoff_cases = build_interpreter_backend_handoff_cases(list(hooks.values()))

    assert {case.caseId for case in handoff_cases} == {
        "handoff.chill_touch_spell_attack",
        "handoff.weapon_attack_with_damage",
        "handoff.prone_stand_then_attack",
        "handoff.fire_bolt_spell_attack",
        "handoff.fighter_second_wind",
        "handoff.rogue_sneak_attack",
        "handoff.potion_of_healing",
        "handoff.investigate_tracks_skill_check",
        "handoff.magic_missile_auto_hit",
        "handoff.ranger_cure_wounds",
        "handoff.combat_victory_to_conclusion",
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

def test_narrator_input_fixture_cases_validate_against_harness_request_schema():
    handoff_case_ids = {case.caseId for case in build_interpreter_backend_handoff_cases()}
    narrator_cases = build_narrator_input_fixture_cases()

    assert {case.caseId for case in narrator_cases} == {
        "narrator.chill_touch_hit",
        "narrator.weapon_attack_hit",
        "narrator.prone_stand_rejected",
        "narrator.fire_bolt_hit",
        "narrator.second_wind_heal",
        "narrator.sneak_attack_hit",
        "narrator.potion_of_healing",
        "narrator.investigate_tracks_success",
        "narrator.magic_missile_finishes_goblin",
        "narrator.ranger_cure_wounds",
        "narrator.combat_victory_conclusion",
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

def test_backend_engine_integration_plan_mentions_all_rule_hooks():
    plan = Path("BACKEND_ENGINE_INTEGRATION_PLAN.md").read_text(encoding="utf-8")

    for hook in build_rule_hook_fixtures():
        assert hook.id in plan
        assert hook.engineFunction in plan


def test_retrieval_returns_spell_and_attack_hooks_for_chill_touch():
    retriever = SrdRetriever(
        spells=load_spells(),
        conditions=load_conditions(),
        magic_items=load_magic_items(),
        rule_fragments=load_rule_fragments(),
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
        magic_items=load_magic_items(),
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
        rule_fragments=load_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    second_wind_hooks = retriever.related_rule_hooks_for_text("파이터가 재기의 숨결로 회복한다")
    action_surge_hooks = retriever.related_rule_hooks_for_text("행동 연쇄를 써서 추가 행동을 얻는다")
    critical_hooks = retriever.related_rule_hooks_for_text("챔피언의 향상된 치명타가 적용되는지 확인한다")

    assert second_wind_hooks[0].id == "hook.class.fighter.second_wind"
    assert action_surge_hooks[0].id == "hook.class.fighter.action_surge"
    assert critical_hooks[0].id == "hook.class.fighter.champion_critical_threshold"


def test_class_feature_hooks_cover_rogue_engine_owned_features():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}

    sneak_attack = hooks["hook.class.rogue.sneak_attack"]
    cunning_action = hooks["hook.class.rogue.cunning_action"]

    assert sneak_attack.engineFunction == "apply_sneak_attack"
    assert "class.rogue.feature.암습" in sneak_attack.sourceEntityIds
    assert "rule.combat.attack_roll" in sneak_attack.sourceRuleIds
    assert any("at most once per turn" in check for check in sneak_attack.acceptanceChecks)
    assert any("finesse weapon or ranged weapon" in check for check in sneak_attack.acceptanceChecks)

    assert cunning_action.engineFunction == "apply_cunning_action"
    assert "class.rogue.feature.교활한_행동" in cunning_action.sourceEntityIds
    assert any("Dash, Disengage, or Hide" in check for check in cunning_action.acceptanceChecks)


def test_retrieval_returns_class_feature_hooks_for_rogue_text():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=[],
        rule_fragments=load_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    sneak_attack_hooks = retriever.related_rule_hooks_for_text("로그가 암습 피해를 적용할 수 있는지 확인한다")
    cunning_action_hooks = retriever.related_rule_hooks_for_text("로그가 교활한 행동으로 숨기를 시도한다")

    assert sneak_attack_hooks[0].id == "hook.class.rogue.sneak_attack"
    assert cunning_action_hooks[0].id == "hook.class.rogue.cunning_action"


def test_class_feature_hooks_cover_ranger_engine_owned_features():
    hooks = {hook.id: hook for hook in build_rule_hook_fixtures()}

    archery = hooks["hook.class.ranger.fighting_style_archery"]
    natural_explorer = hooks["hook.class.ranger.natural_explorer_check"]

    assert archery.engineFunction == "apply_ranger_archery_fighting_style"
    assert archery.sourceEntityIds == []
    assert any("+2" in check for check in archery.acceptanceChecks)
    assert any("ranged weapon attacks" in check for check in archery.acceptanceChecks)

    assert natural_explorer.engineFunction == "apply_ranger_natural_explorer_check"
    assert "class.ranger.feature.자연_탐험가" in natural_explorer.sourceEntityIds
    assert any("favored terrain" in check for check in natural_explorer.acceptanceChecks)
    assert any("proficiency bonus is doubled" in check for check in natural_explorer.acceptanceChecks)


def test_retrieval_returns_class_feature_hooks_for_ranger_text():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=[],
        rule_fragments=load_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    archery_hooks = retriever.related_rule_hooks_for_text("레인저가 롱보우로 고블린을 공격한다")
    explorer_hooks = retriever.related_rule_hooks_for_text("레인저가 자연 탐험가로 생존 판정을 한다")

    assert archery_hooks[0].id == "hook.class.ranger.fighting_style_archery"
    assert explorer_hooks[0].id == "hook.class.ranger.natural_explorer_check"


def test_retrieval_returns_check_hook_for_exploration_text():
    retriever = SrdRetriever(
        spells=[],
        conditions=[],
        magic_items=[],
        rule_fragments=load_rule_fragments(),
        rule_hooks=build_rule_hook_fixtures(),
    )

    hooks = retriever.related_rule_hooks_for_text("rogue investigation skill check for tracks")

    assert hooks[0].id == "hook.check.resolve_ability_or_skill_check"


def test_retrieval_does_not_return_entity_specific_spell_hook_from_attack_rule_only():
    retriever = SrdRetriever(
        spells=load_spells(),
        conditions=load_conditions(),
        magic_items=load_magic_items(),
        rule_fragments=load_rule_fragments(),
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
