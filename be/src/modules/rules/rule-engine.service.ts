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
  ExpertiseInput,
  ExpertiseProduced,
  FavoredEnemyInput,
  FavoredEnemyProduced,
  FightingStyleInput,
  FightingStyleProduced,
  FrenzyInput,
  FrenzyProduced,
  ProneModifierInput,
  ProneModifierProduced,
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

  applyFightingStyle(input: FightingStyleInput): RuleHookResult<FightingStyleProduced> {
    this.assertInteger(input.fighterLevel, "fighterLevel");

    const selectedStyle = this.normalizeFeatureToken(input.selectedStyle);
    const styleEffects: Record<string, Omit<FightingStyleProduced, "selectedStyle">> = {
      archery: {
        effectKind: "ranged_weapon_attack_bonus",
        attackBonus: 2,
        armorClassBonus: 0,
        damageBonus: 0,
        reactionAvailable: false,
      },
      defense: {
        effectKind: "armor_class_bonus_while_armored",
        attackBonus: 0,
        armorClassBonus: 1,
        damageBonus: 0,
        reactionAvailable: false,
      },
      dueling: {
        effectKind: "one_handed_melee_damage_bonus",
        attackBonus: 0,
        armorClassBonus: 0,
        damageBonus: 2,
        reactionAvailable: false,
      },
      great_weapon_fighting: {
        effectKind: "two_handed_damage_die_reroll",
        attackBonus: 0,
        armorClassBonus: 0,
        damageBonus: 0,
        reactionAvailable: false,
      },
      protection: {
        effectKind: "shield_reaction_attack_disadvantage",
        attackBonus: 0,
        armorClassBonus: 0,
        damageBonus: 0,
        reactionAvailable: true,
      },
      two_weapon_fighting: {
        effectKind: "offhand_damage_ability_modifier",
        attackBonus: 0,
        armorClassBonus: 0,
        damageBonus: 0,
        reactionAvailable: false,
      },
    };
    const rejectedProduced: FightingStyleProduced = {
      selectedStyle: null,
      effectKind: null,
      attackBonus: 0,
      armorClassBonus: 0,
      damageBonus: 0,
      reactionAvailable: false,
    };

    if (input.fighterLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FIGHTING_STYLE,
        rejectedProduced,
        "class_feature_rejected",
        "fighter_level_required",
      );
    }

    const effect = styleEffects[selectedStyle];
    if (!effect) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FIGHTING_STYLE,
        rejectedProduced,
        "class_feature_rejected",
        "invalid_fighting_style",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_FIGHTING_STYLE,
      {
        selectedStyle,
        ...effect,
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

    if (!input.hasAdvantage) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        rejectedProduced,
        "class_feature_rejected",
        "sneak_attack_requires_advantage",
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

  applyExpertise(input: ExpertiseInput): RuleHookResult<ExpertiseProduced> {
    this.assertInteger(input.rogueLevel, "rogueLevel");

    const expertiseSelections = Array.from(
      new Set(input.selections.map((selection) => this.normalizeFeatureToken(selection))),
    ).filter(Boolean);
    const proficientSkills = this.toFeatureTokenSet(input.proficientSkills);
    const rejectedProduced: ExpertiseProduced = {
      expertiseSelections: [],
      doubleProficiencyBonus: false,
    };

    if (input.rogueLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_EXPERTISE,
        rejectedProduced,
        "class_feature_rejected",
        "rogue_level_required",
      );
    }

    if (expertiseSelections.length !== 2) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_EXPERTISE,
        rejectedProduced,
        "class_feature_rejected",
        "expertise_requires_two_selections",
      );
    }

    for (const selection of expertiseSelections) {
      if (selection === "thieves_tools") {
        if (!input.hasThievesToolsProficiency) {
          return this.rejected(
            RULE_HOOK_IDS.APPLY_EXPERTISE,
            rejectedProduced,
            "class_feature_rejected",
            "expertise_requires_thieves_tools_proficiency",
          );
        }
        continue;
      }

      if (!proficientSkills.has(selection)) {
        return this.rejected(
          RULE_HOOK_IDS.APPLY_EXPERTISE,
          rejectedProduced,
          "class_feature_rejected",
          "expertise_requires_skill_proficiency",
        );
      }
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_EXPERTISE,
      {
        expertiseSelections,
        doubleProficiencyBonus: true,
      },
      "class_feature_applied",
    );
  }

  applyFavoredEnemy(input: FavoredEnemyInput): RuleHookResult<FavoredEnemyProduced> {
    this.assertInteger(input.rangerLevel, "rangerLevel");

    const selectedEnemy = this.normalizeFeatureToken(input.selectedEnemy);
    const humanoidRaceSelections = Array.from(
      new Set((input.humanoidRaceSelections ?? []).map((race) => this.normalizeFeatureToken(race))),
    ).filter(Boolean);
    const rejectedProduced: FavoredEnemyProduced = {
      selectedEnemy: null,
      humanoidRaceSelections: [],
      survivalTrackingAdvantage: false,
      intelligenceRecallAdvantage: false,
      languageCount: 0,
      affectsCombatStats: false,
    };

    if (input.rangerLevel < 1) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FAVORED_ENEMY,
        rejectedProduced,
        "class_feature_rejected",
        "ranger_level_required",
      );
    }

    if (selectedEnemy === "humanoid" || selectedEnemy === "humanoids") {
      if (humanoidRaceSelections.length !== 2) {
        return this.rejected(
          RULE_HOOK_IDS.APPLY_FAVORED_ENEMY,
          rejectedProduced,
          "class_feature_rejected",
          "favored_enemy_requires_two_humanoid_races",
        );
      }

      return this.accepted(
        RULE_HOOK_IDS.APPLY_FAVORED_ENEMY,
        {
          selectedEnemy: "humanoid",
          humanoidRaceSelections,
          survivalTrackingAdvantage: true,
          intelligenceRecallAdvantage: true,
          languageCount: 1,
          affectsCombatStats: false,
        },
        "class_feature_applied",
      );
    }

    const creatureTypes = new Set([
      "aberration",
      "aberrations",
      "beast",
      "beasts",
      "celestial",
      "celestials",
      "construct",
      "constructs",
      "dragon",
      "dragons",
      "elemental",
      "elementals",
      "fey",
      "fiend",
      "fiends",
      "giant",
      "giants",
      "monstrosity",
      "monstrosities",
      "ooze",
      "oozes",
      "plant",
      "plants",
      "undead",
    ]);

    if (!creatureTypes.has(selectedEnemy)) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_FAVORED_ENEMY,
        rejectedProduced,
        "class_feature_rejected",
        "invalid_favored_enemy",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_FAVORED_ENEMY,
      {
        selectedEnemy,
        humanoidRaceSelections: [],
        survivalTrackingAdvantage: true,
        intelligenceRecallAdvantage: true,
        languageCount: 1,
        affectsCombatStats: false,
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

  private normalizeFeatureToken(value: string): string {
    return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  private toFeatureTokenSet(values: string[] | undefined): Set<string> {
    return new Set((values ?? []).map((value) => this.normalizeFeatureToken(value)));
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
