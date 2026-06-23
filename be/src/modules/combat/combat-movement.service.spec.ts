import { CombatMovementService } from "./combat-movement.service";

describe("CombatMovementService", () => {
  const service = new CombatMovementService();

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

  it("includes terrain elevation delta when measuring token grid distance", () => {
    const map = {
      ...createMap(),
      terrainCells: [
        {
          id: "high-ground",
          terrainEffectId: "terrain.elevation",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };

    const distance = service.getTokenGridDistanceFt(
      map as never,
      { id: "source", name: "Source", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", name: "Target", x: 50, y: 0, size: 50, hidden: false },
    );

    expect(distance).toBe(15);
  });

  it("keeps flat adjacent token distance at 5ft", () => {
    const distance = service.getTokenGridDistanceFt(
      createMap() as never,
      { id: "source", name: "Source", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", name: "Target", x: 50, y: 0, size: 50, hidden: false },
    );

    expect(distance).toBe(5);
  });

  it("lets Land's Stride ignore nonmagical difficult terrain movement cost", () => {
    const map = {
      ...createMap(),
      terrainCells: [
        {
          id: "difficult-ground",
          terrainEffectId: "terrain.difficult",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };
    const token = {
      id: "ranger",
      name: "Ranger",
      x: 0,
      y: 0,
      size: 50,
      hidden: false,
    };
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];

    expect(
      service.calculateTerrainAdjustedMovementCostFt(
        map as never,
        token as never,
        path,
      ),
    ).toBe(10);
    expect(
      service.calculateTerrainAdjustedMovementCostFt(
        map as never,
        token as never,
        path,
        { ignoreNonmagicalDifficultTerrain: true },
      ),
    ).toBe(5);
  });
});
