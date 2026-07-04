import { Injectable } from "@nestjs/common";
import { ActionOutcome, MainCommandResponseDto, MainCommandStatus, ResolveMainCommandCheckDto } from "@trpg/shared-types";
import { randomUUID } from "node:crypto";
import { MainCommandCheckEffectParserService } from "./main-command-check-effect-parser.service";
import type { MainCommandCheckEffect } from "./main-command-check-effect-parser.service";
import { MainCommandCheckResultNarrationService } from "./main-command-check-result-narration.service";

export type PreparedMainCommandCheckResult = {
  effect: MainCommandCheckEffect;
  checkDiceResult: Record<string, unknown> | null;
  checkRollSummary: string | null;
  result: {
    status: MainCommandStatus;
    message: string;
  };
};

@Injectable()
export class MainCommandCheckResolutionService {
  constructor(
    private readonly mainCommandCheckEffectParser: MainCommandCheckEffectParserService,
    private readonly mainCommandCheckResultNarration: MainCommandCheckResultNarrationService,
  ) {}

  async prepareMainCommandCheckResult(params: {
    userId: string;
    sessionId: string;
    currentNodeId: string | null;
    dto: ResolveMainCommandCheckDto;
  }): Promise<{ prepared: PreparedMainCommandCheckResult; response: null } | { prepared: null; response: MainCommandResponseDto }> {
    const checkDiceResult = this.mainCommandCheckResultNarration.sanitizeDiceResult(params.dto.diceResult);
    const checkRollSummary = this.mainCommandCheckResultNarration.formatRollSummary(checkDiceResult, params.dto.outcome);
    const effect = this.mainCommandCheckEffectParser.parseMainCommandCheckEffect(params.dto.effect);
    if (!effect) {
      return {
        prepared: null,
        response: {
          requestId: params.dto.requestId ?? randomUUID(),
          status: MainCommandStatus.IMPOSSIBLE,
          message: "처리할 수 없는 판정 후속 효과입니다.",
        },
      };
    }

    if (params.currentNodeId && effect.nodeId !== params.currentNodeId) {
      return {
        prepared: null,
        response: {
          requestId: params.dto.requestId ?? randomUUID(),
          status: MainCommandStatus.IMPOSSIBLE,
          message: "현재 노드와 다른 판정 결과는 반영할 수 없습니다.",
        },
      };
    }

    const resultMessage = await this.mainCommandCheckResultNarration.buildMessageForOutcome(params.userId, params.sessionId, effect, params.dto.outcome);
    return {
      prepared: {
        effect,
        checkDiceResult,
        checkRollSummary,
        result: {
          status: params.dto.outcome === ActionOutcome.SUCCESS ? MainCommandStatus.RESOLVED : MainCommandStatus.MESSAGE,
          message: resultMessage,
        },
      },
      response: null,
    };
  }
}
