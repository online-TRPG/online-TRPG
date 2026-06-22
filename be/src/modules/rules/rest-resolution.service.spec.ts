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
          secondWindAvailable: true,
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
      recoveredTags: [
        "resource:second_wind_expended",
        "resource:action_surge_expended",
        "action_surge:additional_action_granted",
      ],
    });
  });

  it("spends available hit dice on short rest healing", () => {
    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 5,
        maxHp: 20,
        hitDiceToSpend: 2,
        totalHitDice: 4,
        hitDiceSpent: 1,
        hitDieAverage: 6,
        constitutionModifier: 2,
      }),
    ).toMatchObject({
      accepted: true,
      hp: { currentHp: 20, maxHp: 20, tempHp: 0 },
      resource: {
        hitDiceSpent: 3,
      },
      recoveredTags: expect.arrayContaining(["hit_dice:spent:2"]),
    });
  });

  it("regains up to half total hit dice on long rest", () => {
    expect(
      service.resolveRest({
        restType: "long",
        currentHp: 1,
        maxHp: 20,
        totalHitDice: 5,
        hitDiceSpent: 4,
      }),
    ).toMatchObject({
      accepted: true,
      hp: { currentHp: 20 },
      resource: {
        hitDiceSpent: 2,
      },
      recoveredTags: expect.arrayContaining(["hit_dice:recovered:2"]),
    });
  });

  it("removes structured until-rest conditions at the matching rest boundary", () => {
    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 4,
        maxHp: 12,
        conditions: [
          {
            conditionId: "condition.burning",
            sourceId: "terrain.burning",
            duration: { type: "until_rest", restType: "short" },
            tags: ["damage_over_time:fire"],
          },
          {
            conditionId: "condition.poisoned",
            sourceId: "terrain.poison_cloud",
            duration: { type: "until_rest", restType: "long" },
            tags: ["disadvantage:attack_roll"],
          },
        ],
      }),
    ).toMatchObject({
      accepted: true,
      restType: "short",
      conditions: [
        {
          conditionId: "condition.poisoned",
          sourceId: "terrain.poison_cloud",
          duration: { type: "until_rest", restType: "long" },
          tags: ["disadvantage:attack_roll"],
        },
      ],
    });

    expect(
      service.resolveRest({
        restType: "long",
        currentHp: 4,
        maxHp: 12,
        conditions: [
          {
            conditionId: "condition.burning",
            sourceId: "terrain.burning",
            duration: { type: "until_rest", restType: "short" },
          },
          {
            conditionId: "condition.poisoned",
            sourceId: "terrain.poison_cloud",
            duration: { type: "until_rest", restType: "long" },
          },
        ],
      }).conditions,
    ).toEqual([]);
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
          "resource:relentless_endurance_expended",
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
          secondWindAvailable: true,
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

  it("recovers level 5 bardic inspiration uses on a short rest when enabled", () => {
    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 10,
        maxHp: 10,
        conditions: ["resource:bardic_inspiration_spent:3"],
        recoverBardicInspirationOnShortRest: true,
      }),
    ).toMatchObject({
      conditions: [],
      recoveredTags: ["resource:bardic_inspiration_spent"],
    });
  });

  it("recovers Wholeness of Body only on a long rest", () => {
    const conditions = [
      "resource:wholeness_of_body_expended",
      "condition.poisoned",
    ];

    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 10,
        maxHp: 20,
        conditions,
      }).conditions,
    ).toEqual(conditions);
    expect(
      service.resolveRest({
        restType: "long",
        currentHp: 10,
        maxHp: 20,
        conditions,
      }).conditions,
    ).toEqual(["condition.poisoned"]);
  });

  it("does not grant Second Wind on rest when the actor lacks that class resource", () => {
    expect(
      service.resolveRest({
        restType: "short",
        currentHp: 10,
        maxHp: 12,
        resource: {
          secondWindAvailable: false,
          actionSurgeUses: 0,
        },
        resourceMaximums: {
          secondWindAvailable: false,
          actionSurgeUses: 0,
        },
      }),
    ).toMatchObject({
      resource: {
        secondWindAvailable: false,
        actionSurgeUses: 0,
      },
      recoveredTags: [],
    });
  });
});
