import { Injectable } from "@nestjs/common";
import { ActionOutcome as PrismaActionOutcome, Prisma } from "@prisma/client";
import {
  decodeStateDiffResponse,
  decodeTurnLogStateDiff,
  decodeTurnLogStructuredAction,
  type CampaignArchiveResponseDto,
} from "@trpg/shared-types";

@Injectable()
export class SessionCampaignArchiveAuditService {
  async createCompletionAuditLog(
    tx: Prisma.TransactionClient,
    params: {
      sessionId: string;
      sessionScenarioId: string;
      actorUserId: string;
      archive: CampaignArchiveResponseDto;
      baseVersion: number;
      nextVersion: number;
    },
  ): Promise<void> {
    const latest = await tx.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const stateDiff = decodeStateDiffResponse({
      baseVersion: params.baseVersion,
      nextVersion: params.nextVersion,
      reason: "p6_campaign_archive",
      diff: {
        sessionCompletedAt: params.archive.completedAt,
        p6CampaignArchive: {
          archiveId: params.archive.archiveId,
          characterCount: params.archive.characters.length,
          analytics: params.archive.analytics,
        },
      },
    });
    const persistedDiff = decodeStateDiffResponse({
      baseVersion: params.baseVersion,
      nextVersion: params.nextVersion,
      reason: "p6_campaign_archive",
      diff: {
        p6CampaignArchive: {
          archiveId: params.archive.archiveId,
          completedAt: params.archive.completedAt,
          characterCount: params.archive.characters.length,
        },
      },
    });
    const created = await tx.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        turnNumber: (latest?.turnNumber ?? 0) + 1,
        rawInput: "/campaign complete",
        structuredActionJson: JSON.stringify(decodeTurnLogStructuredAction({
          type: "p6_campaign_archive",
          archiveId: params.archive.archiveId,
          shareScope: params.archive.shareScope,
          allowCharacterTransfer: params.archive.allowCharacterTransfer,
        })),
        stateDiffJson: JSON.stringify(decodeTurnLogStateDiff(stateDiff)),
        outcome: PrismaActionOutcome.SUCCESS,
        narration: params.archive.epilogue,
      },
    });
    await tx.stateDiff.create({
      data: {
        sessionScenarioId: params.sessionScenarioId,
        turnLogId: created.id,
        baseVersion: params.baseVersion,
        nextVersion: params.nextVersion,
        reason: "p6_campaign_archive",
        diffJson: JSON.stringify(persistedDiff.diff),
      },
    });
  }
}
