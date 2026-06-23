import { Injectable } from "@nestjs/common";
import {
  RuleCatalogClassFeatureSnapshot,
  RuleCatalogCharacterFeatureSnapshot,
  RuleCatalogEntry,
  RuleCost,
  RuleRuntimeEffect,
  RuleTargeting,
} from "./rule-catalog.types";
import { P3_SPELL_DEFINITIONS } from "./p3-spell-definitions";
import { P3_MONSTER_ABILITY_DEFINITIONS } from "./p3-monster-definitions";
import { P4_SPELL_DEFINITIONS } from "./p4-spell-definitions";
import { P4_MONSTER_ABILITY_DEFINITIONS } from "./p4-monster-definitions";

type ClassFeatureSeed = {
  id: string;
  classKey: string;
  level: number;
  trigger?: RuleCatalogEntry["trigger"];
  cost?: RuleCost;
  targeting?: RuleTargeting;
  runtimeEffect: RuleRuntimeEffect;
};

const NO_COST: RuleCost = { type: "none" };
const NO_TARGETING: RuleTargeting = { type: "none" };
const SELF_TARGETING: RuleTargeting = { type: "self" };

const RACE_PARENT_KEYS: Record<string, string> = {
  "high-elf": "elf",
  "hill-dwarf": "dwarf",
  "lightfoot-halfling": "halfling",
  "rock-gnome": "gnome",
};

const DRACONIC_ANCESTRY_DAMAGE_TYPES: Record<string, string> = {
  black: "acid",
  blue: "lightning",
  brass: "fire",
  bronze: "lightning",
  copper: "acid",
  gold: "fire",
  green: "poison",
  red: "fire",
  silver: "cold",
  white: "cold",
};

const RACE_TRAIT_DEFINITIONS: RuleCatalogEntry[] = [
  raceTrait("human", "ability_score_increase", [
    "fixed:ability:str:+1",
    "fixed:ability:dex:+1",
    "fixed:ability:con:+1",
    "fixed:ability:int:+1",
    "fixed:ability:wis:+1",
    "fixed:ability:cha:+1",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
  ]),

  raceTrait("elf", "base_traits", [
    "fixed:ability:dex:+2",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
    "language:elvish",
    "vision:darkvision:60",
    "proficiency:perception",
    "advantage:save:charmed",
    "immunity:sleep_magic",
    "rest:trance",
  ]),
  raceTrait("high-elf", "subrace_traits", [
    "fixed:ability:int:+1",
    "proficiency:weapon:longsword",
    "proficiency:weapon:shortsword",
    "proficiency:weapon:shortbow",
    "proficiency:weapon:longbow",
    "spellcasting:cantrip:wizard",
    "language:choice:one",
  ]),

  raceTrait("dwarf", "base_traits", [
    "fixed:ability:con:+2",
    "fixed:size:medium",
    "fixed:speed:25",
    "language:common",
    "language:dwarvish",
    "vision:darkvision:60",
    "resistance:poison",
    "advantage:save:poison",
    "proficiency:tool:dwarven",
    "proficiency:weapon:battleaxe",
    "proficiency:weapon:handaxe",
    "proficiency:weapon:light_hammer",
    "proficiency:weapon:warhammer",
    "skill:stonecunning",
  ]),
  raceTrait("hill-dwarf", "subrace_traits", [
    "fixed:ability:wis:+1",
    "hp_bonus:per_level:+1",
  ]),

  raceTrait("gnome", "base_traits", [
    "fixed:ability:int:+2",
    "fixed:size:small",
    "fixed:speed:25",
    "language:common",
    "language:gnomish",
    "vision:darkvision:60",
    "advantage:save:int_magic",
    "advantage:save:wis_magic",
    "advantage:save:cha_magic",
  ]),
  raceTrait("rock-gnome", "subrace_traits", [
    "fixed:ability:con:+1",
    "proficiency:artisans_tools:tinker",
    "skill:artificers_lore",
    "action:tinker_device",
  ]),

  raceTrait("half-elf", "base_traits", [
    "fixed:ability:cha:+2",
    "fixed:ability:choice_two:+1",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
    "language:elvish",
    "language:choice:one",
    "vision:darkvision:60",
    "advantage:save:charmed",
    "immunity:sleep_magic",
    "proficiency:skill:choice_two",
  ]),

  raceTrait("half-orc", "base_traits", [
    "fixed:ability:str:+2",
    "fixed:ability:con:+1",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
    "language:orc",
    "vision:darkvision:60",
    "proficiency:intimidation",
    "feature:relentless_endurance",
    "feature:savage_attacks",
  ]),

  raceTrait("halfling", "base_traits", [
    "fixed:ability:dex:+2",
    "fixed:size:small",
    "fixed:speed:25",
    "language:common",
    "language:halfling",
    "reroll:d20:natural_1",
    "advantage:save:frightened",
    "movement:through_larger_creature_space",
  ]),
  raceTrait("lightfoot-halfling", "subrace_traits", [
    "fixed:ability:cha:+1",
    "hide:behind_larger_creature",
  ]),

  raceTrait(
    "dragonborn",
    "base_traits",
    [
      "fixed:ability:str:+2",
      "fixed:ability:cha:+1",
      "fixed:size:medium",
      "fixed:speed:30",
      "language:common",
      "language:draconic",
      "selection:draconic_ancestry",
      "action:breath_weapon",
      "resistance:ancestry_damage_type",
    ],
    {
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "area", shape: "cone", sizeFt: 15 },
      save: { ability: "dex", dcSource: "class_feature_dc" },
      damage: { dice: "2d6", type: "ancestry", scaling: "character_level" },
      scaling: {
        mode: "character_level",
        table: { "1": "2d6", "6": "3d6", "11": "4d6", "16": "5d6" },
      },
    },
  ),

  raceTrait("tiefling", "base_traits", [
    "fixed:ability:int:+1",
    "fixed:ability:cha:+2",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
    "language:infernal",
    "vision:darkvision:60",
    "resistance:fire",
    "spellcasting:infernal_legacy",
  ]),
];

const SUBCLASS_FEATURE_DEFINITIONS: RuleCatalogEntry[] = [
  subclassFeature("barbarian", "berserker", 3, "frenzy", {
    type: "subclass_feature",
    tags: [
      "legacy_feature_id:class.barbarian.subclass_feature.frenzy",
      "rage:enhancement",
      "action:bonus_attack",
      "cost:exhaustion_after_rage",
    ],
  }, { type: "bonus_action" }, SELF_TARGETING),
  subclassFeature("barbarian", "berserker", 6, "mindless_rage", {
    type: "subclass_feature",
    tags: [
      "rage:immunity:charmed",
      "rage:immunity:frightened",
      "rage:suppress_existing:charmed",
      "rage:suppress_existing:frightened",
    ],
    hookId: "hook.subclass.berserker.mindless_rage",
  }),
  subclassFeature("barbarian", "berserker", 10, "intimidating_presence", {
    type: "subclass_feature",
    tags: ["action:standard", "save:wis", "condition:frightened", "duration:until_end_next_turn"],
    hookId: "hook.subclass.berserker.intimidating_presence",
  }, { type: "action" }, { type: "creature", rangeFt: 30 }),
  subclassFeature("bard", "lore", 3, "bonus_proficiencies", {
    type: "subclass_feature",
    tags: ["proficiency:skill:choice_three"],
  }),
  subclassFeature("bard", "lore", 3, "cutting_words", {
    type: "subclass_feature",
    tags: ["action:reaction", "resource:bardic_inspiration", "debuff:attack_check_damage_roll"],
    resourceId: "resource.bard.bardic_inspiration",
  }, { type: "reaction" }, { type: "creature", rangeFt: 60 }),
  subclassFeature("bard", "lore", 6, "additional_magical_secrets", {
    type: "subclass_feature",
    tags: ["spellcasting:magical_secrets", "spell_selection:any_class:2"],
    hookId: "hook.subclass.lore.additional_magical_secrets",
  }),
  subclassFeature("cleric", "life", 1, "bonus_proficiency", {
    type: "subclass_feature",
    tags: ["proficiency:armor:heavy"],
  }),
  subclassFeature("cleric", "life", 1, "disciple_of_life", {
    type: "subclass_feature",
    tags: ["healing_bonus:spell_level_plus_two"],
  }),
  subclassFeature("cleric", "life", 2, "preserve_life", {
    type: "subclass_feature",
    tags: ["channel_divinity", "action:standard", "healing_pool:five_times_cleric_level"],
  }),
  subclassFeature("cleric", "life", 6, "blessed_healer", {
    type: "subclass_feature",
    tags: ["trigger:heal_other_with_spell", "self_healing:spell_level_plus_two"],
    hookId: "hook.subclass.life.blessed_healer",
  }),
  subclassFeature("cleric", "life", 8, "divine_strike", {
    type: "subclass_feature",
    tags: ["trigger:once_per_turn_weapon_hit", "damage:extra:1d8", "damage:radiant"],
    hookId: "hook.subclass.life.divine_strike",
  }),
  subclassFeature("cleric", "life", 9, "domain_spells_level_9", {
    type: "subclass_feature",
    tags: ["spellcasting:domain_spells", "spell_level:5", "spell:mass_cure_wounds", "spell:raise_dead"],
  }),
  subclassFeature("druid", "land", 2, "bonus_cantrip", {
    type: "subclass_feature",
    tags: ["spellcasting:cantrip:druid:choice_one"],
  }),
  subclassFeature("druid", "land", 2, "natural_recovery", {
    type: "subclass_feature",
    tags: ["rest:short", "recover:spell_slots:half_druid_level"],
  }),
  subclassFeature("druid", "land", 3, "circle_spells_level_3", {
    type: "subclass_feature",
    tags: ["spellcasting:circle_spells", "spell_level:2"],
  }),
  subclassFeature("druid", "land", 5, "circle_spells_level_5", {
    type: "subclass_feature",
    tags: ["spellcasting:circle_spells", "spell_level:3"],
  }),
  subclassFeature("druid", "land", 6, "lands_stride", {
    type: "subclass_feature",
    tags: [
      "movement:ignore_nonmagical_difficult_terrain",
      "movement:ignore_nonmagical_plants",
      "advantage:save:magical_plants",
    ],
    hookId: "hook.subclass.land.lands_stride",
  }),
  subclassFeature("druid", "land", 9, "circle_spells_level_9", {
    type: "subclass_feature",
    tags: ["spellcasting:circle_spells", "spell_level:5"],
  }),
  subclassFeature("druid", "land", 10, "natures_ward", {
    type: "subclass_feature",
    tags: ["immunity:poisoned", "immunity:disease", "immunity:charmed_frightened_by_elemental_fey"],
    hookId: "hook.subclass.land.natures_ward",
  }),
  subclassFeature("fighter", "champion", 3, "improved_critical", {
    type: "subclass_feature",
    tags: [
      "legacy_feature_id:class.fighter.subclass_feature.improved_critical",
      "critical_range:19_20",
      "attack:weapon",
    ],
  }),
  subclassFeature("fighter", "champion", 7, "remarkable_athlete", {
    type: "subclass_feature",
    tags: [
      "ability_check:half_proficiency:untrained:str",
      "ability_check:half_proficiency:untrained:dex",
      "ability_check:half_proficiency:untrained:con",
      "jump:running_long_bonus:str_mod",
    ],
    hookId: "hook.subclass.champion.remarkable_athlete",
  }),
  subclassFeature("fighter", "champion", 10, "additional_fighting_style", {
    type: "subclass_feature",
    tags: ["selection:fighting_style:additional"],
  }),
  subclassFeature("monk", "open_hand", 3, "open_hand_technique", {
    type: "subclass_feature",
    tags: ["flurry_of_blows:rider", "save:dex_prone", "save:str_push_15", "reaction:block"],
  }),
  subclassFeature("monk", "open_hand", 6, "wholeness_of_body", {
    type: "subclass_feature",
    tags: ["action:standard", "healing:self:three_times_monk_level", "rest:long"],
    resourceId: "resource.monk.wholeness_of_body",
    hookId: "hook.subclass.open_hand.wholeness_of_body",
  }, { type: "action" }, SELF_TARGETING),
  subclassFeature("monk", "open_hand", 11, "tranquility", {
    type: "subclass_feature",
    tags: ["rest:long", "spell:sanctuary:self", "ends:on_attack_or_harmful_spell"],
    hookId: "hook.subclass.open_hand.tranquility",
  }),
  subclassFeature("paladin", "devotion", 3, "sacred_weapon", {
    type: "subclass_feature",
    tags: ["channel_divinity", "action:standard", "attack_bonus:cha_mod", "weapon:magical"],
    resourceId: "resource.paladin.channel_divinity",
  }, { type: "action" }, SELF_TARGETING),
  subclassFeature("paladin", "devotion", 3, "turn_the_unholy", {
    type: "subclass_feature",
    tags: ["channel_divinity", "action:standard", "save:wis", "condition:turned", "target:fiend_undead"],
    resourceId: "resource.paladin.channel_divinity",
  }, { type: "action" }, { type: "area", shape: "sphere", sizeFt: 30 }),
  subclassFeature("paladin", "devotion", 7, "aura_of_devotion", {
    type: "subclass_feature",
    tags: ["aura:10", "immunity:charmed", "requires:conscious"],
    hookId: "hook.subclass.devotion.aura_of_devotion",
  }),
  subclassFeature("paladin", "devotion", 9, "oath_spells_level_9", {
    type: "subclass_feature",
    tags: ["spellcasting:oath_spells", "spell_level:3", "spell:beacon_of_hope", "spell:dispel_magic"],
  }),
  subclassFeature("ranger", "hunter", 3, "hunters_prey", {
    type: "subclass_feature",
    tags: ["selection:hunters_prey", "option:colossus_slayer", "option:giant_killer", "option:horde_breaker"],
  }),
  subclassFeature("ranger", "hunter", 7, "defensive_tactics", {
    type: "subclass_feature",
    tags: [
      "selection:defensive_tactics",
      "option:escape_the_horde",
      "option:multiattack_defense",
      "option:steel_will",
    ],
    hookId: "hook.subclass.hunter.defensive_tactics",
  }),
  subclassFeature("ranger", "hunter", 11, "multiattack", {
    type: "subclass_feature",
    tags: ["selection:multiattack", "option:volley", "option:whirlwind_attack"],
    hookId: "hook.subclass.hunter.multiattack",
  }),
  subclassFeature("rogue", "thief", 3, "fast_hands", {
    type: "subclass_feature",
    tags: ["cunning_action:bonus_use_object", "cunning_action:bonus_sleight_of_hand", "cunning_action:bonus_thieves_tools"],
  }, { type: "bonus_action" }, SELF_TARGETING),
  subclassFeature("rogue", "thief", 3, "second_story_work", {
    type: "subclass_feature",
    tags: ["climb_speed:normal", "jump_bonus:dex_mod"],
  }),
  subclassFeature("rogue", "thief", 9, "supreme_sneak", {
    type: "subclass_feature",
    tags: ["advantage:stealth_if_half_speed"],
    hookId: "hook.subclass.thief.supreme_sneak",
  }),
  subclassFeature("sorcerer", "draconic_bloodline", 1, "dragon_ancestor", {
    type: "subclass_feature",
    tags: ["selection:dragon_ancestor", "language:draconic"],
  }),
  subclassFeature("sorcerer", "draconic_bloodline", 1, "draconic_resilience", {
    type: "subclass_feature",
    tags: ["hp_bonus:per_sorcerer_level:+1", "armor_class:13_plus_dex_unarmored"],
  }),
  subclassFeature("sorcerer", "draconic_bloodline", 6, "elemental_affinity", {
    type: "subclass_feature",
    tags: [
      "trigger:spell_damage_matching_ancestry",
      "damage_bonus:cha_mod:once_per_cast",
      "resource:sorcery_points:1",
      "resistance:ancestry_damage_type:1_hour",
    ],
    resourceId: "resource.sorcerer.sorcery_points",
    hookId: "hook.subclass.draconic.elemental_affinity",
  }),
  subclassFeature("warlock", "fiend", 1, "expanded_spell_list", {
    type: "subclass_feature",
    tags: ["spell_list:fiend_expanded"],
  }),
  subclassFeature("warlock", "fiend", 1, "dark_ones_blessing", {
    type: "subclass_feature",
    tags: ["trigger:reduce_hostile_to_zero_hp", "temporary_hp:cha_mod_plus_warlock_level"],
  }),
  subclassFeature("warlock", "fiend", 6, "dark_ones_own_luck", {
    type: "subclass_feature",
    tags: ["trigger:ability_check_or_save", "roll_bonus:1d10", "rest:short"],
    resourceId: "resource.warlock.dark_ones_own_luck",
    hookId: "hook.subclass.fiend.dark_ones_own_luck",
  }),
  subclassFeature("warlock", "fiend", 10, "fiendish_resilience", {
    type: "subclass_feature",
    tags: ["rest:short_or_long", "selection:damage_resistance:one_type", "excludes:silvered_magical_weapons"],
    hookId: "hook.subclass.fiend.fiendish_resilience",
  }),
  subclassFeature("wizard", "evocation", 2, "evocation_savant", {
    type: "subclass_feature",
    tags: ["spellbook:copy_cost_half", "school:evocation"],
  }),
  subclassFeature("wizard", "evocation", 2, "sculpt_spells", {
    type: "subclass_feature",
    tags: ["evocation:protect_allies", "save:auto_success", "damage:none_on_success"],
  }),
  subclassFeature("wizard", "evocation", 6, "potent_cantrip", {
    type: "subclass_feature",
    tags: ["trigger:cantrip_save_success", "damage:half_on_success"],
    hookId: "hook.subclass.evocation.potent_cantrip",
  }),
  subclassFeature("wizard", "evocation", 10, "empowered_evocation", {
    type: "subclass_feature",
    tags: ["trigger:evocation_spell_damage", "damage_bonus:int_mod:once_per_spell"],
    hookId: "hook.subclass.evocation.empowered_evocation",
  }),
];

const PENDING_CLASS_FEATURES: ClassFeatureSeed[] = [
  classFeature("barbarian", 1, "rage", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:rage", "rest:long"],
    resourceId: "resource.barbarian.rage",
  }, { type: "bonus_action" }, SELF_TARGETING),
  classFeature("barbarian", 1, "unarmored_defense", {
    type: "modify_stat",
    tags: ["armor_class:unarmored_dex_con"],
  }),
  classFeature("barbarian", 2, "reckless_attack", {
    type: "grant_action",
    tags: ["trigger:first_attack", "advantage:self_attack", "advantage:incoming_attack"],
  }),
  classFeature("barbarian", 2, "danger_sense", {
    type: "grant_passive",
    tags: ["advantage:dex_save_visible_danger"],
  }),
  classFeature("barbarian", 3, "primal_path", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("bard", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("bard", 1, "bardic_inspiration", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:bardic_inspiration"],
    resourceId: "resource.bard.bardic_inspiration",
  }, { type: "bonus_action" }, { type: "creature", rangeFt: 60 }),
  classFeature("bard", 2, "jack_of_all_trades", {
    type: "grant_passive",
    tags: ["skill:half_proficiency_untrained"],
  }),
  classFeature("bard", 2, "song_of_rest", {
    type: "grant_passive",
    tags: ["rest:short", "healing_bonus:1d6"],
  }),
  classFeature("bard", 3, "expertise", {
    type: "resolver_pending",
    tags: ["skill:expertise", "selection:two_skills"],
  }),
  classFeature("bard", 3, "bard_college", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("cleric", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:divine"],
  }),
  classFeature("cleric", 1, "divine_domain", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("cleric", 2, "channel_divinity", {
    type: "grant_resource",
    tags: ["action:standard", "resource:channel_divinity"],
    resourceId: "resource.cleric.channel_divinity",
  }, { type: "action" }, SELF_TARGETING),

  classFeature("druid", 1, "druidic", {
    type: "grant_passive",
    tags: ["language:druidic"],
  }),
  classFeature("druid", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:primal"],
  }),
  classFeature("druid", 2, "wild_shape", {
    type: "grant_resource",
    tags: ["action:standard", "resource:wild_shape"],
    resourceId: "resource.druid.wild_shape",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("druid", 2, "druid_circle", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("fighter", 1, "fighting_style", {
    type: "resolver_pending",
    tags: ["selection:fighting_style"],
  }),
  classFeature("fighter", 1, "second_wind", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:second_wind", "rest:short"],
    resourceId: "resource.fighter.second_wind",
  }, { type: "bonus_action" }, SELF_TARGETING),
  classFeature("fighter", 2, "action_surge", {
    type: "grant_resource",
    tags: ["action:free", "resource:action_surge", "rest:short"],
    resourceId: "resource.fighter.action_surge",
  }),
  classFeature("fighter", 3, "martial_archetype", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("monk", 1, "unarmored_defense", {
    type: "modify_stat",
    tags: ["armor_class:unarmored_dex_wis"],
  }),
  classFeature("monk", 1, "martial_arts", {
    type: "grant_passive",
    tags: ["unarmed:martial_arts_die", "action:bonus_unarmed_after_attack"],
  }),
  classFeature("monk", 2, "ki", {
    type: "grant_resource",
    tags: ["resource:ki", "action:bonus"],
    resourceId: "resource.monk.ki",
  }, { type: "resource", resourceId: "resource.monk.ki", amount: 1 }, SELF_TARGETING),
  classFeature("monk", 2, "unarmored_movement", {
    type: "modify_stat",
    tags: ["speed_bonus:unarmored"],
  }),
  classFeature("monk", 3, "monastic_tradition", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("monk", 3, "deflect_missiles", {
    type: "grant_action",
    tags: ["action:reaction", "damage_reduction:ranged_weapon"],
  }, { type: "reaction" }, SELF_TARGETING),

  classFeature("paladin", 1, "divine_sense", {
    type: "grant_resource",
    tags: ["action:standard", "resource:divine_sense"],
    resourceId: "resource.paladin.divine_sense",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("paladin", 1, "lay_on_hands", {
    type: "grant_resource",
    tags: ["action:standard", "resource:lay_on_hands"],
    resourceId: "resource.paladin.lay_on_hands",
  }, { type: "action" }, { type: "creature", rangeFt: 5 }),
  classFeature("paladin", 2, "fighting_style", {
    type: "resolver_pending",
    tags: ["selection:fighting_style"],
  }),
  classFeature("paladin", 2, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:half", "spellcasting:prepared", "spellcasting:divine"],
  }),
  classFeature("paladin", 2, "divine_smite", {
    type: "grant_action",
    tags: ["trigger:on_melee_hit", "resource:spell_slot", "damage:radiant"],
  }, { type: "resource", resourceId: "resource.spell_slot", amount: 1 }, { type: "creature", rangeFt: 5 }, "on_hit"),
  classFeature("paladin", 3, "divine_health", {
    type: "grant_passive",
    tags: ["immunity:disease"],
  }),
  classFeature("paladin", 3, "sacred_oath", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("ranger", 1, "favored_enemy", {
    type: "resolver_pending",
    tags: ["selection:favored_enemy", "tracking:advantage", "language:choice_one"],
  }),
  classFeature("ranger", 1, "natural_explorer", {
    type: "resolver_pending",
    tags: ["selection:favored_terrain", "exploration:expertise:favored_terrain"],
  }),
  classFeature("ranger", 2, "fighting_style", {
    type: "resolver_pending",
    tags: ["selection:fighting_style"],
  }),
  classFeature("ranger", 2, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:half", "spellcasting:known", "spellcasting:primal"],
  }),
  classFeature("ranger", 3, "ranger_archetype", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("ranger", 3, "primeval_awareness", {
    type: "grant_action",
    tags: ["action:standard", "resource:spell_slot", "detect:creature_types"],
  }, { type: "resource", resourceId: "resource.spell_slot", amount: 1 }, SELF_TARGETING),

  classFeature("rogue", 1, "expertise", {
    type: "resolver_pending",
    tags: ["skill:expertise", "selection:two_proficiencies"],
  }),
  classFeature("rogue", 1, "sneak_attack", {
    type: "grant_action",
    tags: ["trigger:once_per_turn", "damage:extra:1d6", "scaling:rogue_level"],
  }, NO_COST, { type: "creature", rangeFt: 5 }, "on_hit"),
  classFeature("rogue", 1, "thieves_cant", {
    type: "grant_passive",
    tags: ["language:thieves_cant"],
  }),
  classFeature("rogue", 2, "cunning_action", {
    type: "grant_action",
    tags: ["action:bonus", "action:dash", "action:disengage", "action:hide"],
  }, { type: "bonus_action" }, SELF_TARGETING),
  classFeature("rogue", 3, "roguish_archetype", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("sorcerer", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("sorcerer", 1, "sorcerous_origin", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("sorcerer", 2, "font_of_magic", {
    type: "grant_resource",
    tags: ["resource:sorcery_points"],
    resourceId: "resource.sorcerer.sorcery_points",
  }),
  classFeature("sorcerer", 3, "metamagic", {
    type: "resolver_pending",
    tags: ["selection:metamagic"],
  }),

  classFeature("warlock", 1, "otherworldly_patron", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("warlock", 1, "pact_magic", {
    type: "spellcasting",
    tags: ["spellcasting:pact", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("warlock", 2, "eldritch_invocations", {
    type: "resolver_pending",
    tags: ["selection:eldritch_invocations"],
  }),
  classFeature("warlock", 3, "pact_boon", {
    type: "resolver_pending",
    tags: ["selection:pact_boon"],
  }),

  classFeature("wizard", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:arcane", "spellbook"],
  }),
  classFeature("wizard", 1, "arcane_recovery", {
    type: "grant_resource",
    tags: ["rest:short", "resource:arcane_recovery"],
    resourceId: "resource.wizard.arcane_recovery",
  }),
  classFeature("wizard", 2, "arcane_tradition", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  ...[
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ].map((classKey) =>
    classFeature(classKey, 4, "ability_score_improvement", {
      type: "resolver_pending",
      tags: ["selection:ability_score_improvement", "ability_points:2"],
    }),
  ),

  ...[
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ].map((classKey) =>
    classFeature(classKey, 8, "ability_score_improvement_8", {
      type: "resolver_pending",
      tags: [
        "selection:ability_score_improvement",
        "ability_points:2",
        "feature:ability_score_improvement",
      ],
    }),
  ),

  ...[
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ].map((classKey) =>
    classFeature(classKey, 12, "ability_score_improvement_12", {
      type: "resolver_pending",
      tags: [
        "selection:ability_score_improvement",
        "ability_points:2",
        "feature:ability_score_improvement",
      ],
    }),
  ),

  classFeature("fighter", 6, "ability_score_improvement_6", {
    type: "resolver_pending",
    tags: [
      "selection:ability_score_improvement",
      "ability_points:2",
      "feature:ability_score_improvement",
    ],
  }),

  classFeature("barbarian", 5, "extra_attack", {
    type: "grant_passive",
    tags: ["attack_action:attacks:2"],
  }),
  classFeature("barbarian", 5, "fast_movement", {
    type: "modify_stat",
    tags: ["speed_bonus:unarmored:10"],
  }),
  classFeature("bard", 5, "bardic_inspiration_d8", {
    type: "modify_stat",
    tags: ["bardic_inspiration:die:1d8"],
  }),
  classFeature("bard", 5, "font_of_inspiration", {
    type: "grant_passive",
    tags: ["resource:bardic_inspiration", "rest:short"],
    resourceId: "resource.bard.bardic_inspiration",
  }),
  classFeature("cleric", 5, "destroy_undead", {
    type: "grant_passive",
    tags: ["channel_divinity:turn_undead", "destroy_undead:cr:0.5"],
  }),
  classFeature("druid", 4, "wild_shape_improvement", {
    type: "modify_stat",
    tags: ["wild_shape:max_cr:0.5", "wild_shape:swim_speed_allowed"],
  }),
  classFeature("fighter", 5, "extra_attack", {
    type: "grant_passive",
    tags: ["attack_action:attacks:2"],
  }),
  classFeature("monk", 5, "extra_attack", {
    type: "grant_passive",
    tags: ["attack_action:attacks:2"],
  }),
  classFeature("monk", 5, "stunning_strike", {
    type: "grant_action",
    tags: ["trigger:on_melee_hit", "resource:ki", "save:con", "condition:stunned"],
    resourceId: "resource.monk.ki",
  }, { type: "resource", resourceId: "resource.monk.ki", amount: 1 }, { type: "creature", rangeFt: 5 }, "on_hit"),
  classFeature("monk", 5, "martial_arts_d6", {
    type: "modify_stat",
    tags: ["unarmed:martial_arts_die:1d6"],
  }),
  classFeature("paladin", 5, "extra_attack", {
    type: "grant_passive",
    tags: ["attack_action:attacks:2"],
  }),
  classFeature("ranger", 5, "extra_attack", {
    type: "grant_passive",
    tags: ["attack_action:attacks:2"],
  }),
  classFeature("rogue", 5, "uncanny_dodge", {
    type: "grant_action",
    tags: ["action:reaction", "trigger:attacker_seen", "damage:half"],
  }, { type: "reaction" }, SELF_TARGETING),
  classFeature("barbarian", 7, "feral_instinct", {
    type: "grant_passive",
    tags: ["initiative:advantage", "surprised:act_if_rage_first"],
    hookId: "hook.class.barbarian.feral_instinct",
  }),
  classFeature("bard", 6, "countercharm", {
    type: "grant_action",
    tags: ["action:standard", "aura:30", "advantage:save:frightened", "advantage:save:charmed"],
    hookId: "hook.class.bard.countercharm",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("cleric", 6, "channel_divinity_uses_2", {
    type: "modify_stat",
    tags: ["resource:channel_divinity:max:2", "rest:short"],
    resourceId: "resource.cleric.channel_divinity",
  }),
  classFeature("cleric", 8, "destroy_undead_cr_1", {
    type: "grant_passive",
    tags: ["channel_divinity:turn_undead", "destroy_undead:cr:1"],
  }),
  classFeature("druid", 8, "wild_shape_improvement_cr_1", {
    type: "modify_stat",
    tags: ["wild_shape:max_cr:1", "wild_shape:swim_speed_allowed"],
  }),
  classFeature("monk", 6, "ki_empowered_strikes", {
    type: "grant_passive",
    tags: ["unarmed_strike:magical_for_resistance"],
    hookId: "hook.class.monk.ki_empowered_strikes",
  }),
  classFeature("monk", 7, "evasion", {
    type: "grant_passive",
    tags: ["save:dex:success_no_damage", "save:dex:failure_half_damage"],
    hookId: "hook.class.evasion",
  }),
  classFeature("monk", 7, "stillness_of_mind", {
    type: "grant_action",
    tags: ["action:standard", "remove:charmed", "remove:frightened"],
    hookId: "hook.class.monk.stillness_of_mind",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("paladin", 6, "aura_of_protection", {
    type: "grant_passive",
    tags: ["aura:10", "saving_throw_bonus:cha_mod", "requires:conscious"],
    hookId: "hook.class.paladin.aura_of_protection",
  }),
  classFeature("ranger", 6, "favored_enemy_improvement", {
    type: "grant_passive",
    tags: ["selection:favored_enemy:additional", "language:choice_one"],
  }),
  classFeature("ranger", 6, "natural_explorer_improvement", {
    type: "grant_passive",
    tags: ["selection:favored_terrain:additional"],
  }),
  classFeature("ranger", 8, "lands_stride", {
    type: "grant_passive",
    tags: [
      "movement:ignore_nonmagical_difficult_terrain",
      "movement:ignore_nonmagical_plants",
      "advantage:save:magical_plants",
    ],
    hookId: "hook.class.ranger.lands_stride",
  }),
  classFeature("rogue", 6, "expertise_improvement", {
    type: "resolver_pending",
    tags: ["skill:expertise", "selection:two_proficiencies"],
  }),
  classFeature("rogue", 7, "evasion", {
    type: "grant_passive",
    tags: ["save:dex:success_no_damage", "save:dex:failure_half_damage"],
    hookId: "hook.class.evasion",
  }),
  classFeature("barbarian", 9, "brutal_critical", {
    type: "grant_passive",
    tags: ["critical:extra_weapon_damage_die:1"],
    hookId: "hook.class.barbarian.brutal_critical",
  }),
  classFeature("barbarian", 9, "rage_damage_3", {
    type: "modify_stat",
    tags: ["rage:damage_bonus:+3"],
  }),
  classFeature("barbarian", 11, "relentless_rage", {
    type: "grant_passive",
    tags: ["trigger:drop_to_zero_hp", "save:con", "dc:10_scaling_each_use", "remain_at_1_hp"],
    hookId: "hook.class.barbarian.relentless_rage",
  }),
  classFeature("bard", 9, "song_of_rest_d8", {
    type: "modify_stat",
    tags: ["song_of_rest:die:1d8"],
  }),
  classFeature("bard", 10, "bardic_inspiration_d10", {
    type: "modify_stat",
    tags: ["bardic_inspiration:die:1d10"],
  }),
  classFeature("bard", 10, "expertise_10", {
    type: "resolver_pending",
    tags: ["skill:expertise", "selection:two_proficiencies"],
  }),
  classFeature("bard", 10, "magical_secrets", {
    type: "resolver_pending",
    tags: ["spellcasting:magical_secrets", "spell_selection:any_class:2"],
  }),
  classFeature("cleric", 10, "divine_intervention", {
    type: "grant_action",
    tags: ["action:standard", "roll:d100", "success:cleric_level_or_lower", "cooldown:long_rest_or_7_days"],
    resourceId: "resource.cleric.divine_intervention",
    hookId: "hook.class.cleric.divine_intervention",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("cleric", 11, "destroy_undead_cr_2", {
    type: "grant_passive",
    tags: ["channel_divinity:turn_undead", "destroy_undead:cr:2"],
  }),
  classFeature("druid", 10, "wild_shape_uses_stable", {
    type: "modify_stat",
    tags: ["resource:wild_shape:max:2", "rest:short"],
    resourceId: "resource.druid.wild_shape",
  }),
  classFeature("fighter", 9, "indomitable", {
    type: "grant_action",
    tags: ["trigger:failed_saving_throw", "reroll:save", "rest:long"],
    resourceId: "resource.fighter.indomitable",
    hookId: "hook.class.fighter.indomitable",
  }, { type: "reaction" }, SELF_TARGETING, "reaction"),
  classFeature("fighter", 11, "extra_attack_2", {
    type: "grant_passive",
    tags: ["attack_action:attacks:3"],
  }),
  classFeature("monk", 9, "unarmored_movement_improvement", {
    type: "modify_stat",
    tags: ["movement:vertical_surfaces", "movement:across_liquids", "requires:move_not_end_there"],
    hookId: "hook.class.monk.unarmored_movement_improvement",
  }),
  classFeature("monk", 10, "purity_of_body", {
    type: "grant_passive",
    tags: ["immunity:disease", "immunity:poisoned", "immunity:poison_damage"],
    hookId: "hook.class.monk.purity_of_body",
  }),
  classFeature("monk", 11, "martial_arts_d8", {
    type: "modify_stat",
    tags: ["unarmed:martial_arts_die:1d8"],
  }),
  classFeature("paladin", 10, "aura_of_courage", {
    type: "grant_passive",
    tags: ["aura:10", "immunity:frightened", "requires:conscious"],
    hookId: "hook.class.paladin.aura_of_courage",
  }),
  classFeature("paladin", 11, "improved_divine_smite", {
    type: "grant_passive",
    tags: ["trigger:melee_weapon_hit", "damage:extra:1d8", "damage:radiant"],
    hookId: "hook.class.paladin.improved_divine_smite",
  }),
  classFeature("ranger", 10, "hide_in_plain_sight", {
    type: "grant_action",
    tags: ["downtime:1_minute", "stealth_bonus:+10", "ends:on_move_or_action"],
    hookId: "hook.class.ranger.hide_in_plain_sight",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("rogue", 11, "reliable_talent", {
    type: "grant_passive",
    tags: ["ability_check:proficient:min_d20:10"],
    hookId: "hook.class.rogue.reliable_talent",
  }),
  classFeature("sorcerer", 10, "metamagic_improvement", {
    type: "resolver_pending",
    tags: ["selection:metamagic:additional"],
  }),
  classFeature("sorcerer", 10, "sorcery_points_10", {
    type: "modify_stat",
    tags: ["resource:sorcery_points:max:10", "rest:long"],
    resourceId: "resource.sorcerer.sorcery_points",
  }),
  classFeature("warlock", 11, "mystic_arcanum_6", {
    type: "spellcasting",
    tags: ["spellcasting:mystic_arcanum", "spell_level:6", "uses:1", "rest:long"],
    resourceId: "resource.warlock.mystic_arcanum_6",
  }),
  classFeature("wizard", 10, "arcane_tradition_feature_10", {
    type: "resolver_pending",
    tags: ["subclass:feature_level_10"],
  }),
];

const CONDITION_DEFINITIONS: RuleCatalogEntry[] = [
  condition("condition.prone", ["condition:prone", "movement:stand_cost_half_speed"]),
  condition("condition.poisoned", ["condition:poisoned", "disadvantage:attack_roll", "disadvantage:ability_check"]),
  condition("condition.restrained", ["condition:restrained", "speed:zero", "advantage:incoming_attack"]),
  condition("condition.frightened", ["condition:fear", "disadvantage:while_source_visible"]),
  condition("condition.paralyzed", ["condition:paralyzed", "incapacitated", "auto_crit:adjacent_hit"]),
  condition("condition.incapacitated", ["condition:incapacitated", "action_blocked", "reaction_blocked"]),
  condition("condition.burning", ["condition:burning", "damage_over_time:fire"]),
  condition("condition.stunned", ["condition:stunned", "incapacitated", "movement_blocked"]),
  condition("condition.charmed", ["condition:charmed", "attack_blocked:charmer", "social_advantage:charmer"]),
  condition("condition.grappled", ["condition:grappled", "speed:zero", "escape_check"]),
];

const TERRAIN_EFFECT_DEFINITIONS: RuleCatalogEntry[] = [
  terrainEffect("terrain.difficult", ["movement:difficult_terrain"]),
  terrainEffect("terrain.hazardous", ["trigger:on_enter", "damage:hazard"]),
  terrainEffect("terrain.obscurement", ["vision:obscured"]),
  terrainEffect("terrain.elevation", ["position:elevated"]),
  terrainEffect("terrain.slippery", ["trigger:on_enter", "save:dex", "condition:prone"]),
  terrainEffect("terrain.burning", [
    "trigger:on_enter",
    "trigger:on_turn_start",
    "trigger:on_turn_end",
    "damage:fire",
    "damage_over_time:fire:1d6",
    "condition:burning",
  ]),
  terrainEffect("terrain.poison_cloud", [
    "trigger:on_enter",
    "trigger:on_turn_start",
    "trigger:on_exit",
    "save:con",
    "damage:poison",
    "condition:poisoned",
    "condition_ends:on_exit",
  ]),
  terrainEffect("terrain.flaming_sphere", [
    "trigger:on_enter",
    "trigger:on_turn_start",
    "save:dex",
    "damage:fire",
    "damage_over_time:fire:2d6",
    "half_damage_on_success",
  ]),
  terrainEffect("terrain.wall_of_fire", [
    "trigger:on_enter",
    "trigger:on_turn_end",
    "save:dex",
    "damage:fire",
    "damage_over_time:fire:5d8",
    "half_damage_on_success",
  ]),
];

const SPELL_DEFINITIONS: RuleCatalogEntry[] = [
  spell("spell.bless", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: [
      "target_count:3",
      "roll_bonus:attack_roll:1d4",
      "roll_bonus:saving_throw:1d4",
    ],
    hookId: "hook.spell.cast_bless",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.bane", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "cha", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: [
      "target_count:3",
      "roll_penalty:attack_roll:1d4",
      "roll_penalty:saving_throw:1d4",
    ],
    hookId: "hook.spell.cast_bane",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.chill_touch", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "1d8", type: "necrotic", scaling: "character_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["spell_attack:ranged", "damage:necrotic", "effect:healing_block", "effect:undead_disadvantage"],
    hookId: "hook.spell.cast_chill_touch",
    scaling: { mode: "character_level", table: { 5: "2d8", 11: "3d8", 17: "4d8" } },
  }),
  spell("spell.fire_bolt", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "1d10", type: "fire", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["spell_attack:ranged", "damage:fire"],
    hookId: "hook.spell.cast_fire_bolt",
    scaling: { mode: "character_level", table: { 5: "2d10", 11: "3d10", 17: "4d10" } },
  }),
  spell("spell.ray_of_frost", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 60 },
    damage: { dice: "1d8", type: "cold", scaling: "character_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["spell_attack:ranged", "damage:cold", "movement_speed_penalty:10"],
    hookId: "hook.spell.cast_ray_of_frost",
    scaling: { mode: "character_level", table: { 5: "2d8", 11: "3d8", 17: "4d8" } },
  }),
  spell("spell.sacred_flame", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "1d8", type: "radiant", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["save:dex", "damage:radiant", "no_damage_on_success", "ignore_cover_save_bonus"],
    hookId: "hook.spell.cast_sacred_flame",
    scaling: { mode: "character_level", table: { 5: "2d8", 11: "3d8", 17: "4d8" } },
  }),
  spell("spell.light", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    tags: ["effect:bright_light", "utility:illumination", "light_radius:40"],
    hookId: "hook.spell.cast_light",
  }),
  spell("spell.detect_magic", {
    level: 1,
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["utility:detection", "detect:magic:30", "ritual"],
    hookId: "hook.spell.cast_detect_magic",
  }),
  spell("spell.magic_missile", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "3d4+3", type: "force", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["damage:force", "hit:auto", "missile_count:3"],
    hookId: "hook.spell.cast_magic_missile",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.cure_wounds", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8", type: "healing", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["healing", "range:5"],
    hookId: "hook.spell.cast_cure_wounds",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 } },
  }),
  spell("spell.guiding_bolt", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "4d6", type: "radiant", scaling: "slot_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["spell_attack:ranged", "damage:radiant", "next_attack_advantage"],
    hookId: "hook.spell.cast_guiding_bolt",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
  }),
  spell("spell.inflict_wounds", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "3d10", type: "necrotic", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["spell_attack:melee", "damage:necrotic"],
    hookId: "hook.spell.cast_inflict_wounds",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d10", perSlotAbove: 1 } },
  }),
  spell("spell.healing_word", {
    level: 1,
    cost: { type: "bonus_action" },
    targeting: { type: "creature", rangeFt: 60 },
    damage: { dice: "1d4", type: "healing", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["healing", "range:60"],
    hookId: "hook.spell.cast_healing_word",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d4", perSlotAbove: 1 } },
  }),
  spell("spell.command", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "round", amount: 1 },
    tags: ["save:wis", "condition:commanded", "target_count:1"],
    hookId: "hook.spell.cast_command",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.shield", {
    level: 1,
    cost: { type: "reaction" },
    targeting: SELF_TARGETING,
    duration: { unit: "round", amount: 1 },
    tags: ["reaction:on_hit", "armor_class:+5", "immunity:magic_missile"],
    hookId: "hook.spell.cast_shield",
  }),
  spell("spell.sleep", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    duration: { unit: "minute", amount: 1 },
    tags: ["hit_point_pool:5d8", "condition:unconscious", "area:sphere", "range:90"],
    hookId: "hook.spell.cast_sleep",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "2d8", perSlotAbove: 1 } },
  }),
  spell("spell.burning_hands", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cone", sizeFt: 15 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "3d6", type: "fire", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["area:cone", "range:15", "save:dex", "damage:fire", "half_damage_on_success"],
    hookId: "hook.spell.cast_burning_hands",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
  }),
  spell("spell.thunderwave", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 15 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    damage: { dice: "2d8", type: "thunder", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: [
      "area:cube",
      "range:15",
      "save:con",
      "damage:thunder",
      "half_damage_on_success",
      "forced_movement:push:10",
    ],
    hookId: "hook.spell.cast_thunderwave",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 } },
  }),
  spell("spell.entangle", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 20 },
    save: { ability: "str", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: [
      "area:cube",
      "range:90",
      "save:str",
      "condition:restrained",
      "terrain:terrain.difficult",
    ],
    hookId: "hook.spell.cast_entangle",
  }),
  spell("spell.hold_person", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["save:wis", "condition:paralyzed", "target:humanoid"],
    hookId: "hook.spell.cast_hold_person",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.web", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 20 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["area:cube", "range:60", "save:dex", "condition:restrained", "terrain:terrain.difficult"],
    hookId: "hook.spell.cast_web",
  }),
  spell("spell.misty_step", {
    level: 2,
    cost: { type: "bonus_action" },
    targeting: SELF_TARGETING,
    duration: { unit: "instant", amount: null },
    tags: ["teleport:self:30", "movement:ignore_opportunity_attack"],
    hookId: "hook.spell.cast_misty_step",
  }),
  spell("spell.scorching_ray", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "6d6", type: "fire", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["spell_attack:ranged", "damage:fire", "ray_count:3", "ray_damage:2d6"],
    hookId: "hook.spell.cast_scorching_ray",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.fireball", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "8d6", type: "fire", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["area:sphere", "range:150", "save:dex", "damage:fire", "half_damage_on_success"],
    hookId: "hook.spell.cast_fireball",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
  }),
  spell("spell.dispel_magic", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    duration: { unit: "instant", amount: null },
    tags: ["utility:dispel_magic", "remove:spell_effect", "ability_check:spellcasting_ability"],
    hookId: "hook.spell.cast_dispel_magic",
    scaling: { mode: "slot_level", table: { mode: "dispel_spell_level", base: 3, perSlotAbove: 1 } },
  }),
  spell("spell.acid_splash", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "1d6", type: "acid", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["save:dex", "damage:acid", "no_damage_on_success", "target_count:2", "targets_adjacent"],
    hookId: "hook.spell.cast_acid_splash",
    scaling: { mode: "character_level", table: { 5: "2d6", 11: "3d6", 17: "4d6" } },
  }),
  spell("spell.guidance", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["roll_bonus:ability_check:1d4"],
    hookId: "hook.spell.cast_guidance",
  }),
  spell("spell.mage_hand", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    duration: { unit: "minute", amount: 1 },
    tags: ["utility:remote_object_interaction", "weight_limit_lb:10"],
    hookId: "hook.spell.cast_mage_hand",
  }),
  spell("spell.minor_illusion", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 5 },
    duration: { unit: "minute", amount: 1 },
    tags: ["utility:illusion", "range:30", "investigation:disbelieve"],
    hookId: "hook.spell.cast_minor_illusion",
  }),
  spell("spell.shocking_grasp", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8", type: "lightning", scaling: "character_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["spell_attack:melee", "damage:lightning", "reaction:block", "advantage:metal_armor"],
    hookId: "hook.spell.cast_shocking_grasp",
    scaling: { mode: "character_level", table: { 5: "2d8", 11: "3d8", 17: "4d8" } },
  }),
  spell("spell.charm_person", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "hour", amount: 1 },
    tags: ["save:wis", "condition:charmed", "target:humanoid"],
    hookId: "hook.spell.cast_charm_person",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.faerie_fire", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 20 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:60", "save:dex", "condition:faerie_fire", "advantage:incoming_attack", "light:dim"],
    hookId: "hook.spell.cast_faerie_fire",
  }),
  spell("spell.feather_fall", {
    level: 1,
    cost: { type: "reaction" },
    targeting: { type: "creature", rangeFt: 60 },
    duration: { unit: "minute", amount: 1 },
    tags: ["target_count:5", "falling_speed:60", "immunity:fall_damage"],
    hookId: "hook.spell.cast_feather_fall",
  }),
  spell("spell.fog_cloud", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["range:120", "terrain:terrain.obscurement", "heavily_obscured"],
    hookId: "hook.spell.cast_fog_cloud",
    scaling: { mode: "slot_level", table: { mode: "area_size", feet: 20, perSlotAbove: 20 } },
  }),
  spell("spell.grease", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 10 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    tags: ["range:60", "terrain:terrain.slippery", "save:dex", "condition:prone"],
    hookId: "hook.spell.cast_grease",
  }),
  spell("spell.heroism", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["immunity:frightened", "temporary_hp:spellcasting_modifier:turn_start"],
    hookId: "hook.spell.cast_heroism",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.hunters_mark", {
    level: 1,
    cost: { type: "bonus_action" },
    targeting: { type: "creature", rangeFt: 90 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["condition:hunters_mark", "damage:extra:1d6", "trigger:weapon_hit", "tracking:advantage"],
    hookId: "hook.spell.cast_hunters_mark",
  }),
  spell("spell.longstrider", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    tags: ["movement_speed_bonus:10"],
    hookId: "hook.spell.cast_longstrider",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.aid", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    duration: { unit: "hour", amount: 8 },
    tags: ["target_count:3", "max_hp_bonus:5", "healing:5"],
    hookId: "hook.spell.cast_aid",
    scaling: { mode: "slot_level", table: { mode: "flat_bonus", amount: 5, perSlotAbove: 5 } },
  }),
  spell("spell.blindness_deafness", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    tags: ["save:con", "condition:blinded_or_deafened"],
    hookId: "hook.spell.cast_blindness_deafness",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.darkness", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 15 },
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["range:60", "terrain:terrain.obscurement", "darkness:magical", "heavily_obscured"],
    hookId: "hook.spell.cast_darkness",
  }),
  spell("spell.invisibility", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["condition:invisible", "ends_on_attack_or_spell"],
    hookId: "hook.spell.cast_invisibility",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.lesser_restoration", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "instant", amount: null },
    tags: ["remove:blinded", "remove:deafened", "remove:paralyzed", "remove:poisoned"],
    hookId: "hook.spell.cast_lesser_restoration",
  }),
  spell("spell.moonbeam", {
    level: 2,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 5 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    damage: { dice: "2d10", type: "radiant", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:120", "save:con", "damage:radiant", "half_damage_on_success", "trigger:on_turn_start"],
    hookId: "hook.spell.cast_moonbeam",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d10", perSlotAbove: 1 } },
  }),
  spell("spell.spiritual_weapon", {
    level: 2,
    cost: { type: "bonus_action" },
    targeting: { type: "creature", rangeFt: 60 },
    damage: { dice: "1d8", type: "force", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    tags: ["spell_attack:melee", "summon:spiritual_weapon", "repeat:bonus_action_attack"],
    hookId: "hook.spell.cast_spiritual_weapon",
    scaling: { mode: "slot_level", table: { mode: "damage_dice_every_two_slots", dice: "1d8" } },
  }),
  spell("spell.counterspell", {
    level: 3,
    cost: { type: "reaction" },
    targeting: { type: "creature", rangeFt: 60 },
    duration: { unit: "instant", amount: null },
    tags: ["reaction:creature_casts_spell", "interrupt:spell", "ability_check:spellcasting_ability"],
    hookId: "hook.spell.cast_counterspell",
    scaling: { mode: "slot_level", table: { mode: "counter_spell_level", base: 3, perSlotAbove: 1 } },
  }),
  spell("spell.fly", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["movement:flying_speed:60"],
    hookId: "hook.spell.cast_fly",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.haste", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["armor_class:+2", "advantage:save:dex", "movement_speed_multiplier:2", "grant:haste_action"],
    hookId: "hook.spell.cast_haste",
  }),
  spell("spell.lightning_bolt", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "area", shape: "line", sizeFt: 100 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "8d6", type: "lightning", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["area:line", "save:dex", "damage:lightning", "half_damage_on_success"],
    hookId: "hook.spell.cast_lightning_bolt",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
  }),
  spell("spell.revivify", {
    level: 3,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "instant", amount: null },
    tags: ["revive:hp:1", "death_window:minute:1", "component:diamond:300gp"],
    hookId: "hook.spell.cast_revivify",
  }),
];

const MONSTER_ABILITY_DEFINITIONS: RuleCatalogEntry[] = [
  monsterAbility("monster.brown_bear.ability.multiattack", {
    monsterId: "monster.brown_bear",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.bite:1", "multiattack:action.claws:1"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.brown_bear.ability.bite", {
    monsterId: "monster.brown_bear",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8+4", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.brown_bear.ability.claws", {
    monsterId: "monster.brown_bear",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d6+4", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "srd_action_id:action.claws"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.goblin.ability.scimitar", {
    monsterId: "monster.goblin",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+2", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.scimitar"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.goblin.ability.shortbow", {
    monsterId: "monster.goblin",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 80 },
    damage: { dice: "1d6+2", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+4", "range_long:320", "srd_action_id:action.shortbow"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.goblin.ability.nimble_escape", {
    monsterId: "monster.goblin",
    cost: { type: "bonus_action" },
    targeting: SELF_TARGETING,
    tags: ["option:disengage", "option:hide", "mobility:defensive"],
    hookId: "hook.monster.utility",
  }),
  monsterAbility("monster.orc.ability.greataxe", {
    monsterId: "monster.orc",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d12+3", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "srd_action_id:action.greataxe"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.orc.ability.javelin", {
    monsterId: "monster.orc",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    damage: { dice: "1d6+3", type: "piercing" },
    tags: ["attack:melee_or_ranged_weapon", "attack_bonus:+5", "range_long:120", "srd_action_id:action.javelin"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.wolf.ability.bite", {
    monsterId: "monster.wolf",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "str", dcSource: "fixed", fixedDc: 11 },
    damage: { dice: "2d4+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "pack_tactics", "save:str", "condition:prone", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.skeleton.ability.shortsword", {
    monsterId: "monster.skeleton",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.shortsword"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.skeleton.ability.shortbow", {
    monsterId: "monster.skeleton",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 80 },
    damage: { dice: "1d6+2", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+4", "range_long:320", "srd_action_id:action.shortbow"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.zombie.ability.slam", {
    monsterId: "monster.zombie",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+1", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "srd_action_id:action.slam"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.zombie.ability.undead_fortitude", {
    monsterId: "monster.zombie",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    save: { ability: "con", dcSource: "fixed", fixedDc: 5 },
    tags: ["trigger:reduced_to_zero_hp", "save:con", "survival:undead_fortitude", "dc:add_damage_taken"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.giant_rat.ability.bite", {
    monsterId: "monster.giant_rat",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d4+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.giant_spider.ability.web", {
    monsterId: "monster.giant_spider",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 12 },
    duration: { unit: "minute", amount: 1 },
    tags: ["attack:ranged_weapon", "attack_bonus:+5", "range_long:60", "condition:restrained", "recharge:5-6", "srd_action_id:action.web"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.giant_spider.ability.bite", {
    monsterId: "monster.giant_spider",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "con", dcSource: "fixed", fixedDc: 11 },
    damage: { dice: "1d8+3", type: "piercing" },
    tags: [
      "attack:melee_weapon",
      "attack_bonus:+5",
      "srd_action_id:action.bite",
      "condition:poisoned",
    ],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.dragon_whelp.ability.bite", {
    monsterId: "monster.dragon_whelp",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d10+3", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.dragon_whelp.ability.fire_breath", {
    monsterId: "monster.dragon_whelp",
    cost: { type: "action" },
    targeting: { type: "area", shape: "cone", sizeFt: 15 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 13 },
    damage: { dice: "4d6", type: "fire" },
    tags: ["recharge:5-6", "area:cone", "save:dex", "half_damage_on_success", "srd_action_id:action.fire_breath"],
    hookId: "hook.monster.area_attack",
  }),
  monsterAbility("monster.dragon_whelp.ability.dark_blessing", {
    monsterId: "monster.dragon_whelp",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: [
      "usage:1/day",
      "temporary_hp:on_kill",
      "passive:dark_blessing",
      "aura:dark_blessing",
      "trigger:on_turn_start",
    ],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.cultist.ability.scimitar", {
    monsterId: "monster.cultist",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+1", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "srd_action_id:action.scimitar"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.cultist.ability.dark_devotion", {
    monsterId: "monster.cultist",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["advantage:save:charmed", "advantage:save:frightened", "passive:dark_devotion"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.ogre.ability.greatclub", {
    monsterId: "monster.ogre",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d8+4", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+6", "srd_action_id:action.greatclub"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.ogre.ability.javelin", {
    monsterId: "monster.ogre",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    damage: { dice: "2d6+4", type: "piercing" },
    tags: ["attack:melee_or_ranged_weapon", "attack_bonus:+6", "range_long:120", "srd_action_id:action.javelin"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.kobold.ability.dagger", {
    monsterId: "monster.kobold",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d4+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "pack_tactics", "srd_action_id:action.dagger"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.kobold.ability.sling", {
    monsterId: "monster.kobold",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    damage: { dice: "1d4+2", type: "bludgeoning" },
    tags: ["attack:ranged_weapon", "attack_bonus:+4", "range_long:120", "pack_tactics", "srd_action_id:action.sling"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.bandit.ability.scimitar", {
    monsterId: "monster.bandit",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+1", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "srd_action_id:action.scimitar"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.bandit.ability.light_crossbow", {
    monsterId: "monster.bandit",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 80 },
    damage: { dice: "1d8+1", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+3", "range_long:320", "srd_action_id:action.light_crossbow"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.bugbear.ability.morningstar", {
    monsterId: "monster.bugbear",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 10 },
    damage: { dice: "2d8+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "reach:long_limbed", "damage:surprise:2d6", "srd_action_id:action.morningstar"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.bugbear.ability.javelin", {
    monsterId: "monster.bugbear",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 30 },
    damage: { dice: "1d6+2", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+4", "range_long:120", "srd_action_id:action.javelin"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.hobgoblin.ability.longsword", {
    monsterId: "monster.hobgoblin",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8+1", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "damage:martial_advantage:2d6", "srd_action_id:action.longsword"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.hobgoblin.ability.longbow", {
    monsterId: "monster.hobgoblin",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 150 },
    damage: { dice: "1d8+1", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+3", "range_long:600", "damage:martial_advantage:2d6", "srd_action_id:action.longbow"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.dire_wolf.ability.bite", {
    monsterId: "monster.dire_wolf",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "str", dcSource: "fixed", fixedDc: 13 },
    damage: { dice: "2d6+3", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "pack_tactics", "condition:prone", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.ghoul.ability.bite", {
    monsterId: "monster.ghoul",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d6+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+2", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.ghoul.ability.claws", {
    monsterId: "monster.ghoul",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "con", dcSource: "fixed", fixedDc: 10 },
    damage: { dice: "2d4+2", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "condition:paralyzed", "srd_action_id:action.claws"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.ghoul.ability.undead_defenses", {
    monsterId: "monster.ghoul",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["immunity:poison", "immunity:condition:charmed", "immunity:condition:poisoned", "passive:undead_defenses"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.wight.ability.multiattack", {
    monsterId: "monster.wight",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.longsword:2"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.wight.ability.longsword", {
    monsterId: "monster.wight",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d8+2", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "damage:necrotic_component:1d8", "srd_action_id:action.longsword"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.wight.ability.longbow", {
    monsterId: "monster.wight",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 150 },
    damage: { dice: "1d8+2", type: "piercing" },
    tags: ["attack:ranged_weapon", "attack_bonus:+4", "range_long:600", "srd_action_id:action.longbow"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.wight.ability.life_drain", {
    monsterId: "monster.wight",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "con", dcSource: "fixed", fixedDc: 13 },
    damage: { dice: "1d6+2", type: "necrotic" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "effect:max_hp_reduction:damage", "srd_action_id:action.life_drain"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.wight.ability.undead_defenses", {
    monsterId: "monster.wight",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["resistance:necrotic", "resistance:bludgeoning", "resistance:piercing", "resistance:slashing", "immunity:poison", "immunity:condition:poisoned", "passive:undead_defenses"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.mimic.ability.pseudopod", {
    monsterId: "monster.mimic",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8+3", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "condition:grappled", "effect:escape_dc:13", "srd_action_id:action.pseudopod"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.mimic.ability.bite", {
    monsterId: "monster.mimic",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d8+3", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+5", "damage:acid_component:1d8", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.mimic.ability.false_appearance", {
    monsterId: "monster.mimic",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["immunity:acid", "immunity:condition:prone", "passive:false_appearance", "effect:hidden_until_moved"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.gelatinous_cube.ability.pseudopod", {
    monsterId: "monster.gelatinous_cube",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "3d6", type: "acid" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.pseudopod"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.gelatinous_cube.ability.engulf", {
    monsterId: "monster.gelatinous_cube",
    cost: { type: "action" },
    targeting: { type: "area", shape: "cube", sizeFt: 10 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 12 },
    damage: { dice: "3d6", type: "acid" },
    duration: { unit: "minute", amount: 1 },
    tags: ["area:cube", "condition:restrained", "condition:engulfed", "trigger:on_turn_start", "effect:damage_over_time:6d6:acid", "srd_action_id:action.engulf"],
    hookId: "hook.monster.area_attack",
  }),
  monsterAbility("monster.gelatinous_cube.ability.ooze_defenses", {
    monsterId: "monster.gelatinous_cube",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["immunity:condition:blinded", "immunity:condition:charmed", "immunity:condition:deafened", "immunity:condition:frightened", "immunity:condition:prone", "passive:ooze_defenses"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.swarm_of_rats.ability.bites", {
    monsterId: "monster.swarm_of_rats",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d6", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+2", "swarm:half_hp_damage:1d6", "srd_action_id:action.bites"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.swarm_of_rats.ability.swarm_defenses", {
    monsterId: "monster.swarm_of_rats",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["resistance:bludgeoning", "resistance:piercing", "resistance:slashing", "immunity:condition:charmed", "immunity:condition:frightened", "immunity:condition:grappled", "immunity:condition:prone", "immunity:condition:restrained", "passive:swarm"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.animated_armor.ability.multiattack", {
    monsterId: "monster.animated_armor",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.slam:2"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.animated_armor.ability.slam", {
    monsterId: "monster.animated_armor",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+2", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.slam"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.animated_armor.ability.construct_defenses", {
    monsterId: "monster.animated_armor",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["immunity:poison", "immunity:psychic", "immunity:condition:poisoned", "passive:construct_defenses"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.gargoyle.ability.multiattack", {
    monsterId: "monster.gargoyle",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.bite:1", "multiattack:action.claws:1"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.gargoyle.ability.bite", {
    monsterId: "monster.gargoyle",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.gargoyle.ability.claws", {
    monsterId: "monster.gargoyle",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d6+2", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.claws"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.gargoyle.ability.stone_resistance", {
    monsterId: "monster.gargoyle",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["resistance:bludgeoning", "resistance:piercing", "resistance:slashing", "immunity:poison", "passive:stone_body"],
    hookId: "hook.monster.passive",
  }),
  monsterAbility("monster.harpy.ability.multiattack", {
    monsterId: "monster.harpy",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.claws:1", "multiattack:action.club:1"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.harpy.ability.claws", {
    monsterId: "monster.harpy",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d4+1", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "srd_action_id:action.claws"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.harpy.ability.club", {
    monsterId: "monster.harpy",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d4+1", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+3", "srd_action_id:action.club"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.harpy.ability.luring_song", {
    monsterId: "monster.harpy",
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 300 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 11 },
    duration: { unit: "minute", amount: 1 },
    tags: ["area:sphere", "condition:charmed", "condition:incapacitated", "aura:luring_song", "trigger:on_turn_start", "srd_action_id:action.luring_song"],
    hookId: "hook.monster.area_effect",
  }),
  monsterAbility("monster.giant_scorpion.ability.multiattack", {
    monsterId: "monster.giant_scorpion",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.claw:2", "multiattack:action.sting:1"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.giant_scorpion.ability.claw", {
    monsterId: "monster.giant_scorpion",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "1d8+2", type: "bludgeoning" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "condition:grappled", "effect:escape_dc:12", "srd_action_id:action.claw"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.giant_scorpion.ability.sting", {
    monsterId: "monster.giant_scorpion",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    save: { ability: "con", dcSource: "fixed", fixedDc: 12 },
    damage: { dice: "1d10+2", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+4", "condition:poisoned", "effect:poison_damage:4d10", "srd_action_id:action.sting"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.young_red_dragon.ability.multiattack", {
    monsterId: "monster.young_red_dragon",
    cost: { type: "action" },
    targeting: SELF_TARGETING,
    tags: ["multiattack:action.bite:1", "multiattack:action.claw:2"],
    hookId: "hook.monster.multiattack",
  }),
  monsterAbility("monster.young_red_dragon.ability.bite", {
    monsterId: "monster.young_red_dragon",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 10 },
    damage: { dice: "2d10+6", type: "piercing" },
    tags: ["attack:melee_weapon", "attack_bonus:+10", "damage:fire_component:1d6", "srd_action_id:action.bite"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.young_red_dragon.ability.claw", {
    monsterId: "monster.young_red_dragon",
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    damage: { dice: "2d6+6", type: "slashing" },
    tags: ["attack:melee_weapon", "attack_bonus:+10", "srd_action_id:action.claw"],
    hookId: "hook.monster.attack",
  }),
  monsterAbility("monster.young_red_dragon.ability.fire_breath", {
    monsterId: "monster.young_red_dragon",
    cost: { type: "action" },
    targeting: { type: "area", shape: "cone", sizeFt: 30 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 17 },
    damage: { dice: "16d6", type: "fire" },
    tags: ["recharge:5-6", "area:cone", "save:dex", "half_damage_on_success", "movement:fly:80", "srd_action_id:action.fire_breath"],
    hookId: "hook.monster.area_attack",
  }),
  monsterAbility("monster.young_red_dragon.ability.dragon_defenses", {
    monsterId: "monster.young_red_dragon",
    cost: { type: "none" },
    targeting: SELF_TARGETING,
    tags: ["immunity:fire", "movement:fly:80", "passive:dragon_defenses"],
    hookId: "hook.monster.passive",
  }),
];

@Injectable()
export class RuleCatalogService {
  private readonly entries = new Map<string, RuleCatalogEntry>();

  constructor() {
    for (const entry of [
      ...RACE_TRAIT_DEFINITIONS,
      ...SUBCLASS_FEATURE_DEFINITIONS,
      ...PENDING_CLASS_FEATURES.map(toClassFeatureEntry),
      ...CONDITION_DEFINITIONS,
      ...TERRAIN_EFFECT_DEFINITIONS,
      ...SPELL_DEFINITIONS,
      ...P3_SPELL_DEFINITIONS,
      ...P4_SPELL_DEFINITIONS,
      ...MONSTER_ABILITY_DEFINITIONS,
      ...P3_MONSTER_ABILITY_DEFINITIONS,
      ...P4_MONSTER_ABILITY_DEFINITIONS,
    ]) {
      if (this.entries.has(entry.id)) {
        throw new Error(`Duplicate rule catalog id: ${entry.id}`);
      }
      this.entries.set(entry.id, entry);
    }
  }

  listEntries(kind?: RuleCatalogEntry["kind"]): RuleCatalogEntry[] {
    return Array.from(this.entries.values()).filter((entry) => !kind || entry.kind === kind);
  }

  getEntry(id: string): RuleCatalogEntry | null {
    return this.entries.get(id) ?? null;
  }

  resolveRuntimeTags(featureIds: Iterable<string>): string[] {
    const tags = new Set<string>();
    for (const featureId of featureIds) {
      const normalizedId = featureId.trim();
      if (!normalizedId) {
        continue;
      }
      const entry = this.getEntry(normalizedId);
      if (!entry) {
        tags.add(normalizedId);
        const ancestry = normalizedId.startsWith("draconic_ancestry:")
          ? normalizedId.slice("draconic_ancestry:".length)
          : null;
        const damageType = ancestry
          ? DRACONIC_ANCESTRY_DAMAGE_TYPES[ancestry]
          : null;
        if (damageType) {
          tags.add(`resistance:${damageType}`);
        }
        continue;
      }
      entry.runtimeEffect.tags.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags);
  }

  getCharacterFeatureSnapshot(params: {
    raceKey?: string | null;
    classKey: string;
    subclassKey?: string | null;
    classLevel: number;
    requestedFeatureIds?: string[];
  }): RuleCatalogCharacterFeatureSnapshot {
    const normalizedRaceKey = params.raceKey ? this.normalizeRaceKey(params.raceKey) : null;
    const normalizedClassKey = this.normalizeClassKey(params.classKey);
    const normalizedSubclassKey = params.subclassKey
      ? this.normalizeSubclassKey(params.subclassKey)
      : null;
    const normalizedLevel = Math.max(Math.floor(params.classLevel), 0);
    const raceTraitIds = normalizedRaceKey
      ? this.listRaceTraits(normalizedRaceKey).map((trait) => trait.id)
      : [];
    const classFeatureIds = this.listClassFeaturesForLevel(normalizedClassKey, normalizedLevel)
      .map((feature) => feature.id);
    const subclassFeatureIds = normalizedSubclassKey
      ? this.listSubclassFeatures(normalizedClassKey, normalizedSubclassKey, normalizedLevel)
          .map((feature) => feature.id)
      : [];
    const customFeatureIds = (params.requestedFeatureIds ?? [])
      .map((feature) => feature.trim())
      .filter((feature) => feature.length > 0)
      .filter((feature) => !this.isCatalogFeatureId(feature));

    return {
      raceKey: normalizedRaceKey,
      classKey: normalizedClassKey,
      subclassKey: normalizedSubclassKey,
      classLevel: normalizedLevel,
      featureIds: Array.from(
        new Set([
          ...raceTraitIds,
          ...classFeatureIds,
          ...subclassFeatureIds,
          ...customFeatureIds,
        ]),
      ),
      raceTraitIds,
      classFeatureIds,
      subclassFeatureIds,
      customFeatureIds,
    };
  }

  listRaceTraits(raceKey: string): RuleCatalogEntry[] {
    const normalizedRaceKey = this.normalizeRaceKey(raceKey);
    const lineage = this.resolveRaceLineage(normalizedRaceKey);
    return this.listEntries("race_traits")
      .filter((entry) => entry.levelRequirement.raceKey && lineage.includes(entry.levelRequirement.raceKey))
      .sort((left, right) => {
        const leftIndex = lineage.indexOf(left.levelRequirement.raceKey ?? "");
        const rightIndex = lineage.indexOf(right.levelRequirement.raceKey ?? "");
        return leftIndex - rightIndex || left.id.localeCompare(right.id);
      });
  }

  getClassFeatureSnapshot(classKey: string, classLevel: number): RuleCatalogClassFeatureSnapshot {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const normalizedLevel = Math.max(Math.floor(classLevel), 0);
    const features = this.listClassFeaturesForLevel(normalizedClassKey, normalizedLevel);

    return {
      classKey: normalizedClassKey,
      classLevel: normalizedLevel,
      featureIds: features.map((feature) => feature.id),
      actionFeatureIds: features
        .filter((feature) =>
          this.isActionTrigger(feature.trigger) ||
          this.isActionCost(feature.cost) ||
          this.hasActionRuntimeTag(feature.runtimeEffect.tags),
        )
        .map((feature) => feature.id),
      resourceIds: Array.from(
        new Set(
          features
            .map((feature) => feature.runtimeEffect.resourceId)
            .filter((resourceId): resourceId is string => Boolean(resourceId)),
        ),
      ),
      passiveTags: Array.from(
        new Set(
          features
            .filter((feature) => feature.runtimeEffect.type === "grant_passive" || feature.cost.type === "none")
            .flatMap((feature) => feature.runtimeEffect.tags),
        ),
      ),
    };
  }

  listClassFeaturesForLevel(classKey: string, classLevel: number): RuleCatalogEntry[] {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const normalizedLevel = Math.max(Math.floor(classLevel), 0);

    return this.listEntries("class_features")
      .filter((entry) => entry.levelRequirement.classKey === normalizedClassKey)
      .filter((entry) => (entry.levelRequirement.minClassLevel ?? 1) <= normalizedLevel)
      .sort((left, right) => {
        const levelDelta = (left.levelRequirement.minClassLevel ?? 1) - (right.levelRequirement.minClassLevel ?? 1);
        return levelDelta || left.id.localeCompare(right.id);
      });
  }

  listSubclassFeatures(classKey: string, subclassKey: string, classLevel: number): RuleCatalogEntry[] {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const normalizedSubclassKey = this.normalizeSubclassKey(subclassKey);
    const normalizedLevel = Math.max(Math.floor(classLevel), 0);

    return this.listEntries("subclass_features")
      .filter((entry) => entry.levelRequirement.classKey === normalizedClassKey)
      .filter((entry) => entry.levelRequirement.subclassKey === normalizedSubclassKey)
      .filter((entry) => (entry.levelRequirement.minClassLevel ?? 1) <= normalizedLevel)
      .sort((left, right) => {
        const levelDelta = (left.levelRequirement.minClassLevel ?? 1) - (right.levelRequirement.minClassLevel ?? 1);
        return levelDelta;
      });
  }

  getSubclassChoiceLevel(classKey: string): number | null {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const levels = this.listEntries("subclass_features")
      .filter((entry) => entry.levelRequirement.classKey === normalizedClassKey)
      .map((entry) => entry.levelRequirement.minClassLevel ?? 1);
    return levels.length ? Math.min(...levels) : null;
  }

  listMonsterAbilities(monsterId: string): RuleCatalogEntry[] {
    const normalizedMonsterId = this.normalizeMonsterId(monsterId);
    return this.listEntries("monster_abilities")
      .filter((entry) => entry.levelRequirement.monsterId === normalizedMonsterId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  resolveMonsterRuntimeTags(monsterId: string): string[] {
    return Array.from(
      new Set(
        this.listMonsterAbilities(monsterId)
          .flatMap((entry) => entry.runtimeEffect.tags),
      ),
    );
  }

  private normalizeClassKey(classKey: string): string {
    const normalized = classKey.trim().toLowerCase().replace(/_/g, "-");
    if (!normalized) {
      throw new Error("classKey must not be empty.");
    }
    return normalized;
  }

  private normalizeRaceKey(raceKey: string): string {
    const normalized = raceKey.trim().toLowerCase().replace(/_/g, "-");
    if (!normalized) {
      throw new Error("raceKey must not be empty.");
    }
    return normalized;
  }

  private normalizeSubclassKey(subclassKey: string): string {
    const normalized = subclassKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) {
      throw new Error("subclassKey must not be empty.");
    }
    return normalized;
  }

  private resolveRaceLineage(raceKey: string): string[] {
    const lineage: string[] = [];
    const parentKey = RACE_PARENT_KEYS[raceKey];
    if (parentKey) {
      lineage.push(parentKey);
    }
    lineage.push(raceKey);
    return lineage;
  }

  private normalizeMonsterId(monsterId: string): string {
    const normalized = monsterId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) {
      throw new Error("monsterId must not be empty.");
    }
    return normalized.startsWith("monster.") ? normalized : `monster.${normalized}`;
  }

  private isActionTrigger(trigger: RuleCatalogEntry["trigger"]): boolean {
    return trigger === "action" || trigger === "bonus_action" || trigger === "reaction";
  }

  private isActionCost(cost: RuleCost): boolean {
    return cost.type === "action" || cost.type === "bonus_action" || cost.type === "reaction";
  }

  private hasActionRuntimeTag(tags: string[]): boolean {
    return tags.some(
      (tag) =>
        tag === "action:standard" ||
        tag === "action:bonus" ||
        tag === "action:reaction" ||
        tag === "action:free",
    );
  }

  private isCatalogFeatureId(feature: string): boolean {
    const normalized = feature.trim();
    return (
      /^race\.[a-z0-9-]+\.trait\.[a-z0-9_]+$/i.test(normalized) ||
      /^class\.[a-z0-9-]+\.feature\.[a-z0-9_]+$/i.test(normalized) ||
      /^subclass\.[a-z0-9-]+\.[a-z0-9_]+\.feature\.[a-z0-9_]+$/i.test(normalized)
    );
  }
}

function classFeature(
  classKey: string,
  level: number,
  featureKey: string,
  runtimeEffect: RuleRuntimeEffect,
  cost: RuleCost = NO_COST,
  targeting: RuleTargeting = NO_TARGETING,
  trigger?: RuleCatalogEntry["trigger"],
): ClassFeatureSeed {
  return {
    id: `class.${classKey}.feature.${featureKey}`,
    classKey,
    level,
    trigger: trigger ?? triggerFromCost(cost),
    cost,
    targeting,
    runtimeEffect,
  };
}

function toClassFeatureEntry(seed: ClassFeatureSeed): RuleCatalogEntry {
  return {
    id: seed.id,
    kind: "class_features",
    source: "SRD5E",
    levelRequirement: {
      classKey: seed.classKey,
      minClassLevel: seed.level,
    },
    trigger: seed.trigger ?? "always",
    cost: seed.cost ?? NO_COST,
    targeting: seed.targeting ?? NO_TARGETING,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: seed.runtimeEffect,
  };
}

function raceTrait(
  raceKey: string,
  traitKey: string,
  tags: string[],
  options: Partial<
    Pick<
      RuleCatalogEntry,
      "trigger" | "cost" | "targeting" | "save" | "damage" | "duration" | "scaling"
    >
  > = {},
): RuleCatalogEntry {
  return {
    id: `race.${raceKey}.trait.${traitKey}`,
    kind: "race_traits",
    source: "SRD5E",
    levelRequirement: {
      raceKey,
    },
    trigger: options.trigger ?? "character_creation",
    cost: options.cost ?? NO_COST,
    targeting: options.targeting ?? SELF_TARGETING,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: false,
    scaling: options.scaling ?? null,
    runtimeEffect: {
      type: "race_trait",
      tags,
    },
  };
}

function subclassFeature(
  classKey: string,
  subclassKey: string,
  level: number,
  featureKey: string,
  runtimeEffect: RuleRuntimeEffect,
  cost: RuleCost = NO_COST,
  targeting: RuleTargeting = NO_TARGETING,
): RuleCatalogEntry {
  return {
    id: `subclass.${classKey}.${subclassKey}.feature.${featureKey}`,
    kind: "subclass_features",
    source: "SRD5E",
    levelRequirement: {
      classKey,
      subclassKey,
      minClassLevel: level,
    },
    trigger: triggerFromCost(cost),
    cost,
    targeting,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect,
  };
}

function condition(id: string, tags: string[]): RuleCatalogEntry {
  return {
    id,
    kind: "condition_definitions",
    source: "SRD5E",
    levelRequirement: {},
    trigger: "always",
    cost: NO_COST,
    targeting: SELF_TARGETING,
    save: null,
    damage: null,
    duration: { unit: "permanent", amount: null },
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "condition",
      tags,
    },
  };
}

function terrainEffect(id: string, tags: string[]): RuleCatalogEntry {
  return {
    id,
    kind: "terrain_effects",
    source: "SRD5E",
    levelRequirement: {},
    trigger: "always",
    cost: NO_COST,
    targeting: NO_TARGETING,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "terrain_effect",
      tags,
    },
  };
}

function spell(
  id: string,
  options: {
    level: number;
    cost: RuleCost;
    targeting: RuleTargeting;
    damage?: RuleCatalogEntry["damage"];
    duration?: RuleCatalogEntry["duration"];
    concentration?: boolean;
    save?: RuleCatalogEntry["save"];
    tags: string[];
    hookId: string;
    scaling?: RuleCatalogEntry["scaling"];
  },
): RuleCatalogEntry {
  return {
    id,
    kind: "spell_definitions",
    source: "SRD5E",
    levelRequirement: options.level === 0 ? { minCharacterLevel: 1 } : {},
    trigger: triggerFromCost(options.cost),
    cost: options.cost,
    targeting: options.targeting,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: options.concentration ?? false,
    scaling: options.scaling ?? null,
    runtimeEffect: {
      type: "spell",
      tags: [`spell_level:${options.level}`, ...options.tags],
      hookId: options.hookId,
    },
  };
}

function monsterAbility(
  id: string,
  options: {
    monsterId: string;
    cost: RuleCost;
    targeting: RuleTargeting;
    damage?: RuleCatalogEntry["damage"];
    save?: RuleCatalogEntry["save"];
    duration?: RuleCatalogEntry["duration"];
    tags: string[];
    hookId: string;
    scaling?: RuleCatalogEntry["scaling"];
  },
): RuleCatalogEntry {
  return {
    id,
    kind: "monster_abilities",
    source: "SRD5E",
    levelRequirement: {
      monsterId: options.monsterId,
    },
    trigger: triggerFromCost(options.cost),
    cost: options.cost,
    targeting: options.targeting,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: false,
    scaling: options.scaling ?? null,
    runtimeEffect: {
      type: "monster_ability",
      tags: options.tags,
      hookId: options.hookId,
    },
  };
}

function triggerFromCost(cost: RuleCost): RuleCatalogEntry["trigger"] {
  if (cost.type === "action") {
    return "action";
  }
  if (cost.type === "bonus_action") {
    return "bonus_action";
  }
  if (cost.type === "reaction") {
    return "reaction";
  }
  return "always";
}
