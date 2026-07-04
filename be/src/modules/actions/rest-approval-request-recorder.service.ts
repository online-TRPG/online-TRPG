import { Injectable } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
} from "@prisma/client";
import { ActionOutcome, ActionQueueStatus } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import {
  buildRestApprovalResponseMetadata,
  buildRestRequestStructuredAction,
} from "./rest-approval-policy";

@Injectable()
export class RestApprovalRequestRecorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async recordHumanGmRequest(params: {
    sessionId: string;
    sessionScenarioId: string;
    stateVersion: number;
    sessionCharacterId: string;
    userId: string;
    restType: "short" | "long";
    hitDiceToSpend?: number;
    rawText: string;
  }) {
    const clientCreatedAt = new Date();
    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        sessionCharacterId: params.sessionCharacterId,
        rawText: params.rawText,
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.PARTY_SHARED,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
        baseStateVersion: params.stateVersion,
        clientCreatedAt,
      },
    });

    this.realtimeEvents.emitActionAccepted(params.sessionId, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      playerActionId: action.id,
      actorUserId: params.userId,
      sessionCharacterId: params.sessionCharacterId,
      rawInput: params.rawText,
      structuredAction: buildRestRequestStructuredAction({
        restType: params.restType,
        hitDiceToSpend: params.hitDiceToSpend,
        clientCreatedAt,
      }),
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "휴식 요청이 GM 승인 대기 상태로 기록되었습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);

    return {
      playerActionId: action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.REJECTED,
      baseStateVersion: params.stateVersion,
      restApproval: buildRestApprovalResponseMetadata({
        actionId: action.id,
        restType: params.restType,
        status: "gm_required",
        hitDiceToSpend: params.hitDiceToSpend,
        clientCreatedAt: action.clientCreatedAt,
      }),
    };
  }
}
