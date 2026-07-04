import { Injectable } from "@nestjs/common";

@Injectable()
export class CombatAutoMonsterTurnSchedulerService {
  private readonly runningSessionIds = new Set<string>();
  private readonly scheduledSessionIds = new Set<string>();

  isRunning(sessionId: string): boolean {
    return this.runningSessionIds.has(sessionId);
  }

  isScheduled(sessionId: string): boolean {
    return this.scheduledSessionIds.has(sessionId);
  }

  shouldSkipSchedule(sessionId: string): boolean {
    return this.isRunning(sessionId) || this.isScheduled(sessionId);
  }

  shouldResumeAfterReaction(params: {
    isHumanGmSession: boolean;
    hasPendingTriggeredReadyAction: boolean;
    hasPendingCombatReaction: boolean;
    isCurrentTurnAutoMonster: boolean;
  }): boolean {
    return (
      !params.isHumanGmSession &&
      !params.hasPendingTriggeredReadyAction &&
      !params.hasPendingCombatReaction &&
      params.isCurrentTurnAutoMonster
    );
  }

  markScheduled(sessionId: string): void {
    this.scheduledSessionIds.add(sessionId);
  }

  clearScheduled(sessionId: string): void {
    this.scheduledSessionIds.delete(sessionId);
  }

  markRunning(sessionId: string): void {
    this.runningSessionIds.add(sessionId);
  }

  clearRunning(sessionId: string): void {
    this.runningSessionIds.delete(sessionId);
  }
}
