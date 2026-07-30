import { SessionRevealService } from "./session-reveal.service";

describe("SessionRevealService source object synchronization", () => {
  const createMap = (objectIds: string[]) => ({
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 640,
    height: 480,
    tokens: [],
    fogRects: [],
    objectCells: objectIds.map((id, index) => ({
      id,
      name: `Object ${index + 1}`,
      description: null,
      terrainEffectId: null,
      x: index * 64,
      y: 0,
      width: 64,
      height: 64,
      visibleToPlayers: false,
      observedBySessionCharacterIds: [] as string[],
      hiddenClueIds: ["clue-1"],
    })),
    updatedAt: "2026-07-31T00:00:00.000Z",
  });

  function createRuntime(map = createMap(["object-1"])) {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenarioNode: {
        findUnique: jest.fn().mockResolvedValue({
          cluesJson: JSON.stringify([
            {
              id: "clue-1",
              title: "Inscription",
              text: "The mark means danger.",
              revealPolicy: { mode: "AUTO_REVEAL" },
            },
          ]),
        }),
      },
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: "reveal-1" }),
      },
      sessionScenarioNodeRuntimeState: {
        findUnique: jest.fn().mockResolvedValue({
          vttMapJson: JSON.stringify(map),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: JSON.stringify({ vttMap: map }),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const runtime = {
      getStringProperty: (
        value: Record<string, unknown>,
        key: string,
      ) => (typeof value[key] === "string" ? value[key] : null),
      saveRuntimeVttMapInTransaction: jest.fn().mockResolvedValue({
        map,
        runtimeVersion: 2,
      }),
    };
    return { tx, runtime };
  }

  it("reveals a unique source object in the same transaction as an automatic clue", async () => {
    const service = new SessionRevealService();
    const { tx, runtime } = createRuntime();

    await expect(
      service.recordCurrentNodeCluesByPolicy(runtime as never, tx as never, {
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
        policyModes: ["AUTO_REVEAL"],
        revealedBy: "system",
      }),
    ).resolves.toEqual([
      {
        id: "clue-1",
        title: "Inscription",
        text: "The mark means danger.",
      },
    ]);

    expect(runtime.saveRuntimeVttMapInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        map: expect.objectContaining({
          objectCells: expect.arrayContaining([
            expect.objectContaining({
              id: "object-1",
              visibleToPlayers: true,
            }),
          ]),
        }),
      }),
    );
    expect(tx.sessionReveal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          snapshotJson: expect.stringContaining(
            '"sourceObjectId":"object-1"',
          ),
        }),
      }),
    );
    expect(tx.gameState.update).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous source object without creating the reveal", async () => {
    const service = new SessionRevealService();
    const { tx, runtime } = createRuntime(
      createMap(["object-1", "object-2"]),
    );

    await expect(
      service.recordCurrentNodeCluesByPolicy(runtime as never, tx as never, {
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
        policyModes: ["AUTO_REVEAL"],
        revealedBy: "system",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SOURCE_OBJECT_AMBIGUOUS",
      }),
    });
    expect(tx.sessionReveal.upsert).not.toHaveBeenCalled();
  });

  it("increments state once when a new reveal has no source map mutation", async () => {
    const service = new SessionRevealService();
    const { tx, runtime } = createRuntime(createMap([]));

    await expect(
      service.recordCurrentNodeCluesByPolicy(runtime as never, tx as never, {
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
        policyModes: ["AUTO_REVEAL"],
        revealedBy: "system",
      }),
    ).resolves.toHaveLength(1);

    expect(runtime.saveRuntimeVttMapInTransaction).not.toHaveBeenCalled();
    expect(tx.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: { version: { increment: 1 } },
    });
    expect(tx.gameState.update).toHaveBeenCalledTimes(1);
  });

  it("repairs a hidden source object when the reveal already exists", async () => {
    const service = new SessionRevealService();
    const { tx, runtime } = createRuntime();
    tx.sessionReveal.findMany.mockResolvedValue([{ contentId: "clue-1" }]);

    await expect(
      service.recordCurrentNodeCluesByPolicy(runtime as never, tx as never, {
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
        policyModes: ["AUTO_REVEAL"],
        revealedBy: "system",
      }),
    ).resolves.toEqual([]);

    expect(runtime.saveRuntimeVttMapInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.sessionReveal.upsert).not.toHaveBeenCalled();
  });

  it("does not rewrite an already synchronized source object on retry", async () => {
    const service = new SessionRevealService();
    const map = createMap(["object-1"]);
    map.objectCells[0].visibleToPlayers = true;
    map.objectCells[0].observedBySessionCharacterIds = ["party"];
    const { tx, runtime } = createRuntime(map);
    tx.sessionReveal.findMany.mockResolvedValue([{ contentId: "clue-1" }]);

    await expect(
      service.recordCurrentNodeCluesByPolicy(runtime as never, tx as never, {
        sessionScenarioId: "session-scenario-1",
        nodeId: "node-1",
        policyModes: ["AUTO_REVEAL"],
        revealedBy: "system",
      }),
    ).resolves.toEqual([]);

    expect(runtime.saveRuntimeVttMapInTransaction).not.toHaveBeenCalled();
    expect(tx.sessionReveal.upsert).not.toHaveBeenCalled();
  });

  it("treats a repeated manual reveal as an event-free no-op", async () => {
    const service = new SessionRevealService();
    const map = createMap(["object-1"]);
    map.objectCells[0].visibleToPlayers = true;
    map.objectCells[0].observedBySessionCharacterIds = ["party"];
    const { tx, runtime: baseRuntime } = createRuntime(map);
    const existingReveal = {
      id: "reveal-1",
      sessionScenarioId: "session-scenario-1",
      contentId: "clue-1",
      contentKind: "clue",
      scope: "party",
      recipientId: null,
      revealedAt: new Date("2026-07-31T00:00:00.000Z"),
      revealedBy: "human_gm",
      reason: "manual_gm_reveal",
    };
    Object.assign(tx.sessionReveal, {
      findUnique: jest.fn().mockResolvedValue(existingReveal),
      update: jest.fn(),
    });
    const runtime = {
      ...baseRuntime,
      prisma: {
        $transaction: jest.fn(async (callback) => callback(tx)),
      },
      getHumanGmSessionForOperator: jest
        .fn()
        .mockResolvedValue({ id: "session-1" }),
      getActiveSessionScenarioEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-scenario-1",
        scenarioId: "scenario-1",
      }),
      ensureSessionScenarioNodeSnapshotForScenario: jest.fn(),
      findSessionScenarioRevealable: jest.fn().mockResolvedValue({
        id: "clue-1",
        nodeId: "node-1",
        title: "Inscription",
      }),
      createHumanGmOverrideTurnLog: jest.fn(),
      publishCurrentVttMap: jest.fn(),
      buildSnapshot: jest.fn(),
      realtimeEvents: {
        emitTurnLogCreated: jest.fn(),
        emitStateDiffApplied: jest.fn(),
        emitSessionSnapshot: jest.fn(),
      },
    };

    await expect(
      service.revealSessionContent(
        runtime as never,
        "gm-1",
        "session-1",
        {
          contentId: "clue-1",
          contentKind: "clue",
          scope: "party",
          sourceObjectId: "object-1",
        },
      ),
    ).resolves.toMatchObject({
      id: "reveal-1",
      contentId: "clue-1",
    });

    expect(runtime.createHumanGmOverrideTurnLog).not.toHaveBeenCalled();
    expect(baseRuntime.saveRuntimeVttMapInTransaction).not.toHaveBeenCalled();
    expect(runtime.publishCurrentVttMap).not.toHaveBeenCalled();
    expect(runtime.buildSnapshot).not.toHaveBeenCalled();
    expect(runtime.realtimeEvents.emitSessionSnapshot).not.toHaveBeenCalled();
  });
});
