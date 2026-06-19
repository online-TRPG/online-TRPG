import { CombatMovementService } from "./combat-movement.service";
import { CombatTargetingService } from "./combat-targeting.service";

describe("CombatTargetingService", () => {
  const createService = () =>
    new CombatTargetingService(new CombatMovementService(), {} as never, {} as never);

  const createMap = () => ({
    id: "map-1",
    width: 300,
    height: 300,
    gridSize: 50,
    gridType: "square" as const,
    tokens: [],
    terrainCells: [],
    wallCells: [],
    doorCells: [],
    objectCells: [],
    updatedAt: "2026-06-20T00:00:00.000Z",
  });

  it("allows Light on terrain effect cells because they are not line-of-effect blockers", () => {
    const service = createService();
    const map = {
      ...createMap(),
      terrainCells: [
        {
          id: "terrain-cell-1",
          terrainEffectId: "terrain.obscurement",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };

    expect(() => service.assertLightPointAllowed(map as never, { x: 50, y: 0 })).not.toThrow();
  });

  it("still blocks Light on structural terrain without a terrain effect id", () => {
    const service = createService();
    const map = {
      ...createMap(),
      terrainCells: [
        {
          id: "rubble",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };

    expect(() => service.assertLightPointAllowed(map as never, { x: 50, y: 0 })).toThrow();
  });
});
