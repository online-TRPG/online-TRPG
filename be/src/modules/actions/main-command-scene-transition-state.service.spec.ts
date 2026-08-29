import { MainCommandSceneTransitionStateService } from "./main-command-scene-transition-state.service";

describe("MainCommandSceneTransitionStateService", () => {
  it("delegates AI GM transitions to the shared session runtime", async () => {
    const transition = jest.fn().mockResolvedValue({});
    const service = new MainCommandSceneTransitionStateService({
      transition,
    } as never);

    await service.applySceneTransition(
      {
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
      } as never,
      "node-b",
    );

    expect(transition).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      targetNodeId: "node-b",
    });
  });
});
