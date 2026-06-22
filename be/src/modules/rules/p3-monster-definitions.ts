import {
  RuleCatalogEntry,
  RuleCost,
  RuleTargeting,
} from "./rule-catalog.types";

type MonsterAbilityOptions = {
  monsterId: string;
  cost?: RuleCost;
  targeting: RuleTargeting;
  save?: RuleCatalogEntry["save"];
  damage?: RuleCatalogEntry["damage"];
  duration?: RuleCatalogEntry["duration"];
  tags: string[];
  hookId?: string;
};

const ACTION: RuleCost = { type: "action" };
const NONE: RuleCost = { type: "none" };
const SELF: RuleTargeting = { type: "self" };

export const P3_EXECUTABLE_MONSTER_IDS = [
  "monster.black_bear",
  "monster.lion",
  "monster.tiger",
  "monster.troll",
  "monster.hill_giant",
  "monster.giant_eagle",
  "monster.giant_owl",
  "monster.manticore",
  "monster.griffon",
  "monster.merrow",
  "monster.acolyte",
  "monster.mage",
  "monster.priest",
  "monster.cult_fanatic",
  "monster.mummy",
  "monster.specter",
  "monster.ghost",
  "monster.stone_golem",
  "monster.water_elemental",
  "monster.swarm_of_insects",
  "monster.quasit",
  "monster.basilisk",
  "monster.wyvern",
  "monster.young_blue_dragon",
] as const;

function ability(
  id: string,
  options: MonsterAbilityOptions,
): RuleCatalogEntry {
  return {
    id: `${options.monsterId}.ability.${id}`,
    kind: "monster_abilities",
    source: "SRD5E",
    levelRequirement: { monsterId: options.monsterId },
    trigger:
      options.cost?.type === "bonus_action"
        ? "bonus_action"
        : options.cost?.type === "reaction"
          ? "reaction"
          : options.cost?.type === "none"
            ? "always"
            : "action",
    cost: options.cost ?? ACTION,
    targeting: options.targeting,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "monster_ability",
      tags: options.tags,
      hookId: options.hookId ?? "hook.monster.attack",
    },
  };
}

const melee = (
  monsterId: string,
  id: string,
  attackBonus: number,
  damageDice: string,
  damageType: string,
  tags: string[] = [],
  rangeFt = 5,
) =>
  ability(id, {
    monsterId,
    targeting: { type: "creature", rangeFt },
    damage: { dice: damageDice, type: damageType },
    tags: [
      "attack:melee_weapon",
      `attack_bonus:+${attackBonus}`,
      `srd_action_id:action.${id}`,
      ...tags,
    ],
  });

const ranged = (
  monsterId: string,
  id: string,
  attackBonus: number,
  damageDice: string,
  damageType: string,
  rangeFt: number,
  longRangeFt: number,
  tags: string[] = [],
) =>
  ability(id, {
    monsterId,
    targeting: { type: "creature", rangeFt },
    damage: { dice: damageDice, type: damageType },
    tags: [
      "attack:ranged_weapon",
      `attack_bonus:+${attackBonus}`,
      `range_long:${longRangeFt}`,
      `srd_action_id:action.${id}`,
      ...tags,
    ],
  });

const multiattack = (
  monsterId: string,
  children: string[],
) =>
  ability("multiattack", {
    monsterId,
    targeting: SELF,
    tags: children.map((child) => `multiattack:${child}`),
    hookId: "hook.monster.multiattack",
  });

export const P3_MONSTER_ABILITY_DEFINITIONS: RuleCatalogEntry[] = [
  melee("monster.black_bear", "bite", 3, "1d6+2", "piercing"),
  melee("monster.black_bear", "claws", 3, "2d4+2", "slashing"),
  multiattack("monster.black_bear", ["action.bite:1", "action.claws:1"]),

  melee("monster.lion", "bite", 5, "1d8+3", "piercing", [
    "condition:prone",
    "save:str",
  ]),
  melee("monster.lion", "claw", 5, "1d6+3", "slashing"),
  multiattack("monster.lion", ["action.bite:1", "action.claw:1"]),

  melee("monster.tiger", "bite", 5, "1d10+3", "piercing", [
    "condition:grappled",
    "effect:escape_dc:13",
  ]),
  melee("monster.tiger", "claw", 5, "1d8+3", "slashing"),
  multiattack("monster.tiger", ["action.bite:1", "action.claw:1"]),

  melee("monster.troll", "bite", 7, "1d6+4", "piercing"),
  melee("monster.troll", "claw", 7, "2d6+4", "slashing"),
  multiattack("monster.troll", ["action.bite:1", "action.claw:2"]),
  ability("regeneration", {
    monsterId: "monster.troll",
    cost: NONE,
    targeting: SELF,
    tags: [
      "trigger:on_turn_start",
      "healing:10",
      "suppressed_by:acid",
      "suppressed_by:fire",
      "aura:regeneration",
    ],
    hookId: "hook.monster.passive",
  }),

  melee("monster.hill_giant", "greatclub", 8, "3d8+5", "bludgeoning", [], 10),
  ranged(
    "monster.hill_giant",
    "rock",
    8,
    "3d10+5",
    "bludgeoning",
    60,
    240,
  ),

  melee("monster.giant_eagle", "beak", 5, "1d6+3", "piercing"),
  melee("monster.giant_eagle", "talons", 5, "2d6+3", "slashing"),
  multiattack("monster.giant_eagle", ["action.beak:1", "action.talons:1"]),
  ability("flyby", {
    monsterId: "monster.giant_eagle",
    cost: NONE,
    targeting: SELF,
    tags: ["movement:fly:80", "passive:flyby", "aura:flyby"],
    hookId: "hook.monster.passive",
  }),

  melee("monster.giant_owl", "talons", 3, "2d6+1", "slashing"),
  ability("flyby", {
    monsterId: "monster.giant_owl",
    cost: NONE,
    targeting: SELF,
    tags: ["movement:fly:60", "passive:flyby", "aura:flyby"],
    hookId: "hook.monster.passive",
  }),

  melee("monster.manticore", "bite", 5, "1d8+3", "piercing"),
  melee("monster.manticore", "claw", 5, "1d6+3", "slashing"),
  ranged(
    "monster.manticore",
    "tail_spike",
    5,
    "1d8+3",
    "piercing",
    100,
    200,
    ["usage:24/day"],
  ),
  multiattack("monster.manticore", [
    "action.bite:1",
    "action.claw:2",
  ]),

  melee("monster.griffon", "beak", 6, "1d8+4", "piercing"),
  melee("monster.griffon", "claws", 6, "2d6+4", "slashing"),
  multiattack("monster.griffon", ["action.beak:1", "action.claws:1"]),
  ability("aerial_hunter", {
    monsterId: "monster.griffon",
    cost: NONE,
    targeting: SELF,
    tags: ["movement:fly:80", "aura:aerial_hunter"],
    hookId: "hook.monster.passive",
  }),

  melee("monster.merrow", "bite", 6, "1d8+4", "piercing"),
  melee("monster.merrow", "claws", 6, "2d4+4", "slashing"),
  ranged(
    "monster.merrow",
    "harpoon",
    6,
    "2d6+4",
    "piercing",
    20,
    60,
    ["effect:forced_movement:pull:20", "movement:swim:40"],
  ),
  multiattack("monster.merrow", ["action.bite:1", "action.claws:1"]),

  melee("monster.acolyte", "club", 2, "1d4", "bludgeoning"),
  ranged(
    "monster.acolyte",
    "sacred_flame",
    4,
    "1d8",
    "radiant",
    60,
    60,
    ["usage:at_will", "spell:spell.sacred_flame"],
  ),

  ranged(
    "monster.mage",
    "arcane_bolt",
    6,
    "2d10",
    "force",
    120,
    120,
    ["spell:arcane_bolt"],
  ),
  ability("fireball", {
    monsterId: "monster.mage",
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 14 },
    damage: { dice: "8d6", type: "fire" },
    tags: [
      "area:sphere",
      "save:dex",
      "half_damage_on_success",
      "usage:3/day",
      "spell:spell.fireball",
      "srd_action_id:action.fireball",
    ],
    hookId: "hook.monster.area_attack",
  }),

  melee("monster.priest", "mace", 4, "1d6+2", "bludgeoning"),
  ranged(
    "monster.priest",
    "radiant_bolt",
    5,
    "3d8",
    "radiant",
    60,
    120,
    ["usage:3/day", "spell:spell.guiding_bolt"],
  ),
  ability("healing_prayer", {
    monsterId: "monster.priest",
    cost: { type: "bonus_action" },
    targeting: SELF,
    tags: [
      "usage:3/day",
      "healing:2d4+3",
      "aura:healing_prayer",
      "trigger:on_turn_start",
    ],
    hookId: "hook.monster.passive",
  }),

  melee("monster.cult_fanatic", "dagger", 4, "1d4+2", "piercing"),
  ability("hold_person", {
    monsterId: "monster.cult_fanatic",
    targeting: { type: "area", shape: "sphere", sizeFt: 60 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 13 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:paralyzed",
      "save_ends",
      "usage:2/day",
      "spell:spell.hold_person",
      "srd_action_id:action.hold_person",
    ],
    hookId: "hook.monster.area_effect",
  }),

  melee("monster.mummy", "rotting_fist", 5, "2d6+3", "bludgeoning", [
    "damage:necrotic_component:3d6",
    "condition:mummy_rot",
    "save:con",
  ]),
  ability("dreadful_glare", {
    monsterId: "monster.mummy",
    targeting: { type: "area", shape: "sphere", sizeFt: 60 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 11 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:frightened",
      "condition:paralyzed",
      "usage:1/day",
      "srd_action_id:action.dreadful_glare",
    ],
    hookId: "hook.monster.area_effect",
  }),

  melee("monster.specter", "life_drain", 4, "3d6", "necrotic", [
    "effect:max_hp_reduction:damage",
  ]),
  ability("incorporeal_movement", {
    monsterId: "monster.specter",
    cost: NONE,
    targeting: SELF,
    tags: [
      "movement:fly:50",
      "movement:pass_through_creatures_and_objects",
      "resistance:nonmagical_damage",
      "aura:incorporeal",
    ],
    hookId: "hook.monster.passive",
  }),

  melee("monster.ghost", "withering_touch", 5, "4d6+3", "necrotic"),
  ability("horrifying_visage", {
    monsterId: "monster.ghost",
    targeting: { type: "area", shape: "sphere", sizeFt: 60 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 13 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:frightened",
      "save_ends",
      "srd_action_id:action.horrifying_visage",
    ],
    hookId: "hook.monster.area_effect",
  }),
  ability("possession", {
    monsterId: "monster.ghost",
    targeting: { type: "area", shape: "sphere", sizeFt: 5 },
    save: { ability: "cha", dcSource: "fixed", fixedDc: 13 },
    duration: { unit: "minute", amount: 10 },
    tags: [
      "area:sphere",
      "condition:possessed",
      "usage:1/day",
      "srd_action_id:action.possession",
    ],
    hookId: "hook.monster.area_effect",
  }),

  melee("monster.stone_golem", "slam", 10, "3d8+6", "bludgeoning"),
  multiattack("monster.stone_golem", ["action.slam:2"]),
  ability("slow", {
    monsterId: "monster.stone_golem",
    targeting: { type: "area", shape: "sphere", sizeFt: 10 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 17 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:slowed",
      "save_ends",
      "recharge:5-6",
      "srd_action_id:action.slow",
    ],
    hookId: "hook.monster.area_effect",
  }),
  ability("construct_defenses", {
    monsterId: "monster.stone_golem",
    cost: NONE,
    targeting: SELF,
    tags: [
      "immunity:poison",
      "immunity:psychic",
      "immunity:condition:paralyzed",
      "immunity:condition:poisoned",
      "aura:construct_defenses",
    ],
    hookId: "hook.monster.passive",
  }),

  melee("monster.water_elemental", "slam", 7, "2d8+4", "bludgeoning"),
  multiattack("monster.water_elemental", ["action.slam:2"]),
  ability("whelm", {
    monsterId: "monster.water_elemental",
    targeting: { type: "area", shape: "cube", sizeFt: 10 },
    save: { ability: "str", dcSource: "fixed", fixedDc: 15 },
    damage: { dice: "2d8+4", type: "bludgeoning" },
    tags: [
      "area:cube",
      "condition:grappled",
      "condition:restrained",
      "recharge:4-6",
      "movement:swim:90",
      "srd_action_id:action.whelm",
    ],
    hookId: "hook.monster.area_attack",
  }),

  melee("monster.swarm_of_insects", "bites", 3, "4d4", "piercing", [
    "swarm:half_hp_damage:2d4",
  ]),
  ability("swarm_defenses", {
    monsterId: "monster.swarm_of_insects",
    cost: NONE,
    targeting: SELF,
    tags: [
      "resistance:bludgeoning",
      "resistance:piercing",
      "resistance:slashing",
      "immunity:condition:grappled",
      "immunity:condition:prone",
      "immunity:condition:restrained",
      "aura:swarm",
    ],
    hookId: "hook.monster.passive",
  }),

  melee("monster.quasit", "claws", 4, "1d4+3", "slashing", [
    "condition:poisoned",
    "save:con",
  ]),
  ability("scare", {
    monsterId: "monster.quasit",
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    save: { ability: "wis", dcSource: "fixed", fixedDc: 10 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:frightened",
      "usage:1/day",
      "srd_action_id:action.scare",
    ],
    hookId: "hook.monster.area_effect",
  }),

  melee("monster.basilisk", "bite", 5, "2d6+3", "piercing", [
    "damage:poison_component:2d6",
  ]),
  ability("petrifying_gaze", {
    monsterId: "monster.basilisk",
    targeting: { type: "area", shape: "sphere", sizeFt: 30 },
    save: { ability: "con", dcSource: "fixed", fixedDc: 12 },
    duration: { unit: "minute", amount: 1 },
    tags: [
      "area:sphere",
      "condition:restrained",
      "condition:petrified",
      "save_ends",
      "aura:petrifying_gaze",
      "trigger:on_turn_start",
      "srd_action_id:action.petrifying_gaze",
    ],
    hookId: "hook.monster.area_effect",
  }),

  melee("monster.wyvern", "bite", 7, "2d6+4", "piercing"),
  melee("monster.wyvern", "claws", 7, "2d8+4", "slashing"),
  melee("monster.wyvern", "stinger", 7, "2d6+4", "piercing", [
    "damage:poison_component:7d6",
    "save:con",
  ], 10),
  multiattack("monster.wyvern", ["action.bite:1", "action.stinger:1"]),
  ability("aerial_predator", {
    monsterId: "monster.wyvern",
    cost: NONE,
    targeting: SELF,
    tags: ["movement:fly:80", "aura:aerial_predator"],
    hookId: "hook.monster.passive",
  }),

  melee("monster.young_blue_dragon", "bite", 9, "2d10+5", "piercing", [
    "damage:lightning_component:1d10",
  ], 10),
  melee("monster.young_blue_dragon", "claw", 9, "2d6+5", "slashing"),
  multiattack("monster.young_blue_dragon", [
    "action.bite:1",
    "action.claw:2",
  ]),
  ability("lightning_breath", {
    monsterId: "monster.young_blue_dragon",
    targeting: { type: "area", shape: "line", sizeFt: 60 },
    save: { ability: "dex", dcSource: "fixed", fixedDc: 16 },
    damage: { dice: "10d10", type: "lightning" },
    tags: [
      "area:line",
      "save:dex",
      "half_damage_on_success",
      "recharge:5-6",
      "srd_action_id:action.lightning_breath",
    ],
    hookId: "hook.monster.area_attack",
  }),
  ability("storm_phase", {
    monsterId: "monster.young_blue_dragon",
    cost: NONE,
    targeting: SELF,
    tags: [
      "movement:fly:80",
      "immunity:lightning",
      "aura:storm_phase",
      "trigger:on_turn_start",
      "phase:below_half_hp",
      "terrain:lair_lightning",
    ],
    hookId: "hook.monster.passive",
  }),
];
