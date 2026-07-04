import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
} from "@prisma/client";
import { ActionQueueStatus } from "@trpg/shared-types";
import { ActionQueueSubmissionService } from "./action-queue-submission.service";

describe("ActionQueueSubmissionService", () => {
  const prisma = {
    playerAction: {
      create: jest.fn(),
    },
  };
  const actionProcessor = {
    processNext: jest.fn(),
  };
  const realtimeEvents = {
    emitActionAccepted: jest.fn(),
  };
  const service = new ActionQueueSubmissionService(
    prisma as never,
    actionProcessor as never,
    realtimeEvents as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a pending action, emits accepted event, and processes the queue", async () => {
    const clientCreatedAt = new Date("2026-05-14T01:00:00.000Z");
    prisma.playerAction.create.mockResolvedValue({
      id: "action-1",
      userId: "user-1",
      rawText: "/check perception",
      clientCreatedAt,
    });

    await expect(
      service.submitPendingAction({
        sessionId: "session-1",
        userId: "user-1",
        sessionCharacterId: "session-character-1",
        rawText: "/check perception",
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.INDIVIDUAL_TURN,
        baseStateVersion: 12,
        clientCreatedAt,
      }),
    ).resolves.toEqual({
      playerActionId: "action-1",
      sessionId: "session-1",
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: 12,
    });

    expect(prisma.playerAction.create).toHaveBeenCalledWith({
      data: {
        sessionId: "session-1",
        userId: "user-1",
        sessionCharacterId: "session-character-1",
        rawText: "/check perception",
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.INDIVIDUAL_TURN,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: 12,
        clientCreatedAt,
      },
    });
    expect(realtimeEvents.emitActionAccepted).toHaveBeenCalledWith("session-1", {
      playerActionId: "action-1",
      actorUserId: "user-1",
      rawText: "/check perception",
      clientCreatedAt: "2026-05-14T01:00:00.000Z",
    });
    expect(actionProcessor.processNext).toHaveBeenCalledWith("session-1");
  });
});
