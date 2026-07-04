import { Injectable } from "@nestjs/common";
import { ActionOutcome, MainCommandIntent, MainCommandStatus } from "@trpg/shared-types";
import { SessionsService } from "../sessions/sessions.service";
import type { MainCommandCheckEffect } from "./main-command-check-effect-parser.service";

type CheckResultDraft = {
  status: MainCommandStatus;
  message: string;
};

@Injectable()
export class MainCommandCheckMovementService {
  constructor(private readonly sessionsService: SessionsService) {}

  async applySpecialMoveCheck(params: {
    sessionId: string;
    effect: MainCommandCheckEffect;
    outcome: ActionOutcome;
    result: CheckResultDraft;
  }): Promise<{ result: CheckResultDraft; turnLogOutcome: ActionOutcome }> {
    if (params.outcome !== ActionOutcome.SUCCESS || params.effect.intent !== MainCommandIntent.SPECIAL_MOVE || !params.effect.mapPoint) {
      return {
        result: params.result,
        turnLogOutcome: params.outcome,
      };
    }

    const moveResult = await this.sessionsService.moveSessionCharacterTokenToMapPoint({
      sessionId: params.sessionId,
      sessionCharacterId: params.effect.sessionCharacterId,
      mapPoint: params.effect.mapPoint,
    });

    return {
      result: {
        status: moveResult.status,
        message: moveResult.status === MainCommandStatus.RESOLVED ? `${params.result.message}\n\n${moveResult.message}` : moveResult.message,
      },
      turnLogOutcome: moveResult.status === MainCommandStatus.IMPOSSIBLE ? ActionOutcome.IMPOSSIBLE : params.outcome,
    };
  }
}
