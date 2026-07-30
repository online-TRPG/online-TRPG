import { Injectable } from "@nestjs/common";
import { ActionOutcome } from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import type { RevealCountSummary } from "./main-command-check-reveal.service";

@Injectable()
export class MainCommandCheckRevealSyncService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async syncSuccessfulCheckReveals(params: {
    outcome: ActionOutcome;
    sessionId: string;
    sessionScenarioId: string;
    revealCounts: RevealCountSummary;
  }): Promise<void> {
    if (params.outcome !== ActionOutcome.SUCCESS || !this.hasReveal(params.revealCounts)) {
      return;
    }

    await this.sessionsService.publishCurrentVttMap(params.sessionId);
    this.realtimeEvents.emitSessionSnapshot(params.sessionId, await this.sessionsService.buildSnapshot(params.sessionId));
  }

  private hasReveal(counts: RevealCountSummary): boolean {
    return counts.actionRevealCount + counts.objectRevealCount + counts.observedObjectCount > 0;
  }
}
