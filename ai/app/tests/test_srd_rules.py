from app.srd.build import EXPECTED_COUNTS, build_rule_cards, parse_conditions
from app.srd.retrieval import SrdRetriever


def test_condition_parser_preserves_srd_condition_count_and_effects():
    conditions = parse_conditions()

    blinded = next(condition for condition in conditions if condition.id == "condition.blinded")

    assert len(conditions) == EXPECTED_COUNTS["conditions"]
    assert blinded.nameKo == "눈멂"
    assert any("자동 실패" in effect for effect in blinded.effects)
    assert blinded.source.file == "translated/rules/상태_이상.md"


def test_rule_cards_mark_engine_owned_combat_rules():
    cards = build_rule_cards()

    attack_roll = next(card for card in cards if card.id == "rule.combat.공격_굴림")

    assert len(cards) > 40
    assert attack_roll.engineOwned is True
    assert "decide_hit_or_miss" in attack_roll.aiForbiddenUse
    assert "AC 이상이면 명중" in attack_roll.summaryKo


def test_retrieval_finds_conditions_and_rule_cards():
    retriever = SrdRetriever(rule_cards=build_rule_cards(), conditions=parse_conditions(), spells=[])

    entities = retriever.related_entities_for_text("넘어짐 상태에서 일어나고 공격한다")
    cards = retriever.related_rule_cards_for_text("공격 굴림과 넘어짐 상태를 처리한다")

    assert any(entity.id == "condition.prone" for entity in entities)
    assert any(card.id == "rule.combat.공격_굴림" for card in cards)


def test_spell_driven_rule_fragments_keep_chill_touch_context_small():
    from app.srd.build import build_rule_fragments, build_spells

    spells = build_spells()
    chill_touch = next(spell for spell in spells if spell.id == "spell.chill_touch")
    retriever = SrdRetriever(spells=spells, conditions=[], rule_fragments=build_rule_fragments())

    fragments = retriever.related_rule_fragments_for_text(
        "싸늘한 손길을 고블린에게 시전한다.",
        spells=[chill_touch],
    )
    fragment_ids = {fragment.id for fragment in fragments}
    combined_summary = " ".join(fragment.summaryKo for fragment in fragments)

    assert "rule.spellcasting.casting_time.action" in fragment_ids
    assert "rule.spellcasting.range" in fragment_ids
    assert "rule.spellcasting.spell_attack" in fragment_ids
    assert "rule.combat.attack_roll" in fragment_ids
    assert "rule.spellcasting.casting_time.bonus_action" not in fragment_ids
    assert "rule.spellcasting.casting_time.long" not in fragment_ids
    assert "추가 행동 주문" not in combined_summary
    assert "긴 주문" not in combined_summary
