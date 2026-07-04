import { ForbiddenException } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttMovementPolicyService } from "./session-vtt-movement-policy.service";
import { SessionVttPlayerMapUpdateService } from "./session-vtt-player-map-update.service";

describe("SessionVttPlayerMapUpdateService", () => {
  const service = new SessionVttPlayerMapUpdateService(new SessionVttMovementPolicyService());

  const createMap = (tokens: VttMapStateDto["tokens"]): VttMapStateDto => ({
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 640,
    height: 480,
    tokens,
    fogRects: [],
    startingPositions: [],
    terrainCells: [],
    wallCells: [],
    doorCells: [],
    objectCells: [],
    updatedAt: "2026-07-02T00:00:00.000Z",
  });

  const tokenA = {
    id: "token-a",
    sessionCharacterId: "session-character-a",
    name: "A",
    imageUrl: null,
    x: 64,
    y: 0,
    size: 64,
    hidden: false,
    isHostile: false,
    monster: null,
  };
  const tokenB = {
    id: "token-b",
    sessionCharacterId: "session-character-b",
    name: "B",
    imageUrl: null,
    x: 0,
    y: 64,
    size: 64,
    hidden: false,
    isHostile: false,
    monster: null,
  };

  it("keeps uncontrolled token positions from the server baseline", () => {
    const baseline = createMap([tokenA, tokenB]);
    const requestedMap = createMap([
      { ...tokenA, x: 0, y: 0 },
      { ...tokenB, x: 64, y: 64 },
    ]);

    const result = service.apply({
      baseline,
      comparableBaseline: baseline,
      requestedMap,
      controlledTokenIds: new Set(["session-character-b"]),
      activeCombat: null,
      currentCombatParticipant: null,
    });

    expect(result.map.tokens).toEqual([
      expect.objectContaining({ id: "token-a", x: 64, y: 0 }),
      expect.objectContaining({ id: "token-b", x: 64, y: 64 }),
    ]);
    expect(result.movementSpends).toEqual([]);
  });

  it("rejects visible token removal and new token addition", () => {
    const baseline = createMap([tokenA]);

    expect(() =>
      service.apply({
        baseline,
        comparableBaseline: baseline,
        requestedMap: createMap([]),
        controlledTokenIds: new Set(["session-character-a"]),
        activeCombat: null,
        currentCombatParticipant: null,
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      service.apply({
        baseline,
        comparableBaseline: baseline,
        requestedMap: createMap([tokenA, { ...tokenB, id: "new-token" }]),
        controlledTokenIds: new Set(["session-character-a"]),
        activeCombat: null,
        currentCombatParticipant: null,
      }),
    ).toThrow(ForbiddenException);
  });

  it("collects combat movement spend for the current actor", () => {
    const baseline = createMap([tokenA]);
    const requestedMap = createMap([{ ...tokenA, x: 128, y: 64 }]);
    const activeCombat = {
      id: "combat-1",
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: "participant-1",
      participants: [
        {
          id: "participant-1",
          tokenId: "token-a",
          sessionCharacterId: "session-character-a",
          speedFt: 30,
        },
      ],
    };

    const result = service.apply({
      baseline,
      comparableBaseline: baseline,
      requestedMap,
      controlledTokenIds: new Set(["session-character-a"]),
      activeCombat: activeCombat as never,
      currentCombatParticipant: activeCombat.participants[0] as never,
    });

    expect(result.movementSpends).toEqual([
      {
        combatId: "combat-1",
        combatParticipantId: "participant-1",
        roundNo: 2,
        turnNo: 3,
        sessionCharacterId: "session-character-a",
        distanceFt: 5,
      },
    ]);
  });
});
