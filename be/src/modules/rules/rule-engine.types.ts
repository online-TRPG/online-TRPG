export const RULE_HOOK_IDS = {
  RESOLVE_ATTACK_ROLL: "hook.combat.resolve_attack_roll",
  APPLY_DAMAGE_MODIFIERS: "hook.damage.apply_resistance_vulnerability",
  APPLY_PRONE_MODIFIERS: "hook.condition.apply_prone_modifiers",
  CAST_CHILL_TOUCH: "hook.spell.cast_chill_touch",
} as const;

export type RuleHookId = (typeof RULE_HOOK_IDS)[keyof typeof RULE_HOOK_IDS];

export type RuleAdvantageState = "normal" | "advantage" | "disadvantage";

export type RuleTurnLogEvent = {
  type: string;
  public: boolean;
};

export type RuleHookResult<TProduced> = {
  hookId: RuleHookId;
  accepted: boolean;
  produced: TProduced;
  statePatch: unknown[];
  turnLogEvents: RuleTurnLogEvent[];
  rejectedReason: string | null;
};

export type AttackRollInput = {
  naturalD20: number;
  attackBonus: number;
  targetArmorClass: number;
  advantageState?: RuleAdvantageState;
  criticalHitThreshold?: number;
};

export type AttackRollProduced = {
  attackRollTotal: number;
  hit: boolean;
  criticalHit: boolean;
  criticalMiss: boolean;
};

export type DamageModifierInput = {
  baseDamage: number;
  damageType: string;
  targetImmunities?: string[];
  targetResistances?: string[];
  targetVulnerabilities?: string[];
};

export type DamageModifierProduced = {
  finalDamage: number;
  appliedDamageModifiers: string[];
};

export type ProneModifierInput = {
  isProne: boolean;
  attackerDistanceFt: number;
  remainingMovementFt: number;
  baseSpeedFt: number;
};

export type ProneModifierProduced = {
  movementCostFt: number;
  selfAttackDisadvantage: boolean;
  incomingAttackAdvantageState: RuleAdvantageState;
};

export type ChillTouchComponentAvailability = {
  verbal: boolean;
  somatic: boolean;
  material: boolean | null;
};

export type ChillTouchInput = {
  spellChillTouch: boolean;
  casterKnownCantrips: string[];
  actionAvailable: boolean;
  targetDistanceFt: number;
  componentAvailability: ChillTouchComponentAvailability;
  spellAttackRollResult: AttackRollProduced | null;
  targetIsUndead?: boolean;
};

export type ChillTouchDamagePacket = {
  dice: "1d8";
  scalesByCharacterLevel: true;
};

export type ChillTouchProduced = {
  validatedSpellCast: boolean;
  "damagePacket.necrotic": ChillTouchDamagePacket | null;
  healingBlockedUntil: "caster_next_turn_start" | null;
  undeadAttackDisadvantage: boolean;
};
