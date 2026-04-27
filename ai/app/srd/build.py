import argparse
import hashlib
import json
import re
from pathlib import Path

from app.srd.models import (
    Condition,
    ClassOption,
    EquipmentItem,
    EquipmentReference,
    MagicItem,
    Monster,
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


EQUIPMENT_KIND_PATTERNS = [
    ("armor", ("갑옷", "메일", "방패")),
    ("weapon", ("무기", "검", "소드", "액스", "도끼", "활", "보우", "크로스보우", "메이스", "스태프", "대거", "다트", "슬링", "스피어", "재블린", "단검", "레이피어")),
    ("ammunition", ("화살", "볼트")),
    ("pack", ("꾸러미",)),
    ("tool", ("도구", "악기", "류트", "초점구")),
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
    return name, quantity


def expand_equipment_part(raw: str) -> list[str]:
    match = re.match(r"(?P<left>.+?)(?:와|과)\s+(?P<right>.+)$", raw.strip())
    if not match:
        return [raw]
    left = match.group("left").strip()
    right = match.group("right").strip()
    if not left or not right:
        return [raw]
    if any(token in left for token in ["갑옷", "무기", "꾸러미", "보우"]) or any(
        token in right for token in ["방패", "볼트", "화살", "단검", "재블린"]
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
                "id": equipment_item_id(name),
                "nameKo": name,
                "quantityRaw": quantity,
                "kind": classify_equipment(name),
            }
        )
    return items


def parse_starting_equipment_choices(text: str, class_id: str) -> list[dict[str, object]]:
    choices: list[dict[str, object]] = []
    for index, raw in enumerate(parse_bullets_in_section(text, "시작 장비"), start=1):
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


def parse_spellcasting_progression(level_progression: list[dict[str, str]]) -> list[dict[str, object]]:
    progression: list[dict[str, object]] = []
    slot_columns = [str(level) for level in range(1, 10)]
    for row in level_progression:
        spell_slots = {
            column: value
            for column in slot_columns
            if (value := row.get(column)) not in {None, "-", ""}
        }
        payload: dict[str, object] = {}
        if row.get("레벨"):
            payload["classLevel"] = row["레벨"]
        if row.get("캔트립"):
            payload["cantripsKnown"] = row["캔트립"]
        if row.get("알고 있는 주문"):
            payload["spellsKnown"] = row["알고 있는 주문"]
        if row.get("주문 슬롯"):
            payload["pactMagicSlots"] = row["주문 슬롯"]
        if row.get("슬롯 레벨"):
            payload["pactMagicSlotLevel"] = row["슬롯 레벨"]
        if spell_slots:
            payload["spellSlotsByLevel"] = spell_slots
        if payload and any(key in payload for key in {"cantripsKnown", "spellsKnown", "pactMagicSlots", "spellSlotsByLevel"}):
            progression.append(payload)
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
                startingEquipment=parse_bullets_in_section(text, "시작 장비"),
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
                        )
                    else:
                        existing = indexed[item_id]
                        if class_option.id not in existing.sourceClassIds:
                            existing.sourceClassIds.append(class_option.id)
                        if name_ko not in existing.aliasesKo:
                            existing.aliasesKo.append(name_ko)
    return sorted(indexed.values(), key=lambda item: item.id)


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
]


def build_rule_fragments() -> list[RuleFragment]:
    source_files = {
        "spellcasting": TRANSLATED_ROOT / "rules" / "주문시전_규칙.md",
        "combat": TRANSLATED_ROOT / "rules" / "전투_기본_규칙.md",
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
                if not item.id or not item.nameKo or not item.kind or not item.sourceClassIds
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
