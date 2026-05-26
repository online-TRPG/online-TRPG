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

  describe("resolveSavingThrow", () => {
    it("resolves a proficient save with condition bonuses", () => {
      expect(
        service.resolveSavingThrow({
          ability: "dex",
          naturalD20: 11,
          difficultyClass: 15,
          abilityModifier: 3,
          proficiencyBonus: 2,
          proficient: true,
          advantageState: "advantage",
          bonusModifiers: [{ source: "cover:half", value: 2 }],
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.RESOLVE_SAVING_THROW,
        accepted: true,
        produced: {
          ability: "dex",
          naturalD20: 11,
          savingThrowTotal: 18,
          difficultyClass: 15,
          success: true,
          advantageState: "advantage",
          appliedModifiers: [
            { source: "ability:dex", value: 3 },
            { source: "proficiency", value: 2 },
            { source: "cover:half", value: 2 },
          ],
        },
        statePatch: [],
        turnLogEvents: [{ type: "saving_throw_resolved", public: true }],
        rejectedReason: null,
      });
    });

    it("does not treat natural 20 as automatic success for saves", () => {
      const result = service.resolveSavingThrow({
        ability: "wis",
        naturalD20: 20,
        difficultyClass: 30,
        abilityModifier: 1,
      });

      expect(result.produced).toMatchObject({
        savingThrowTotal: 21,
        success: false,
        appliedModifiers: [{ source: "ability:wis", value: 1 }],
      });
    });

    it("does not add proficiency unless the save is proficient", () => {
      const result = service.resolveSavingThrow({
        ability: "con",
        naturalD20: 10,
        difficultyClass: 14,
        abilityModifier: 2,
        proficiencyBonus: 4,
        proficient: false,
      });

      expect(result.produced).toMatchObject({
        savingThrowTotal: 12,
        success: false,
        appliedModifiers: [{ source: "ability:con", value: 2 }],
      });
    });
  });

  describe("resolveConcentrationCheck", () => {
    it("uses DC 10 for ordinary damage and maintains concentration on success", () => {
      expect(
        service.resolveConcentrationCheck({
          damageTaken: 12,
          naturalD20: 8,
          constitutionModifier: 2,
          proficiencyBonus: 3,
          proficient: true,
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.RESOLVE_CONCENTRATION_CHECK,
        accepted: true,
        produced: {
          damageTaken: 12,
          difficultyClass: 10,
          savingThrowTotal: 13,
          concentrationMaintained: true,
          concentrationEnds: false,
          savingThrow: {
            ability: "con",
            naturalD20: 8,
            savingThrowTotal: 13,
            difficultyClass: 10,
            success: true,
            advantageState: "normal",
            appliedModifiers: [
              { source: "ability:con", value: 2 },
              { source: "proficiency", value: 3 },
            ],
          },
        },
        statePatch: [],
        turnLogEvents: [{ type: "concentration_check_resolved", public: true }],
        rejectedReason: null,
      });
    });

    it("raises DC to half of high damage and ends concentration on failure", () => {
      const result = service.resolveConcentrationCheck({
        damageTaken: 45,
        naturalD20: 11,
        constitutionModifier: 3,
      });

      expect(result.produced).toMatchObject({
        difficultyClass: 22,
        savingThrowTotal: 14,
        concentrationMaintained: false,
        concentrationEnds: true,
      });
    });

    it("includes advantage state and bonus modifiers in the nested save result", () => {
      const result = service.resolveConcentrationCheck({
        damageTaken: 20,
        naturalD20: 9,
        constitutionModifier: 1,
        advantageState: "advantage",
        bonusModifiers: [{ source: "aura:protection", value: 4 }],
      });

      expect(result.produced.savingThrow).toMatchObject({
        advantageState: "advantage",
        appliedModifiers: [
          { source: "ability:con", value: 1 },
          { source: "aura:protection", value: 4 },
        ],
      });
    });
  });

  describe("resolveCoverModifiers", () => {
    it("applies half cover to attack AC and dexterity saves", () => {
      expect(
        service.resolveCoverModifiers({
          coverLevel: "half",
        }),
      ).toEqual({
        hookId: RULE_HOOK_IDS.RESOLVE_COVER_MODIFIERS,
        accepted: true,
        produced: {
          coverLevel: "half",
          armorClassBonus: 2,
          dexteritySaveBonus: 2,
          targetable: true,
          appliedModifiers: [
            { source: "cover:half:ac", value: 2 },
            { source: "cover:half:dex_save", value: 2 },
          ],
        },
        statePatch: [],
        turnLogEvents: [{ type: "cover_modifiers_resolved", public: true }],
        rejectedReason: null,
      });
    });

    it("applies three-quarters cover as a +5 modifier", () => {
      const result = service.resolveCoverModifiers({
        coverLevel: "three_quarters",
      });

      expect(result.produced).toMatchObject({
        armorClassBonus: 5,
        dexteritySaveBonus: 5,
        targetable: true,
      });
    });

    it("blocks targeting for full cover", () => {
      const result = service.resolveCoverModifiers({
        coverLevel: "full",
      });

      expect(result.produced).toEqual({
        coverLevel: "full",
        armorClassBonus: 0,
        dexteritySaveBonus: 0,
        targetable: false,
        appliedModifiers: [{ source: "cover:full:target_blocked", value: 0 }],
      });
    });

    it("can scope cover to attacks without applying dexterity save bonuses", () => {
      const result = service.resolveCoverModifiers({
        coverLevel: "half",
        appliesToDexteritySave: false,
      });

      expect(result.produced).toMatchObject({
        armorClassBonus: 2,
        dexteritySaveBonus: 0,
        appliedModifiers: [{ source: "cover:half:ac", value: 2 }],
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
