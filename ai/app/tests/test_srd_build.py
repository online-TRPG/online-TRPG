from app.srd.build import (
    EXPECTED_COUNTS,
    build_qa_report,
)
from app.srd.retrieval import load_conditions, load_rule_fragments, load_spells


def test_generated_spell_catalog_preserves_expected_count_and_core_fields():
    spells = load_spells()

    acid_arrow = next(spell for spell in spells if spell.id == "spell.acid_arrow")

    assert len(spells) == EXPECTED_COUNTS["spells"]
    assert acid_arrow.nameEn == "Acid Arrow"
    assert acid_arrow.nameKo == "산성 화살"
    assert acid_arrow.level == 2
    assert acid_arrow.castingTime is not None
    assert acid_arrow.castingTime.raw == "1 행동"
    assert acid_arrow.range is not None
    assert acid_arrow.range.raw == "90피트"
    assert acid_arrow.components is not None
    assert acid_arrow.components.verbal is True
    assert acid_arrow.components.somatic is True
    assert acid_arrow.duration is not None
    assert acid_arrow.duration.raw == "즉시"
    assert "원거리 주문 공격" in acid_arrow.playReference
    assert acid_arrow.source.file
    assert acid_arrow.source.page == "p.114"


def test_spell_common_field_coverage_meets_plan_threshold():
    spells = load_spells()
    report = build_qa_report(spells, load_conditions(), load_rule_fragments())

    coverage = report["spells"]["commonFieldCoverage"]

    assert all(item["ratio"] >= 0.95 for item in coverage.values())
