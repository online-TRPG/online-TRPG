import { RestResolutionService } from "./rest-resolution.service";

describe("RestResolutionService", () => {
  const service = new RestResolutionService();

  it("recovers short-rest resources without healing HP", () => {
    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 4,
        maxHp: 12,
        tempHp: 3,
        conditions: ["resource:second_wind_expended", "condition.poisoned"],
        resource: {
          secondWindAvailable: false,
          actionSurgeUses: 0,
        },
        resourceMaximums: {
          actionSurgeUses: 1,
        },
        spellSlots: { "1": 0 },
      }),
    ).toMatchObject({
      accepted: true,
      restType: "short",
      hp: { currentHp: 4, maxHp: 12, tempHp: 3 },
      conditions: ["condition.poisoned"],
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 1,
      },
      spellSlots: { "1": 0 },
      recoveredTags: ["resource:second_wind_expended", "resource:action_surge_expended"],
    });
  });

  it("recovers long-rest HP, rage state, exhaustion, and spell slots", () => {
    expect(
      service.resolveRest({
        restType: "long",
        currentHp: 1,
        maxHp: 20,
        tempHp: 5,
        conditions: [
          "rage",
          "resistance:slashing",
          "condition.prone",
          { conditionId: "condition.burning", tags: ["resource:rage_expended"] },
        ],
        resource: {
          secondWindAvailable: false,
          actionSurgeUses: 0,
          rageUses: 0,
          rageActive: true,
          frenzyActive: true,
          exhaustionLevel: 2,
        },
        resourceMaximums: {
          actionSurgeUses: 1,
          rageUses: 3,
        },
        spellSlots: { "1": 0 },
        spellSlotMaximums: { "1": 4, "2": 2 },
      }),
    ).toMatchObject({
      accepted: true,
      restType: "long",
      hp: { currentHp: 20, maxHp: 20, tempHp: 0 },
      conditions: ["condition.prone"],
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 1,
        rageUses: 3,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: 1,
      },
      spellSlots: { "1": 4, "2": 2 },
    });
  });

  it("rejects rest during active combat without mutating state", () => {
    expect(
      service.resolveRest({
        restType: "long",
        currentHp: 2,
        maxHp: 10,
        tempHp: 1,
        conditions: ["rage"],
        resource: {
          rageActive: true,
          exhaustionLevel: 1,
        },
        spellSlots: { "1": 0 },
        spellSlotMaximums: { "1": 2 },
        inCombat: true,
      }),
    ).toMatchObject({
      accepted: false,
      rejectedReason: "combat_active",
      hp: { currentHp: 2, maxHp: 10, tempHp: 1 },
      conditions: ["rage"],
      resource: {
        rageActive: true,
        exhaustionLevel: 1,
      },
      spellSlots: { "1": 0 },
      recoveredTags: [],
    });
  });
});
