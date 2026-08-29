import { HumanGmRuntimeService } from "./human-gm-runtime.service";
import { SessionHumanGmMessageStoreService } from "./session-human-gm-message-store.service";

describe("HumanGmRuntimeService node transitions", () => {
  it("delegates Human GM transitions to the same session runtime contract", async () => {
    const transitionSessionNode = jest.fn().mockResolvedValue({
      phase: "EXPLORATION",
      map: { scenarioNodeId: "node-b" },
    });
    const snapshot = { state: { currentNodeId: "node-b" } };
    const runtime = {
      getHumanGmSessionForOperator: jest.fn().mockResolvedValue({
        id: "session-1",
        status: "PLAYING",
      }),
      getActiveSessionScenarioEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-scenario-1",
        scenarioId: "scenario-1",
      }),
      ensureSessionScenarioNodeSnapshotForScenario: jest.fn(),
      getSessionScenarioNodeEntityOrThrow: jest
        .fn()
        .mockResolvedValueOnce({
          id: "snapshot:node-b",
          nodeId: "node-b",
          nodeType: "exploration",
          title: "Next Room",
          transitionsJson: "[]",
          fallbackNodeId: null,
        })
        .mockResolvedValueOnce({
          id: "snapshot:node-a",
          nodeId: "node-a",
          nodeType: "exploration",
          title: "Current Room",
          transitionsJson: JSON.stringify([
            { condition: "default", nextNodeId: "node-b" },
          ]),
          fallbackNodeId: null,
        }),
      prisma: {
        gameState: {
          findUnique: jest.fn().mockResolvedValue({
            currentNodeId: "node-a",
          }),
        },
        $transaction: jest.fn(async (callback) => callback({})),
      },
      transitionSessionNode,
      publishCurrentVttMap: jest.fn().mockResolvedValue({}),
      createHumanGmOverrideTurnLog: jest.fn().mockResolvedValue(null),
      buildSnapshot: jest.fn().mockResolvedValue(snapshot),
      realtimeEvents: {
        emitSessionSnapshot: jest.fn(),
        emitTurnLogCreated: jest.fn(),
        emitStateDiffApplied: jest.fn(),
      },
    };
    const service = new HumanGmRuntimeService(
      new SessionHumanGmMessageStoreService(),
    );

    await expect(
      service.updateSessionNode(
        runtime as never,
        "gm-1",
        "session-1",
        { nodeId: "node-b" },
      ),
    ).resolves.toBe(snapshot);

    expect(transitionSessionNode).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      targetNodeId: "node-b",
    });
    expect(runtime.publishCurrentVttMap).toHaveBeenCalledWith("session-1");
    expect(runtime.createHumanGmOverrideTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        persistStateDiff: false,
        statePatch: expect.objectContaining({
          currentNodeId: "node-b",
          phase: "EXPLORATION",
          vttMapChanged: true,
        }),
        metadata: expect.objectContaining({
          nodeTitle: "Next Room",
        }),
      }),
    );
  });
});
