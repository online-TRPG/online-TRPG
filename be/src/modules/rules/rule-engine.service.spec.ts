import { RuleEngineService } from "./rule-engine.service";
import { RULE_HOOK_IDS } from "./rule-engine.types";

describe("RuleEngineService", () => {
  const service = new RuleEngineService();

  describe("resolveAttackRoll", () => {
    it("resolves a normal hit", () => {
      expect(
        service.resolveAttackRoll({
          naturalD20: 17,
          attackBonus: 5,
          targetArmorClass: 15,
          advantageState: "normal",
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
        accepted: true,
        produced: {
          attackRollTotal: 22,
          hit: true,
          criticalHit: false,
          criticalMiss: false,
        },
        statePatch: [],
        turnLogEvents: [{ type: "attack_roll_resolved", public: true }],
        rejectedReason: null,
      });
    });

    it("makes natural 1 a critical miss even with a high total", () => {
      const result = service.resolveAttackRoll({
        naturalD20: 1,
        attackBonus: 12,
        targetArmorClass: 10,
        advantageState: "normal",
      });

      expect(result.produced).toEqual({
        attackRollTotal: 13,
        hit: false,
        criticalHit: false,
        criticalMiss: true,
      });
    });

    it("makes natural 20 a critical hit even against a high AC", () => {
      const result = service.resolveAttackRoll({
        naturalD20: 20,
        attackBonus: 0,
        targetArmorClass: 30,
        advantageState: "normal",
      });

      expect(result.produced).toEqual({
        attackRollTotal: 20,
        hit: true,
        criticalHit: true,
        criticalMiss: false,
      });
    });
  });

  describe("applyDamageModifiers", () => {
    it("halves damage when the target has matching resistance", () => {
      const result = service.applyDamageModifiers({
        baseDamage: 10,
        damageType: "slashing",
        targetImmunities: [],
        targetResistances: ["slashing"],
        targetVulnerabilities: [],
      });

      expect(result).toEqual({
        hookId: RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
        accepted: true,
        produced: {
          finalDamage: 5,
          appliedDamageModifiers: ["resistance:slashing"],
        },
        statePatch: [],
        turnLogEvents: [{ type: "damage_modifiers_applied", public: true }],
        rejectedReason: null,
      });
    });

    it("zeroes damage when the target has matching immunity", () => {
      const result = service.applyDamageModifiers({
        baseDamage: 14,
        damageType: "necrotic",
        targetImmunities: ["necrotic"],
        targetResistances: [],
        targetVulnerabilities: [],
      });

      expect(result.produced).toEqual({
        finalDamage: 0,
        appliedDamageModifiers: ["immunity:necrotic"],
      });
    });

    it("doubles damage when the target has matching vulnerability", () => {
      const result = service.applyDamageModifiers({
        baseDamage: 8,
        damageType: "bludgeoning",
        targetImmunities: [],
        targetResistances: [],
        targetVulnerabilities: ["bludgeoning"],
      });

      expect(result.produced).toEqual({
        finalDamage: 16,
        appliedDamageModifiers: ["vulnerability:bludgeoning"],
      });
    });

    it("applies duplicate resistance only once", () => {
      const result = service.applyDamageModifiers({
        baseDamage: 10,
        damageType: "fire",
        targetResistances: ["fire", "FIRE", " fire "],
      });

      expect(result.produced).toEqual({
        finalDamage: 5,
        appliedDamageModifiers: ["resistance:fire"],
      });
    });
  });

  describe("applyProneModifiers", () => {
    it("gives adjacent attackers advantage against a prone target", () => {
      const result = service.applyProneModifiers({
        isProne: true,
        attackerDistanceFt: 5,
        remainingMovementFt: 30,
        baseSpeedFt: 30,
      });

      expect(result).toEqual({
        hookId: RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
        accepted: true,
        produced: {
          movementCostFt: 15,
          selfAttackDisadvantage: true,
          incomingAttackAdvantageState: "advantage",
        },
        statePatch: [],
        turnLogEvents: [{ type: "condition_modifiers_applied", public: true }],
        rejectedReason: null,
      });
    });

    it("gives far attackers disadvantage against a prone target", () => {
      const result = service.applyProneModifiers({
        isProne: true,
        attackerDistanceFt: 30,
        remainingMovementFt: 30,
        baseSpeedFt: 30,
      });

      expect(result.produced).toEqual({
        movementCostFt: 15,
        selfAttackDisadvantage: true,
        incomingAttackAdvantageState: "disadvantage",
      });
    });

    it("rejects standing up when remaining movement is too low", () => {
      const result = service.applyProneModifiers({
        isProne: true,
        attackerDistanceFt: 0,
        remainingMovementFt: 10,
        baseSpeedFt: 30,
      });

      expect(result).toEqual({
        hookId: RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
        accepted: false,
        produced: {
          movementCostFt: 15,
          selfAttackDisadvantage: true,
          incomingAttackAdvantageState: "advantage",
        },
        statePatch: [],
        turnLogEvents: [{ type: "condition_modifier_rejected", public: true }],
        rejectedReason: "not_enough_movement_to_stand",
      });
    });
  });

  describe("resolveChillTouch", () => {
    it("validates a successful chill touch hit", () => {
      const result = service.resolveChillTouch({
        spellChillTouch: true,
        casterKnownCantrips: ["spell.chill_touch"],
        actionAvailable: true,
        targetDistanceFt: 90,
        componentAvailability: {
          verbal: true,
          somatic: true,
          material: null,
        },
        spellAttackRollResult: {
          attackRollTotal: 18,
          hit: true,
          criticalHit: false,
          criticalMiss: false,
        },
      });

      expect(result).toEqual({
        hookId: RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        accepted: true,
        produced: {
          validatedSpellCast: true,
          "damagePacket.necrotic": {
            dice: "1d8",
            scalesByCharacterLevel: true,
          },
          healingBlockedUntil: "caster_next_turn_start",
          undeadAttackDisadvantage: false,
        },
        statePatch: [],
        turnLogEvents: [{ type: "spell_cast_validated", public: true }],
        rejectedReason: null,
      });
    });

    it("rejects chill touch when the target is out of range", () => {
      const result = service.resolveChillTouch({
        spellChillTouch: true,
        casterKnownCantrips: ["spell.chill_touch"],
        actionAvailable: true,
        targetDistanceFt: 125,
        componentAvailability: {
          verbal: true,
          somatic: true,
          material: null,
        },
        spellAttackRollResult: null,
      });

      expect(result).toEqual({
        hookId: RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        accepted: false,
        produced: {
          validatedSpellCast: false,
          "damagePacket.necrotic": null,
          healingBlockedUntil: null,
          undeadAttackDisadvantage: false,
        },
        statePatch: [],
        turnLogEvents: [{ type: "spell_cast_rejected", public: true }],
        rejectedReason: "target_out_of_range",
      });
    });

    it("rejects chill touch when the somatic component is missing", () => {
      const result = service.resolveChillTouch({
        spellChillTouch: true,
        casterKnownCantrips: ["spell.chill_touch"],
        actionAvailable: true,
        targetDistanceFt: 90,
        componentAvailability: {
          verbal: true,
          somatic: false,
          material: null,
        },
        spellAttackRollResult: null,
      });

      expect(result.rejectedReason).toBe("missing_somatic_component");
      expect(result.produced).toEqual({
        validatedSpellCast: false,
        "damagePacket.necrotic": null,
        healingBlockedUntil: null,
        undeadAttackDisadvantage: false,
      });
    });

    it("accepts a valid chill touch miss without producing damage", () => {
      const result = service.resolveChillTouch({
        spellChillTouch: true,
        casterKnownCantrips: ["spell.chill_touch"],
        actionAvailable: true,
        targetDistanceFt: 90,
        componentAvailability: {
          verbal: true,
          somatic: true,
          material: null,
        },
        spellAttackRollResult: {
          attackRollTotal: 9,
          hit: false,
          criticalHit: false,
          criticalMiss: false,
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.produced).toEqual({
        validatedSpellCast: true,
        "damagePacket.necrotic": null,
        healingBlockedUntil: null,
        undeadAttackDisadvantage: false,
      });
    });
  });

  describe("MVP playable spell and item hooks", () => {
    it("validates fire bolt damage only on a successful spell attack", () => {
      expect(
        service.resolveFireBolt({
          spellFireBolt: true,
          casterKnownCantrips: ["spell.fire_bolt"],
          actionAvailable: true,
          targetDistanceFt: 90,
          componentAvailability: {
            verbal: true,
            somatic: true,
            material: null,
          },
          spellAttackRollResult: {
            attackRollTotal: 17,
            hit: true,
            criticalHit: false,
            criticalMiss: false,
          },
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.CAST_FIRE_BOLT,
        accepted: true,
        produced: {
          validatedSpellCast: true,
          "damagePacket.fire": {
            dice: "1d10",
            scalesByCharacterLevel: true,
          },
        },
        statePatch: [],
        turnLogEvents: [{ type: "spell_cast_validated", public: true }],
        rejectedReason: null,
      });
    });

    it("validates magic missile without an attack roll", () => {
      expect(
        service.resolveMagicMissile({
          spellMagicMissile: true,
          casterPreparedSpells: ["spell.magic_missile"],
          actionAvailable: true,
          spellSlotAvailable: { level: 1, remaining: 1 },
          targetIds: ["target"],
          dartAllocation: { target: 3 },
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
        accepted: true,
        produced: {
          validatedSpellCast: true,
          forceDamagePackets: [{ targetId: "target", dice: "1d4+1", count: 3 }],
          spellSlotExpended: { level: 1, count: 1 },
        },
      });
    });

    it("caps cure wounds healing at max HP", () => {
      expect(
        service.resolveCureWounds({
          spellCureWounds: true,
          casterPreparedSpells: ["spell.cure_wounds"],
          actionAvailable: true,
          spellSlotAvailable: { level: 1, remaining: 1 },
          targetTouchReach: true,
          healingRoll: { formula: "1d8+2", total: 7 },
          currentHitPoints: 3,
          maxHitPoints: 9,
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.CAST_CURE_WOUNDS,
        accepted: true,
        produced: {
          validatedSpellCast: true,
          hitPointsRestored: 6,
          newHitPoints: 9,
          spellSlotExpended: { level: 1, count: 1 },
        },
      });
    });

    it("uses a potion of healing and consumes the declared item", () => {
      expect(
        service.applyPotionOfHealing({
          magicItemPotionOfHealing: true,
          actionAvailable: true,
          targetReach: true,
          healingRoll2d4: { formula: "2d4+2", total: 8 },
          currentHitPoints: 2,
          maxHitPoints: 9,
          inventoryQuantity: 1,
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.USE_POTION_OF_HEALING,
        accepted: true,
        produced: {
          hitPointsRestored: 7,
          newHitPoints: 9,
          itemConsumed: true,
          actionSpent: true,
        },
      });
    });

    it("applies only MVP +1 flat magic item bonuses", () => {
      expect(
        service.applyFlatMagicBonus({
          equippedMagicItemIds: ["magic_item.weapon_1_2_or_3"],
          baseAttackBonus: 5,
          baseDamageBonus: 3,
          baseArmorClass: 16,
          shieldEquipped: false,
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.APPLY_FLAT_MAGIC_BONUS,
        accepted: true,
        produced: {
          attackBonusDelta: 1,
          damageBonusDelta: 1,
          armorClassDelta: 0,
          appliedMagicItemBonuses: ["weapon:+1"],
        },
        statePatch: [],
        turnLogEvents: [{ type: "magic_item_bonus_applied", public: false }],
        rejectedReason: null,
      });
    });

    it("applies ranger archery to ranged weapon attacks", () => {
      expect(
        service.applyRangerArcheryFightingStyle({
          rangerLevel: 2,
          selectedFightingStyle: "archery",
          attackKind: "ranged_weapon_attack",
          weaponProperties: ["ranged", "ammunition"],
          baseAttackBonus: 4,
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
        accepted: true,
        produced: {
          attackBonusDelta: 2,
          finalAttackBonus: 6,
          fightingStyleApplied: true,
        },
      });
    });

    it("rejects ranger archery for non-ranged weapon attacks", () => {
      expect(
        service.applyRangerArcheryFightingStyle({
          rangerLevel: 2,
          selectedFightingStyle: "archery",
          attackKind: "melee_weapon_attack",
          weaponProperties: ["finesse"],
          baseAttackBonus: 4,
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
        accepted: false,
        produced: {
          attackBonusDelta: 0,
          finalAttackBonus: 4,
          fightingStyleApplied: false,
        },
        rejectedReason: "not_ranged_weapon_attack",
      });
    });

    it("applies ranger natural explorer to proficient survival checks in favored terrain", () => {
      expect(
        service.applyRangerNaturalExplorerCheck({
          rangerLevel: 2,
          favoredTerrainActive: true,
          checkKind: "skill_check",
          abilityOrSkill: "survival",
          proficiencyApplied: true,
          baseCheckModifier: 5,
        }),
      ).toMatchObject({
        hookId: RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
        accepted: true,
        produced: {
          checkModifierDelta: 2,
          finalCheckModifier: 7,
          naturalExplorerApplied: true,
        },
      });
    });
  });

  describe("P1 hooks", () => {
    it("validates bag of holding capacity", () => {
      expect(
        service.validateBagOfHoldingCapacity({
          itemCurrentWeightLb: 490,
          itemCurrentVolumeCuFt: 10,
          addedWeightLb: 15,
          addedVolumeCuFt: 1,
          containerIntegrity: "intact",
        }),
      ).toMatchObject({
        accepted: false,
        hookId: RULE_HOOK_IDS.VALIDATE_BAG_OF_HOLDING_CAPACITY,
        produced: {
          acceptedInventoryMutation: false,
          capacityViolation: "weight",
          containerDestroyed: true,
        },
        rejectedReason: "bag_of_holding_capacity_exceeded",
      });
    });

    it("applies second wind healing with max HP cap", () => {
      const result = service.applySecondWind({
        fighterLevel: 5,
        bonusActionAvailable: true,
        secondWindAvailable: true,
        healingRollD10: 8,
        currentHitPoints: 10,
        maxHitPoints: 20,
      });

      expect(result).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_SECOND_WIND,
        produced: {
          hitPointsRestored: 10,
          newHitPoints: 20,
          secondWindExpended: true,
          bonusActionSpent: true,
        },
      });
    });

    it("grants action surge when a fighter has an available use", () => {
      expect(
        service.applyActionSurge({
          fighterLevel: 2,
          actionSurgeAvailableUses: 1,
          turnActionState: { actionSurgeUsedThisTurn: false },
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_ACTION_SURGE,
        produced: {
          additionalActionGranted: true,
          actionSurgeExpended: true,
          remainingActionSurgeUses: 0,
        },
      });
    });

    it("applies rage benefits unless the barbarian is in heavy armor", () => {
      expect(
        service.applyRage({
          barbarianLevel: 9,
          bonusActionAvailable: true,
          rageAvailableUses: 1,
          armorCategory: "medium",
          strengthAttackDamagePacket: true,
          currentConcentrationState: "active",
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_RAGE,
        produced: {
          rageActive: true,
          rageDamageBonus: 3,
          bludgeoningResistance: true,
          piercingResistance: true,
          slashingResistance: true,
          concentrationEnded: true,
        },
      });
    });

    it("applies sneak attack when weapon and positioning conditions are satisfied", () => {
      expect(
        service.applySneakAttack({
          rogueLevel: 5,
          attackKind: "melee_weapon_attack",
          weaponProperties: ["finesse"],
          hasAdvantage: false,
          hasDisadvantage: false,
          targetEnemyWithin5Ft: true,
          sneakAttackAvailableThisTurn: true,
          baseDamage: 6,
          sneakAttackDamageRollTotal: 11,
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
        produced: {
          sneakAttackDice: "3d6",
          sneakAttackDamage: 11,
          sneakAttackExpendedThisTurn: true,
          damagePacket: {
            baseDamage: 6,
            bonusDamage: 11,
            totalDamage: 17,
            damageType: "weapon",
          },
        },
      });
    });
  });

  describe("P2 hooks", () => {
    it("lowers champion critical threshold for qualifying weapon attacks", () => {
      expect(
        service.applyCriticalThresholdModifier({
          naturalD20: 19,
          attackKind: "weapon_attack",
          fighterLevel: 3,
          subclassFeatureIds: ["champion_improved_critical"],
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_CRITICAL_THRESHOLD_MODIFIER,
        produced: {
          criticalThreshold: 19,
          criticalHit: true,
        },
      });
    });

    it("validates cunning action options", () => {
      expect(
        service.applyCunningAction({
          rogueLevel: 2,
          bonusActionAvailable: true,
          declaredCunningAction: "hide",
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
        produced: {
          bonusActionSpent: true,
          grantedActionType: "hide",
        },
      });
    });

    it("activates frenzy only after rage activation is accepted", () => {
      expect(
        service.applyFrenzy({
          rageActivationAccepted: true,
          bonusActionAvailableOnFollowingTurns: true,
          frenzyDeclared: true,
          exhaustionState: 0,
        }),
      ).toMatchObject({
        accepted: true,
        hookId: RULE_HOOK_IDS.APPLY_FRENZY,
        produced: {
          frenzyActive: true,
          bonusActionMeleeAttackAvailable: true,
          exhaustionIncreaseOnRageEnd: 1,
        },
      });
    });
  });
});
