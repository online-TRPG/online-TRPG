import type { VttMapStateDto } from "@trpg/shared-types";
import { SessionNodeRuntimeMapService } from "./session-node-runtime-map.service";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";
import {
  markAuthoritativeVttMap,
  markPlayerRedactedVttMap,
} from "./vtt-map-authority";

describe("SessionNodeRuntimeMapService", () => {
  const map = {
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 640,
    height: 480,
    tokens: [],
    fogRects: [],
    updatedAt: "2026-07-31T00:00:00.000Z",
  };

  it("persists the node runtime and compatibility mirror under session locks", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: JSON.stringify({ existing: true }),
          version: 8,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sessionScenarioNodeRuntimeState: {
        upsert: jest.fn().mockResolvedValue({ version: 2 }),
      },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    const saved = await service.saveCurrentMap(tx as never, {
      sessionScenarioId: "session-scenario-1",
      map: markAuthoritativeVttMap(
        { ...map } as unknown as VttMapStateDto,
      ),
      expectedStateVersion: 7,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.sessionScenarioNodeRuntimeState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionScenarioId_nodeId: {
            sessionScenarioId: "session-scenario-1",
            nodeId: "node-1",
          },
        },
      }),
    );
    expect(tx.gameState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionScenarioId: "session-scenario-1",
          version: 7,
        },
      }),
    );
    expect(saved.runtimeVersion).toBe(2);
    expect(saved.stateVersion).toBe(8);
    expect(saved.map.updatedAt).not.toBe(map.updatedAt);
  });

  it("rejects a map from a different node before writing runtime state", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-2",
          flagsJson: "{}",
        }),
      },
      sessionScenarioNodeRuntimeState: {
        upsert: jest.fn(),
      },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    await expect(
      service.saveCurrentMap(tx as never, {
        sessionScenarioId: "session-scenario-1",
        map: markAuthoritativeVttMap(
          { ...map } as unknown as VttMapStateDto,
        ),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SESSION_NODE_RUNTIME_MAP_INVALID",
        reason: "NODE_ID_MISMATCH",
      }),
    });
    expect(tx.sessionScenarioNodeRuntimeState.upsert).not.toHaveBeenCalled();
  });

  it("rejects a player-redacted map before acquiring persistence locks", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn(),
      },
      gameState: {
        findUnique: jest.fn(),
      },
      sessionScenarioNodeRuntimeState: {
        upsert: jest.fn(),
      },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );
    const redactedMutation = {
      ...markPlayerRedactedVttMap(
        { ...map } as unknown as VttMapStateDto,
      ),
      updatedAt: "2026-07-31T00:01:00.000Z",
    };
    const invalidPersistenceParams: Parameters<
      SessionNodeRuntimeMapService["saveCurrentMap"]
    >[1] = {
      sessionScenarioId: "session-scenario-1",
      // @ts-expect-error PublicVttMap must not satisfy AuthoritativeVttMap.
      map: redactedMutation,
    };

    await expect(
      service.saveCurrentMap(tx as never, invalidPersistenceParams),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SESSION_NODE_RUNTIME_MAP_INVALID",
        reason: "PLAYER_REDACTED_MAP_PERSISTENCE_FORBIDDEN",
      }),
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.sessionScenario.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unbranded map before acquiring persistence locks", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: { findUnique: jest.fn() },
      gameState: { findUnique: jest.fn() },
      sessionScenarioNodeRuntimeState: { upsert: jest.fn() },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    await expect(
      service.saveCurrentMap(tx as never, {
        sessionScenarioId: "session-scenario-1",
        map: { ...map } as never,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        reason: "UNBRANDED_MAP_PERSISTENCE_FORBIDDEN",
      }),
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects serialized map metadata loss against the authoritative mirror", async () => {
    const authoritativeMap = {
      ...map,
      objectCells: [
        {
          id: "secret-path",
          x: 64,
          y: 64,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          events: [
            {
              id: "reveal-fog",
              name: "Reveal fog",
              type: "REVEAL_FOG_ON_PROXIMITY",
              trigger: { distanceFeet: 5, once: true },
              effect: { revealRadiusFeet: 500 },
            },
          ],
        },
      ],
    };
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: JSON.stringify({ vttMap: authoritativeMap }),
        }),
        updateMany: jest.fn(),
      },
      sessionScenarioNodeRuntimeState: {
        upsert: jest.fn(),
      },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    await expect(
      service.saveCurrentMap(tx as never, {
        sessionScenarioId: "session-scenario-1",
        map: markAuthoritativeVttMap({
          ...authoritativeMap,
          objectCells: authoritativeMap.objectCells.map(
            ({ events: _events, ...object }) => object,
          ),
        } as unknown as VttMapStateDto),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SESSION_NODE_RUNTIME_MAP_INVALID",
        reason: "AUTHORITATIVE_MAP_METADATA_LOSS",
      }),
    });
    expect(tx.sessionScenarioNodeRuntimeState.upsert).not.toHaveBeenCalled();
    expect(tx.gameState.updateMany).not.toHaveBeenCalled();
  });

  it("rejects serialized removal of an object with authoritative metadata", async () => {
    const authoritativeMap = {
      ...map,
      objectCells: [
        {
          id: "hidden-trigger",
          x: 64,
          y: 64,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          events: [
            {
              id: "hidden-reveal",
              type: "REVEAL_FOG_ON_PROXIMITY",
              trigger: { distanceFeet: 5, once: true },
              effect: { revealRadiusFeet: 500 },
            },
          ],
        },
      ],
    };
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: JSON.stringify({ vttMap: authoritativeMap }),
        }),
        updateMany: jest.fn(),
      },
      sessionScenarioNodeRuntimeState: { upsert: jest.fn() },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    await expect(
      service.saveCurrentMap(tx as never, {
        sessionScenarioId: "session-scenario-1",
        map: markAuthoritativeVttMap({
          ...authoritativeMap,
          objectCells: [],
        } as unknown as VttMapStateDto),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        reason: "AUTHORITATIVE_MAP_METADATA_LOSS",
      }),
    });
    expect(tx.sessionScenarioNodeRuntimeState.upsert).not.toHaveBeenCalled();
  });

  it("rejects a stale map write instead of overwriting a concurrent change", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      sessionScenario: {
        findUnique: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          currentNodeId: "node-1",
          flagsJson: "{}",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      sessionScenarioNodeRuntimeState: {
        upsert: jest.fn().mockResolvedValue({ version: 3 }),
      },
    };
    const service = new SessionNodeRuntimeMapService(
      new SessionVttMapNormalizationService(),
      new SessionVttMapBootstrapService({} as never),
    );

    await expect(
      service.saveCurrentMap(tx as never, {
        sessionScenarioId: "session-scenario-1",
        map: markAuthoritativeVttMap(
          { ...map } as unknown as VttMapStateDto,
        ),
        expectedStateVersion: 7,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "VTT_409",
        reason: "MAP_STATE_VERSION_CONFLICT",
        expectedVersion: 7,
      }),
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.gameState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionScenarioId: "session-scenario-1",
          version: 7,
        },
      }),
    );
  });
});
