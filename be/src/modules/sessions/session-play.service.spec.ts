import { SessionPlayService, SESSION_START_PROXIMITY_WARNING_HOURS } from "./session-play.service";

describe("SessionPlayService schedule proximity", () => {
  const prisma = {
    sessionPlayAttendance: { findMany: jest.fn() },
    sessionApplication: { findMany: jest.fn() },
    sessionScheduleProximityAcknowledgement: { findMany: jest.fn() },
  };
  const realtimeEvents = {};
  const service = new SessionPlayService(prisma as never, realtimeEvents as never);
  const findWarnings = (
    userId: string,
    target: { id: string; scheduledStartAt: Date | null; scheduleVersion: number },
  ) => (service as unknown as {
    findProximityWarnings: (
      value: string,
      play: { id: string; scheduledStartAt: Date | null; scheduleVersion: number },
    ) => Promise<Array<{ comparedPlayId: string; differenceMinutes: number }>>;
  }).findProximityWarnings(userId, target);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sessionApplication.findMany.mockResolvedValue([]);
    prisma.sessionScheduleProximityAcknowledgement.findMany.mockResolvedValue([]);
  });

  it("keeps the confirmed product boundary at six hours", () => {
    expect(SESSION_START_PROXIMITY_WARNING_HOURS).toBe(6);
  });

  it("warns when starts are six hours apart, including across midnight", async () => {
    prisma.sessionPlayAttendance.findMany.mockResolvedValue([
      {
        play: {
          id: "compared-play",
          scheduledStartAt: new Date("2026-07-13T02:00:00.000Z"),
          scheduleVersion: 3,
          session: { title: "새벽 원정" },
        },
      },
    ]);

    await expect(findWarnings("user-1", {
      id: "target-play",
      scheduledStartAt: new Date("2026-07-12T20:00:00.000Z"),
      scheduleVersion: 2,
    })).resolves.toEqual([
      expect.objectContaining({ comparedPlayId: "compared-play", differenceMinutes: 360 }),
    ]);
  });

  it("does not warn when starts are more than six hours apart", async () => {
    prisma.sessionPlayAttendance.findMany.mockResolvedValue([
      {
        play: {
          id: "compared-play",
          scheduledStartAt: new Date("2026-07-13T02:01:00.000Z"),
          scheduleVersion: 1,
          session: { title: "다음 모임" },
        },
      },
    ]);

    await expect(findWarnings("user-1", {
      id: "target-play",
      scheduledStartAt: new Date("2026-07-12T20:00:00.000Z"),
      scheduleVersion: 1,
    })).resolves.toEqual([]);
  });

  it("hides only an acknowledgement that matches both schedule versions", async () => {
    prisma.sessionPlayAttendance.findMany.mockResolvedValue([
      {
        play: {
          id: "compared-play",
          scheduledStartAt: new Date("2026-07-12T23:00:00.000Z"),
          scheduleVersion: 4,
          session: { title: "저녁 모임" },
        },
      },
    ]);
    prisma.sessionScheduleProximityAcknowledgement.findMany.mockResolvedValue([
      {
        comparedPlayId: "compared-play",
        playScheduleVersion: 2,
        comparedScheduleVersion: 4,
      },
    ]);

    await expect(findWarnings("user-1", {
      id: "target-play",
      scheduledStartAt: new Date("2026-07-12T20:00:00.000Z"),
      scheduleVersion: 2,
    })).resolves.toEqual([]);

    await expect(findWarnings("user-1", {
      id: "target-play",
      scheduledStartAt: new Date("2026-07-12T20:00:00.000Z"),
      scheduleVersion: 3,
    })).resolves.toHaveLength(1);
  });
});
