import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";

describe("SessionVttMapNormalizationService", () => {
  const service = new SessionVttMapNormalizationService();

  const createMap = (overrides: Partial<VttMapStateDto> = {}): VttMapStateDto => ({
    id: "map-1",
    scenarioNodeId: null,
    imageUrl: null,
    gridType: "square",
    gridSize: 999,
    width: 200,
    height: 100,
    tokens: [],
    fogRects: [],
    startingPositions: [],
    terrainCells: [],
    wallCells: [],
    doorCells: [],
    objectCells: [],
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  });

  it("clamps map dimensions and token bounds", () => {
    const normalized = service.normalize(
      createMap({
        tokens: [
          {
            id: "token-1",
            sessionCharacterId: "session-character-1",
            name: "Hero",
            imageUrl: null,
            x: 9999,
            y: -10,
            size: 999,
            hidden: false,
            isHostile: false,
            monster: null,
          },
        ],
      }),
      "node-1",
    );

    expect(normalized).toMatchObject({
      scenarioNodeId: "node-1",
      gridSize: 160,
      width: 320,
      height: 240,
    });
    expect(normalized.tokens[0]).toMatchObject({
      x: 160,
      y: 0,
      size: 160,
    });
  });

  it("normalizes structural cells, doors, object shapes, and hazards", () => {
    const normalized = service.normalize(
      createMap({
        gridSize: 64,
        width: 640,
        height: 480,
        terrainCells: [
          {
            id: "terrain-1",
            name: "Poison Cloud",
            description: null,
            terrainEffectId: "Poison Cloud",
            x: 40,
            y: 40,
            width: 64,
            height: 64,
          },
        ],
        doorCells: [
          {
            id: "door-1",
            name: null,
            description: null,
            terrainEffectId: null,
            x: 0,
            y: 0,
            width: 64,
            height: 64,
            state: "locked",
            keyItemId: "key-1",
            canBreak: true,
            breakCheckDc: 99,
          },
        ],
        objectCells: [
          {
            id: "trap-1",
            name: "Trap",
            description: null,
            terrainEffectId: null,
            x: 128,
            y: 128,
            width: 64,
            height: 64,
            visibleToPlayers: false,
            shapeCells: [
              { x: 128, y: 128, width: 64, height: 64 },
              { x: 192, y: 128, width: 64, height: 64 },
            ],
            hazard: {
              kind: "AMBUSH",
              armed: true,
              triggerOnce: true,
              detectionRadiusCells: 99,
              detectionDc: 99,
              linkedClueIds: ["clue-1"],
              attemptedBySessionCharacterIds: ["session-character-1"],
              detectedBySessionCharacterIds: ["session-character-2"],
            },
          },
        ],
      }),
      "node-1",
    );

    expect(normalized.terrainCells[0]).toMatchObject({
      terrainEffectId: "poison_cloud",
    });
    expect(normalized.doorCells[0]).toMatchObject({
      state: "locked",
      keyItemId: "key-1",
      canBreak: true,
      breakCheckDc: 40,
    });
    expect(normalized.objectCells[0]).toMatchObject({
      x: 128,
      width: 128,
      visibleToPlayers: false,
      hazard: {
        kind: "AMBUSH",
        detectionRadiusCells: 20,
        detectionDc: 40,
      },
    });
  });

  it("hydrates persisted partial maps and rejects invalid values", () => {
    expect(service.toVttMapOrNull(null)).toBeNull();
    expect(service.toVttMapOrNull({ id: "map-1", fogRects: [] })).toBeNull();

    const map = service.toVttMapOrNull({
      id: "map-1",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
    });

    expect(map).toMatchObject({
      id: "map-1",
      scenarioNodeId: null,
      gridSize: 64,
      width: 640,
      height: 480,
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
    });
  });
});
