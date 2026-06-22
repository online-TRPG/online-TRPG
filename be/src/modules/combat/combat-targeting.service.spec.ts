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

  it("keeps heavily obscured targets targetable while marking them obscured", () => {
    const service = createService();
    const map = {
      ...createMap(),
      tokens: [{ id: "target-token", x: 50, y: 0, size: 50, hidden: false }],
      terrainCells: [
        {
          id: "smoke",
          terrainEffectId: "terrain.obscurement",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
    };

    expect(
      service.resolveParticipantTargetVisibility(map as never, {
        tokenId: "target-token",
        sessionCharacterId: null,
        nameSnapshot: "Target",
      }),
    ).toEqual({
      targetable: true,
      heavilyObscured: true,
      reason: null,
    });
  });

  it("treats hidden tokens as not targetable", () => {
    const service = createService();
    const map = {
      ...createMap(),
      tokens: [{ id: "target-token", x: 50, y: 0, size: 50, hidden: true }],
    };

    expect(
      service.resolveParticipantTargetVisibility(map as never, {
        tokenId: "target-token",
        sessionCharacterId: null,
        nameSnapshot: "Target",
      }),
    ).toEqual({
      targetable: false,
      heavilyObscured: false,
      reason: "TOKEN_HIDDEN_OR_MISSING",
    });
  });
});
