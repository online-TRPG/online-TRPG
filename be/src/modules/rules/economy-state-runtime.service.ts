import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  StateDiffResponseDto,
  TurnLogResponseDto,
  decodeStateDiffResponse,
  decodeTurnLogDiceResult,
  decodeTurnLogStateDiff,
  decodeTurnLogStructuredAction,
  isRecord,
} from "@trpg/shared-types";
import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { notFound } from "../../common/exceptions/domain-error";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
  parseJsonRecordOrThrow,
} from "../../common/utils/json-runtime";
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
      const flags = this.parseFlagsForMutation(gameState.flagsJson);
      const nextFlags = {
        ...flags,
        [ECONOMY_FLAGS_KEY]: params.resolution.state,
      };
      const stateDiff: StateDiffResponseDto = decodeStateDiffResponse({
        baseVersion,
        nextVersion,
        reason: params.reason ?? `economy:${params.resolution.auditEvent.type}`,
        diff: {
          economy: {
            state: params.resolution.state,
            auditEvent: params.resolution.auditEvent,
          },
        },
      });

      const created = await tx.turnLog.create({
        data: {
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          actorUserId: params.actorUserId ?? null,
          sessionCharacterId: params.sessionCharacterId ?? params.resolution.auditEvent.sessionCharacterId ?? null,
          turnNumber: (latest?.turnNumber ?? 0) + 1,
          rawInput: params.rawInput ?? `/economy ${params.resolution.auditEvent.type}`,
          structuredActionJson: JSON.stringify(decodeTurnLogStructuredAction({
            type: "economy",
            economyAction: params.resolution.auditEvent.type,
            auditEvent: params.resolution.auditEvent,
          })),
          stateDiffJson: JSON.stringify(decodeTurnLogStateDiff(stateDiff)),
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
    const flags = this.parseFlagsForRead(flagsJson);
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
      structuredAction: parseJsonOrFallback(row.structuredActionJson, null, decodeTurnLogStructuredAction),
      diceResult: parseJsonOrFallback(row.diceResultJson, null, decodeTurnLogDiceResult),
      stateDiff: parseJsonOrFallback(row.stateDiffJson, null, decodeTurnLogStateDiff),
      outcome: this.toSharedOutcome(row.outcome),
      narration: row.narration,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseFlagsForRead(flagsJson: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrFallback(flagsJson);
  }

  private parseFlagsForMutation(flagsJson: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrThrow(flagsJson, {}, "gameState.flagsJson");
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

  private isEconomyState(value: unknown): value is EconomyState {
    if (!isRecord(value)) return false;
    const candidate = value;
    return (
      Array.isArray(candidate.partyStash) &&
      candidate.partyStash.every((item) => this.isEconomyInventoryItem(item)) &&
      this.isRecordOf(candidate.walletsBySessionCharacterId, (wallet) => this.isCurrencyWallet(wallet)) &&
      this.isRecordOf(candidate.shopStatesById, (shop) => this.isShopState(shop)) &&
      this.isRecordOf(candidate.craftingProgressById, (progress) => this.isCraftingProgress(progress)) &&
      (
        candidate.downtimeCompletionsById === undefined ||
        this.isRecordOf(candidate.downtimeCompletionsById, (completion) => isRecord(completion))
      )
    );
  }

  private isRecordOf(value: unknown, isValidValue: (entry: unknown) => boolean): value is Record<string, unknown> {
    return isRecord(value) && Object.values(value).every(isValidValue);
  }

  private isCurrencyWallet(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return ["cp", "sp", "ep", "gp", "pp"].every((key) => value[key] === undefined || this.isFiniteNumber(value[key]));
  }

  private isEconomyInventoryItem(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.itemDefinitionId === "string" &&
      this.isPositiveInteger(value.quantity) &&
      (value.identified === undefined || typeof value.identified === "boolean") &&
      (value.damaged === undefined || typeof value.damaged === "boolean") &&
      (value.attunedBySessionCharacterId === undefined ||
        value.attunedBySessionCharacterId === null ||
        typeof value.attunedBySessionCharacterId === "string") &&
      (value.chargesRemaining === undefined ||
        value.chargesRemaining === null ||
        this.isNonNegativeInteger(value.chargesRemaining))
    );
  }

  private isShopInventoryItem(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.itemDefinitionId === "string" &&
      this.isPositiveInteger(value.quantity) &&
      this.isNonNegativeNumber(value.priceGp) &&
      (value.buyLimit === undefined || value.buyLimit === null || this.isNonNegativeInteger(value.buyLimit)) &&
      (value.requiresApproval === undefined || typeof value.requiresApproval === "boolean")
    );
  }

  private isShopState(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.shopId === "string" &&
      Array.isArray(value.inventory) &&
      value.inventory.every((item) => this.isShopInventoryItem(item)) &&
      (value.sellPriceMultiplier === undefined || this.isPositiveNumber(value.sellPriceMultiplier))
    );
  }

  private isCraftingProgress(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.craftingId === "string" &&
      typeof value.recipeId === "string" &&
      typeof value.sessionCharacterId === "string" &&
      typeof value.outputItemDefinitionId === "string" &&
      this.isPositiveInteger(value.outputQuantity) &&
      this.isNonNegativeNumber(value.completedHours) &&
      this.isPositiveNumber(value.requiredHours) &&
      (value.status === "in_progress" || value.status === "completed")
    );
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private isNonNegativeNumber(value: unknown): value is number {
    return this.isFiniteNumber(value) && value >= 0;
  }

  private isPositiveNumber(value: unknown): value is number {
    return this.isFiniteNumber(value) && value > 0;
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 1;
  }
}
