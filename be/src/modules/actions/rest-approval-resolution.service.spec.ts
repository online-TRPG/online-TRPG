import { ActionQueueStatus as PrismaActionQueueStatus } from "@prisma/client";
import { RestApprovalResolutionService } from "./rest-approval-resolution.service";

describe("RestApprovalResolutionService", () => {
  const prisma = {
    playerAction: {
      updateMany: jest.fn(),
    },
  };
  const realtimeEvents = {
    emitActionAccepted: jest.fn(),
    emitTurnLogCreated: jest.fn(),
  };
  const actionProcessor = {
    processNext: jest.fn(),
  };
  const sessionsService = {
    getGameStateEntityOrThrow: jest.fn(),
  };
  const turnLogsService = {
    createTurnLog: jest.fn(),
  };
  const service = new RestApprovalResolutionService(
    prisma as never,
    actionProcessor as never,
    realtimeEvents as never,
    sessionsService as never,
    turnLogsService as never,
  );
  const action = {
    id: "approval-action-1",
    sessionCharacterId: "session-character-1",
    rawText: "/rest short 2",
    baseStateVersion: 11,
    clientCreatedAt: new Date("2026-06-22T00:00:00.000Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.playerAction.updateMany.mockResolvedValue({ count: 1 });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
    });
    turnLogsService.createTurnLog.mockResolvedValue({ id: "turn-log-1" });
  });

  it("approves a rest approval request by re-queueing and processing it", async () => {
    await expect(
      service.approve({
        sessionId: "session-1",
        action: {
          ...action,
          userId: "player-user-1",
        },
      }),
    ).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: "PENDING",
      baseStateVersion: 11,
      restApproval: {
        actionId: "approval-action-1",
        restType: "short",
        status: "approved",
        hitDiceToSpend: 2,
      },
    });
    expect(prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.PENDING,
        failureReason: null,
        processedAt: null,
      },
    });
    expect(realtimeEvents.emitActionAccepted).toHaveBeenCalledWith("session-1", {
      playerActionId: "approval-action-1",
      actorUserId: "player-user-1",
      rawText: "/rest short 2",
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });
    expect(actionProcessor.processNext).toHaveBeenCalledWith("session-1");
  });

  it("rejects a rest approval request and emits a resolution log", async () => {
    await expect(
      service.rejectOrCancel({
        sessionId: "session-1",
        actorUserId: "gm-user-1",
        action,
        status: "rejected",
        failureReason: "REST_REJECTED_BY_GM",
        narration: "GM이 휴식 요청을 거절했습니다.",
      }),
    ).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: "FAILED",
      baseStateVersion: 11,
      restApproval: {
        actionId: "approval-action-1",
        restType: "short",
        status: "rejected",
        hitDiceToSpend: 2,
      },
    });
    expect(prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_REJECTED_BY_GM",
        processedAt: expect.any(Date),
      },
    });
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { id: "turn-log-1" },
    );
  });

  it("claims cancellation with requester guard", async () => {
    await service.rejectOrCancel({
      sessionId: "session-1",
      actorUserId: "player-user-1",
      action,
      status: "cancelled",
      failureReason: "REST_CANCELLED_BY_REQUESTER",
      narration: "요청자가 휴식 요청을 취소했습니다.",
      requesterUserId: "player-user-1",
    });

    expect(prisma.playerAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "approval-action-1",
          userId: "player-user-1",
        }),
      }),
    );
  });

  it("returns false when an expired request was already claimed", async () => {
    prisma.playerAction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.expire({
        sessionId: "session-1",
        action,
      }),
    ).resolves.toBe(false);
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
  });

  it("expires a request and emits an expired log", async () => {
    await expect(
      service.expire({
        sessionId: "session-1",
        action,
      }),
    ).resolves.toBe(true);
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        structuredAction: expect.objectContaining({
          approvalStatus: "expired",
        }),
        narration: "휴식 승인 요청이 만료되었습니다.",
      }),
    );
  });
});
