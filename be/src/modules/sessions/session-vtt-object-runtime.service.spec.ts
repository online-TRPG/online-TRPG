import { CombatStatsService } from "../combat/combat-stats.service";
import { SessionRevealService } from "./session-reveal.service";
import { SessionVttObjectRuntimeService } from "./session-vtt-object-runtime.service";

describe("SessionVttObjectRuntimeService", () => {
  it("reproduces the anonymized N04 solo flow without losing or exposing GM metadata", async () => {
    const transaction = jest.fn();
    const recordSessionReveal = jest.fn();
    const findSessionReveals = jest.fn().mockResolvedValue([]);
    const runtime = {
      prisma: {
        sessionReveal: {
          findMany: findSessionReveals,
        },
        $transaction: transaction,
      },
      recordSessionReveal,
      logPerformanceMetric: jest.fn(),
      clampNumber: (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max),
    };
    const service = new SessionVttObjectRuntimeService().create(
      runtime as never,
    );
    const fogRects = Array.from({ length: 13 }, (_, index) => ({
      id: `fog-${index + 1}`,
      x: (index % 5) * 256,
      y: Math.floor(index / 5) * 256,
      width: 256,
      height: 256,
    }));
    const ratTokens = Array.from({ length: 5 }, (_, index) => ({
      id: `rat-${index + 1}`,
      sessionCharacterId: null,
      name: `Rat ${index + 1}`,
      imageUrl: null,
      x: 448 + index * 64,
      y: 256,
      size: 64,
      hidden: false,
      isHostile: true,
      encounterGroupId: "n04-rats",
      monster: { id: "monster.rat" },
    }));
    const authoritativeMap = {
      id: "map-n04-anonymized",
      scenarioNodeId: "N04",
      imageUrl: null,
      gridType: "square" as const,
      gridSize: 64,
      width: 1280,
      height: 832,
      encounterScaling: {
        enabled: true,
        mode: "by_party_ratio" as const,
        basePartySize: 4,
        minMonsterCount: 2,
      },
      tokens: [
        {
          id: "player-token",
          sessionCharacterId: "session-character-a",
          name: "Ranger A",
          imageUrl: null,
          x: 64,
          y: 64,
          size: 64,
          hidden: false,
          isHostile: false,
          monster: null,
        },
        ...ratTokens,
      ],
      fogRects,
      objectCells: [
        {
          id: "object-secret-path",
          name: "Secret path",
          x: 256,
          y: 320,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenEventIds: ["event-reveal-fog"],
          revealChecks: [
            {
              id: "check-secret-path",
              contentId: "event-reveal-fog",
              contentKind: "event" as const,
              ability: "wis",
              skill: "perception",
              dc: 12,
            },
          ],
          events: [
            {
              id: "event-reveal-fog",
              name: "Discover hidden space",
              type: "REVEAL_FOG_ON_PROXIMITY" as const,
              trigger: { distanceFeet: 5, once: true },
              effect: { revealRadiusFeet: 500 },
            },
          ],
        },
      ],
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const authoritativeMetadata = {
      events: authoritativeMap.objectCells[0].events,
      revealChecks: authoritativeMap.objectCells[0].revealChecks,
    };

    const combatStats = new CombatStatsService({
      getMonsterCombatStats: jest.fn(),
    } as never);
    const scaling = combatStats.scaleMonsterTokensForParty(
      ratTokens as never,
      1,
      authoritativeMap as never,
    );
    const scaledCombatMap = {
      ...authoritativeMap,
      tokens: authoritativeMap.tokens.map((token) =>
        scaling.excludedTokenIds.includes(token.id)
          ? { ...token, hidden: true }
          : token,
      ),
    };

    expect(scaling.monsterTokens).toHaveLength(2);
    expect(scaling.excludedTokenIds).toHaveLength(3);
    expect(
      scaledCombatMap.tokens.filter(
        (token) => token.isHostile === true && token.hidden !== true,
      ),
    ).toHaveLength(2);
    expect(scaledCombatMap.objectCells[0]).toEqual(
      expect.objectContaining(authoritativeMetadata),
    );

    // 두 활성 쥐가 처치되어 탐험으로 복귀한 뒤, 플레이어가 오브젝트에서
    // 32px(64px=5ft 격자의 2.5ft) 떨어진 위치로 이동한 상태다.
    const explorationMap = {
      ...scaledCombatMap,
      tokens: scaledCombatMap.tokens.map((token) =>
        token.isHostile === true
          ? { ...token, hidden: true }
          : { ...token, x: 256, y: 384 },
      ),
    };
    expect((32 / explorationMap.gridSize) * 5).toBe(2.5);
    expect(explorationMap.objectCells[0]).toEqual(
      expect.objectContaining(authoritativeMetadata),
    );

    const effect = await service.evaluateVttObjectProximityEvents({
      sessionScenarioId: "session-scenario-n04",
      currentNodeId: "N04",
      map: explorationMap as never,
    });

    expect(effect.map.fogRects).toHaveLength(0);
    expect(effect.map.objectCells?.[0]).toEqual(
      expect.objectContaining(authoritativeMetadata),
    );
    expect(effect.reveals).toEqual([
      expect.objectContaining({
        sessionScenarioId: "session-scenario-n04",
        contentId: "event-reveal-fog",
        contentKind: "event",
        reason: "vtt_object_proximity",
        snapshot: expect.objectContaining({
          sourceNodeId: "N04",
          sourceObjectId: "object-secret-path",
        }),
      }),
    ]);

    findSessionReveals.mockResolvedValueOnce([
      { contentId: "event-reveal-fog" },
    ]);
    const duplicateEffect = await service.evaluateVttObjectProximityEvents({
      sessionScenarioId: "session-scenario-n04",
      currentNodeId: "N04",
      map: explorationMap as never,
    });
    expect(duplicateEffect.reveals).toHaveLength(0);

    const playerMap = service.redactVttMapForPlayer(effect.map);
    expect(playerMap.objectCells).toEqual([
      expect.objectContaining({
        events: [],
        revealChecks: [],
        hiddenEventIds: [],
      }),
    ]);
    expect(JSON.stringify(playerMap)).not.toContain("event-reveal-fog");
    expect(JSON.stringify(playerMap)).not.toContain("check-secret-path");
    expect(transaction).not.toHaveBeenCalled();
    expect(recordSessionReveal).not.toHaveBeenCalled();
  });

  it("evaluates hidden trigger volumes without exposing them in the player map", async () => {
    const runtime = {
      prisma: {
        sessionReveal: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      logPerformanceMetric: jest.fn(),
      clampNumber: (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max),
    };
    const service = new SessionVttObjectRuntimeService().create(
      runtime as never,
    );
    const map = {
      id: "map-hidden-trigger",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square" as const,
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [
        {
          id: "player-token",
          sessionCharacterId: "session-character-1",
          name: "Scout",
          imageUrl: null,
          x: 64,
          y: 64,
          size: 64,
          hidden: false,
          isHostile: false,
          monster: null,
        },
      ],
      fogRects: [
        { id: "fog-1", x: 0, y: 0, width: 640, height: 480 },
      ],
      objectCells: [
        {
          id: "hidden-trigger",
          name: "숨겨진 트리거",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          events: [
            {
              id: "hidden-trigger-event",
              name: "비밀 통로",
              type: "REVEAL_FOG_ON_PROXIMITY" as const,
              trigger: { distanceFeet: 5, once: true },
              effect: { revealRadiusFeet: 500 },
            },
          ],
        },
      ],
      updatedAt: "2026-07-31T00:00:00.000Z",
    };

    const effect = await service.evaluateVttObjectProximityEvents({
      sessionScenarioId: "session-scenario-1",
      currentNodeId: "node-1",
      map,
    });
    const playerMap = service.redactVttMapForPlayer(map);

    expect(effect.map.fogRects).toHaveLength(0);
    expect(effect.reveals).toHaveLength(1);
    expect(playerMap.objectCells).toEqual([]);
  });

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
