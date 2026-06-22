import { VttMapStateDto } from "@trpg/shared-types";
import { ActionProcessorService } from "./action-processor.service";

describe("ActionProcessorService session action queue", () => {
  it("processes a session queue once when processNext is called concurrently", async () => {
    let markProcessingStarted!: () => void;
    const processingStarted = new Promise<void>((resolve) => {
      markProcessingStarted = resolve;
    });
    let releaseProcessing!: () => void;
    const processingGate = new Promise<void>((resolve) => {
      releaseProcessing = resolve;
    });
    const action = {
      id: "action-1",
      sessionId: "session-1",
      userId: "user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/item pickup object-rope equipment.rope 1 1 0",
    };
    const prisma = {
      playerAction: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(action)
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitSystemMessage: jest.fn(),
    };
    const service = new ActionProcessorService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      processNext: (sessionId: string) => Promise<void>;
      processAction: (actionId: string) => Promise<unknown>;
    };
    const processAction = jest
      .spyOn(service, "processAction")
      .mockImplementation(async () => {
        markProcessingStarted();
        await processingGate;
        return { turnLogId: "turn-log-1" };
      });

    const first = service.processNext("session-1");
    await processingStarted;
    const second = service.processNext("session-1");
    releaseProcessing();
    await Promise.all([first, second]);

    expect(prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "action-1",
        queueStatus: "PENDING",
      },
      data: { queueStatus: "PROCESSING" },
    });
    expect(processAction).toHaveBeenCalledTimes(1);
    expect(prisma.playerAction.update).toHaveBeenCalledTimes(1);
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledTimes(1);
  });

  it("does not process an action when another worker claimed it first", async () => {
    const action = {
      id: "action-1",
      sessionId: "session-1",
      userId: "user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest short",
    };
    const prisma = {
      playerAction: {
        findFirst: jest.fn().mockResolvedValue(action),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    const service = new ActionProcessorService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      processNext: (sessionId: string) => Promise<void>;
      processAction: (actionId: string) => Promise<unknown>;
    };
    const processAction = jest.spyOn(service, "processAction");

    await service.processNext("session-1");

    expect(processAction).not.toHaveBeenCalled();
    expect(prisma.playerAction.update).not.toHaveBeenCalled();
  });

  it("drains an action submitted while the active processor is finishing", async () => {
    let releaseEmptyQueueCheck!: () => void;
    const emptyQueueCheckGate = new Promise<void>((resolve) => {
      releaseEmptyQueueCheck = resolve;
    });
    let markEmptyQueueCheckStarted!: () => void;
    const emptyQueueCheckStarted = new Promise<void>((resolve) => {
      markEmptyQueueCheckStarted = resolve;
    });
    const firstAction = {
      id: "action-1",
      sessionId: "session-1",
      userId: "user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest short",
    };
    const secondAction = {
      ...firstAction,
      id: "action-2",
      rawText: "/rest long",
    };
    const prisma = {
      playerAction: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(firstAction)
          .mockImplementationOnce(async () => {
            markEmptyQueueCheckStarted();
            await emptyQueueCheckGate;
            return null;
          })
          .mockResolvedValueOnce(secondAction)
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ActionProcessorService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emitTurnLogCreated: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      processNext: (sessionId: string) => Promise<void>;
      processAction: (actionId: string) => Promise<unknown>;
    };
    const processAction = jest
      .spyOn(service, "processAction")
      .mockResolvedValue({ turnLogId: "turn-log-1" });

    const activeProcessor = service.processNext("session-1");
    await emptyQueueCheckStarted;
    const lateRequest = service.processNext("session-1");
    releaseEmptyQueueCheck();
    await Promise.all([activeProcessor, lateRequest]);

    expect(processAction).toHaveBeenNthCalledWith(1, "action-1");
    expect(processAction).toHaveBeenNthCalledWith(2, "action-2");
    expect(prisma.playerAction.updateMany).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing turn log when a later action mutation fails", async () => {
    const action = {
      id: "action-1",
      sessionId: "session-1",
      userId: "user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/item pickup object-rope equipment.rope 1 1 0",
    };
    const prisma = {
      playerAction: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const correctedFailureLog = {
      turnLogId: "turn-log-1",
      outcome: "FAILURE",
      narration: "행동 처리 실패: VTT map state conflict",
    };
    const turnLogsService = {
      markLatestPlayerActionFailed: jest.fn().mockResolvedValue(correctedFailureLog),
      createTurnLog: jest.fn(),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitSystemMessage: jest.fn(),
    };
    const service = new ActionProcessorService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      turnLogsService as never,
      realtimeEvents as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      processClaimedAction: (claimedAction: typeof action) => Promise<void>;
      processAction: (actionId: string) => Promise<unknown>;
    };
    jest
      .spyOn(service, "processAction")
      .mockRejectedValue(new Error("VTT map state conflict"));

    await service.processClaimedAction(action);

    expect(turnLogsService.markLatestPlayerActionFailed).toHaveBeenCalledWith(
      "action-1",
      "VTT map state conflict",
    );
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      correctedFailureLog,
    );
  });
});

const createBaseMap = (): VttMapStateDto => ({
  id: "map-1",
  scenarioNodeId: "node-1",
  gridType: "square",
  gridSize: 50,
  width: 500,
  height: 500,
  tokens: [],
  fogRects: [],
  updatedAt: "2026-05-25T00:00:00.000Z",
  objectCells: [
    {
      id: "object-rope",
      x: 50,
      y: 0,
      width: 50,
      height: 50,
      name: "Rope",
      description: "equipment.rope x5",
      visibleToPlayers: true,
      hiddenItemIds: ["equipment.rope"],
    },
  ],
});

describe("ActionProcessorService map-only runtime effects", () => {
  it("rejects direct VTT object mutations before a success turn log can be created", async () => {
    const service = new ActionProcessorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      assertRuntimeEffectPreconditions: (...args: unknown[]) => Promise<void>;
    };

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            { type: "SPEND_ACTION" },
            {
              type: "CREATE_MAP_OBJECT",
              objectId: "object:thrown:entry-dagger:4:0",
              itemDefinitionId: "equipment.dagger",
              name: "Dagger",
              quantity: 1,
              point: { x: 4, y: 0 },
            },
          ],
        },
        {
          sessionId: "session-1",
          sessionScenarioId: "session-scenario-1",
          sessionCharacterId: "session-character-1",
          turnStateKey: null,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: {
          reason: "MAP_EFFECT_REQUIRES_ATOMIC_INVENTORY_PAIR",
          effectType: "CREATE_MAP_OBJECT",
        },
      },
    });
  });
});

describe("ActionProcessorService inventory/map atomic runtime effects", () => {
  const createService = (options?: { inventoryEntry?: unknown | null; map?: VttMapStateDto }) => {
    const tx = {
      itemDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: "equipment.rope",
          name: "Rope",
          itemType: "GEAR",
          description: "50 feet of hempen rope",
          weightLb: 10,
          volumeCuFt: null,
          damageDice: null,
          damageType: null,
          armorClassBase: null,
          armorClassBonus: null,
          armorStrengthRequirement: null,
          armorStealthDisadvantage: null,
          useEffect: null,
        }),
      },
      inventoryEntry: {
        create: jest.fn().mockResolvedValue({ id: "entry-rope" }),
        findUnique: jest.fn().mockResolvedValue({
          id: "bag-entry",
          sessionCharacterId: "session-character-1",
          containerState: {
            currentWeightLb: 0,
            currentVolumeCuFt: 0,
            integrity: "INTACT",
          },
        }),
        findFirst: jest.fn().mockResolvedValue(
          options && "inventoryEntry" in options
            ? options.inventoryEntry
            : {
                id: "entry-rope",
                quantity: 5,
              },
        ),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "entry-rope",
            itemDefinitionId: "equipment.rope",
            quantity: 2,
            containerEntryId: null,
            itemDefinition: {
              name: "Rope",
              itemType: "GEAR",
              description: "50 feet of hempen rope",
              weightLb: 10,
              volumeCuFt: null,
              damageDice: null,
              damageType: null,
              armorClassBase: null,
              armorClassBonus: null,
              armorStrengthRequirement: null,
              armorStealthDisadvantage: null,
              useEffect: null,
            },
          },
        ]),
      },
      sessionCharacter: {
        update: jest.fn(),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: JSON.stringify({ unrelatedFlag: true }),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      containerState: {
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      itemDefinition: tx.itemDefinition,
      inventoryEntry: tx.inventoryEntry,
      containerState: tx.containerState,
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({ hostUserId: "host-user-1" }),
      getGameStateEntityOrThrow: jest.fn().mockResolvedValue({
        sessionScenario: { id: "session-scenario-1" },
        state: { currentNodeId: "node-1", flagsJson: null, version: 7 },
      }),
      getVttMapBaseline: jest.fn().mockResolvedValue(options?.map ?? createBaseMap()),
      normalizeVttMap: jest.fn((map: VttMapStateDto) => map),
      redactVttMapForPlayer: jest.fn((map: VttMapStateDto) => ({
        ...map,
        playerRedacted: true,
      })),
    };
    const realtimeEvents = {
      emitVttMapUpdated: jest.fn(),
    };
    const actionEconomy = {
      spendAction: jest.fn().mockResolvedValue({ actionUsed: true }),
    };

    const service = new ActionProcessorService(
      prisma as never,
      sessionsService as never,
      {} as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
      {} as never,
      actionEconomy as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return {
      service: service as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
      tx,
      prisma,
      realtimeEvents,
      actionEconomy,
    };
  };

  const params = {
    sessionId: "session-1",
    sessionScenarioId: "session-scenario-1",
    sessionCharacterId: "session-character-1",
    turnStateKey: null,
  };

  it("saves inventory and VTT map pickup changes in a single transaction", async () => {
    const { service, tx, prisma, realtimeEvents } = createService();

    await service.applyInventoryMapRuntimeEffectsAtomically(params, [
      {
        type: "ADD_ITEM",
        itemDefinitionId: "equipment.rope",
        quantity: 2,
      },
      {
        type: "UPDATE_MAP_OBJECT_QUANTITY",
        objectId: "object-rope",
        itemDefinitionId: "equipment.rope",
        quantity: 3,
      },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-rope" },
      data: { quantity: { increment: 2 } },
    });
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.sessionCharacter.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "session-character-1" } }),
    );
    const updateArg = tx.gameState.updateMany.mock.calls[0]?.[0] as {
      where: { sessionScenarioId: string; version: number };
      data: { flagsJson: string; version: { increment: number } };
    };
    expect(updateArg.where).toEqual({
      sessionScenarioId: "session-scenario-1",
      version: 7,
    });
    expect(updateArg.data.version).toEqual({ increment: 1 });
    expect(JSON.parse(updateArg.data.flagsJson)).toEqual(
      expect.objectContaining({
        unrelatedFlag: true,
        vttMap: expect.objectContaining({
          objectCells: [
            expect.objectContaining({
              id: "object-rope",
              description: "equipment.rope x3",
              hiddenItemIds: ["equipment.rope"],
            }),
          ],
        }),
      }),
    );
    expect(realtimeEvents.emitVttMapUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        hostUserId: "host-user-1",
        hostMap: expect.objectContaining({
          objectCells: [
            expect.objectContaining({
              id: "object-rope",
              description: "equipment.rope x3",
              hiddenItemIds: ["equipment.rope"],
            }),
          ],
        }),
      }),
    );
  });

  it("spends the paired item interaction action inside the inventory and map transaction", async () => {
    const { service, tx, actionEconomy } = createService();
    const turnStateKey = {
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-1",
    };

    await service.applyInventoryMapRuntimeEffectsAtomically(
      { ...params, turnStateKey },
      [
        { type: "SPEND_ACTION" },
        {
          type: "ADD_ITEM",
          itemDefinitionId: "equipment.rope",
          quantity: 2,
        },
        {
          type: "REMOVE_MAP_OBJECT",
          objectId: "object-rope",
        },
      ],
    );

    expect(actionEconomy.spendAction).toHaveBeenCalledWith(turnStateKey, tx);
  });

  it("defers paired item interaction action spending until the atomic transaction", async () => {
    const { service, actionEconomy } = createService();

    await service.applyEarlyRuntimeEffects(
      {
        runtimeEffects: [
          { type: "SPEND_ACTION" },
          {
            type: "ADD_ITEM",
            itemDefinitionId: "equipment.rope",
            quantity: 1,
          },
          {
            type: "REMOVE_MAP_OBJECT",
            objectId: "object-rope",
          },
        ],
      },
      {
        ...params,
        turnStateKey: {
          combatId: "combat-1",
          combatParticipantId: "participant-1",
          roundNo: 1,
          turnNo: 2,
          sessionCharacterId: "session-character-1",
        },
      },
    );

    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
  });

  it("does not persist or emit map changes when the paired inventory mutation fails", async () => {
    const { service, tx, realtimeEvents } = createService({ inventoryEntry: null });

    await expect(
      service.applyInventoryMapRuntimeEffectsAtomically(params, [
        {
          type: "REMOVE_ITEM",
          itemId: "entry-rope",
          quantity: 1,
        },
        {
          type: "CREATE_MAP_OBJECT",
          objectId: "object:dropped:entry-rope:2:0",
          itemDefinitionId: "equipment.rope",
          name: "Rope",
          quantity: 1,
          point: { x: 2, y: 0 },
        },
      ]),
    ).rejects.toThrow();

    expect(tx.gameState.updateMany).toHaveBeenCalledTimes(1);
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("does not add inventory when the paired map object has already disappeared", async () => {
    const emptyMap = {
      ...createBaseMap(),
      objectCells: [],
    };
    const { service, tx, realtimeEvents } = createService({ map: emptyMap });

    await expect(
      service.applyInventoryMapRuntimeEffectsAtomically(params, [
        {
          type: "ADD_ITEM",
          itemDefinitionId: "equipment.rope",
          quantity: 2,
        },
        {
          type: "REMOVE_MAP_OBJECT",
          objectId: "object-rope",
        },
      ]),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: { reason: "MAP_OBJECT_NOT_FOUND", objectId: "object-rope" },
      },
    });

    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("recalculates container state inside the atomic pickup transaction", async () => {
    const { service, tx } = createService();
    tx.inventoryEntry.findFirst.mockResolvedValueOnce(null);
    tx.inventoryEntry.findMany
      .mockResolvedValueOnce([
        {
          id: "entry-rope",
          itemDefinitionId: "equipment.rope",
          quantity: 2,
          containerEntryId: "bag-entry",
          itemDefinition: {
            name: "Rope",
            itemType: "GEAR",
            description: "50 feet of hempen rope",
            weightLb: 10,
            volumeCuFt: 0.2,
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await service.applyInventoryMapRuntimeEffectsAtomically(params, [
      {
        type: "ADD_ITEM",
        itemDefinitionId: "equipment.rope",
        quantity: 2,
        containerEntryId: "bag-entry",
      },
      {
        type: "REMOVE_MAP_OBJECT",
        objectId: "object-rope",
      },
    ]);

    expect(tx.inventoryEntry.create).toHaveBeenCalledWith({
      data: {
        sessionCharacterId: "session-character-1",
        itemDefinitionId: "equipment.rope",
        quantity: 2,
        containerEntryId: "bag-entry",
      },
    });
    expect(tx.containerState.update).toHaveBeenCalledWith({
      where: { inventoryEntryId: "bag-entry" },
      data: {
        currentWeightLb: 20,
        currentVolumeCuFt: 0.4,
      },
    });
  });

  it("rejects over-capacity container pickup before the atomic transaction starts", async () => {
    const { service, tx, prisma, realtimeEvents } = createService();
    tx.inventoryEntry.findUnique.mockResolvedValueOnce({
      id: "bag-entry",
      sessionCharacterId: "session-character-1",
      containerState: {
        currentWeightLb: 495,
        currentVolumeCuFt: 0,
        integrity: "INTACT",
      },
    });

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "ADD_ITEM",
              itemDefinitionId: "equipment.rope",
              quantity: 1,
              containerEntryId: "bag-entry",
            },
            {
              type: "REMOVE_MAP_OBJECT",
              objectId: "object-rope",
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "INVENTORY_400",
        data: {
          reason: "bag_of_holding_capacity_exceeded",
          capacityViolation: "weight",
          containerDestroyed: true,
        },
      },
    });

    expect(tx.containerState.update).toHaveBeenCalledWith({
      where: { inventoryEntryId: "bag-entry" },
      data: { integrity: "OVERLOADED" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.update).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects creating a map object with an existing id before inventory changes", async () => {
    const { service, tx, realtimeEvents } = createService();

    await expect(
      service.applyInventoryMapRuntimeEffectsAtomically(params, [
        {
          type: "REMOVE_ITEM",
          itemId: "entry-rope",
          quantity: 1,
        },
        {
          type: "CREATE_MAP_OBJECT",
          objectId: "object-rope",
          itemDefinitionId: "equipment.rope",
          name: "Rope",
          quantity: 1,
          point: { x: 2, y: 0 },
        },
      ]),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: { reason: "MAP_OBJECT_ALREADY_EXISTS", objectId: "object-rope" },
      },
    });

    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.update).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects existing map object ids before early runtime effects run", async () => {
    const { service, tx, prisma, realtimeEvents } = createService();

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "SPEND_ACTION",
            },
            {
              type: "REMOVE_ITEM",
              itemId: "entry-rope",
              quantity: 1,
            },
            {
              type: "CREATE_MAP_OBJECT",
              objectId: "object-rope",
              itemDefinitionId: "equipment.rope",
              name: "Rope",
              quantity: 1,
              point: { x: 2, y: 0 },
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: { reason: "MAP_OBJECT_ALREADY_EXISTS", objectId: "object-rope" },
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.update).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects invalid map object quantities before inventory changes", async () => {
    const { service, tx, prisma, realtimeEvents } = createService();

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "SPEND_ACTION",
            },
            {
              type: "ADD_ITEM",
              itemDefinitionId: "equipment.rope",
              quantity: 1,
            },
            {
              type: "UPDATE_MAP_OBJECT_QUANTITY",
              objectId: "object-rope",
              itemDefinitionId: "equipment.rope",
              quantity: 0,
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_400",
        data: { reason: "INVALID_MAP_OBJECT_QUANTITY", quantity: 0 },
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects invalid created map object points before inventory changes", async () => {
    const { service, tx, prisma, realtimeEvents } = createService();

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "SPEND_ACTION",
            },
            {
              type: "REMOVE_ITEM",
              itemId: "entry-rope",
              quantity: 1,
            },
            {
              type: "CREATE_MAP_OBJECT",
              objectId: "object-rope-new",
              itemDefinitionId: "equipment.rope",
              name: "Rope",
              quantity: 1,
              point: { x: 1.5, y: 0 },
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_400",
        data: { reason: "INVALID_MAP_OBJECT_POINT", objectId: "object-rope-new" },
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.update).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects missing paired map objects before early runtime effects run", async () => {
    const emptyMap = {
      ...createBaseMap(),
      objectCells: [],
    };
    const { service, tx, prisma, realtimeEvents } = createService({ map: emptyMap });

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "SPEND_ACTION",
            },
            {
              type: "ADD_ITEM",
              itemDefinitionId: "equipment.rope",
              quantity: 2,
            },
            {
              type: "REMOVE_MAP_OBJECT",
              objectId: "object-rope",
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: { reason: "MAP_OBJECT_NOT_FOUND", objectId: "object-rope" },
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects missing inventory entries before early runtime effects run", async () => {
    const { service, tx, prisma, realtimeEvents } = createService({
      inventoryEntry: null,
    });

    await expect(
      service.assertRuntimeEffectPreconditions(
        {
          runtimeEffects: [
            {
              type: "SPEND_ACTION",
            },
            {
              type: "REMOVE_ITEM",
              itemId: "entry-rope",
              quantity: 1,
            },
            {
              type: "CREATE_MAP_OBJECT",
              objectId: "object:dropped:entry-rope:2:0",
              itemDefinitionId: "equipment.rope",
              name: "Rope",
              quantity: 1,
              point: { x: 2, y: 0 },
            },
          ],
        },
        params,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "INVENTORY_404",
        data: { reason: "INVENTORY_ENTRY_NOT_FOUND", itemId: "entry-rope" },
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.update).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });

  it("rejects a concurrent pickup when the VTT state version changed", async () => {
    const { service, tx, realtimeEvents, actionEconomy } = createService();
    tx.gameState.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.applyInventoryMapRuntimeEffectsAtomically(
        {
          ...params,
          turnStateKey: {
            combatId: "combat-1",
            combatParticipantId: "participant-1",
            roundNo: 1,
            turnNo: 2,
            sessionCharacterId: "session-character-1",
          },
        },
        [
          { type: "SPEND_ACTION" },
          {
            type: "ADD_ITEM",
            itemDefinitionId: "equipment.rope",
            quantity: 2,
          },
          {
            type: "REMOVE_MAP_OBJECT",
            objectId: "object-rope",
          },
        ],
      ),
    ).rejects.toMatchObject({
      response: {
        code: "VTT_409",
        data: {
          reason: "MAP_STATE_VERSION_CONFLICT",
          expectedVersion: 7,
        },
      },
    });

    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
    expect(tx.sessionCharacter.update).not.toHaveBeenCalled();
    expect(realtimeEvents.emitVttMapUpdated).not.toHaveBeenCalled();
  });
});

describe("ActionProcessorService rule targets", () => {
  it("projects combat participant token ids into rule targets", () => {
    const service = new ActionProcessorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      createRuleTargets: (sessionCharacters: unknown[], combatParticipants: unknown[]) => Array<{
        id: string;
        tokenId?: string | null;
        combatParticipantId?: string | null;
        isCombatParticipantOnly?: boolean;
        character: { name: string; spellsJson?: string | null };
      }>;
    };

    const targets = service.createRuleTargets(
      [
        {
          id: "session-character-1",
          userId: "user-1",
          characterId: "character-1",
          currentHp: 10,
          tempHp: 0,
          conditionsJson: "[]",
          character: {
            id: "character-1",
            name: "Hero",
            className: "fighter",
            level: 1,
            maxHp: 10,
            abilitiesJson: "{}",
            proficiencyBonus: 2,
            proficientSkillsJson: "[]",
            armorClass: 10,
            speed: 30,
            spellsJson: JSON.stringify({
              cantrips: ["spell.fire_bolt"],
              spells: ["spell.magic_missile"],
              preparedSpells: [],
            }),
          },
        },
      ],
      [
        {
          id: "participant-hero",
          sessionCharacterId: "session-character-1",
          tokenId: "token-hero",
          nameSnapshot: "Hero",
          currentHp: 10,
          maxHp: 10,
          armorClass: 10,
          speedFt: 30,
          conditionsJson: "[]",
          isHostile: false,
        },
        {
          id: "participant-goblin",
          sessionCharacterId: null,
          tokenId: "token_node_rule_smoke_condition_goblin",
          nameSnapshot: "Smoke Goblin",
          currentHp: 7,
          maxHp: 7,
          armorClass: 15,
          speedFt: 30,
          conditionsJson: "[]",
          isHostile: true,
        },
      ],
    );

    expect(targets).toEqual([
      expect.objectContaining({
        id: "session-character-1",
        tokenId: "token-hero",
        combatParticipantId: "participant-hero",
        character: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt"],
            spells: ["spell.magic_missile"],
            preparedSpells: [],
          }),
        }),
      }),
      expect.objectContaining({
        id: "combat-participant:participant-goblin",
        tokenId: "token_node_rule_smoke_condition_goblin",
        combatParticipantId: "participant-goblin",
        isCombatParticipantOnly: true,
        character: expect.objectContaining({ name: "Smoke Goblin" }),
      }),
    ]);
  });
});

describe("ActionProcessorService rest runtime effects", () => {
  const createService = (flagsJson: string | null) => {
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ flagsJson }),
        update: jest.fn(),
      },
      sessionCharacter: {
        findUnique: jest.fn().mockResolvedValue({
          character: { className: "wizard", level: 3 },
        }),
      },
    };
    const service = new ActionProcessorService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return {
      service: service as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
      runtimeService: service,
      prisma,
    };
  };

  it("projects current and maximum spell slots into the rule runtime", () => {
    const { runtimeService } = createService(
      JSON.stringify({
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "1": 1, "2": 0 },
        },
      }),
    );

    const result = (
      runtimeService as unknown as {
        resolveRuntimeSpellSlotState: (
          flagsJson: string,
          sessionCharacterId: string,
          character: { className: string; level: number },
        ) => {
          current: Record<string, number>;
          maximums: Record<string, number>;
        };
      }
    ).resolveRuntimeSpellSlotState(
      JSON.stringify({
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "1": 1, "2": 0 },
        },
      }),
      "session-character-1",
      { className: "wizard", level: 3 },
    );

    expect(result).toEqual({
      current: { "1": 1, "2": 0 },
      maximums: { "1": 4, "2": 2 },
    });
  });

  it("projects spent hit dice into the rule runtime resource state", () => {
    const { runtimeService } = createService(null);

    const result = (
      runtimeService as unknown as {
        toRuntimeResource: (resource: {
          secondWindAvailable: boolean;
          actionSurgeUses: number;
          rageUses: number;
          rageActive: boolean;
          frenzyActive: boolean;
          exhaustionLevel: number;
          hitDiceSpent: number;
        }) => Record<string, unknown>;
      }
    ).toRuntimeResource({
      secondWindAvailable: false,
      actionSurgeUses: 0,
      rageUses: 1,
      rageActive: false,
      frenzyActive: false,
      exhaustionLevel: 0,
      hitDiceSpent: 3,
    });

    expect(result).toMatchObject({ hitDiceSpent: 3 });
  });

  it("does not initialize Second Wind for non-fighter class resources", () => {
    const { runtimeService } = createService(null);

    const result = (
      runtimeService as unknown as {
        resolveInitialResourceDefaults: (actor: {
          character: {
            className: string;
            level: number;
            featuresJson: string;
          };
        }) => {
          secondWindAvailable: boolean;
          actionSurgeUses: number;
          rageUses: number;
        };
      }
    ).resolveInitialResourceDefaults({
      character: {
        className: "rogue",
        level: 3,
        featuresJson: JSON.stringify([
          "class.rogue.feature.expertise",
          "class.rogue.feature.sneak_attack",
        ]),
      },
    });

    expect(result).toEqual({
      secondWindAvailable: false,
      actionSurgeUses: 0,
      rageUses: 0,
    });
  });

  it("recovers long-rest spell slots by clearing the spent slot override", async () => {
    const { service, prisma } = createService(
      JSON.stringify({
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "1": 0 },
          "session-character-2": { "1": 1 },
        },
        unrelatedFlag: true,
      }),
    );

    await service.recoverLongRestSpellSlots("session-scenario-1", "session-character-1");

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-2": { "1": 1 },
          },
          unrelatedFlag: true,
        }),
      },
    });
  });

  it("restores one requested spell slot for class recovery features", async () => {
    const { service, prisma } = createService(
      JSON.stringify({
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "1": 1, "2": 0 },
        },
      }),
    );

    await service.recoverOneSpellSlot(
      "session-scenario-1",
      "session-character-1",
      2,
    );

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "1": 1, "2": 1 },
          },
        }),
      },
    });
  });

  it("clears rest-bound monster limited-use flags on long rest", async () => {
    const { service, prisma } = createService(
      JSON.stringify({
        monsterLimitedUseExpended: {
          "participant-dragon": {
            "monster.dragon.frightful_presence": {
              usage: "1/day",
              used: 1,
              limit: 1,
            },
            "monster.dragon.legendary_resistance": {
              usage: "3/rest",
              used: 2,
              limit: 3,
            },
            "monster.dragon.combat_surge": {
              usage: "1/combat",
              used: 1,
              limit: 1,
            },
          },
        },
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "1": 0 },
        },
        unrelatedFlag: true,
      }),
    );

    await service.recoverLongRestSpellSlots("session-scenario-1", "session-character-1");

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            "participant-dragon": {
              "monster.dragon.combat_surge": {
                usage: "1/combat",
                used: 1,
                limit: 1,
              },
            },
          },
          spellSlotsBySessionCharacterId: {},
          unrelatedFlag: true,
        }),
      },
    });
  });

  it("clears rest-only monster limited-use flags on short rest", async () => {
    const { service, prisma } = createService(
      JSON.stringify({
        monsterLimitedUseExpended: {
          "participant-dragon": {
            "monster.dragon.frightful_presence": {
              usage: "1/day",
              used: 1,
              limit: 1,
            },
            "monster.dragon.legendary_resistance": {
              usage: "3/rest",
              used: 2,
              limit: 3,
            },
            "monster.dragon.combat_surge": {
              usage: "1/combat",
              used: 1,
              limit: 1,
            },
          },
        },
        unrelatedFlag: true,
      }),
    );

    await service.recoverShortRestMonsterLimitedUses("session-scenario-1");

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            "participant-dragon": {
              "monster.dragon.frightful_presence": {
                usage: "1/day",
                used: 1,
                limit: 1,
              },
              "monster.dragon.combat_surge": {
                usage: "1/combat",
                used: 1,
                limit: 1,
              },
            },
          },
          unrelatedFlag: true,
        }),
      },
    });
  });

  it("spends spell slots in game state flags", async () => {
    const { service, prisma } = createService(
      JSON.stringify({
        spellSlotsBySessionCharacterId: {
          "session-character-1": { "3": 2 },
        },
        unrelatedFlag: true,
      }),
    );

    await service.spendSpellSlot("session-scenario-1", "session-character-1", 3);

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "3": 1 },
          },
          unrelatedFlag: true,
        }),
      },
    });
  });

  it("uses class and level spell slot maximums when no spent override exists yet", async () => {
    const { service, prisma } = createService(JSON.stringify({ unrelatedFlag: true }));

    await service.spendSpellSlot("session-scenario-1", "session-character-1", 2);

    const updateArg = prisma.gameState.update.mock.calls[0]?.[0] as {
      where: { sessionScenarioId: string };
      data: { flagsJson: string };
    };
    expect(updateArg.where).toEqual({ sessionScenarioId: "session-scenario-1" });
    expect(JSON.parse(updateArg.data.flagsJson)).toEqual({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "2": 1 },
          },
          unrelatedFlag: true,
    });
  });
});
