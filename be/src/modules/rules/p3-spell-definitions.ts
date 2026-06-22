import {
  RuleCatalogEntry,
  RuleCost,
  RuleTargeting,
} from "./rule-catalog.types";

type SpellOptions = {
  level: number;
  cost?: RuleCost;
  targeting: RuleTargeting;
  damage?: RuleCatalogEntry["damage"];
  duration?: RuleCatalogEntry["duration"];
  concentration?: boolean;
  save?: RuleCatalogEntry["save"];
  tags: string[];
  scaling?: RuleCatalogEntry["scaling"];
};

const ACTION: RuleCost = { type: "action" };
const BONUS_ACTION: RuleCost = { type: "bonus_action" };
const SELF: RuleTargeting = { type: "self" };

function p3Spell(id: string, options: SpellOptions): RuleCatalogEntry {
  return {
    id: `spell.${id}`,
    kind: "spell_definitions",
    source: "SRD5E",
    levelRequirement:
      options.level === 0 ? { minCharacterLevel: 1 } : {},
    trigger:
      options.cost?.type === "bonus_action"
        ? "bonus_action"
        : options.cost?.type === "reaction"
          ? "reaction"
          : "action",
    cost: options.cost ?? ACTION,
    targeting: options.targeting,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: options.concentration ?? false,
    scaling: options.scaling ?? null,
    runtimeEffect: {
      type: "spell",
      tags: [`spell_level:${options.level}`, ...options.tags],
      hookId: `hook.spell.cast_${id}`,
    },
  };
}

export const P3_SPELL_DEFINITIONS: RuleCatalogEntry[] = [
  p3Spell("blade_ward", {
    level: 0,
    targeting: SELF,
    duration: { unit: "round", amount: 1 },
    tags: [
      "resistance:bludgeoning",
      "resistance:piercing",
      "resistance:slashing",
      "source:weapon_attack",
    ],
  }),
  p3Spell("dancing_lights", {
    level: 0,
    targeting: { type: "area", shape: "sphere", sizeFt: 10 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:120", "summon:lights:4", "light:dim:10", "movable:bonus_action"],
  }),
  p3Spell("eldritch_blast", {
    level: 0,
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "1d10", type: "force", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["spell_attack:ranged", "damage:force", "beam_count:character_level"],
    scaling: {
      mode: "character_level",
      table: { 5: "2d10", 11: "3d10", 17: "4d10" },
    },
  }),
  p3Spell("friends", {
    level: 0,
    targeting: SELF,
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["advantage:ability_check:cha:social", "target:nonhostile"],
  }),
  p3Spell("mending", {
    level: 0,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "instant", amount: null },
    tags: ["utility:repair_object", "repair:max_break:1ft"],
  }),
  p3Spell("message", {
    level: 0,
    targeting: { type: "creature", rangeFt: 120 },
    duration: { unit: "round", amount: 1 },
    tags: ["utility:private_message", "reply:allowed"],
  }),
  p3Spell("poison_spray", {
    level: 0,
    targeting: { type: "creature", rangeFt: 10 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    damage: { dice: "1d12", type: "poison", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["save:con", "damage:poison", "no_damage_on_success"],
    scaling: {
      mode: "character_level",
      table: { 5: "2d12", 11: "3d12", 17: "4d12" },
    },
  }),
  p3Spell("produce_flame", {
    level: 0,
    targeting: { type: "creature", rangeFt: 30 },
    damage: { dice: "1d8", type: "fire", scaling: "character_level" },
    duration: { unit: "minute", amount: 10 },
    tags: ["spell_attack:ranged", "damage:fire", "light:bright:10", "light:dim:10"],
    scaling: {
      mode: "character_level",
      table: { 5: "2d8", 11: "3d8", 17: "4d8" },
    },
  }),
  p3Spell("resistance", {
    level: 0,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["roll_bonus:saving_throw:1d4"],
  }),
  p3Spell("spare_the_dying", {
    level: 0,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "instant", amount: null },
    tags: ["stabilize:dying", "healing:none"],
  }),

  p3Spell("alarm", {
    level: 1,
    targeting: { type: "area", shape: "cube", sizeFt: 20 },
    duration: { unit: "hour", amount: 8 },
    tags: ["ritual", "ward:alarm", "trigger:creature_enters", "range:30"],
  }),
  p3Spell("animal_friendship", {
    level: 1,
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "hour", amount: 24 },
    tags: ["save:wis", "condition:charmed", "target:beast"],
  }),
  p3Spell("armor_of_agathys", {
    level: 1,
    targeting: SELF,
    duration: { unit: "hour", amount: 1 },
    tags: ["temporary_hp:5", "retaliation_damage:cold:5"],
    scaling: {
      mode: "slot_level",
      table: { mode: "flat_bonus", amount: 5, perSlotAbove: 5 },
    },
  }),
  p3Spell("color_spray", {
    level: 1,
    targeting: { type: "area", shape: "cone", sizeFt: 15 },
    duration: { unit: "round", amount: 1 },
    tags: ["range:15", "hit_point_pool:6d10", "condition:blinded", "lowest_hp_first"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "2d10", perSlotAbove: 1 },
    },
  }),
  p3Spell("comprehend_languages", {
    level: 1,
    targeting: SELF,
    duration: { unit: "hour", amount: 1 },
    tags: ["ritual", "utility:understand_languages"],
  }),
  p3Spell("create_or_destroy_water", {
    level: 1,
    targeting: { type: "area", shape: "cube", sizeFt: 30 },
    duration: { unit: "instant", amount: null },
    tags: ["range:30", "utility:create_water:gallons:10", "utility:destroy_water:gallons:10"],
  }),
  p3Spell("expeditious_retreat", {
    level: 1,
    cost: BONUS_ACTION,
    targeting: SELF,
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["grant:bonus_action_dash"],
  }),
  p3Spell("false_life", {
    level: 1,
    targeting: SELF,
    duration: { unit: "hour", amount: 1 },
    damage: { dice: "1d4+4", type: "temporary_hp", scaling: "slot_level" },
    tags: ["temporary_hp:roll"],
    scaling: {
      mode: "slot_level",
      table: { mode: "flat_bonus", amount: 5, perSlotAbove: 5 },
    },
  }),
  p3Spell("find_familiar", {
    level: 1,
    targeting: SELF,
    duration: { unit: "permanent", amount: null },
    tags: ["ritual", "summon:familiar", "lifecycle:until_dismissed_or_zero_hp"],
  }),
  p3Spell("goodberry", {
    level: 1,
    targeting: SELF,
    duration: { unit: "hour", amount: 24 },
    tags: ["create:item.goodberry:10", "healing:1", "nutrition:day"],
  }),
  p3Spell("jump", {
    level: 1,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "minute", amount: 1 },
    tags: ["jump_distance_multiplier:3"],
  }),
  p3Spell("mage_armor", {
    level: 1,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 8 },
    tags: ["armor_class:13_plus_dex_unarmored"],
  }),

  p3Spell("alter_self", {
    level: 2,
    targeting: SELF,
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["selection:aquatic_adaptation_or_appearance_or_natural_weapons"],
  }),
  p3Spell("blur", {
    level: 2,
    targeting: SELF,
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["disadvantage:incoming_attack:vision"],
  }),
  p3Spell("darkvision", {
    level: 2,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 8 },
    tags: ["vision:darkvision:60"],
  }),
  p3Spell("enhance_ability", {
    level: 2,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["selection:ability", "advantage:ability_check:selected"],
  }),
  p3Spell("enlarge_reduce", {
    level: 2,
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["selection:enlarge_or_reduce", "damage_bonus:1d4", "size:one_step"],
  }),
  p3Spell("flaming_sphere", {
    level: 2,
    targeting: { type: "area", shape: "sphere", sizeFt: 5 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "2d6", type: "fire", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:60", "save:dex", "damage:fire", "half_damage_on_success", "movable:bonus_action"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 },
    },
  }),
  p3Spell("gust_of_wind", {
    level: 2,
    targeting: { type: "area", shape: "line", sizeFt: 60 },
    save: { ability: "str", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["save:str", "forced_movement:push:15", "terrain:terrain.difficult"],
  }),
  p3Spell("heat_metal", {
    level: 2,
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    damage: { dice: "2d8", type: "fire", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["damage:fire", "repeat:bonus_action", "save:con:drop_object_or_disadvantage"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 },
    },
  }),
  p3Spell("levitate", {
    level: 2,
    targeting: { type: "creature", rangeFt: 60 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["movement:vertical:20", "condition:levitating"],
  }),
  p3Spell("locate_object", {
    level: 2,
    targeting: SELF,
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["detect:object:1000", "blocked:lead"],
  }),
  p3Spell("mirror_image", {
    level: 2,
    targeting: SELF,
    duration: { unit: "minute", amount: 1 },
    tags: ["defense:mirror_images:3", "redirect:incoming_attack"],
  }),
  p3Spell("spider_climb", {
    level: 2,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["movement:climb_speed:walking", "movement:ceiling"],
  }),

  p3Spell("call_lightning", {
    level: 3,
    targeting: { type: "area", shape: "sphere", sizeFt: 5 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "3d10", type: "lightning", scaling: "slot_level" },
    duration: { unit: "minute", amount: 10 },
    concentration: true,
    tags: ["range:120", "save:dex", "damage:lightning", "half_damage_on_success", "repeat:action"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d10", perSlotAbove: 1 },
    },
  }),
  p3Spell("fear", {
    level: 3,
    targeting: { type: "area", shape: "cone", sizeFt: 30 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:30", "save:wis", "condition:frightened", "forced_movement:flee"],
  }),
  p3Spell("gaseous_form", {
    level: 3,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["movement:flying_speed:10", "movement:pass_small_openings", "resistance:nonmagical_damage"],
  }),
  p3Spell("plant_growth", {
    level: 3,
    targeting: { type: "area", shape: "sphere", sizeFt: 100 },
    duration: { unit: "permanent", amount: null },
    tags: ["range:150", "terrain:movement_cost_multiplier:4", "vegetation:overgrowth"],
  }),
  p3Spell("protection_from_energy", {
    level: 3,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["selection:acid_cold_fire_lightning_thunder", "resistance:selected_damage_type"],
  }),
  p3Spell("sleet_storm", {
    level: 3,
    targeting: { type: "area", shape: "sphere", sizeFt: 40 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:150", "terrain:terrain.slippery", "terrain:terrain.obscurement", "save:dex", "condition:prone"],
  }),
  p3Spell("slow", {
    level: 3,
    targeting: { type: "area", shape: "cube", sizeFt: 40 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:120", "save:wis", "save_ends", "target_count:6", "armor_class:-2", "speed_multiplier:0.5", "action_limit:one"],
  }),
  p3Spell("water_walk", {
    level: 3,
    targeting: { type: "creature", rangeFt: 30 },
    duration: { unit: "hour", amount: 1 },
    tags: ["ritual", "target_count:10", "movement:walk_on_liquid"],
  }),

  p3Spell("blight", {
    level: 4,
    targeting: { type: "creature", rangeFt: 30 },
    save: { ability: "con", dcSource: "spell_save_dc" },
    damage: { dice: "8d8", type: "necrotic", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["save:con", "damage:necrotic", "half_damage_on_success", "plant:max_damage"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 },
    },
  }),
  p3Spell("death_ward", {
    level: 4,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 8 },
    tags: ["trigger:drop_to_zero_hp", "set_hp:1", "trigger:instant_death", "negate:once"],
  }),
  p3Spell("dimension_door", {
    level: 4,
    targeting: SELF,
    duration: { unit: "instant", amount: null },
    tags: ["teleport:self:500", "teleport:carry_one_creature"],
  }),
  p3Spell("freedom_of_movement", {
    level: 4,
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    tags: ["immunity:movement_reduction", "escape:grapple_restrained:5ft", "movement:underwater_normal"],
  }),
  p3Spell("ice_storm", {
    level: 4,
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "2d8+4d6", type: "cold", scaling: "slot_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["range:300", "save:dex", "damage:cold", "half_damage_on_success", "terrain:terrain.difficult"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 },
    },
  }),
  p3Spell("locate_creature", {
    level: 4,
    targeting: SELF,
    duration: { unit: "hour", amount: 1 },
    concentration: true,
    tags: ["detect:creature:1000", "blocked:running_water"],
  }),
  p3Spell("phantasmal_killer", {
    level: 4,
    targeting: { type: "creature", rangeFt: 120 },
    save: { ability: "wis", dcSource: "spell_save_dc" },
    damage: { dice: "4d10", type: "psychic", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["save:wis", "condition:frightened", "damage:psychic", "trigger:turn_end", "save_ends"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d10", perSlotAbove: 1 },
    },
  }),
  p3Spell("wall_of_fire", {
    level: 4,
    targeting: { type: "area", shape: "line", sizeFt: 60 },
    save: { ability: "dex", dcSource: "spell_save_dc" },
    damage: { dice: "5d8", type: "fire", scaling: "slot_level" },
    duration: { unit: "minute", amount: 1 },
    concentration: true,
    tags: ["range:120", "save:dex", "damage:fire", "half_damage_on_success", "wall:height:20", "trigger:on_enter", "trigger:on_turn_end"],
    scaling: {
      mode: "slot_level",
      table: { mode: "damage_dice", dice: "1d8", perSlotAbove: 1 },
    },
  }),
];
