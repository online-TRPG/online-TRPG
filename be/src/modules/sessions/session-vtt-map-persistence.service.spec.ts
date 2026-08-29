import { SessionVttMapPersistenceService } from "./session-vtt-map-persistence.service";

describe("SessionVttMapPersistenceService", () => {
  const prisma = {
    $transaction: jest.fn(),
  };
  const realtimeEvents = {
    emitVttMapUpdated: jest.fn(),
    emitSessionSnapshot: jest.fn(),
  };
  const runtimeMaps = {
    saveCurrentMap: jest.fn(),
  };
  const service = new SessionVttMapPersistenceService(
    prisma as never,
    realtimeEvents as never,
    runtimeMaps as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({ $executeRaw: jest.fn() }),
    );
    runtimeMaps.saveCurrentMap.mockImplementation(
      async (_tx, params: { map: unknown }) => ({
        map: params.map,
        runtimeVersion: 2,
      }),
    );
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
      expectedStateVersion: 7,
    });

    expect(runtimeMaps.saveCurrentMap).toHaveBeenCalledWith(
      expect.anything(),
      {
        sessionScenarioId: "session-scenario-1",
        fallbackFlags: { existing: true },
        map,
        expectedStateVersion: 7,
      },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("publishes host and player map payloads", () => {
    const hostMap = { id: "host-map" };
    const playerMap = { id: "player-map" };

    service.publishMapUpdated({
      sessionId: "session-1",
      hostUserId: "host-1",
      hostMap: hostMap as never,
      playerMap: playerMap as never,
      stateVersion: 12,
      runtimeVersion: 4,
    });

    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenCalledWith("session-1", {
      hostUserId: "host-1",
      hostMap,
      playerMap,
      stateVersion: 12,
      runtimeVersion: 4,
    });
  });

  it("publishes session snapshots when runtime map changes require it", () => {
    const snapshot = { id: "session-1" };

    service.publishSnapshot("session-1", snapshot as never);

    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", snapshot);
  });
});
