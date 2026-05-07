import argparse
import hashlib
import json
import re
from pathlib import Path

from app.srd.models import (
    BackendEngineContractCase,
    Condition,
    ClassOption,
    ClassSpellcastingProgression,
    EquipmentItem,
    EquipmentReference,
    InterpreterBackendHandoffCase,
    MagicItem,
    Monster,
    NarratorInputFixtureCase,
    RaceOption,
    RuleCard,
    RuleFragment,
    RuleHookFixture,
    SourceManifest,
    SourceManifestEntry,
    Spell,
    SpellCastingTime,
    SpellComponents,
    SpellDuration,
    SpellRange,
    SpellSource,
)


AI_ROOT = Path(__file__).resolve().parents[2]
TRANSLATED_ROOT = AI_ROOT / "translated"
GENERATED_ROOT = AI_ROOT / "generated" / "srd"

EXPECTED_COUNTS = {
    "spells": 319,
    "conditions": 15,
    "magic_items": 239,
    "monsters": 317,
    "classes": 12,
    "races": 9,
}

SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
SUBSECTION_RE = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
SPELL_INDEX_ROW_RE = re.compile(
    r"^\|\s*(?P<number>\d+)\s*\|\s*(?P<name_en>[^|]+?)\s*\|\s*(?P<name_ko>[^|]+?)\s*\|",
    re.MULTILINE,
)


def slugify(value: str) -> str:
    value = value.lower()
    value = value.replace("’", "").replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def slugify_ko(value: str) -> str:
    value = value.strip().casefold()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^\w가-힣]+", "_", value)
    return value.strip("_")


def relative_to_ai(path: Path) -> str:
    return path.relative_to(AI_ROOT).as_posix()


def build_source_manifest() -> SourceManifest:
    entries: list[SourceManifestEntry] = []
    for path in sorted(TRANSLATED_ROOT.rglob("*.md")):
        content = path.read_bytes()
        relative = path.relative_to(TRANSLATED_ROOT)
        domain = relative.parts[0] if len(relative.parts) > 1 else "root"
        entries.append(
            SourceManifestEntry(
                path=relative_to_ai(path),
                domain=domain,
                bytes=len(content),
                sha256=hashlib.sha256(content).hexdigest(),
            )
        )
    return SourceManifest(
        sourceRoot=relative_to_ai(TRANSLATED_ROOT),
        files=entries,
        expectedCounts=EXPECTED_COUNTS,
    )


def parse_spell_index() -> dict[str, dict[str, str]]:
    index_path = TRANSLATED_ROOT / "spells" / "INDEX.md"
    text = index_path.read_text(encoding="utf-8")
    index: dict[str, dict[str, str]] = {}
    for match in SPELL_INDEX_ROW_RE.finditer(text):
        name_en = match.group("name_en").strip()
        index[name_en.casefold()] = {
            "number": match.group("number").strip(),
            "nameEn": name_en,
            "nameKo": match.group("name_ko").strip(),
        }
    return index


def parse_magic_item_index() -> dict[str, dict[str, str]]:
    index_path = TRANSLATED_ROOT / "items" / "magic-items-index.md"
    text = index_path.read_text(encoding="utf-8")
    index: dict[str, dict[str, str]] = {}
    for match in SPELL_INDEX_ROW_RE.finditer(text):
        name_en = match.group("name_en").strip()
        index[name_en.casefold()] = {
            "number": match.group("number").strip(),
            "nameEn": name_en,
            "nameKo": match.group("name_ko").strip(),
        }
    return index


def parse_monster_index() -> dict[str, dict[str, str]]:
    index_path = TRANSLATED_ROOT / "monsters" / "INDEX.md"
    text = index_path.read_text(encoding="utf-8")
    index: dict[str, dict[str, str]] = {}
    for match in re.finditer(
        r"^\|\s*(?P<number>\d+)\s*\|\s*(?P<name_en>[^|]+?)\s*\|\s*(?P<name_ko>[^|]+?)\s*\|\s*(?P<page>[^|]+?)\s*\|\s*(?P<source>[^|]+?)\s*\|",
        text,
        re.MULTILINE,
    ):
        name_en = match.group("name_en").strip()
        index[name_en.casefold()] = {
            "number": match.group("number").strip(),
            "nameEn": name_en,
            "nameKo": match.group("name_ko").strip(),
            "page": match.group("page").strip(),
            "source": match.group("source").strip(),
        }
    return index


def iter_spell_blocks() -> list[tuple[Path, str, str]]:
    blocks: list[tuple[Path, str, str]] = []
    spell_dir = TRANSLATED_ROOT / "spells"
    paths = sorted(
        path
        for path in spell_dir.glob("play-reference-*.md")
        if path.name != "play-reference-progress.md"
    )
    for path in paths:
        text = path.read_text(encoding="utf-8")
        matches = list(SECTION_RE.finditer(text))
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            blocks.append((path, match.group(1).strip(), text[start:end].strip()))
    return blocks


def iter_magic_item_blocks() -> list[tuple[Path, str, str]]:
    blocks: list[tuple[Path, str, str]] = []
    item_dir = TRANSLATED_ROOT / "items"
    paths = sorted(path for path in item_dir.glob("magic-item-play-reference-*.md"))
    for path in paths:
        text = path.read_text(encoding="utf-8")
        matches = list(SECTION_RE.finditer(text))
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            blocks.append((path, match.group(1).strip(), text[start:end].strip()))
    return blocks


def iter_monster_blocks() -> list[tuple[Path, str, str]]:
    blocks: list[tuple[Path, str, str]] = []
    monster_dir = TRANSLATED_ROOT / "monsters"
    paths = sorted(path for path in monster_dir.glob("monster-play-reference-*.md"))
    for path in paths:
        text = path.read_text(encoding="utf-8")
        matches = list(SECTION_RE.finditer(text))
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            blocks.append((path, match.group(1).strip(), text[start:end].strip()))
    return blocks


def split_spell_heading(heading: str) -> tuple[str, str]:
    if " / " not in heading:
        return heading.strip(), heading.strip()
    name_en, name_ko = heading.split(" / ", 1)
    return name_en.strip(), name_ko.strip()


def split_slash_heading(heading: str) -> tuple[str, str]:
    if " / " not in heading:
        return heading.strip(), heading.strip()
    name_en, name_ko = heading.split(" / ", 1)
    return name_en.strip(), name_ko.strip()


def parse_bullet_value(block: str, label: str) -> str | None:
    pattern = re.compile(rf"^-\s*{re.escape(label)}:\s*(.+?)\s*$", re.MULTILINE)
    match = pattern.search(block)
    return match.group(1).strip() if match else None


def parse_section_text(block: str, title: str) -> str | None:
    pattern = re.compile(
        rf"^###\s*{re.escape(title)}\s*$\n(?P<body>.*?)(?=^###\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(block)
    if not match:
        return None
    return match.group("body").strip()


def parse_heading_section_text(text: str, title: str, level: int = 2) -> str | None:
    hashes = "#" * level
    pattern = re.compile(
        rf"^{hashes}\s*{re.escape(title)}\s*$\n(?P<body>.*?)(?=^{hashes}\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    return match.group("body").strip() if match else None


def iter_markdown_sections(path: Path, pattern: re.Pattern[str] = SECTION_RE) -> list[tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    matches = list(pattern.finditer(text))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections.append((match.group(1).strip(), text[start:end].strip()))
    return sections


def summarize_markdown(block: str, max_chars: int = 650) -> str:
    lines: list[str] = []
    in_table = False
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("|"):
            if not in_table:
                lines.append("표 정보 포함.")
                in_table = True
            continue
        in_table = False
        if line.startswith("```"):
            continue
        if line.startswith(">"):
            continue
        lines.append(line.removeprefix("- ").strip())
    summary = " ".join(lines)
    summary = re.sub(r"\s+", " ", summary).strip()
    if len(summary) <= max_chars:
        return summary
    return summary[: max_chars - 1].rstrip() + "…"


def parse_level_school(raw: str | None) -> tuple[int | None, str | None, bool]:
    if not raw:
        return None, None, False
    ritual = "의식" in raw
    cleaned = raw.replace("(의식)", "").strip()
    if "캔트립" in cleaned:
        school = cleaned.replace("캔트립", "").strip()
        return 0, school or None, ritual
    match = re.match(r"(?P<level>\d+)레벨\s*(?P<school>.+)?", cleaned)
    if not match:
        return None, cleaned or None, ritual
    school = (match.group("school") or "").strip()
    return int(match.group("level")), school or None, ritual


def parse_components(raw: str | None) -> SpellComponents | None:
    if raw is None:
        return None
    return SpellComponents(
        verbal="음성" in raw,
        somatic="동작" in raw,
        material=raw[raw.find("물질") :].strip() if "물질" in raw else None,
        raw=raw,
    )


def parse_spell(path: Path, heading: str, block: str, index: dict[str, dict[str, str]]) -> Spell:
    name_en, heading_name_ko = split_spell_heading(heading)
    indexed = index.get(name_en.casefold())
    name_ko = heading_name_ko
    if indexed and indexed["nameKo"] != heading_name_ko:
        name_ko = heading_name_ko

    level_school = parse_bullet_value(block, "등급/학파")
    level, school_ko, ritual = parse_level_school(level_school)
    duration = parse_bullet_value(block, "지속시간")
    play_reference = parse_section_text(block, "플레이 참조문") or ""
    review_notes = parse_section_text(block, "검수 포인트")
    source_page = parse_bullet_value(block, "원문 위치")

    return Spell(
        id=f"spell.{slugify(name_en)}",
        nameEn=name_en,
        nameKo=name_ko,
        level=level,
        schoolKo=school_ko,
        ritual=ritual,
        castingTime=SpellCastingTime(raw=parse_bullet_value(block, "시전 시간") or "")
        if parse_bullet_value(block, "시전 시간")
        else None,
        range=SpellRange(raw=parse_bullet_value(block, "거리") or "")
        if parse_bullet_value(block, "거리")
        else None,
        components=parse_components(parse_bullet_value(block, "구성요소")),
        duration=SpellDuration(raw=duration) if duration else None,
        concentration="집중" in duration if duration else False,
        playReference=play_reference,
        higherLevel=parse_section_text(block, "고레벨 슬롯"),
        scaling=parse_section_text(block, "성장"),
        reviewNotes=[line.removeprefix("- ").strip() for line in review_notes.splitlines() if line.strip()]
        if review_notes
        else [],
        source=SpellSource(
            file=relative_to_ai(path),
            page=source_page,
            heading=heading,
        ),
    )


def parse_category_rarity(raw: str | None) -> tuple[str | None, str | None]:
    if raw is None:
        return None, None
    if ")," in raw:
        category, rarity = raw.split("),", 1)
        return category.strip() + ")", rarity.strip()
    if "," in raw:
        category, rarity = raw.rsplit(",", 1)
        return category.strip(), rarity.strip()
    return raw.strip(), None


def parse_attunement(raw: str | None) -> bool | None:
    if raw is None:
        return None
    if "필요 없음" in raw:
        return False
    if "필요" in raw:
        return True
    return None


def parse_monster_basic(raw: str) -> dict[str, str | None]:
    parts = [part.strip() for part in raw.split(";")]
    parsed: dict[str, str | None] = {
        "basicRaw": raw,
        "armorClassRaw": None,
        "hitPointsRaw": None,
        "speedRaw": None,
        "challengeRaw": None,
    }
    for part in parts:
        if part.startswith("AC "):
            parsed["armorClassRaw"] = part.removeprefix("AC ").strip()
        elif part.startswith("HP "):
            parsed["hitPointsRaw"] = part.removeprefix("HP ").strip()
        elif part.startswith("속도 "):
            parsed["speedRaw"] = part.removeprefix("속도 ").strip()
        elif part.startswith("CR "):
            parsed["challengeRaw"] = part.removeprefix("CR ").strip()
    return parsed


def parse_named_list_from_sentence(text: str, prefix: str) -> list[str]:
    match = re.search(rf"{re.escape(prefix)}은\s*(.+?)(?:이다|이다\.|$)", text)
    if not match:
        return []
    raw = match.group(1).strip().rstrip(".")
    if raw in {"별도 특성 없음", "원문 행동 항목 확인"}:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def parse_monster(path: Path, heading: str, block: str, index: dict[str, dict[str, str]]) -> Monster:
    name_en, heading_name_ko = split_slash_heading(heading)
    indexed = index.get(name_en.casefold())
    name_ko = heading_name_ko
    if indexed and indexed["nameKo"] != heading_name_ko:
        name_ko = heading_name_ko

    basic = parse_bullet_value(block, "기본") or ""
    parsed_basic = parse_monster_basic(basic)
    play_reference = parse_section_text(block, "플레이 참조문") or ""
    review_notes = parse_section_text(block, "검수 포인트")
    source_page = parse_bullet_value(block, "원문 위치") or (indexed["page"] if indexed else None)

    return Monster(
        id=f"monster.{slugify(name_en)}",
        nameEn=name_en,
        nameKo=name_ko,
        basicRaw=parsed_basic["basicRaw"] or "",
        armorClassRaw=parsed_basic["armorClassRaw"],
        hitPointsRaw=parsed_basic["hitPointsRaw"],
        speedRaw=parsed_basic["speedRaw"],
        challengeRaw=parsed_basic["challengeRaw"],
        savesRaw=parse_bullet_value(block, "내성"),
        skillsRaw=parse_bullet_value(block, "기술"),
        damageVulnerabilitiesRaw=parse_bullet_value(block, "피해 취약"),
        damageResistancesRaw=parse_bullet_value(block, "피해 저항"),
        damageImmunitiesRaw=parse_bullet_value(block, "피해 면역"),
        conditionImmunitiesRaw=parse_bullet_value(block, "상태 면역"),
        sensesRaw=parse_bullet_value(block, "감각"),
        languagesRaw=parse_bullet_value(block, "언어"),
        traits=parse_named_list_from_sentence(play_reference, "핵심 특성"),
        actions=parse_named_list_from_sentence(play_reference, "주요 행동"),
        legendaryActions=parse_named_list_from_sentence(play_reference, "전설 행동"),
        playReference=play_reference,
        reviewNotes=[line.removeprefix("- ").strip() for line in review_notes.splitlines() if line.strip()]
        if review_notes
        else [],
        source=SpellSource(
            file=relative_to_ai(path),
            page=source_page,
            heading=heading,
        ),
    )


def parse_magic_item(path: Path, heading: str, block: str, index: dict[str, dict[str, str]]) -> MagicItem:
    name_en, heading_name_ko = split_slash_heading(heading)
    indexed = index.get(name_en.casefold())
    name_ko = heading_name_ko
    if indexed and indexed["nameKo"] != heading_name_ko:
        name_ko = heading_name_ko
    category_raw, rarity_raw = parse_category_rarity(parse_bullet_value(block, "분류/희귀도"))
    review_notes = parse_section_text(block, "검수 포인트")
    return MagicItem(
        id=f"magic_item.{slugify(name_en)}",
        nameEn=name_en,
        nameKo=name_ko,
        categoryRaw=category_raw,
        rarityRaw=rarity_raw,
        requiresAttunement=parse_attunement(parse_bullet_value(block, "조율")),
        playReference=parse_section_text(block, "플레이 참조문") or "",
        reviewNotes=[line.removeprefix("- ").strip() for line in review_notes.splitlines() if line.strip()]
        if review_notes
        else [],
        source=SpellSource(
            file=relative_to_ai(path),
            page=parse_bullet_value(block, "원문 위치"),
            heading=heading,
        ),
    )


def build_spells() -> list[Spell]:
    index = parse_spell_index()
    spells = [parse_spell(path, heading, block, index) for path, heading, block in iter_spell_blocks()]
    ids = [spell.id for spell in spells]
    if len(ids) != len(set(ids)):
        duplicates = sorted({spell_id for spell_id in ids if ids.count(spell_id) > 1})
        raise ValueError(f"Duplicate spell ids: {duplicates}")
    if len(spells) != EXPECTED_COUNTS["spells"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['spells']} spells, found {len(spells)}")
    return spells


def build_magic_items() -> list[MagicItem]:
    index = parse_magic_item_index()
    items = [parse_magic_item(path, heading, block, index) for path, heading, block in iter_magic_item_blocks()]
    ids = [item.id for item in items]
    if len(ids) != len(set(ids)):
        duplicates = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
        raise ValueError(f"Duplicate magic item ids: {duplicates}")
    if len(items) != EXPECTED_COUNTS["magic_items"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['magic_items']} magic items, found {len(items)}")
    return items


def build_monsters() -> list[Monster]:
    index = parse_monster_index()
    monsters = [parse_monster(path, heading, block, index) for path, heading, block in iter_monster_blocks()]
    ids = [monster.id for monster in monsters]
    if len(ids) != len(set(ids)):
        duplicates = sorted({monster_id for monster_id in ids if ids.count(monster_id) > 1})
        raise ValueError(f"Duplicate monster ids: {duplicates}")
    if len(monsters) != EXPECTED_COUNTS["monsters"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['monsters']} monsters, found {len(monsters)}")
    return monsters


def build_equipment_references() -> list[EquipmentReference]:
    path = TRANSLATED_ROOT / "items" / "general-equipment-reference.md"
    references: list[EquipmentReference] = []
    for title, block in iter_markdown_sections(path):
        references.append(
            EquipmentReference(
                id=f"equipment_rule.{slugify_ko(title)}",
                titleKo=title,
                summaryKo=summarize_markdown(block),
                source=SpellSource(file=relative_to_ai(path), page=None, heading=title),
            )
        )
    return references


def parse_conditions() -> list[Condition]:
    path = TRANSLATED_ROOT / "rules" / "상태_이상.md"
    text = path.read_text(encoding="utf-8")
    list_match = re.search(r"^##\s+상태 목록\s*$", text, re.MULTILINE)
    quick_match = re.search(r"^##\s+빠른 참조표\s*$", text, re.MULTILINE)
    if not list_match or not quick_match:
        raise ValueError("Could not locate condition list section")
    condition_text = text[list_match.end() : quick_match.start()].strip()
    conditions: list[Condition] = []
    for heading, block in iter_markdown_sections_from_text(condition_text, SUBSECTION_RE):
        original_name = re.search(r"^원문:\s*(.+?)\s*$", block, re.MULTILINE)
        if not original_name:
            raise ValueError(f"Condition missing original name: {heading}")
        effects = [
            line.removeprefix("- ").strip()
            for line in block.splitlines()
            if line.strip().startswith("- ")
        ]
        prose = [
            line.strip()
            for line in block.splitlines()
            if line.strip() and not line.startswith("원문:") and not line.strip().startswith("- ")
        ]
        all_effects = prose + effects
        conditions.append(
            Condition(
                id=f"condition.{slugify(original_name.group(1))}",
                nameEn=original_name.group(1).strip(),
                nameKo=heading,
                effects=all_effects,
                summaryKo=summarize_markdown("\n".join(all_effects)),
                source=SpellSource(
                    file=relative_to_ai(path),
                    page="p.358-359",
                    heading=heading,
                ),
            )
        )
    if len(conditions) != EXPECTED_COUNTS["conditions"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['conditions']} conditions, found {len(conditions)}")
    return conditions


def iter_markdown_sections_from_text(text: str, pattern: re.Pattern[str]) -> list[tuple[str, str]]:
    matches = list(pattern.finditer(text))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections.append((match.group(1).strip(), text[start:end].strip()))
    return sections


def clean_table_value(value: str) -> str:
    return value.strip().replace("`", "").strip()


def parse_markdown_table(block: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in block.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or "---" in stripped:
            continue
        cells = [clean_table_value(cell) for cell in stripped.strip("|").split("|")]
        rows.append(cells)
    return rows


def parse_markdown_table_dicts(block: str) -> list[dict[str, str]]:
    rows = parse_markdown_table(block)
    if not rows:
        return []
    headers = rows[0]
    return [
        {headers[index]: cell for index, cell in enumerate(row[: len(headers)])}
        for row in rows[1:]
        if any(cell for cell in row)
    ]


def parse_db_memo_fields(text: str) -> dict[str, str]:
    memo = re.search(r"^##\s+DB 분리 메모\s*$\n(?P<body>.*)", text, re.MULTILINE | re.DOTALL)
    if not memo:
        return {}
    fields: dict[str, str] = {}
    for cells in parse_markdown_table(memo.group("body")):
        if len(cells) >= 2 and cells[0] not in {"필드", "권장 의미"}:
            fields[cells[0]] = cells[1]
    return fields


def parse_original_name(block: str, label: str) -> str | None:
    match = re.search(rf"^-\s*{re.escape(label)}:\s*(.+?)\s*$", block, re.MULTILINE)
    return match.group(1).strip() if match else None


def parse_bullets_in_section(text: str, title: str) -> list[str]:
    block = parse_heading_section_text(text, title) or ""
    return [
        line.removeprefix("- ").strip()
        for line in block.splitlines()
        if line.strip().startswith("- ")
    ]


def split_korean_choice_options(raw: str) -> list[str]:
    normalized = raw.strip().rstrip(".")
    has_serial_choice = ", 또는" in normalized or " 중 하나" in normalized
    normalized = normalized.replace(", 또는", " 또는")
    normalized = normalized.replace(" 또는 ", "|")
    if " 중 하나" in normalized:
        normalized = normalized.replace(" 중 하나", "")
        normalized = normalized.replace(", ", "|")
    options: list[str] = []
    for part in normalized.split("|"):
        if has_serial_choice:
            options.extend(option.strip(" ,") for option in part.split(",") if option.strip(" ,"))
        elif part.strip(" ,"):
            options.append(part.strip(" ,"))
    return options or [raw.strip()]


CANONICAL_EQUIPMENT_NAME_ALIASES = {
    "나무 방패": "방패",
}


CLASS_STARTING_EQUIPMENT_FALLBACKS = {
    "class.cleric": [
        "메이스 또는 워해머",
        "스케일 메일, 가죽 갑옷, 체인 메일 중 하나",
        "라이트 크로스보우와 볼트 20개 또는 단순 무기 하나",
        "사제 꾸러미 또는 탐험가 꾸러미",
        "방패와 성표",
    ],
    "class.druid": [
        "방패 또는 단순 무기 하나",
        "시미터 또는 단순 근접 무기 하나",
        "가죽 갑옷, 탐험가 꾸러미, 드루이드 초점구",
    ],
    "class.ranger": [
        "스케일 메일 또는 가죽 갑옷",
        "쇼트소드 2개 또는 단순 근접 무기 2개",
        "던전 탐험가 꾸러미 또는 탐험가 꾸러미",
        "롱보우와 화살 20개",
    ],
    "class.sorcerer": [
        "라이트 크로스보우와 볼트 20개 또는 단순 무기 하나",
        "구성요소 파우치 또는 비전 초점구",
        "던전 탐험가 꾸러미 또는 탐험가 꾸러미",
        "단검 2개",
    ],
    "class.warlock": [
        "라이트 크로스보우와 볼트 20개 또는 단순 무기 하나",
        "구성요소 파우치 또는 비전 초점구",
        "학자 꾸러미 또는 던전 탐험가 꾸러미",
        "가죽 갑옷, 단순 무기 하나, 단검 2개",
    ],
    "class.wizard": [
        "쿼터스태프 또는 단검",
        "구성요소 파우치 또는 비전 초점구",
        "학자 꾸러미 또는 탐험가 꾸러미",
        "주문책",
    ],
    "class.paladin": [
        "군용 무기와 방패 또는 군용 무기 2개",
        "재블린 5개 또는 단순 근접 무기 하나",
        "사제 꾸러미 또는 탐험가 꾸러미",
        "체인 메일과 성표",
    ],
}


EQUIPMENT_KIND_PATTERNS = [
    ("armor", ("갑옷", "메일", "방패")),
    ("weapon", ("무기", "검", "소드", "액스", "도끼", "활", "보우", "크로스보우", "메이스", "스태프", "대거", "다트", "슬링", "스피어", "재블린", "단검", "레이피어")),
    ("ammunition", ("화살", "볼트")),
    ("pack", ("꾸러미",)),
    ("tool", ("도구", "악기", "류트", "초점구", "파우치", "성표", "주문책")),
]


def normalize_equipment_name(raw: str) -> tuple[str, str | None]:
    name = raw.strip()
    quantity_match = re.search(r"\s*(?P<count>\d+개|하나|2개|3개|4개)$", name)
    quantity = None
    if quantity_match:
        quantity = quantity_match.group("count")
        name = name[: quantity_match.start()].strip()
    name = name.removeprefix("원하는 ").strip()
    name = name.replace(" 한 벌", "").strip()
    name = CANONICAL_EQUIPMENT_NAME_ALIASES.get(name, name)
    return name, quantity


def expand_equipment_part(raw: str) -> list[str]:
    match = re.match(r"(?P<left>.+?)(?:와|과)\s+(?P<right>.+)$", raw.strip())
    if not match:
        return [raw]
    left = match.group("left").strip()
    right = match.group("right").strip()
    if not left or not right:
        return [raw]
    if any(token in left for token in ["갑옷", "메일", "방패", "무기", "꾸러미", "보우"]) or any(
        token in right for token in ["방패", "볼트", "화살", "단검", "재블린", "성표", "초점구", "파우치"]
    ):
        return [left, right]
    return [raw]


def classify_equipment(name: str) -> str:
    for kind, patterns in EQUIPMENT_KIND_PATTERNS:
        if any(pattern in name for pattern in patterns):
            return kind
    return "gear"


def equipment_item_id(name: str) -> str:
    return f"equipment.{slugify_ko(name)}"


def parse_starting_equipment_lines(text: str, class_id: str) -> list[str]:
    return parse_bullets_in_section(text, "시작 장비") or CLASS_STARTING_EQUIPMENT_FALLBACKS.get(class_id, [])


SRD_ARMOR_TABLE = [
    {"nameEn": "Padded Armor", "nameKo": "패딩 갑옷", "armorCategory": "light", "costRaw": "5 gp", "armorClassRaw": "11 + DEX modifier", "strengthRequirementRaw": None, "stealthRaw": "disadvantage", "weightRaw": "8 lb."},
    {"nameEn": "Leather Armor", "nameKo": "가죽 갑옷", "armorCategory": "light", "costRaw": "10 gp", "armorClassRaw": "11 + DEX modifier", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "10 lb."},
    {"nameEn": "Studded Leather Armor", "nameKo": "스터디드 가죽 갑옷", "armorCategory": "light", "costRaw": "45 gp", "armorClassRaw": "12 + DEX modifier", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "13 lb."},
    {"nameEn": "Hide Armor", "nameKo": "하이드 갑옷", "armorCategory": "medium", "costRaw": "10 gp", "armorClassRaw": "12 + DEX modifier (max 2)", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "12 lb."},
    {"nameEn": "Chain Shirt", "nameKo": "체인 셔츠", "armorCategory": "medium", "costRaw": "50 gp", "armorClassRaw": "13 + DEX modifier (max 2)", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "20 lb."},
    {"nameEn": "Scale Mail", "nameKo": "스케일 메일", "armorCategory": "medium", "costRaw": "50 gp", "armorClassRaw": "14 + DEX modifier (max 2)", "strengthRequirementRaw": None, "stealthRaw": "disadvantage", "weightRaw": "45 lb."},
    {"nameEn": "Breastplate", "nameKo": "브레스트플레이트", "armorCategory": "medium", "costRaw": "400 gp", "armorClassRaw": "14 + DEX modifier (max 2)", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "20 lb."},
    {"nameEn": "Half Plate Armor", "nameKo": "하프 플레이트 갑옷", "armorCategory": "medium", "costRaw": "750 gp", "armorClassRaw": "15 + DEX modifier (max 2)", "strengthRequirementRaw": None, "stealthRaw": "disadvantage", "weightRaw": "40 lb."},
    {"nameEn": "Ring Mail", "nameKo": "링 메일", "armorCategory": "heavy", "costRaw": "30 gp", "armorClassRaw": "14", "strengthRequirementRaw": None, "stealthRaw": "disadvantage", "weightRaw": "40 lb."},
    {"nameEn": "Chain Mail", "nameKo": "체인 메일", "armorCategory": "heavy", "costRaw": "75 gp", "armorClassRaw": "16", "strengthRequirementRaw": "Str 13", "stealthRaw": "disadvantage", "weightRaw": "55 lb."},
    {"nameEn": "Splint Armor", "nameKo": "스플린트 갑옷", "armorCategory": "heavy", "costRaw": "200 gp", "armorClassRaw": "17", "strengthRequirementRaw": "Str 15", "stealthRaw": "disadvantage", "weightRaw": "60 lb."},
    {"nameEn": "Plate Armor", "nameKo": "플레이트 갑옷", "armorCategory": "heavy", "costRaw": "1500 gp", "armorClassRaw": "18", "strengthRequirementRaw": "Str 15", "stealthRaw": "disadvantage", "weightRaw": "65 lb."},
    {"nameEn": "Shield", "nameKo": "방패", "armorCategory": "shield", "costRaw": "10 gp", "armorClassRaw": "+2", "strengthRequirementRaw": None, "stealthRaw": None, "weightRaw": "6 lb."},
]


SRD_WEAPON_TABLE = [
    {"nameEn": "Club", "nameKo": "몽둥이", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "1 sp", "damageRaw": "1d4", "damageType": "bludgeoning", "weightRaw": "2 lb.", "propertiesRaw": "light"},
    {"nameEn": "Dagger", "nameKo": "단검", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "2 gp", "damageRaw": "1d4", "damageType": "piercing", "weightRaw": "1 lb.", "propertiesRaw": "finesse, light, thrown (20/60)"},
    {"nameEn": "Greatclub", "nameKo": "그레이트클럽", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "2 sp", "damageRaw": "1d8", "damageType": "bludgeoning", "weightRaw": "10 lb.", "propertiesRaw": "two-handed"},
    {"nameEn": "Handaxe", "nameKo": "핸드액스", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "5 gp", "damageRaw": "1d6", "damageType": "slashing", "weightRaw": "2 lb.", "propertiesRaw": "light, thrown (20/60)"},
    {"nameEn": "Javelin", "nameKo": "재블린", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "5 sp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": "thrown (30/120)"},
    {"nameEn": "Light Hammer", "nameKo": "라이트 해머", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "2 gp", "damageRaw": "1d4", "damageType": "bludgeoning", "weightRaw": "2 lb.", "propertiesRaw": "light, thrown (20/60)"},
    {"nameEn": "Mace", "nameKo": "메이스", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "5 gp", "damageRaw": "1d6", "damageType": "bludgeoning", "weightRaw": "4 lb.", "propertiesRaw": None},
    {"nameEn": "Quarterstaff", "nameKo": "쿼터스태프", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "2 sp", "damageRaw": "1d6", "damageType": "bludgeoning", "weightRaw": "4 lb.", "propertiesRaw": "versatile (1d8)"},
    {"nameEn": "Sickle", "nameKo": "낫", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "1 gp", "damageRaw": "1d4", "damageType": "slashing", "weightRaw": "2 lb.", "propertiesRaw": "light"},
    {"nameEn": "Spear", "nameKo": "스피어", "weaponCategory": "simple", "weaponRange": "melee", "costRaw": "1 gp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "3 lb.", "propertiesRaw": "thrown (20/60), versatile (1d8)"},
    {"nameEn": "Crossbow, light", "nameKo": "라이트 크로스보우", "weaponCategory": "simple", "weaponRange": "ranged", "costRaw": "25 gp", "damageRaw": "1d8", "damageType": "piercing", "weightRaw": "5 lb.", "propertiesRaw": "ammunition (80/320), loading, two-handed"},
    {"nameEn": "Dart", "nameKo": "다트", "weaponCategory": "simple", "weaponRange": "ranged", "costRaw": "5 cp", "damageRaw": "1d4", "damageType": "piercing", "weightRaw": "1/4 lb.", "propertiesRaw": "finesse, thrown (20/60)"},
    {"nameEn": "Shortbow", "nameKo": "쇼트보우", "weaponCategory": "simple", "weaponRange": "ranged", "costRaw": "25 gp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": "ammunition (80/320), two-handed"},
    {"nameEn": "Sling", "nameKo": "슬링", "weaponCategory": "simple", "weaponRange": "ranged", "costRaw": "1 sp", "damageRaw": "1d4", "damageType": "bludgeoning", "weightRaw": None, "propertiesRaw": "ammunition (30/120)"},
    {"nameEn": "Battleaxe", "nameKo": "배틀액스", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "10 gp", "damageRaw": "1d8", "damageType": "slashing", "weightRaw": "4 lb.", "propertiesRaw": "versatile (1d10)"},
    {"nameEn": "Flail", "nameKo": "플레일", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "10 gp", "damageRaw": "1d8", "damageType": "bludgeoning", "weightRaw": "2 lb.", "propertiesRaw": None},
    {"nameEn": "Glaive", "nameKo": "글레이브", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "20 gp", "damageRaw": "1d10", "damageType": "slashing", "weightRaw": "6 lb.", "propertiesRaw": "heavy, reach, two-handed"},
    {"nameEn": "Greataxe", "nameKo": "그레이트액스", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "30 gp", "damageRaw": "1d12", "damageType": "slashing", "weightRaw": "7 lb.", "propertiesRaw": "heavy, two-handed"},
    {"nameEn": "Greatsword", "nameKo": "그레이트소드", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "50 gp", "damageRaw": "2d6", "damageType": "slashing", "weightRaw": "6 lb.", "propertiesRaw": "heavy, two-handed"},
    {"nameEn": "Halberd", "nameKo": "할버드", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "20 gp", "damageRaw": "1d10", "damageType": "slashing", "weightRaw": "6 lb.", "propertiesRaw": "heavy, reach, two-handed"},
    {"nameEn": "Lance", "nameKo": "랜스", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "10 gp", "damageRaw": "1d12", "damageType": "piercing", "weightRaw": "6 lb.", "propertiesRaw": "reach, special"},
    {"nameEn": "Longsword", "nameKo": "롱소드", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "15 gp", "damageRaw": "1d8", "damageType": "slashing", "weightRaw": "3 lb.", "propertiesRaw": "versatile (1d10)"},
    {"nameEn": "Maul", "nameKo": "마울", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "10 gp", "damageRaw": "2d6", "damageType": "bludgeoning", "weightRaw": "10 lb.", "propertiesRaw": "heavy, two-handed"},
    {"nameEn": "Morningstar", "nameKo": "모닝스타", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "15 gp", "damageRaw": "1d8", "damageType": "piercing", "weightRaw": "4 lb.", "propertiesRaw": None},
    {"nameEn": "Pike", "nameKo": "파이크", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "5 gp", "damageRaw": "1d10", "damageType": "piercing", "weightRaw": "18 lb.", "propertiesRaw": "heavy, reach, two-handed"},
    {"nameEn": "Rapier", "nameKo": "레이피어", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "25 gp", "damageRaw": "1d8", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": "finesse"},
    {"nameEn": "Scimitar", "nameKo": "시미터", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "25 gp", "damageRaw": "1d6", "damageType": "slashing", "weightRaw": "3 lb.", "propertiesRaw": "finesse, light"},
    {"nameEn": "Shortsword", "nameKo": "쇼트소드", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "10 gp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": "finesse, light"},
    {"nameEn": "Trident", "nameKo": "트라이던트", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "5 gp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "4 lb.", "propertiesRaw": "thrown (20/60), versatile (1d8)"},
    {"nameEn": "War pick", "nameKo": "워 픽", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "5 gp", "damageRaw": "1d8", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": None},
    {"nameEn": "Warhammer", "nameKo": "워해머", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "15 gp", "damageRaw": "1d8", "damageType": "bludgeoning", "weightRaw": "2 lb.", "propertiesRaw": "versatile (1d10)"},
    {"nameEn": "Whip", "nameKo": "채찍", "weaponCategory": "martial", "weaponRange": "melee", "costRaw": "2 gp", "damageRaw": "1d4", "damageType": "slashing", "weightRaw": "3 lb.", "propertiesRaw": "finesse, reach"},
    {"nameEn": "Blowgun", "nameKo": "블로우건", "weaponCategory": "martial", "weaponRange": "ranged", "costRaw": "10 gp", "damageRaw": "1 piercing", "damageType": "piercing", "weightRaw": "1 lb.", "propertiesRaw": "ammunition (25/100), loading"},
    {"nameEn": "Crossbow, hand", "nameKo": "핸드 크로스보우", "weaponCategory": "martial", "weaponRange": "ranged", "costRaw": "75 gp", "damageRaw": "1d6", "damageType": "piercing", "weightRaw": "3 lb.", "propertiesRaw": "ammunition (30/120), light, loading"},
    {"nameEn": "Crossbow, heavy", "nameKo": "헤비 크로스보우", "weaponCategory": "martial", "weaponRange": "ranged", "costRaw": "50 gp", "damageRaw": "1d10", "damageType": "piercing", "weightRaw": "18 lb.", "propertiesRaw": "ammunition (100/400), heavy, loading, two-handed"},
    {"nameEn": "Longbow", "nameKo": "롱보우", "weaponCategory": "martial", "weaponRange": "ranged", "costRaw": "50 gp", "damageRaw": "1d8", "damageType": "piercing", "weightRaw": "2 lb.", "propertiesRaw": "ammunition (150/600), heavy, two-handed"},
    {"nameEn": "Net", "nameKo": "그물", "weaponCategory": "martial", "weaponRange": "ranged", "costRaw": "1 gp", "damageRaw": None, "damageType": None, "weightRaw": "3 lb.", "propertiesRaw": "special, thrown (5/15)"},
]


SRD_AMMUNITION_TABLE = [
    {"nameEn": "Arrow", "nameKo": "화살", "costRaw": "1 gp / 20", "weightRaw": "1 lb. / 20"},
    {"nameEn": "Crossbow bolt", "nameKo": "볼트", "costRaw": "1 gp / 20", "weightRaw": "1.5 lb. / 20"},
    {"nameEn": "Blowgun needle", "nameKo": "블로우건 바늘", "costRaw": "1 gp / 50", "weightRaw": "1 lb. / 50"},
    {"nameEn": "Sling bullet", "nameKo": "슬링 탄환", "costRaw": "4 cp / 20", "weightRaw": "1.5 lb. / 20"},
]


SRD_ADVENTURING_GEAR_TABLE = [
    {"nameEn": "Acid (vial)", "costRaw": "25 gp", "weightRaw": "1 lb."},
    {"nameEn": "Alchemist's fire (flask)", "costRaw": "50 gp", "weightRaw": "1 lb."},
    {"nameEn": "Antitoxin (vial)", "costRaw": "50 gp", "weightRaw": None},
    {"nameEn": "Backpack", "costRaw": "2 gp", "weightRaw": "5 lb."},
    {"nameEn": "Ball bearings (bag of 1,000)", "costRaw": "1 gp", "weightRaw": "2 lb."},
    {"nameEn": "Bedroll", "costRaw": "1 gp", "weightRaw": "7 lb."},
    {"nameEn": "Book", "costRaw": "25 gp", "weightRaw": "5 lb."},
    {"nameEn": "Caltrops (bag of 20)", "costRaw": "1 gp", "weightRaw": "2 lb."},
    {"nameEn": "Chain (10 feet)", "costRaw": "5 gp", "weightRaw": "10 lb."},
    {"nameEn": "Climber's kit", "costRaw": "25 gp", "weightRaw": "12 lb."},
    {"nameEn": "Component pouch", "costRaw": "25 gp", "weightRaw": "2 lb."},
    {"nameEn": "Crowbar", "costRaw": "2 gp", "weightRaw": "5 lb."},
    {"nameEn": "Fishing tackle", "costRaw": "1 gp", "weightRaw": "4 lb."},
    {"nameEn": "Grappling hook", "costRaw": "2 gp", "weightRaw": "4 lb."},
    {"nameEn": "Healer's kit", "costRaw": "5 gp", "weightRaw": "3 lb."},
    {"nameEn": "Holy water (flask)", "costRaw": "25 gp", "weightRaw": "1 lb."},
    {"nameEn": "Hunting trap", "costRaw": "5 gp", "weightRaw": "25 lb."},
    {"nameEn": "Lantern, bullseye", "costRaw": "10 gp", "weightRaw": "2 lb."},
    {"nameEn": "Lantern, hooded", "costRaw": "5 gp", "weightRaw": "2 lb."},
    {"nameEn": "Lock", "costRaw": "10 gp", "weightRaw": "1 lb."},
    {"nameEn": "Manacles", "costRaw": "2 gp", "weightRaw": "6 lb."},
    {"nameEn": "Oil (flask)", "costRaw": "1 sp", "weightRaw": "1 lb."},
    {"nameEn": "Poison, basic (vial)", "costRaw": "100 gp", "weightRaw": None},
    {"nameEn": "Potion of healing", "costRaw": "50 gp", "weightRaw": "0.5 lb."},
    {"nameEn": "Quiver", "costRaw": "1 gp", "weightRaw": "1 lb."},
    {"nameEn": "Rations (1 day)", "costRaw": "5 sp", "weightRaw": "2 lb."},
    {"nameEn": "Rope, hempen (50 feet)", "costRaw": "1 gp", "weightRaw": "10 lb."},
    {"nameEn": "Rope, silk (50 feet)", "costRaw": "10 gp", "weightRaw": "5 lb."},
    {"nameEn": "Spellbook", "costRaw": "50 gp", "weightRaw": "3 lb."},
    {"nameEn": "Tent, two-person", "costRaw": "2 gp", "weightRaw": "20 lb."},
    {"nameEn": "Tinderbox", "costRaw": "5 sp", "weightRaw": "1 lb."},
    {"nameEn": "Torch", "costRaw": "1 cp", "weightRaw": "1 lb."},
    {"nameEn": "Waterskin", "costRaw": "2 sp", "weightRaw": "5 lb. full"},
]


SRD_TOOL_TABLE = [
    {"nameEn": "Alchemist's supplies", "costRaw": "50 gp", "weightRaw": "8 lb.", "toolCategory": "artisan"},
    {"nameEn": "Brewer's supplies", "costRaw": "20 gp", "weightRaw": "9 lb.", "toolCategory": "artisan"},
    {"nameEn": "Calligrapher's supplies", "costRaw": "10 gp", "weightRaw": "5 lb.", "toolCategory": "artisan"},
    {"nameEn": "Carpenter's tools", "costRaw": "8 gp", "weightRaw": "6 lb.", "toolCategory": "artisan"},
    {"nameEn": "Cartographer's tools", "costRaw": "15 gp", "weightRaw": "6 lb.", "toolCategory": "artisan"},
    {"nameEn": "Cook's utensils", "costRaw": "1 gp", "weightRaw": "8 lb.", "toolCategory": "artisan"},
    {"nameEn": "Herbalism kit", "costRaw": "5 gp", "weightRaw": "3 lb.", "toolCategory": "kit"},
    {"nameEn": "Navigator's tools", "costRaw": "25 gp", "weightRaw": "2 lb.", "toolCategory": "kit"},
    {"nameEn": "Poisoner's kit", "costRaw": "50 gp", "weightRaw": "2 lb.", "toolCategory": "kit"},
    {"nameEn": "Thieves' tools", "costRaw": "25 gp", "weightRaw": "1 lb.", "toolCategory": "kit"},
    {"nameEn": "Disguise kit", "costRaw": "25 gp", "weightRaw": "3 lb.", "toolCategory": "kit"},
    {"nameEn": "Forgery kit", "costRaw": "15 gp", "weightRaw": "5 lb.", "toolCategory": "kit"},
    {"nameEn": "Dice set", "costRaw": "1 sp", "weightRaw": None, "toolCategory": "gaming"},
    {"nameEn": "Playing card set", "costRaw": "5 sp", "weightRaw": None, "toolCategory": "gaming"},
    {"nameEn": "Lute", "costRaw": "35 gp", "weightRaw": "2 lb.", "toolCategory": "instrument"},
    {"nameEn": "Flute", "costRaw": "2 gp", "weightRaw": "1 lb.", "toolCategory": "instrument"},
]


SRD_MOUNT_AND_VEHICLE_TABLE = [
    {"nameEn": "Camel", "costRaw": "50 gp", "weightRaw": None, "equipmentCategory": "mount", "propertiesRaw": "speed 50 ft.; carrying capacity 480 lb."},
    {"nameEn": "Donkey or mule", "costRaw": "8 gp", "weightRaw": None, "equipmentCategory": "mount", "propertiesRaw": "speed 40 ft.; carrying capacity 420 lb."},
    {"nameEn": "Horse, draft", "costRaw": "50 gp", "weightRaw": None, "equipmentCategory": "mount", "propertiesRaw": "speed 40 ft.; carrying capacity 540 lb."},
    {"nameEn": "Horse, riding", "costRaw": "75 gp", "weightRaw": None, "equipmentCategory": "mount", "propertiesRaw": "speed 60 ft.; carrying capacity 480 lb."},
    {"nameEn": "Warhorse", "costRaw": "400 gp", "weightRaw": None, "equipmentCategory": "mount", "propertiesRaw": "speed 60 ft.; carrying capacity 540 lb."},
    {"nameEn": "Bit and bridle", "costRaw": "2 gp", "weightRaw": "1 lb.", "equipmentCategory": "tack"},
    {"nameEn": "Saddle, military", "costRaw": "20 gp", "weightRaw": "30 lb.", "equipmentCategory": "tack"},
    {"nameEn": "Saddle, riding", "costRaw": "10 gp", "weightRaw": "25 lb.", "equipmentCategory": "tack"},
    {"nameEn": "Saddlebags", "costRaw": "4 gp", "weightRaw": "8 lb.", "equipmentCategory": "tack"},
    {"nameEn": "Cart", "costRaw": "15 gp", "weightRaw": "200 lb.", "equipmentCategory": "vehicle_land"},
    {"nameEn": "Carriage", "costRaw": "100 gp", "weightRaw": "600 lb.", "equipmentCategory": "vehicle_land"},
    {"nameEn": "Wagon", "costRaw": "35 gp", "weightRaw": "400 lb.", "equipmentCategory": "vehicle_land"},
    {"nameEn": "Rowboat", "costRaw": "50 gp", "weightRaw": "100 lb.", "equipmentCategory": "vehicle_water"},
    {"nameEn": "Keelboat", "costRaw": "3,000 gp", "weightRaw": None, "equipmentCategory": "vehicle_water"},
    {"nameEn": "Sailing ship", "costRaw": "10,000 gp", "weightRaw": None, "equipmentCategory": "vehicle_water"},
    {"nameEn": "Warship", "costRaw": "25,000 gp", "weightRaw": None, "equipmentCategory": "vehicle_water"},
]


SRD_TRADE_GOODS_TABLE = [
    {"nameEn": "Wheat (1 lb.)", "costRaw": "1 cp", "weightRaw": "1 lb."},
    {"nameEn": "Flour (1 lb.)", "costRaw": "2 cp", "weightRaw": "1 lb."},
    {"nameEn": "Salt (1 lb.)", "costRaw": "5 cp", "weightRaw": "1 lb."},
    {"nameEn": "Iron (1 lb.)", "costRaw": "1 sp", "weightRaw": "1 lb."},
    {"nameEn": "Copper (1 lb.)", "costRaw": "5 sp", "weightRaw": "1 lb."},
    {"nameEn": "Cotton cloth (1 sq. yd.)", "costRaw": "5 sp", "weightRaw": None},
    {"nameEn": "Ginger (1 lb.)", "costRaw": "1 gp", "weightRaw": "1 lb."},
    {"nameEn": "Silver (1 lb.)", "costRaw": "5 gp", "weightRaw": "1 lb."},
    {"nameEn": "Silk (1 sq. yd.)", "costRaw": "10 gp", "weightRaw": None},
    {"nameEn": "Gold (1 lb.)", "costRaw": "50 gp", "weightRaw": "1 lb."},
    {"nameEn": "Platinum (1 lb.)", "costRaw": "500 gp", "weightRaw": "1 lb."},
]


SRD_EQUIPMENT_KO_NAMES = {
    "Acid (vial)": "산성 약병",
    "Alchemist's fire (flask)": "연금술사의 불",
    "Antitoxin (vial)": "해독제",
    "Backpack": "배낭",
    "Ball bearings (bag of 1,000)": "쇠구슬 주머니(1,000개)",
    "Bedroll": "침낭",
    "Book": "책",
    "Caltrops (bag of 20)": "마름쇠 주머니(20개)",
    "Chain (10 feet)": "쇠사슬(10피트)",
    "Climber's kit": "등반가 도구",
    "Component pouch": "구성요소 파우치",
    "Crowbar": "쇠지렛대",
    "Fishing tackle": "낚시 도구",
    "Grappling hook": "갈고리",
    "Healer's kit": "치료사 도구",
    "Holy water (flask)": "성수",
    "Hunting trap": "사냥 덫",
    "Lantern, bullseye": "집광 랜턴",
    "Lantern, hooded": "차폐 랜턴",
    "Lock": "자물쇠",
    "Manacles": "수갑",
    "Oil (flask)": "기름",
    "Poison, basic (vial)": "기본 독",
    "Potion of healing": "치유 물약",
    "Quiver": "화살통",
    "Rations (1 day)": "식량(1일분)",
    "Rope, hempen (50 feet)": "삼베 밧줄(50피트)",
    "Rope, silk (50 feet)": "비단 밧줄(50피트)",
    "Spellbook": "주문책",
    "Tent, two-person": "2인용 천막",
    "Tinderbox": "부싯깃 상자",
    "Torch": "횃불",
    "Waterskin": "물주머니",
    "Alchemist's supplies": "연금술 도구",
    "Brewer's supplies": "양조 도구",
    "Calligrapher's supplies": "서예 도구",
    "Carpenter's tools": "목수 도구",
    "Cartographer's tools": "지도 제작 도구",
    "Cook's utensils": "요리 도구",
    "Herbalism kit": "약초학 도구",
    "Navigator's tools": "항해 도구",
    "Poisoner's kit": "독 제조 도구",
    "Thieves' tools": "도둑 도구",
    "Disguise kit": "변장 도구",
    "Forgery kit": "위조 도구",
    "Dice set": "주사위 세트",
    "Playing card set": "카드 세트",
    "Lute": "류트",
    "Flute": "플루트",
    "Camel": "낙타",
    "Donkey or mule": "당나귀 또는 노새",
    "Horse, draft": "역마",
    "Horse, riding": "승용마",
    "Warhorse": "전투마",
    "Bit and bridle": "재갈과 고삐",
    "Saddle, military": "군용 안장",
    "Saddle, riding": "승용 안장",
    "Saddlebags": "안장가방",
    "Cart": "손수레",
    "Carriage": "마차",
    "Wagon": "왜건",
    "Rowboat": "노 젓는 배",
    "Keelboat": "킬보트",
    "Sailing ship": "범선",
    "Warship": "전함",
    "Wheat (1 lb.)": "밀(1파운드)",
    "Flour (1 lb.)": "밀가루(1파운드)",
    "Salt (1 lb.)": "소금(1파운드)",
    "Iron (1 lb.)": "철(1파운드)",
    "Copper (1 lb.)": "구리(1파운드)",
    "Cotton cloth (1 sq. yd.)": "면직물(1제곱야드)",
    "Ginger (1 lb.)": "생강(1파운드)",
    "Silver (1 lb.)": "은(1파운드)",
    "Silk (1 sq. yd.)": "비단(1제곱야드)",
    "Gold (1 lb.)": "금(1파운드)",
    "Platinum (1 lb.)": "백금(1파운드)",
}


def localized_equipment_name(name_en: str) -> str:
    return SRD_EQUIPMENT_KO_NAMES.get(name_en, name_en)


SRD_EQUIPMENT_CANONICAL_ID_NAMES = {name_ko: name_en for name_en, name_ko in SRD_EQUIPMENT_KO_NAMES.items()}


def canonical_equipment_id_name(name: str) -> str:
    return SRD_EQUIPMENT_CANONICAL_ID_NAMES.get(name, name)


def equipment_aliases(name_en: str) -> list[str]:
    name_ko = localized_equipment_name(name_en)
    return [name_ko] if name_ko == name_en else [name_ko, name_en]


def _range_from_properties(properties_raw: str | None) -> str | None:
    if not properties_raw:
        return None
    match = re.search(r"\((\d+/\d+)\)", properties_raw)
    return match.group(1) if match else None


def split_equipment_bundle(raw: str) -> list[dict[str, str | None]]:
    items: list[dict[str, str | None]] = []
    parts: list[str] = []
    for item in [item.strip() for item in raw.split(",") if item.strip()]:
        parts.extend(expand_equipment_part(item))
    for part in parts:
        name, quantity = normalize_equipment_name(part)
        if not name:
            continue
        items.append(
            {
                "id": equipment_item_id(canonical_equipment_id_name(name)),
                "nameKo": name,
                "quantityRaw": quantity,
                "kind": classify_equipment(name),
            }
        )
    return items


def parse_starting_equipment_choices(text: str, class_id: str) -> list[dict[str, object]]:
    choices: list[dict[str, object]] = []
    for index, raw in enumerate(parse_starting_equipment_lines(text, class_id), start=1):
        options = split_korean_choice_options(raw)
        choices.append(
            {
                "id": f"{class_id}.starting_equipment.{index}",
                "raw": raw,
                "requiredSelections": 1 if len(options) > 1 else len(options),
                "options": [
                    {
                        "raw": option,
                        "itemRefs": [item["id"] for item in split_equipment_bundle(option)],
                        "items": split_equipment_bundle(option),
                    }
                    for option in options
                ],
            }
        )
    return choices


def summarize_before_db_memo(text: str, max_chars: int = 520) -> str:
    body = re.split(r"^##\s+DB 분리 메모\s*$", text, maxsplit=1, flags=re.MULTILINE)[0]
    return summarize_markdown(body, max_chars=max_chars)


def parse_level_features(text: str) -> list[dict[str, str]]:
    match = re.search(r"^##\s+레벨별 핵심 기능\s*$\n(?P<body>.*?)(?=^##\s+|\Z)", text, re.MULTILINE | re.DOTALL)
    if not match:
        return []
    features: list[dict[str, str]] = []
    for cells in parse_markdown_table(match.group("body")):
        if len(cells) >= 2 and cells[0] != "레벨":
            features.append({"level": cells[0], "features": cells[1]})
    return features


def feature_levels_from_rows(feature_name: str, level_features: list[dict[str, str]]) -> list[str]:
    return [
        row["level"]
        for row in level_features
        if feature_name and feature_name in row.get("features", "")
    ]


def parse_class_feature_references(
    text: str,
    class_id: str,
    level_features: list[dict[str, str]],
) -> list[dict[str, object]]:
    references: list[dict[str, object]] = []
    main_features = parse_heading_section_text(text, "주요 기능") or ""
    for title, block in iter_markdown_sections_from_text(main_features, SUBSECTION_RE):
        references.append(
            {
                "id": f"{class_id}.feature.{slugify_ko(title)}",
                "nameKo": title,
                "category": "class",
                "availableAtLevels": feature_levels_from_rows(title, level_features),
                "summaryKo": summarize_markdown(block, max_chars=260),
                "sourceHeading": title,
            }
        )

    known_h2 = {
        "원문명",
        "기본 수치",
        "시작 장비",
        "주문시전",
        "레벨별 핵심 기능",
        "주요 기능",
        "전체 레벨 진행표",
        "DB 분리 메모",
    }
    for section_title, block in iter_markdown_sections_from_text(text, SECTION_RE):
        if section_title in known_h2:
            continue
        for row in parse_markdown_table_dicts(block):
            feature_name = row.get("기능")
            if not feature_name:
                continue
            references.append(
                {
                    "id": f"{class_id}.subclass_feature.{slugify_ko(feature_name)}",
                    "nameKo": feature_name,
                    "category": "subclass",
                    "availableAtLevels": [row["레벨"]] if row.get("레벨") else [],
                    "summaryKo": row.get("요약", ""),
                    "sourceHeading": section_title,
                }
            )
    return references


def parse_level_progression(text: str) -> list[dict[str, str]]:
    block = parse_heading_section_text(text, "전체 레벨 진행표") or ""
    return parse_markdown_table_dicts(block)


def parse_optional_int(raw: str | None) -> int | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if cleaned in {"", "-"}:
        return None
    return int(cleaned)


def parse_spellcasting_progression(level_progression: list[dict[str, str]]) -> list[ClassSpellcastingProgression]:
    progression: list[ClassSpellcastingProgression] = []
    slot_columns = [str(level) for level in range(1, 10)]
    for row in level_progression:
        spell_slots = {
            column: parsed
            for column in slot_columns
            if (parsed := parse_optional_int(row.get(column))) is not None
        }
        class_level = parse_optional_int(row.get("레벨"))
        if class_level is None:
            continue
        cantrips_known = parse_optional_int(row.get("캔트립"))
        spells_known = parse_optional_int(row.get("알고 있는 주문"))
        pact_magic_slots = parse_optional_int(row.get("주문 슬롯"))
        pact_magic_slot_level = parse_optional_int(row.get("슬롯 레벨"))
        if any(value is not None for value in [cantrips_known, spells_known, pact_magic_slots]) or spell_slots:
            progression.append(
                ClassSpellcastingProgression(
                    classLevel=class_level,
                    cantripsKnown=cantrips_known,
                    spellsKnown=spells_known,
                    pactMagicSlots=pact_magic_slots,
                    pactMagicSlotLevel=pact_magic_slot_level,
                    spellSlotsByLevel=spell_slots,
                )
            )
    return progression


def parse_basic_stats(text: str) -> dict[str, str]:
    block = parse_heading_section_text(text, "기본 수치") or ""
    stats: dict[str, str] = {}
    for row in parse_markdown_table_dicts(block):
        key = row.get("항목")
        value = row.get("내용")
        if key and value:
            stats[key] = value
    return stats


def parse_spellcasting_block(text: str) -> dict[str, object]:
    block = parse_heading_section_text(text, "주문시전") or ""
    if not block:
        return {}
    formulas = [
        line.strip()
        for line in block.splitlines()
        if "=" in line and not line.strip().startswith("```")
    ]
    bullets = [
        line.removeprefix("- ").strip()
        for line in block.splitlines()
        if line.strip().startswith("- ")
    ]
    payload: dict[str, object] = {}
    if formulas:
        payload["formulas"] = " | ".join(formulas)
        payload["formulaList"] = formulas
    if bullets:
        payload["notes"] = " | ".join(bullets)
        payload["noteList"] = bullets
    ability_match = re.search(r"([가-힣]+)\((?P<ability>[A-Za-z]+)\)[을를]\s+주문시전 능력치로 사용", block)
    if ability_match:
        payload["ability"] = ability_match.group("ability")
    return payload


def parse_race_traits(text: str) -> list[dict[str, str]]:
    without_db = re.split(r"^##\s+DB 분리 메모\s*$", text, maxsplit=1, flags=re.MULTILINE)[0]
    traits: list[dict[str, str]] = []
    for title, block in iter_markdown_sections_from_text(without_db, SUBSECTION_RE):
        if title in {"플레이 참조문 초안"}:
            continue
        traits.append(
            {
                "nameKo": title,
                "summaryKo": summarize_markdown(block, max_chars=260),
            }
        )
    return traits


def parse_ancestry_options(text: str) -> list[dict[str, str]]:
    block = parse_heading_section_text(text, "드래곤 혈통", level=3) or ""
    options: list[dict[str, str]] = []
    for row in parse_markdown_table_dicts(block):
        if "드래곤" in row:
            options.append(
                {
                    "nameEn": row.get("드래곤", ""),
                    "damageType": row.get("피해 유형", ""),
                    "breathWeapon": row.get("숨결 무기", ""),
                }
            )
    return options


def parse_subrace_rows(text: str) -> list[dict[str, str]]:
    memo = re.search(r"^##\s+DB 분리 메모\s*$\n(?P<body>.*)", text, re.MULTILINE | re.DOTALL)
    if not memo:
        return []
    subraces: list[dict[str, str]] = []
    for cells in parse_markdown_table(memo.group("body")):
        if len(cells) >= 4 and cells[0] not in {"하위 종족 key", "필드"}:
            subraces.append(
                {
                    "id": f"subrace.{slugify(cells[0])}",
                    "nameKo": cells[1],
                    "abilityScoreIncreaseRaw": cells[2],
                    "sourcePage": cells[3],
                }
            )
    return subraces


def build_race_options() -> list[RaceOption]:
    race_dir = TRANSLATED_ROOT / "races"
    races: list[RaceOption] = []
    for path in sorted(race_dir.glob("*.md")):
        if path.name in {"종족_공통_규칙.md", "종족_검수_기준.md"}:
            continue
        text = path.read_text(encoding="utf-8")
        fields = parse_db_memo_fields(text)
        original_section = parse_heading_section_text(text, "원문명") or ""
        key = fields.get("key") or slugify_ko(path.stem)
        source_page = fields.get("source_page")
        races.append(
            RaceOption(
                id=f"race.{slugify(key)}",
                nameKo=fields.get("ko_name") or path.stem,
                nameEn=parse_original_name(original_section, "Race"),
                sizeRaw=fields.get("size"),
                speedRaw=fields.get("speed"),
                abilityScoreIncreaseRaw=fields.get("ability_score_increase"),
                languagesRaw=fields.get("languages"),
                subraces=parse_subrace_rows(text),
                traits=parse_race_traits(text),
                ancestryOptions=parse_ancestry_options(text),
                summaryKo=summarize_before_db_memo(text),
                source=SpellSource(file=relative_to_ai(path), page=source_page, heading=path.stem),
            )
        )
    if len(races) != EXPECTED_COUNTS["races"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['races']} races, found {len(races)}")
    return races


def build_class_options() -> list[ClassOption]:
    class_dir = TRANSLATED_ROOT / "classes"
    classes: list[ClassOption] = []
    for path in sorted(class_dir.glob("*.md")):
        if path.name == "직업_검수_기준.md":
            continue
        text = path.read_text(encoding="utf-8")
        fields = parse_db_memo_fields(text)
        basic_stats = parse_basic_stats(text)
        spellcasting = parse_spellcasting_block(text)
        if fields.get("spellcasting_ability") and "ability" not in spellcasting:
            spellcasting["ability"] = fields["spellcasting_ability"]
        original_section = parse_heading_section_text(text, "원문명") or ""
        key = fields.get("key") or slugify_ko(path.stem)
        class_id = f"class.{slugify(key)}"
        source_page = fields.get("source_page")
        level_features = parse_level_features(text)
        level_progression = parse_level_progression(text)
        classes.append(
            ClassOption(
                id=class_id,
                nameKo=fields.get("ko_name") or path.stem,
                nameEn=parse_original_name(original_section, "Class"),
                hitDieRaw=fields.get("hit_die"),
                primaryAbilitiesRaw=fields.get("primary_abilities") or fields.get("primary_ability"),
                savingThrowsRaw=fields.get("saving_throws"),
                armorProficienciesRaw=basic_stats.get("방어구 숙련"),
                weaponProficienciesRaw=basic_stats.get("무기 숙련"),
                toolProficienciesRaw=basic_stats.get("도구 숙련"),
                skillChoicesRaw=basic_stats.get("기술 선택"),
                startingEquipment=parse_starting_equipment_lines(text, class_id),
                startingEquipmentChoices=parse_starting_equipment_choices(text, class_id),
                spellcasting=spellcasting,
                spellcastingProgression=parse_spellcasting_progression(level_progression),
                srdSubclassRaw=fields.get("srd_subclass"),
                levelFeatures=level_features,
                featureReferences=parse_class_feature_references(text, class_id, level_features),
                levelProgression=level_progression,
                summaryKo=summarize_before_db_memo(text),
                source=SpellSource(file=relative_to_ai(path), page=source_page, heading=path.stem),
            )
        )
    if len(classes) != EXPECTED_COUNTS["classes"]:
        raise ValueError(f"Expected {EXPECTED_COUNTS['classes']} classes, found {len(classes)}")
    return classes


def build_equipment_items(class_options: list[ClassOption]) -> list[EquipmentItem]:
    indexed: dict[str, EquipmentItem] = {}
    for armor in SRD_ARMOR_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(armor["nameKo"]),
            nameKo=armor["nameKo"],
            nameEn=armor["nameEn"],
            kind="armor",
            costRaw=armor["costRaw"],
            weightRaw=armor["weightRaw"],
            equipmentCategory="armor",
            armorCategory=armor["armorCategory"],
            armorClassRaw=armor["armorClassRaw"],
            strengthRequirementRaw=armor["strengthRequirementRaw"],
            stealthRaw=armor["stealthRaw"],
            aliasesKo=[armor["nameKo"]],
            sourceTable="srd_armor_table",
        )
        indexed[item.id] = item
    for weapon in SRD_WEAPON_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(weapon["nameKo"]),
            nameKo=weapon["nameKo"],
            nameEn=weapon["nameEn"],
            kind="weapon",
            costRaw=weapon["costRaw"],
            weightRaw=weapon["weightRaw"],
            equipmentCategory="weapon",
            weaponCategory=weapon["weaponCategory"],
            weaponRange=weapon["weaponRange"],
            damageRaw=weapon["damageRaw"],
            damageType=weapon["damageType"],
            rangeRaw=_range_from_properties(weapon["propertiesRaw"]),
            propertiesRaw=weapon["propertiesRaw"],
            aliasesKo=[weapon["nameKo"]],
            sourceTable="srd_weapon_table",
        )
        indexed[item.id] = item
    for ammunition in SRD_AMMUNITION_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(ammunition["nameKo"]),
            nameKo=ammunition["nameKo"],
            nameEn=ammunition["nameEn"],
            kind="ammunition",
            costRaw=ammunition["costRaw"],
            weightRaw=ammunition["weightRaw"],
            equipmentCategory="adventuring_gear",
            aliasesKo=[ammunition["nameKo"]],
            sourceTable="srd_ammunition_table",
        )
        indexed[item.id] = item
    for gear in SRD_ADVENTURING_GEAR_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(gear["nameEn"]),
            nameKo=localized_equipment_name(gear["nameEn"]),
            nameEn=gear["nameEn"],
            kind="gear",
            costRaw=gear["costRaw"],
            weightRaw=gear["weightRaw"],
            equipmentCategory="adventuring_gear",
            aliasesKo=equipment_aliases(gear["nameEn"]),
            sourceTable="srd_adventuring_gear_table",
        )
        indexed[item.id] = item
    for tool in SRD_TOOL_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(tool["nameEn"]),
            nameKo=localized_equipment_name(tool["nameEn"]),
            nameEn=tool["nameEn"],
            kind="tool",
            costRaw=tool["costRaw"],
            weightRaw=tool["weightRaw"],
            equipmentCategory=tool["toolCategory"],
            aliasesKo=equipment_aliases(tool["nameEn"]),
            sourceTable="srd_tool_table",
        )
        indexed[item.id] = item
    for vehicle in SRD_MOUNT_AND_VEHICLE_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(vehicle["nameEn"]),
            nameKo=localized_equipment_name(vehicle["nameEn"]),
            nameEn=vehicle["nameEn"],
            kind="vehicle" if str(vehicle["equipmentCategory"]).startswith("vehicle") else "mount",
            costRaw=vehicle["costRaw"],
            weightRaw=vehicle["weightRaw"],
            equipmentCategory=vehicle["equipmentCategory"],
            propertiesRaw=vehicle.get("propertiesRaw"),
            aliasesKo=equipment_aliases(vehicle["nameEn"]),
            sourceTable="srd_mount_and_vehicle_table",
        )
        indexed[item.id] = item
    for trade_good in SRD_TRADE_GOODS_TABLE:
        item = EquipmentItem(
            id=equipment_item_id(trade_good["nameEn"]),
            nameKo=localized_equipment_name(trade_good["nameEn"]),
            nameEn=trade_good["nameEn"],
            kind="trade_good",
            costRaw=trade_good["costRaw"],
            weightRaw=trade_good["weightRaw"],
            equipmentCategory="trade_goods",
            aliasesKo=equipment_aliases(trade_good["nameEn"]),
            sourceTable="srd_trade_goods_table",
        )
        indexed[item.id] = item
    for class_option in class_options:
        for choice in class_option.startingEquipmentChoices:
            for option in choice.get("options", []):
                if not isinstance(option, dict):
                    continue
                for item in option.get("items", []):
                    if not isinstance(item, dict):
                        continue
                    item_id = str(item.get("id") or "")
                    name_ko = str(item.get("nameKo") or "")
                    if not item_id or not name_ko:
                        continue
                    if item_id not in indexed:
                        indexed[item_id] = EquipmentItem(
                            id=item_id,
                            nameKo=name_ko,
                            kind=str(item.get("kind") or "gear"),
                            quantityRaw=item.get("quantityRaw") if isinstance(item.get("quantityRaw"), str) else None,
                            aliasesKo=[name_ko],
                            sourceClassIds=[class_option.id],
                            sourceTable="class_starting_equipment",
                        )
                    else:
                        existing = indexed[item_id]
                        if class_option.id not in existing.sourceClassIds:
                            existing.sourceClassIds.append(class_option.id)
                        if name_ko not in existing.aliasesKo:
                            existing.aliasesKo.append(name_ko)
                        quantity_raw = item.get("quantityRaw")
                        if existing.quantityRaw is None and isinstance(quantity_raw, str):
                            existing.quantityRaw = quantity_raw
    return sorted(indexed.values(), key=lambda item: item.id)


def build_character_option_validation_report(
    race_options: list[RaceOption],
    class_options: list[ClassOption],
    equipment_items: list[EquipmentItem],
) -> dict[str, object]:
    equipment_item_ids = {item.id for item in equipment_items}
    race_required_fields = {
        "nameEn": lambda race: bool(race.nameEn),
        "sizeRaw": lambda race: bool(race.sizeRaw),
        "speedRaw": lambda race: bool(race.speedRaw),
        "abilityScoreIncreaseRaw": lambda race: bool(race.abilityScoreIncreaseRaw),
        "languagesRaw": lambda race: bool(race.languagesRaw),
        "traits": lambda race: bool(race.traits),
        "source.page": lambda race: bool(race.source.page),
    }
    class_required_fields = {
        "nameEn": lambda class_option: bool(class_option.nameEn),
        "hitDieRaw": lambda class_option: bool(class_option.hitDieRaw),
        "primaryAbilitiesRaw": lambda class_option: bool(class_option.primaryAbilitiesRaw),
        "savingThrowsRaw": lambda class_option: bool(class_option.savingThrowsRaw),
        "armorProficienciesRaw": lambda class_option: bool(class_option.armorProficienciesRaw),
        "weaponProficienciesRaw": lambda class_option: bool(class_option.weaponProficienciesRaw),
        "toolProficienciesRaw": lambda class_option: bool(class_option.toolProficienciesRaw),
        "skillChoicesRaw": lambda class_option: bool(class_option.skillChoicesRaw),
        "levelProgression.1-20": lambda class_option: len(class_option.levelProgression) == 20,
        "featureReferences": lambda class_option: bool(class_option.featureReferences),
        "source.page": lambda class_option: bool(class_option.source.page),
    }
    races_missing_required_fields = [
        {
            "id": race.id,
            "nameKo": race.nameKo,
            "missing": [field for field, predicate in race_required_fields.items() if not predicate(race)],
            "source": race.source.model_dump(),
        }
        for race in race_options
        if any(not predicate(race) for predicate in race_required_fields.values())
    ]
    classes_missing_required_fields = [
        {
            "id": class_option.id,
            "nameKo": class_option.nameKo,
            "missing": [
                field
                for field, predicate in class_required_fields.items()
                if not predicate(class_option)
            ],
            "source": class_option.source.model_dump(),
        }
        for class_option in class_options
        if any(not predicate(class_option) for predicate in class_required_fields.values())
    ]
    classes_missing_starting_equipment_choices = [
        {
            "id": class_option.id,
            "nameKo": class_option.nameKo,
            "source": class_option.source.model_dump(),
        }
        for class_option in class_options
        if not class_option.startingEquipmentChoices
    ]
    invalid_starting_equipment_choices: list[dict[str, object]] = []
    for class_option in class_options:
        for choice in class_option.startingEquipmentChoices:
            choice_id = str(choice.get("id") or "")
            options = choice.get("options")
            required_selections = choice.get("requiredSelections")
            if not choice_id or not isinstance(required_selections, int) or not isinstance(options, list) or not options:
                invalid_starting_equipment_choices.append(
                    {
                        "classId": class_option.id,
                        "choiceId": choice_id,
                        "problem": "choice missing id, requiredSelections, or options",
                    }
                )
                continue
            if required_selections < 1 or required_selections > len(options):
                invalid_starting_equipment_choices.append(
                    {
                        "classId": class_option.id,
                        "choiceId": choice_id,
                        "problem": "requiredSelections is outside option range",
                    }
                )
            for option in options:
                if not isinstance(option, dict):
                    invalid_starting_equipment_choices.append(
                        {
                            "classId": class_option.id,
                            "choiceId": choice_id,
                            "problem": "option is not an object",
                        }
                    )
                    continue
                item_refs = option.get("itemRefs")
                items = option.get("items")
                if not isinstance(item_refs, list) or not item_refs:
                    invalid_starting_equipment_choices.append(
                        {
                            "classId": class_option.id,
                            "choiceId": choice_id,
                            "problem": "option missing itemRefs",
                            "optionRaw": option.get("raw"),
                        }
                    )
                    continue
                missing_item_refs = sorted(str(item_ref) for item_ref in item_refs if item_ref not in equipment_item_ids)
                if missing_item_refs:
                    invalid_starting_equipment_choices.append(
                        {
                            "classId": class_option.id,
                            "choiceId": choice_id,
                            "problem": "option itemRefs missing from equipment_items catalog",
                            "missingItemRefs": missing_item_refs,
                            "optionRaw": option.get("raw"),
                        }
                    )
                if not isinstance(items, list) or len(items) != len(item_refs):
                    invalid_starting_equipment_choices.append(
                        {
                            "classId": class_option.id,
                            "choiceId": choice_id,
                            "problem": "items and itemRefs are not aligned",
                            "optionRaw": option.get("raw"),
                        }
                    )
    duplicate_feature_ids = sorted(
        {
            feature_id
            for class_option in class_options
            for feature_id in [
                str(feature.get("id") or "")
                for feature in class_option.featureReferences
                if isinstance(feature, dict)
            ]
            if feature_id
            and sum(
                1
                for other_class in class_options
                for other_feature in other_class.featureReferences
                if isinstance(other_feature, dict) and other_feature.get("id") == feature_id
            )
            > 1
        }
    )
    return {
        "racesMissingRequiredFields": races_missing_required_fields,
        "classesMissingRequiredFields": classes_missing_required_fields,
        "classesMissingStartingEquipmentChoices": classes_missing_starting_equipment_choices,
        "invalidStartingEquipmentChoices": invalid_starting_equipment_choices,
        "duplicateFeatureIds": duplicate_feature_ids,
        "readiness": {
            "raceValidatorInputReady": not races_missing_required_fields,
            "classCoreValidatorInputReady": not classes_missing_required_fields and not duplicate_feature_ids,
            "startingEquipmentValidatorInputReady": not classes_missing_starting_equipment_choices
            and not invalid_starting_equipment_choices,
        },
    }


CORE_RULE_FILES = {
    "checks": "능력_판정과_d20_규칙.md",
    "combat": "전투_기본_규칙.md",
    "damage": "피해와_회복.md",
    "spellcasting": "주문시전_규칙.md",
    "exploration": "탐험과_휴식.md",
}

ENGINE_OWNED_RULE_TITLES = {
    "유리함과 불리함",
    "숙련 보너스",
    "능력 판정",
    "일반적인 난이도 DC",
    "대결 판정",
    "수동 판정",
    "협력",
    "그룹 판정",
    "기습",
    "우선권",
    "자기 턴에 할 수 있는 것",
    "이동",
    "어려운 지형",
    "넘어짐",
    "행동",
    "추가 행동",
    "반응",
    "공격 굴림",
    "보이지 않는 공격자와 대상",
    "원거리 공격",
    "근접 공격",
    "기회 공격",
    "쌍수 전투",
    "붙잡기",
    "밀치기",
    "엄폐",
    "수중 전투",
    "HP",
    "피해 굴림",
    "치명타",
    "피해 유형",
    "저항과 취약",
    "회복",
    "HP 0이 되었을 때",
    "사망 내성 굴림",
    "안정화",
    "임시 HP",
    "주문 슬롯",
    "높은 레벨 슬롯으로 시전",
    "의식",
    "시전 시간",
    "사거리",
    "구성요소",
    "지속시간",
    "집중",
    "대상",
    "효과 범위",
    "내성 굴림",
    "마법 효과 결합",
    "강행군",
    "시야와 빛",
    "음식과 물",
    "질식",
    "낙하",
    "짧은 휴식",
    "긴 휴식",
}


def build_rule_cards() -> list[RuleCard]:
    cards: list[RuleCard] = []
    for domain, filename in CORE_RULE_FILES.items():
        path = TRANSLATED_ROOT / "rules" / filename
        for title, block in iter_markdown_sections(path):
            if title == "포함 범위":
                continue
            engine_owned = title in ENGINE_OWNED_RULE_TITLES
            cards.append(
                RuleCard(
                    id=f"rule.{domain}.{slugify_ko(title)}",
                    domain=domain,
                    titleKo=title,
                    engineOwned=engine_owned,
                    aiAssistOnly=True,
                    gmPolicy=False,
                    summaryKo=summarize_markdown(block),
                    aiAllowedUse=[
                        "interpret_intent",
                        "explain_confirmed_result",
                        "narrate_confirmed_result",
                    ],
                    aiForbiddenUse=[
                        "decide_game_truth",
                        "change_game_state",
                        "decide_dc",
                        "decide_hit_or_miss",
                        "decide_damage_or_healing",
                        "apply_or_remove_condition",
                    ]
                    if engine_owned
                    else ["change_game_state"],
                    source=SpellSource(
                        file=relative_to_ai(path),
                        page=None,
                        heading=title,
                    ),
                )
            )
    return cards


ENGINE_FORBIDDEN_USE = [
    "decide_game_truth",
    "change_game_state",
    "decide_dc",
    "decide_hit_or_miss",
    "decide_damage_or_healing",
    "apply_or_remove_condition",
    "consume_spell_slot",
]


STATIC_RULE_FRAGMENTS = [
    {
        "id": "rule.checks.saving_throw",
        "domain": "checks",
        "titleKo": "내성 굴림",
        "trigger": "action.type == saving_throw",
        "summaryKo": "내성 굴림은 주문, 함정, 환경 효과가 요구하는 능력으로 한다. 일반 내성 굴림은 d20 + 관련 능력 수정치 + 숙련 보너스(해당 시)이며, 성공/실패와 후속 효과 적용은 엔진이 확정한다.",
        "source_heading": "6개 능력치",
    },
    {
        "id": "rule.spellcasting.casting_time.action",
        "domain": "spellcasting",
        "titleKo": "시전 시간: 1 행동",
        "trigger": "spell.castingTime == 1 행동",
        "summaryKo": "시전 시간이 1 행동인 주문은 자기 턴의 행동 1회를 사용해 시전한다.",
        "source_heading": "시전 시간",
    },
    {
        "id": "rule.spellcasting.casting_time.bonus_action",
        "domain": "spellcasting",
        "titleKo": "시전 시간: 추가 행동",
        "trigger": "spell.castingTime == 추가 행동",
        "summaryKo": "추가 행동 주문은 자기 턴의 추가 행동 1회를 사용한다. 같은 턴의 다른 주문 제한은 엔진이 검증한다.",
        "source_heading": "시전 시간",
    },
    {
        "id": "rule.spellcasting.casting_time.reaction",
        "domain": "spellcasting",
        "titleKo": "시전 시간: 반응",
        "trigger": "spell.castingTime == 반응",
        "summaryKo": "반응 주문은 주문 설명의 트리거가 발생했을 때 반응을 사용해 시전한다.",
        "source_heading": "시전 시간",
    },
    {
        "id": "rule.spellcasting.casting_time.long",
        "domain": "spellcasting",
        "titleKo": "시전 시간: 긴 시전",
        "trigger": "spell.castingTime > 1 행동 또는 1 반응",
        "summaryKo": "시전 시간이 긴 주문은 시전 동안 매 턴 행동을 사용하고 집중을 유지해야 한다. 실패와 슬롯 소비 여부는 엔진이 검증한다.",
        "source_heading": "시전 시간",
    },
    {
        "id": "rule.spellcasting.range",
        "domain": "spellcasting",
        "titleKo": "주문 사거리",
        "trigger": "spell.range is not self",
        "summaryKo": "주문의 대상은 시전 시점에 주문 사거리 안에 있어야 한다.",
        "source_heading": "사거리",
    },
    {
        "id": "rule.spellcasting.components",
        "domain": "spellcasting",
        "titleKo": "주문 구성요소",
        "trigger": "spell.components exists",
        "summaryKo": "주문은 설명된 음성, 동작, 물질 구성요소를 요구한다. 충족 여부는 엔진이 검증한다.",
        "source_heading": "구성요소",
    },
    {
        "id": "rule.spellcasting.cantrip",
        "domain": "spellcasting",
        "titleKo": "캔트립",
        "trigger": "spell.level == 0",
        "summaryKo": "캔트립은 주문 슬롯을 소비하지 않는다.",
        "source_heading": "캔트립",
    },
    {
        "id": "rule.spellcasting.spell_slot",
        "domain": "spellcasting",
        "titleKo": "주문 슬롯",
        "trigger": "spell.level >= 1",
        "summaryKo": "1레벨 이상의 주문은 해당 레벨 이상의 주문 슬롯을 소비해 시전한다. 슬롯 보유, 소비, 높은 레벨 시전 효과는 엔진이 검증한다.",
        "source_heading": "주문 슬롯",
    },
    {
        "id": "rule.spellcasting.concentration",
        "domain": "spellcasting",
        "titleKo": "집중",
        "trigger": "spell.concentration == true",
        "summaryKo": "집중 주문은 지속 중 집중 상태를 요구한다. 집중 시작, 유지, 종료는 엔진이 검증한다.",
        "source_heading": "집중",
    },
    {
        "id": "rule.spellcasting.spell_attack",
        "domain": "spellcasting",
        "titleKo": "주문 공격 굴림",
        "trigger": "spell.playReference contains 주문 공격",
        "summaryKo": "주문 설명이 주문 공격을 요구하면 공격 굴림이 필요하다. 명중 여부는 엔진이 판정한다.",
        "source_heading": "공격 굴림",
    },
    {
        "id": "rule.spellcasting.saving_throw",
        "domain": "spellcasting",
        "titleKo": "주문 내성 굴림",
        "trigger": "spell.playReference contains 내성 굴림",
        "summaryKo": "주문 설명이 내성 굴림을 요구하면 대상은 지정된 능력으로 내성 굴림을 한다. 성공/실패는 엔진이 판정한다.",
        "source_heading": "내성 굴림",
    },
    {
        "id": "rule.combat.attack_roll",
        "domain": "combat",
        "titleKo": "공격 굴림",
        "trigger": "action requires attack roll",
        "summaryKo": "공격 굴림 결과가 대상 AC 이상이면 명중한다. 자연 1/20과 최종 명중 여부는 엔진이 처리한다.",
        "source_heading": "공격 굴림",
    },
    {
        "id": "rule.combat.initiative",
        "domain": "combat",
        "titleKo": "우선권 굴림",
        "trigger": "combat starts and creatures roll initiative",
        "summaryKo": "전투 시작 시 모든 전투원은 민첩 판정으로 우선권을 굴린다. 같은 종류 몬스터는 같은 우선권을 공유할 수 있고, 동률 처리와 최종 순서는 엔진 또는 GM 정책이 확정한다.",
        "source_heading": "우선권",
    },
    {
        "id": "rule.combat.cover",
        "domain": "combat",
        "titleKo": "엄폐 보정",
        "trigger": "attack or dexterity saving throw targets creature behind cover",
        "summaryKo": "절반 엄폐는 AC와 민첩 내성 굴림에 +2, 3/4 엄폐는 +5를 준다. 완전 엄폐는 직접 대상 지정 자체를 막고, 여러 엄폐는 가장 높은 단계만 적용한다.",
        "source_heading": "엄폐",
    },
    {
        "id": "rule.combat.difficult_terrain",
        "domain": "combat",
        "titleKo": "전투 중 어려운 지형 이동 비용",
        "trigger": "movement path enters difficult terrain during combat",
        "summaryKo": "어려운 지형에서는 이동 1피트마다 추가 1피트가 더 든다. 기어가기 같은 다른 이동 비용과 중첩될 수 있으며, 실제 이동 가능 여부와 남은 이동력은 엔진이 계산한다.",
        "source_heading": "어려운 지형",
    },
    {
        "id": "rule.combat.surprise",
        "domain": "combat",
        "titleKo": "기습 판정",
        "trigger": "combat starts after hidden or unnoticed approach",
        "summaryKo": "기습 여부는 숨은 쪽의 은신 결과와 상대의 수동 지각을 비교해 정한다. 기습당한 크리처는 첫 턴에 이동이나 행동을 할 수 없고, 그 턴이 끝날 때까지 반응도 할 수 없다.",
        "source_heading": "기습",
    },
    {
        "id": "rule.damage.healing",
        "domain": "damage",
        "titleKo": "회복",
        "trigger": "effect restores hit points",
        "summaryKo": "회복은 현재 HP를 증가시키지만 최대 HP를 넘길 수 없다. HP 0 상태에서 회복되면 의식을 회복할 수 있으며, 실제 상태 변경은 엔진이 확정한다.",
        "source_heading": "회복",
    },
    {
        "id": "rule.damage.damage_roll",
        "domain": "damage",
        "titleKo": "피해 굴림",
        "trigger": "attack or spell produces damage dice",
        "summaryKo": "피해 주사위와 보정치는 명중 또는 실패 여부가 확정된 뒤 엔진이 계산한다. AI는 피해식을 식별할 수 있지만 HP를 직접 바꾸지 않는다.",
        "source_heading": "피해 굴림",
    },
    {
        "id": "rule.equipment.item_use",
        "domain": "equipment",
        "titleKo": "아이템 사용",
        "trigger": "action.type == use_item",
        "summaryKo": "아이템 사용은 행동 비용, 소모 여부, 대상, 적용 효과를 엔진이 검증한다. AI는 아이템 ID와 의도만 제안한다.",
        "source_heading": "자주 쓰는 장비 규칙",
    },
    {
        "id": "rule.equipment.magic_item_bonus",
        "domain": "equipment",
        "titleKo": "마법 아이템 보너스",
        "trigger": "equipped magic item grants numeric attack damage or AC bonus",
        "summaryKo": "MVP에서는 +1 무기, +1 갑옷, +1 방패처럼 수치 보너스가 명확한 마법 아이템만 자동 적용한다. 중복과 장착 조건은 엔진이 검증한다.",
        "source_heading": "자주 쓰는 장비 규칙",
    },
]


def build_rule_fragments() -> list[RuleFragment]:
    source_files = {
        "checks": TRANSLATED_ROOT / "rules" / "능력_판정과_d20_규칙.md",
        "spellcasting": TRANSLATED_ROOT / "rules" / "주문시전_규칙.md",
        "combat": TRANSLATED_ROOT / "rules" / "전투_기본_규칙.md",
        "damage": TRANSLATED_ROOT / "rules" / "피해와_회복.md",
        "equipment": TRANSLATED_ROOT / "items" / "general-equipment-reference.md",
    }
    return [
        RuleFragment(
            id=item["id"],
            domain=item["domain"],
            titleKo=item["titleKo"],
            trigger=item["trigger"],
            engineOwned=True,
            summaryKo=item["summaryKo"],
            aiForbiddenUse=ENGINE_FORBIDDEN_USE,
            source=SpellSource(
                file=relative_to_ai(source_files[item["domain"]]),
                page=None,
                heading=item["source_heading"],
            ),
        )
        for item in STATIC_RULE_FRAGMENTS
    ]


STATIC_RULE_HOOK_FIXTURES = [
    {
        "id": "hook.combat.resolve_attack_roll",
        "domain": "combat",
        "titleKo": "공격 명중 판정",
        "engineFunction": "resolve_attack_roll",
        "trigger": "action.requiresRoll == true and action.attackKind in weapon_attack|melee_spell_attack|ranged_spell_attack",
        "consumes": ["naturalD20", "attackBonus", "targetArmorClass", "advantageState"],
        "produces": ["attackRollTotal", "hit", "criticalHit", "criticalMiss"],
        "sourceRuleIds": [
            "rule.combat.공격_굴림",
            "rule.spellcasting.공격_굴림",
            "rule.combat.attack_roll",
            "rule.spellcasting.spell_attack",
        ],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "naturalD20 == 1 always produces hit=false",
            "naturalD20 == 20 always produces hit=true and criticalHit=true",
            "otherwise hit is attackRollTotal >= targetArmorClass",
            "AI output may request the roll but must not decide hit or miss",
        ],
    },
    {
        "id": "hook.check.resolve_ability_or_skill_check",
        "domain": "check",
        "titleKo": "능력/기술 판정",
        "engineFunction": "resolve_ability_or_skill_check",
        "trigger": "action.type in ability_check|skill_check",
        "consumes": ["naturalD20", "modifier", "difficultyClass", "advantageState"],
        "produces": ["checkRollTotal", "success", "criticalSuccess", "criticalFailure"],
        "sourceRuleIds": [
            "rule.checks.능력_판정",
            "rule.checks.기술",
            "rule.checks.숙련_보너스",
            "rule.checks.일반적인_난이도_dc",
        ],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "the backend selects the final DC from scenario data or GM-confirmed context",
            "checkRollTotal is naturalD20 + modifier",
            "success is checkRollTotal >= difficultyClass",
            "AI may suggest the intent and skill but must not decide success or failure",
        ],
    },
    {
        "id": "hook.check.resolve_saving_throw",
        "domain": "check",
        "titleKo": "내성 굴림 판정",
        "engineFunction": "resolve_saving_throw",
        "trigger": "action.type == saving_throw",
        "consumes": ["naturalD20", "modifier", "difficultyClass", "advantageState", "saveAbility"],
        "produces": ["checkRollTotal", "success", "criticalSuccess", "criticalFailure"],
        "sourceRuleIds": [
            "rule.checks.saving_throw",
            "rule.checks.숙련_보너스",
            "rule.checks.유리함과_불리함",
            "rule.spellcasting.saving_throw",
        ],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "difficultyClass comes from the spell, trap, terrain, or scenario-authored effect",
            "checkRollTotal is naturalD20 + modifier",
            "ordinary saving throws do not auto-succeed on naturalD20 == 20 or auto-fail on naturalD20 == 1 unless a narrower rule says so",
            "success is checkRollTotal >= difficultyClass",
            "AI may identify the save ability and stakes but must not decide the outcome",
        ],
    },
    {
        "id": "hook.damage.apply_resistance_vulnerability",
        "domain": "damage",
        "titleKo": "피해 저항/취약 적용",
        "engineFunction": "apply_damage_modifiers",
        "trigger": "confirmedDamagePacket exists before HP mutation",
        "consumes": ["baseDamage", "damageType", "targetImmunities", "targetResistances", "targetVulnerabilities"],
        "produces": ["finalDamage", "appliedDamageModifiers"],
        "sourceRuleIds": ["rule.damage.저항과_취약"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "immunity reduces matching damage type to 0",
            "resistance halves matching damage type after other flat modifiers",
            "vulnerability doubles matching damage type after other flat modifiers",
            "duplicate resistance or vulnerability for the same type applies only once",
        ],
    },
    {
        "id": "hook.condition.apply_prone_modifiers",
        "domain": "condition",
        "titleKo": "넘어짐 상태 전투 보정",
        "engineFunction": "apply_condition_modifiers",
        "trigger": "target.conditions contains condition.prone or movement declares stand_up/crawl",
        "consumes": ["condition.prone", "attackerDistanceFt", "remainingMovementFt", "baseSpeedFt"],
        "produces": ["movementCostFt", "selfAttackDisadvantage", "incomingAttackAdvantageState"],
        "sourceRuleIds": ["rule.combat.넘어짐"],
        "sourceEntityIds": ["condition.prone"],
        "acceptanceChecks": [
            "standing up costs half of baseSpeedFt and removes prone only after engine accepts the cost",
            "a prone creature has disadvantage on its attack rolls",
            "attacks against prone targets within 5 feet have advantage",
            "attacks against prone targets farther than 5 feet have disadvantage",
        ],
    },
    {
        "id": "hook.combat.resolve_initiative_order",
        "domain": "combat",
        "titleKo": "우선권 순서 결정",
        "engineFunction": "resolve_initiative_order",
        "trigger": "combat starts and initiative order must be fixed",
        "consumes": ["naturalD20", "dexterityModifier", "initiativeBonus", "participantGroupId", "participantIds", "tiebreakPolicy"],
        "produces": ["initiativeTotal", "groupedParticipants", "tiebreakRequired"],
        "sourceRuleIds": ["rule.combat.우선권", "rule.combat.initiative"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "initiativeTotal is naturalD20 + dexterityModifier + initiativeBonus",
            "same-species monsters may share one initiative when participantGroupId is provided",
            "ties are resolved by backend or GM policy, not by AI freeform narration",
            "AI may announce combat start but must not finalize turn order",
        ],
    },
    {
        "id": "hook.combat.apply_cover_modifiers",
        "domain": "combat",
        "titleKo": "엄폐 보정 적용",
        "engineFunction": "apply_cover_modifiers",
        "trigger": "attack roll or dexterity saving throw targets creature behind cover",
        "consumes": ["coverLevel", "targetArmorClass", "baseDifficultyClass", "checkType", "directTargeting"],
        "produces": ["adjustedArmorClass", "adjustedDifficultyClass", "targetable"],
        "sourceRuleIds": ["rule.combat.엄폐", "rule.combat.cover", "rule.checks.saving_throw"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "half cover adds +2 to AC and Dexterity saving throws",
            "three-quarters cover adds +5 to AC and Dexterity saving throws",
            "full cover makes targetable=false for direct attacks and spells",
            "only the highest cover level applies",
            "AI may point out cover but must not mutate AC, DC, or targetability directly",
        ],
    },
    {
        "id": "hook.combat.apply_difficult_terrain_cost",
        "domain": "combat",
        "titleKo": "어려운 지형 이동 비용 적용",
        "engineFunction": "apply_difficult_terrain_cost",
        "trigger": "movement path includes difficult terrain during exploration or combat",
        "consumes": ["enteredDifficultTerrain", "intendedDistanceFt", "remainingMovementFt", "baseCostPerFoot"],
        "produces": ["movementCostFt", "movementAllowed", "remainingMovementFtAfterMove"],
        "sourceRuleIds": ["rule.combat.어려운_지형", "rule.exploration.어려운_지형", "rule.combat.difficult_terrain"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "each foot of difficult terrain costs one extra foot of movement",
            "when enteredDifficultTerrain is false, movementCostFt equals intendedDistanceFt * baseCostPerFoot",
            "movementAllowed is false if movementCostFt exceeds remainingMovementFt",
            "AI may describe slow terrain but must not spend movement or reposition tokens directly",
        ],
    },
    {
        "id": "hook.combat.resolve_surprise",
        "domain": "combat",
        "titleKo": "기습 여부 결정",
        "engineFunction": "resolve_surprise_state",
        "trigger": "combat starts after stealth, ambush, or alerted breach",
        "consumes": ["stealthTotals", "passivePerceptionScores", "alreadyAlertedIds"],
        "produces": ["surprisedTargetIds", "awareTargetIds", "surpriseDetected"],
        "sourceRuleIds": ["rule.combat.기습", "rule.combat.surprise", "rule.checks.수동_판정", "rule.checks.기술"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "a creature is surprised when it fails to notice an opposing threat before combat starts",
            "already alerted creatures cannot become surprised again in the same encounter start",
            "surprised creatures still roll initiative but cannot move, act, or react on their first turn",
            "AI may suggest stealth approach but must not decide who is surprised",
        ],
    },
    {
        "id": "hook.spell.cast_chill_touch",
        "domain": "spellcasting",
        "titleKo": "싸늘한 손길 시전 처리",
        "engineFunction": "resolve_spell_cast",
        "trigger": "action.type == cast_spell and action.spellId == spell.chill_touch",
        "consumes": [
            "spell.chill_touch",
            "casterKnownCantrips",
            "actionAvailable",
            "targetDistanceFt",
            "componentAvailability",
            "spellAttackRollResult",
        ],
        "produces": ["validatedSpellCast", "damagePacket.necrotic", "healingBlockedUntil", "undeadAttackDisadvantage"],
        "sourceRuleIds": [
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.components",
            "rule.spellcasting.cantrip",
            "rule.spellcasting.spell_attack",
            "rule.combat.attack_roll",
        ],
        "sourceEntityIds": ["spell.chill_touch"],
        "acceptanceChecks": [
            "spell.chill_touch consumes an action and no spell slot because it is a cantrip",
            "target must be within 120 feet when the spell is cast",
            "verbal and somatic components must be available",
            "hit requires a ranged spell attack resolved by hook.combat.resolve_attack_roll",
            "on hit, healing is blocked until the caster's next turn starts",
        ],
    },
    {
        "id": "hook.spell.cast_fire_bolt",
        "domain": "spellcasting",
        "titleKo": "화염 화살 시전 처리",
        "engineFunction": "resolve_spell_cast",
        "trigger": "action.type == cast_spell and action.spellId == spell.fire_bolt",
        "consumes": [
            "spell.fire_bolt",
            "casterKnownCantrips",
            "actionAvailable",
            "targetDistanceFt",
            "componentAvailability",
            "spellAttackRollResult",
        ],
        "produces": ["validatedSpellCast", "damagePacket.fire"],
        "sourceRuleIds": [
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.components",
            "rule.spellcasting.cantrip",
            "rule.spellcasting.spell_attack",
            "rule.combat.attack_roll",
            "rule.damage.damage_roll",
        ],
        "sourceEntityIds": ["spell.fire_bolt"],
        "acceptanceChecks": [
            "spell.fire_bolt consumes an action and no spell slot because it is a cantrip",
            "target must be within 120 feet when the spell is cast",
            "hit requires a ranged spell attack resolved by hook.combat.resolve_attack_roll",
            "on hit, fire damage starts at 1d10 and scales by character level",
        ],
    },
    {
        "id": "hook.spell.cast_magic_missile",
        "domain": "spellcasting",
        "titleKo": "마법 화살 시전 처리",
        "engineFunction": "resolve_spell_cast",
        "trigger": "action.type == cast_spell and action.spellId == spell.magic_missile",
        "consumes": [
            "spell.magic_missile",
            "casterPreparedSpells",
            "actionAvailable",
            "spellSlotAvailable",
            "targetIds",
            "dartAllocation",
        ],
        "produces": ["validatedSpellCast", "forceDamagePackets", "spellSlotExpended"],
        "sourceRuleIds": [
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.components",
            "rule.spellcasting.spell_slot",
            "rule.damage.damage_roll",
        ],
        "sourceEntityIds": ["spell.magic_missile"],
        "acceptanceChecks": [
            "spell.magic_missile consumes one 1st-level or higher spell slot",
            "each dart hits automatically without an attack roll",
            "three darts each deal 1d4 + 1 force damage at 1st level",
            "dartAllocation must assign all darts to valid visible targets in range",
        ],
    },
    {
        "id": "hook.spell.cast_cure_wounds",
        "domain": "spellcasting",
        "titleKo": "상처 치료 시전 처리",
        "engineFunction": "resolve_healing_spell",
        "trigger": "action.type == cast_spell and action.spellId == spell.cure_wounds",
        "consumes": [
            "spell.cure_wounds",
            "casterPreparedSpells",
            "actionAvailable",
            "spellSlotAvailable",
            "targetTouchReach",
            "healingRoll",
            "currentHitPoints",
            "maxHitPoints",
        ],
        "produces": ["validatedSpellCast", "hitPointsRestored", "newHitPoints", "spellSlotExpended"],
        "sourceRuleIds": [
            "rule.spellcasting.casting_time.action",
            "rule.spellcasting.range",
            "rule.spellcasting.components",
            "rule.spellcasting.spell_slot",
            "rule.damage.healing",
        ],
        "sourceEntityIds": ["spell.cure_wounds"],
        "acceptanceChecks": [
            "spell.cure_wounds consumes one 1st-level or higher spell slot",
            "target must be within touch reach and must not be undead or construct",
            "healing is 1d8 + spellcasting ability modifier at 1st level",
            "newHitPoints must not exceed maxHitPoints",
        ],
    },
    {
        "id": "hook.item.bag_of_holding_capacity",
        "domain": "item",
        "titleKo": "보유의 주머니 용량 검증",
        "engineFunction": "validate_container_capacity",
        "trigger": "inventoryMutation targets magic_item.bag_of_holding",
        "consumes": ["itemCurrentWeightLb", "itemCurrentVolumeCuFt", "addedWeightLb", "addedVolumeCuFt", "containerIntegrity"],
        "produces": ["acceptedInventoryMutation", "capacityViolation", "containerDestroyed"],
        "sourceRuleIds": [],
        "sourceEntityIds": ["magic_item.bag_of_holding"],
        "acceptanceChecks": [
            "capacity must not exceed 500 pounds",
            "capacity must not exceed 64 cubic feet",
            "the bag weighs 15 pounds regardless of contents",
            "piercing, tearing, or overload must be represented as an engine event, not an AI state mutation",
        ],
    },
    {
        "id": "hook.item.use_potion_of_healing",
        "domain": "item",
        "titleKo": "치유 물약 사용",
        "engineFunction": "apply_healing_item",
        "trigger": "action.type == use_item and action.itemId == magic_item.potion_of_healing",
        "consumes": [
            "magic_item.potion_of_healing",
            "actionAvailable",
            "targetReach",
            "healingRoll.2d4",
            "currentHitPoints",
            "maxHitPoints",
            "inventoryQuantity",
        ],
        "produces": ["hitPointsRestored", "newHitPoints", "itemConsumed", "actionSpent"],
        "sourceRuleIds": ["rule.equipment.item_use", "rule.damage.healing"],
        "sourceEntityIds": ["magic_item.potion_of_healing"],
        "acceptanceChecks": [
            "using the potion requires an available action in MVP",
            "healing amount is 2d4 + 2",
            "newHitPoints must not exceed maxHitPoints",
            "one potion is consumed only after the engine accepts the use",
        ],
    },
    {
        "id": "hook.item.apply_flat_magic_bonus",
        "domain": "item",
        "titleKo": "마법 장비 +1 보너스 적용",
        "engineFunction": "apply_magic_item_bonus",
        "trigger": "equipped MVP magic item grants +1 attack damage or AC bonus",
        "consumes": ["equippedMagicItemIds", "baseAttackBonus", "baseDamageBonus", "baseArmorClass", "shieldEquipped"],
        "produces": ["attackBonusDelta", "damageBonusDelta", "armorClassDelta", "appliedMagicItemBonuses"],
        "sourceRuleIds": ["rule.equipment.magic_item_bonus"],
        "sourceEntityIds": [
            "magic_item.weapon_1_2_or_3",
            "magic_item.armor_1_2_or_3",
            "magic_item.shield_1_2_or_3",
            "magic_item.ammunition_1_2_or_3",
        ],
        "acceptanceChecks": [
            "MVP automation applies only the +1 variant of +1/+2/+3 catalog rows",
            "weapon bonus applies to attack and damage for the qualifying equipped weapon",
            "armor and shield bonuses apply to AC only when equipped",
            "AI may identify the item but must not mutate attack bonus, damage, or AC directly",
        ],
    },
    {
        "id": "hook.class.ranger.fighting_style_archery",
        "domain": "class_feature",
        "titleKo": "레인저 전투 방식: 궁술",
        "engineFunction": "apply_ranger_archery_fighting_style",
        "trigger": "ranged weapon attack by ranger with Archery fighting style",
        "consumes": ["rangerLevel", "selectedFightingStyle", "attackKind", "weaponProperties", "baseAttackBonus"],
        "produces": ["attackBonusDelta", "finalAttackBonus", "fightingStyleApplied"],
        "sourceRuleIds": ["rule.combat.attack_roll"],
        "sourceEntityIds": [],
        "acceptanceChecks": [
            "feature requires rangerLevel >= 2",
            "selectedFightingStyle must be Archery",
            "bonus applies only to ranged weapon attacks, not melee attacks or spell attacks",
            "attackBonusDelta is +2 when applicable",
            "AI may identify the fighting style but must not mutate the attack bonus directly",
        ],
    },
    {
        "id": "hook.class.ranger.natural_explorer_check",
        "domain": "class_feature",
        "titleKo": "레인저 자연 탐험가 판정 보정",
        "engineFunction": "apply_ranger_natural_explorer_check",
        "trigger": "ability or skill check in favored terrain context by ranger with Natural Explorer",
        "consumes": [
            "rangerLevel",
            "favoredTerrainActive",
            "checkKind",
            "abilityOrSkill",
            "proficiencyApplied",
            "baseCheckModifier",
        ],
        "produces": ["checkModifierDelta", "finalCheckModifier", "naturalExplorerApplied"],
        "sourceRuleIds": ["rule.checks.기술", "rule.checks.숙련_보너스"],
        "sourceEntityIds": ["class.ranger.feature.자연_탐험가"],
        "acceptanceChecks": [
            "feature requires rangerLevel >= 1",
            "favored terrain must be active from scenario or GM-confirmed context",
            "when an Intelligence or Wisdom check uses an already-proficient skill, proficiency bonus is doubled",
            "the engine decides whether the scene matches favored terrain",
            "AI may propose the context but must not apply the modifier directly",
        ],
    },
    {
        "id": "hook.class.fighter.second_wind",
        "domain": "class_feature",
        "titleKo": "파이터 재기의 숨결 회복",
        "engineFunction": "apply_second_wind",
        "trigger": "action.type == use_class_feature and action.featureId == class.fighter.feature.재기의_숨결",
        "consumes": ["fighterLevel", "bonusActionAvailable", "secondWindAvailable", "healingRoll.d10", "currentHitPoints", "maxHitPoints"],
        "produces": ["hitPointsRestored", "newHitPoints", "secondWindExpended", "bonusActionSpent"],
        "sourceRuleIds": [],
        "sourceEntityIds": ["class.fighter.feature.재기의_숨결"],
        "acceptanceChecks": [
            "feature use requires an available bonus action",
            "healing amount is 1d10 + fighterLevel",
            "newHitPoints must not exceed maxHitPoints",
            "feature cannot be used again until the required rest recovery is accepted by the engine",
            "AI may identify the feature but must not roll healing or mutate hit points",
        ],
    },
    {
        "id": "hook.class.fighter.action_surge",
        "domain": "class_feature",
        "titleKo": "파이터 행동 연쇄 추가 행동",
        "engineFunction": "apply_action_surge",
        "trigger": "action.type == use_class_feature and action.featureId == class.fighter.feature.행동_연쇄",
        "consumes": ["fighterLevel", "actionSurgeAvailableUses", "turnActionState"],
        "produces": ["additionalActionGranted", "actionSurgeExpended", "remainingActionSurgeUses"],
        "sourceRuleIds": ["rule.combat.행동"],
        "sourceEntityIds": ["class.fighter.feature.행동_연쇄"],
        "acceptanceChecks": [
            "feature grants one additional action on the user's turn",
            "feature use spends one action surge use",
            "fighterLevel >= 17 allows two uses between rests but still only one use on the same turn",
            "AI may request action surge but must not grant extra actions directly",
        ],
    },
    {
        "id": "hook.class.fighter.champion_critical_threshold",
        "domain": "class_feature",
        "titleKo": "챔피언 치명타 기준",
        "engineFunction": "apply_critical_threshold_modifier",
        "trigger": "attackRoll.naturalD20 exists and attacker has Champion critical feature",
        "consumes": ["naturalD20", "attackKind", "fighterLevel", "subclassFeatureIds"],
        "produces": ["criticalThreshold", "criticalHit"],
        "sourceRuleIds": ["rule.combat.attack_roll"],
        "sourceEntityIds": [
            "class.fighter.subclass_feature.향상된_치명타",
            "class.fighter.subclass_feature.우월한_치명타",
        ],
        "acceptanceChecks": [
            "Champion level 3 feature sets weapon attack critical threshold to 19-20",
            "Champion level 15 feature sets weapon attack critical threshold to 18-20",
            "critical threshold modifier applies only to qualifying weapon attacks",
            "AI may mention the feature but must not decide whether an attack is critical",
        ],
    },
    {
        "id": "hook.class.rogue.sneak_attack",
        "domain": "class_feature",
        "titleKo": "로그 암습 추가 피해",
        "engineFunction": "apply_sneak_attack",
        "trigger": "confirmedAttackHit exists and attacker has class.rogue.feature.암습",
        "consumes": [
            "rogueLevel",
            "attackKind",
            "weaponProperties",
            "hasAdvantage",
            "hasDisadvantage",
            "targetEnemyWithin5Ft",
            "sneakAttackAvailableThisTurn",
            "baseDamage",
        ],
        "produces": ["sneakAttackDice", "sneakAttackDamage", "sneakAttackExpendedThisTurn", "damagePacket"],
        "sourceRuleIds": ["rule.combat.attack_roll"],
        "sourceEntityIds": ["class.rogue.feature.암습"],
        "acceptanceChecks": [
            "sneak attack applies at most once per turn",
            "attack must use a finesse weapon or ranged weapon",
            "attack must have advantage or satisfy the nearby enemy exception",
            "nearby enemy exception fails if the attack has disadvantage",
            "sneak attack dice come from rogue level progression",
            "AI may request sneak attack but must not add extra damage directly",
        ],
    },
    {
        "id": "hook.class.rogue.cunning_action",
        "domain": "class_feature",
        "titleKo": "로그 교활한 행동",
        "engineFunction": "apply_cunning_action",
        "trigger": "action.type == use_class_feature and action.featureId == class.rogue.feature.교활한_행동",
        "consumes": ["rogueLevel", "bonusActionAvailable", "declaredCunningAction"],
        "produces": ["bonusActionSpent", "grantedActionType"],
        "sourceRuleIds": [],
        "sourceEntityIds": ["class.rogue.feature.교활한_행동"],
        "acceptanceChecks": [
            "feature requires rogueLevel >= 2",
            "feature use requires an available bonus action",
            "declaredCunningAction must be Dash, Disengage, or Hide",
            "the selected action's own movement, opportunity attack, or stealth rules remain engine-validated",
            "AI may identify cunning action but must not spend the bonus action or grant the action directly",
        ],
    },
]


def build_rule_hook_fixtures() -> list[RuleHookFixture]:
    return [
        RuleHookFixture(
            id=item["id"],
            domain=item["domain"],
            titleKo=item["titleKo"],
            engineFunction=item["engineFunction"],
            trigger=item["trigger"],
            consumes=item["consumes"],
            produces=item["produces"],
            sourceRuleIds=item["sourceRuleIds"],
            sourceEntityIds=item["sourceEntityIds"],
            aiForbiddenUse=ENGINE_FORBIDDEN_USE,
            acceptanceChecks=item["acceptanceChecks"],
        )
        for item in STATIC_RULE_HOOK_FIXTURES
    ]


P0_BACKEND_HOOK_IDS = {
    "hook.combat.resolve_attack_roll",
    "hook.check.resolve_ability_or_skill_check",
    "hook.check.resolve_saving_throw",
    "hook.damage.apply_resistance_vulnerability",
    "hook.condition.apply_prone_modifiers",
    "hook.combat.resolve_initiative_order",
    "hook.combat.apply_cover_modifiers",
    "hook.combat.apply_difficult_terrain_cost",
    "hook.combat.resolve_surprise",
    "hook.spell.cast_chill_touch",
    "hook.spell.cast_fire_bolt",
    "hook.spell.cast_magic_missile",
    "hook.spell.cast_cure_wounds",
    "hook.item.use_potion_of_healing",
    "hook.item.apply_flat_magic_bonus",
    "hook.class.ranger.fighting_style_archery",
    "hook.class.ranger.natural_explorer_check",
    "hook.class.fighter.second_wind",
    "hook.class.rogue.sneak_attack",
}


def build_backend_engine_p0_contracts(
    rule_hook_fixtures: list[RuleHookFixture] | None = None,
) -> list[BackendEngineContractCase]:
    hooks = {hook.id: hook for hook in (rule_hook_fixtures or build_rule_hook_fixtures())}
    cases = [
        {
            "caseId": "attack_roll.normal_hit",
            "hookId": "hook.combat.resolve_attack_roll",
            "priority": "P0",
            "request": {
                "hookId": "hook.combat.resolve_attack_roll",
                "sessionId": "session-demo-1",
                "turnId": "turn-attack-1",
                "actorCharacterId": "fighter-1",
                "targetId": "goblin-1",
                "input": {
                    "naturalD20": 17,
                    "attackBonus": 5,
                    "targetArmorClass": 15,
                    "advantageState": "normal",
                },
                "sourceAction": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "attackKind": "weapon_attack",
                    "requiresRoll": True,
                },
                "sourceTraceId": "trace-demo-interpreter-1",
            },
            "expectedResponse": {
                "hookId": "hook.combat.resolve_attack_roll",
                "accepted": True,
                "produced": {
                    "attackRollTotal": 22,
                    "hit": True,
                    "criticalHit": False,
                    "criticalMiss": False,
                },
                "statePatch": [],
                "turnLogEvents": [{"type": "attack_roll_resolved", "public": True}],
                "rejectedReason": None,
            },
            "assertions": [
                "naturalD20 == 1 produces criticalMiss=true and hit=false",
                "naturalD20 == 20 produces criticalHit=true and hit=true",
                "otherwise hit is attackRollTotal >= targetArmorClass",
            ],
        },
        {
            "caseId": "damage.resistance_halves",
            "hookId": "hook.damage.apply_resistance_vulnerability",
            "priority": "P0",
            "request": {
                "hookId": "hook.damage.apply_resistance_vulnerability",
                "sessionId": "session-demo-1",
                "turnId": "turn-damage-1",
                "actorCharacterId": "fighter-1",
                "targetId": "skeleton-1",
                "input": {
                    "baseDamage": 10,
                    "damageType": "slashing",
                    "targetImmunities": [],
                    "targetResistances": ["slashing"],
                    "targetVulnerabilities": [],
                },
                "sourceAction": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "skeleton-1",
                    "requiresRoll": True,
                },
                "sourceTraceId": None,
            },
            "expectedResponse": {
                "hookId": "hook.damage.apply_resistance_vulnerability",
                "accepted": True,
                "produced": {
                    "finalDamage": 5,
                    "appliedDamageModifiers": ["resistance:slashing"],
                },
                "statePatch": [],
                "turnLogEvents": [{"type": "damage_modifiers_applied", "public": True}],
                "rejectedReason": None,
            },
            "assertions": [
                "immunity reduces finalDamage to 0",
                "resistance halves damage once after other flat modifiers",
                "vulnerability doubles damage once",
            ],
        },
        {
            "caseId": "check.investigate_tracks_success",
            "hookId": "hook.check.resolve_ability_or_skill_check",
            "priority": "P0",
            "request": {
                "hookId": "hook.check.resolve_ability_or_skill_check",
                "sessionId": "session-demo-1",
                "turnId": "turn-investigate-tracks",
                "actorCharacterId": "rogue-1",
                "targetId": "node_cave_entrance",
                "input": {
                    "naturalD20": 13,
                    "modifier": 4,
                    "difficultyClass": 10,
                    "advantageState": "normal",
                },
                "sourceAction": {
                    "type": "skill_check",
                    "actorCharacterId": "rogue-1",
                    "targetId": "node_cave_entrance",
                    "skill": "investigation",
                    "requiresRoll": True,
                },
                "sourceTraceId": "trace-demo-investigate-tracks",
            },
            "expectedResponse": {
                "hookId": "hook.check.resolve_ability_or_skill_check",
                "accepted": True,
                "produced": {
                    "checkRollTotal": 17,
                    "success": True,
                    "criticalSuccess": False,
                    "criticalFailure": False,
                },
                "statePatch": [],
                "turnLogEvents": [{"type": "check_resolved", "public": True}],
                "rejectedReason": None,
            },
            "assertions": [
                "backend uses the scenario DC for investigate_tracks",
                "success is total >= difficultyClass",
                "AI may request the check but must not reveal the result before backend resolution",
            ],
        },
        {
            "caseId": "prone.adjacent_attacker",
            "hookId": "hook.condition.apply_prone_modifiers",
            "priority": "P0",
            "request": {
                "hookId": "hook.condition.apply_prone_modifiers",
                "sessionId": "session-demo-1",
                "turnId": "turn-prone-1",
                "actorCharacterId": "fighter-1",
                "targetId": "goblin-1",
                "input": {
                    "condition.prone": True,
                    "attackerDistanceFt": 5,
                    "remainingMovementFt": 30,
                    "baseSpeedFt": 30,
                },
                "sourceAction": {
                    "type": "move",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "approach": "일어나서 근접 공격을 준비한다.",
                },
                "sourceTraceId": "trace-demo-interpreter-2",
            },
            "expectedResponse": {
                "hookId": "hook.condition.apply_prone_modifiers",
                "accepted": True,
                "produced": {
                    "movementCostFt": 15,
                    "selfAttackDisadvantage": True,
                    "incomingAttackAdvantageState": "advantage",
                },
                "statePatch": [],
                "turnLogEvents": [{"type": "condition_modifiers_applied", "public": True}],
                "rejectedReason": None,
            },
            "assertions": [
                "standing up costs half of baseSpeedFt",
                "prone creature has disadvantage on its own attack rolls",
                "incoming attack within 5 feet has advantage; farther attacks have disadvantage",
            ],
        },
        {
            "caseId": "chill_touch.valid_hit",
            "hookId": "hook.spell.cast_chill_touch",
            "priority": "P0",
            "request": {
                "hookId": "hook.spell.cast_chill_touch",
                "sessionId": "session-demo-1",
                "turnId": "turn-spell-1",
                "actorCharacterId": "wizard-1",
                "targetId": "goblin-1",
                "input": {
                    "spell.chill_touch": True,
                    "casterKnownCantrips": ["spell.chill_touch"],
                    "actionAvailable": True,
                    "targetDistanceFt": 90,
                    "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                    "spellAttackRollResult": {
                        "attackRollTotal": 18,
                        "hit": True,
                        "criticalHit": False,
                        "criticalMiss": False,
                    },
                },
                "sourceAction": {
                    "type": "cast_spell",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "spellId": "spell.chill_touch",
                    "attackKind": "ranged_spell_attack",
                    "requiresRoll": True,
                },
                "sourceTraceId": "trace-demo-interpreter-3",
            },
            "expectedResponse": {
                "hookId": "hook.spell.cast_chill_touch",
                "accepted": True,
                "produced": {
                    "validatedSpellCast": True,
                    "damagePacket.necrotic": {"dice": "1d8", "scalesByCharacterLevel": True},
                    "healingBlockedUntil": "caster_next_turn_start",
                    "undeadAttackDisadvantage": False,
                },
                "statePatch": [],
                "turnLogEvents": [{"type": "spell_cast_validated", "public": True}],
                "rejectedReason": None,
            },
            "assertions": [
                "spell.chill_touch is a cantrip and consumes no spell slot",
                "targetDistanceFt must be <= 120",
                "spellAttackRollResult must come from hook.combat.resolve_attack_roll",
            ],
        },
    ]
    cases.extend(
        [
            {
                "caseId": "attack_roll.natural_1_critical_miss",
                "hookId": "hook.combat.resolve_attack_roll",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-attack-nat1",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "naturalD20": 1,
                        "attackBonus": 12,
                        "targetArmorClass": 10,
                        "advantageState": "normal",
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": None,
                },
                "expectedResponse": {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "accepted": True,
                    "produced": {
                        "attackRollTotal": 13,
                        "hit": False,
                        "criticalHit": False,
                        "criticalMiss": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "attack_roll_resolved", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["naturalD20 == 1 overrides total and always misses"],
            },
            {
                "caseId": "attack_roll.natural_20_critical_hit",
                "hookId": "hook.combat.resolve_attack_roll",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-attack-nat20",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "naturalD20": 20,
                        "attackBonus": 0,
                        "targetArmorClass": 30,
                        "advantageState": "normal",
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": None,
                },
                "expectedResponse": {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "accepted": True,
                    "produced": {
                        "attackRollTotal": 20,
                        "hit": True,
                        "criticalHit": True,
                        "criticalMiss": False,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "attack_roll_resolved", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["naturalD20 == 20 overrides total and always hits as criticalHit"],
            },
            {
                "caseId": "damage.immunity_zeroes",
                "hookId": "hook.damage.apply_resistance_vulnerability",
                "priority": "P0",
                "request": {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-damage-immune",
                    "actorCharacterId": "wizard-1",
                    "targetId": "shadow-1",
                    "input": {
                        "baseDamage": 14,
                        "damageType": "necrotic",
                        "targetImmunities": ["necrotic"],
                        "targetResistances": [],
                        "targetVulnerabilities": [],
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "shadow-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                    },
                    "sourceTraceId": "trace-demo-damage-immune",
                },
                "expectedResponse": {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "accepted": True,
                    "produced": {
                        "finalDamage": 0,
                        "appliedDamageModifiers": ["immunity:necrotic"],
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "damage_modifiers_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["targetImmunities containing damageType makes finalDamage 0"],
            },
            {
                "caseId": "damage.vulnerability_doubles",
                "hookId": "hook.damage.apply_resistance_vulnerability",
                "priority": "P0",
                "request": {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-damage-vulnerable",
                    "actorCharacterId": "ranger-1",
                    "targetId": "skeleton-1",
                    "input": {
                        "baseDamage": 8,
                        "damageType": "bludgeoning",
                        "targetImmunities": [],
                        "targetResistances": [],
                        "targetVulnerabilities": ["bludgeoning"],
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "skeleton-1",
                        "attackKind": "weapon_attack",
                    },
                    "sourceTraceId": None,
                },
                "expectedResponse": {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "accepted": True,
                    "produced": {
                        "finalDamage": 16,
                        "appliedDamageModifiers": ["vulnerability:bludgeoning"],
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "damage_modifiers_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["targetVulnerabilities containing damageType doubles finalDamage once"],
            },
            {
                "caseId": "prone.far_attacker_disadvantage",
                "hookId": "hook.condition.apply_prone_modifiers",
                "priority": "P0",
                "request": {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-prone-far",
                    "actorCharacterId": "fighter-1",
                    "targetId": "archer-1",
                    "input": {
                        "condition.prone": True,
                        "attackerDistanceFt": 30,
                        "remainingMovementFt": 30,
                        "baseSpeedFt": 30,
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "archer-1",
                        "targetId": "fighter-1",
                        "attackKind": "weapon_attack",
                    },
                    "sourceTraceId": None,
                },
                "expectedResponse": {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "accepted": True,
                    "produced": {
                        "movementCostFt": 15,
                        "selfAttackDisadvantage": True,
                        "incomingAttackAdvantageState": "disadvantage",
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "condition_modifiers_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["incoming attack farther than 5 feet has disadvantage against prone target"],
            },
            {
                "caseId": "prone.not_enough_movement_to_stand",
                "hookId": "hook.condition.apply_prone_modifiers",
                "priority": "P0",
                "request": {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-prone-no-move",
                    "actorCharacterId": "fighter-1",
                    "targetId": "fighter-1",
                    "input": {
                        "condition.prone": True,
                        "attackerDistanceFt": 0,
                        "remainingMovementFt": 10,
                        "baseSpeedFt": 30,
                    },
                    "sourceAction": {
                        "type": "move",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "approach": "일어난다.",
                    },
                    "sourceTraceId": "trace-demo-prone-no-move",
                },
                "expectedResponse": {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "accepted": False,
                    "produced": {
                        "movementCostFt": 15,
                        "selfAttackDisadvantage": True,
                        "incomingAttackAdvantageState": "advantage",
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "condition_modifier_rejected", "public": True}],
                    "rejectedReason": "not_enough_movement_to_stand",
                },
                "assertions": ["standing up is rejected when remainingMovementFt is less than half baseSpeedFt"],
            },
            {
                "caseId": "chill_touch.range_exceeded",
                "hookId": "hook.spell.cast_chill_touch",
                "priority": "P0",
                "request": {
                    "hookId": "hook.spell.cast_chill_touch",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-spell-range",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "spell.chill_touch": True,
                        "casterKnownCantrips": ["spell.chill_touch"],
                        "actionAvailable": True,
                        "targetDistanceFt": 125,
                        "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                        "spellAttackRollResult": None,
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-spell-range",
                },
                "expectedResponse": {
                    "hookId": "hook.spell.cast_chill_touch",
                    "accepted": False,
                    "produced": {
                        "validatedSpellCast": False,
                        "damagePacket.necrotic": None,
                        "healingBlockedUntil": None,
                        "undeadAttackDisadvantage": False,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "spell_cast_rejected", "public": True}],
                    "rejectedReason": "target_out_of_range",
                },
                "assertions": ["targetDistanceFt greater than 120 rejects spell cast before attack roll"],
            },
            {
                "caseId": "chill_touch.somatic_component_missing",
                "hookId": "hook.spell.cast_chill_touch",
                "priority": "P0",
                "request": {
                    "hookId": "hook.spell.cast_chill_touch",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-spell-components",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "spell.chill_touch": True,
                        "casterKnownCantrips": ["spell.chill_touch"],
                        "actionAvailable": True,
                        "targetDistanceFt": 90,
                        "componentAvailability": {"verbal": True, "somatic": False, "material": None},
                        "spellAttackRollResult": None,
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-spell-components",
                },
                "expectedResponse": {
                    "hookId": "hook.spell.cast_chill_touch",
                    "accepted": False,
                    "produced": {
                        "validatedSpellCast": False,
                        "damagePacket.necrotic": None,
                        "healingBlockedUntil": None,
                        "undeadAttackDisadvantage": False,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "spell_cast_rejected", "public": True}],
                    "rejectedReason": "missing_somatic_component",
                },
                "assertions": ["somatic component must be available before resolving spell attack roll"],
            },
        ]
    )
    cases.extend(
        [
            {
                "caseId": "fire_bolt.valid_hit",
                "hookId": "hook.spell.cast_fire_bolt",
                "priority": "P0",
                "request": {
                    "hookId": "hook.spell.cast_fire_bolt",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-fire-bolt",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "spell.fire_bolt": True,
                        "casterKnownCantrips": ["spell.fire_bolt"],
                        "actionAvailable": True,
                        "targetDistanceFt": 90,
                        "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                        "spellAttackRollResult": {
                            "attackRollTotal": 17,
                            "hit": True,
                            "criticalHit": False,
                            "criticalMiss": False,
                        },
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.fire_bolt",
                        "attackKind": "ranged_spell_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-fire-bolt",
                },
                "expectedResponse": {
                    "hookId": "hook.spell.cast_fire_bolt",
                    "accepted": True,
                    "produced": {
                        "validatedSpellCast": True,
                        "damagePacket.fire": {"dice": "1d10", "scalesByCharacterLevel": True},
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "spell_cast_validated", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["fire bolt uses a ranged spell attack and deals fire damage only on hit"],
            },
            {
                "caseId": "magic_missile.valid_auto_hit",
                "hookId": "hook.spell.cast_magic_missile",
                "priority": "P0",
                "request": {
                    "hookId": "hook.spell.cast_magic_missile",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-magic-missile",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "spell.magic_missile": True,
                        "casterPreparedSpells": ["spell.magic_missile"],
                        "actionAvailable": True,
                        "spellSlotAvailable": {"level": 1, "remaining": 1},
                        "targetIds": ["goblin-1"],
                        "dartAllocation": {"goblin-1": 3},
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.magic_missile",
                        "requiresRoll": False,
                    },
                    "sourceTraceId": "trace-demo-magic-missile",
                },
                "expectedResponse": {
                    "hookId": "hook.spell.cast_magic_missile",
                    "accepted": True,
                    "produced": {
                        "validatedSpellCast": True,
                        "forceDamagePackets": [{"targetId": "goblin-1", "dice": "1d4+1", "count": 3}],
                        "spellSlotExpended": {"level": 1, "count": 1},
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "spell_cast_validated", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["magic missile does not require an attack roll and expends a spell slot"],
            },
            {
                "caseId": "cure_wounds.valid_heal",
                "hookId": "hook.spell.cast_cure_wounds",
                "priority": "P0",
                "request": {
                    "hookId": "hook.spell.cast_cure_wounds",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-cure-wounds",
                    "actorCharacterId": "ranger-1",
                    "targetId": "fighter-1",
                    "input": {
                        "spell.cure_wounds": True,
                        "casterPreparedSpells": ["spell.cure_wounds"],
                        "actionAvailable": True,
                        "spellSlotAvailable": {"level": 1, "remaining": 1},
                        "targetTouchReach": True,
                        "healingRoll": {"formula": "1d8+2", "total": 7},
                        "currentHitPoints": 3,
                        "maxHitPoints": 12,
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "ranger-1",
                        "targetId": "fighter-1",
                        "spellId": "spell.cure_wounds",
                        "requiresRoll": False,
                    },
                    "sourceTraceId": "trace-demo-cure-wounds",
                },
                "expectedResponse": {
                    "hookId": "hook.spell.cast_cure_wounds",
                    "accepted": True,
                    "produced": {
                        "validatedSpellCast": True,
                        "hitPointsRestored": 7,
                        "newHitPoints": 10,
                        "spellSlotExpended": {"level": 1, "count": 1},
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "healing_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["cure wounds cannot heal above maxHitPoints and expends a spell slot"],
            },
            {
                "caseId": "potion_of_healing.valid_use",
                "hookId": "hook.item.use_potion_of_healing",
                "priority": "P0",
                "request": {
                    "hookId": "hook.item.use_potion_of_healing",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-potion",
                    "actorCharacterId": "rogue-1",
                    "targetId": "rogue-1",
                    "input": {
                        "magic_item.potion_of_healing": True,
                        "actionAvailable": True,
                        "targetReach": True,
                        "healingRoll.2d4": {"formula": "2d4+2", "total": 8},
                        "currentHitPoints": 2,
                        "maxHitPoints": 9,
                        "inventoryQuantity": 1,
                    },
                    "sourceAction": {
                        "type": "use_item",
                        "actorCharacterId": "rogue-1",
                        "targetId": "rogue-1",
                        "itemId": "magic_item.potion_of_healing",
                    },
                    "sourceTraceId": "trace-demo-potion",
                },
                "expectedResponse": {
                    "hookId": "hook.item.use_potion_of_healing",
                    "accepted": True,
                    "produced": {
                        "hitPointsRestored": 7,
                        "newHitPoints": 9,
                        "itemConsumed": True,
                        "actionSpent": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "item_healing_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["potion healing is capped by maxHitPoints and consumes exactly one potion"],
            },
            {
                "caseId": "magic_item_bonus.weapon_plus_one",
                "hookId": "hook.item.apply_flat_magic_bonus",
                "priority": "P0",
                "request": {
                    "hookId": "hook.item.apply_flat_magic_bonus",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-magic-bonus",
                    "actorCharacterId": "fighter-1",
                    "targetId": "fighter-1",
                    "input": {
                        "equippedMagicItemIds": ["magic_item.weapon_1_2_or_3"],
                        "baseAttackBonus": 5,
                        "baseDamageBonus": 3,
                        "baseArmorClass": 16,
                        "shieldEquipped": False,
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                    },
                    "sourceTraceId": None,
                },
                "expectedResponse": {
                    "hookId": "hook.item.apply_flat_magic_bonus",
                    "accepted": True,
                    "produced": {
                        "attackBonusDelta": 1,
                        "damageBonusDelta": 1,
                        "armorClassDelta": 0,
                        "appliedMagicItemBonuses": ["weapon:+1"],
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "magic_item_bonus_applied", "public": False}],
                    "rejectedReason": None,
                },
                "assertions": ["MVP applies only the +1 variant from the +1/+2/+3 catalog row"],
            },
            {
                "caseId": "ranger.archery.longbow_attack_bonus",
                "hookId": "hook.class.ranger.fighting_style_archery",
                "priority": "P0",
                "request": {
                    "hookId": "hook.class.ranger.fighting_style_archery",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-ranger-archery",
                    "actorCharacterId": "ranger-1",
                    "targetId": "goblin-1",
                    "input": {
                        "rangerLevel": 2,
                        "selectedFightingStyle": "Archery",
                        "attackKind": "weapon_attack",
                        "weaponProperties": ["ranged", "ammunition", "two-handed"],
                        "baseAttackBonus": 5,
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "weaponId": "equipment.longbow",
                    },
                    "sourceTraceId": "trace-demo-ranger-archery",
                },
                "expectedResponse": {
                    "hookId": "hook.class.ranger.fighting_style_archery",
                    "accepted": True,
                    "produced": {
                        "attackBonusDelta": 2,
                        "finalAttackBonus": 7,
                        "fightingStyleApplied": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "ranger_archery_bonus_applied", "public": False}],
                    "rejectedReason": None,
                },
                "assertions": ["Archery adds +2 only to ranged weapon attack rolls."],
            },
            {
                "caseId": "ranger.natural_explorer.survival_check_bonus",
                "hookId": "hook.class.ranger.natural_explorer_check",
                "priority": "P0",
                "request": {
                    "hookId": "hook.class.ranger.natural_explorer_check",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-ranger-natural-explorer",
                    "actorCharacterId": "ranger-1",
                    "targetId": "node_cave_entrance",
                    "input": {
                        "rangerLevel": 2,
                        "favoredTerrainActive": True,
                        "checkKind": "skill_check",
                        "abilityOrSkill": "survival",
                        "proficiencyApplied": True,
                        "baseCheckModifier": 5,
                    },
                    "sourceAction": {
                        "type": "skill_check",
                        "actorCharacterId": "ranger-1",
                        "targetId": "node_cave_entrance",
                        "skill": "survival",
                        "suggestedDifficulty": "medium",
                    },
                    "sourceTraceId": "trace-demo-ranger-natural-explorer",
                },
                "expectedResponse": {
                    "hookId": "hook.class.ranger.natural_explorer_check",
                    "accepted": True,
                    "produced": {
                        "checkModifierDelta": 2,
                        "finalCheckModifier": 7,
                        "naturalExplorerApplied": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "ranger_natural_explorer_bonus_applied", "public": False}],
                    "rejectedReason": None,
                },
                "assertions": ["Natural Explorer doubles proficiency for qualifying proficient Int/Wis checks in favored terrain."],
            },
            {
                "caseId": "fighter.second_wind.valid_heal",
                "hookId": "hook.class.fighter.second_wind",
                "priority": "P0",
                "request": {
                    "hookId": "hook.class.fighter.second_wind",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-second-wind",
                    "actorCharacterId": "fighter-1",
                    "targetId": "fighter-1",
                    "input": {
                        "fighterLevel": 2,
                        "bonusActionAvailable": True,
                        "secondWindAvailable": True,
                        "healingRoll.d10": {"formula": "1d10+2", "total": 7},
                        "currentHitPoints": 5,
                        "maxHitPoints": 12,
                    },
                    "sourceAction": {
                        "type": "use_class_feature",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "featureId": "class.fighter.feature.재기의_숨결",
                    },
                    "sourceTraceId": "trace-demo-second-wind",
                },
                "expectedResponse": {
                    "hookId": "hook.class.fighter.second_wind",
                    "accepted": True,
                    "produced": {
                        "hitPointsRestored": 7,
                        "newHitPoints": 12,
                        "secondWindExpended": True,
                        "bonusActionSpent": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "class_feature_healing_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["second wind uses a bonus action and heals 1d10 + fighterLevel"],
            },
            {
                "caseId": "initiative.goblin_group_order",
                "hookId": "hook.combat.resolve_initiative_order",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.resolve_initiative_order",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-initiative-goblins",
                    "actorCharacterId": "gm-encounter",
                    "targetId": "encounter.well_chamber",
                    "input": {
                        "naturalD20": 14,
                        "dexterityModifier": 2,
                        "initiativeBonus": 0,
                        "participantGroupId": "monster.goblin",
                        "participantIds": ["goblin-1", "goblin-2", "goblin-3"],
                        "tiebreakPolicy": "gm_decides_monster_ties",
                    },
                    "sourceAction": {
                        "type": "start_combat",
                        "actorCharacterId": "gm-encounter",
                        "targetId": "encounter.well_chamber",
                        "encounterId": "encounter.well_chamber",
                    },
                    "sourceTraceId": "trace-demo-initiative-goblins",
                },
                "expectedResponse": {
                    "hookId": "hook.combat.resolve_initiative_order",
                    "accepted": True,
                    "produced": {
                        "initiativeTotal": 16,
                        "groupedParticipants": ["goblin-1", "goblin-2", "goblin-3"],
                        "tiebreakRequired": False,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "initiative_order_resolved", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": [
                    "initiativeTotal is naturalD20 + dexterityModifier + initiativeBonus",
                    "same-species goblins may share one initiative entry in MVP encounter setup",
                    "final order is backend-owned even when the GM groups monsters",
                ],
            },
            {
                "caseId": "saving_throw.slippery_floor_fails",
                "hookId": "hook.check.resolve_saving_throw",
                "priority": "P0",
                "request": {
                    "hookId": "hook.check.resolve_saving_throw",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-slippery-floor-save",
                    "actorCharacterId": "fighter-1",
                    "targetId": "fighter-1",
                    "input": {
                        "naturalD20": 4,
                        "modifier": 2,
                        "difficultyClass": 10,
                        "advantageState": "normal",
                        "saveAbility": "dexterity",
                    },
                    "sourceAction": {
                        "type": "saving_throw",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "saveAbility": "dexterity",
                        "requiresRoll": True,
                        "reason": "미끄러운 수로 바닥에서 중심을 유지한다.",
                    },
                    "sourceTraceId": "trace-demo-slippery-floor-save",
                },
                "expectedResponse": {
                    "hookId": "hook.check.resolve_saving_throw",
                    "accepted": True,
                    "produced": {
                        "checkRollTotal": 6,
                        "success": False,
                        "criticalSuccess": False,
                        "criticalFailure": False,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "saving_throw_resolved", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": [
                    "ordinary saving throws use total >= difficultyClass rather than automatic natural 20 or natural 1 outcomes",
                    "the backend owns follow-up effects such as prone or damage after the save result is known",
                ],
            },
            {
                "caseId": "cover.half_cover_raises_ac",
                "hookId": "hook.combat.apply_cover_modifiers",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.apply_cover_modifiers",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-cover-crates",
                    "actorCharacterId": "ranger-1",
                    "targetId": "goblin-1",
                    "input": {
                        "coverLevel": "half",
                        "targetArmorClass": 15,
                        "baseDifficultyClass": 10,
                        "checkType": "attack_roll",
                        "directTargeting": True,
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-cover-crates",
                },
                "expectedResponse": {
                    "hookId": "hook.combat.apply_cover_modifiers",
                    "accepted": True,
                    "produced": {
                        "adjustedArmorClass": 17,
                        "adjustedDifficultyClass": 10,
                        "targetable": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "cover_modifiers_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": [
                    "half cover adds +2 to AC for attack rolls",
                    "direct targeting remains allowed while coverLevel is half",
                    "only the highest cover tier applies",
                ],
            },
            {
                "caseId": "terrain.black_water_costs_double_move",
                "hookId": "hook.combat.apply_difficult_terrain_cost",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.apply_difficult_terrain_cost",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-black-water-move",
                    "actorCharacterId": "fighter-1",
                    "targetId": "terrain.black_water_pool",
                    "input": {
                        "enteredDifficultTerrain": True,
                        "intendedDistanceFt": 10,
                        "remainingMovementFt": 20,
                        "baseCostPerFoot": 1,
                    },
                    "sourceAction": {
                        "type": "move",
                        "actorCharacterId": "fighter-1",
                        "targetId": "terrain.black_water_pool",
                        "approach": "검은 물웅덩이를 가로질러 전진한다.",
                    },
                    "sourceTraceId": "trace-demo-black-water-move",
                },
                "expectedResponse": {
                    "hookId": "hook.combat.apply_difficult_terrain_cost",
                    "accepted": True,
                    "produced": {
                        "movementCostFt": 20,
                        "movementAllowed": True,
                        "remainingMovementFtAfterMove": 0,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "movement_cost_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": [
                    "10 feet of difficult terrain costs 20 feet of movement",
                    "remainingMovementFtAfterMove cannot go below 0",
                    "movement pacing is backend-owned even when AI narrates the terrain",
                ],
            },
            {
                "caseId": "surprise.rat_lair_ambush",
                "hookId": "hook.combat.resolve_surprise",
                "priority": "P0",
                "request": {
                    "hookId": "hook.combat.resolve_surprise",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-rat-lair-surprise",
                    "actorCharacterId": "rogue-1",
                    "targetId": "encounter.rat_lair",
                    "input": {
                        "stealthTotals": {
                            "fighter-1": 12,
                            "rogue-1": 15,
                            "wizard-1": 14,
                        },
                        "passivePerceptionScores": {
                            "giant_rat-1": 10,
                            "giant_rat-2": 10,
                            "giant_rat-3": 10,
                            "giant_rat-4": 10,
                        },
                        "alreadyAlertedIds": [],
                    },
                    "sourceAction": {
                        "type": "start_combat",
                        "actorCharacterId": "rogue-1",
                        "targetId": "encounter.rat_lair",
                        "approach": "불을 낮추고 조용히 쥐 떼에게 접근한다.",
                    },
                    "sourceTraceId": "trace-demo-rat-lair-surprise",
                },
                "expectedResponse": {
                    "hookId": "hook.combat.resolve_surprise",
                    "accepted": True,
                    "produced": {
                        "surprisedTargetIds": ["giant_rat-1", "giant_rat-2", "giant_rat-3", "giant_rat-4"],
                        "awareTargetIds": [],
                        "surpriseDetected": True,
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "surprise_state_resolved", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": [
                    "creatures that fail to notice an opposing threat before combat starts become surprised",
                    "surprised creatures still enter initiative even though they lose their first turn actions and reactions",
                    "AI may describe the stealthy approach but cannot decide who noticed whom",
                ],
            },
            {
                "caseId": "rogue.sneak_attack.valid_damage",
                "hookId": "hook.class.rogue.sneak_attack",
                "priority": "P0",
                "request": {
                    "hookId": "hook.class.rogue.sneak_attack",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-sneak-attack",
                    "actorCharacterId": "rogue-1",
                    "targetId": "goblin-1",
                    "input": {
                        "rogueLevel": 2,
                        "attackKind": "weapon_attack",
                        "weaponProperties": ["finesse"],
                        "hasAdvantage": True,
                        "hasDisadvantage": False,
                        "targetEnemyWithin5Ft": False,
                        "sneakAttackAvailableThisTurn": True,
                        "baseDamage": {"amount": 6, "damageType": "piercing"},
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-sneak-attack",
                },
                "expectedResponse": {
                    "hookId": "hook.class.rogue.sneak_attack",
                    "accepted": True,
                    "produced": {
                        "sneakAttackDice": "1d6",
                        "sneakAttackDamage": {"rolledDamage": 4, "damageType": "piercing"},
                        "sneakAttackExpendedThisTurn": True,
                        "damagePacket": {"baseDamage": 6, "bonusDamage": 4, "damageType": "piercing"},
                    },
                    "statePatch": [],
                    "turnLogEvents": [{"type": "class_feature_damage_applied", "public": True}],
                    "rejectedReason": None,
                },
                "assertions": ["sneak attack applies once per turn only when the weapon and advantage conditions pass"],
            },
        ]
    )
    return [
        BackendEngineContractCase(
            caseId=case["caseId"],
            hookId=case["hookId"],
            priority=case["priority"],
            engineFunction=hooks[case["hookId"]].engineFunction,
            request=case["request"],
            expectedResponse=case["expectedResponse"],
            assertions=case["assertions"],
        )
        for case in cases
    ]


def build_interpreter_backend_handoff_cases(
    rule_hook_fixtures: list[RuleHookFixture] | None = None,
) -> list[InterpreterBackendHandoffCase]:
    hooks = {hook.id: hook for hook in (rule_hook_fixtures or build_rule_hook_fixtures())}
    cases = [
        {
            "caseId": "handoff.chill_touch_spell_attack",
            "rawText": "싸늘한 손길을 적 고블린에게 시전한다.",
            "interpreterOutput": {
                "action": {
                    "type": "cast_spell",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "spellId": "spell.chill_touch",
                    "attackKind": "ranged_spell_attack",
                    "approach": "싸늘한 손길을 적 고블린에게 시전한다.",
                    "confidence": 0.96,
                    "requiresRoll": True,
                },
                "needsClarification": False,
                "mentionedSpellId": "spell.chill_touch",
                "mentionedItemId": None,
                "mentionedConditionIds": [],
                "requiredRuleCheckIds": [
                    "rule.spellcasting.casting_time.action",
                    "rule.spellcasting.range",
                    "rule.spellcasting.spell_attack",
                    "rule.combat.attack_roll",
                ],
                "safetyNotes": ["명중, 피해, 치유 차단은 백엔드 엔진이 확정한다."],
            },
            "backendState": {
                "sessionId": "session-demo-1",
                "turnId": "turn-spell-handoff",
                "actorCharacterId": "wizard-1",
                "targetId": "goblin-1",
                "actor": {
                    "knownCantrips": ["spell.chill_touch"],
                    "actionAvailable": True,
                    "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                },
                "target": {"distanceFt": 90, "armorClass": 13, "typeTags": ["humanoid"]},
                "rollPlan": {"naturalD20": 15, "attackBonus": 5, "advantageState": "normal"},
            },
            "expectedHookIds": [
                "hook.combat.resolve_attack_roll",
                "hook.spell.cast_chill_touch",
                "hook.damage.apply_resistance_vulnerability",
            ],
            "hookRequests": [
                {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-spell-handoff",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "naturalD20": 15,
                        "attackBonus": 5,
                        "targetArmorClass": 13,
                        "advantageState": "normal",
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-interpreter-chill-touch",
                },
                {
                    "hookId": "hook.spell.cast_chill_touch",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-spell-handoff",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "spell.chill_touch": True,
                        "casterKnownCantrips": ["spell.chill_touch"],
                        "actionAvailable": True,
                        "targetDistanceFt": 90,
                        "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                        "spellAttackRollResult": {
                            "attackRollTotal": 20,
                            "hit": True,
                            "criticalHit": False,
                            "criticalMiss": False,
                        },
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-interpreter-chill-touch",
                },
                {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-spell-handoff",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "input": {
                        "baseDamage": 4,
                        "damageType": "necrotic",
                        "targetImmunities": [],
                        "targetResistances": [],
                        "targetVulnerabilities": [],
                    },
                    "sourceAction": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.chill_touch",
                        "attackKind": "ranged_spell_attack",
                    },
                    "sourceTraceId": "trace-demo-interpreter-chill-touch",
                },
            ],
            "notes": [
                "Interpreter identifies intent and stable IDs only.",
                "Backend computes attack roll, spell validity, and damage in deterministic hooks.",
            ],
        },
        {
            "caseId": "handoff.weapon_attack_with_damage",
            "rawText": "파이터가 롱소드로 고블린을 공격한다.",
            "interpreterOutput": {
                "action": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "attackKind": "weapon_attack",
                    "approach": "롱소드로 고블린을 공격한다.",
                    "confidence": 0.92,
                    "requiresRoll": True,
                },
                "needsClarification": False,
                "mentionedSpellId": None,
                "mentionedItemId": None,
                "mentionedConditionIds": [],
                "requiredRuleCheckIds": ["rule.combat.attack_roll"],
                "safetyNotes": ["명중과 피해는 백엔드 엔진이 확정한다."],
            },
            "backendState": {
                "sessionId": "session-demo-1",
                "turnId": "turn-attack-handoff",
                "actorCharacterId": "fighter-1",
                "targetId": "goblin-1",
                "actor": {"equippedWeaponId": "equipment.longsword", "attackBonus": 5},
                "target": {"armorClass": 15, "damageResistances": [], "damageVulnerabilities": []},
                "rollPlan": {"naturalD20": 17, "advantageState": "normal"},
            },
            "expectedHookIds": [
                "hook.combat.resolve_attack_roll",
                "hook.damage.apply_resistance_vulnerability",
            ],
            "hookRequests": [
                {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-attack-handoff",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "naturalD20": 17,
                        "attackBonus": 5,
                        "targetArmorClass": 15,
                        "advantageState": "normal",
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-interpreter-weapon-attack",
                },
                {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-attack-handoff",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "baseDamage": 9,
                        "damageType": "slashing",
                        "targetImmunities": [],
                        "targetResistances": [],
                        "targetVulnerabilities": [],
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                    },
                    "sourceTraceId": "trace-demo-interpreter-weapon-attack",
                },
            ],
            "notes": ["Damage hook runs only after backend confirms a hit and rolls weapon damage."],
        },
        {
            "caseId": "handoff.prone_stand_then_attack",
            "rawText": "넘어짐 상태에서 일어나서 적을 공격하려고 한다.",
            "interpreterOutput": {
                "action": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "attackKind": "weapon_attack",
                    "approach": "넘어짐 상태에서 일어나 적을 공격하려고 한다.",
                    "confidence": 0.88,
                    "requiresRoll": True,
                },
                "needsClarification": False,
                "mentionedSpellId": None,
                "mentionedItemId": None,
                "mentionedConditionIds": ["condition.prone"],
                "requiredRuleCheckIds": ["rule.combat.attack_roll"],
                "safetyNotes": ["넘어짐 보정과 명중 여부는 백엔드 엔진이 확정한다."],
            },
            "backendState": {
                "sessionId": "session-demo-1",
                "turnId": "turn-prone-handoff",
                "actorCharacterId": "fighter-1",
                "targetId": "goblin-1",
                "actor": {"conditions": ["condition.prone"], "remainingMovementFt": 30, "baseSpeedFt": 30},
                "target": {"distanceFt": 5, "armorClass": 15},
                "rollPlan": {"naturalD20": 12, "attackBonus": 5, "advantageState": "normal"},
            },
            "expectedHookIds": [
                "hook.condition.apply_prone_modifiers",
                "hook.combat.resolve_attack_roll",
            ],
            "hookRequests": [
                {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-prone-handoff",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "condition.prone": True,
                        "attackerDistanceFt": 5,
                        "remainingMovementFt": 30,
                        "baseSpeedFt": 30,
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-interpreter-prone",
                },
                {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "sessionId": "session-demo-1",
                    "turnId": "turn-prone-handoff",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "input": {
                        "naturalD20": 12,
                        "attackBonus": 5,
                        "targetArmorClass": 15,
                        "advantageState": "disadvantage",
                    },
                    "sourceAction": {
                        "type": "attack",
                        "actorCharacterId": "fighter-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "requiresRoll": True,
                    },
                    "sourceTraceId": "trace-demo-interpreter-prone",
                },
            ],
            "notes": ["Prone hook output can alter the attack roll advantageState before attack resolution."],
        },
    ]
    cases.extend(
        [
            {
                "caseId": "handoff.fire_bolt_spell_attack",
                "rawText": "위저드가 화염 화살로 고블린을 공격한다.",
                "interpreterOutput": {
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.fire_bolt",
                        "attackKind": "ranged_spell_attack",
                        "approach": "화염 화살로 고블린을 공격한다.",
                        "confidence": 0.94,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": "spell.fire_bolt",
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": [
                        "rule.spellcasting.casting_time.action",
                        "rule.spellcasting.range",
                        "rule.spellcasting.spell_attack",
                        "rule.combat.attack_roll",
                    ],
                    "safetyNotes": ["명중과 화염 피해는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-fire-bolt-handoff",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "actor": {
                        "knownCantrips": ["spell.fire_bolt"],
                        "actionAvailable": True,
                        "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                    },
                    "target": {"distanceFt": 80, "armorClass": 13},
                    "rollPlan": {"naturalD20": 14, "attackBonus": 5, "advantageState": "normal"},
                },
                "expectedHookIds": [
                    "hook.combat.resolve_attack_roll",
                    "hook.spell.cast_fire_bolt",
                    "hook.damage.apply_resistance_vulnerability",
                ],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-fire-bolt-handoff",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "input": {
                            "naturalD20": 14,
                            "attackBonus": 5,
                            "targetArmorClass": 13,
                            "advantageState": "normal",
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "wizard-1",
                            "targetId": "goblin-1",
                            "spellId": "spell.fire_bolt",
                            "attackKind": "ranged_spell_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-interpreter-fire-bolt",
                    },
                    {
                        "hookId": "hook.spell.cast_fire_bolt",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-fire-bolt-handoff",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "input": {
                            "spell.fire_bolt": True,
                            "casterKnownCantrips": ["spell.fire_bolt"],
                            "actionAvailable": True,
                            "targetDistanceFt": 80,
                            "componentAvailability": {"verbal": True, "somatic": True, "material": None},
                            "spellAttackRollResult": {
                                "attackRollTotal": 19,
                                "hit": True,
                                "criticalHit": False,
                                "criticalMiss": False,
                            },
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "wizard-1",
                            "targetId": "goblin-1",
                            "spellId": "spell.fire_bolt",
                            "attackKind": "ranged_spell_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-interpreter-fire-bolt",
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-fire-bolt-handoff",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "input": {
                            "baseDamage": 7,
                            "damageType": "fire",
                            "targetImmunities": [],
                            "targetResistances": [],
                            "targetVulnerabilities": [],
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "wizard-1",
                            "targetId": "goblin-1",
                            "spellId": "spell.fire_bolt",
                            "attackKind": "ranged_spell_attack",
                        },
                        "sourceTraceId": "trace-demo-interpreter-fire-bolt",
                    },
                ],
                "notes": ["Fire Bolt is the generic MVP attack-cantrip handoff example."],
            },
            {
                "caseId": "handoff.fighter_second_wind",
                "rawText": "파이터가 재기의 숨결로 버틴다.",
                "interpreterOutput": {
                    "action": {
                        "type": "use_class_feature",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "featureId": "class.fighter.feature.재기의_숨결",
                        "approach": "재기의 숨결을 사용한다.",
                        "confidence": 0.93,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.damage.healing"],
                    "safetyNotes": ["회복 굴림과 HP 변경은 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-second-wind-handoff",
                    "actorCharacterId": "fighter-1",
                    "targetId": "fighter-1",
                    "actor": {"fighterLevel": 1, "bonusActionAvailable": True, "secondWindAvailable": True},
                    "rollPlan": {"formula": "1d10+1"},
                    "hitPoints": {"current": 5, "max": 12},
                },
                "expectedHookIds": ["hook.class.fighter.second_wind"],
                "hookRequests": [
                    {
                        "hookId": "hook.class.fighter.second_wind",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-second-wind-handoff",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "input": {
                            "fighterLevel": 1,
                            "bonusActionAvailable": True,
                            "secondWindAvailable": True,
                            "healingRoll.d10": {"formula": "1d10+1", "total": 6},
                            "currentHitPoints": 5,
                            "maxHitPoints": 12,
                        },
                        "sourceAction": {
                            "type": "use_class_feature",
                            "actorCharacterId": "fighter-1",
                            "targetId": "fighter-1",
                            "featureId": "class.fighter.feature.재기의_숨결",
                        },
                        "sourceTraceId": "trace-demo-interpreter-second-wind",
                    }
                ],
                "notes": ["Class feature handoff keeps healing and resource spend backend-owned."],
            },
            {
                "caseId": "handoff.rogue_sneak_attack",
                "rawText": "로그가 레이피어로 빈틈을 노려 암습한다.",
                "interpreterOutput": {
                    "action": {
                        "type": "attack",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "approach": "레이피어로 암습을 노린다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.combat.attack_roll", "rule.damage.damage_roll"],
                    "safetyNotes": ["명중, 암습 조건, 추가 피해는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-sneak-attack-handoff",
                    "actorCharacterId": "rogue-1",
                    "targetId": "goblin-1",
                    "actor": {
                        "rogueLevel": 1,
                        "equippedWeaponId": "equipment.레이피어",
                        "weaponProperties": ["finesse"],
                        "sneakAttackAvailableThisTurn": True,
                    },
                    "target": {"armorClass": 13},
                    "rollPlan": {"naturalD20": 16, "attackBonus": 5, "advantageState": "advantage"},
                },
                "expectedHookIds": [
                    "hook.combat.resolve_attack_roll",
                    "hook.class.rogue.sneak_attack",
                    "hook.damage.apply_resistance_vulnerability",
                ],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-sneak-attack-handoff",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "input": {
                            "naturalD20": 16,
                            "attackBonus": 5,
                            "targetArmorClass": 13,
                            "advantageState": "advantage",
                        },
                        "sourceAction": {
                            "type": "attack",
                            "actorCharacterId": "rogue-1",
                            "targetId": "goblin-1",
                            "attackKind": "weapon_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-interpreter-sneak-attack",
                    },
                    {
                        "hookId": "hook.class.rogue.sneak_attack",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-sneak-attack-handoff",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "input": {
                            "rogueLevel": 1,
                            "attackKind": "weapon_attack",
                            "weaponProperties": ["finesse"],
                            "hasAdvantage": True,
                            "hasDisadvantage": False,
                            "targetEnemyWithin5Ft": False,
                            "sneakAttackAvailableThisTurn": True,
                            "baseDamage": {"amount": 6, "damageType": "piercing"},
                        },
                        "sourceAction": {
                            "type": "attack",
                            "actorCharacterId": "rogue-1",
                            "targetId": "goblin-1",
                            "attackKind": "weapon_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-interpreter-sneak-attack",
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-sneak-attack-handoff",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "input": {
                            "baseDamage": 10,
                            "damageType": "piercing",
                            "targetImmunities": [],
                            "targetResistances": [],
                            "targetVulnerabilities": [],
                        },
                        "sourceAction": {
                            "type": "attack",
                            "actorCharacterId": "rogue-1",
                            "targetId": "goblin-1",
                            "attackKind": "weapon_attack",
                        },
                        "sourceTraceId": "trace-demo-interpreter-sneak-attack",
                    },
                ],
                "notes": ["Sneak attack is backend-owned even when the Interpreter recognizes the intent."],
            },
            {
                "caseId": "handoff.potion_of_healing",
                "rawText": "로그가 치유 물약을 마신다.",
                "interpreterOutput": {
                    "action": {
                        "type": "use_item",
                        "actorCharacterId": "rogue-1",
                        "targetId": "rogue-1",
                        "itemId": "magic_item.potion_of_healing",
                        "approach": "치유 물약을 사용한다.",
                        "confidence": 0.95,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": "magic_item.potion_of_healing",
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.equipment.item_use", "rule.damage.healing"],
                    "safetyNotes": ["회복량, 소모, HP 변경은 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-potion-handoff",
                    "actorCharacterId": "rogue-1",
                    "targetId": "rogue-1",
                    "actor": {"actionAvailable": True, "inventory": {"magic_item.potion_of_healing": 1}},
                    "rollPlan": {"formula": "2d4+2"},
                    "hitPoints": {"current": 2, "max": 9},
                },
                "expectedHookIds": ["hook.item.use_potion_of_healing"],
                "hookRequests": [
                    {
                        "hookId": "hook.item.use_potion_of_healing",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-potion-handoff",
                        "actorCharacterId": "rogue-1",
                        "targetId": "rogue-1",
                        "input": {
                            "magic_item.potion_of_healing": True,
                            "actionAvailable": True,
                            "targetReach": True,
                            "healingRoll.2d4": {"formula": "2d4+2", "total": 8},
                            "currentHitPoints": 2,
                            "maxHitPoints": 9,
                            "inventoryQuantity": 1,
                        },
                        "sourceAction": {
                            "type": "use_item",
                            "actorCharacterId": "rogue-1",
                            "targetId": "rogue-1",
                            "itemId": "magic_item.potion_of_healing",
                        },
                        "sourceTraceId": "trace-demo-interpreter-potion",
                    }
                ],
                "notes": ["Consumable item use is represented as a deterministic backend hook request."],
            },
            {
                "caseId": "handoff.investigate_tracks_skill_check",
                "rawText": "발자국을 조사해서 고블린이 어디로 갔는지 알아본다.",
                "interpreterOutput": {
                    "action": {
                        "type": "skill_check",
                        "actorCharacterId": "rogue-1",
                        "targetId": "node_cave_entrance",
                        "skill": "investigation",
                        "approach": "동굴 입구의 진흙 발자국을 조사한다.",
                        "confidence": 0.91,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.checks.능력_판정", "rule.checks.기술"],
                    "safetyNotes": ["단서 공개와 다음 장면 이동은 백엔드/GM 흐름이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-investigate-tracks",
                    "actorCharacterId": "rogue-1",
                    "targetId": "node_cave_entrance",
                    "scenarioNode": {"nodeId": "node_cave_entrance", "checkId": "investigate_tracks", "dc": 10},
                    "rollPlan": {"naturalD20": 13, "modifier": 4, "advantageState": "normal"},
                },
                "expectedHookIds": ["hook.check.resolve_ability_or_skill_check"],
                "hookRequests": [
                    {
                        "hookId": "hook.check.resolve_ability_or_skill_check",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-investigate-tracks",
                        "actorCharacterId": "rogue-1",
                        "targetId": "node_cave_entrance",
                        "input": {
                            "naturalD20": 13,
                            "modifier": 4,
                            "difficultyClass": 10,
                            "advantageState": "normal",
                        },
                        "sourceAction": {
                            "type": "skill_check",
                            "actorCharacterId": "rogue-1",
                            "targetId": "node_cave_entrance",
                            "skill": "investigation",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-interpreter-investigate-tracks",
                    }
                ],
                "notes": ["The first exploration beat is a natural-language skill check against scenario-authored DC."],
            },
            {
                "caseId": "handoff.magic_missile_auto_hit",
                "rawText": "위저드가 마법 화살 세 발을 고블린에게 날린다.",
                "interpreterOutput": {
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.magic_missile",
                        "approach": "마법 화살 세 발을 모두 고블린에게 날린다.",
                        "confidence": 0.96,
                        "requiresRoll": False,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": "spell.magic_missile",
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.spellcasting.spell_slot", "rule.damage.damage_roll"],
                    "safetyNotes": ["자동 명중, 피해량, 슬롯 소비는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-magic-missile-handoff",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "actor": {"preparedSpells": ["spell.magic_missile"], "firstLevelSlotsRemaining": 1},
                    "target": {"currentHitPoints": 7, "maxHitPoints": 7},
                    "dartAllocation": {"goblin-1": 3},
                },
                "expectedHookIds": [
                    "hook.spell.cast_magic_missile",
                    "hook.damage.apply_resistance_vulnerability",
                ],
                "hookRequests": [
                    {
                        "hookId": "hook.spell.cast_magic_missile",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-magic-missile-handoff",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "input": {
                            "spell.magic_missile": True,
                            "casterPreparedSpells": ["spell.magic_missile"],
                            "actionAvailable": True,
                            "spellSlotAvailable": {"level": 1, "remaining": 1},
                            "targetIds": ["goblin-1"],
                            "dartAllocation": {"goblin-1": 3},
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "wizard-1",
                            "targetId": "goblin-1",
                            "spellId": "spell.magic_missile",
                            "requiresRoll": False,
                        },
                        "sourceTraceId": "trace-demo-interpreter-magic-missile",
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-magic-missile-handoff",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "input": {
                            "baseDamage": 10,
                            "damageType": "force",
                            "targetImmunities": [],
                            "targetResistances": [],
                            "targetVulnerabilities": [],
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "wizard-1",
                            "targetId": "goblin-1",
                            "spellId": "spell.magic_missile",
                            "requiresRoll": False,
                        },
                        "sourceTraceId": "trace-demo-interpreter-magic-missile",
                    },
                ],
                "notes": ["Magic Missile gives the demo a reliable natural-language combat finisher."],
            },
            {
                "caseId": "handoff.ranger_cure_wounds",
                "rawText": "레인저가 파이터에게 상처 치료를 시전한다.",
                "interpreterOutput": {
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "ranger-1",
                        "targetId": "fighter-1",
                        "spellId": "spell.cure_wounds",
                        "approach": "파이터에게 손을 대고 상처 치료를 시전한다.",
                        "confidence": 0.94,
                        "requiresRoll": False,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": "spell.cure_wounds",
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.spellcasting.spell_slot", "rule.damage.healing"],
                    "safetyNotes": ["회복량, 최대 HP 상한, 슬롯 소비는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-cure-wounds-handoff",
                    "actorCharacterId": "ranger-1",
                    "targetId": "fighter-1",
                    "actor": {"preparedSpells": ["spell.cure_wounds"], "firstLevelSlotsRemaining": 1},
                    "target": {"currentHitPoints": 3, "maxHitPoints": 14, "touchReach": True},
                    "rollPlan": {"formula": "1d8+2"},
                },
                "expectedHookIds": ["hook.spell.cast_cure_wounds"],
                "hookRequests": [
                    {
                        "hookId": "hook.spell.cast_cure_wounds",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-cure-wounds-handoff",
                        "actorCharacterId": "ranger-1",
                        "targetId": "fighter-1",
                        "input": {
                            "spell.cure_wounds": True,
                            "casterPreparedSpells": ["spell.cure_wounds"],
                            "actionAvailable": True,
                            "spellSlotAvailable": {"level": 1, "remaining": 1},
                            "targetTouchReach": True,
                            "healingRoll": {"formula": "1d8+2", "total": 7},
                            "currentHitPoints": 3,
                            "maxHitPoints": 14,
                        },
                        "sourceAction": {
                            "type": "cast_spell",
                            "actorCharacterId": "ranger-1",
                            "targetId": "fighter-1",
                            "spellId": "spell.cure_wounds",
                            "requiresRoll": False,
                        },
                        "sourceTraceId": "trace-demo-interpreter-cure-wounds",
                    }
                ],
                "notes": ["Ranger healing keeps the four-class MVP useful outside pure attacks."],
            },
            {
                "caseId": "handoff.well_chamber_initiative",
                "rawText": "우물 아래 방에 들어서자 고블린들과 전투가 시작된다.",
                "interpreterOutput": {
                    "action": {
                        "type": "start_combat",
                        "actorCharacterId": "gm-encounter",
                        "targetId": "encounter.well_chamber",
                        "approach": "최종 방에서 고블린들과 조우해 전투를 연다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.combat.우선권", "rule.combat.initiative"],
                    "safetyNotes": ["우선권 합계와 최종 행동 순서는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-well-chamber-initiative",
                    "encounterId": "encounter.well_chamber",
                    "participants": ["goblin-1", "goblin-2", "goblin-3"],
                    "rollPlan": {"naturalD20": 14, "dexterityModifier": 2, "initiativeBonus": 0},
                },
                "expectedHookIds": ["hook.combat.resolve_initiative_order"],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.resolve_initiative_order",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-well-chamber-initiative",
                        "actorCharacterId": "gm-encounter",
                        "targetId": "encounter.well_chamber",
                        "input": {
                            "naturalD20": 14,
                            "dexterityModifier": 2,
                            "initiativeBonus": 0,
                            "participantGroupId": "monster.goblin",
                            "participantIds": ["goblin-1", "goblin-2", "goblin-3"],
                            "tiebreakPolicy": "gm_decides_monster_ties",
                        },
                        "sourceAction": {
                            "type": "start_combat",
                            "actorCharacterId": "gm-encounter",
                            "targetId": "encounter.well_chamber",
                            "encounterId": "encounter.well_chamber",
                        },
                        "sourceTraceId": "trace-demo-handoff-well-chamber-initiative",
                    }
                ],
                "notes": ["The final goblin fight needs grouped monster initiative before any narration or token automation starts."],
            },
            {
                "caseId": "handoff.rat_lair_surprise_approach",
                "rawText": "불을 낮추고 조용히 접근해 쥐들을 기습한다.",
                "interpreterOutput": {
                    "action": {
                        "type": "start_combat",
                        "actorCharacterId": "rogue-1",
                        "targetId": "encounter.rat_lair",
                        "approach": "광원을 낮추고 조용히 쥐 떼에게 접근한다.",
                        "confidence": 0.89,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.checks.수동_판정", "rule.combat.기습", "rule.combat.surprise"],
                    "safetyNotes": ["누가 기습당했는지는 백엔드 엔진이 은신 결과와 수동 지각으로 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-rat-lair-surprise",
                    "encounterId": "encounter.rat_lair",
                    "partyStealthTotals": {"fighter-1": 12, "rogue-1": 15, "wizard-1": 14},
                    "hostilePassivePerception": {
                        "giant_rat-1": 10,
                        "giant_rat-2": 10,
                        "giant_rat-3": 10,
                        "giant_rat-4": 10,
                    },
                },
                "expectedHookIds": ["hook.combat.resolve_surprise"],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.resolve_surprise",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-rat-lair-surprise",
                        "actorCharacterId": "rogue-1",
                        "targetId": "encounter.rat_lair",
                        "input": {
                            "stealthTotals": {"fighter-1": 12, "rogue-1": 15, "wizard-1": 14},
                            "passivePerceptionScores": {
                                "giant_rat-1": 10,
                                "giant_rat-2": 10,
                                "giant_rat-3": 10,
                                "giant_rat-4": 10,
                            },
                            "alreadyAlertedIds": [],
                        },
                        "sourceAction": {
                            "type": "start_combat",
                            "actorCharacterId": "rogue-1",
                            "targetId": "encounter.rat_lair",
                            "approach": "불을 낮추고 조용히 쥐 떼에게 접근한다.",
                        },
                        "sourceTraceId": "trace-demo-handoff-rat-lair-surprise",
                    }
                ],
                "notes": ["N04 can open with surprise when the party approaches quietly, so the AI handoff needs a deterministic surprise contract."],
            },
            {
                "caseId": "handoff.slippery_floor_dex_save",
                "rawText": "미끄러운 수로 바닥을 급히 달리다 발을 헛디딘다.",
                "interpreterOutput": {
                    "action": {
                        "type": "saving_throw",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "saveAbility": "dexterity",
                        "approach": "속도를 내다가 미끄러운 바닥에서 균형을 잡으려 한다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.checks.saving_throw"],
                    "safetyNotes": ["성공 여부와 넘어짐 적용은 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-slippery-floor-save",
                    "actorCharacterId": "fighter-1",
                    "scenarioNode": {"nodeId": "N03", "hazardId": "slippery_floor", "dc": 10},
                    "rollPlan": {"naturalD20": 4, "modifier": 2, "advantageState": "normal"},
                },
                "expectedHookIds": ["hook.check.resolve_saving_throw"],
                "hookRequests": [
                    {
                        "hookId": "hook.check.resolve_saving_throw",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-slippery-floor-save",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "input": {
                            "naturalD20": 4,
                            "modifier": 2,
                            "difficultyClass": 10,
                            "advantageState": "normal",
                            "saveAbility": "dexterity",
                        },
                        "sourceAction": {
                            "type": "saving_throw",
                            "actorCharacterId": "fighter-1",
                            "targetId": "fighter-1",
                            "saveAbility": "dexterity",
                            "requiresRoll": True,
                            "reason": "미끄러운 수로 바닥에서 중심을 유지한다.",
                        },
                        "sourceTraceId": "trace-demo-handoff-slippery-floor-save",
                    }
                ],
                "notes": ["N03 and N02 both rely on explicit saving throws, so the handoff catalog needs a save example separate from ability checks."],
            },
            {
                "caseId": "handoff.goblin_half_cover_attack",
                "rawText": "상자 뒤에 숨은 고블린에게 화살을 쏜다.",
                "interpreterOutput": {
                    "action": {
                        "type": "attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "approach": "상자 뒤 고블린의 노출된 틈을 향해 화살을 날린다.",
                        "confidence": 0.92,
                        "requiresRoll": True,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.combat.엄폐", "rule.combat.cover", "rule.combat.attack_roll"],
                    "safetyNotes": ["엄폐 보정과 최종 명중 여부는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-goblin-cover-attack",
                    "actorCharacterId": "ranger-1",
                    "targetId": "goblin-1",
                    "target": {"baseArmorClass": 15, "coverLevel": "half"},
                    "rollPlan": {"naturalD20": 11, "attackBonus": 5, "advantageState": "normal"},
                },
                "expectedHookIds": ["hook.combat.apply_cover_modifiers", "hook.combat.resolve_attack_roll"],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.apply_cover_modifiers",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-goblin-cover-attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "input": {
                            "coverLevel": "half",
                            "targetArmorClass": 15,
                            "baseDifficultyClass": 10,
                            "checkType": "attack_roll",
                            "directTargeting": True,
                        },
                        "sourceAction": {
                            "type": "attack",
                            "actorCharacterId": "ranger-1",
                            "targetId": "goblin-1",
                            "attackKind": "weapon_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-handoff-goblin-cover",
                    },
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-goblin-cover-attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "input": {
                            "naturalD20": 11,
                            "attackBonus": 5,
                            "targetArmorClass": 17,
                            "advantageState": "normal",
                        },
                        "sourceAction": {
                            "type": "attack",
                            "actorCharacterId": "ranger-1",
                            "targetId": "goblin-1",
                            "attackKind": "weapon_attack",
                            "requiresRoll": True,
                        },
                        "sourceTraceId": "trace-demo-handoff-goblin-cover",
                    }
                ],
                "notes": ["N04 and N06 both rely on crate-style half cover, so the attack handoff needs explicit AC adjustment before hit resolution."],
            },
            {
                "caseId": "handoff.black_water_difficult_terrain_move",
                "rawText": "검은 물웅덩이를 가로질러 고블린에게 붙는다.",
                "interpreterOutput": {
                    "action": {
                        "type": "move",
                        "actorCharacterId": "fighter-1",
                        "targetId": "terrain.black_water_pool",
                        "approach": "검은 물웅덩이를 통과해 근접 거리까지 전진한다.",
                        "confidence": 0.9,
                        "requiresRoll": False,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": ["rule.combat.어려운_지형", "rule.combat.difficult_terrain"],
                    "safetyNotes": ["실제 이동 거리 소모와 토큰 위치는 백엔드 엔진이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-black-water-move",
                    "actorCharacterId": "fighter-1",
                    "remainingMovementFt": 20,
                    "movementPlan": {"intendedDistanceFt": 10, "enteredDifficultTerrain": True},
                },
                "expectedHookIds": ["hook.combat.apply_difficult_terrain_cost"],
                "hookRequests": [
                    {
                        "hookId": "hook.combat.apply_difficult_terrain_cost",
                        "sessionId": "session-demo-1",
                        "turnId": "turn-black-water-move",
                        "actorCharacterId": "fighter-1",
                        "targetId": "terrain.black_water_pool",
                        "input": {
                            "enteredDifficultTerrain": True,
                            "intendedDistanceFt": 10,
                            "remainingMovementFt": 20,
                            "baseCostPerFoot": 1,
                        },
                        "sourceAction": {
                            "type": "move",
                            "actorCharacterId": "fighter-1",
                            "targetId": "terrain.black_water_pool",
                            "approach": "검은 물웅덩이를 가로질러 전진한다.",
                        },
                        "sourceTraceId": "trace-demo-handoff-black-water-move",
                    }
                ],
                "notes": ["N06 black water pool is an MVP difficult-terrain showcase, so movement cost needs a dedicated handoff example."],
            },
            {
                "caseId": "handoff.combat_victory_to_conclusion",
                "rawText": "고블린을 쓰러뜨리고 동굴 안쪽을 살핀다.",
                "interpreterOutput": {
                    "action": {
                        "type": "interact",
                        "actorCharacterId": "fighter-1",
                        "targetId": "node_inner_tunnel",
                        "approach": "전투가 끝난 뒤 동굴 안쪽을 살핀다.",
                        "confidence": 0.87,
                        "requiresRoll": False,
                    },
                    "needsClarification": False,
                    "mentionedSpellId": None,
                    "mentionedItemId": None,
                    "mentionedConditionIds": [],
                    "requiredRuleCheckIds": [],
                    "safetyNotes": ["전투 종료, 결말 노드 이동, 보상 공개는 백엔드/GM 흐름이 확정한다."],
                },
                "backendState": {
                    "sessionId": "session-demo-1",
                    "turnId": "turn-combat-victory",
                    "actorCharacterId": "fighter-1",
                    "defeatedHostiles": ["goblin-1"],
                    "currentNodeId": "node_inner_tunnel",
                    "nextNodeId": "node_goblin_cache",
                },
                "expectedHookIds": [],
                "hookRequests": [],
                "notes": ["This case closes the playable demo loop after the last hostile reaches 0 HP."],
            },
        ]
    )
    for case in cases:
        unknown_hook_ids = sorted(set(case["expectedHookIds"]) - set(hooks))
        if unknown_hook_ids:
            raise ValueError(f"unknown handoff hook IDs: {unknown_hook_ids}")
    return [InterpreterBackendHandoffCase(**case) for case in cases]


def build_narrator_input_fixture_cases() -> list[NarratorInputFixtureCase]:
    cases = [
        {
            "caseId": "narrator.chill_touch_hit",
            "sourceHandoffCaseId": "handoff.chill_touch_spell_attack",
            "backendHookResults": [
                {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "accepted": True,
                    "produced": {
                        "attackRollTotal": 20,
                        "hit": True,
                        "criticalHit": False,
                        "criticalMiss": False,
                    },
                    "rejectedReason": None,
                },
                {
                    "hookId": "hook.spell.cast_chill_touch",
                    "accepted": True,
                    "produced": {
                        "validatedSpellCast": True,
                        "damagePacket.necrotic": {"rolledDamage": 4},
                        "healingBlockedUntil": "caster_next_turn_start",
                        "undeadAttackDisadvantage": False,
                    },
                    "rejectedReason": None,
                },
                {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "accepted": True,
                    "produced": {
                        "finalDamage": 4,
                        "appliedDamageModifiers": [],
                    },
                    "rejectedReason": None,
                },
            ],
            "narratorRequest": {
                "rawInput": "싸늘한 손길을 적 고블린에게 시전한다.",
                "action": {
                    "type": "cast_spell",
                    "actorCharacterId": "wizard-1",
                    "targetId": "goblin-1",
                    "spellId": "spell.chill_touch",
                    "attackKind": "ranged_spell_attack",
                    "approach": "싸늘한 손길을 적 고블린에게 시전한다.",
                    "confidence": 0.96,
                    "requiresRoll": True,
                },
                "checkRequest": {
                    "checkType": "attack_roll",
                    "ability": "intelligence",
                    "skill": None,
                    "difficultyClass": 13,
                    "targetId": "goblin-1",
                    "reason": "싸늘한 손길의 원거리 주문 공격 명중 여부를 확인한다.",
                },
                "diceResult": {
                    "rollerId": "wizard-1",
                    "formula": "1d20+5",
                    "total": 20,
                    "naturalD20": 15,
                    "success": True,
                },
                "stateDiffSummary": {
                    "summary": "싸늘한 손길이 고블린에게 명중해 사령 피해 4점을 주고, 다음 시전자 턴 시작까지 치유를 막았다.",
                    "changedFlags": ["goblin-1.healing_blocked_until.caster_next_turn_start"],
                    "hpChanges": ["goblin-1:-4"],
                    "inventoryChanges": [],
                    "conditionChanges": [],
                    "nodeChange": None,
                },
                "scene": {
                    "title": "전투 중",
                    "summary": "마법사와 고블린이 90피트 거리에서 교전 중이다.",
                    "tone": "tense",
                },
                "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
            },
            "expectedVisibleSummary": "싸늘한 손길이 고블린에게 명중했다.",
            "forbiddenNarrationFacts": ["고블린 사망", "추가 적 등장", "숨겨진 단서"],
            "notes": ["Narrator may mention only confirmed hit, damage, and healing block."],
        },
        {
            "caseId": "narrator.weapon_attack_hit",
            "sourceHandoffCaseId": "handoff.weapon_attack_with_damage",
            "backendHookResults": [
                {
                    "hookId": "hook.combat.resolve_attack_roll",
                    "accepted": True,
                    "produced": {
                        "attackRollTotal": 22,
                        "hit": True,
                        "criticalHit": False,
                        "criticalMiss": False,
                    },
                    "rejectedReason": None,
                },
                {
                    "hookId": "hook.damage.apply_resistance_vulnerability",
                    "accepted": True,
                    "produced": {
                        "finalDamage": 9,
                        "appliedDamageModifiers": [],
                    },
                    "rejectedReason": None,
                },
            ],
            "narratorRequest": {
                "rawInput": "파이터가 롱소드로 고블린을 공격한다.",
                "action": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "attackKind": "weapon_attack",
                    "approach": "롱소드로 고블린을 공격한다.",
                    "confidence": 0.92,
                    "requiresRoll": True,
                },
                "checkRequest": {
                    "checkType": "attack_roll",
                    "ability": "strength",
                    "skill": None,
                    "difficultyClass": 15,
                    "targetId": "goblin-1",
                    "reason": "롱소드 공격 명중 여부를 확인한다.",
                },
                "diceResult": {
                    "rollerId": "fighter-1",
                    "formula": "1d20+5",
                    "total": 22,
                    "naturalD20": 17,
                    "success": True,
                },
                "stateDiffSummary": {
                    "summary": "롱소드 공격이 고블린에게 명중해 참격 피해 9점을 주었다.",
                    "changedFlags": [],
                    "hpChanges": ["goblin-1:-9"],
                    "inventoryChanges": [],
                    "conditionChanges": [],
                    "nodeChange": None,
                },
                "scene": {
                    "title": "전투 중",
                    "summary": "파이터가 근접 거리에서 고블린과 맞붙어 있다.",
                    "tone": "heroic",
                },
                "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
            },
            "expectedVisibleSummary": "롱소드 공격이 고블린에게 명중했다.",
            "forbiddenNarrationFacts": ["고블린 사망", "치명타", "무기 파손"],
            "notes": ["Narrator must not infer death unless hp change confirms it."],
        },
        {
            "caseId": "narrator.prone_stand_rejected",
            "sourceHandoffCaseId": "handoff.prone_stand_then_attack",
            "backendHookResults": [
                {
                    "hookId": "hook.condition.apply_prone_modifiers",
                    "accepted": False,
                    "produced": {
                        "movementCostFt": 15,
                        "selfAttackDisadvantage": True,
                        "incomingAttackAdvantageState": "advantage",
                    },
                    "rejectedReason": "not_enough_movement_to_stand",
                },
            ],
            "narratorRequest": {
                "rawInput": "넘어짐 상태에서 일어나서 적을 공격하려고 한다.",
                "action": {
                    "type": "attack",
                    "actorCharacterId": "fighter-1",
                    "targetId": "goblin-1",
                    "attackKind": "weapon_attack",
                    "approach": "넘어짐 상태에서 일어나 적을 공격하려고 한다.",
                    "confidence": 0.88,
                    "requiresRoll": True,
                },
                "checkRequest": None,
                "diceResult": None,
                "stateDiffSummary": {
                    "summary": "파이터는 일어서려 했지만 남은 이동력이 부족해 넘어짐 상태를 유지했다. 공격 굴림은 진행되지 않았다.",
                    "changedFlags": [],
                    "hpChanges": [],
                    "inventoryChanges": [],
                    "conditionChanges": ["fighter-1:prone remains"],
                    "nodeChange": None,
                },
                "scene": {
                    "title": "전투 중",
                    "summary": "파이터가 넘어진 채 고블린과 가까운 거리에 있다.",
                    "tone": "tense",
                },
                "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
            },
            "expectedVisibleSummary": "파이터는 이동력 부족으로 일어서지 못했다.",
            "forbiddenNarrationFacts": ["공격 명중", "피해", "넘어짐 해제"],
            "notes": ["Rejected hook results still become factual narration inputs."],
        },
    ]
    cases.extend(
        [
            {
                "caseId": "narrator.fire_bolt_hit",
                "sourceHandoffCaseId": "handoff.fire_bolt_spell_attack",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "accepted": True,
                        "produced": {
                            "attackRollTotal": 19,
                            "hit": True,
                            "criticalHit": False,
                            "criticalMiss": False,
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.spell.cast_fire_bolt",
                        "accepted": True,
                        "produced": {
                            "validatedSpellCast": True,
                            "damagePacket.fire": {"rolledDamage": 7},
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "accepted": True,
                        "produced": {"finalDamage": 7, "appliedDamageModifiers": []},
                        "rejectedReason": None,
                    },
                ],
                "narratorRequest": {
                    "rawInput": "위저드가 화염 화살로 고블린을 공격한다.",
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.fire_bolt",
                        "attackKind": "ranged_spell_attack",
                        "approach": "화염 화살로 고블린을 공격한다.",
                        "confidence": 0.94,
                        "requiresRoll": True,
                    },
                    "checkRequest": {
                        "checkType": "attack_roll",
                        "ability": "intelligence",
                        "skill": None,
                        "difficultyClass": 13,
                        "targetId": "goblin-1",
                        "reason": "화염 화살의 원거리 주문 공격 명중 여부를 확인한다.",
                    },
                    "diceResult": {
                        "rollerId": "wizard-1",
                        "formula": "1d20+5",
                        "total": 19,
                        "naturalD20": 14,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "화염 화살이 고블린에게 명중해 화염 피해 7점을 주었다.",
                        "changedFlags": [],
                        "hpChanges": ["goblin-1:-7"],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 중", "summary": "위저드가 원거리에서 고블린을 겨눈다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "화염 화살이 고블린에게 명중했다.",
                "forbiddenNarrationFacts": ["고블린 사망", "불길 확산", "추가 피해"],
                "notes": ["Generic attack cantrip narration fixture."],
            },
            {
                "caseId": "narrator.second_wind_heal",
                "sourceHandoffCaseId": "handoff.fighter_second_wind",
                "backendHookResults": [
                    {
                        "hookId": "hook.class.fighter.second_wind",
                        "accepted": True,
                        "produced": {
                            "hitPointsRestored": 7,
                            "newHitPoints": 12,
                            "secondWindExpended": True,
                            "bonusActionSpent": True,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "파이터가 재기의 숨결로 버틴다.",
                    "action": {
                        "type": "use_class_feature",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "featureId": "class.fighter.feature.재기의_숨결",
                        "approach": "재기의 숨결을 사용한다.",
                        "confidence": 0.93,
                        "requiresRoll": True,
                    },
                    "checkRequest": None,
                    "diceResult": {
                        "rollerId": "fighter-1",
                        "formula": "1d10+2",
                        "total": 7,
                        "naturalD20": None,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "파이터가 재기의 숨결로 HP 7점을 회복해 현재 HP가 12가 되었다.",
                        "changedFlags": ["fighter-1.second_wind_expended"],
                        "hpChanges": ["fighter-1:+7"],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 중", "summary": "파이터가 상처를 입은 채 전열을 지킨다.", "tone": "heroic"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "파이터가 재기의 숨결로 회복했다.",
                "forbiddenNarrationFacts": ["추가 행동 획득", "상처 완전 회복", "적 후퇴"],
                "notes": ["Class feature healing narration fixture."],
            },
            {
                "caseId": "narrator.sneak_attack_hit",
                "sourceHandoffCaseId": "handoff.rogue_sneak_attack",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "accepted": True,
                        "produced": {
                            "attackRollTotal": 21,
                            "hit": True,
                            "criticalHit": False,
                            "criticalMiss": False,
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.class.rogue.sneak_attack",
                        "accepted": True,
                        "produced": {
                            "sneakAttackDice": "1d6",
                            "sneakAttackDamage": {"rolledDamage": 4, "damageType": "piercing"},
                            "sneakAttackExpendedThisTurn": True,
                            "damagePacket": {"baseDamage": 6, "bonusDamage": 4, "damageType": "piercing"},
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "accepted": True,
                        "produced": {"finalDamage": 10, "appliedDamageModifiers": []},
                        "rejectedReason": None,
                    },
                ],
                "narratorRequest": {
                    "rawInput": "로그가 레이피어로 빈틈을 노려 암습한다.",
                    "action": {
                        "type": "attack",
                        "actorCharacterId": "rogue-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "approach": "레이피어로 암습을 노린다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "checkRequest": {
                        "checkType": "attack_roll",
                        "ability": "dexterity",
                        "skill": None,
                        "difficultyClass": 13,
                        "targetId": "goblin-1",
                        "reason": "레이피어 공격 명중 여부를 확인한다.",
                    },
                    "diceResult": {
                        "rollerId": "rogue-1",
                        "formula": "1d20+5",
                        "total": 21,
                        "naturalD20": 16,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "로그의 레이피어 공격이 명중했고 암습 피해까지 더해 관통 피해 10점을 주었다.",
                        "changedFlags": ["rogue-1.sneak_attack_expended_this_turn"],
                        "hpChanges": ["goblin-1:-10"],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 중", "summary": "로그가 고블린의 빈틈을 노린다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "로그의 암습 공격이 명중했다.",
                "forbiddenNarrationFacts": ["고블린 사망", "두 번째 암습", "무기 파손"],
                "notes": ["Rogue damage feature narration fixture."],
            },
            {
                "caseId": "narrator.potion_of_healing",
                "sourceHandoffCaseId": "handoff.potion_of_healing",
                "backendHookResults": [
                    {
                        "hookId": "hook.item.use_potion_of_healing",
                        "accepted": True,
                        "produced": {
                            "hitPointsRestored": 7,
                            "newHitPoints": 9,
                            "itemConsumed": True,
                            "actionSpent": True,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "로그가 치유 물약을 마신다.",
                    "action": {
                        "type": "use_item",
                        "actorCharacterId": "rogue-1",
                        "targetId": "rogue-1",
                        "itemId": "magic_item.potion_of_healing",
                        "approach": "치유 물약을 사용한다.",
                        "confidence": 0.95,
                        "requiresRoll": True,
                    },
                    "checkRequest": None,
                    "diceResult": {
                        "rollerId": "rogue-1",
                        "formula": "2d4+2",
                        "total": 8,
                        "naturalD20": None,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "로그가 치유 물약을 소비해 HP 7점을 회복하고 현재 HP가 9가 되었다.",
                        "changedFlags": [],
                        "hpChanges": ["rogue-1:+7"],
                        "inventoryChanges": ["rogue-1:magic_item.potion_of_healing:-1"],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 중", "summary": "로그가 숨을 고르며 물약을 꺼낸다.", "tone": "urgent"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "로그가 치유 물약을 사용해 회복했다.",
                "forbiddenNarrationFacts": ["물약 추가 획득", "상처 완전 회복", "추가 행동"],
                "notes": ["Consumable item narration fixture."],
            },
            {
                "caseId": "narrator.investigate_tracks_success",
                "sourceHandoffCaseId": "handoff.investigate_tracks_skill_check",
                "backendHookResults": [
                    {
                        "hookId": "hook.check.resolve_ability_or_skill_check",
                        "accepted": True,
                        "produced": {
                            "checkRollTotal": 17,
                            "success": True,
                            "criticalSuccess": False,
                            "criticalFailure": False,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "발자국을 조사해서 고블린이 어디로 갔는지 알아본다.",
                    "action": {
                        "type": "skill_check",
                        "actorCharacterId": "rogue-1",
                        "targetId": "node_cave_entrance",
                        "ability": "intelligence",
                        "skill": "investigation",
                        "approach": "발자국과 흙의 흐트러진 방향을 조사한다.",
                        "confidence": 0.91,
                        "requiresRoll": True,
                        "suggestedDifficulty": "easy",
                    },
                    "checkRequest": {
                        "checkType": "skill_check",
                        "ability": "intelligence",
                        "skill": "investigation",
                        "difficultyClass": 10,
                        "targetId": "node_cave_entrance",
                        "reason": "동굴 입구의 발자국이 어느 통로로 이어지는지 판정한다.",
                    },
                    "diceResult": {
                        "rollerId": "rogue-1",
                        "formula": "1d20+4",
                        "total": 17,
                        "naturalD20": 13,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "로그가 흙 위의 새 발자국을 찾아 고블린들이 안쪽 굴로 이동했다는 단서를 확인했다.",
                        "changedFlags": ["node_cave_entrance.clue_tracks.revealed"],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": "node_inner_tunnel",
                    },
                    "scene": {"title": "동굴 입구", "summary": "입구의 젖은 흙과 자갈 사이에 작은 발자국들이 남아 있다.", "tone": "investigative"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "로그가 고블린의 발자국이 안쪽 굴로 이어진다는 단서를 찾았다.",
                "forbiddenNarrationFacts": ["숨겨진 보물", "새로운 적 등장", "전투 시작"],
                "notes": ["Exploration skill check narration fixture."],
            },
            {
                "caseId": "narrator.magic_missile_finishes_goblin",
                "sourceHandoffCaseId": "handoff.magic_missile_auto_hit",
                "backendHookResults": [
                    {
                        "hookId": "hook.spell.cast_magic_missile",
                        "accepted": True,
                        "produced": {
                            "validatedSpellCast": True,
                            "missileCount": 3,
                            "forceDamageTotal": 10,
                            "targetAssignments": [{"targetId": "goblin-1", "missiles": 3, "damage": 10}],
                            "spellSlotExpended": True,
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.damage.apply_resistance_vulnerability",
                        "accepted": True,
                        "produced": {"finalDamage": 10, "appliedDamageModifiers": []},
                        "rejectedReason": None,
                    },
                ],
                "narratorRequest": {
                    "rawInput": "위저드가 마법 화살 세 발을 고블린에게 날린다.",
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "wizard-1",
                        "targetId": "goblin-1",
                        "spellId": "spell.magic_missile",
                        "approach": "마법 화살 세 발을 모두 고블린에게 집중한다.",
                        "confidence": 0.95,
                        "requiresRoll": False,
                    },
                    "checkRequest": None,
                    "diceResult": {
                        "rollerId": "wizard-1",
                        "formula": "3d4+3",
                        "total": 10,
                        "naturalD20": None,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "마법 화살 세 발이 자동으로 명중해 고블린에게 역장 피해 10점을 주고 쓰러뜨렸다.",
                        "changedFlags": ["wizard-1.spell_slot_1:-1"],
                        "hpChanges": ["goblin-1:-10"],
                        "inventoryChanges": [],
                        "conditionChanges": ["goblin-1:defeated"],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 중", "summary": "고블린 한 마리가 거의 쓰러질 듯 비틀거리고 있다.", "tone": "decisive"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "위저드의 마법 화살이 고블린을 쓰러뜨렸다.",
                "forbiddenNarrationFacts": ["빗나감", "추가 대상 피해", "새로운 적 등장"],
                "notes": ["Auto-hit spell narration fixture."],
            },
            {
                "caseId": "narrator.ranger_cure_wounds",
                "sourceHandoffCaseId": "handoff.ranger_cure_wounds",
                "backendHookResults": [
                    {
                        "hookId": "hook.spell.cast_cure_wounds",
                        "accepted": True,
                        "produced": {
                            "validatedSpellCast": True,
                            "hitPointsRestored": 7,
                            "newHitPoints": 10,
                            "spellSlotExpended": True,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "레인저가 파이터에게 상처 치료를 시전한다.",
                    "action": {
                        "type": "cast_spell",
                        "actorCharacterId": "ranger-1",
                        "targetId": "fighter-1",
                        "spellId": "spell.cure_wounds",
                        "approach": "파이터에게 손을 대고 상처 치료를 시전한다.",
                        "confidence": 0.94,
                        "requiresRoll": True,
                    },
                    "checkRequest": None,
                    "diceResult": {
                        "rollerId": "ranger-1",
                        "formula": "1d8+2",
                        "total": 7,
                        "naturalD20": None,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "레인저의 상처 치료가 파이터의 HP를 7점 회복시켜 현재 HP가 10이 되었다.",
                        "changedFlags": ["ranger-1.spell_slot_1:-1"],
                        "hpChanges": ["fighter-1:+7"],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "전투 후 정비", "summary": "파이터가 깊은 상처를 입은 채 숨을 고르고 있다.", "tone": "relieved"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "레인저가 상처 치료로 파이터를 회복시켰다.",
                "forbiddenNarrationFacts": ["최대 HP 초과", "상태 이상 제거", "추가 강화 효과"],
                "notes": ["Healing spell narration fixture."],
            },
            {
                "caseId": "narrator.well_chamber_initiative",
                "sourceHandoffCaseId": "handoff.well_chamber_initiative",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.resolve_initiative_order",
                        "accepted": True,
                        "produced": {
                            "initiativeTotal": 16,
                            "groupedParticipants": ["goblin-1", "goblin-2", "goblin-3"],
                            "tiebreakRequired": False,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "우물 아래 방에 들어서자 고블린들과 전투가 시작된다.",
                    "action": {
                        "type": "start_combat",
                        "actorCharacterId": "gm-encounter",
                        "targetId": "encounter.well_chamber",
                        "approach": "최종 방에서 고블린들과 전투를 시작한다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "checkRequest": None,
                    "diceResult": {
                        "rollerId": "monster.goblin",
                        "formula": "1d20+2",
                        "total": 16,
                        "naturalD20": 14,
                        "success": True,
                    },
                    "stateDiffSummary": {
                        "summary": "최종 전투가 시작되며 고블린 세 마리가 같은 우선권 16으로 함께 행동 순서에 들어갔다.",
                        "changedFlags": ["encounter.well_chamber.initiative_started"],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "우물 아래 전투", "summary": "고블린들이 상자 뒤와 물웅덩이 근처에서 무기를 들고 움직일 준비를 한다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "우물 아래 방 전투가 시작되고 고블린들이 같은 우선권으로 묶였다.",
                "forbiddenNarrationFacts": ["플레이어 우선권 확정", "숨은 적 추가", "전투 종료"],
                "notes": ["Initiative ordering is a confirmed setup fact the narrator may mention without inventing future turns."],
            },
            {
                "caseId": "narrator.rat_lair_surprise",
                "sourceHandoffCaseId": "handoff.rat_lair_surprise_approach",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.resolve_surprise",
                        "accepted": True,
                        "produced": {
                            "surprisedTargetIds": ["giant_rat-1", "giant_rat-2", "giant_rat-3", "giant_rat-4"],
                            "awareTargetIds": [],
                            "surpriseDetected": True,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "불을 낮추고 조용히 접근해 쥐들을 기습한다.",
                    "action": {
                        "type": "start_combat",
                        "actorCharacterId": "rogue-1",
                        "targetId": "encounter.rat_lair",
                        "approach": "광원을 낮추고 조용히 쥐 떼에게 접근한다.",
                        "confidence": 0.89,
                        "requiresRoll": True,
                    },
                    "checkRequest": None,
                    "diceResult": None,
                    "stateDiffSummary": {
                        "summary": "쥐 떼는 일행의 접근을 눈치채지 못했고, 첫 라운드에 기습당한 상태로 전투가 시작됐다.",
                        "changedFlags": [],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": [
                            "giant_rat-1:surprised",
                            "giant_rat-2:surprised",
                            "giant_rat-3:surprised",
                            "giant_rat-4:surprised",
                        ],
                        "nodeChange": None,
                    },
                    "scene": {"title": "쥐떼 소굴", "summary": "썩은 자루 틈으로 거대 쥐들이 등을 돌린 채 웅성거린다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "쥐 떼가 일행을 눈치채지 못해 기습당했다.",
                "forbiddenNarrationFacts": ["자동 명중", "추가 적 등장", "전투 종료"],
                "notes": ["Surprise outcome is visible and should stay separate from later initiative or attack narration."],
            },
            {
                "caseId": "narrator.slippery_floor_save_fail",
                "sourceHandoffCaseId": "handoff.slippery_floor_dex_save",
                "backendHookResults": [
                    {
                        "hookId": "hook.check.resolve_saving_throw",
                        "accepted": True,
                        "produced": {
                            "checkRollTotal": 6,
                            "success": False,
                            "criticalSuccess": False,
                            "criticalFailure": False,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "미끄러운 수로 바닥을 급히 달리다 발을 헛디딘다.",
                    "action": {
                        "type": "saving_throw",
                        "actorCharacterId": "fighter-1",
                        "targetId": "fighter-1",
                        "saveAbility": "dexterity",
                        "approach": "속도를 내다가 미끄러운 바닥에서 균형을 잡으려 한다.",
                        "confidence": 0.9,
                        "requiresRoll": True,
                    },
                    "checkRequest": {
                        "checkType": "saving_throw",
                        "ability": "dexterity",
                        "skill": None,
                        "difficultyClass": 10,
                        "targetId": "fighter-1",
                        "reason": "미끄러운 수로 바닥에서 넘어지지 않고 버틴다.",
                    },
                    "diceResult": {
                        "rollerId": "fighter-1",
                        "formula": "1d20+2",
                        "total": 6,
                        "naturalD20": 4,
                        "success": False,
                    },
                    "stateDiffSummary": {
                        "summary": "파이터는 미끄러운 바닥에서 균형을 잃고 넘어졌다.",
                        "changedFlags": [],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": ["fighter-1:prone applied"],
                        "nodeChange": None,
                    },
                    "scene": {"title": "지하 수로", "summary": "축축한 벽돌 바닥 위로 얕은 물이 번들거린다.", "tone": "urgent"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "파이터가 미끄러운 바닥에서 균형을 잃고 넘어졌다.",
                "forbiddenNarrationFacts": ["피해 확정", "적 등장", "자동 기상"],
                "notes": ["Saving throw failure can narrate prone application without inventing extra damage or enemies."],
            },
            {
                "caseId": "narrator.goblin_half_cover_miss",
                "sourceHandoffCaseId": "handoff.goblin_half_cover_attack",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.apply_cover_modifiers",
                        "accepted": True,
                        "produced": {
                            "adjustedArmorClass": 17,
                            "adjustedDifficultyClass": 10,
                            "targetable": True,
                        },
                        "rejectedReason": None,
                    },
                    {
                        "hookId": "hook.combat.resolve_attack_roll",
                        "accepted": True,
                        "produced": {
                            "attackRollTotal": 16,
                            "hit": False,
                            "criticalHit": False,
                            "criticalMiss": False,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "상자 뒤에 숨은 고블린에게 화살을 쏜다.",
                    "action": {
                        "type": "attack",
                        "actorCharacterId": "ranger-1",
                        "targetId": "goblin-1",
                        "attackKind": "weapon_attack",
                        "approach": "상자 뒤 고블린의 노출된 틈을 향해 화살을 날린다.",
                        "confidence": 0.92,
                        "requiresRoll": True,
                    },
                    "checkRequest": {
                        "checkType": "attack_roll",
                        "ability": "dexterity",
                        "skill": None,
                        "difficultyClass": 17,
                        "targetId": "goblin-1",
                        "reason": "절반 엄폐 뒤의 고블린에게 화살이 닿는지 확인한다.",
                    },
                    "diceResult": {
                        "rollerId": "ranger-1",
                        "formula": "1d20+5",
                        "total": 16,
                        "naturalD20": 11,
                        "success": False,
                    },
                    "stateDiffSummary": {
                        "summary": "고블린이 상자 뒤로 몸을 숨겨 화살이 빗나갔다.",
                        "changedFlags": [],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "우물 아래 전투", "summary": "상자 더미 뒤에서 고블린이 몸을 웅크린 채 활시위를 당긴다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "상자 뒤 엄폐 때문에 화살이 고블린을 빗나갔다.",
                "forbiddenNarrationFacts": ["고블린 사망", "엄폐 무시", "추가 피해"],
                "notes": ["Cover-modified misses are important for N04 and N06 and should stay explicitly mechanical in fixture data."],
            },
            {
                "caseId": "narrator.black_water_difficult_terrain",
                "sourceHandoffCaseId": "handoff.black_water_difficult_terrain_move",
                "backendHookResults": [
                    {
                        "hookId": "hook.combat.apply_difficult_terrain_cost",
                        "accepted": True,
                        "produced": {
                            "movementCostFt": 20,
                            "movementAllowed": True,
                            "remainingMovementFtAfterMove": 0,
                        },
                        "rejectedReason": None,
                    }
                ],
                "narratorRequest": {
                    "rawInput": "검은 물웅덩이를 가로질러 고블린에게 붙는다.",
                    "action": {
                        "type": "move",
                        "actorCharacterId": "fighter-1",
                        "targetId": "terrain.black_water_pool",
                        "approach": "검은 물웅덩이를 통과해 근접 거리까지 전진한다.",
                        "confidence": 0.9,
                        "requiresRoll": False,
                    },
                    "checkRequest": None,
                    "diceResult": None,
                    "stateDiffSummary": {
                        "summary": "검은 물웅덩이 때문에 10피트 전진에 이동력 20피트가 들었고, 파이터의 남은 이동력은 모두 소진되었다.",
                        "changedFlags": [],
                        "hpChanges": [],
                        "inventoryChanges": [],
                        "conditionChanges": [],
                        "nodeChange": None,
                    },
                    "scene": {"title": "우물 아래 전투", "summary": "중앙 물웅덩이의 검은 물이 발을 잡아당기듯 느리게 흐른다.", "tone": "tense"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "검은 물웅덩이 때문에 이동력이 두 배로 소모되었다.",
                "forbiddenNarrationFacts": ["추가 피해", "순간이동", "전투 종료"],
                "notes": ["Difficult terrain in the final room should surface as confirmed movement cost, not as vague flavor only."],
            },
            {
                "caseId": "narrator.combat_victory_conclusion",
                "sourceHandoffCaseId": "handoff.combat_victory_to_conclusion",
                "backendHookResults": [],
                "narratorRequest": {
                    "rawInput": "고블린을 쓰러뜨리고 동굴 안쪽을 살핀다.",
                    "action": {
                        "type": "interact",
                        "actorCharacterId": "fighter-1",
                        "targetId": "node_inner_tunnel",
                        "approach": "전투가 끝난 뒤 안쪽 통로와 작은 보급품 더미를 살핀다.",
                        "confidence": 0.88,
                        "requiresRoll": False,
                    },
                    "checkRequest": None,
                    "diceResult": None,
                    "stateDiffSummary": {
                        "summary": "마지막 고블린이 쓰러졌고 일행은 안쪽 통로의 작은 보급품 더미를 확인하며 데모 세션의 결론에 도달했다.",
                        "changedFlags": ["demo_session.objective.completed"],
                        "hpChanges": [],
                        "inventoryChanges": ["party:basic_supplies:+1"],
                        "conditionChanges": ["combat:ended"],
                        "nodeChange": "node_goblin_cache",
                    },
                    "scene": {"title": "동굴 안쪽", "summary": "전투가 끝난 동굴 안쪽에는 고블린들이 모아 둔 작은 보급품 더미가 보인다.", "tone": "resolved"},
                    "constraints": {"language": "ko", "maxLength": 500, "noNewFacts": True},
                },
                "expectedVisibleSummary": "전투가 끝나고 일행은 동굴 안쪽의 보급품을 확인하며 세션을 마무리했다.",
                "forbiddenNarrationFacts": ["새 퀘스트", "보스 등장", "전설급 보물"],
                "notes": ["Demo session conclusion narration fixture."],
            },
        ]
    )
    return [NarratorInputFixtureCase(**case) for case in cases]


def build_qa_report(
    spells: list[Spell],
    conditions: list[Condition],
    rule_fragments: list[RuleFragment],
    rule_hook_fixtures: list[RuleHookFixture] | None = None,
    magic_items: list[MagicItem] | None = None,
    monsters: list[Monster] | None = None,
    race_options: list[RaceOption] | None = None,
    class_options: list[ClassOption] | None = None,
    equipment_items: list[EquipmentItem] | None = None,
    equipment_references: list[EquipmentReference] | None = None,
) -> dict:
    spell_common_fields = {
        "level": lambda spell: spell.level is not None,
        "schoolKo": lambda spell: bool(spell.schoolKo),
        "castingTime": lambda spell: spell.castingTime is not None and bool(spell.castingTime.raw),
        "range": lambda spell: spell.range is not None and bool(spell.range.raw),
        "components": lambda spell: spell.components is not None and bool(spell.components.raw),
        "duration": lambda spell: spell.duration is not None and bool(spell.duration.raw),
        "playReference": lambda spell: bool(spell.playReference),
        "source.page": lambda spell: bool(spell.source.page),
    }
    spell_field_coverage = {}
    missing_by_spell: list[dict[str, object]] = []
    for field, predicate in spell_common_fields.items():
        present = sum(1 for spell in spells if predicate(spell))
        spell_field_coverage[field] = {
            "present": present,
            "total": len(spells),
            "ratio": round(present / len(spells), 4) if spells else 0,
        }
    for spell in spells:
        missing = [field for field, predicate in spell_common_fields.items() if not predicate(spell)]
        if missing:
            missing_by_spell.append(
                {
                    "id": spell.id,
                    "nameEn": spell.nameEn,
                    "nameKo": spell.nameKo,
                    "missing": missing,
                    "source": spell.source.model_dump(),
                }
            )

    magic_items = magic_items or []
    monsters = monsters or []
    race_options = race_options or []
    class_options = class_options or []
    equipment_items = equipment_items or []
    rule_hook_fixtures = rule_hook_fixtures or []
    equipment_references = equipment_references or []
    character_option_validation = build_character_option_validation_report(
        race_options,
        class_options,
        equipment_items,
    )
    magic_item_common_fields = {
        "categoryRaw": lambda item: bool(item.categoryRaw),
        "rarityRaw": lambda item: bool(item.rarityRaw),
        "requiresAttunement": lambda item: item.requiresAttunement is not None,
        "playReference": lambda item: bool(item.playReference),
        "source.page": lambda item: bool(item.source.page),
    }
    magic_item_field_coverage = {}
    magic_items_missing_common_fields: list[dict[str, object]] = []
    if magic_items:
        for field, predicate in magic_item_common_fields.items():
            present = sum(1 for item in magic_items if predicate(item))
            magic_item_field_coverage[field] = {
                "present": present,
                "total": len(magic_items),
                "ratio": round(present / len(magic_items), 4),
            }
        for item in magic_items:
            missing = [field for field, predicate in magic_item_common_fields.items() if not predicate(item)]
            if missing:
                magic_items_missing_common_fields.append(
                    {
                        "id": item.id,
                        "nameEn": item.nameEn,
                        "nameKo": item.nameKo,
                        "missing": missing,
                        "source": item.source.model_dump(),
                    }
                )

    monster_common_fields = {
        "nameKo.noLatin": lambda monster: not re.search(r"[A-Za-z]", monster.nameKo),
        "basicRaw": lambda monster: bool(monster.basicRaw),
        "armorClassRaw": lambda monster: bool(monster.armorClassRaw),
        "hitPointsRaw": lambda monster: bool(monster.hitPointsRaw),
        "speedRaw": lambda monster: bool(monster.speedRaw),
        "challengeRaw": lambda monster: bool(monster.challengeRaw),
        "playReference": lambda monster: bool(monster.playReference),
        "source.page": lambda monster: bool(monster.source.page),
    }
    monster_field_coverage = {}
    monsters_missing_common_fields: list[dict[str, object]] = []
    if monsters:
        for field, predicate in monster_common_fields.items():
            present = sum(1 for monster in monsters if predicate(monster))
            monster_field_coverage[field] = {
                "present": present,
                "total": len(monsters),
                "ratio": round(present / len(monsters), 4),
            }
        for monster in monsters:
            missing = [field for field, predicate in monster_common_fields.items() if not predicate(monster)]
            if missing:
                monsters_missing_common_fields.append(
                    {
                        "id": monster.id,
                        "nameEn": monster.nameEn,
                        "nameKo": monster.nameKo,
                        "missing": missing,
                        "source": monster.source.model_dump(),
                    }
                )

    return {
        "spells": {
            "expected": EXPECTED_COUNTS["spells"],
            "actual": len(spells),
            "commonFieldCoverage": spell_field_coverage,
            "rowsWithMissingCommonFields": missing_by_spell,
        },
        "conditions": {
            "expected": EXPECTED_COUNTS["conditions"],
            "actual": len(conditions),
            "rowsMissingEffects": [
                condition.model_dump()
                for condition in conditions
                if not condition.effects or not condition.source.file
            ],
        },
        "ruleFragments": {
            "actual": len(rule_fragments),
            "rowsMissingSource": [
                fragment.model_dump()
                for fragment in rule_fragments
                if not fragment.source.file or not fragment.source.heading
            ],
        },
        "ruleHookFixtures": {
            "actual": len(rule_hook_fixtures),
            "rowsMissingContractFields": [
                hook.model_dump()
                for hook in rule_hook_fixtures
                if not hook.engineFunction
                or not hook.consumes
                or not hook.produces
                or not hook.acceptanceChecks
            ],
        },
        "magicItems": {
            "expected": EXPECTED_COUNTS["magic_items"],
            "actual": len(magic_items),
            "commonFieldCoverage": magic_item_field_coverage,
            "rowsWithMissingCommonFields": magic_items_missing_common_fields,
        },
        "monsters": {
            "expected": EXPECTED_COUNTS["monsters"],
            "actual": len(monsters),
            "commonFieldCoverage": monster_field_coverage,
            "rowsWithMissingCommonFields": monsters_missing_common_fields,
        },
        "races": {
            "expected": EXPECTED_COUNTS["races"],
            "actual": len(race_options),
            "rowsMissingCoreFields": [
                race.model_dump()
                for race in race_options
                if not race.id
                or not race.nameKo
                or not race.nameEn
                or not race.source.file
                or not race.summaryKo
            ],
        },
        "classes": {
            "expected": EXPECTED_COUNTS["classes"],
            "actual": len(class_options),
            "rowsMissingCoreFields": [
                class_option.model_dump()
                for class_option in class_options
                if not class_option.id
                or not class_option.nameKo
                or not class_option.nameEn
                or not class_option.source.file
                or not class_option.summaryKo
            ],
        },
        "equipmentItems": {
            "actual": len(equipment_items),
            "rowsMissingCoreFields": [
                item.model_dump()
                for item in equipment_items
                if not item.id or not item.nameKo or not item.kind or (not item.sourceClassIds and not item.sourceTable)
            ],
        },
        "equipmentReferences": {
            "actual": len(equipment_references),
            "rowsMissingSummary": [
                reference.model_dump()
                for reference in equipment_references
                if not reference.summaryKo or not reference.source.file
            ],
        },
        "characterOptionValidation": character_option_validation,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(
    path: Path,
    rows: list[Spell]
    | list[Condition]
    | list[RaceOption]
    | list[ClassOption]
    | list[EquipmentItem]
    | list[RuleCard]
    | list[RuleFragment]
    | list[RuleHookFixture]
    | list[MagicItem]
    | list[Monster]
    | list[EquipmentReference],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [row.model_dump_json(by_alias=False) for row in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build(output_dir: Path = GENERATED_ROOT) -> dict[str, int]:
    manifest = build_source_manifest()
    spells = build_spells()
    conditions = parse_conditions()
    rule_cards = build_rule_cards()
    rule_fragments = build_rule_fragments()
    rule_hook_fixtures = build_rule_hook_fixtures()
    backend_engine_p0_contracts = build_backend_engine_p0_contracts(rule_hook_fixtures)
    interpreter_backend_handoff_cases = build_interpreter_backend_handoff_cases(rule_hook_fixtures)
    narrator_input_fixture_cases = build_narrator_input_fixture_cases()
    magic_items = build_magic_items()
    monsters = build_monsters()
    race_options = build_race_options()
    class_options = build_class_options()
    equipment_items = build_equipment_items(class_options)
    equipment_references = build_equipment_references()
    qa_report = build_qa_report(
        spells,
        conditions,
        rule_fragments,
        rule_hook_fixtures,
        magic_items,
        monsters,
        race_options,
        class_options,
        equipment_items,
        equipment_references,
    )
    write_json(output_dir / "source_manifest.json", manifest.model_dump())
    write_jsonl(output_dir / "spells.jsonl", spells)
    write_jsonl(output_dir / "conditions.jsonl", conditions)
    write_jsonl(output_dir / "rules_cards.jsonl", rule_cards)
    write_jsonl(output_dir / "rule_fragments.jsonl", rule_fragments)
    write_json(output_dir / "rules_hooks.json", {"hooks": [hook.model_dump() for hook in rule_hook_fixtures]})
    write_json(
        output_dir / "backend_engine_p0_contracts.json",
        {"cases": [case.model_dump() for case in backend_engine_p0_contracts]},
    )
    write_json(
        output_dir / "interpreter_backend_handoff_cases.json",
        {"cases": [case.model_dump() for case in interpreter_backend_handoff_cases]},
    )
    write_json(
        output_dir / "narrator_input_fixtures.json",
        {"cases": [case.model_dump() for case in narrator_input_fixture_cases]},
    )
    write_jsonl(output_dir / "magic_items.jsonl", magic_items)
    write_jsonl(output_dir / "monsters.jsonl", monsters)
    write_jsonl(output_dir / "races.jsonl", race_options)
    write_jsonl(output_dir / "classes.jsonl", class_options)
    write_jsonl(output_dir / "equipment_items.jsonl", equipment_items)
    write_jsonl(output_dir / "equipment.jsonl", equipment_references)
    write_json(output_dir / "srd_qa_report.json", qa_report)
    return {
        "source_files": len(manifest.files),
        "spells": len(spells),
        "conditions": len(conditions),
        "rule_cards": len(rule_cards),
        "rule_fragments": len(rule_fragments),
        "rule_hook_fixtures": len(rule_hook_fixtures),
        "backend_engine_p0_contracts": len(backend_engine_p0_contracts),
        "interpreter_backend_handoff_cases": len(interpreter_backend_handoff_cases),
        "narrator_input_fixtures": len(narrator_input_fixture_cases),
        "magic_items": len(magic_items),
        "monsters": len(monsters),
        "races": len(race_options),
        "classes": len(class_options),
        "equipment_items": len(equipment_items),
        "equipment_references": len(equipment_references),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build SRD-derived runtime data.")
    parser.add_argument("--output-dir", type=Path, default=GENERATED_ROOT)
    args = parser.parse_args()
    result = build(args.output_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
