import { SessionLeaveResolutionService } from "./session-leave-resolution.service";

describe("SessionLeaveResolutionService", () => {
  const service = new SessionLeaveResolutionService();

  it("disbands without emitting a snapshot when the last participant leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        remainingParticipants: [],
      }),
    ).toEqual({
      shouldDisband: true,
      canEmitSnapshot: false,
    });
  });

  it("keeps the session when a regular participant leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "player-user",
        sessionHostUserId: "host-user",
        remainingParticipants: [
          { userId: "host-user" },
        ],
      }),
    ).toMatchObject({
      shouldDisband: false,
      canEmitSnapshot: true,
    });
  });

  it("disbands the session when the host leaves even if participants remain", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        remainingParticipants: [
          { userId: "player-1" },
          { userId: "player-2" },
        ],
      }),
    ).toEqual({
      shouldDisband: true,
      canEmitSnapshot: false,
    });
  });

  it("does not transfer host ownership when the host leaves", () => {
    expect(
      service.resolve({
        leavingUserId: "host-user",
        sessionHostUserId: "host-user",
        remainingParticipants: [
          { userId: "player-user" },
        ],
      }),
    ).toEqual({
      shouldDisband: true,
      canEmitSnapshot: false,
    });
  });
});
