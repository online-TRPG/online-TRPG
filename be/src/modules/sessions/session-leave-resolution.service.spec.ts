import { ParticipantRole as PrismaParticipantRole } from "@prisma/client";
import { SessionLeaveResolutionService } from "./session-leave-resolution.service";

describe("SessionLeaveResolutionService", () => {
  const service = new SessionLeaveResolutionService();

  it("disbands without emitting a snapshot when the last participant leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        sessionGmUserId: null,
        remainingParticipants: [],
      }),
    ).toEqual({
      shouldDisband: true,
      shouldClearGmUser: false,
      nextHostUserId: null,
      nextHostRole: null,
      canEmitSnapshot: false,
    });
  });

  it("clears assigned GM when that user leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "gm-user",
        sessionHostUserId: "host-user",
        sessionGmUserId: "gm-user",
        remainingParticipants: [
          { userId: "host-user", role: PrismaParticipantRole.HOST },
        ],
      }),
    ).toMatchObject({
      shouldDisband: false,
      shouldClearGmUser: true,
      nextHostUserId: null,
      nextHostRole: null,
      canEmitSnapshot: true,
    });
  });

  it("promotes the oldest remaining participant when the host leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        sessionGmUserId: null,
        remainingParticipants: [
          { userId: "player-1", role: PrismaParticipantRole.PLAYER },
          { userId: "player-2", role: PrismaParticipantRole.PLAYER },
        ],
      }),
    ).toMatchObject({
      nextHostUserId: "player-1",
      nextHostRole: PrismaParticipantRole.HOST,
      canEmitSnapshot: true,
    });
  });

  it("keeps GM role when the assigned GM becomes the next host", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        sessionGmUserId: "gm-user",
        remainingParticipants: [
          { userId: "gm-user", role: PrismaParticipantRole.GM },
        ],
      }),
    ).toMatchObject({
      nextHostUserId: "gm-user",
      nextHostRole: PrismaParticipantRole.GM,
    });
  });
});
