import {
  ActionQueueStatus as PrismaActionQueueStatus,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
} from "@prisma/client";
import { RestApprovalGuardService } from "./rest-approval-guard.service";

describe("RestApprovalGuardService", () => {
  const prisma = {
    sessionParticipant: {
      findUnique: jest.fn(),
    },
    playerAction: {
      findUnique: jest.fn(),
    },
  };
  const restApprovalResolution = {
    expire: jest.fn(),
  };
  const service = new RestApprovalGuardService(
    prisma as never,
    restApprovalResolution as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires a HUMAN GM session", () => {
    try {
      service.ensureHumanGmSession(PrismaGmMode.AI, "승인");
      throw new Error("Expected ensureHumanGmSession to reject AI GM mode.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          data: expect.objectContaining({ reason: "HUMAN_GM_ONLY" }),
        }),
      });
    }
  });

  it("accepts joined hosts and GMs as operators", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(
      service.ensureGmOperator({
        sessionId: "session-1",
        userId: "gm-user-1",
        actionLabel: "승인",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects non-GM operators", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(
      service.ensureGmOperator({
        sessionId: "session-1",
        userId: "player-user-1",
        actionLabel: "승인",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({ reason: "GM_PERMISSION_REQUIRED" }),
      },
    });
  });

  it("loads only valid pending rest approval actions", async () => {
    const action = {
      id: "action-1",
      sessionId: "session-1",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      rawText: "/rest short 1",
    };
    prisma.playerAction.findUnique.mockResolvedValue(action);

    await expect(
      service.getApprovalAction({
        sessionId: "session-1",
        actionId: "action-1",
        actionLabel: "승인",
      }),
    ).resolves.toBe(action);
  });

  it("expires stale approval actions through resolution service", async () => {
    const action = {
      id: "action-1",
      sessionId: "session-1",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      rawText: "/rest short 1",
      clientCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };

    await expect(
      service.rejectIfExpired({
        sessionId: "session-1",
        action: action as never,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({ reason: "REST_APPROVAL_EXPIRED" }),
      },
    });
    expect(restApprovalResolution.expire).toHaveBeenCalledWith({
      sessionId: "session-1",
      action,
    });
  });
});
