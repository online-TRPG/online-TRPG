import { Injectable } from "@nestjs/common";
import {
  ActionQueueStatus as PrismaActionQueueStatus,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
} from "@prisma/client";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { isRestApprovalExpired } from "./rest-approval-policy";
import { RestApprovalResolutionService } from "./rest-approval-resolution.service";

type RestApprovalGuardAction = NonNullable<
  Awaited<ReturnType<PrismaService["playerAction"]["findUnique"]>>
>;

@Injectable()
export class RestApprovalGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restApprovalResolution: RestApprovalResolutionService,
  ) {}

  ensureHumanGmSession(gmMode: PrismaGmMode, actionLabel: string): void {
    if (gmMode !== PrismaGmMode.HUMAN) {
      throw badRequest(
        "ACTION_400",
        `HUMAN GM 세션의 휴식 요청만 ${actionLabel}할 수 있습니다.`,
        { reason: "HUMAN_GM_ONLY" },
      );
    }
  }

  async ensureGmOperator(params: {
    sessionId: string;
    userId: string;
    actionLabel: string;
  }): Promise<void> {
    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
    });
    const isGmOperator =
      requester?.status === PrismaParticipantStatus.JOINED &&
      (requester.role === PrismaParticipantRole.HOST ||
        requester.role === PrismaParticipantRole.GM);
    if (!isGmOperator) {
      throw forbidden(
        "ACTION_403",
        `휴식 요청 ${params.actionLabel}에는 GM 권한이 필요합니다.`,
        { reason: "GM_PERMISSION_REQUIRED" },
      );
    }
  }

  async getApprovalAction(params: {
    sessionId: string;
    actionId: string;
    actionLabel: string;
  }) {
    const action = await this.prisma.playerAction.findUnique({
      where: { id: params.actionId },
    });
    if (!action || action.sessionId !== params.sessionId) {
      throw badRequest(
        "ACTION_400",
        `${params.actionLabel}할 휴식 요청을 찾을 수 없습니다.`,
        { reason: "REST_APPROVAL_REQUEST_NOT_FOUND" },
      );
    }
    if (
      action.queueStatus !== PrismaActionQueueStatus.REJECTED ||
      action.failureReason !== "REST_REQUIRES_GM_APPROVAL" ||
      !action.rawText.startsWith("/rest ")
    ) {
      throw badRequest(
        "ACTION_400",
        `${params.actionLabel} 가능한 휴식 요청이 아닙니다.`,
        { reason: "INVALID_REST_APPROVAL_REQUEST" },
      );
    }
    return action;
  }

  ensureRequester(params: {
    actionUserId: string;
    userId: string;
  }): void {
    if (params.actionUserId !== params.userId) {
      throw forbidden("ACTION_403", "휴식 요청을 만든 사용자만 취소할 수 있습니다.", {
        reason: "REST_REQUESTER_REQUIRED",
      });
    }
  }

  async rejectIfExpired(params: {
    sessionId: string;
    action: RestApprovalGuardAction;
  }): Promise<void> {
    if (!isRestApprovalExpired(params.action.clientCreatedAt)) {
      return;
    }
    await this.restApprovalResolution.expire({
      sessionId: params.sessionId,
      action: params.action,
    });
    throw badRequest("ACTION_400", "휴식 승인 요청이 만료되었습니다.", {
      reason: "REST_APPROVAL_EXPIRED",
    });
  }
}
