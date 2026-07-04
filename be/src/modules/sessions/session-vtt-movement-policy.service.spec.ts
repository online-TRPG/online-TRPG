import { ForbiddenException } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttMovementPolicyService } from "./session-vtt-movement-policy.service";

describe("SessionVttMovementPolicyService", () => {
  const service = new SessionVttMovementPolicyService();

  const createMap = (overrides: Partial<VttMapStateDto> = {}): VttMapStateDto => ({
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 256,
    height: 256,
    tokens: [
      {
        id: "token-a",
        sessionCharacterId: "session-character-a",
        name: "A",
        imageUrl: null,
        x: 0,
        y: 0,
        size: 64,
        hidden: false,
        isHostile: false,
        monster: null,
      },
    ],
    fogRects: [],
    startingPositions: [],
    terrainCells: [],
    wallCells: [],
    doorCells: [],
    objectCells: [],
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  });

  it("allows reachable token movement", () => {
    const map = createMap();
    const token = map.tokens[0];

    expect(() =>
      service.ensureTokenPathIsReachable(map, token, {
        ...token,
        x: 128,
        y: 64,
      }),
    ).not.toThrow();
  });

  it("rejects token movement through blocking walls", () => {
    const map = createMap({
      wallCells: [
        {
          id: "wall-1",
          name: null,
          description: null,
          terrainEffectId: null,
          x: 64,
          y: 0,
          width: 64,
          height: 256,
        },
      ],
    });
    const token = map.tokens[0];

    expect(() =>
      service.ensureTokenPathIsReachable(map, token, {
        ...token,
        x: 192,
        y: 0,
      }),
    ).toThrow(ForbiddenException);
  });

  it("prevents diagonal corner cutting through blockers", () => {
    const map = createMap({
      tokens: [
        ...createMap().tokens,
        {
          id: "target",
          sessionCharacterId: null,
          name: "Target",
          imageUrl: null,
          x: 128,
          y: 128,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: null,
        },
      ],
      terrainCells: [
        {
          id: "terrain-1",
          name: null,
          description: null,
          terrainEffectId: null,
          x: 64,
          y: 0,
          width: 64,
          height: 64,
        },
        {
          id: "terrain-2",
          name: null,
          description: null,
          terrainEffectId: null,
          x: 0,
          y: 64,
          width: 64,
          height: 64,
        },
      ],
    });

    const movement = service.calculateTokenStepTowardTarget(map, {
      sourceTokenId: "token-a",
      targetTokenId: "target",
      maxDistanceFt: 10,
      stopWithinFt: 5,
    });

    expect(movement).toBeNull();
  });

  it("calculates Chebyshev grid movement distance in feet", () => {
    const map = createMap();
    const token = map.tokens[0];

    expect(
      service.calculateTokenGridMovementFt(map, token, {
        ...token,
        x: 128,
        y: 64,
      }),
    ).toBe(10);
  });

  it("rejects player map shell changes", () => {
    const baseline = createMap();
    const requested = {
      ...baseline,
      fogRects: [{ id: "fog-1", x: 0, y: 0, width: 64, height: 64 }],
    };

    expect(() =>
      service.ensurePlayerMapShellUnchanged({
        baseline,
        comparableBaseline: baseline,
        requested,
      }),
    ).toThrow(ForbiddenException);
  });

  it("allows token-only coordinate changes", () => {
    const token = createMap().tokens[0];

    expect(() =>
      service.ensureOnlyTokenPositionChanged(token, {
        ...token,
        x: 64,
        y: 64,
      }),
    ).not.toThrow();
  });
});
