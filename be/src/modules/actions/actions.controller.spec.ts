import { ActionsController } from "./actions.controller";

describe("ActionsController rest endpoints", () => {
  const createController = () => {
    const actionsService = {
      approveRestAction: jest.fn().mockResolvedValue({
        playerActionId: "action-1",
        sessionId: "session-1",
        queueStatus: "PENDING",
        baseStateVersion: 3,
      }),
      rejectRestAction: jest.fn().mockResolvedValue({
        playerActionId: "action-1",
        sessionId: "session-1",
        queueStatus: "FAILED",
        baseStateVersion: 3,
      }),
      cancelRestAction: jest.fn().mockResolvedValue({
        playerActionId: "action-1",
        sessionId: "session-1",
        queueStatus: "FAILED",
        baseStateVersion: 3,
      }),
      submitRestAction: jest.fn().mockResolvedValue({
        playerActionId: "action-1",
        sessionId: "session-1",
        queueStatus: "PENDING",
        baseStateVersion: 3,
      }),
    };
    const mainCommandsService = {};

    return {
      controller: new ActionsController(actionsService as never, mainCommandsService as never),
      actionsService,
    };
  };

  it("binds the short rest endpoint to a short rest action", async () => {
    const { controller, actionsService } = createController();

    await (controller as unknown as {
      submitShortRestAction: (
        userId: string,
        sessionId: string,
        dto: { characterId: string },
      ) => Promise<unknown>;
    }).submitShortRestAction("user-1", "session-1", {
      characterId: "session-character-1",
    });

    expect(actionsService.submitRestAction).toHaveBeenCalledWith("user-1", "session-1", {
      characterId: "session-character-1",
      restType: "short",
    });
  });

  it("binds the long rest endpoint to a long rest action", async () => {
    const { controller, actionsService } = createController();

    await (controller as unknown as {
      submitLongRestAction: (
        userId: string,
        sessionId: string,
        dto: { characterId: string },
      ) => Promise<unknown>;
    }).submitLongRestAction("user-1", "session-1", {
      characterId: "session-character-1",
    });

    expect(actionsService.submitRestAction).toHaveBeenCalledWith("user-1", "session-1", {
      characterId: "session-character-1",
      restType: "long",
    });
  });

  it("binds the rest approval endpoint to a rest approval action", async () => {
    const { controller, actionsService } = createController();

    await (controller as unknown as {
      approveRestAction: (userId: string, sessionId: string, actionId: string) => Promise<unknown>;
    }).approveRestAction("gm-user-1", "session-1", "approval-action-1");

    expect(actionsService.approveRestAction).toHaveBeenCalledWith(
      "gm-user-1",
      "session-1",
      "approval-action-1",
    );
  });

  it("binds the rest rejection endpoint to a rest rejection action", async () => {
    const { controller, actionsService } = createController();

    await (controller as unknown as {
      rejectRestAction: (userId: string, sessionId: string, actionId: string) => Promise<unknown>;
    }).rejectRestAction("gm-user-1", "session-1", "approval-action-1");

    expect(actionsService.rejectRestAction).toHaveBeenCalledWith(
      "gm-user-1",
      "session-1",
      "approval-action-1",
    );
  });

  it("binds the rest cancellation endpoint to a rest cancellation action", async () => {
    const { controller, actionsService } = createController();

    await (controller as unknown as {
      cancelRestAction: (userId: string, sessionId: string, actionId: string) => Promise<unknown>;
    }).cancelRestAction("player-user-1", "session-1", "approval-action-1");

    expect(actionsService.cancelRestAction).toHaveBeenCalledWith(
      "player-user-1",
      "session-1",
      "approval-action-1",
    );
  });
});
