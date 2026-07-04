import { Injectable } from "@nestjs/common";
import { ActionQueueStatus as PrismaActionQueueStatus } from "@prisma/client";
import { ActionOutcome, ActionQueueStatus } from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { ActionProcessorService } from "./action-processor.service";
import {
  buildRestApprovalResponseMetadata,
  buildRestApprovalStructuredAction,
  resolveRestHitDiceFromRawText,
  resolveRestTypeFromRawText,
} from "./rest-approval-policy";

type RestApprovalAction = {
  id: string;
  sessionCharacterId: string | null;
  rawText: string;
  baseStateVersion: number;
  clientCreatedAt: Date;
};

@Injectable()
export class RestApprovalResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly sessionsService: SessionsService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async approve(params: {
    sessionId: string;
    action: RestApprovalAction & { userId: string };
  }) {
    const claim = await this.prisma.playerAction.updateMany({
      where: {
        id: params.action.id,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.PENDING,
        failureReason: null,
        processedAt: null,
      },
    });
    if (claim.count !== 1) {
      throw badRequest("ACTION_400", "이미 처리 중이거나 처리된 휴식 요청입니다.", {
        reason: "REST_APPROVAL_ALREADY_CLAIMED",
      });
    }

    this.realtimeEvents.emitActionAccepted(params.sessionId, {
      playerActionId: params.action.id,
      actorUserId: params.action.userId,
      rawText: params.action.rawText,
      clientCreatedAt: params.action.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(params.sessionId);

    return {
      playerActionId: params.action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: params.action.baseStateVersion,
      restApproval: buildRestApprovalResponseMetadata({
        actionId: params.action.id,
        rawText: params.action.rawText,
        status: "approved",
        clientCreatedAt: params.action.clientCreatedAt,
      }),
    };
  }

  async rejectOrCancel(params: {
    sessionId: string;
    actorUserId: string;
    action: RestApprovalAction;
    status: "rejected" | "cancelled";
    failureReason: "REST_REJECTED_BY_GM" | "REST_CANCELLED_BY_REQUESTER";
    narration: string;
    requesterUserId?: string;
  }) {
    const claim = await this.prisma.playerAction.updateMany({
      where: {
        id: params.action.id,
        ...(params.requesterUserId ? { userId: params.requesterUserId } : {}),
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: params.failureReason,
        processedAt: new Date(),
      },
    });
    if (claim.count !== 1) {
      throw badRequest("ACTION_400", "이미 처리 중이거나 처리된 휴식 요청입니다.", {
        reason: "REST_APPROVAL_ALREADY_CLAIMED",
      });
    }

    const restType = resolveRestTypeFromRawText(params.action.rawText);
    const hitDiceToSpend = resolveRestHitDiceFromRawText(params.action.rawText);
    await this.createResolutionLog({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
      action: params.action,
      restType,
      hitDiceToSpend,
      status: params.status,
      narration: params.narration,
    });

    return {
      playerActionId: params.action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.FAILED,
      baseStateVersion: params.action.baseStateVersion,
      restApproval: buildRestApprovalResponseMetadata({
        actionId: params.action.id,
        restType,
        status: params.status,
        hitDiceToSpend,
        clientCreatedAt: params.action.clientCreatedAt,
      }),
    };
  }

  async expire(params: {
    sessionId: string;
    action: RestApprovalAction;
  }): Promise<boolean> {
    const claim = await this.prisma.playerAction.updateMany({
      where: {
        id: params.action.id,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_APPROVAL_EXPIRED",
        processedAt: new Date(),
      },
    });
    if (claim.count !== 1) {
      return false;
    }

    await this.createResolutionLog({
      sessionId: params.sessionId,
      actorUserId: null,
      action: params.action,
      restType: resolveRestTypeFromRawText(params.action.rawText),
      hitDiceToSpend: resolveRestHitDiceFromRawText(params.action.rawText),
      status: "expired",
      narration: "휴식 승인 요청이 만료되었습니다.",
    });
    return true;
  }

  private async createResolutionLog(params: {
    sessionId: string;
    actorUserId: string | null;
    action: RestApprovalAction;
    restType: "short" | "long" | null;
    hitDiceToSpend: number | null;
    status: "rejected" | "cancelled" | "expired";
    narration: string;
  }): Promise<void> {
    const { sessionScenario } =
      await this.sessionsService.getGameStateEntityOrThrow(params.sessionId);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: sessionScenario.id,
      playerActionId: params.action.id,
      actorUserId: params.actorUserId,
      sessionCharacterId: params.action.sessionCharacterId,
      rawInput: null,
      structuredAction: buildRestApprovalStructuredAction({
        requestActionId: params.action.id,
        restType: params.restType,
        status: params.status,
        hitDiceToSpend: params.hitDiceToSpend,
        clientCreatedAt:
          params.status === "expired" ? params.action.clientCreatedAt : undefined,
      }),
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: params.narration,
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);
  }
}
