import { DiceAdvantageState } from "@trpg/shared-types";
import { DiceService } from "./dice.service";

describe("DiceService", () => {
  const createService = () => {
    const prisma = {
      diceRollLog: {
        create: jest.fn().mockResolvedValue({ id: "dice-roll-log-1" }),
      },
      turnLog: {
        findFirst: jest.fn(),
      },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({ id: "session-1" }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const realtimeEvents = {
      emitDiceRolled: jest.fn(),
    };

    return {
      service: new DiceService(prisma as never, sessionsService as never, realtimeEvents as never),
      prisma,
      sessionsService,
      realtimeEvents,
    };
  };

  it("rolls supported dice expressions", () => {
    const { service } = createService();
    const result = service.roll("1d20+3");

    expect(result.expression).toBe("1d20+3");
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0]).toBeLessThanOrEqual(20);
    expect(result.total).toBe(result.rolls[0] + 3);
  });

  it("uses two d20 rolls for advantage", () => {
    const { service } = createService();
    const result = service.roll("1d20", DiceAdvantageState.ADVANTAGE);

    expect(result.rolls).toHaveLength(2);
    expect(result.total).toBe(Math.max(...result.rolls));
    expect(result.advantageState).toBe(DiceAdvantageState.ADVANTAGE);
  });

  it("rolls compound damage expressions used by multi-type spells", () => {
    const { service } = createService();
    const result = service.roll("2d8+4d6");

    expect(result.expression).toBe("2d8+4d6");
    expect(result.rolls).toHaveLength(6);
    expect(result.total).toBe(
      result.rolls.reduce((sum, roll) => sum + roll, 0),
    );
  });

  it("rejects unsupported dice", () => {
    const { service } = createService();
    expect(() => service.roll("1d3")).toThrow("지원하지 않는 주사위입니다.");
  });

  it("persists direct dice rolls and emits dice.rolled", async () => {
    const { service, prisma, realtimeEvents } = createService();

    const result = await service.rollAndPersist("user-1", "session-1", {
      expression: "1d4",
      reason: "manual roll",
    });

    expect(prisma.turnLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.diceRollLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session-1",
        userId: "user-1",
        expression: "1d4",
        reason: "manual roll",
        turnLogId: null,
      }),
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        expression: "1d4",
        advantageState: DiceAdvantageState.NORMAL,
      }),
    );
    expect(result.expression).toBe("1d4");
  });

  it("rejects a turnLogId that does not belong to the session before writing a dice log", async () => {
    const { service, prisma } = createService();
    prisma.turnLog.findFirst.mockResolvedValue(null);

    await expect(
      service.rollAndPersist("user-1", "session-1", {
        expression: "1d20",
        turnLogId: "missing-turn-log",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "DICE_400",
        data: { reason: "INVALID_TURN_LOG_ID" },
      },
    });
    expect(prisma.diceRollLog.create).not.toHaveBeenCalled();
  });
});
