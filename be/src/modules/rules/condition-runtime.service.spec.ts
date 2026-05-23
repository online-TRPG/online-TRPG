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
});
