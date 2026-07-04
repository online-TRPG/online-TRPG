import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttMovementFramePublisherService } from "./session-vtt-movement-frame-publisher.service";

describe("SessionVttMovementFramePublisherService", () => {
  const realtimeEvents = {
    emitVttMapUpdated: jest.fn(),
  };
  const service = new SessionVttMovementFramePublisherService(realtimeEvents as never);
  const map: VttMapStateDto = {
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 640,
    height: 480,
    tokens: [
      {
        id: "token-1",
        sessionCharacterId: "session-character-1",
        name: "Hero",
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not emit frames for an empty path", async () => {
    await service.publish({
      sessionId: "session-1",
      hostUserId: "host-1",
      map,
      sourceTokenId: "token-1",
      path: [],
      redactVttMapForPlayer: jest.fn((value) => value),
      delayMs: 0,
    });

    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("emits host and redacted player maps for each movement frame", async () => {
    const redactVttMapForPlayer = jest.fn((value: VttMapStateDto) => ({
      ...value,
      tokens: value.tokens.map((token) => ({ ...token, hidden: false })),
    }));

    await service.publish({
      sessionId: "session-1",
      hostUserId: "host-1",
      map,
      sourceTokenId: "token-1",
      path: [
        { x: 64, y: 0 },
        { x: 128, y: 64 },
      ],
      redactVttMapForPlayer,
      delayMs: 0,
    });

    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenCalledTimes(2);
    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenNthCalledWith(1, "session-1", {
      hostUserId: "host-1",
      hostMap: expect.objectContaining({
        tokens: [expect.objectContaining({ id: "token-1", x: 64, y: 0 })],
      }),
      playerMap: expect.objectContaining({
        tokens: [expect.objectContaining({ id: "token-1", x: 64, y: 0 })],
      }),
    });
    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenNthCalledWith(2, "session-1", {
      hostUserId: "host-1",
      hostMap: expect.objectContaining({
        tokens: [expect.objectContaining({ id: "token-1", x: 128, y: 64 })],
      }),
      playerMap: expect.objectContaining({
        tokens: [expect.objectContaining({ id: "token-1", x: 128, y: 64 })],
      }),
    });
    expect(redactVttMapForPlayer).toHaveBeenCalledTimes(2);
  });
});
