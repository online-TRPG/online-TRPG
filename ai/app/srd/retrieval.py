import json
from functools import lru_cache
from pathlib import Path

from app.srd.build import (
    GENERATED_ROOT,
    build_class_options,
    build_magic_items,
    build_monsters,
    build_race_options,
    build_rule_hook_fixtures,
    build_rule_cards,
    build_rule_fragments,
    build_spells,
    parse_conditions,
)
from app.srd.models import (
    ClassOption,
    Condition,
    MagicItem,
    Monster,
    RaceOption,
    RuleCard,
    RuleFragment,
    RuleHookFixture,
    Spell,
    SrdEntityMatch,
)


def normalize_lookup_text(value: str) -> str:
    return "".join(ch.casefold() for ch in value if ch.isalnum())


def load_spells(path: Path | None = None) -> list[Spell]:
    spell_path = path or GENERATED_ROOT / "spells.jsonl"
    if spell_path.exists():
        return [
            Spell.model_validate(json.loads(line))
            for line in spell_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_spells()


def load_conditions(path: Path | None = None) -> list[Condition]:
    condition_path = path or GENERATED_ROOT / "conditions.jsonl"
    if condition_path.exists():
        return [
            Condition.model_validate(json.loads(line))
            for line in condition_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return parse_conditions()


def load_magic_items(path: Path | None = None) -> list[MagicItem]:
    item_path = path or GENERATED_ROOT / "magic_items.jsonl"
    if item_path.exists():
        return [
            MagicItem.model_validate(json.loads(line))
            for line in item_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_magic_items()


def load_monsters(path: Path | None = None) -> list[Monster]:
    monster_path = path or GENERATED_ROOT / "monsters.jsonl"
    if monster_path.exists():
        return [
            Monster.model_validate(json.loads(line))
            for line in monster_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_monsters()


def load_races(path: Path | None = None) -> list[RaceOption]:
    race_path = path or GENERATED_ROOT / "races.jsonl"
    if race_path.exists():
        return [
            RaceOption.model_validate(json.loads(line))
            for line in race_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_race_options()


def load_classes(path: Path | None = None) -> list[ClassOption]:
    class_path = path or GENERATED_ROOT / "classes.jsonl"
    if class_path.exists():
        return [
            ClassOption.model_validate(json.loads(line))
            for line in class_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_class_options()


def load_rule_cards(path: Path | None = None) -> list[RuleCard]:
    rule_path = path or GENERATED_ROOT / "rules_cards.jsonl"
    if rule_path.exists():
        return [
            RuleCard.model_validate(json.loads(line))
            for line in rule_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_rule_cards()


def load_rule_fragments(path: Path | None = None) -> list[RuleFragment]:
    fragment_path = path or GENERATED_ROOT / "rule_fragments.jsonl"
    if fragment_path.exists():
        return [
            RuleFragment.model_validate(json.loads(line))
            for line in fragment_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    return build_rule_fragments()


def load_rule_hooks(path: Path | None = None) -> list[RuleHookFixture]:
    hooks_path = path or GENERATED_ROOT / "rules_hooks.json"
    if hooks_path.exists():
        payload = json.loads(hooks_path.read_text(encoding="utf-8"))
        return [RuleHookFixture.model_validate(item) for item in payload.get("hooks", [])]
    return build_rule_hook_fixtures()


@lru_cache
def get_spell_catalog() -> tuple[Spell, ...]:
    return tuple(load_spells())


@lru_cache
def get_condition_catalog() -> tuple[Condition, ...]:
    return tuple(load_conditions())


@lru_cache
def get_magic_item_catalog() -> tuple[MagicItem, ...]:
    return tuple(load_magic_items())


@lru_cache
def get_monster_catalog() -> tuple[Monster, ...]:
    return tuple(load_monsters())


@lru_cache
def get_race_catalog() -> tuple[RaceOption, ...]:
    return tuple(load_races())


@lru_cache
def get_class_catalog() -> tuple[ClassOption, ...]:
    return tuple(load_classes())


@lru_cache
def get_rule_card_catalog() -> tuple[RuleCard, ...]:
    return tuple(load_rule_cards())


@lru_cache
def get_rule_fragment_catalog() -> tuple[RuleFragment, ...]:
    return tuple(load_rule_fragments())


@lru_cache
def get_rule_hook_catalog() -> tuple[RuleHookFixture, ...]:
    return tuple(load_rule_hooks())


class SrdRetriever:
    def __init__(
        self,
        spells: list[Spell] | tuple[Spell, ...] | None = None,
        conditions: list[Condition] | tuple[Condition, ...] | None = None,
        magic_items: list[MagicItem] | tuple[MagicItem, ...] | None = None,
        monsters: list[Monster] | tuple[Monster, ...] | None = None,
        races: list[RaceOption] | tuple[RaceOption, ...] | None = None,
        classes: list[ClassOption] | tuple[ClassOption, ...] | None = None,
        rule_cards: list[RuleCard] | tuple[RuleCard, ...] | None = None,
        rule_fragments: list[RuleFragment] | tuple[RuleFragment, ...] | None = None,
        rule_hooks: list[RuleHookFixture] | tuple[RuleHookFixture, ...] | None = None,
    ):
        self._spells = tuple(spells) if spells is not None else get_spell_catalog()
        self._conditions = tuple(conditions) if conditions is not None else get_condition_catalog()
        self._magic_items = tuple(magic_items) if magic_items is not None else get_magic_item_catalog()
        self._monsters = tuple(monsters) if monsters is not None else get_monster_catalog()
        self._races = tuple(races) if races is not None else get_race_catalog()
        self._classes = tuple(classes) if classes is not None else get_class_catalog()
        self._rule_cards = tuple(rule_cards) if rule_cards is not None else get_rule_card_catalog()
        self._rule_fragments = (
            tuple(rule_fragments) if rule_fragments is not None else get_rule_fragment_catalog()
        )
        self._rule_hooks = tuple(rule_hooks) if rule_hooks is not None else get_rule_hook_catalog()
        self._rule_fragment_by_id = {fragment.id: fragment for fragment in self._rule_fragments}
        self._spell_terms: list[tuple[str, Spell]] = []
        for spell in self._spells:
            self._spell_terms.append((normalize_lookup_text(spell.nameEn), spell))
            self._spell_terms.append((normalize_lookup_text(spell.nameKo), spell))
        self._condition_terms: list[tuple[str, Condition]] = []
        for condition in self._conditions:
            self._condition_terms.append((normalize_lookup_text(condition.nameEn), condition))
            self._condition_terms.append((normalize_lookup_text(condition.nameKo), condition))
            for keyword in condition.summaryKo.split():
                normalized = normalize_lookup_text(keyword)
                if len(normalized) >= 3:
                    self._condition_terms.append((normalized, condition))
        self._magic_item_terms: list[tuple[str, MagicItem]] = []
        for item in self._magic_items:
            self._magic_item_terms.append((normalize_lookup_text(item.nameEn), item))
            self._magic_item_terms.append((normalize_lookup_text(item.nameKo), item))
        self._monster_terms: list[tuple[str, Monster]] = []
        for monster in self._monsters:
            self._monster_terms.append((normalize_lookup_text(monster.nameEn), monster))
            self._monster_terms.append((normalize_lookup_text(monster.nameKo), monster))
        self._race_terms: list[tuple[str, RaceOption]] = []
        for race in self._races:
            if race.nameEn:
                self._race_terms.append((normalize_lookup_text(race.nameEn), race))
            self._race_terms.append((normalize_lookup_text(race.nameKo), race))
        self._class_terms: list[tuple[str, ClassOption]] = []
        for class_option in self._classes:
            if class_option.nameEn:
                self._class_terms.append((normalize_lookup_text(class_option.nameEn), class_option))
            self._class_terms.append((normalize_lookup_text(class_option.nameKo), class_option))

    def find_spells(self, text: str, limit: int = 5) -> list[Spell]:
        haystack = normalize_lookup_text(text)
        matches: list[Spell] = []
        seen: set[str] = set()
        for term, spell in self._spell_terms:
            if term and term in haystack and spell.id not in seen:
                matches.append(spell)
                seen.add(spell.id)
            if len(matches) >= limit:
                break
        return matches

    def find_conditions(self, text: str, limit: int = 5) -> list[Condition]:
        haystack = normalize_lookup_text(text)
        matches: list[Condition] = []
        seen: set[str] = set()
        for term, condition in self._condition_terms:
            if term and term in haystack and condition.id not in seen:
                matches.append(condition)
                seen.add(condition.id)
            if len(matches) >= limit:
                break
        return matches

    def find_magic_items(self, text: str, limit: int = 5) -> list[MagicItem]:
        haystack = normalize_lookup_text(text)
        matches: list[MagicItem] = []
        seen: set[str] = set()
        for term, item in self._magic_item_terms:
            if term and term in haystack and item.id not in seen:
                matches.append(item)
                seen.add(item.id)
            if len(matches) >= limit:
                break
        return matches

    def find_monsters(self, text: str, limit: int = 5) -> list[Monster]:
        haystack = normalize_lookup_text(text)
        matches: list[Monster] = []
        seen: set[str] = set()
        for term, monster in self._monster_terms:
            if term and term in haystack and monster.id not in seen:
                matches.append(monster)
                seen.add(monster.id)
            if len(matches) >= limit:
                break
        return matches

    def find_races(self, text: str, limit: int = 5) -> list[RaceOption]:
        haystack = normalize_lookup_text(text)
        matches: list[RaceOption] = []
        seen: set[str] = set()
        for term, race in self._race_terms:
            if term and term in haystack and race.id not in seen:
                matches.append(race)
                seen.add(race.id)
            if len(matches) >= limit:
                break
        return matches

    def find_classes(self, text: str, limit: int = 5) -> list[ClassOption]:
        haystack = normalize_lookup_text(text)
        matches: list[ClassOption] = []
        seen: set[str] = set()
        for term, class_option in self._class_terms:
            if term and term in haystack and class_option.id not in seen:
                matches.append(class_option)
                seen.add(class_option.id)
            if len(matches) >= limit:
                break
        return matches

    def related_rule_cards_for_text(self, text: str, limit: int = 5) -> list[RuleCard]:
        haystack = normalize_lookup_text(text)
        scored: list[tuple[int, RuleCard]] = []
        for card in self._rule_cards:
            score = 0
            for term in {card.titleKo, card.domain}:
                normalized = normalize_lookup_text(term)
                if normalized and normalized in haystack:
                    score += 3
            for keyword in card.summaryKo.split()[:25]:
                normalized = normalize_lookup_text(keyword)
                if len(normalized) >= 3 and normalized in haystack:
                    score += 1
            if score:
                scored.append((score, card))
        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [card for _, card in scored[:limit]]

    def related_rule_fragments_for_text(
        self,
        text: str,
        spells: list[Spell] | tuple[Spell, ...] | None = None,
        limit: int = 6,
    ) -> list[RuleFragment]:
        matched_spells = list(spells) if spells is not None else self.find_spells(text=text, limit=3)
        selected_ids: list[str] = []
        for spell in matched_spells:
            selected_ids.extend(self._fragment_ids_for_spell(spell))

        haystack = normalize_lookup_text(text)
        if any(term in haystack for term in ["공격", "attack"]):
            selected_ids.append("rule.combat.attack_roll")
        if any(term in haystack for term in ["내성", "save", "savingthrow"]):
            selected_ids.append("rule.spellcasting.saving_throw")

        fragments: list[RuleFragment] = []
        seen: set[str] = set()
        for fragment_id in selected_ids:
            fragment = self._rule_fragment_by_id.get(fragment_id)
            if fragment and fragment.id not in seen:
                fragments.append(fragment)
                seen.add(fragment.id)
            if len(fragments) >= limit:
                break
        return fragments

    def related_rule_hooks_for_text(
        self,
        text: str,
        entities: list[SrdEntityMatch] | tuple[SrdEntityMatch, ...] | None = None,
        rule_fragments: list[RuleFragment] | tuple[RuleFragment, ...] | None = None,
        limit: int = 4,
    ) -> list[RuleHookFixture]:
        related_entities = list(entities) if entities is not None else self.related_entities_for_text(text=text)
        related_fragments = (
            list(rule_fragments)
            if rule_fragments is not None
            else self.related_rule_fragments_for_text(text=text)
        )
        entity_ids = {entity.id for entity in related_entities}
        rule_ids = {fragment.id for fragment in related_fragments}
        haystack = normalize_lookup_text(text)

        scored: list[tuple[int, RuleHookFixture]] = []
        for hook in self._rule_hooks:
            score = 0
            entity_match = set(hook.sourceEntityIds) & entity_ids
            if entity_match:
                score += 8
            if (
                hook.domain != "class_feature"
                and set(hook.sourceRuleIds) & rule_ids
                and (not hook.sourceEntityIds or entity_match)
            ):
                score += 6
            for term in {hook.domain, hook.titleKo, hook.engineFunction}:
                normalized = normalize_lookup_text(term)
                if normalized and normalized in haystack:
                    score += 3
            if hook.id == "hook.combat.resolve_attack_roll" and any(
                term in haystack for term in ["공격", "attack", "명중"]
            ):
                score += 2
            if hook.id == "hook.damage.apply_resistance_vulnerability" and any(
                term in haystack for term in ["피해", "저항", "취약", "면역", "damage", "resistance"]
            ):
                score += 2
            if hook.id == "hook.condition.apply_prone_modifiers" and any(
                term in haystack for term in ["넘어짐", "넘어진", "prone"]
            ):
                score += 2
            if hook.id == "hook.item.bag_of_holding_capacity" and any(
                term in haystack for term in ["보유의주머니", "bagofholding", "용량", "넣"]
            ):
                score += 2
            if hook.id == "hook.class.fighter.second_wind" and any(
                term in haystack for term in ["재기의숨결", "secondwind", "회복"]
            ):
                score += 4
            if hook.id == "hook.class.fighter.action_surge" and any(
                term in haystack for term in ["행동연쇄", "actionsurge", "추가행동"]
            ):
                score += 4
            if hook.id == "hook.class.fighter.champion_critical_threshold" and any(
                term in haystack for term in ["향상된치명타", "우월한치명타", "champion", "치명타", "critical"]
            ):
                score += 4
            if hook.id == "hook.class.barbarian.rage" and any(
                term in haystack for term in ["격노", "rage"]
            ):
                score += 4
            if hook.id == "hook.class.rogue.sneak_attack" and any(
                term in haystack for term in ["암습", "sneakattack"]
            ):
                score += 4
            if hook.id == "hook.class.rogue.cunning_action" and any(
                term in haystack for term in ["교활한행동", "cunningaction", "질주", "이탈", "숨기"]
            ):
                score += 4
            if hook.id == "hook.class.barbarian.frenzy" and any(
                term in haystack for term in ["광분", "frenzy"]
            ):
                score += 5
            if score:
                scored.append((score, hook))

        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [hook for _, hook in scored[:limit]]

    @staticmethod
    def _fragment_ids_for_spell(spell: Spell) -> list[str]:
        fragment_ids: list[str] = []
        casting_time = spell.castingTime.raw if spell.castingTime else ""
        if casting_time == "1 행동":
            fragment_ids.append("rule.spellcasting.casting_time.action")
        elif "추가 행동" in casting_time:
            fragment_ids.append("rule.spellcasting.casting_time.bonus_action")
        elif "반응" in casting_time:
            fragment_ids.append("rule.spellcasting.casting_time.reaction")
        elif casting_time:
            fragment_ids.append("rule.spellcasting.casting_time.long")

        spell_range = spell.range.raw if spell.range else ""
        if spell_range and spell_range != "자신":
            fragment_ids.append("rule.spellcasting.range")
        if spell.components is not None:
            fragment_ids.append("rule.spellcasting.components")
        if spell.level == 0:
            fragment_ids.append("rule.spellcasting.cantrip")
        if spell.concentration:
            fragment_ids.append("rule.spellcasting.concentration")

        play_reference = spell.playReference
        if "주문 공격" in play_reference:
            fragment_ids.append("rule.spellcasting.spell_attack")
            fragment_ids.append("rule.combat.attack_roll")
        if "내성 굴림" in play_reference:
            fragment_ids.append("rule.spellcasting.saving_throw")
        return fragment_ids

    def related_entities_for_text(self, text: str, limit: int = 5) -> list[SrdEntityMatch]:
        spell_matches = [
            SrdEntityMatch(
                id=spell.id,
                nameEn=spell.nameEn,
                nameKo=spell.nameKo,
                kind="spell",
                summaryKo=spell.playReference,
                source=spell.source,
            )
            for spell in self.find_spells(text=text, limit=limit)
        ]
        remaining = max(0, limit - len(spell_matches))
        item_matches = [
            SrdEntityMatch(
                id=item.id,
                nameEn=item.nameEn,
                nameKo=item.nameKo,
                kind="magic_item",
                summaryKo=item.playReference,
                source=item.source,
            )
            for item in self.find_magic_items(text=text, limit=remaining)
        ]
        remaining = max(0, remaining - len(item_matches))
        monster_matches = [
            SrdEntityMatch(
                id=monster.id,
                nameEn=monster.nameEn,
                nameKo=monster.nameKo,
                kind="monster",
                summaryKo=monster.playReference,
                source=monster.source,
            )
            for monster in self.find_monsters(text=text, limit=remaining)
        ]
        remaining = max(0, remaining - len(monster_matches))
        condition_matches = [
            SrdEntityMatch(
                id=condition.id,
                nameEn=condition.nameEn,
                nameKo=condition.nameKo,
                kind="condition",
                summaryKo=condition.summaryKo,
                source=condition.source,
            )
            for condition in self.find_conditions(text=text, limit=remaining)
        ]
        remaining = max(0, remaining - len(condition_matches))
        race_matches = [
            SrdEntityMatch(
                id=race.id,
                nameEn=race.nameEn or race.nameKo,
                nameKo=race.nameKo,
                kind="race",
                summaryKo=race.summaryKo,
                source=race.source,
            )
            for race in self.find_races(text=text, limit=remaining)
        ]
        remaining = max(0, remaining - len(race_matches))
        class_matches = [
            SrdEntityMatch(
                id=class_option.id,
                nameEn=class_option.nameEn or class_option.nameKo,
                nameKo=class_option.nameKo,
                kind="class",
                summaryKo=class_option.summaryKo,
                source=class_option.source,
            )
            for class_option in self.find_classes(text=text, limit=remaining)
        ]
        return spell_matches + item_matches + monster_matches + condition_matches + race_matches + class_matches
