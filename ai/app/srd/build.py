import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
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
    RulebookCollection,
    RulebookDocument,
    RulebookExport,
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
REPO_ROOT = AI_ROOT.parent
TRANSLATED_ROOT = AI_ROOT / "translated"
GENERATED_ROOT = AI_ROOT / "generated" / "srd"
ORIGINAL_RULEBOOK_PATH = REPO_ROOT / "doc" / "SRD-OGL_V5.1.md"

EXPECTED_COUNTS = {
    "spells": 319,
    "conditions": 15,
    "magic_items": 239,
    "monsters": 317,
    "classes": 12,
    "races": 9,
}

SRD_ATTRIBUTION = (
    'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") '
    "by Wizards of the Coast LLC and available at "
    "https://dnd.wizards.com/resources/systems-reference-document. "
    "The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International "
    "License available at https://creativecommons.org/licenses/by/4.0/legalcode."
)

RULEBOOK_CATEGORY_LABELS = {
    "rules": "기본 규칙",
    "races": "종족",
    "classes": "직업",
    "items": "장비/아이템",
    "spells": "주문",
    "monsters": "몬스터",
}

RULEBOOK_CATEGORY_ORDER = ["rules", "races", "classes", "items", "spells", "monsters"]

RULEBOOK_EXCLUDED_FILE_PATTERNS = [
    re.compile(r"^README\.md$", re.IGNORECASE),
    re.compile(r"검수_기준"),
    re.compile(r"translation-progress", re.IGNORECASE),
    re.compile(r"play-reference-progress", re.IGNORECASE),
    re.compile(r"item-translation-progress", re.IGNORECASE),
    re.compile(r"품질_전략"),
]

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


def create_rulebook_slug(relative_path: str) -> str:
    return hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:12]


def should_exclude_rulebook_document(relative_path: str) -> bool:
    return any(pattern.search(relative_path) for pattern in RULEBOOK_EXCLUDED_FILE_PATTERNS)


def extract_rulebook_title(content: str, relative_path: str) -> str:
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if line.startswith("# "):
            return line.removeprefix("# ").strip()
    return Path(relative_path).stem


def extract_rulebook_description(content: str) -> str | None:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    for line in lines:
        if line.startswith("# "):
            continue
        if line.startswith(">"):
            continue
        if line[:1] in {"|", "`", "-"}:
            continue
        return line
    return None


def resolve_rulebook_category_key(relative_path: str) -> str:
    return Path(relative_path).parts[0] if Path(relative_path).parts else "root"


def resolve_rulebook_category_order(category_key: str) -> int:
    try:
        return RULEBOOK_CATEGORY_ORDER.index(category_key)
    except ValueError:
        return len(RULEBOOK_CATEGORY_ORDER)


def format_rulebook_updated_at(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00",
        "Z",
    )


def strip_first_heading(content: str) -> str:
    lines = content.splitlines()
    for index, line in enumerate(lines):
        if line.strip().startswith("# "):
            return "\n".join(lines[:index] + lines[index + 1 :]).lstrip("\n")
    return content


def shift_markdown_headings(content: str, delta: int) -> str:
    if delta <= 0:
        return content

    def repl(match: re.Match[str]) -> str:
        level = min(6, len(match.group(1)) + delta)
        return "#" * level + match.group(2)

    return re.sub(r"^(#{1,6})(\s+)", repl, content, flags=re.MULTILINE)


def load_original_rulebook_text() -> str:
    return ORIGINAL_RULEBOOK_PATH.read_text(encoding="utf-8").lstrip("\ufeff")


def extract_original_legal_section(content: str) -> str:
    marker = "\n**Races**"
    if marker in content:
        return content.split(marker, 1)[0].strip()
    return content.strip()


def build_merged_rulebook_content() -> tuple[str, str]:
    category_buckets: dict[str, list[tuple[str, str]]] = {
        category_key: [] for category_key in RULEBOOK_CATEGORY_ORDER
    }
    max_updated_at = ""

    for path in sorted(TRANSLATED_ROOT.rglob("*.md")):
        relative_path = path.relative_to(TRANSLATED_ROOT).as_posix()
        if should_exclude_rulebook_document(relative_path):
            continue

        category_key = resolve_rulebook_category_key(relative_path)
        if category_key not in category_buckets:
            category_buckets[category_key] = []

        content = path.read_text(encoding="utf-8").lstrip("\ufeff")
        title = extract_rulebook_title(content, relative_path)
        body = shift_markdown_headings(strip_first_heading(content).strip(), 2)
        category_buckets[category_key].append((title, body))
        max_updated_at = max(max_updated_at, format_rulebook_updated_at(path))

    parts = [
        "# 룰북",
        "",
        "번역된 SRD 룰북 전체를 한 문서로 묶은 통합본입니다.",
        "",
    ]

    ordered_category_keys = list(RULEBOOK_CATEGORY_ORDER) + [
        category_key for category_key in category_buckets.keys() if category_key not in RULEBOOK_CATEGORY_ORDER
    ]

    for category_key in ordered_category_keys:
        documents = category_buckets.get(category_key, [])
        if not documents:
            continue

        parts.append(f"## {RULEBOOK_CATEGORY_LABELS.get(category_key, category_key)}")
        parts.append("")

        for title, body in sorted(documents, key=lambda item: item[0].casefold()):
            parts.append(f"### {title}")
            parts.append("")
            if body:
                parts.append(body)
                parts.append("")

    return "\n".join(parts).strip() + "\n", max_updated_at


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
        "trigger": "action.type == MAP_CAST_SPELL and action.spellId == spell.chill_touch",
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
        "trigger": "action.type == MAP_USE_CLASS_FEATURE and action.featureId == class.fighter.feature.재기의_숨결",
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
        "trigger": "action.type == MAP_USE_CLASS_FEATURE and action.featureId == class.fighter.feature.행동_연쇄",
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
        "id": "hook.class.barbarian.rage",
        "domain": "class_feature",
        "titleKo": "바바리안 격노",
        "engineFunction": "apply_rage",
        "trigger": "action.type == MAP_USE_CLASS_FEATURE and action.featureId == class.barbarian.feature.격노",
        "consumes": [
            "barbarianLevel",
            "bonusActionAvailable",
            "rageAvailableUses",
            "armorCategory",
            "strengthAttackDamagePacket",
            "currentConcentrationState",
        ],
        "produces": [
            "rageActive",
            "rageExpended",
            "bonusActionSpent",
            "strengthCheckAdvantage",
            "strengthSaveAdvantage",
            "rageDamageBonus",
            "bludgeoningResistance",
            "piercingResistance",
            "slashingResistance",
            "concentrationEnded",
        ],
        "sourceRuleIds": ["rule.damage.저항과_취약"],
        "sourceEntityIds": ["class.barbarian.feature.격노"],
        "acceptanceChecks": [
            "feature use requires an available bonus action and an available rage use",
            "rage benefits do not apply while wearing heavy armor",
            "rage grants advantage on Strength checks and Strength saving throws",
            "melee weapon damage using Strength gains the barbarian rage damage bonus",
            "rage grants resistance to bludgeoning, piercing, and slashing damage",
            "rage prevents spellcasting and concentration while active",
            "AI may identify rage but must not apply resistance, bonus damage, or concentration state directly",
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
        "trigger": "action.type == MAP_USE_CLASS_FEATURE and action.featureId == class.rogue.feature.교활한_행동",
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
    {
        "id": "hook.class.barbarian.frenzy",
        "domain": "class_feature",
        "titleKo": "바바리안 광분",
        "engineFunction": "apply_frenzy",
        "trigger": "action.type == MAP_USE_CLASS_FEATURE and action.featureId == class.barbarian.subclass_feature.광분",
        "consumes": ["rageActivationAccepted", "bonusActionAvailableOnFollowingTurns", "frenzyDeclared", "exhaustionState"],
        "produces": ["frenzyActive", "bonusActionMeleeAttackAvailable", "exhaustionIncreaseOnRageEnd"],
        "sourceRuleIds": [],
        "sourceEntityIds": ["class.barbarian.subclass_feature.광분"],
        "acceptanceChecks": [
            "frenzy can be declared only when entering rage",
            "while frenzy is active, each turn after activation can grant one bonus action melee weapon attack",
            "frenzy exhaustion increases by 1 when rage ends",
            "the bonus action attack still requires the engine to validate weapon attack rules",
            "AI may identify frenzy but must not grant attacks or apply exhaustion directly",
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
    "hook.damage.apply_resistance_vulnerability",
    "hook.condition.apply_prone_modifiers",
    "hook.spell.cast_chill_touch",
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
                    "type": "MAP_ATTACK",
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
                    "type": "MAP_ATTACK",
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
                    "type": "MAP_MOVE",
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
                    "type": "MAP_CAST_SPELL",
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
                        "type": "MAP_ATTACK",
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
                        "type": "MAP_ATTACK",
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
                        "type": "MAP_CAST_SPELL",
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
                    "actorCharacterId": "cleric-1",
                    "targetId": "skeleton-1",
                    "input": {
                        "baseDamage": 8,
                        "damageType": "bludgeoning",
                        "targetImmunities": [],
                        "targetResistances": [],
                        "targetVulnerabilities": ["bludgeoning"],
                    },
                    "sourceAction": {
                        "type": "MAP_ATTACK",
                        "actorCharacterId": "cleric-1",
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
                        "type": "MAP_ATTACK",
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
                        "type": "MAP_MOVE",
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
                        "type": "MAP_CAST_SPELL",
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
                        "type": "MAP_CAST_SPELL",
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
                    "type": "MAP_CAST_SPELL",
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
                        "type": "MAP_CAST_SPELL",
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
                        "type": "MAP_CAST_SPELL",
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
                        "type": "MAP_CAST_SPELL",
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
                    "type": "MAP_ATTACK",
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
                        "type": "MAP_ATTACK",
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
                        "type": "MAP_ATTACK",
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
                    "type": "MAP_ATTACK",
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
                        "type": "MAP_ATTACK",
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
                        "type": "MAP_ATTACK",
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
                    "type": "MAP_CAST_SPELL",
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
                    "type": "MAP_ATTACK",
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
                    "type": "MAP_ATTACK",
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


def build_rulebook_export() -> RulebookExport:
    merged_rulebook_content, merged_rulebook_updated_at = build_merged_rulebook_content()
    original_rulebook_content = load_original_rulebook_text()
    legal_content = extract_original_legal_section(original_rulebook_content)

    documents = [
        RulebookDocument(
            slug="rulebook",
            title="룰북",
            description="번역된 SRD 룰북 통합본입니다.",
            category="번역본",
            updatedAt=merged_rulebook_updated_at,
            content=merged_rulebook_content,
        ),
        RulebookDocument(
            slug="copyright",
            title="저작권",
            description="SRD 5.1 라이선스와 저작권 고지입니다.",
            category="법적 정보",
            updatedAt=format_rulebook_updated_at(ORIGINAL_RULEBOOK_PATH),
            content="\n".join(
                [
                    "# 저작권",
                    "",
                    "## SRD 5.1 출처",
                    "",
                    SRD_ATTRIBUTION,
                    "",
                    "## 법적 고지 원문",
                    "",
                    legal_content,
                ]
            ).strip()
            + "\n",
        ),
        RulebookDocument(
            slug="original",
            title="원문",
            description="영문 SRD 원문 전체입니다.",
            category="원문",
            updatedAt=format_rulebook_updated_at(ORIGINAL_RULEBOOK_PATH),
            content="# 원문\n\n" + original_rulebook_content.strip() + "\n",
        ),
    ]

    return RulebookExport(
        rulebooks=[
            RulebookCollection(
                ruleSetId="dnd5e",
                title="D&D 5e SRD 룰북",
                description="룰북, 저작권, 원문 세 문서로 구성된 SRD 위키입니다.",
                attribution=SRD_ATTRIBUTION,
                defaultDocumentSlug=documents[0].slug,
                documents=documents,
            )
        ]
    )


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


def build_rulebook_only(output_dir: Path = GENERATED_ROOT) -> dict[str, int]:
    rulebook_export = build_rulebook_export()
    write_json(output_dir / "rulebook.json", rulebook_export.model_dump())
    return {
        "rulebooks": len(rulebook_export.rulebooks),
        "rulebook_documents": sum(len(rulebook.documents) for rulebook in rulebook_export.rulebooks),
    }


def build(output_dir: Path = GENERATED_ROOT) -> dict[str, int]:
    manifest = build_source_manifest()
    rulebook_export = build_rulebook_export()
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
    write_json(output_dir / "rulebook.json", rulebook_export.model_dump())
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
        "rulebook_documents": sum(len(rulebook.documents) for rulebook in rulebook_export.rulebooks),
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
    parser.add_argument("--rulebook-only", action="store_true")
    args = parser.parse_args()
    result = build_rulebook_only(args.output_dir) if args.rulebook_only else build(args.output_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
