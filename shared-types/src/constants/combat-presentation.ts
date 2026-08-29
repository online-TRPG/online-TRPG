export const COMBAT_DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export type CombatDamageType = (typeof COMBAT_DAMAGE_TYPES)[number];
export type CombatPresentationDamageType = CombatDamageType | "untyped";

export const COMBAT_PRESENTATION_DELIVERIES = [
  "melee",
  "projectile",
  "bolt",
  "beam",
  "burst",
  "cone",
  "line",
  "aura",
  "ground",
] as const;

export type CombatPresentationDelivery =
  (typeof COMBAT_PRESENTATION_DELIVERIES)[number];

export const COMBAT_PRESENTATION_OUTCOMES = [
  "hit",
  "miss",
  "critical",
  "saved",
  "failed_save",
  "applied",
] as const;

export type CombatPresentationOutcome =
  (typeof COMBAT_PRESENTATION_OUTCOMES)[number];

export const COMBAT_PRESENTATION_DAMAGE_MODIFIERS = [
  "saved_half",
  "resisted",
  "immune",
  "vulnerable",
] as const;

export type CombatPresentationDamageModifier =
  (typeof COMBAT_PRESENTATION_DAMAGE_MODIFIERS)[number];

export const COMBAT_PRESENTATION_HEALING_KINDS = [
  "hp",
  "temporary_hp",
  "revive",
] as const;

export type CombatPresentationHealingKind =
  (typeof COMBAT_PRESENTATION_HEALING_KINDS)[number];

export const COMBAT_PRESENTATION_CONDITION_OPERATIONS = [
  "added",
  "removed",
] as const;

export type CombatPresentationConditionOperation =
  (typeof COMBAT_PRESENTATION_CONDITION_OPERATIONS)[number];

export const COMBAT_CONDITION_POLARITIES = [
  "beneficial",
  "harmful",
  "neutral",
] as const;

export type CombatConditionPolarity =
  (typeof COMBAT_CONDITION_POLARITIES)[number];

export const SRD_COMBAT_CONDITION_IDS = [
  "condition.blinded",
  "condition.charmed",
  "condition.deafened",
  "condition.exhaustion",
  "condition.frightened",
  "condition.grappled",
  "condition.incapacitated",
  "condition.invisible",
  "condition.paralyzed",
  "condition.petrified",
  "condition.poisoned",
  "condition.prone",
  "condition.restrained",
  "condition.stunned",
  "condition.unconscious",
] as const;

export type SrdCombatConditionId =
  (typeof SRD_COMBAT_CONDITION_IDS)[number];

export const COMBAT_PRESENTATION_MAX_IMPACTS = 80;
export const COMBAT_PRESENTATION_MAX_DAMAGE_PACKETS = 12;
export const COMBAT_PRESENTATION_MAX_HEALING_PACKETS = 8;
export const COMBAT_PRESENTATION_MAX_CONDITION_CHANGES = 20;
