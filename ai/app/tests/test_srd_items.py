import json
from pathlib import Path

from app.srd.build import EXPECTED_COUNTS, build, build_equipment_references, build_magic_items
from app.srd.retrieval import SrdRetriever


def test_magic_item_parser_preserves_expected_count_and_core_fields():
    items = build_magic_items()

    bag = next(item for item in items if item.id == "magic_item.bag_of_holding")

    assert len(items) == EXPECTED_COUNTS["magic_items"]
    assert bag.nameEn == "Bag of Holding"
    assert bag.nameKo == "보유의 주머니"
    assert bag.requiresAttunement is False
    assert bag.source.page == "p.210"
    assert "보유" in bag.nameKo
    assert bag.playReference


def test_equipment_reference_parser_produces_play_sections():
    references = build_equipment_references()

    armor = next(reference for reference in references if reference.id == "equipment_rule.갑옷_핵심_규칙")

    assert len(references) >= 8
    assert "방패는 AC +2" in armor.summaryKo


def test_magic_item_retrieval_matches_korean_and_english_names():
    retriever = SrdRetriever(magic_items=build_magic_items(), spells=[], conditions=[])

    ko_matches = retriever.related_entities_for_text("보유의 주머니를 열어본다")
    en_matches = retriever.related_entities_for_text("I open the Bag of Holding")

    assert any(match.id == "magic_item.bag_of_holding" for match in ko_matches)
    assert any(match.id == "magic_item.bag_of_holding" for match in en_matches)


def test_build_writes_magic_item_and_equipment_jsonl():
    output_dir = Path("runtime_logs_test") / "srd_items_build"
    result = build(output_dir)

    magic_items_path = output_dir / "magic_items.jsonl"
    equipment_path = output_dir / "equipment.jsonl"

    assert result["magic_items"] == 239
    assert result["equipment_references"] >= 8
    assert magic_items_path.exists()
    assert equipment_path.exists()
    assert len([line for line in magic_items_path.read_text(encoding="utf-8").splitlines() if line.strip()]) == 239
    assert json.loads(equipment_path.read_text(encoding="utf-8").splitlines()[0])["id"].startswith("equipment_rule.")
