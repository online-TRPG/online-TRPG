import { CombatAutoMonsterTurnSchedulerService } from "./combat-auto-monster-turn-scheduler.service";

describe("CombatAutoMonsterTurnSchedulerService", () => {
  it("tracks scheduled and running auto monster turn sessions separately", () => {
    const scheduler = new CombatAutoMonsterTurnSchedulerService();

    expect(scheduler.shouldSkipSchedule("session-1")).toBe(false);

    scheduler.markScheduled("session-1");

    expect(scheduler.isScheduled("session-1")).toBe(true);
    expect(scheduler.isRunning("session-1")).toBe(false);
    expect(scheduler.shouldSkipSchedule("session-1")).toBe(true);

    scheduler.clearScheduled("session-1");
    scheduler.markRunning("session-1");

    expect(scheduler.isScheduled("session-1")).toBe(false);
    expect(scheduler.isRunning("session-1")).toBe(true);
    expect(scheduler.shouldSkipSchedule("session-1")).toBe(true);

    scheduler.clearRunning("session-1");

    expect(scheduler.shouldSkipSchedule("session-1")).toBe(false);
  });

  it("resumes after a reaction only when no manual or pending reaction gate remains", () => {
    const scheduler = new CombatAutoMonsterTurnSchedulerService();

    expect(
      scheduler.shouldResumeAfterReaction({
        isHumanGmSession: false,
        hasPendingTriggeredReadyAction: false,
        hasPendingCombatReaction: false,
        isCurrentTurnAutoMonster: true,
      }),
    ).toBe(true);

    expect(
      scheduler.shouldResumeAfterReaction({
        isHumanGmSession: true,
        hasPendingTriggeredReadyAction: false,
        hasPendingCombatReaction: false,
        isCurrentTurnAutoMonster: true,
      }),
    ).toBe(false);

    expect(
      scheduler.shouldResumeAfterReaction({
        isHumanGmSession: false,
        hasPendingTriggeredReadyAction: true,
        hasPendingCombatReaction: false,
        isCurrentTurnAutoMonster: true,
      }),
    ).toBe(false);

    expect(
      scheduler.shouldResumeAfterReaction({
        isHumanGmSession: false,
        hasPendingTriggeredReadyAction: false,
        hasPendingCombatReaction: true,
        isCurrentTurnAutoMonster: true,
      }),
    ).toBe(false);

    expect(
      scheduler.shouldResumeAfterReaction({
        isHumanGmSession: false,
        hasPendingTriggeredReadyAction: false,
        hasPendingCombatReaction: false,
        isCurrentTurnAutoMonster: false,
      }),
    ).toBe(false);
  });
});
