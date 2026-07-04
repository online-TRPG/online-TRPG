import { SessionVttMapPersistenceService } from "./session-vtt-map-persistence.service";

describe("SessionVttMapPersistenceService", () => {
  const prisma = {
    gameState: {
      update: jest.fn(),
    },
  };
  const realtimeEvents = {
    emitVttMapUpdated: jest.fn(),
    emitSessionSnapshot: jest.fn(),
  };
  const service = new SessionVttMapPersistenceService(prisma as never, realtimeEvents as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds VTT map flags while preserving existing flags", () => {
    const map = { id: "map-1", tokens: [], fogRects: [] };

    expect(service.buildMapFlags({ existing: true, vttMap: { id: "old-map" } }, map as never)).toEqual({
      existing: true,
      vttMap: map,
    });
  });

  it("saves VTT map into game state flags and increments version", async () => {
    const map = { id: "map-1", tokens: [], fogRects: [] };

    await service.saveMap({
      sessionScenarioId: "session-scenario-1",
      flags: { existing: true },
      map: map as never,
    });

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          existing: true,
          vttMap: map,
        }),
      },
    });
  });

  it("publishes host and player map payloads", () => {
    const hostMap = { id: "host-map" };
    const playerMap = { id: "player-map" };

    service.publishMapUpdated({
      sessionId: "session-1",
      hostUserId: "host-1",
      hostMap: hostMap as never,
      playerMap: playerMap as never,
    });

    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenCalledWith("session-1", {
      hostUserId: "host-1",
      hostMap,
      playerMap,
    });
  });

  it("publishes session snapshots when runtime map changes require it", () => {
    const snapshot = { id: "session-1" };

    service.publishSnapshot("session-1", snapshot as never);

    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", snapshot);
  });
});
