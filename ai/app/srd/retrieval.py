import json
import logging
import time
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Generic, TypeVar

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


logger = logging.getLogger(__name__)
T = TypeVar("T")


def _lookup_grams(value: str) -> set[str]:
    grams: set[str] = set()
    if len(value) >= 2:
        grams.update(f"2:{value[index:index + 2]}" for index in range(len(value) - 1))
    if len(value) >= 3:
        grams.update(f"3:{value[index:index + 3]}" for index in range(len(value) - 2))
    return grams


class _SubstringIndex(Generic[T]):
    def __init__(self, terms: list[tuple[str, T]]):
        self.terms = tuple((term, value) for term, value in terms if term)
        exact: dict[str, list[int]] = defaultdict(list)
        postings: dict[str, list[int]] = defaultdict(list)
        short_indexes: list[int] = []

        for index, (term, _) in enumerate(self.terms):
            exact[term].append(index)
            grams = _lookup_grams(term)
            if not grams:
                short_indexes.append(index)
                continue
            gram_size = 3 if len(term) >= 3 else 2
            for gram in grams:
                if gram.startswith(f"{gram_size}:"):
                    postings[gram].append(index)

        self.exact = {term: tuple(indexes) for term, indexes in exact.items()}
        self.postings = {gram: tuple(indexes) for gram, indexes in postings.items()}
        self.short_indexes = tuple(short_indexes)

    def candidate_term_indexes(self, haystack: str) -> list[int]:
        candidates = set(self.exact.get(haystack, ()))
        candidates.update(self.short_indexes)
        for gram in _lookup_grams(haystack):
            candidates.update(self.postings.get(gram, ()))
        return sorted(candidates)

    def matching_values(self, haystack: str) -> list[T]:
        return [
            value
            for index in self.candidate_term_indexes(haystack)
            for term, value in [self.terms[index]]
            if term in haystack
        ]

    def stats(self) -> dict[str, int]:
        posting_count = sum(len(indexes) for indexes in self.postings.values())
        estimated_bytes = (
            sum(len(term.encode("utf-8")) + 16 for term, _ in self.terms)
            + sum(len(gram.encode("utf-8")) + len(indexes) * 8 + 32 for gram, indexes in self.postings.items())
            + sum(len(term.encode("utf-8")) + len(indexes) * 8 + 32 for term, indexes in self.exact.items())
        )
        return {
            "term_count": len(self.terms),
            "alias_count": len(self.exact),
            "ngram_key_count": len(self.postings),
            "posting_count": posting_count,
            "estimated_bytes": estimated_bytes,
        }


_HOOK_SPECIAL_TERMS: dict[str, tuple[int, tuple[str, ...]]] = {
    "hook.combat.resolve_attack_roll": (2, ("공격", "attack", "명중")),
    "hook.damage.apply_resistance_vulnerability": (
        2,
        ("피해", "저항", "취약", "면역", "damage", "resistance"),
    ),
    "hook.condition.apply_prone_modifiers": (2, ("넘어짐", "넘어진", "prone")),
    "hook.item.bag_of_holding_capacity": (2, ("보유의주머니", "bagofholding", "용량", "넣")),
    "hook.class.fighter.second_wind": (4, ("재기의숨결", "secondwind", "회복")),
    "hook.class.fighter.action_surge": (4, ("행동연쇄", "actionsurge", "추가행동")),
    "hook.class.fighter.champion_critical_threshold": (
        4,
        ("향상된치명타", "우월한치명타", "champion", "치명타", "critical"),
    ),
    "hook.class.barbarian.rage": (4, ("격노", "rage")),
    "hook.class.rogue.sneak_attack": (4, ("암습", "sneakattack")),
    "hook.class.rogue.cunning_action": (
        4,
        ("교활한행동", "cunningaction", "질주", "이탈", "숨기"),
    ),
    "hook.class.barbarian.frenzy": (5, ("광분", "frenzy")),
}


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
        index_started_at = time.perf_counter()

        spell_terms: list[tuple[str, Spell]] = []
        for spell in self._spells:
            spell_terms.append((normalize_lookup_text(spell.nameEn), spell))
            spell_terms.append((normalize_lookup_text(spell.nameKo), spell))
        condition_terms: list[tuple[str, Condition]] = []
        for condition in self._conditions:
            condition_terms.append((normalize_lookup_text(condition.nameEn), condition))
            condition_terms.append((normalize_lookup_text(condition.nameKo), condition))
            for keyword in condition.summaryKo.split():
                normalized = normalize_lookup_text(keyword)
                if len(normalized) >= 3:
                    condition_terms.append((normalized, condition))
        magic_item_terms: list[tuple[str, MagicItem]] = []
        for item in self._magic_items:
            magic_item_terms.append((normalize_lookup_text(item.nameEn), item))
            magic_item_terms.append((normalize_lookup_text(item.nameKo), item))
        monster_terms: list[tuple[str, Monster]] = []
        for monster in self._monsters:
            monster_terms.append((normalize_lookup_text(monster.nameEn), monster))
            monster_terms.append((normalize_lookup_text(monster.nameKo), monster))
        race_terms: list[tuple[str, RaceOption]] = []
        for race in self._races:
            if race.nameEn:
                race_terms.append((normalize_lookup_text(race.nameEn), race))
            race_terms.append((normalize_lookup_text(race.nameKo), race))
        class_terms: list[tuple[str, ClassOption]] = []
        for class_option in self._classes:
            if class_option.nameEn:
                class_terms.append((normalize_lookup_text(class_option.nameEn), class_option))
            class_terms.append((normalize_lookup_text(class_option.nameKo), class_option))

        self._spell_index = _SubstringIndex(spell_terms)
        self._condition_index = _SubstringIndex(condition_terms)
        self._magic_item_index = _SubstringIndex(magic_item_terms)
        self._monster_index = _SubstringIndex(monster_terms)
        self._race_index = _SubstringIndex(race_terms)
        self._class_index = _SubstringIndex(class_terms)

        self._rule_card_score_terms: tuple[tuple[tuple[str, int], ...], ...] = tuple(
            tuple(
                [
                    (normalized, 3)
                    for term in {card.titleKo, card.domain}
                    for normalized in [normalize_lookup_text(term)]
                    if normalized
                ]
                + [
                    (normalized, 1)
                    for keyword in card.summaryKo.split()[:25]
                    for normalized in [normalize_lookup_text(keyword)]
                    if len(normalized) >= 3
                ]
            )
            for card in self._rule_cards
        )
        self._rule_card_text_index = _SubstringIndex(
            [
                (term, card_index)
                for card_index, terms in enumerate(self._rule_card_score_terms)
                for term, _ in terms
            ]
        )

        self._rule_hook_source_entity_ids = tuple(
            frozenset(hook.sourceEntityIds) for hook in self._rule_hooks
        )
        self._rule_hook_source_rule_ids = tuple(
            frozenset(hook.sourceRuleIds) for hook in self._rule_hooks
        )
        hook_entity_indexes: dict[str, set[int]] = defaultdict(set)
        hook_rule_indexes: dict[str, set[int]] = defaultdict(set)
        hook_text_terms: list[tuple[str, int]] = []
        self._rule_hook_generic_terms: list[tuple[str, ...]] = []
        self._rule_hook_special_terms: list[tuple[int, tuple[str, ...]] | None] = []
        for hook_index, hook in enumerate(self._rule_hooks):
            for entity_id in hook.sourceEntityIds:
                hook_entity_indexes[entity_id].add(hook_index)
            for rule_id in hook.sourceRuleIds:
                hook_rule_indexes[rule_id].add(hook_index)

            generic_terms = tuple(
                normalized
                for term in {hook.domain, hook.titleKo, hook.engineFunction}
                for normalized in [normalize_lookup_text(term)]
                if normalized
            )
            special = _HOOK_SPECIAL_TERMS.get(hook.id)
            normalized_special = (
                (special[0], tuple(normalize_lookup_text(term) for term in special[1]))
                if special
                else None
            )
            self._rule_hook_generic_terms.append(generic_terms)
            self._rule_hook_special_terms.append(normalized_special)
            hook_text_terms.extend((term, hook_index) for term in generic_terms)
            if normalized_special:
                hook_text_terms.extend((term, hook_index) for term in normalized_special[1])

        self._rule_hook_entity_index = {
            entity_id: frozenset(indexes) for entity_id, indexes in hook_entity_indexes.items()
        }
        self._rule_hook_rule_index = {
            rule_id: frozenset(indexes) for rule_id, indexes in hook_rule_indexes.items()
        }
        self._rule_hook_text_index = _SubstringIndex(hook_text_terms)

        indexes = (
            self._spell_index,
            self._condition_index,
            self._magic_item_index,
            self._monster_index,
            self._race_index,
            self._class_index,
            self._rule_card_text_index,
            self._rule_hook_text_index,
        )
        index_parts = [index.stats() for index in indexes]
        self.index_stats = {
            "build_duration_ms": round((time.perf_counter() - index_started_at) * 1000, 3),
            "entity_count": sum(
                len(catalog)
                for catalog in (
                    self._spells,
                    self._conditions,
                    self._magic_items,
                    self._monsters,
                    self._races,
                    self._classes,
                    self._rule_cards,
                    self._rule_hooks,
                )
            ),
            "term_count": sum(part["term_count"] for part in index_parts),
            "alias_count": sum(part["alias_count"] for part in index_parts),
            "ngram_key_count": sum(part["ngram_key_count"] for part in index_parts),
            "posting_count": sum(part["posting_count"] for part in index_parts),
            "estimated_bytes": sum(part["estimated_bytes"] for part in index_parts),
        }
        logger.info("srd_retriever_index_built %s", self.index_stats)

    def find_spells(self, text: str, limit: int = 5) -> list[Spell]:
        return self._find_indexed_entities(self._spell_index, text, limit)

    def find_conditions(self, text: str, limit: int = 5) -> list[Condition]:
        return self._find_indexed_entities(self._condition_index, text, limit)

    def find_magic_items(self, text: str, limit: int = 5) -> list[MagicItem]:
        return self._find_indexed_entities(self._magic_item_index, text, limit)

    def find_monsters(self, text: str, limit: int = 5) -> list[Monster]:
        return self._find_indexed_entities(self._monster_index, text, limit)

    def find_races(self, text: str, limit: int = 5) -> list[RaceOption]:
        return self._find_indexed_entities(self._race_index, text, limit)

    def find_classes(self, text: str, limit: int = 5) -> list[ClassOption]:
        return self._find_indexed_entities(self._class_index, text, limit)

    def related_rule_cards_for_text(self, text: str, limit: int = 5) -> list[RuleCard]:
        haystack = normalize_lookup_text(text)
        scored: list[tuple[int, RuleCard]] = []
        candidate_indexes = set(self._rule_card_text_index.matching_values(haystack))
        for card_index in candidate_indexes:
            card = self._rule_cards[card_index]
            score = sum(
                weight
                for term, weight in self._rule_card_score_terms[card_index]
                if term in haystack
            )
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

        candidate_indexes = set(self._rule_hook_text_index.matching_values(haystack))
        for entity_id in entity_ids:
            candidate_indexes.update(self._rule_hook_entity_index.get(entity_id, ()))
        for rule_id in rule_ids:
            candidate_indexes.update(self._rule_hook_rule_index.get(rule_id, ()))

        scored: list[tuple[int, RuleHookFixture]] = []
        for hook_index in candidate_indexes:
            hook = self._rule_hooks[hook_index]
            score = 0
            entity_match = self._rule_hook_source_entity_ids[hook_index] & entity_ids
            if entity_match:
                score += 8
            if (
                hook.domain != "class_feature"
                and self._rule_hook_source_rule_ids[hook_index] & rule_ids
                and (not hook.sourceEntityIds or entity_match)
            ):
                score += 6
            for normalized in self._rule_hook_generic_terms[hook_index]:
                if normalized in haystack:
                    score += 3
            special = self._rule_hook_special_terms[hook_index]
            if special and any(term in haystack for term in special[1]):
                score += special[0]
            if score:
                scored.append((score, hook))

        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [hook for _, hook in scored[:limit]]

    @staticmethod
    def _find_indexed_entities(
        index: _SubstringIndex[T],
        text: str,
        limit: int,
    ) -> list[T]:
        if limit <= 0:
            return []

        haystack = normalize_lookup_text(text)
        matches: list[T] = []
        seen: set[str] = set()
        for entity in index.matching_values(haystack):
            entity_id = str(getattr(entity, "id"))
            if entity_id in seen:
                continue
            matches.append(entity)
            seen.add(entity_id)
            if len(matches) >= limit:
                break
        return matches

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
