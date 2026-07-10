import { Injectable } from "@nestjs/common";
import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import {
  ActionOutcome,
  HumanGmAiAssistSuggestionDto,
  StateDiffResponseDto,
  TurnLogResponseDto,
  decodeTurnLogStructuredAction,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

type HumanGmAiAssistFailureAuditResult = {
  turnLog: TurnLogResponseDto;
  stateDiff: StateDiffResponseDto | null;
};

@Injectable()
export class SessionHumanGmAiAssistFailureAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createFailureTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    gmUserId: string;
    suggestion: HumanGmAiAssistSuggestionDto;
    failureReason: string;
    failedOperation?: string | null;
  }): Promise<HumanGmAiAssistFailureAuditResult> {
    const latest = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const failureReason = params.failureReason.trim().slice(0, 500) || "Unknown AI assist application failure.";
    const failedOperation = params.failedOperation?.trim().slice(0, 100) || null;
    const structuredAction = {
      type: "gm_override",
      kind: "ai_assist_apply_failure",
      targetId: params.suggestion.targetId,
      public: true,
      hasPrivateNote: false,
      metadata: {
        assistType: params.suggestion.assistType,
        suggestionId: params.suggestion.id,
        suggestedActionId: params.suggestion.suggestedActionId,
        targetId: params.suggestion.targetId,
        failedOperation,
        failureReason,
      },
    };
    const structuredActionForLog = decodeTurnLogStructuredAction(structuredAction);
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.gmUserId,
        turnNumber: (latest?.turnNumber ?? 0) + 1,
        rawInput: "gm:ai_assist_apply_failure",
        structuredActionJson: JSON.stringify(structuredActionForLog),
        stateDiffJson: null,
        outcome: PrismaActionOutcome.FAILURE,
        narration: "GM AI assist 제안 승인 후 적용에 실패했습니다.",
      },
    });

    return {
      turnLog: {
        turnLogId: created.id,
        turnNumber: created.turnNumber,
        playerActionId: created.playerActionId,
        actorUserId: created.actorUserId,
        sessionCharacterId: created.sessionCharacterId,
        actionClientCreatedAt: null,
        actionCreatedAt: null,
        actionQueueStatus: null,
        rawInput: created.rawInput,
        structuredAction: structuredActionForLog,
        diceResult: null,
        stateDiff: null,
        outcome: this.toSharedOutcome(created.outcome),
        narration: created.narration,
        createdAt: created.createdAt.toISOString(),
      },
      stateDiff: null,
    };
  }

  private toSharedOutcome(value: PrismaActionOutcome): ActionOutcome {
    switch (value) {
      case PrismaActionOutcome.SUCCESS:
        return ActionOutcome.SUCCESS;
      case PrismaActionOutcome.FAILURE:
        return ActionOutcome.FAILURE;
      case PrismaActionOutcome.IMPOSSIBLE:
        return ActionOutcome.IMPOSSIBLE;
      case PrismaActionOutcome.NO_ROLL:
        return ActionOutcome.NO_ROLL;
    }
  }
}
