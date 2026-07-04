import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { SessionJoinPolicyService } from "./session-join-policy.service";

describe("SessionJoinPolicyService", () => {
  const prisma = {
    sessionParticipant: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };
  const service = new SessionJoinPolicyService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a new participant when the recruiting session has capacity", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue(null);
    prisma.sessionParticipant.count.mockResolvedValue(1);

    await expect(
      service.ensureCanJoin({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        maxParticipants: 4,
      }),
    ).resolves.toBeNull();
  });

  it("returns a left participant so the caller can resume the row", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      id: "participant-1",
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.LEFT,
    });
    prisma.sessionParticipant.count.mockResolvedValue(1);

    await expect(
      service.ensureCanJoin({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        maxParticipants: 4,
      }),
    ).resolves.toMatchObject({
      id: "participant-1",
      role: PrismaParticipantRole.PLAYER,
    });
  });

  it("rejects non-recruiting sessions before participant lookup", async () => {
    await expect(
      service.ensureCanJoin({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.PLAYING,
        maxParticipants: 4,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.sessionParticipant.findUnique).not.toHaveBeenCalled();
    expect(prisma.sessionParticipant.count).not.toHaveBeenCalled();
  });

  it("rejects users that are already joined", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      id: "participant-1",
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(
      service.ensureCanJoin({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        maxParticipants: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.sessionParticipant.count).not.toHaveBeenCalled();
  });

  it("rejects full sessions", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue(null);
    prisma.sessionParticipant.count.mockResolvedValue(4);

    await expect(
      service.ensureCanJoin({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        maxParticipants: 4,
      }),
    ).rejects.toThrow("This session is already full.");
  });
});
