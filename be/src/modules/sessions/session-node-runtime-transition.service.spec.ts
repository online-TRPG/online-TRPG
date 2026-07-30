import { SessionNodeRuntimeMapService } from "./session-node-runtime-map.service";
import { SessionNodeRuntimeTransitionService } from "./session-node-runtime-transition.service";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";

describe("SessionNodeRuntimeTransitionService", () => {
  const node = (nodeId: string) => ({
    id: `snapshot:${nodeId}`,
    nodeId,
    nodeType: "exploration",
    checkOptionsJson: JSON.stringify({
      checks: [],
      vttMap: {
        id: `map:${nodeId}`,
        scenarioNodeId: nodeId,
        imageUrl: null,
        gridType: "square",
        gridSize: 64,
        width: 640,
        height: 480,
        tokens: [],
        fogRects: [
          { id: "fog-1", x: 0, y: 0, width: 64, height: 64 },
        ],
        startingPositions: [
          { id: "start-1", label: "P1", x: 64, y: 64 },
          { id: "start-2", label: "P2", x: 128, y: 64 },
        ],
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    }),
  });

  it("restores the saved A map after A to B to A transitions", async () => {
    const nodes = new Map([
      ["node-a", node("node-a")],
      ["node-b", node("node-b")],
    ]);
    const runtimeRows = new Map<
      string,
      { version: number; vttMapJson: string }
    >();
    let state = {
      version: 1,
      currentNodeId: "node-a" as string | null,
      flagsJson: "{}",
    };
    const activeCharacters = [
      {
        id: "session-character-1",
        character: { name: "Ari", avatarUrl: null },
      },
    ];
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenarioNode: {
        findUnique: jest.fn(async ({ where }) =>
          nodes.get(where.sessionScenarioId_nodeId.nodeId) ?? null,
        ),
      },
      sessionScenarioNodeRuntimeState: {
        findUnique: jest.fn(async ({ where }) => {
          const row = runtimeRows.get(
            where.sessionScenarioId_nodeId.nodeId,
          );
          return row
            ? {
                sessionScenarioId: "session-scenario-1",
                nodeId: where.sessionScenarioId_nodeId.nodeId,
                ...row,
              }
            : null;
        }),
        create: jest.fn(async ({ data }) => {
          const row = { version: 1, vttMapJson: data.vttMapJson };
          runtimeRows.set(data.nodeId, row);
          return {
            sessionScenarioId: data.sessionScenarioId,
            nodeId: data.nodeId,
            ...row,
          };
        }),
        update: jest.fn(async ({ where, data }) => {
          const nodeId = where.sessionScenarioId_nodeId.nodeId;
          const previous = runtimeRows.get(nodeId)!;
          const row = {
            version: previous.version + 1,
            vttMapJson: data.vttMapJson,
          };
          runtimeRows.set(nodeId, row);
          return {
            sessionScenarioId: "session-scenario-1",
            nodeId,
            ...row,
          };
        }),
      },
      sessionCharacter: {
        findMany: jest.fn(async () => activeCharacters),
      },
      gameState: {
        findUnique: jest.fn(async () => ({ ...state })),
        update: jest.fn(async ({ data }) => {
          state = {
            version: state.version + 1,
            currentNodeId: data.currentNodeId,
            flagsJson: data.flagsJson,
          };
          return { version: state.version };
        }),
      },
      session: { updateMany: jest.fn() },
      sessionNodeVisit: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const normalization = new SessionVttMapNormalizationService();
    const bootstrap = new SessionVttMapBootstrapService(prisma as never);
    const maps = new SessionNodeRuntimeMapService(normalization, bootstrap);
    const service = new SessionNodeRuntimeTransitionService(
      prisma as never,
      maps,
    );

    await service.transition({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      targetNodeId: "node-a",
    });
    const savedA = runtimeRows.get("node-a");
    const parsedA = JSON.parse(savedA!.vttMapJson);
    parsedA.tokens[0].x = 333;
    parsedA.fogRects = [];
    parsedA.doorCells = [
      {
        id: "door-1",
        name: null,
        description: null,
        terrainEffectId: null,
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        state: "open",
        keyItemId: null,
      },
    ];
    parsedA.objectCells = [
      {
        id: "object-1",
        name: "Inscription",
        description: null,
        terrainEffectId: null,
        x: 64,
        y: 64,
        width: 64,
        height: 64,
        visibleToPlayers: true,
        hiddenClueIds: ["clue-1"],
        hazard: {
          kind: "TRAP",
          armed: false,
          triggerOnce: true,
          detectedBySessionCharacterIds: ["session-character-1"],
        },
      },
    ];
    savedA!.vttMapJson = JSON.stringify(parsedA);

    await service.transition({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      targetNodeId: "node-b",
    });
    activeCharacters.push({
      id: "session-character-2",
      character: { name: "Borin", avatarUrl: null },
    });
    const restored = await service.transition({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      targetNodeId: "node-a",
    });

    expect(restored.initialized).toBe(false);
    expect(restored.map.tokens[0]).toMatchObject({
      sessionCharacterId: "session-character-1",
      startingPositionId: "start-1",
      x: 333,
    });
    expect(restored.map.tokens[1]).toMatchObject({
      sessionCharacterId: "session-character-2",
      startingPositionId: "start-2",
      x: 128,
      y: 64,
    });
    expect(restored.map.doorCells?.[0]?.state).toBe("open");
    expect(restored.map.fogRects).toEqual([]);
    expect(restored.map.objectCells?.[0]).toMatchObject({
      id: "object-1",
      visibleToPlayers: true,
      hazard: {
        kind: "TRAP",
        armed: false,
        detectedBySessionCharacterIds: ["session-character-1"],
      },
    });
    expect(runtimeRows.size).toBe(2);
    expect(tx.sessionNodeVisit.upsert).toHaveBeenCalledTimes(3);
  });
});
