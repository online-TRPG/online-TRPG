from app.srd.build import (
    EXPECTED_COUNTS,
    build_equipment_items,
)
from app.srd.retrieval import SrdRetriever, load_classes, load_magic_items


def test_generated_magic_item_catalog_preserves_expected_count_and_core_fields():
    items = load_magic_items()

    bag = next(item for item in items if item.id == "magic_item.bag_of_holding")

    assert len(items) == EXPECTED_COUNTS["magic_items"]
    assert bag.nameEn == "Bag of Holding"
    assert bag.nameKo == "보유의 주머니"
    assert bag.requiresAttunement is False
    assert bag.source.page == "p.210"
    assert "보유" in bag.nameKo
    assert bag.playReference


def test_magic_item_retrieval_matches_korean_and_english_names():
    retriever = SrdRetriever(magic_items=load_magic_items(), spells=[], conditions=[])

    ko_matches = retriever.related_entities_for_text("보유의 주머니를 열어본다")
    en_matches = retriever.related_entities_for_text("I open the Bag of Holding")

    assert any(match.id == "magic_item.bag_of_holding" for match in ko_matches)
    assert any(match.id == "magic_item.bag_of_holding" for match in en_matches)


def test_equipment_items_include_expanded_srd_tables():
    items = build_equipment_items(load_classes())
    by_source_table = {}
    by_name_en = {item.nameEn: item for item in items if item.nameEn}
    for item in items:
        by_source_table[item.sourceTable] = by_source_table.get(item.sourceTable, 0) + 1

    assert len(items) >= 140
    assert by_source_table["srd_adventuring_gear_table"] >= 30
    assert by_source_table["srd_tool_table"] >= 15
    assert by_source_table["srd_mount_and_vehicle_table"] >= 15
    assert by_source_table["srd_trade_goods_table"] >= 10

    assert by_name_en["Acid (vial)"].costRaw == "25 gp"
    assert by_name_en["Acid (vial)"].nameKo == "산성 약병"
    assert "Acid (vial)" in by_name_en["Acid (vial)"].aliasesKo
    assert by_name_en["Thieves' tools"].kind == "tool"
    assert by_name_en["Thieves' tools"].nameKo == "도둑 도구"
    assert "class.rogue" in by_name_en["Thieves' tools"].sourceClassIds
    assert not any(item.id == "equipment.도둑_도구" for item in items)
    assert by_name_en["Warhorse"].equipmentCategory == "mount"
    assert by_name_en["Warhorse"].nameKo == "전투마"
    assert by_name_en["Gold (1 lb.)"].kind == "trade_good"
    assert by_name_en["Gold (1 lb.)"].nameKo == "금(1파운드)"
