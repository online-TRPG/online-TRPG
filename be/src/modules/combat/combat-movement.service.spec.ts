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
      { id: "source", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", x: 50, y: 0, size: 50, hidden: false },
    );

    expect(distance).toBe(15);
  });

  it("keeps flat adjacent token distance at 5ft", () => {
    const distance = service.getTokenGridDistanceFt(
      createMap() as never,
      { id: "source", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", x: 50, y: 0, size: 50, hidden: false },
    );

    expect(distance).toBe(5);
  });
});
