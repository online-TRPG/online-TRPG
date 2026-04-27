import json
from pathlib import Path

from app.srd.build import (
    build,
    build_magic_items,
    build_class_options,
    build_rule_cards,
    build_rule_fragments,
    build_rule_hook_fixtures,
    build_spells,
    parse_conditions,
)
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

    assert result["rule_hook_fixtures"] == 8
    assert hooks_path.exists()
    payload = json.loads(hooks_path.read_text(encoding="utf-8"))
    assert len(payload["hooks"]) == 8
    assert load_rule_hooks(hooks_path)[0].id.startswith("hook.")


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
