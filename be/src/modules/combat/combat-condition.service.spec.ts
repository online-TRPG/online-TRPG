import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { CombatConditionService } from "./combat-condition.service";

describe("CombatConditionService presentation views", () => {
  const service = new CombatConditionService(
    {} as never,
    new ConditionRuntimeService(),
  );

  it("maps structured spell tags to viewer-safe canonical conditions", () => {
    const views = service.combatConditionViews([{
      conditionId: "condition.spell.hold_person",
      sourceId: "spell.hold_person",
      duration: { type: "rounds", remaining: 7 },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: 2,
      expiresAtTurn: null,
      tags: [
        "condition:paralyzed",
        "condition:incapacitated",
        "speed:zero",
        "advantage:incoming_attack",
      ],
    }]);

    expect(views).toEqual([
      {
        conditionId: "condition.paralyzed",
        sourceId: "spell.hold_person",
        polarity: "harmful",
        remainingRounds: 7,
      },
      {
        conditionId: "condition.incapacitated",
        sourceId: "spell.hold_person",
        polarity: "harmful",
        remainingRounds: 7,
      },
    ]);
    expect(JSON.stringify(views)).not.toContain("speed:zero");
    expect(JSON.stringify(views)).not.toContain("advantage:incoming_attack");
  });

  it("keeps supported runtime actions and drops internal resource tags", () => {
    expect(service.combatConditionViews([
      "combat:dodge",
      "resource:second_wind_expended",
    ])).toEqual([{
      conditionId: "condition.dodge",
      sourceId: null,
      polarity: "beneficial",
      remainingRounds: null,
    }]);
  });
});
