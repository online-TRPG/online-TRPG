import {
  ParticipantStatus as PrismaParticipantStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
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

  it("accepts dormant session updates with valid participant limits and captain", async () => {
    prisma.sessionParticipant.count.mockResolvedValue(2);
    prisma.sessionParticipant.findFirst.mockResolvedValue({ id: "participant-1" });

    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        activityStatus: PrismaSessionActivityStatus.DORMANT,
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

  it("rejects playing session updates before querying participants", async () => {
    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        activityStatus: PrismaSessionActivityStatus.PLAYING,
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
        activityStatus: PrismaSessionActivityStatus.LOBBY_OPEN,
        nextMaxParticipants: 3,
      }),
    ).rejects.toThrow("총 인원은 현재 참가 인원보다 작게 설정할 수 없습니다.");
  });

  it("rejects captainUserId that is not a joined participant", async () => {
    prisma.sessionParticipant.findFirst.mockResolvedValue(null);

    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        activityStatus: PrismaSessionActivityStatus.DORMANT,
        captainUserId: "user-1",
      }),
    ).rejects.toThrow("반장은 현재 세션 구성원 중에서 선택해주세요.");
  });

  it("allows clearing captain without captain membership lookup", async () => {
    await expect(
      service.ensureCanUpdate({
        sessionId: "session-1",
        activityStatus: PrismaSessionActivityStatus.LOBBY_OPEN,
        captainUserId: null,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.sessionParticipant.findFirst).not.toHaveBeenCalled();
  });
});
