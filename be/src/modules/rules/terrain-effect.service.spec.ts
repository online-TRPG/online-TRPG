import { TerrainEffectService } from "./terrain-effect.service";

describe("TerrainEffectService", () => {
  const service = new TerrainEffectService();

  it("resolves difficult terrain movement cost", () => {
    expect(service.resolveEffect("terrain.difficult")).toMatchObject({
      terrainEffectId: "terrain.difficult",
      movementCostMultiplier: 2,
      damage: null,
      conditionTags: [],
      runtimeTags: ["movement:difficult_terrain"],
    });
  });

  it("normalizes unprefixed and dashed terrain ids", () => {
    expect(service.resolveEffect("poison-cloud")).toMatchObject({
      terrainEffectId: "terrain.poison_cloud",
      saveDc: 13,
      damage: { dice: "1d6", type: "poison" },
      damagePackets: [
        { sourceEffectId: "terrain.poison_cloud", dice: "1d6", type: "poison" },
      ],
      conditionTags: ["condition.poisoned"],
      runtimeTags: expect.arrayContaining([
        "trigger:on_exit",
        "condition_ends:on_exit",
      ]),
    });
  });

  it("ignores unsupported terrain ids instead of throwing", () => {
    expect(service.resolveEffect("terrain.custom_unknown")).toBeNull();
    expect(service.resolveCombinedEffects(["terrain.custom_unknown", "terrain.difficult"])).toMatchObject({
      terrainEffectId: "terrain.combined",
      movementCostMultiplier: 2,
      damage: null,
      conditionTags: [],
    });
  });

  it("combines movement, obscurity, damage, and conditions", () => {
    expect(
      service.resolveCombinedEffects([
        "terrain.difficult",
        "terrain.burning",
        "terrain.obscurement",
      ]),
    ).toMatchObject({
      terrainEffectId: "terrain.combined",
      movementCostMultiplier: 2,
      lightlyObscured: true,
      heavilyObscured: true,
      saveDc: 12,
      damage: { dice: "1d6", type: "fire" },
      damagePackets: [
        { sourceEffectId: "terrain.burning", dice: "1d6", type: "fire" },
      ],
      conditionTags: ["condition.burning"],
      runtimeTags: [
        "movement:difficult_terrain",
        "trigger:on_enter",
        "trigger:on_turn_start",
        "trigger:on_turn_end",
        "damage:fire",
        "damage_over_time:fire:1d6",
        "condition:burning",
        "vision:obscured",
      ],
    });
  });

  it("combines one damage packet per distinct terrain effect independent of input order", () => {
    const forward = service.resolveCombinedEffects([
      "terrain.poison_cloud",
      "terrain.burning",
      "terrain.poison_cloud",
    ]);
    const reverse = service.resolveCombinedEffects([
      "terrain.burning",
      "terrain.poison_cloud",
    ]);

    expect(forward.damagePackets).toEqual([
      { sourceEffectId: "terrain.burning", dice: "1d6", type: "fire" },
      { sourceEffectId: "terrain.poison_cloud", dice: "1d6", type: "poison" },
    ]);
    expect(reverse.damagePackets).toEqual(forward.damagePackets);
  });

  it("separates movement-only and persistent terrain triggers", () => {
    const slippery = service.resolveEffect("terrain.slippery");
    const burning = service.resolveEffect("terrain.burning");
    const poisonCloud = service.resolveEffect("terrain.poison_cloud");

    expect(slippery && service.supportsTrigger(slippery, "on_enter")).toBe(true);
    expect(slippery && service.supportsTrigger(slippery, "on_turn_start")).toBe(false);
    expect(burning && service.supportsTrigger(burning, "on_turn_start")).toBe(true);
    expect(burning && service.supportsTrigger(burning, "on_turn_end")).toBe(true);
    expect(poisonCloud && service.supportsTrigger(poisonCloud, "on_turn_start")).toBe(true);
    expect(poisonCloud && service.supportsTrigger(poisonCloud, "on_exit")).toBe(true);
  });

  it("resolves Moonbeam as a persistent radiant spell terrain", () => {
    expect(service.resolveEffect("terrain.moonbeam")).toMatchObject({
      damage: { dice: "2d10", type: "radiant" },
      damagePackets: [
        {
          sourceEffectId: "terrain.moonbeam",
          dice: "2d10",
          type: "radiant",
        },
      ],
      runtimeTags: expect.arrayContaining([
        "trigger:on_enter",
        "trigger:on_turn_start",
        "save:con",
        "half_damage_on_success",
      ]),
    });
  });

  it("lists the roadmap terrain effects", () => {
    expect(service.listEffects().map((effect) => effect.terrainEffectId)).toEqual([
      "terrain.difficult",
      "terrain.hazardous",
      "terrain.obscurement",
      "terrain.elevation",
      "terrain.slippery",
      "terrain.burning",
      "terrain.poison_cloud",
      "terrain.moonbeam",
      "terrain.flaming_sphere",
      "terrain.wall_of_fire",
    ]);
  });
});
