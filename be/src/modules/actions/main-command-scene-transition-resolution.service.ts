import { Injectable } from "@nestjs/common";
import { MainCommandResponseDto } from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandSceneTransitionResponseService } from "./main-command-scene-transition-response.service";
import { MainCommandSceneTransitionStateService } from "./main-command-scene-transition-state.service";
import type { TransitionCandidate, TransitionConditionEvaluation } from "./main-command-transition-evaluator.service";

@Injectable()
export class MainCommandSceneTransitionResolutionService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mainCommandSceneTransitionState: MainCommandSceneTransitionStateService,
    private readonly mainCommandSceneTransitionResponse: MainCommandSceneTransitionResponseService,
  ) {}

  async resolveSceneTransition(
    requestId: string,
    context: LoadedContext,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): Promise<MainCommandResponseDto> {
    if (!conditionResult.satisfied) {
      return this.buildBlockedSceneTransitionResponse(requestId, target, conditionResult);
    }

    await this.mainCommandSceneTransitionState.applySceneTransition(context, target.nodeId);

    const snapshot = await this.sessionsService.buildSnapshot(context.sessionId);
    this.realtimeEvents.emitSessionSnapshot(context.sessionId, snapshot);

    return this.mainCommandSceneTransitionResponse.buildResolvedResponse(requestId, target, conditionResult);
  }

  buildBlockedSceneTransitionResponse(
    requestId: string,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): MainCommandResponseDto {
    return this.mainCommandSceneTransitionResponse.buildBlockedResponse(requestId, target, conditionResult);
  }
}
