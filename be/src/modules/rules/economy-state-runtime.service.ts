import { Injectable } from "@nestjs/common";
import { ActionOutcome, StateDiffResponseDto, TurnLogResponseDto } from "@trpg/shared-types";
import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { notFound } from "../../common/exceptions/domain-error";
import { EconomyResolution, EconomyState } from "./economy-runtime.service";

export const ECONOMY_FLAGS_KEY = "economy";

export type EconomyStateApplicationResult = {
  economy: EconomyState;
  turnLog: TurnLogResponseDto;
  stateDiff: StateDiffResponseDto;
};

@Injectable()
export class EconomyStateRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async applyResolution(params: {
    sessionId: string;
    sessionScenarioId: string;
    resolution: EconomyResolution;
    actorUserId?: string | null;
    sessionCharacterId?: string | null;
    rawInput?: string | null;
    reason?: string;
    narration?: string | null;
  }): Promise<EconomyStateApplicationResult> {
    return this.prisma.$transaction(async (tx) => {
      const gameState = await tx.gameState.findUnique({
        where: { sessionScenarioId: params.sessionScenarioId },
        select: { version: true, flagsJson: true },
      });

      if (!gameState) {
        throw notFound("GAME_STATE_404", "세션 상태를 찾을 수 없습니다.", {
          sessionScenarioId: params.sessionScenarioId,
        });
      }

      const latest = await tx.turnLog.findFirst({
        where: { sessionId: params.sessionId },
        orderBy: { turnNumber: "desc" },
        select: { turnNumber: true },
      });

      const baseVersion = gameState.version;
      const nextVersion = baseVersion + 1;
      const flags = this.parseFlags(gameState.flagsJson);
      const nextFlags = {
        ...flags,
        [ECONOMY_FLAGS_KEY]: params.resolution.state,
      };
      const stateDiff: StateDiffResponseDto = {
        baseVersion,
        nextVersion,
        reason: params.reason ?? `economy:${params.resolution.auditEvent.type}`,
        diff: {
          economy: {
            state: params.resolution.state,
            auditEvent: params.resolution.auditEvent,
          },
        },
      };

      const created = await tx.turnLog.create({
        data: {
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          actorUserId: params.actorUserId ?? null,
          sessionCharacterId: params.sessionCharacterId ?? params.resolution.auditEvent.sessionCharacterId ?? null,
          turnNumber: (latest?.turnNumber ?? 0) + 1,
          rawInput: params.rawInput ?? `/economy ${params.resolution.auditEvent.type}`,
          structuredActionJson: JSON.stringify({
            type: "economy",
            economyAction: params.resolution.auditEvent.type,
            auditEvent: params.resolution.auditEvent,
          }),
          stateDiffJson: JSON.stringify(stateDiff),
          outcome: PrismaActionOutcome.SUCCESS,
          narration: params.narration ?? this.createNarration(params.resolution),
        },
      });

      await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: nextVersion,
          flagsJson: JSON.stringify(nextFlags),
        },
      });

      await tx.stateDiff.create({
        data: {
          sessionScenarioId: params.sessionScenarioId,
          turnLogId: created.id,
          baseVersion,
          nextVersion,
          reason: stateDiff.reason,
          diffJson: JSON.stringify(stateDiff.diff),
        },
      });

      return {
        economy: params.resolution.state,
        turnLog: this.mapTurnLog(created),
        stateDiff,
      };
    });
  }

  readEconomyStateFromFlags(flagsJson: string | null | undefined): EconomyState | null {
    const flags = this.parseFlags(flagsJson);
    return this.isEconomyState(flags[ECONOMY_FLAGS_KEY]) ? flags[ECONOMY_FLAGS_KEY] : null;
  }

  private createNarration(resolution: EconomyResolution): string {
    const { auditEvent } = resolution;
    const item = auditEvent.itemDefinitionId ? ` ${auditEvent.itemDefinitionId}` : "";
    const quantity = auditEvent.quantity ? ` x${auditEvent.quantity}` : "";
    return `경제 처리 완료: ${auditEvent.type}${item}${quantity}`;
  }

  private mapTurnLog(row: {
    id: string;
    turnNumber: number;
    playerActionId: string | null;
    actorUserId: string | null;
    sessionCharacterId: string | null;
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
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      actionQueueStatus: null,
      rawInput: row.rawInput,
      structuredAction: this.parseJson<Record<string, unknown> | null>(row.structuredActionJson, null),
      diceResult: this.parseJson<Record<string, unknown> | null>(row.diceResultJson, null),
      stateDiff: this.parseJson<Record<string, unknown> | null>(row.stateDiffJson, null),
      outcome: row.outcome as ActionOutcome,
      narration: row.narration,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseFlags(flagsJson: string | null | undefined): Record<string, unknown> {
    return this.parseJson<Record<string, unknown>>(flagsJson, {});
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private isEconomyState(value: unknown): value is EconomyState {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<EconomyState>;
    return (
      Array.isArray(candidate.partyStash) &&
      typeof candidate.walletsBySessionCharacterId === "object" &&
      candidate.walletsBySessionCharacterId !== null &&
      typeof candidate.shopStatesById === "object" &&
      candidate.shopStatesById !== null &&
      typeof candidate.craftingProgressById === "object" &&
      candidate.craftingProgressById !== null
    );
  }
}
