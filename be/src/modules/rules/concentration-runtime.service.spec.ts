import { ConcentrationRuntimeService } from "./concentration-runtime.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { RuleEngineService } from "./rule-engine.service";
import { RULE_HOOK_IDS } from "./rule-engine.types";

describe("ConcentrationRuntimeService", () => {
  const conditionRuntime = new ConditionRuntimeService();
  const service = new ConcentrationRuntimeService(new RuleEngineService(), conditionRuntime);

  it("starts concentration by replacing any previous concentration state", () => {
    const previous = conditionRuntime.createCondition({
      conditionId: "condition.concentration",
      sourceId: "spell.bless",
      tags: ["concentration", "concentration:spell:spell.bless"],
    });
    const next = service.startConcentration([previous], {
      casterId: "caster-1",
      spellId: "spell.hold_person",
      targetIds: ["target-1"],
      effectIds: ["effect-hold-1"],
      startedAtRound: 2,
      endsAtRound: 3,
      endsAtTurn: 1,
    });

    expect(next).toEqual([
      expect.objectContaining({
        conditionId: "condition.concentration",
        sourceId: "spell.hold_person",
        duration: { type: "until_turn", round: 3, turn: 1 },
        stackPolicy: "replace",
        appliedAtRound: 2,
        expiresAtTurn: { round: 3, turn: 1 },
        tags: [
          "concentration",
          "concentration:spell:spell.hold_person",
          "concentration:target:target-1",
          "concentration:effect:effect-hold-1",
        ],
      }),
    ]);
  });

  it("reads the active concentration state from structured condition tags", () => {
    const concentration = conditionRuntime.createCondition({
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      appliedAtRound: 2,
      expiresAtTurn: { round: 12, turn: 3 },
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:target:target-2",
        "concentration:effect:effect-hold-1",
      ],
    });

    expect(service.readActiveConcentration([concentration])).toEqual({
      casterId: "",
      spellId: "spell.hold_person",
      targetIds: ["target-1", "target-2"],
      effectIds: ["effect-hold-1"],
      startedAtRound: 2,
      endsAtRound: 12,
      endsAtTurn: 3,
    });
  });

  it("returns null when no valid active concentration can be decoded", () => {
    const malformed = conditionRuntime.createCondition({
      conditionId: "condition.concentration",
      sourceId: null,
      tags: ["concentration"],
    });
    const poisoned = conditionRuntime.createCondition({
      conditionId: "condition.poisoned",
    });

    expect(service.readActiveConcentration([poisoned])).toBeNull();
    expect(service.readActiveConcentration([malformed])).toBeNull();
  });

  it("keeps concentration when the damage check succeeds", () => {
    const concentration = conditionRuntime.createCondition({
      conditionId: "condition.concentration",
      sourceId: "spell.bless",
      tags: ["concentration", "concentration:spell:spell.bless"],
    });
    const result = service.resolveDamageCheck({
      conditions: [concentration],
      damageTaken: 12,
      naturalD20: 9,
      constitutionModifier: 1,
    });

    expect(result.concentrationMaintained).toBe(true);
    expect(result.conditions).toEqual([concentration]);
    expect(result.removedConditions).toEqual([]);
    expect(result.ruleResult).toMatchObject({
      hookId: RULE_HOOK_IDS.RESOLVE_CONCENTRATION_CHECK,
      produced: {
        difficultyClass: 10,
        concentrationMaintained: true,
      },
    });
  });

  it("removes concentration and linked effect conditions when the check fails", () => {
    const concentration = conditionRuntime.createCondition({
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      appliedAtRound: 1,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    });
    const linked = conditionRuntime.createCondition({
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
    });
    const unrelated = conditionRuntime.createCondition({
      conditionId: "condition.poisoned",
      sourceId: "trap-1",
    });

    const result = service.resolveDamageCheck({
      conditions: [concentration, linked, unrelated],
      damageTaken: 45,
      naturalD20: 7,
      constitutionModifier: 2,
    });

    expect(result.concentrationMaintained).toBe(false);
    expect(result.conditions).toEqual([unrelated]);
    expect(result.removedConditions).toEqual([concentration, linked]);
    expect(result.concentrationState).toMatchObject({
      spellId: "spell.hold_person",
      targetIds: ["target-1"],
      effectIds: ["effect-hold-1"],
    });
  });

  it("does nothing when no concentration condition is active", () => {
    const poisoned = conditionRuntime.createCondition({ conditionId: "condition.poisoned" });

    expect(
      service.resolveDamageCheck({
        conditions: [poisoned],
        damageTaken: 20,
        naturalD20: 1,
        constitutionModifier: 0,
      }),
    ).toEqual({
      activeConcentration: null,
      concentrationState: null,
      ruleResult: null,
      conditions: [poisoned],
      removedConditions: [],
      concentrationMaintained: true,
    });
  });
});
