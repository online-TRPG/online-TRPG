export const RULE_HOOK_IDS = {
  RESOLVE_ATTACK_ROLL: "hook.combat.resolve_attack_roll",
  APPLY_DAMAGE_MODIFIERS: "hook.damage.apply_resistance_vulnerability",
  APPLY_PRONE_MODIFIERS: "hook.condition.apply_prone_modifiers",
  CAST_CHILL_TOUCH: "hook.spell.cast_chill_touch",
  VALIDATE_BAG_OF_HOLDING_CAPACITY: "hook.item.bag_of_holding_capacity",
  APPLY_SECOND_WIND: "hook.class.fighter.second_wind",
  APPLY_ACTION_SURGE: "hook.class.fighter.action_surge",
  APPLY_FIGHTING_STYLE: "hook.class.fighter.fighting_style",
  APPLY_RAGE: "hook.class.barbarian.rage",
  APPLY_SNEAK_ATTACK: "hook.class.rogue.sneak_attack",
  APPLY_EXPERTISE: "hook.class.rogue.expertise",
  APPLY_FAVORED_ENEMY: "hook.class.ranger.favored_enemy",
  APPLY_CRITICAL_THRESHOLD_MODIFIER: "hook.class.fighter.champion_critical_threshold",
  APPLY_CUNNING_ACTION: "hook.class.rogue.cunning_action",
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

export type FightingStyleInput = {
  fighterLevel: number;
  selectedStyle: string;
};

export type FightingStyleProduced = {
  selectedStyle: string | null;
  effectKind: string | null;
  attackBonus: number;
  armorClassBonus: number;
  damageBonus: number;
  reactionAvailable: boolean;
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

export type ExpertiseInput = {
  rogueLevel: number;
  selections: string[];
  proficientSkills: string[];
  hasThievesToolsProficiency: boolean;
};

export type ExpertiseProduced = {
  expertiseSelections: string[];
  doubleProficiencyBonus: boolean;
};

export type FavoredEnemyInput = {
  rangerLevel: number;
  selectedEnemy: string;
  humanoidRaceSelections?: string[];
};

export type FavoredEnemyProduced = {
  selectedEnemy: string | null;
  humanoidRaceSelections: string[];
  survivalTrackingAdvantage: boolean;
  intelligenceRecallAdvantage: boolean;
  languageCount: number;
  affectsCombatStats: false;
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
