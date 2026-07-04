import {
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { SessionUpdatePolicyService } from "./session-update-policy.service";

describe("SessionUpdatePolicyService", () => {
  const prisma = {
    sessionParticipant: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const service = new SessionUpdatePolicyService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts recruiting session updates with valid participant limits and captain", async () => {
    prisma.sessionParticipant.count.mockResolvedValue(2);
    prisma.sessionParticipant.findFirst.mockResolvedValue({ id: "participant-1" });

    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        nextMaxParticipants: 3,
        captainUserId: "user-1",
      }),
    ).resolves.toBeUndefined();

    expect(prisma.sessionParticipant.count).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        status: PrismaParticipantStatus.JOINED,
      },
    });
    expect(prisma.sessionParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: "user-1",
        status: PrismaParticipantStatus.JOINED,
      },
      select: { id: true },
    });
  });

  it("rejects non-recruiting session updates before querying participants", async () => {
    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        sessionStatus: PrismaSessionStatus.PLAYING,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.sessionParticipant.count).not.toHaveBeenCalled();
    expect(prisma.sessionParticipant.findFirst).not.toHaveBeenCalled();
  });

  it("rejects maxParticipants smaller than joined participant count", async () => {
    prisma.sessionParticipant.count.mockResolvedValue(4);

    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        nextMaxParticipants: 3,
      }),
    ).rejects.toThrow("maxParticipants cannot be smaller than the participant count.");
  });

  it("rejects captainUserId that is not a joined participant", async () => {
    prisma.sessionParticipant.findFirst.mockResolvedValue(null);

    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        captainUserId: "user-1",
      }),
    ).rejects.toThrow("captainUserId must be a JOINED participant of the session.");
  });

  it("allows clearing captain without captain membership lookup", async () => {
    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        captainUserId: null,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.sessionParticipant.findFirst).not.toHaveBeenCalled();
  });
});
