import { Injectable } from "@nestjs/common";
import {
  ActionOutcome as PrismaActionOutcome,
  Prisma,
} from "@prisma/client";
import {
  ActionQueueStatus,
  ActionOutcome,
  TurnLogDiceResultDto,
  TurnLogListResponseDto,
  TurnLogResponseDto,
  TurnLogStateDiffDto,
  TurnLogStructuredActionDto,
  decodeTurnLogStateDiff,
  decodeTurnLogDiceResult,
  decodeTurnLogStructuredAction,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { parseJsonOrFallback } from "../../common/utils/json-runtime";
import { SessionsService } from "../sessions/sessions.service";

type TurnLogDbClient = Pick<Prisma.TransactionClient, "turnLog">;

@Injectable()
export class TurnLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async createTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    playerActionId?: string | null;
    actorUserId?: string | null;
    sessionCharacterId?: string | null;
    rawInput?: string | null;
    structuredAction?: unknown;
    diceResult?: unknown;
    stateDiff?: unknown;
    outcome: ActionOutcome;
    narration?: string | null;
  }, client: TurnLogDbClient = this.prisma): Promise<TurnLogResponseDto> {
    const turnNumber = await this.getNextTurnNumber(params.sessionId, client);
    const created = await client.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: params.playerActionId ?? null,
        actorUserId: params.actorUserId ?? null,
        sessionCharacterId: params.sessionCharacterId ?? null,
        turnNumber,
        rawInput: params.rawInput ?? null,
        structuredActionJson: this.stringifyStructuredAction(params.structuredAction),
        diceResultJson: this.stringifyTurnLogDiceResult(params.diceResult),
        stateDiffJson: this.stringifyTurnLogStateDiff(params.stateDiff),
        outcome: this.toPrismaOutcome(params.outcome),
        narration: params.narration ?? null,
      },
      include: {
        playerAction: {
          select: {
            queueStatus: true,
            clientCreatedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return this.mapTurnLog(created);
  }

  async listTurnLogs(
    userId: string,
    sessionId: string,
    params: {
      cursor?: string;
      size?: number;
      includeStateDiff?: boolean;
      includeDiceResult?: boolean;
    },
  ): Promise<TurnLogListResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    const size = Math.min(Math.max(params.size ?? 20, 1), 100);
    const rows = await this.prisma.turnLog.findMany({
      where: {
        sessionId: session.id,
        turnNumber: params.cursor ? { lt: Number(params.cursor) } : undefined,
      },
      orderBy: { turnNumber: "desc" },
      take: size + 1,
      include: {
        playerAction: {
          select: {
            queueStatus: true,
            clientCreatedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const hasNext = rows.length > size;
    const pageRows = hasNext ? rows.slice(0, size) : rows;
    const turnLogs = pageRows.map((row) => {
      const mapped = this.mapTurnLog(row);
      return {
        ...mapped,
        diceResult: params.includeDiceResult ? mapped.diceResult : null,
        stateDiff: params.includeStateDiff ? mapped.stateDiff : null,
      };
    });

    return {
      turnLogs,
      nextCursor: hasNext ? String(pageRows[pageRows.length - 1].turnNumber) : null,
    };
  }

  async attachStateDiff(
    turnLogId: string,
    stateDiff: TurnLogStateDiffDto,
    client: TurnLogDbClient = this.prisma,
  ): Promise<void> {
    await client.turnLog.update({
      where: { id: turnLogId },
      data: { stateDiffJson: this.stringifyTurnLogStateDiff(stateDiff) },
    });
  }

  async attachNarration(turnLogId: string, narration: string): Promise<TurnLogResponseDto | null> {
    try {
      const updated = await this.prisma.turnLog.update({
        where: { id: turnLogId },
        data: { narration },
        include: {
          playerAction: {
            select: {
              queueStatus: true,
              clientCreatedAt: true,
              createdAt: true,
            },
          },
        },
      });
      return this.mapTurnLog(updated);
    } catch {
      return null;
    }
  }

  async markLatestPlayerActionFailed(
    playerActionId: string,
    errorMessage: string,
  ): Promise<TurnLogResponseDto | null> {
    try {
      const existing = await this.prisma.turnLog.findFirst({
        where: { playerActionId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }

      const updated = await this.prisma.turnLog.update({
        where: { id: existing.id },
        data: {
          outcome: this.toPrismaOutcome(ActionOutcome.FAILURE),
          narration: `행동 처리 실패: ${errorMessage}`,
        },
        include: {
          playerAction: {
            select: {
              queueStatus: true,
              clientCreatedAt: true,
              createdAt: true,
            },
          },
        },
      });
      return this.mapTurnLog(updated);
    } catch {
      return null;
    }
  }

  private async getNextTurnNumber(
    sessionId: string,
    client: TurnLogDbClient = this.prisma,
  ): Promise<number> {
    const latest = await client.turnLog.findFirst({
      where: { sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    return (latest?.turnNumber ?? 0) + 1;
  }

  private mapTurnLog(row: {
    id: string;
    turnNumber: number;
    playerActionId: string | null;
    actorUserId: string | null;
    sessionCharacterId: string | null;
    playerAction?: {
      queueStatus?: string;
      clientCreatedAt: Date;
      createdAt: Date;
    } | null;
    rawInput: string | null;
    structuredActionJson: string | null;
    diceResultJson: string | null;
    stateDiffJson: string | null;
    outcome: PrismaActionOutcome;
    narration: string | null;
    createdAt: Date;
  }): TurnLogResponseDto {
    return {
      turnLogId: row.id,
      turnNumber: row.turnNumber,
      playerActionId: row.playerActionId,
      actorUserId: row.actorUserId,
      sessionCharacterId: row.sessionCharacterId,
      actionClientCreatedAt: row.playerAction?.clientCreatedAt.toISOString() ?? null,
      actionCreatedAt: row.playerAction?.createdAt.toISOString() ?? null,
      actionQueueStatus: this.toSharedActionQueueStatus(row.playerAction?.queueStatus),
      rawInput: row.rawInput,
      structuredAction: this.parseNullableStructuredAction(row.structuredActionJson),
      diceResult: this.parseNullableTurnLogDiceResult(row.diceResultJson),
      stateDiff: this.parseNullableStateDiff(row.stateDiffJson),
      outcome: this.toSharedOutcome(row.outcome),
      narration: row.narration,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toPrismaOutcome(value: ActionOutcome): PrismaActionOutcome {
    switch (value) {
      case ActionOutcome.SUCCESS:
        return PrismaActionOutcome.SUCCESS;
      case ActionOutcome.FAILURE:
        return PrismaActionOutcome.FAILURE;
      case ActionOutcome.IMPOSSIBLE:
        return PrismaActionOutcome.IMPOSSIBLE;
      case ActionOutcome.NO_ROLL:
        return PrismaActionOutcome.NO_ROLL;
    }
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

  private toSharedActionQueueStatus(value: string | null | undefined): ActionQueueStatus | null {
    switch (value) {
      case ActionQueueStatus.PENDING:
        return ActionQueueStatus.PENDING;
      case ActionQueueStatus.PROCESSING:
        return ActionQueueStatus.PROCESSING;
      case ActionQueueStatus.COMPLETED:
        return ActionQueueStatus.COMPLETED;
      case ActionQueueStatus.FAILED:
        return ActionQueueStatus.FAILED;
      case ActionQueueStatus.REJECTED:
        return ActionQueueStatus.REJECTED;
      default:
        return null;
    }
  }

  private stringifyStructuredAction(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return JSON.stringify(decodeTurnLogStructuredAction(value));
  }

  private stringifyTurnLogStateDiff(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return JSON.stringify(decodeTurnLogStateDiff(value));
  }

  private stringifyTurnLogDiceResult(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return JSON.stringify(decodeTurnLogDiceResult(value));
  }

  private parseNullableStructuredAction(value: string | null | undefined): TurnLogResponseDto["structuredAction"] {
    return parseJsonOrFallback(value, null, decodeTurnLogStructuredAction);
  }

  private parseNullableTurnLogDiceResult(value: string | null | undefined): TurnLogDiceResultDto | null {
    return parseJsonOrFallback(value, null, decodeTurnLogDiceResult);
  }

  private parseNullableStateDiff(value: string | null | undefined): TurnLogResponseDto["stateDiff"] {
    return parseJsonOrFallback(value, null, decodeTurnLogStateDiff);
  }
}
