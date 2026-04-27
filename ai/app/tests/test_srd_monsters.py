import json
import re
from pathlib import Path

from app.srd.build import EXPECTED_COUNTS, build, build_monsters
from app.srd.retrieval import SrdRetriever


def test_monster_parser_preserves_expected_count_and_core_fields():
    monsters = build_monsters()

    aboleth = next(monster for monster in monsters if monster.id == "monster.aboleth")

    assert len(monsters) == EXPECTED_COUNTS["monsters"]
    assert aboleth.nameEn == "Aboleth"
    assert aboleth.nameKo == "아볼레스"
    assert aboleth.armorClassRaw == "17 (natural armor)"
    assert aboleth.hitPointsRaw == "135 (18d10 + 36)"
    assert aboleth.challengeRaw == "10 (5,900 XP)"
    assert "Tentacle" in aboleth.actions
    assert "Tail Swipe" in aboleth.legendaryActions
    assert aboleth.source.file == "translated/monsters/monster-play-reference-a-c.md"
    assert aboleth.source.page == "p.261"


def test_monster_korean_names_do_not_contain_latin_placeholders():
    monsters = build_monsters()

    unresolved = [monster for monster in monsters if re.search(r"[A-Za-z]", monster.nameKo)]

    assert unresolved == []


def test_monster_retrieval_matches_korean_and_english_names():
    retriever = SrdRetriever(monsters=build_monsters(), spells=[], conditions=[], magic_items=[])

    ko_matches = retriever.related_entities_for_text("아볼레스가 촉수로 공격한다")
    en_matches = retriever.related_entities_for_text("The Aboleth uses Tentacle")

    assert any(match.id == "monster.aboleth" and match.kind == "monster" for match in ko_matches)
    assert any(match.id == "monster.aboleth" and match.kind == "monster" for match in en_matches)


def test_build_writes_monster_jsonl():
    output_dir = Path("runtime_logs_test") / "srd_monsters_build"
    result = build(output_dir)

    monster_path = output_dir / "monsters.jsonl"

    assert result["monsters"] == 317
    assert monster_path.exists()
    rows = [json.loads(line) for line in monster_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == 317
    assert rows[0]["id"].startswith("monster.")
