import { Injectable } from "@nestjs/common";
import {
  AttackRollInput,
  AttackRollProduced,
  ActionSurgeInput,
  ActionSurgeProduced,
  BagOfHoldingCapacityInput,
  BagOfHoldingCapacityProduced,
  ChillTouchInput,
  ChillTouchProduced,
  CriticalThresholdModifierInput,
  CriticalThresholdModifierProduced,
  CunningActionInput,
  CunningActionProduced,
  DamageModifierInput,
  DamageModifierProduced,
  CureWoundsInput,
  CureWoundsProduced,
  FireBoltInput,
  FireBoltProduced,
  FlatMagicBonusInput,
  FlatMagicBonusProduced,
  FrenzyInput,
  FrenzyProduced,
  MagicMissileInput,
  MagicMissileProduced,
  PotionOfHealingInput,
  PotionOfHealingProduced,
  ProneModifierInput,
  ProneModifierProduced,
  RangerArcheryFightingStyleInput,
  RangerArcheryFightingStyleProduced,
  RangerNaturalExplorerCheckInput,
  RangerNaturalExplorerCheckProduced,
  RULE_HOOK_IDS,
  RageInput,
  RageProduced,
  RuleAdvantageState,
  RuleHookResult,
  RuleTurnLogEvent,
  SecondWindInput,
  SecondWindProduced,
  SneakAttackInput,
  SneakAttackProduced,
} from "./rule-engine.types";

@Injectable()
export class RuleEngineService {
  resolveAttackRoll(
    input: AttackRollInput,
  ): RuleHookResult<AttackRollProduced> {
    this.assertIntegerInRange(input.naturalD20, 1, 20, "naturalD20");
    this.assertInteger(input.attackBonus, "attackBonus");
    this.assertInteger(input.targetArmorClass, "targetArmorClass");

    const criticalHitThreshold = input.criticalHitThreshold ?? 20;
    this.assertIntegerInRange(criticalHitThreshold, 1, 20, "criticalHitThreshold");

    const attackRollTotal = input.naturalD20 + input.attackBonus;
    const criticalMiss = input.naturalD20 === 1;
    const criticalHit = !criticalMiss && input.naturalD20 >= criticalHitThreshold;
    const hit = criticalHit || (!criticalMiss && attackRollTotal >= input.targetArmorClass);

    return this.accepted(RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL, {
      attackRollTotal,
      hit,
      criticalHit,
      criticalMiss,
    }, "attack_roll_resolved");
  }

  applyDamageModifiers(
    input: DamageModifierInput,
  ): RuleHookResult<DamageModifierProduced> {
    this.assertInteger(input.baseDamage, "baseDamage");
    if (input.baseDamage < 0) {
      throw new Error("baseDamage must be greater than or equal to 0.");
    }

    const damageType = this.normalizeToken(input.damageType);
    const immunities = this.toNormalizedSet(input.targetImmunities);
    const resistances = this.toNormalizedSet(input.targetResistances);
    const vulnerabilities = this.toNormalizedSet(input.targetVulnerabilities);
    const appliedDamageModifiers: string[] = [];

    if (immunities.has(damageType)) {
      appliedDamageModifiers.push(`immunity:${damageType}`);
      return this.accepted(RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS, {
        finalDamage: 0,
        appliedDamageModifiers,
      }, "damage_modifiers_applied");
    }

    let finalDamage = input.baseDamage;

    if (resistances.has(damageType)) {
      finalDamage = Math.floor(finalDamage / 2);
      appliedDamageModifiers.push(`resistance:${damageType}`);
    }

    if (vulnerabilities.has(damageType)) {
      finalDamage *= 2;
      appliedDamageModifiers.push(`vulnerability:${damageType}`);
    }

    return this.accepted(RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS, {
      finalDamage,
      appliedDamageModifiers,
    }, "damage_modifiers_applied");
  }

  applyProneModifiers(
    input: ProneModifierInput,
  ): RuleHookResult<ProneModifierProduced> {
    this.assertInteger(input.attackerDistanceFt, "attackerDistanceFt");
    this.assertInteger(input.remainingMovementFt, "remainingMovementFt");
    this.assertInteger(input.baseSpeedFt, "baseSpeedFt");

    const movementCostFt = input.isProne ? Math.floor(input.baseSpeedFt / 2) : 0;
    const produced: ProneModifierProduced = {
      movementCostFt,
      selfAttackDisadvantage: input.isProne,
      incomingAttackAdvantageState: this.resolveIncomingAttackAdvantage(
        input.isProne,
        input.attackerDistanceFt,
      ),
    };

    // 넘어짐에서 일어서기는 이동력 절반을 먼저 지불할 수 있어야 실제 상태 제거로 이어진다.
    // 이동력이 부족한 경우에도 계산 결과는 남겨서 UI와 로그가 같은 이유를 보여줄 수 있게 한다.
    if (input.isProne && input.remainingMovementFt < movementCostFt) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
        produced,
        "condition_modifier_rejected",
        "not_enough_movement_to_stand",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
      produced,
      "condition_modifiers_applied",
    );
  }

  resolveChillTouch(input: ChillTouchInput): RuleHookResult<ChillTouchProduced> {
    const emptyProduced = this.createRejectedChillTouchProduced();

    if (!input.spellChillTouch) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "unsupported_spell",
      );
    }

    if (!input.casterKnownCantrips.includes("spell.chill_touch")) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "cantrip_not_known",
      );
    }

    if (!input.actionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "action_unavailable",
      );
    }

    if (input.targetDistanceFt > 120) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "target_out_of_range",
      );
    }

    if (!input.componentAvailability.verbal) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "missing_verbal_component",
      );
    }

    if (!input.componentAvailability.somatic) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "missing_somatic_component",
      );
    }

    if (!input.spellAttackRollResult) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "spell_attack_roll_required",
      );
    }

    return this.accepted(RULE_HOOK_IDS.CAST_CHILL_TOUCH, {
      validatedSpellCast: true,
      "damagePacket.necrotic": input.spellAttackRollResult.hit
        ? {
            dice: "1d8",
            scalesByCharacterLevel: true,
          }
        : null,
      healingBlockedUntil: input.spellAttackRollResult.hit
        ? "caster_next_turn_start"
        : null,
      undeadAttackDisadvantage: input.spellAttackRollResult.hit && Boolean(input.targetIsUndead),
    }, "spell_cast_validated");
  }

  resolveFireBolt(input: FireBoltInput): RuleHookResult<FireBoltProduced> {
    const emptyProduced: FireBoltProduced = {
      validatedSpellCast: false,
      "damagePacket.fire": null,
    };

    if (!input.spellFireBolt) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "unsupported_spell",
      );
    }

    if (!input.casterKnownCantrips.includes("spell.fire_bolt")) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "cantrip_not_known",
      );
    }

    if (!input.actionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "action_unavailable",
      );
    }

    if (input.targetDistanceFt > 120) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "target_out_of_range",
      );
    }

    if (!input.componentAvailability.verbal) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "missing_verbal_component",
      );
    }

    if (!input.componentAvailability.somatic) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "missing_somatic_component",
      );
    }

    if (!input.spellAttackRollResult) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_FIRE_BOLT,
        emptyProduced,
        "spell_cast_rejected",
        "spell_attack_roll_required",
      );
    }

    return this.accepted(RULE_HOOK_IDS.CAST_FIRE_BOLT, {
      validatedSpellCast: true,
      "damagePacket.fire": input.spellAttackRollResult.hit
        ? {
            dice: "1d10",
            scalesByCharacterLevel: true,
          }
        : null,
    }, "spell_cast_validated");
  }

  resolveMagicMissile(input: MagicMissileInput): RuleHookResult<MagicMissileProduced> {
    const emptyProduced: MagicMissileProduced = {
      validatedSpellCast: false,
      forceDamagePackets: [],
      spellSlotExpended: null,
    };

    if (!input.spellMagicMissile) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        emptyProduced,
        "spell_cast_rejected",
        "unsupported_spell",
      );
    }

    if (!input.casterPreparedSpells.includes("spell.magic_missile")) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        emptyProduced,
        "spell_cast_rejected",
        "spell_not_prepared",
      );
    }

    if (!input.actionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        emptyProduced,
        "spell_cast_rejected",
        "action_unavailable",
      );
    }

    if (input.spellSlotAvailable.level < 1 || input.spellSlotAvailable.remaining < 1) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        emptyProduced,
        "spell_cast_rejected",
        "spell_slot_unavailable",
      );
    }

    const totalDarts = Object.values(input.dartAllocation).reduce((sum, count) => sum + count, 0);
    if (input.targetIds.length < 1 || totalDarts !== 3) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        emptyProduced,
        "spell_cast_rejected",
        "invalid_dart_allocation",
      );
    }

    return this.accepted(RULE_HOOK_IDS.CAST_MAGIC_MISSILE, {
      validatedSpellCast: true,
      forceDamagePackets: Object.entries(input.dartAllocation).map(([targetId, count]) => ({
        targetId,
        dice: "1d4+1",
        count,
      })),
      spellSlotExpended: {
        level: 1,
        count: 1,
      },
    }, "spell_cast_validated");
  }

  resolveCureWounds(input: CureWoundsInput): RuleHookResult<CureWoundsProduced> {
    const emptyProduced: CureWoundsProduced = {
      validatedSpellCast: false,
      hitPointsRestored: 0,
      newHitPoints: input.currentHitPoints,
      spellSlotExpended: null,
    };

    this.assertInteger(input.healingRoll.total, "healingRoll.total");
    this.assertInteger(input.currentHitPoints, "currentHitPoints");
    this.assertInteger(input.maxHitPoints, "maxHitPoints");

    if (!input.spellCureWounds) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CURE_WOUNDS,
        emptyProduced,
        "healing_rejected",
        "unsupported_spell",
      );
    }

    if (!input.casterPreparedSpells.includes("spell.cure_wounds")) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CURE_WOUNDS,
        emptyProduced,
        "healing_rejected",
        "spell_not_prepared",
      );
    }

    if (!input.actionAvailable || !input.targetTouchReach) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CURE_WOUNDS,
        emptyProduced,
        "healing_rejected",
        input.actionAvailable ? "target_not_in_touch_reach" : "action_unavailable",
      );
    }

    if (input.spellSlotAvailable.level < 1 || input.spellSlotAvailable.remaining < 1) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CURE_WOUNDS,
        emptyProduced,
        "healing_rejected",
        "spell_slot_unavailable",
      );
    }

    const newHitPoints = Math.min(input.currentHitPoints + input.healingRoll.total, input.maxHitPoints);
    return this.accepted(RULE_HOOK_IDS.CAST_CURE_WOUNDS, {
      validatedSpellCast: true,
      hitPointsRestored: Math.max(newHitPoints - input.currentHitPoints, 0),
      newHitPoints,
      spellSlotExpended: {
        level: 1,
        count: 1,
      },
    }, "healing_applied");
  }

  applyPotionOfHealing(
    input: PotionOfHealingInput,
  ): RuleHookResult<PotionOfHealingProduced> {
    const emptyProduced: PotionOfHealingProduced = {
      hitPointsRestored: 0,
      newHitPoints: input.currentHitPoints,
      itemConsumed: false,
      actionSpent: false,
    };

    this.assertInteger(input.healingRoll2d4.total, "healingRoll2d4.total");
    this.assertInteger(input.currentHitPoints, "currentHitPoints");
    this.assertInteger(input.maxHitPoints, "maxHitPoints");
    this.assertInteger(input.inventoryQuantity, "inventoryQuantity");

    if (!input.magicItemPotionOfHealing) {
      return this.rejected(
        RULE_HOOK_IDS.USE_POTION_OF_HEALING,
        emptyProduced,
        "item_healing_rejected",
        "unsupported_item",
      );
    }

    if (!input.actionAvailable || !input.targetReach) {
      return this.rejected(
        RULE_HOOK_IDS.USE_POTION_OF_HEALING,
        emptyProduced,
        "item_healing_rejected",
        input.actionAvailable ? "target_not_in_reach" : "action_unavailable",
      );
    }

    if (input.inventoryQuantity < 1) {
      return this.rejected(
        RULE_HOOK_IDS.USE_POTION_OF_HEALING,
        emptyProduced,
        "item_healing_rejected",
        "item_unavailable",
      );
    }

    const newHitPoints = Math.min(input.currentHitPoints + input.healingRoll2d4.total, input.maxHitPoints);
    return this.accepted(RULE_HOOK_IDS.USE_POTION_OF_HEALING, {
      hitPointsRestored: Math.max(newHitPoints - input.currentHitPoints, 0),
      newHitPoints,
      itemConsumed: true,
      actionSpent: true,
    }, "item_healing_applied");
  }

  applyFlatMagicBonus(input: FlatMagicBonusInput): RuleHookResult<FlatMagicBonusProduced> {
    this.assertInteger(input.baseAttackBonus, "baseAttackBonus");
    this.assertInteger(input.baseDamageBonus, "baseDamageBonus");
    this.assertInteger(input.baseArmorClass, "baseArmorClass");

    const itemIds = this.toNormalizedSet(input.equippedMagicItemIds);
    const appliedMagicItemBonuses: string[] = [];
    let attackBonusDelta = 0;
    let damageBonusDelta = 0;
    let armorClassDelta = 0;

    if (
      itemIds.has("magic_item.weapon_1_2_or_3") ||
      itemIds.has("magic_item.weapon_plus_1") ||
      itemIds.has("weapon:+1")
    ) {
      attackBonusDelta += 1;
      damageBonusDelta += 1;
      appliedMagicItemBonuses.push("weapon:+1");
    }

    if (itemIds.has("magic_item.armor_1_2_or_3") || itemIds.has("magic_item.armor_plus_1")) {
      armorClassDelta += 1;
      appliedMagicItemBonuses.push("armor:+1");
    }

    if (input.shieldEquipped && itemIds.has("magic_item.shield_1_2_or_3")) {
      armorClassDelta += 1;
      appliedMagicItemBonuses.push("shield:+1");
    }

    return {
      hookId: RULE_HOOK_IDS.APPLY_FLAT_MAGIC_BONUS,
      accepted: true,
      produced: {
        attackBonusDelta,
        damageBonusDelta,
        armorClassDelta,
        appliedMagicItemBonuses,
      },
      statePatch: [],
      turnLogEvents: [{ type: "magic_item_bonus_applied", public: false }],
      rejectedReason: null,
    };
  }

  applyRangerArcheryFightingStyle(
    input: RangerArcheryFightingStyleInput,
  ): RuleHookResult<RangerArcheryFightingStyleProduced> {
    this.assertInteger(input.rangerLevel, "rangerLevel");
    this.assertInteger(input.baseAttackBonus, "baseAttackBonus");

    const rejectedProduced: RangerArcheryFightingStyleProduced = {
      attackBonusDelta: 0,
      finalAttackBonus: input.baseAttackBonus,
      fightingStyleApplied: false,
    };

    if (input.rangerLevel < 2) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
        rejectedProduced,
        "class_feature_rejected",
        "ranger_level_too_low",
      );
    }

    const selectedFightingStyle = this.normalizeToken(input.selectedFightingStyle);
    if (!["archery", "궁술"].includes(selectedFightingStyle)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
        rejectedProduced,
        "class_feature_rejected",
        "archery_fighting_style_not_selected",
      );
    }

    if (!this.isRangedWeaponAttack(input.attackKind, input.weaponProperties)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
        rejectedProduced,
        "class_feature_rejected",
        "not_ranged_weapon_attack",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
      {
        attackBonusDelta: 2,
        finalAttackBonus: input.baseAttackBonus + 2,
        fightingStyleApplied: true,
      },
      "class_feature_applied",
    );
  }

  applyRangerNaturalExplorerCheck(
    input: RangerNaturalExplorerCheckInput,
  ): RuleHookResult<RangerNaturalExplorerCheckProduced> {
    this.assertInteger(input.rangerLevel, "rangerLevel");
    this.assertInteger(input.baseCheckModifier, "baseCheckModifier");

    const rejectedProduced: RangerNaturalExplorerCheckProduced = {
      checkModifierDelta: 0,
      finalCheckModifier: input.baseCheckModifier,
      naturalExplorerApplied: false,
    };

    if (input.rangerLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
        rejectedProduced,
        "class_feature_rejected",
        "ranger_level_required",
      );
    }

    if (!input.favoredTerrainActive) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
        rejectedProduced,
        "class_feature_rejected",
        "favored_terrain_inactive",
      );
    }

    if (!["ability_check", "skill_check"].includes(this.normalizeToken(input.checkKind))) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
        rejectedProduced,
        "class_feature_rejected",
        "invalid_check_kind",
      );
    }

    if (!input.proficiencyApplied || !this.isNaturalExplorerCheck(input.abilityOrSkill)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
        rejectedProduced,
        "class_feature_rejected",
        "natural_explorer_requires_proficient_int_or_wis_check",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
      {
        // MVP characters are level 2, so the doubled proficiency delta is +2.
        checkModifierDelta: 2,
        finalCheckModifier: input.baseCheckModifier + 2,
        naturalExplorerApplied: true,
      },
      "class_feature_applied",
    );
  }

  validateBagOfHoldingCapacity(
    input: BagOfHoldingCapacityInput,
  ): RuleHookResult<BagOfHoldingCapacityProduced> {
    this.assertNonNegativeNumber(input.itemCurrentWeightLb, "itemCurrentWeightLb");
    this.assertNonNegativeNumber(input.itemCurrentVolumeCuFt, "itemCurrentVolumeCuFt");
    this.assertNonNegativeNumber(input.addedWeightLb, "addedWeightLb");
    this.assertNonNegativeNumber(input.addedVolumeCuFt, "addedVolumeCuFt");

    if (input.containerIntegrity !== "intact") {
      return this.rejected(
        RULE_HOOK_IDS.VALIDATE_BAG_OF_HOLDING_CAPACITY,
        {
          acceptedInventoryMutation: false,
          capacityViolation: "container_integrity",
          containerDestroyed: true,
        },
        "inventory_mutation_rejected",
        "container_integrity_compromised",
      );
    }

    const nextWeight = input.itemCurrentWeightLb + input.addedWeightLb;
    const nextVolume = input.itemCurrentVolumeCuFt + input.addedVolumeCuFt;
    const exceedsWeight = nextWeight > 500;
    const exceedsVolume = nextVolume > 64;

    if (exceedsWeight || exceedsVolume) {
      return this.rejected(
        RULE_HOOK_IDS.VALIDATE_BAG_OF_HOLDING_CAPACITY,
        {
          acceptedInventoryMutation: false,
          capacityViolation: this.resolveCapacityViolation(exceedsWeight, exceedsVolume),
          containerDestroyed: true,
        },
        "inventory_mutation_rejected",
        "bag_of_holding_capacity_exceeded",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.VALIDATE_BAG_OF_HOLDING_CAPACITY,
      {
        acceptedInventoryMutation: true,
        capacityViolation: null,
        containerDestroyed: false,
      },
      "inventory_mutation_validated",
    );
  }

  applySecondWind(input: SecondWindInput): RuleHookResult<SecondWindProduced> {
    this.assertInteger(input.fighterLevel, "fighterLevel");
    this.assertIntegerInRange(input.healingRollD10, 1, 10, "healingRollD10");
    this.assertInteger(input.currentHitPoints, "currentHitPoints");
    this.assertInteger(input.maxHitPoints, "maxHitPoints");

    const rejectedProduced: SecondWindProduced = {
      hitPointsRestored: 0,
      newHitPoints: input.currentHitPoints,
      secondWindExpended: false,
      bonusActionSpent: false,
    };

    if (input.fighterLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SECOND_WIND,
        rejectedProduced,
        "class_feature_rejected",
        "fighter_level_required",
      );
    }

    if (!input.bonusActionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SECOND_WIND,
        rejectedProduced,
        "class_feature_rejected",
        "bonus_action_unavailable",
      );
    }

    if (!input.secondWindAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SECOND_WIND,
        rejectedProduced,
        "class_feature_rejected",
        "second_wind_unavailable",
      );
    }

    const newHitPoints = Math.min(
      input.currentHitPoints + input.healingRollD10 + input.fighterLevel,
      input.maxHitPoints,
    );

    return this.accepted(
      RULE_HOOK_IDS.APPLY_SECOND_WIND,
      {
        hitPointsRestored: Math.max(newHitPoints - input.currentHitPoints, 0),
        newHitPoints,
        secondWindExpended: true,
        bonusActionSpent: true,
      },
      "class_feature_applied",
    );
  }

  applyActionSurge(input: ActionSurgeInput): RuleHookResult<ActionSurgeProduced> {
    this.assertInteger(input.fighterLevel, "fighterLevel");
    this.assertInteger(input.actionSurgeAvailableUses, "actionSurgeAvailableUses");

    const rejectedProduced: ActionSurgeProduced = {
      additionalActionGranted: false,
      actionSurgeExpended: false,
      remainingActionSurgeUses: Math.max(input.actionSurgeAvailableUses, 0),
    };

    if (input.fighterLevel < 2) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_ACTION_SURGE,
        rejectedProduced,
        "class_feature_rejected",
        "fighter_level_too_low",
      );
    }

    if (input.actionSurgeAvailableUses < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_ACTION_SURGE,
        rejectedProduced,
        "class_feature_rejected",
        "action_surge_unavailable",
      );
    }

    if (input.turnActionState.actionSurgeUsedThisTurn) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_ACTION_SURGE,
        rejectedProduced,
        "class_feature_rejected",
        "action_surge_already_used_this_turn",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_ACTION_SURGE,
      {
        additionalActionGranted: true,
        actionSurgeExpended: true,
        remainingActionSurgeUses: input.actionSurgeAvailableUses - 1,
      },
      "class_feature_applied",
    );
  }

  applyRage(input: RageInput): RuleHookResult<RageProduced> {
    this.assertInteger(input.barbarianLevel, "barbarianLevel");
    this.assertInteger(input.rageAvailableUses, "rageAvailableUses");

    const rejectedProduced: RageProduced = {
      rageActive: false,
      rageExpended: false,
      bonusActionSpent: false,
      strengthCheckAdvantage: false,
      strengthSaveAdvantage: false,
      rageDamageBonus: 0,
      bludgeoningResistance: false,
      piercingResistance: false,
      slashingResistance: false,
      concentrationEnded: false,
    };

    if (input.barbarianLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RAGE,
        rejectedProduced,
        "class_feature_rejected",
        "barbarian_level_required",
      );
    }

    if (!input.bonusActionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RAGE,
        rejectedProduced,
        "class_feature_rejected",
        "bonus_action_unavailable",
      );
    }

    if (input.rageAvailableUses < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_RAGE,
        rejectedProduced,
        "class_feature_rejected",
        "rage_unavailable",
      );
    }

    const benefitsActive = input.armorCategory !== "heavy";

    return this.accepted(
      RULE_HOOK_IDS.APPLY_RAGE,
      {
        rageActive: true,
        rageExpended: true,
        bonusActionSpent: true,
        strengthCheckAdvantage: benefitsActive,
        strengthSaveAdvantage: benefitsActive,
        rageDamageBonus:
          benefitsActive && input.strengthAttackDamagePacket
            ? this.resolveRageDamageBonus(input.barbarianLevel)
            : 0,
        bludgeoningResistance: benefitsActive,
        piercingResistance: benefitsActive,
        slashingResistance: benefitsActive,
        concentrationEnded: input.currentConcentrationState === "active",
      },
      "class_feature_applied",
    );
  }

  applySneakAttack(input: SneakAttackInput): RuleHookResult<SneakAttackProduced> {
    this.assertInteger(input.rogueLevel, "rogueLevel");
    this.assertInteger(input.baseDamage, "baseDamage");
    this.assertInteger(input.sneakAttackDamageRollTotal, "sneakAttackDamageRollTotal");

    const sneakAttackDice = `${Math.max(Math.ceil(input.rogueLevel / 2), 1)}d6`;
    const rejectedProduced: SneakAttackProduced = {
      sneakAttackDice,
      sneakAttackDamage: 0,
      sneakAttackExpendedThisTurn: false,
      damagePacket: null,
    };

    if (input.rogueLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "rogue_level_required",
      );
    }

    if (!input.sneakAttackAvailableThisTurn) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "sneak_attack_unavailable_this_turn",
      );
    }

    if (input.hasDisadvantage) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "sneak_attack_blocked_by_disadvantage",
      );
    }

    if (!this.isSneakAttackWeapon(input.attackKind, input.weaponProperties)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "sneak_attack_requires_finesse_or_ranged_weapon",
      );
    }

    if (!input.hasAdvantage && !input.targetEnemyWithin5Ft) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "sneak_attack_position_not_satisfied",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
      {
        sneakAttackDice,
        sneakAttackDamage: input.sneakAttackDamageRollTotal,
        sneakAttackExpendedThisTurn: true,
        damagePacket: {
          baseDamage: input.baseDamage,
          bonusDamage: input.sneakAttackDamageRollTotal,
          totalDamage: input.baseDamage + input.sneakAttackDamageRollTotal,
          damageType: "weapon",
        },
      },
      "class_feature_applied",
    );
  }

  applyCriticalThresholdModifier(
    input: CriticalThresholdModifierInput,
  ): RuleHookResult<CriticalThresholdModifierProduced> {
    this.assertIntegerInRange(input.naturalD20, 1, 20, "naturalD20");
    this.assertInteger(input.fighterLevel, "fighterLevel");

    const criticalThreshold = this.resolveCriticalThreshold(input);

    return this.accepted(
      RULE_HOOK_IDS.APPLY_CRITICAL_THRESHOLD_MODIFIER,
      {
        criticalThreshold,
        criticalHit: input.naturalD20 >= criticalThreshold,
      },
      "class_feature_applied",
    );
  }

  applyCunningAction(input: CunningActionInput): RuleHookResult<CunningActionProduced> {
    this.assertInteger(input.rogueLevel, "rogueLevel");

    const declaredAction = this.normalizeToken(input.declaredCunningAction);
    const rejectedProduced: CunningActionProduced = {
      bonusActionSpent: false,
      grantedActionType: null,
    };

    if (input.rogueLevel < 2) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
        rejectedProduced,
        "class_feature_rejected",
        "rogue_level_too_low",
      );
    }

    if (!input.bonusActionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
        rejectedProduced,
        "class_feature_rejected",
        "bonus_action_unavailable",
      );
    }

    if (!["dash", "disengage", "hide"].includes(declaredAction)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
        rejectedProduced,
        "class_feature_rejected",
        "invalid_cunning_action",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
      {
        bonusActionSpent: true,
        grantedActionType: declaredAction as CunningActionProduced["grantedActionType"],
      },
      "class_feature_applied",
    );
  }

  applyFrenzy(input: FrenzyInput): RuleHookResult<FrenzyProduced> {
    this.assertInteger(input.exhaustionState, "exhaustionState");

    const rejectedProduced: FrenzyProduced = {
      frenzyActive: false,
      bonusActionMeleeAttackAvailable: false,
      exhaustionIncreaseOnRageEnd: 0,
    };

    if (!input.rageActivationAccepted) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FRENZY,
        rejectedProduced,
        "class_feature_rejected",
        "rage_activation_required",
      );
    }

    if (!input.frenzyDeclared) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FRENZY,
        rejectedProduced,
        "class_feature_rejected",
        "frenzy_not_declared",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_FRENZY,
      {
        frenzyActive: true,
        bonusActionMeleeAttackAvailable: input.bonusActionAvailableOnFollowingTurns,
        exhaustionIncreaseOnRageEnd: 1,
      },
      "class_feature_applied",
    );
  }

  private createRejectedChillTouchProduced(): ChillTouchProduced {
    return {
      validatedSpellCast: false,
      "damagePacket.necrotic": null,
      healingBlockedUntil: null,
      undeadAttackDisadvantage: false,
    };
  }

  private resolveCapacityViolation(
    exceedsWeight: boolean,
    exceedsVolume: boolean,
  ): BagOfHoldingCapacityProduced["capacityViolation"] {
    if (exceedsWeight && exceedsVolume) {
      return "weight_and_volume";
    }
    return exceedsWeight ? "weight" : "volume";
  }

  private resolveRageDamageBonus(barbarianLevel: number): number {
    if (barbarianLevel >= 16) {
      return 4;
    }
    if (barbarianLevel >= 9) {
      return 3;
    }
    return 2;
  }

  private isSneakAttackWeapon(attackKind: string, weaponProperties: string[]): boolean {
    const normalizedAttackKind = this.normalizeToken(attackKind);
    const normalizedProperties = this.toNormalizedSet(weaponProperties);

    return (
      normalizedAttackKind.includes("ranged") ||
      normalizedProperties.has("ranged") ||
      normalizedProperties.has("finesse")
    );
  }

  private isRangedWeaponAttack(attackKind: string, weaponProperties: string[]): boolean {
    const normalizedAttackKind = this.normalizeToken(attackKind);
    const normalizedProperties = this.toNormalizedSet(weaponProperties);

    return (
      normalizedAttackKind.includes("weapon") &&
      (normalizedAttackKind.includes("ranged") ||
        normalizedProperties.has("ranged") ||
        normalizedProperties.has("ammunition") ||
        normalizedProperties.has("thrown"))
    );
  }

  private isNaturalExplorerCheck(abilityOrSkill: string): boolean {
    const normalized = this.normalizeToken(abilityOrSkill);
    return [
      "animal_handling",
      "arcana",
      "history",
      "insight",
      "investigation",
      "medicine",
      "nature",
      "perception",
      "religion",
      "survival",
      "동물조련",
      "비전",
      "역사",
      "통찰",
      "조사",
      "의학",
      "자연",
      "감지",
      "종교",
      "생존",
      "int",
      "wis",
      "intelligence",
      "wisdom",
    ].includes(normalized);
  }

  private resolveCriticalThreshold(input: CriticalThresholdModifierInput): number {
    const attackKind = this.normalizeToken(input.attackKind);
    const featureIds = this.toNormalizedSet(input.subclassFeatureIds);
    const weaponAttack = attackKind.includes("weapon");

    if (!weaponAttack || input.fighterLevel < 3) {
      return 20;
    }

    if (
      input.fighterLevel >= 15 &&
      (featureIds.has("champion_superior_critical") ||
        featureIds.has("superior_critical") ||
        featureIds.has("class.fighter.subclass_feature.superior_critical"))
    ) {
      return 18;
    }

    if (
      featureIds.has("champion_improved_critical") ||
      featureIds.has("improved_critical") ||
      featureIds.has("class.fighter.subclass_feature.improved_critical")
    ) {
      return 19;
    }

    return 20;
  }

  private resolveIncomingAttackAdvantage(
    isProne: boolean,
    attackerDistanceFt: number,
  ): RuleAdvantageState {
    if (!isProne) {
      return "normal";
    }

    return attackerDistanceFt <= 5 ? "advantage" : "disadvantage";
  }

  private accepted<TProduced>(
    hookId: RuleHookResult<TProduced>["hookId"],
    produced: TProduced,
    eventType: string,
  ): RuleHookResult<TProduced> {
    return {
      hookId,
      accepted: true,
      produced,
      statePatch: [],
      turnLogEvents: [this.publicEvent(eventType)],
      rejectedReason: null,
    };
  }

  private rejected<TProduced>(
    hookId: RuleHookResult<TProduced>["hookId"],
    produced: TProduced,
    eventType: string,
    rejectedReason: string,
  ): RuleHookResult<TProduced> {
    return {
      hookId,
      accepted: false,
      produced,
      statePatch: [],
      turnLogEvents: [this.publicEvent(eventType)],
      rejectedReason,
    };
  }

  private publicEvent(type: string): RuleTurnLogEvent {
    return { type, public: true };
  }

  private toNormalizedSet(values: string[] | undefined): Set<string> {
    return new Set((values ?? []).map((value) => this.normalizeToken(value)));
  }

  private normalizeToken(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      throw new Error("rule token must not be empty.");
    }
    return normalized;
  }

  private assertInteger(value: number, field: string): void {
    if (!Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
  }

  private assertIntegerInRange(value: number, min: number, max: number, field: string): void {
    this.assertInteger(value, field);
    if (value < min || value > max) {
      throw new Error(`${field} must be between ${min} and ${max}.`);
    }
  }

  private assertNonNegativeNumber(value: number, field: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be greater than or equal to 0.`);
    }
  }
}
