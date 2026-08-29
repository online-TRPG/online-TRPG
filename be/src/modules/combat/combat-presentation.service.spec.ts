import {
  ActionOutcome,
  decodeCombatPresentationV1,
  isRecord,
} from "@trpg/shared-types";
import { CombatPresentationService } from "./combat-presentation.service";

describe("CombatPresentationService", () => {
  const service = new CombatPresentationService();

  function presentationOf(action: unknown) {
    const attached = service.attachToStructuredAction(action, {
      outcome: ActionOutcome.SUCCESS,
      diceResult: null,
    });
    expect(isRecord(attached)).toBe(true);
    if (!isRecord(attached)) throw new Error("Expected structured action");
    return {
      attached,
      presentation: decodeCombatPresentationV1(attached.presentationV1),
    };
  }

  it("derives a typed critical melee impact with damage modifiers", () => {
    const { presentation } = presentationOf({
      type: "attack",
      attackerParticipantId: "attacker-1",
      targetParticipantId: "target-1",
      hit: true,
      criticalHit: true,
      delivery: "melee",
      rolledDamageTotal: 18,
      damageTotal: 9,
      damageType: "slashing",
      damageModifiers: ["resistance:slashing"],
    });

    expect(presentation.schemaVersion).toBe(1);
    expect(presentation.delivery).toBe("melee");
    expect(presentation.impacts[0]).toMatchObject({
      targetParticipantId: "target-1",
      outcome: "critical",
      damagePackets: [{
        damageType: "slashing",
        rolledAmount: 18,
        appliedAmount: 9,
        modifiers: ["resisted"],
      }],
    });
  });

  it("turns explicit spell results into separate damage, healing, and condition packets", () => {
    const { attached, presentation } = presentationOf({
      type: "spell_cast",
      spellId: "spell.fireball",
      casterParticipantId: "caster-1",
      presentationResults: [{
        targetParticipantId: "target-1",
        outcome: "saved",
        damageType: "fire",
        rolledAmount: 24,
        appliedAmount: 12,
        damageModifiers: ["saved_half"],
        healingKind: "temporary_hp",
        healingAppliedAmount: 3,
        conditionChanges: [{ operation: "added", conditionId: "condition.prone" }],
      }],
    });

    expect(attached.presentationResults).toBeUndefined();
    expect(presentation.delivery).toBe("burst");
    expect(presentation.impacts[0].damagePackets[0].damageType).toBe("fire");
    expect(presentation.impacts[0].healingPackets[0]).toMatchObject({
      kind: "temporary_hp",
      appliedAmount: 3,
    });
    expect(presentation.impacts[0].conditionChanges[0]).toEqual({
      operation: "added",
      conditionId: "condition.prone",
    });
  });

  it("drops an invalid supplied presentation and derives a safe replacement", () => {
    const { presentation } = presentationOf({
      type: "combat_damage_adjustment",
      targetParticipantId: "target-1",
      amount: 7,
      appliedAmount: 5,
      healing: true,
      presentationV1: { schemaVersion: 999 },
    });

    expect(presentation.presetId).toBe("gm.healing");
    expect(presentation.impacts[0].healingPackets[0].appliedAmount).toBe(5);
  });

  it("keeps a valid supplied contract while removing internal assembly hints", () => {
    const valid = {
      schemaVersion: 1 as const,
      sourceParticipantId: "actor-1",
      delivery: "aura" as const,
      presetId: "test.effect",
      impacts: [],
    };
    const attached = service.attachToStructuredAction({
      type: "custom",
      presentationV1: valid,
      presentationResults: [{ secret: "internal" }],
    }, {
      outcome: ActionOutcome.SUCCESS,
      diceResult: null,
    });

    expect(attached).toEqual({ type: "custom", presentationV1: valid });
  });

  it("derives GM condition removal without exposing the raw override metadata as UI text", () => {
    const { presentation } = presentationOf({
      type: "gm_override",
      kind: "set_condition",
      targetId: "target-1",
      metadata: {
        operation: "remove",
        conditionId: "combat:sleep",
      },
    });

    expect(presentation.impacts[0].conditionChanges).toEqual([{
      operation: "removed",
      conditionId: "condition.sleep",
    }]);
  });
});
