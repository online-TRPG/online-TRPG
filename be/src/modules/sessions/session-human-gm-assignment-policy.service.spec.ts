import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { SessionHumanGmAssignmentPolicyService } from "./session-human-gm-assignment-policy.service";

describe("SessionHumanGmAssignmentPolicyService", () => {
  const prisma = {
    sessionParticipant: {
      findUnique: jest.fn(),
    },
  };
  const service = new SessionHumanGmAssignmentPolicyService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a joined participant in a recruiting HUMAN GM session", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      id: "participant-1",
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(
      service.ensureCanAssign({
        sessionId: "session-1",
        sessionGmMode: PrismaGmMode.HUMAN,
        sessionStatus: PrismaSessionStatus.RECRUITING,
        gmUserId: "gm-user",
      }),
    ).resolves.toBeUndefined();

    expect(prisma.sessionParticipant.findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_userId: {
          sessionId: "session-1",
          userId: "gm-user",
        },
      },
      select: {
        id: true,
        status: true,
      },
    });
  });

  it("rejects assignment in AI GM sessions before participant lookup", async () => {
    await expect(
      service.ensureCanAssign({
        sessionId: "session-1",
        sessionGmMode: PrismaGmMode.AI,
        sessionStatus: PrismaSessionStatus.RECRUITING,
        gmUserId: "gm-user",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.sessionParticipant.findUnique).not.toHaveBeenCalled();
  });

  it("rejects assignment after recruitment", async () => {
    await expect(
      service.ensureCanAssign({
        sessionId: "session-1",
        sessionGmMode: PrismaGmMode.HUMAN,
        sessionStatus: PrismaSessionStatus.PLAYING,
        gmUserId: "gm-user",
      }),
    ).rejects.toThrow("GM can only be assigned while the session is recruiting.");

    expect(prisma.sessionParticipant.findUnique).not.toHaveBeenCalled();
  });

  it("rejects missing or non-joined target participants", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.ensureCanAssign({
        sessionId: "session-1",
        sessionGmMode: PrismaGmMode.HUMAN,
        sessionStatus: PrismaSessionStatus.RECRUITING,
        gmUserId: "missing-user",
      }),
    ).rejects.toThrow("gmUserId must be a JOINED participant of the session.");

    prisma.sessionParticipant.findUnique.mockResolvedValueOnce({
      id: "participant-1",
      status: PrismaParticipantStatus.LEFT,
    });

    await expect(
      service.ensureCanAssign({
        sessionId: "session-1",
        sessionGmMode: PrismaGmMode.HUMAN,
        sessionStatus: PrismaSessionStatus.RECRUITING,
        gmUserId: "left-user",
      }),
    ).rejects.toThrow("gmUserId must be a JOINED participant of the session.");
  });
});
