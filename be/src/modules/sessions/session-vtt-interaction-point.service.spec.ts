import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttInteractionPointService } from "./session-vtt-interaction-point.service";

describe("SessionVttInteractionPointService", () => {
  const service = new SessionVttInteractionPointService();

  const map: VttMapStateDto = {
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 640,
    height: 480,
    tokens: [],
    fogRects: [],
    startingPositions: [],
    terrainCells: [],
    wallCells: [],
    doorCells: [
      {
        id: "door-1",
        name: null,
        description: null,
        terrainEffectId: null,
        x: 64,
        y: 128,
        width: 64,
        height: 64,
        state: "closed",
        keyItemId: null,
        canBreak: false,
        breakCheckDc: null,
      },
    ],
    objectCells: [
      {
        id: "object-1",
        name: null,
        description: null,
        terrainEffectId: null,
        x: 200,
        y: 100,
        width: 80,
        height: 40,
        shapeCells: [],
        visibleToPlayers: true,
        canBreak: false,
        broken: false,
        breakCheckDc: null,
        hiddenClueIds: [],
        hiddenItemIds: [],
        hiddenEventIds: [],
        observedBySessionCharacterIds: [],
        revealChecks: [],
        events: [],
        hazard: null,
      },
    ],
    updatedAt: "2026-07-02T00:00:00.000Z",
  };

  it("floors direct map points", () => {
    expect(service.resolveMapPoint({ mapPoint: { x: 12.9, y: 20.1 } } as never)).toEqual({
      x: 12,
      y: 20,
    });
  });

  it("normalizes target id input", () => {
    expect(service.getTargetId({ targetId: " door-1 " } as never)).toBe("door-1");
    expect(service.getTargetId({ targetId: "   " } as never)).toBeNull();
  });

  it("resolves door and object targets to cell centers", () => {
    expect(service.resolveTargetPoint(map, "door-1")).toEqual({
      x: 96,
      y: 160,
    });
    expect(service.resolveTargetPoint(map, "object-1")).toEqual({
      x: 240,
      y: 120,
    });
  });

  it("returns null for unknown targets", () => {
    expect(service.resolveTargetPoint(map, "missing")).toBeNull();
  });
});
