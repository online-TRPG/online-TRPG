import json
from pathlib import Path

from app.srd.build import EXPECTED_COUNTS, build, build_qa_report, build_rule_fragments, build_source_manifest, build_spells, parse_conditions


def test_source_manifest_includes_translated_spell_files():
    manifest = build_source_manifest()

    paths = {entry.path for entry in manifest.files}

    assert "translated/spells/INDEX.md" in paths
    assert "translated/spells/play-reference-a.md" in paths
    assert manifest.expectedCounts["spells"] == 319


def test_spell_parser_preserves_expected_count_and_sources():
    spells = build_spells()

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
    assert acid_arrow.source.file == "translated/spells/play-reference-a.md"
    assert acid_arrow.source.page == "p.114"


def test_build_writes_manifest_and_spell_jsonl():
    output_dir = Path("runtime_logs_test") / "srd_build"
    result = build(output_dir)

    spell_path = output_dir / "spells.jsonl"
    manifest_path = output_dir / "source_manifest.json"
    qa_path = output_dir / "srd_qa_report.json"

    assert result["spells"] == 319
    assert spell_path.exists()
    assert manifest_path.exists()
    assert qa_path.exists()
    rows = [json.loads(line) for line in spell_path.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 319
    assert rows[0]["id"].startswith("spell.")


def test_spell_common_field_coverage_meets_plan_threshold():
    spells = build_spells()
    report = build_qa_report(spells, parse_conditions(), build_rule_fragments())

    coverage = report["spells"]["commonFieldCoverage"]

    assert all(item["ratio"] >= 0.95 for item in coverage.values())
