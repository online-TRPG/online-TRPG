import { Injectable } from "@nestjs/common";
import {
  ActionOutcome as PrismaActionOutcome,
} from "@prisma/client";
import {
  ActionQueueStatus,
  ActionOutcome,
  TurnLogListResponseDto,
  TurnLogResponseDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionsService } from "../sessions/sessions.service";

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
    structuredAction?: Record<string, unknown> | null;
    diceResult?: Record<string, unknown> | null;
    stateDiff?: Record<string, unknown> | null;
    outcome: ActionOutcome;
    narration?: string | null;
  }): Promise<TurnLogResponseDto> {
    const turnNumber = await this.getNextTurnNumber(params.sessionId);
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: params.playerActionId ?? null,
        actorUserId: params.actorUserId ?? null,
        sessionCharacterId: params.sessionCharacterId ?? null,
        turnNumber,
        rawInput: params.rawInput ?? null,
        structuredActionJson: params.structuredAction
          ? JSON.stringify(params.structuredAction)
          : null,
        diceResultJson: params.diceResult ? JSON.stringify(params.diceResult) : null,
        stateDiffJson: params.stateDiff ? JSON.stringify(params.stateDiff) : null,
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

  async attachStateDiff(turnLogId: string, stateDiff: Record<string, unknown>): Promise<void> {
    await this.prisma.turnLog.update({
      where: { id: turnLogId },
      data: { stateDiffJson: JSON.stringify(stateDiff) },
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

  private async getNextTurnNumber(sessionId: string): Promise<number> {
    const latest = await this.prisma.turnLog.findFirst({
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
      structuredAction: this.parseNullableJson(row.structuredActionJson),
      diceResult: this.parseNullableJson(row.diceResultJson),
      stateDiff: this.parseNullableJson(row.stateDiffJson),
      outcome: row.outcome as ActionOutcome,
      narration: row.narration,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toPrismaOutcome(value: ActionOutcome): PrismaActionOutcome {
    return value as PrismaActionOutcome;
  }

  private toSharedActionQueueStatus(value: string | null | undefined): ActionQueueStatus | null {
    return Object.values(ActionQueueStatus).includes(value as ActionQueueStatus)
      ? (value as ActionQueueStatus)
      : null;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }

  private parseNullableJson(value: string | null | undefined): Record<string, unknown> | null {
    return this.parseJson<Record<string, unknown> | null>(value, null);
  }
}
