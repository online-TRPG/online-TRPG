import { SessionRevealService } from "./session-reveal.service";
import { SessionVttObjectRuntimeService } from "./session-vtt-object-runtime.service";

describe("SessionVttObjectRuntimeService", () => {
  it("persists a discovered object with CAS before publishing its player position", async () => {
    const order: string[] = [];
    const map = {
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
          name: "Ari",
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
      objectCells: [
        {
          id: "object-1",
          name: "Inscription",
          description: null,
          terrainEffectId: null,
          x: 64,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          hiddenClueIds: ["clue-1"],
        },
      ],
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const tx = {};
    const saveRuntimeVttMapInTransaction = jest.fn(
      async (_client, params) => {
        order.push("save");
        return { map: params.map, runtimeVersion: 2 };
      },
    );
    const realtimeEvents = {
      emitVttMapUpdated: jest.fn(() => {
        order.push("publish");
      }),
      emitSessionSnapshot: jest.fn(),
    };
    const runtime = {
      prisma: {
        gameState: {
          findUnique: jest.fn().mockResolvedValue({
            currentNodeId: "node-1",
            flagsJson: "{}",
            version: 7,
          }),
        },
        $transaction: jest.fn(async (callback) => callback(tx)),
      },
      realtimeEvents,
      sessionReveal: new SessionRevealService(),
      buildSnapshot: jest.fn(),
      clampNumber: (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max),
      createSessionRevealRuntime: jest.fn(),
      getSessionEntityOrThrow: jest
        .fn()
        .mockResolvedValue({ id: "session-1", hostUserId: "host-1" }),
      getStringProperty: jest.fn(),
      getVttMapBaseline: jest.fn().mockResolvedValue(map),
      getVttMapForSessionScenario: jest.fn(),
      normalizeVttMap: jest.fn((value) => value),
      saveRuntimeVttMapInTransaction,
      recordSessionReveal: jest.fn(),
      rectsOverlap: jest.fn(),
      refreshSessionInventorySnapshot: jest.fn(),
    };
    const service = new SessionVttObjectRuntimeService().create(
      runtime as never,
    );

    await expect(
      service.revealObservableVttObjectsInPartyVision({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
      }),
    ).resolves.toEqual({
      count: 1,
      objectNames: ["Inscription"],
    });

    expect(saveRuntimeVttMapInTransaction).toHaveBeenCalledWith(tx, {
      sessionScenarioId: "session-scenario-1",
      fallbackFlags: {},
      expectedStateVersion: 7,
      map: expect.objectContaining({
        objectCells: [
          expect.objectContaining({
            id: "object-1",
            visibleToPlayers: true,
            observedBySessionCharacterIds: ["party"],
          }),
        ],
      }),
    });
    expect(order).toEqual(["save", "publish"]);
    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        hostUserId: "host-1",
        playerMap: expect.objectContaining({
          objectCells: [
            expect.objectContaining({
              id: "object-1",
              visibleToPlayers: true,
              hiddenClueIds: [],
            }),
          ],
        }),
      }),
    );
  });
});
