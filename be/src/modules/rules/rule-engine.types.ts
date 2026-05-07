export const RULE_HOOK_IDS = {
  RESOLVE_ATTACK_ROLL: "hook.combat.resolve_attack_roll",
  APPLY_DAMAGE_MODIFIERS: "hook.damage.apply_resistance_vulnerability",
  APPLY_PRONE_MODIFIERS: "hook.condition.apply_prone_modifiers",
  CAST_CHILL_TOUCH: "hook.spell.cast_chill_touch",
  CAST_FIRE_BOLT: "hook.spell.cast_fire_bolt",
  CAST_MAGIC_MISSILE: "hook.spell.cast_magic_missile",
  CAST_CURE_WOUNDS: "hook.spell.cast_cure_wounds",
  USE_POTION_OF_HEALING: "hook.item.use_potion_of_healing",
  APPLY_FLAT_MAGIC_BONUS: "hook.item.apply_flat_magic_bonus",
  VALIDATE_BAG_OF_HOLDING_CAPACITY: "hook.item.bag_of_holding_capacity",
  APPLY_SECOND_WIND: "hook.class.fighter.second_wind",
  APPLY_ACTION_SURGE: "hook.class.fighter.action_surge",
  APPLY_RAGE: "hook.class.barbarian.rage",
  APPLY_SNEAK_ATTACK: "hook.class.rogue.sneak_attack",
  APPLY_CRITICAL_THRESHOLD_MODIFIER: "hook.class.fighter.champion_critical_threshold",
  APPLY_CUNNING_ACTION: "hook.class.rogue.cunning_action",
  APPLY_RANGER_ARCHERY_FIGHTING_STYLE: "hook.class.ranger.fighting_style_archery",
  APPLY_RANGER_NATURAL_EXPLORER_CHECK: "hook.class.ranger.natural_explorer_check",
  APPLY_FRENZY: "hook.class.barbarian.frenzy",
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

export type FireBoltInput = {
  spellFireBolt: boolean;
  casterKnownCantrips: string[];
  actionAvailable: boolean;
  targetDistanceFt: number;
  componentAvailability: ChillTouchComponentAvailability;
  spellAttackRollResult: AttackRollProduced | null;
};

export type FireBoltProduced = {
  validatedSpellCast: boolean;
  "damagePacket.fire": {
    dice: "1d10";
    scalesByCharacterLevel: true;
  } | null;
};

export type MagicMissileInput = {
  spellMagicMissile: boolean;
  casterPreparedSpells: string[];
  actionAvailable: boolean;
  spellSlotAvailable: {
    level: number;
    remaining: number;
  };
  targetIds: string[];
  dartAllocation: Record<string, number>;
};

export type MagicMissileProduced = {
  validatedSpellCast: boolean;
  forceDamagePackets: Array<{
    targetId: string;
    dice: "1d4+1";
    count: number;
  }>;
  spellSlotExpended: {
    level: 1;
    count: 1;
  } | null;
};

export type CureWoundsInput = {
  spellCureWounds: boolean;
  casterPreparedSpells: string[];
  actionAvailable: boolean;
  spellSlotAvailable: {
    level: number;
    remaining: number;
  };
  targetTouchReach: boolean;
  healingRoll: {
    formula: "1d8+2";
    total: number;
  };
  currentHitPoints: number;
  maxHitPoints: number;
};

export type CureWoundsProduced = {
  validatedSpellCast: boolean;
  hitPointsRestored: number;
  newHitPoints: number;
  spellSlotExpended: {
    level: 1;
    count: 1;
  } | null;
};

export type PotionOfHealingInput = {
  magicItemPotionOfHealing: boolean;
  actionAvailable: boolean;
  targetReach: boolean;
  healingRoll2d4: {
    formula: "2d4+2";
    total: number;
  };
  currentHitPoints: number;
  maxHitPoints: number;
  inventoryQuantity: number;
};

export type PotionOfHealingProduced = {
  hitPointsRestored: number;
  newHitPoints: number;
  itemConsumed: boolean;
  actionSpent: boolean;
};

export type FlatMagicBonusInput = {
  equippedMagicItemIds: string[];
  baseAttackBonus: number;
  baseDamageBonus: number;
  baseArmorClass: number;
  shieldEquipped: boolean;
};

export type FlatMagicBonusProduced = {
  attackBonusDelta: number;
  damageBonusDelta: number;
  armorClassDelta: number;
  appliedMagicItemBonuses: string[];
};

export type RangerArcheryFightingStyleInput = {
  rangerLevel: number;
  selectedFightingStyle: string;
  attackKind: string;
  weaponProperties: string[];
  baseAttackBonus: number;
};

export type RangerArcheryFightingStyleProduced = {
  attackBonusDelta: number;
  finalAttackBonus: number;
  fightingStyleApplied: boolean;
};

export type RangerNaturalExplorerCheckInput = {
  rangerLevel: number;
  favoredTerrainActive: boolean;
  checkKind: string;
  abilityOrSkill: string;
  proficiencyApplied: boolean;
  baseCheckModifier: number;
};

export type RangerNaturalExplorerCheckProduced = {
  checkModifierDelta: number;
  finalCheckModifier: number;
  naturalExplorerApplied: boolean;
};

export type BagOfHoldingIntegrity = "intact" | "pierced" | "torn" | "overloaded";

export type BagOfHoldingCapacityInput = {
  itemCurrentWeightLb: number;
  itemCurrentVolumeCuFt: number;
  addedWeightLb: number;
  addedVolumeCuFt: number;
  containerIntegrity: BagOfHoldingIntegrity;
};

export type BagOfHoldingCapacityProduced = {
  acceptedInventoryMutation: boolean;
  capacityViolation: "weight" | "volume" | "weight_and_volume" | "container_integrity" | null;
  containerDestroyed: boolean;
};

export type SecondWindInput = {
  fighterLevel: number;
  bonusActionAvailable: boolean;
  secondWindAvailable: boolean;
  healingRollD10: number;
  currentHitPoints: number;
  maxHitPoints: number;
};

export type SecondWindProduced = {
  hitPointsRestored: number;
  newHitPoints: number;
  secondWindExpended: boolean;
  bonusActionSpent: boolean;
};

export type ActionSurgeInput = {
  fighterLevel: number;
  actionSurgeAvailableUses: number;
  turnActionState: {
    actionSurgeUsedThisTurn: boolean;
  };
};

export type ActionSurgeProduced = {
  additionalActionGranted: boolean;
  actionSurgeExpended: boolean;
  remainingActionSurgeUses: number;
};

export type RageArmorCategory = "none" | "light" | "medium" | "heavy";

export type RageInput = {
  barbarianLevel: number;
  bonusActionAvailable: boolean;
  rageAvailableUses: number;
  armorCategory: RageArmorCategory;
  strengthAttackDamagePacket: boolean;
  currentConcentrationState: "none" | "active";
};

export type RageProduced = {
  rageActive: boolean;
  rageExpended: boolean;
  bonusActionSpent: boolean;
  strengthCheckAdvantage: boolean;
  strengthSaveAdvantage: boolean;
  rageDamageBonus: number;
  bludgeoningResistance: boolean;
  piercingResistance: boolean;
  slashingResistance: boolean;
  concentrationEnded: boolean;
};

export type SneakAttackInput = {
  rogueLevel: number;
  attackKind: string;
  weaponProperties: string[];
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  targetEnemyWithin5Ft: boolean;
  sneakAttackAvailableThisTurn: boolean;
  baseDamage: number;
  sneakAttackDamageRollTotal: number;
};

export type SneakAttackProduced = {
  sneakAttackDice: string;
  sneakAttackDamage: number;
  sneakAttackExpendedThisTurn: boolean;
  damagePacket: {
    baseDamage: number;
    bonusDamage: number;
    totalDamage: number;
    damageType: "weapon";
  } | null;
};

export type CriticalThresholdModifierInput = {
  naturalD20: number;
  attackKind: string;
  fighterLevel: number;
  subclassFeatureIds: string[];
};

export type CriticalThresholdModifierProduced = {
  criticalThreshold: number;
  criticalHit: boolean;
};

export type CunningActionInput = {
  rogueLevel: number;
  bonusActionAvailable: boolean;
  declaredCunningAction: string;
};

export type CunningActionProduced = {
  bonusActionSpent: boolean;
  grantedActionType: "dash" | "disengage" | "hide" | null;
};

export type FrenzyInput = {
  rageActivationAccepted: boolean;
  bonusActionAvailableOnFollowingTurns: boolean;
  frenzyDeclared: boolean;
  exhaustionState: number;
};

export type FrenzyProduced = {
  frenzyActive: boolean;
  bonusActionMeleeAttackAvailable: boolean;
  exhaustionIncreaseOnRageEnd: number;
};
