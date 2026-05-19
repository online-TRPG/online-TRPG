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

    it("applies sneak attack when an eligible weapon attack has advantage", () => {
      expect(
        service.applySneakAttack({
          rogueLevel: 5,
          attackKind: "melee_weapon_attack",
          weaponProperties: ["finesse"],
          hasAdvantage: true,
          hasDisadvantage: false,
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
