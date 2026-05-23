import { ForcedMovementService } from "./forced-movement.service";

describe("ForcedMovementService", () => {
  const service = new ForcedMovementService();

  it("pushes a target away without spending movement or provoking by default", () => {
    expect(
      service.resolveForcedMovement({
        mode: "push",
        origin: { x: 1, y: 1 },
        target: { x: 2, y: 1 },
        distanceFt: 10,
        grid: { width: 6, height: 6 },
      }),
    ).toMatchObject({
      mode: "push",
      start: { x: 2, y: 1 },
      destination: { x: 4, y: 1 },
      path: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
      ],
      distanceMovedFt: 10,
      movementCostFt: 0,
      provokesOpportunityAttack: false,
      stoppedReason: "completed",
      collision: null,
      fall: null,
    });
  });

  it("pulls a target toward the origin", () => {
    expect(
      service.resolveForcedMovement({
        mode: "pull",
        origin: { x: 1, y: 1 },
        target: { x: 4, y: 1 },
        distanceFt: 10,
        grid: { width: 6, height: 6 },
      }),
    ).toMatchObject({
      destination: { x: 2, y: 1 },
      distanceMovedFt: 10,
    });
  });

  it("stops at blocking terrain and reports the collision point", () => {
    expect(
      service.resolveForcedMovement({
        mode: "push",
        origin: { x: 1, y: 1 },
        target: { x: 2, y: 1 },
        distanceFt: 20,
        grid: { width: 6, height: 6 },
        obstacles: [{ x: 4, y: 1 }],
      }),
    ).toMatchObject({
      destination: { x: 3, y: 1 },
      distanceMovedFt: 5,
      stoppedReason: "blocked",
      collision: { point: { x: 4, y: 1 } },
    });
  });

  it("stops at blocking tokens and keeps the token id", () => {
    expect(
      service.resolveForcedMovement({
        mode: "push",
        origin: { x: 1, y: 1 },
        target: { x: 2, y: 1 },
        distanceFt: 20,
        grid: { width: 6, height: 6 },
        tokens: [{ id: "monster-2", point: { x: 4, y: 1 } }],
      }),
    ).toMatchObject({
      stoppedReason: "blocked",
      collision: { point: { x: 4, y: 1 }, tokenId: "monster-2" },
    });
  });

  it("records hazardous terrain entered by forced movement", () => {
    const result = service.resolveForcedMovement({
      mode: "push",
      origin: { x: 1, y: 1 },
      target: { x: 2, y: 1 },
      distanceFt: 15,
      grid: { width: 6, height: 6 },
      hazards: [
        { point: { x: 3, y: 1 }, terrainEffectId: "terrain.burning" },
        { point: { x: 5, y: 1 }, terrainEffectId: "terrain.poison_cloud" },
      ],
    });

    expect(result).toMatchObject({
      destination: { x: 5, y: 1 },
      enteredHazards: [
        { point: { x: 3, y: 1 }, terrainEffectId: "terrain.burning" },
        { point: { x: 5, y: 1 }, terrainEffectId: "terrain.poison_cloud" },
      ],
    });
    expect(result.enteredTerrainEffects).toMatchObject([
      {
        point: { x: 3, y: 1 },
        terrainEffectId: "terrain.burning",
        effect: {
          saveDc: 12,
          damage: { dice: "1d6", type: "fire" },
          conditionTags: ["condition.burning"],
        },
      },
      {
        point: { x: 5, y: 1 },
        terrainEffectId: "terrain.poison_cloud",
        effect: {
          saveDc: 13,
          damage: { dice: "1d6", type: "poison" },
          conditionTags: ["condition.poisoned"],
        },
      },
    ]);
    expect(result.combinedEnteredTerrainEffect).toMatchObject({
      terrainEffectId: "terrain.combined",
      saveDc: 13,
      conditionTags: ["condition.burning", "condition.poisoned"],
      runtimeTags: expect.arrayContaining([
        "damage:fire",
        "condition:burning",
        "save:con",
        "damage:poison",
        "condition:poisoned",
      ]),
    });
  });

  it("reports edge-of-map falls without moving outside the grid", () => {
    expect(
      service.resolveForcedMovement({
        mode: "push",
        origin: { x: 2, y: 1 },
        target: { x: 1, y: 1 },
        distanceFt: 15,
        grid: { width: 3, height: 3 },
      }),
    ).toMatchObject({
      destination: { x: 0, y: 1 },
      distanceMovedFt: 5,
      stoppedReason: "edge_of_map",
      fall: { point: { x: 0, y: 1 }, distanceFt: 5 },
    });
  });
});
