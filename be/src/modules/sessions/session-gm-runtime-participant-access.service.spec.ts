import { ForbiddenException } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
} from "@prisma/client";
import { SessionGmRuntimeParticipantAccessService } from "./session-gm-runtime-participant-access.service";

describe("SessionGmRuntimeParticipantAccessService", () => {
  const createService = (participant: { role: PrismaParticipantRole; status: PrismaParticipantStatus } | null) => {
    const prisma = {
      sessionParticipant: {
        findUnique: jest.fn().mockResolvedValue(participant),
      },
    };
    return {
      prisma,
      service: new SessionGmRuntimeParticipantAccessService(prisma as never),
    };
  };

  it.each([
    PrismaParticipantRole.GM,
    PrismaParticipantRole.HOST,
  ])("allows a joined %s participant", async (role) => {
    const { prisma, service } = createService({
      role,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(service.ensureJoinedGmRuntimeParticipant("gm-user", "session-1")).resolves.toBeUndefined();
    expect(prisma.sessionParticipant.findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_userId: {
          sessionId: "session-1",
          userId: "gm-user",
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
  });

  it("rejects a joined player participant", async () => {
    const { service } = createService({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(service.ensureJoinedGmRuntimeParticipant("player-user", "session-1")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a GM participant that is not joined", async () => {
    const { service } = createService({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.LEFT,
    });

    await expect(service.ensureJoinedGmRuntimeParticipant("gm-user", "session-1")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a missing participant", async () => {
    const { service } = createService(null);

    await expect(service.ensureJoinedGmRuntimeParticipant("gm-user", "session-1")).rejects.toThrow(ForbiddenException);
  });
});
