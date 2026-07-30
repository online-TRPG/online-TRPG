import { Injectable } from "@nestjs/common";
import {
  MainCommandIntent,
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandPersistenceService } from "./main-command-persistence.service";

type ImmediateObjectRevealResult = {
  objectRevealCount: number;
  handledObjectInvestigation: boolean;
};

@Injectable()
export class MainCommandPostActionRevealService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mainCommandPersistence: MainCommandPersistenceService,
  ) {}

  async revealAfterPersistedMainCommand(params: {
    context: LoadedContext;
    dto: SubmitMainCommandDto;
    response: MainCommandResponseDto;
    turnLogId: string;
    objectReveal: ImmediateObjectRevealResult;
  }): Promise<void> {
    const revealCount = await this.revealActionClues(params);

    if (revealCount + params.objectReveal.objectRevealCount > 0) {
      await this.sessionsService.publishCurrentVttMap(
        params.context.sessionId,
      );
      this.realtimeEvents.emitSessionSnapshot(
        params.context.sessionId,
        await this.sessionsService.buildSnapshot(params.context.sessionId),
      );
    }
  }

  private async revealActionClues(params: {
    context: LoadedContext;
    dto: SubmitMainCommandDto;
    response: MainCommandResponseDto;
    turnLogId: string;
    objectReveal: ImmediateObjectRevealResult;
  }): Promise<number> {
    if (!this.shouldRevealActionClues(params.dto, params.response, params.objectReveal)) {
      return 0;
    }

    return this.sessionsService.revealCurrentNodeCluesAfterAction({
      sessionScenarioId: params.context.sessionScenarioId,
      nodeId: params.context.currentNodeId,
      actionText: params.dto.playerText,
      outcome: this.mainCommandPersistence.toActionOutcome(params.response),
      policyModes: ["PLAYER_ACTION"],
      turnLogId: params.turnLogId,
      revealedBy: "system",
    });
  }

  private shouldRevealActionClues(
    dto: SubmitMainCommandDto,
    response: MainCommandResponseDto,
    objectReveal: ImmediateObjectRevealResult,
  ): boolean {
    return !(
      dto.intent === MainCommandIntent.DECLARE_RP_ACTION ||
      response.status === MainCommandStatus.IMPOSSIBLE ||
      response.status === MainCommandStatus.GM_APPROVAL_REQUIRED ||
      response.status === MainCommandStatus.CHECK_REQUIRED ||
      objectReveal.handledObjectInvestigation ||
      !response.actionCandidate
    );
  }
}
