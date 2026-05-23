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
      conditionTags: ["condition.poisoned"],
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
      conditionTags: ["condition.burning"],
      runtimeTags: [
        "movement:difficult_terrain",
        "trigger:on_enter",
        "damage:fire",
        "condition:burning",
        "vision:obscured",
      ],
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
    ]);
  });
});
