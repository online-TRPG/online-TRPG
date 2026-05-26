import { ConditionRuntimeService } from "./condition-runtime.service";

describe("ConditionRuntimeService", () => {
  const service = new ConditionRuntimeService();

  it("normalizes legacy string conditions into condition instances", () => {
    expect(service.parseConditionsJson(JSON.stringify(["prone", "resistance:fire"]))).toEqual([
      {
        conditionId: "condition.prone",
        sourceId: null,
        duration: { type: "permanent" },
        saveEnds: null,
        stackPolicy: "ignore_duplicate",
        appliedAtRound: null,
        expiresAtTurn: null,
        tags: [],
      },
      {
        conditionId: "resistance:fire",
        sourceId: null,
        duration: { type: "permanent" },
        saveEnds: null,
        stackPolicy: "ignore_duplicate",
        appliedAtRound: null,
        expiresAtTurn: null,
        tags: [],
      },
    ]);
  });

  it("reads structured condition fields from JSON", () => {
    const [condition] = service.parseConditionsJson(
      JSON.stringify([
        {
          conditionId: "poisoned",
          sourceId: "trap-1",
          duration: { type: "rounds", remaining: 3 },
          saveEnds: { ability: "con", dc: 13 },
          stackPolicy: "replace",
          appliedAtRound: 2,
          expiresAtTurn: { round: 3, turn: 1 },
          tags: ["disadvantage:attack_roll"],
        },
      ]),
    );

    expect(condition).toEqual({
      conditionId: "condition.poisoned",
      sourceId: "trap-1",
      duration: { type: "rounds", remaining: 3 },
      saveEnds: { ability: "con", dc: 13 },
      stackPolicy: "replace",
      appliedAtRound: 2,
      expiresAtTurn: { round: 3, turn: 1 },
      tags: ["disadvantage:attack_roll"],
    });
  });

  it("projects structured and legacy conditions into runtime tags", () => {
    expect(
      service.toConditionTags(
        JSON.stringify([
          "prone",
          { conditionId: "burning", tags: ["damage_over_time:fire"] },
        ]),
      ),
    ).toEqual(["condition.prone", "condition.burning", "damage_over_time:fire"]);
  });

  it("applies stack policies when adding conditions", () => {
    const current = [
      service.createCondition({ conditionId: "condition.poisoned", sourceId: "old" }),
    ];
    const replacement = service.createCondition({
      conditionId: "poisoned",
      sourceId: "new",
      stackPolicy: "replace",
    });
    const stacked = service.createCondition({
      conditionId: "poisoned",
      sourceId: "stacked",
      stackPolicy: "stack",
    });

    expect(service.applyCondition(current, replacement)).toEqual([replacement]);
    expect(service.applyCondition(current, stacked)).toEqual([...current, stacked]);
    expect(service.applyCondition(current, service.createCondition({ conditionId: "poisoned" }))).toEqual(current);
  });

  it("ticks round durations and reports expired conditions at turn end", () => {
    const burning = service.createCondition({
      conditionId: "burning",
      duration: { type: "rounds", remaining: 2 },
    });
    const stunned = service.createCondition({
      conditionId: "stunned",
      duration: { type: "rounds", remaining: 1 },
    });
    const result = service.resolveTurnEnd([burning, stunned], { round: 1, turn: 2 });

    expect(result.conditions).toEqual([
      {
        ...burning,
        duration: { type: "rounds", remaining: 1 },
      },
    ]);
    expect(result.updatedConditions).toEqual([
      {
        ...burning,
        duration: { type: "rounds", remaining: 1 },
      },
    ]);
    expect(result.expiredConditions).toEqual([stunned]);
  });

  it("expires until-turn and explicit expiresAtTurn conditions", () => {
    const fear = service.createCondition({
      conditionId: "frightened",
      duration: { type: "until_turn", round: 2, turn: 1 },
    });
    const prone = service.createCondition({
      conditionId: "prone",
      expiresAtTurn: { round: 2, turn: 1 },
    });
    const poisoned = service.createCondition({ conditionId: "poisoned" });

    const result = service.resolveTurnEnd([fear, prone, poisoned], { round: 2, turn: 1 });

    expect(result.conditions).toEqual([poisoned]);
    expect(result.expiredConditions).toEqual([fear, prone]);
  });

  it("removes save-ends conditions only when the save succeeds", () => {
    const poisoned = service.createCondition({
      conditionId: "poisoned",
      saveEnds: { ability: "con", dc: 13 },
    });
    const prone = service.createCondition({ conditionId: "prone" });

    expect(
      service.resolveSaveEnd([poisoned, prone], {
        conditionId: "poisoned",
        saveSucceeded: false,
      }).conditions,
    ).toEqual([poisoned, prone]);

    const result = service.resolveSaveEnd([poisoned, prone], {
      conditionId: "poisoned",
      saveSucceeded: true,
    });

    expect(result.conditions).toEqual([prone]);
    expect(result.expiredConditions).toEqual([poisoned]);
  });

  it("removes rest-bound conditions at the matching rest boundary", () => {
    const shortRest = service.createCondition({
      conditionId: "burning",
      duration: { type: "until_rest", restType: "short" },
    });
    const longRest = service.createCondition({
      conditionId: "poisoned",
      duration: { type: "until_rest", restType: "long" },
    });
    const permanent = service.createCondition({ conditionId: "prone" });

    expect(service.resolveRestEnd([shortRest, longRest, permanent], "short")).toEqual({
      conditions: [longRest, permanent],
      expiredConditions: [shortRest],
      updatedConditions: [],
    });
    expect(service.resolveRestEnd([shortRest, longRest, permanent], "long")).toEqual({
      conditions: [permanent],
      expiredConditions: [shortRest, longRest],
      updatedConditions: [],
    });
  });
});
