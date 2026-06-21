import { Injectable } from "@nestjs/common";
import {
  RuleCatalogClassFeatureSnapshot,
  RuleCatalogCharacterFeatureSnapshot,
  RuleCatalogEntry,
  RuleCost,
  RuleRuntimeEffect,
  RuleTargeting,
} from "./rule-catalog.types";

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

  raceTrait("dragonborn", "base_traits", [
    "fixed:ability:str:+2",
    "fixed:ability:cha:+1",
    "fixed:size:medium",
    "fixed:speed:30",
    "language:common",
    "language:draconic",
    "selection:draconic_ancestry",
    "action:breath_weapon",
    "resistance:ancestry_damage_type",
  ]),

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
  subclassFeature("bard", "lore", 3, "bonus_proficiencies", {
    type: "subclass_feature",
    tags: ["proficiency:skill:choice_three"],
  }),
  subclassFeature("bard", "lore", 3, "cutting_words", {
    type: "subclass_feature",
    tags: ["action:reaction", "resource:bardic_inspiration", "debuff:attack_check_damage_roll"],
    resourceId: "resource.bard.bardic_inspiration",
  }, { type: "reaction" }, { type: "creature", rangeFt: 60 }),
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
  subclassFeature("druid", "land", 2, "bonus_cantrip", {
    type: "subclass_feature",
    tags: ["spellcasting:cantrip:druid:choice_one"],
  }),
  subclassFeature("druid", "land", 2, "natural_recovery", {
    type: "subclass_feature",
    tags: ["rest:short", "recover:spell_slots:half_druid_level"],
  }),
  subclassFeature("fighter", "champion", 3, "improved_critical", {
    type: "subclass_feature",
    tags: [
      "legacy_feature_id:class.fighter.subclass_feature.improved_critical",
      "critical_range:19_20",
      "attack:weapon",
    ],
  }),
  subclassFeature("monk", "open_hand", 3, "open_hand_technique", {
    type: "subclass_feature",
    tags: ["flurry_of_blows:rider", "save:dex_prone", "save:str_push_15", "reaction:block"],
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
  subclassFeature("ranger", "hunter", 3, "hunters_prey", {
    type: "subclass_feature",
    tags: ["selection:hunters_prey", "option:colossus_slayer", "option:giant_killer", "option:horde_breaker"],
  }),
  subclassFeature("rogue", "thief", 3, "fast_hands", {
    type: "subclass_feature",
    tags: ["cunning_action:bonus_use_object", "cunning_action:bonus_sleight_of_hand", "cunning_action:bonus_thieves_tools"],
  }, { type: "bonus_action" }, SELF_TARGETING),
  subclassFeature("rogue", "thief", 3, "second_story_work", {
    type: "subclass_feature",
    tags: ["climb_speed:normal", "jump_bonus:dex_mod"],
  }),
  subclassFeature("sorcerer", "draconic_bloodline", 1, "dragon_ancestor", {
    type: "subclass_feature",
    tags: ["selection:dragon_ancestor", "language:draconic"],
  }),
  subclassFeature("sorcerer", "draconic_bloodline", 1, "draconic_resilience", {
    type: "subclass_feature",
    tags: ["hp_bonus:per_sorcerer_level:+1", "armor_class:13_plus_dex_unarmored"],
  }),
  subclassFeature("warlock", "fiend", 1, "expanded_spell_list", {
    type: "subclass_feature",
    tags: ["spell_list:fiend_expanded"],
  }),
  subclassFeature("warlock", "fiend", 1, "dark_ones_blessing", {
    type: "subclass_feature",
    tags: ["trigger:reduce_hostile_to_zero_hp", "temporary_hp:cha_mod_plus_warlock_level"],
  }),
  subclassFeature("wizard", "evocation", 2, "evocation_savant", {
    type: "subclass_feature",
    tags: ["spellbook:copy_cost_half", "school:evocation"],
  }),
  subclassFeature("wizard", "evocation", 2, "sculpt_spells", {
    type: "subclass_feature",
    tags: ["evocation:protect_allies", "save:auto_success", "damage:none_on_success"],
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
      ...MONSTER_ABILITY_DEFINITIONS,
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

function raceTrait(raceKey: string, traitKey: string, tags: string[]): RuleCatalogEntry {
  return {
    id: `race.${raceKey}.trait.${traitKey}`,
    kind: "race_traits",
    source: "SRD5E",
    levelRequirement: {
      raceKey,
    },
    trigger: "character_creation",
    cost: NO_COST,
    targeting: SELF_TARGETING,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
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
