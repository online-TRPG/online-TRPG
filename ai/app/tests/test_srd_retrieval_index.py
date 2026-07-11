from app.srd.retrieval import (
    SrdRetriever,
    load_classes,
    load_conditions,
    load_magic_items,
    load_monsters,
    load_races,
    load_rule_cards,
    load_rule_hooks,
    load_spells,
)
from scripts.benchmark_srd_retrieval import QUERIES, scale_catalog


def build_retriever() -> SrdRetriever:
    return SrdRetriever(
        spells=load_spells(),
        conditions=load_conditions(),
        magic_items=load_magic_items(),
        monsters=load_monsters(),
        races=load_races(),
        classes=load_classes(),
        rule_cards=load_rule_cards(),
        rule_hooks=load_rule_hooks(),
    )


def build_scaled_retriever(scale: int) -> SrdRetriever:
    return SrdRetriever(
        spells=scale_catalog(load_spells(), scale),
        conditions=scale_catalog(load_conditions(), scale),
        magic_items=scale_catalog(load_magic_items(), scale),
        monsters=scale_catalog(load_monsters(), scale),
        races=scale_catalog(load_races(), scale),
        classes=scale_catalog(load_classes(), scale),
        rule_cards=scale_catalog(load_rule_cards(), scale),
        rule_hooks=scale_catalog(load_rule_hooks(), scale),
    )


def result_ids(retriever: SrdRetriever, query: str) -> list[str]:
    entities = retriever.related_entities_for_text(query)
    cards = retriever.related_rule_cards_for_text(query)
    hooks = retriever.related_rule_hooks_for_text(query, entities=entities)
    return [
        *(entity.id for entity in entities),
        *(card.id for card in cards),
        *(hook.id for hook in hooks),
    ]


def test_indexed_entity_search_preserves_representative_alias_results():
    retriever = build_retriever()

    assert retriever.find_spells("산성 화살을 시전한다")[0].id == "spell.acid_arrow"
    assert retriever.find_spells("I cast Acid Arrow")[0].id == "spell.acid_arrow"
    assert retriever.find_conditions("넘어짐 상태")[0].id == "condition.prone"
    assert retriever.find_magic_items("보유의 주머니를 연다")[0].id == "magic_item.bag_of_holding"
    assert retriever.find_monsters("고블린이 나타났다")[0].id == "monster.goblin"
    assert retriever.find_races("드워프 캐릭터")[0].id == "race.dwarf"
    assert retriever.find_classes("파이터 캐릭터")[0].id == "class.fighter"


def test_indexed_rule_scoring_keeps_existing_order_and_limits():
    retriever = build_retriever()

    cards = retriever.related_rule_cards_for_text("공격 굴림과 넘어짐 상태를 처리한다", limit=3)
    hooks = retriever.related_rule_hooks_for_text("파이터가 재기의 숨결로 회복한다", limit=2)

    assert len(cards) <= 3
    assert any(card.id == "rule.combat.공격_굴림" for card in cards)
    assert len(hooks) <= 2
    assert hooks[0].id == "hook.class.fighter.second_wind"


def test_retriever_exposes_startup_index_size_metrics():
    retriever = build_retriever()

    assert retriever.index_stats["build_duration_ms"] >= 0
    assert retriever.index_stats["entity_count"] > 0
    assert retriever.index_stats["alias_count"] > 0
    assert retriever.index_stats["ngram_key_count"] > 0
    assert retriever.index_stats["posting_count"] > 0
    assert retriever.index_stats["estimated_bytes"] > 0


def test_synthetic_scale_catalog_preserves_representative_result_order():
    baseline = build_scaled_retriever(1)
    scaled = build_scaled_retriever(10)

    for query in QUERIES:
        assert result_ids(scaled, query) == result_ids(baseline, query)
