import { CoverPositionService } from "../rules/cover-position.service";
import { CombatMovementService } from "./combat-movement.service";
import { CombatCoverService } from "./combat-cover.service";

describe("CombatCoverService", () => {
  const createService = () =>
    new CombatCoverService(
      new CoverPositionService(),
      {} as never,
      new CombatMovementService(),
    );

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

  it("grants minimum half cover to an elevated ranged attack target", () => {
    const service = createService();
    const map = {
      ...createMap(),
      terrainCells: [
        {
          id: "high-ground",
          terrainEffectId: "terrain.elevation",
          x: 150,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };

    const cover = service.resolveAttackCover(
      map as never,
      { id: "attacker", name: "Attacker", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", name: "Target", x: 150, y: 0, size: 50, hidden: false },
    );

    expect(cover.coverLevel).toBe("half");
    expect(cover.targetable).toBe(true);
  });

  it("does not apply elevated cover to adjacent melee attacks", () => {
    const service = createService();
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

    const cover = service.resolveAttackCover(
      map as never,
      { id: "attacker", name: "Attacker", x: 0, y: 0, size: 50, hidden: false },
      { id: "target", name: "Target", x: 50, y: 0, size: 50, hidden: false },
    );

    expect(cover.coverLevel).toBe("none");
  });
});
