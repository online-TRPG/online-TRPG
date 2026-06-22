export type ExecutableItemEffect =
  | { type: "equipment" }
  | { type: "tool"; checkTag: string }
  | { type: "healing"; dice: string }
  | { type: "temporary_hp"; amount: number; durationRounds: number }
  | { type: "condition"; tags: string[]; durationRounds: number }
  | { type: "spell"; spellId: string; slotLevel: number }
  | { type: "thrown"; damageDice: string; damageType: string; rangeFt: number }
  | { type: "terrain"; terrainEffectId: string; sizeFt: number }
  | { type: "utility"; tags: string[] };

export type ExecutableItemDefinition = {
  id: string;
  category: "equipment" | "consumable" | "magic_item";
  interaction: "equip" | "use" | "throw" | "tool";
  consumeOnUse: boolean;
  actionCost: "action" | "bonus_action" | "none";
  rangeFt: number;
  requiresAttunement: boolean;
  maxCharges: number | null;
  rechargeDice: string | null;
  effect: ExecutableItemEffect;
};

const equipment = (
  id: string,
  interaction: "equip" | "tool" = "equip",
  effect: ExecutableItemEffect =
    interaction === "equip"
      ? { type: "equipment" }
      : { type: "tool", checkTag: "tool:generic" },
): ExecutableItemDefinition => ({
  id,
  category: "equipment",
  interaction,
  consumeOnUse: false,
  actionCost: interaction === "tool" ? "action" : "none",
  rangeFt: 0,
  requiresAttunement: false,
  maxCharges: null,
  rechargeDice: null,
  effect,
});

const consumable = (
  id: string,
  effect: ExecutableItemEffect,
  interaction: "use" | "throw" = "use",
  rangeFt = 0,
): ExecutableItemDefinition => ({
  id,
  category: "consumable",
  interaction,
  consumeOnUse: true,
  actionCost: "action",
  rangeFt,
  requiresAttunement: false,
  maxCharges: null,
  rechargeDice: null,
  effect,
});

const magicItem = (
  id: string,
  effect: ExecutableItemEffect,
  options: Partial<
    Pick<
      ExecutableItemDefinition,
      | "interaction"
      | "consumeOnUse"
      | "actionCost"
      | "rangeFt"
      | "requiresAttunement"
      | "maxCharges"
      | "rechargeDice"
    >
  > = {},
): ExecutableItemDefinition => ({
  id,
  category: "magic_item",
  interaction: options.interaction ?? "use",
  consumeOnUse: options.consumeOnUse ?? false,
  actionCost: options.actionCost ?? "action",
  rangeFt: options.rangeFt ?? 0,
  requiresAttunement: options.requiresAttunement ?? false,
  maxCharges: options.maxCharges ?? null,
  rechargeDice: options.rechargeDice ?? null,
  effect,
});

export const P3_EXECUTABLE_ITEM_DEFINITIONS: ExecutableItemDefinition[] = [
  equipment("equipment.단검"),
  equipment("equipment.롱소드"),
  equipment("equipment.롱보우"),
  equipment("equipment.쇼트보우"),
  equipment("equipment.라이트_크로스보우"),
  equipment("equipment.레이피어"),
  equipment("equipment.그레이트액스"),
  equipment("equipment.재블린"),
  equipment("equipment.메이스"),
  equipment("equipment.쿼터스태프"),
  equipment("equipment.체인_메일"),
  equipment("equipment.가죽_갑옷"),
  equipment("equipment.스케일_메일"),
  equipment("equipment.방패"),
  equipment("equipment.thieves__tools", "tool", {
    type: "tool",
    checkTag: "tool:thieves_tools",
  }),
  equipment("equipment.rope__hempen__50_feet", "tool", {
    type: "utility",
    tags: ["utility:rope", "range:50"],
  }),
  equipment("equipment.backpack", "tool", {
    type: "utility",
    tags: ["container:backpack", "capacity_lb:30"],
  }),
  equipment("equipment.crowbar", "tool", {
    type: "tool",
    checkTag: "tool:forced_entry:advantage",
  }),
  equipment("equipment.healer_s_kit", "tool", {
    type: "utility",
    tags: ["stabilize:dying", "uses:10"],
  }),
  equipment("equipment.torch", "tool", {
    type: "utility",
    tags: ["light:bright:20", "light:dim:20", "duration:hour:1"],
  }),

  consumable(
    "equipment.acid__vial",
    { type: "thrown", damageDice: "2d6", damageType: "acid", rangeFt: 20 },
    "throw",
    20,
  ),
  consumable(
    "equipment.alchemist_s_fire__flask",
    { type: "thrown", damageDice: "1d4", damageType: "fire", rangeFt: 20 },
    "throw",
    20,
  ),
  consumable("equipment.antitoxin__vial", {
    type: "condition",
    tags: ["advantage:save:poison", "resistance:poison"],
    durationRounds: 600,
  }),
  consumable("equipment.ball_bearings__bag_of_1_000", {
    type: "terrain",
    terrainEffectId: "terrain.slippery",
    sizeFt: 10,
  }),
  consumable("equipment.caltrops__bag_of_20", {
    type: "terrain",
    terrainEffectId: "terrain.hazardous",
    sizeFt: 5,
  }),
  consumable(
    "equipment.holy_water__flask",
    { type: "thrown", damageDice: "2d6", damageType: "radiant", rangeFt: 20 },
    "throw",
    20,
  ),
  consumable(
    "equipment.oil__flask",
    { type: "terrain", terrainEffectId: "terrain.burning", sizeFt: 5 },
    "throw",
    20,
  ),
  consumable(
    "equipment.potion_of_healing",
    {
      type: "healing",
      dice: "2d4+2",
    },
    "use",
    5,
  ),
  consumable("equipment.poison__basic__vial", {
    type: "condition",
    tags: ["weapon_coating:poison:1d4", "save:con:10"],
    durationRounds: 10,
  }),
  consumable(
    "equipment.화살",
    { type: "utility", tags: ["ammunition:arrow"] },
  ),
  consumable(
    "equipment.볼트",
    { type: "utility", tags: ["ammunition:crossbow_bolt"] },
  ),
  consumable(
    "equipment.슬링_탄환",
    { type: "utility", tags: ["ammunition:sling_bullet"] },
  ),
  consumable(
    "equipment.다트",
    { type: "thrown", damageDice: "1d4", damageType: "piercing", rangeFt: 20 },
    "throw",
    60,
  ),
  consumable(
    "equipment.핸드액스",
    { type: "thrown", damageDice: "1d6", damageType: "slashing", rangeFt: 20 },
    "throw",
    60,
  ),
  consumable(
    "equipment.그물",
    {
      type: "condition",
      tags: ["condition:restrained", "escape_dc:10"],
      durationRounds: 10,
    },
    "throw",
    15,
  ),

  magicItem("magic_item.bag_of_holding", {
    type: "utility",
    tags: ["container:max_weight_lb:500", "container:max_volume_cuft:64"],
  }),
  magicItem(
    "magic_item.boots_of_speed",
    {
      type: "condition",
      tags: ["movement_speed_multiplier:2", "disadvantage:opportunity_attack"],
      durationRounds: 100,
    },
    { requiresAttunement: true, actionCost: "bonus_action" },
  ),
  magicItem(
    "magic_item.cloak_of_protection",
    {
      type: "condition",
      tags: ["armor_class:+1", "saving_throw_bonus:+1"],
      durationRounds: 14_400,
    },
    { requiresAttunement: true, actionCost: "none" },
  ),
  magicItem(
    "magic_item.ring_of_protection",
    {
      type: "condition",
      tags: ["armor_class:+1", "saving_throw_bonus:+1"],
      durationRounds: 14_400,
    },
    { requiresAttunement: true, actionCost: "none" },
  ),
  magicItem(
    "magic_item.wand_of_magic_missiles",
    { type: "spell", spellId: "spell.magic_missile", slotLevel: 1 },
    { maxCharges: 7, rechargeDice: "1d6+1", rangeFt: 120 },
  ),
  magicItem(
    "magic_item.wand_of_fireballs",
    { type: "spell", spellId: "spell.fireball", slotLevel: 3 },
    {
      requiresAttunement: true,
      maxCharges: 7,
      rechargeDice: "1d6+1",
      rangeFt: 150,
    },
  ),
  magicItem(
    "magic_item.wand_of_web",
    { type: "spell", spellId: "spell.web", slotLevel: 2 },
    {
      requiresAttunement: true,
      maxCharges: 7,
      rechargeDice: "1d6+1",
      rangeFt: 60,
    },
  ),
  magicItem(
    "magic_item.necklace_of_fireballs",
    { type: "spell", spellId: "spell.fireball", slotLevel: 3 },
    { consumeOnUse: true, rangeFt: 150 },
  ),
  magicItem(
    "magic_item.gauntlets_of_ogre_power",
    {
      type: "condition",
      tags: ["ability_score:str:19"],
      durationRounds: 14_400,
    },
    { actionCost: "none", requiresAttunement: true },
  ),
  magicItem("magic_item.goggles_of_night", {
    type: "condition",
    tags: ["vision:darkvision:60"],
    durationRounds: 14_400,
  }, { actionCost: "none" }),
  magicItem("magic_item.immovable_rod", {
    type: "utility",
    tags: ["object:immovable", "capacity_lb:8000"],
  }),
  magicItem("magic_item.rope_of_climbing", {
    type: "utility",
    tags: ["utility:animated_rope", "range:60", "climb:advantage"],
  }),
  magicItem(
    "magic_item.potion_of_flying",
    {
      type: "condition",
      tags: ["movement:flying_speed:walking"],
      durationRounds: 600,
    },
    { consumeOnUse: true },
  ),
  magicItem(
    "magic_item.potion_of_invisibility",
    {
      type: "condition",
      tags: ["condition:invisible", "ends_on:attack_or_spell"],
      durationRounds: 600,
    },
    { consumeOnUse: true },
  ),
  magicItem(
    "magic_item.potion_of_healing",
    { type: "healing", dice: "2d4+2" },
    { consumeOnUse: true, rangeFt: 5 },
  ),
];

export const P3_EXECUTABLE_ITEM_IDS = P3_EXECUTABLE_ITEM_DEFINITIONS.map(
  (item) => item.id,
);

const P3_EXECUTABLE_ITEM_BY_ID = new Map(
  P3_EXECUTABLE_ITEM_DEFINITIONS.map((item) => [item.id, item] as const),
);

export function getExecutableItemDefinition(
  itemDefinitionId: string | null | undefined,
): ExecutableItemDefinition | null {
  if (!itemDefinitionId) {
    return null;
  }
  return P3_EXECUTABLE_ITEM_BY_ID.get(itemDefinitionId.trim()) ?? null;
}
