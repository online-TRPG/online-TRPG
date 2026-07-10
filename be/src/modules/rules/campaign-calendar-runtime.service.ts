import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  ApplyCampaignCalendarActionDto,
  StateDiffResponseDto,
  TurnLogResponseDto,
  decodeJsonObject,
  decodeStateDiffResponse,
  decodeTurnLogDiceResult,
  decodeTurnLogStateDiff,
  decodeTurnLogStructuredAction,
  type JsonObject,
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
import { ECONOMY_FLAGS_KEY } from "./economy-state-runtime.service";
import {
  type CraftingProgress,
  type CurrencyWallet,
  type EconomyInventoryItem,
  type EconomyState,
  type ShopInventoryItem,
  type ShopState,
} from "./economy-runtime.service";

export const CAMPAIGN_CALENDAR_FLAGS_KEY = "campaignCalendar";

export type CampaignScheduleStatus = "proposed" | "confirmed" | "cancelled";
export type CampaignScheduleAvailability = "available" | "unavailable" | "tentative";
export type CampaignDowntimeStatus = "active" | "paused" | "completed";
export type CampaignDowntimeType =
  | "crafting"
  | "training"
  | "research"
  | "recovery"
  | "identify"
  | "repair"
  | "shop_restock";

export type CampaignScheduleProposal = {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  proposedByUserId: string;
  status: CampaignScheduleStatus;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  responses: Array<{
    id: string;
    userId: string;
    availability: CampaignScheduleAvailability;
    note: string | null;
    respondedAt: string;
  }>;
};

export type CampaignTimelineEvent = {
  id: string;
  type: string;
  inGameDate: string | null;
  elapsedDays: number;
  createdByUserId: string;
  createdAt: string;
  note: string | null;
};

export type CampaignDowntimeTask = {
  id: string;
  type: CampaignDowntimeType;
  sessionCharacterId: string;
  title: string;
  status: CampaignDowntimeStatus;
  costGp: number;
  workDaysRequired: number;
  workDaysCompleted: number;
  requiredTools: string[];
  startedByUserId: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  note: string | null;
};

export type CampaignCalendarState = {
  inGameDate: string | null;
  elapsedDays: number;
  scheduleProposals: CampaignScheduleProposal[];
  timeline: CampaignTimelineEvent[];
  downtimeTasks: CampaignDowntimeTask[];
  processedIdempotencyKeys: string[];
};

export type CampaignCalendarResolution = {
  state: CampaignCalendarState;
  auditEvent: {
    type: ApplyCampaignCalendarActionDto["actionType"];
    actorUserId: string;
    scheduleId?: string | null;
    responseId?: string | null;
    downtimeTaskId?: string | null;
    sessionCharacterId?: string | null;
    idempotencyKey?: string | null;
  };
};

export type CampaignCalendarApplicationResult = {
  campaignCalendar: CampaignCalendarState;
  turnLog: TurnLogResponseDto;
  stateDiff: StateDiffResponseDto;
};

const DEFAULT_TIME_ZONE = "UTC";

@Injectable()
export class CampaignCalendarRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  createInitialState(): CampaignCalendarState {
    return {
      inGameDate: null,
      elapsedDays: 0,
      scheduleProposals: [],
      timeline: [],
      downtimeTasks: [],
      processedIdempotencyKeys: [],
    };
  }

  resolveAction(params: {
    state: CampaignCalendarState;
    dto: ApplyCampaignCalendarActionDto;
    actorUserId: string;
    now?: Date;
  }): CampaignCalendarResolution {
    const nowIso = (params.now ?? new Date()).toISOString();
    const state = this.cloneState(params.state);
    const idempotencyKey = params.dto.idempotencyKey?.trim() || null;
    if (idempotencyKey && state.processedIdempotencyKeys.includes(idempotencyKey)) {
      throw new BadRequestException("Duplicate campaign calendar action.");
    }

    switch (params.dto.actionType) {
      case "propose_schedule":
        this.proposeSchedule(state, params.dto, params.actorUserId, nowIso);
        break;
      case "respond_schedule":
        this.respondSchedule(state, params.dto, params.actorUserId, nowIso);
        break;
      case "confirm_schedule":
        this.confirmSchedule(state, params.dto, params.actorUserId, nowIso);
        break;
      case "advance_game_time":
        this.advanceGameTime(state, params.dto, params.actorUserId, nowIso);
        break;
      case "start_downtime":
        this.startDowntime(state, params.dto, params.actorUserId, nowIso);
        break;
      case "pause_downtime":
        this.updateDowntimeStatus(state, params.dto, "paused", nowIso);
        break;
      case "resume_downtime":
        this.updateDowntimeStatus(state, params.dto, "active", nowIso);
        break;
      case "complete_downtime":
        this.completeDowntime(state, params.dto, nowIso);
        break;
      default:
        throw new BadRequestException("Unsupported campaign calendar action.");
    }

    if (idempotencyKey) {
      state.processedIdempotencyKeys = [...state.processedIdempotencyKeys, idempotencyKey].slice(-200);
    }

    const resolvedSessionCharacterId =
      params.dto.sessionCharacterId ??
      (params.dto.actionType === "complete_downtime" && params.dto.downtimeTaskId
        ? state.downtimeTasks.find((task) => task.id === params.dto.downtimeTaskId)?.sessionCharacterId
        : null) ??
      null;

    return {
      state,
      auditEvent: {
        type: params.dto.actionType,
        actorUserId: params.actorUserId,
        scheduleId: params.dto.scheduleId ?? null,
        responseId: params.dto.responseId ?? null,
        downtimeTaskId: params.dto.downtimeTaskId ?? null,
        sessionCharacterId: resolvedSessionCharacterId,
        idempotencyKey,
      },
    };
  }

  async applyResolution(params: {
    sessionId: string;
    sessionScenarioId: string;
    resolution: CampaignCalendarResolution;
    rawInput?: string | null;
    reason?: string;
  }): Promise<CampaignCalendarApplicationResult> {
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
      const nextFlags: Record<string, unknown> = {
        ...flags,
        [CAMPAIGN_CALENDAR_FLAGS_KEY]: params.resolution.state,
      };
      const downtimeEconomyState = this.resolveDowntimeEconomyState(
        flags[ECONOMY_FLAGS_KEY],
        params.resolution,
      );
      if (downtimeEconomyState) {
        nextFlags[ECONOMY_FLAGS_KEY] = downtimeEconomyState;
      }
      const stateDiff: StateDiffResponseDto = decodeStateDiffResponse({
        baseVersion,
        nextVersion,
        reason: params.reason ?? `campaign_calendar:${params.resolution.auditEvent.type}`,
        diff: {
          campaignCalendar: {
            state: params.resolution.state,
            auditEvent: params.resolution.auditEvent,
          },
          ...(downtimeEconomyState
            ? {
                economy: {
                  state: downtimeEconomyState,
                  auditEvent: {
                    type: "downtime_completed",
                    downtimeTaskId: params.resolution.auditEvent.downtimeTaskId,
                    sessionCharacterId: params.resolution.auditEvent.sessionCharacterId,
                  },
                },
              }
            : {}),
        },
      });

      const created = await tx.turnLog.create({
        data: {
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          actorUserId: params.resolution.auditEvent.actorUserId,
          sessionCharacterId: params.resolution.auditEvent.sessionCharacterId ?? null,
          turnNumber: (latest?.turnNumber ?? 0) + 1,
          rawInput: params.rawInput ?? `/campaign ${params.resolution.auditEvent.type}`,
          structuredActionJson: JSON.stringify(decodeTurnLogStructuredAction({
            type: "campaign_calendar",
            campaignAction: params.resolution.auditEvent.type,
            auditEvent: params.resolution.auditEvent,
          })),
          stateDiffJson: JSON.stringify(decodeTurnLogStateDiff(stateDiff)),
          outcome: PrismaActionOutcome.SUCCESS,
          narration: this.createNarration(params.resolution),
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
        campaignCalendar: params.resolution.state,
        turnLog: this.mapTurnLog(created),
        stateDiff,
      };
    });
  }

  readCalendarStateFromFlags(flagsJson: string | null | undefined): CampaignCalendarState | null {
    const flags = this.parseFlagsForRead(flagsJson);
    return this.isCalendarState(flags[CAMPAIGN_CALENDAR_FLAGS_KEY])
      ? flags[CAMPAIGN_CALENDAR_FLAGS_KEY]
      : null;
  }

  private proposeSchedule(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    actorUserId: string,
    nowIso: string,
  ): void {
    const startsAt = this.requireIsoDate(dto.startsAt, "startsAt");
    const durationMinutes = this.requirePositiveInteger(dto.durationMinutes, "durationMinutes");
    const scheduleId = dto.scheduleId?.trim() || `schedule-${state.scheduleProposals.length + 1}`;
    if (state.scheduleProposals.some((schedule) => schedule.id === scheduleId)) {
      throw new BadRequestException("Duplicate schedule proposal.");
    }
    state.scheduleProposals.push({
      id: scheduleId,
      title: dto.title?.trim() || "다음 세션",
      startsAt,
      durationMinutes,
      timeZone: dto.timeZone?.trim() || DEFAULT_TIME_ZONE,
      proposedByUserId: actorUserId,
      status: "proposed",
      confirmedAt: null,
      confirmedByUserId: null,
      responses: [],
    });
    state.timeline.push(this.timelineEvent("schedule_proposed", dto.inGameDate ?? state.inGameDate, 0, actorUserId, nowIso, dto.note ?? null));
  }

  private respondSchedule(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    actorUserId: string,
    nowIso: string,
  ): void {
    const schedule = this.getSchedule(state, dto.scheduleId);
    const availability = dto.availability ?? "tentative";
    const responseId = dto.responseId?.trim() || `${schedule.id}:${actorUserId}`;
    if (schedule.responses.some((response) => response.id === responseId || response.userId === actorUserId)) {
      throw new BadRequestException("Duplicate schedule response.");
    }
    schedule.responses.push({
      id: responseId,
      userId: actorUserId,
      availability,
      note: dto.note ?? null,
      respondedAt: nowIso,
    });
  }

  private confirmSchedule(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    actorUserId: string,
    nowIso: string,
  ): void {
    const schedule = this.getSchedule(state, dto.scheduleId);
    if (schedule.status === "confirmed") {
      throw new BadRequestException("Schedule is already confirmed.");
    }
    schedule.status = "confirmed";
    schedule.confirmedAt = nowIso;
    schedule.confirmedByUserId = actorUserId;
    state.timeline.push(this.timelineEvent("schedule_confirmed", dto.inGameDate ?? state.inGameDate, 0, actorUserId, nowIso, dto.note ?? null));
  }

  private advanceGameTime(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    actorUserId: string,
    nowIso: string,
  ): void {
    const elapsedDays = this.requireNonNegativeInteger(dto.elapsedDays, "elapsedDays");
    state.elapsedDays += elapsedDays;
    state.inGameDate = dto.inGameDate?.trim() || state.inGameDate;
    state.timeline.push(this.timelineEvent("game_time_advanced", state.inGameDate, elapsedDays, actorUserId, nowIso, dto.note ?? null));
  }

  private startDowntime(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    actorUserId: string,
    nowIso: string,
  ): void {
    const downtimeTaskId = dto.downtimeTaskId?.trim() || `downtime-${state.downtimeTasks.length + 1}`;
    if (state.downtimeTasks.some((task) => task.id === downtimeTaskId)) {
      throw new BadRequestException("Duplicate downtime task.");
    }
    const sessionCharacterId = dto.sessionCharacterId?.trim();
    if (!sessionCharacterId) {
      throw new BadRequestException("sessionCharacterId is required for downtime.");
    }
    const requiredTools = dto.requiredTools ?? [];
    const availableTools = new Set(dto.availableTools ?? []);
    const missingTool = requiredTools.find((tool: string) => !availableTools.has(tool));
    if (missingTool) {
      throw new BadRequestException(`Required downtime tool missing: ${missingTool}.`);
    }
    state.downtimeTasks.push({
      id: downtimeTaskId,
      type: dto.downtimeType ?? "research",
      sessionCharacterId,
      title: dto.title?.trim() || (dto.downtimeType ?? "downtime"),
      status: "active",
      costGp: dto.costGp ?? 0,
      workDaysRequired: dto.workDaysRequired ?? 1,
      workDaysCompleted: 0,
      requiredTools,
      startedByUserId: actorUserId,
      startedAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      note: dto.note ?? null,
    });
  }

  private updateDowntimeStatus(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    status: "active" | "paused",
    nowIso: string,
  ): void {
    const task = this.getDowntimeTask(state, dto.downtimeTaskId);
    if (task.status === "completed") {
      throw new BadRequestException("Completed downtime cannot be changed.");
    }
    task.status = status;
    task.updatedAt = nowIso;
  }

  private completeDowntime(
    state: CampaignCalendarState,
    dto: ApplyCampaignCalendarActionDto,
    nowIso: string,
  ): void {
    const task = this.getDowntimeTask(state, dto.downtimeTaskId);
    if (task.status === "completed") {
      throw new BadRequestException("Downtime task is already completed.");
    }
    task.workDaysCompleted = Math.min(
      task.workDaysRequired,
      task.workDaysCompleted + (dto.workDaysDelta ?? task.workDaysRequired),
    );
    if (task.workDaysCompleted < task.workDaysRequired) {
      throw new BadRequestException("Downtime task has not reached the required work days.");
    }
    task.status = "completed";
    task.completedAt = nowIso;
    task.updatedAt = nowIso;
  }

  private getSchedule(state: CampaignCalendarState, scheduleId: string | null | undefined): CampaignScheduleProposal {
    const id = scheduleId?.trim();
    const schedule = id ? state.scheduleProposals.find((candidate) => candidate.id === id) : null;
    if (!schedule) {
      throw new BadRequestException("Schedule proposal not found.");
    }
    return schedule;
  }

  private getDowntimeTask(state: CampaignCalendarState, downtimeTaskId: string | null | undefined): CampaignDowntimeTask {
    const id = downtimeTaskId?.trim();
    const task = id ? state.downtimeTasks.find((candidate) => candidate.id === id) : null;
    if (!task) {
      throw new BadRequestException("Downtime task not found.");
    }
    return task;
  }

  private timelineEvent(
    type: string,
    inGameDate: string | null | undefined,
    elapsedDays: number,
    createdByUserId: string,
    createdAt: string,
    note: string | null,
  ): CampaignTimelineEvent {
    return {
      id: `timeline-${createdAt}-${type}`,
      type,
      inGameDate: inGameDate?.trim() || null,
      elapsedDays,
      createdByUserId,
      createdAt,
      note,
    };
  }

  private createNarration(resolution: CampaignCalendarResolution): string {
    return `캠페인 일정 처리 완료: ${resolution.auditEvent.type}`;
  }

  private resolveDowntimeEconomyState(
    currentEconomyState: unknown,
    resolution: CampaignCalendarResolution,
  ): EconomyState | null {
    if (resolution.auditEvent.type !== "complete_downtime") return null;
    const taskId = resolution.auditEvent.downtimeTaskId;
    if (!taskId) return null;
    const task = resolution.state.downtimeTasks.find((candidate) => candidate.id === taskId);
    if (!task || task.status !== "completed") return null;

    const economy = this.cloneEconomyState(currentEconomyState);
    const wallet = economy.walletsBySessionCharacterId[task.sessionCharacterId] ?? {};
    if (task.costGp > 0) {
      if ((wallet.gp ?? 0) < task.costGp) {
        throw new BadRequestException("Insufficient downtime funds.");
      }
      economy.walletsBySessionCharacterId[task.sessionCharacterId] = {
        ...wallet,
        gp: Math.trunc((wallet.gp ?? 0) - task.costGp),
      };
    } else if (!economy.walletsBySessionCharacterId[task.sessionCharacterId]) {
      economy.walletsBySessionCharacterId[task.sessionCharacterId] = wallet;
    }

    economy.downtimeCompletionsById = {
      ...(economy.downtimeCompletionsById ?? {}),
      [task.id]: {
        downtimeTaskId: task.id,
        downtimeType: task.type,
        sessionCharacterId: task.sessionCharacterId,
        title: task.title,
        costGp: task.costGp,
        completedAt: task.completedAt ?? new Date().toISOString(),
        economyEffects: this.cloneJsonObjectArray([
          ...(task.costGp > 0
            ? [{ type: "currency_spent", currency: "gp", amount: task.costGp }]
            : []),
          ...(task.type === "shop_restock" ? [{ type: "shop_restock_ready" }] : []),
        ]),
        inventoryEffects: this.getDowntimeInventoryEffects(task),
        characterResourceEffects: this.getDowntimeCharacterResourceEffects(task),
      },
    };
    return economy;
  }

  private cloneEconomyState(value: unknown): EconomyState {
    const candidate = isRecord(value) ? value : {};
    const downtimeCompletions =
      isRecord(candidate.downtimeCompletionsById)
        ? candidate.downtimeCompletionsById
        : {};
    return {
      partyStash: Array.isArray(candidate.partyStash)
        ? this.compactMap(candidate.partyStash, (item) => this.cloneEconomyInventoryItem(item))
        : [],
      walletsBySessionCharacterId:
        isRecord(candidate.walletsBySessionCharacterId)
          ? Object.fromEntries(
              Object.entries(candidate.walletsBySessionCharacterId).map(([key, wallet]) => [
                key,
                this.cloneCurrencyWallet(wallet),
              ]),
            )
          : {},
      shopStatesById:
        isRecord(candidate.shopStatesById)
          ? this.compactRecord(candidate.shopStatesById, (key, shop) => this.cloneShopState(key, shop))
          : {},
      craftingProgressById:
        isRecord(candidate.craftingProgressById)
          ? this.compactRecord(candidate.craftingProgressById, (_key, progress) => this.cloneCraftingProgress(progress))
          : {},
      downtimeCompletionsById: this.compactRecord(downtimeCompletions, (_key, completion) =>
        this.cloneDowntimeCompletion(completion),
      ),
    };
  }

  private cloneCurrencyWallet(value: unknown): CurrencyWallet {
    const record = isRecord(value) ? value : {};
    return {
      cp: this.optionalFiniteNumber(record.cp),
      sp: this.optionalFiniteNumber(record.sp),
      ep: this.optionalFiniteNumber(record.ep),
      gp: this.optionalFiniteNumber(record.gp),
      pp: this.optionalFiniteNumber(record.pp),
    };
  }

  private cloneEconomyInventoryItem(value: unknown): EconomyInventoryItem | null {
    if (!isRecord(value) || typeof value.itemDefinitionId !== "string") {
      return null;
    }
    const quantity = this.optionalPositiveInteger(value.quantity);
    if (quantity === undefined) {
      return null;
    }
    return {
      itemDefinitionId: value.itemDefinitionId,
      quantity,
      identified: typeof value.identified === "boolean" ? value.identified : undefined,
      damaged: typeof value.damaged === "boolean" ? value.damaged : undefined,
      attunedBySessionCharacterId:
        value.attunedBySessionCharacterId === null || typeof value.attunedBySessionCharacterId === "string"
          ? value.attunedBySessionCharacterId
          : undefined,
      chargesRemaining:
        value.chargesRemaining === null
          ? value.chargesRemaining
          : this.optionalNonNegativeInteger(value.chargesRemaining),
    };
  }

  private cloneShopInventoryItem(value: unknown): ShopInventoryItem | null {
    if (
      !isRecord(value) ||
      typeof value.itemDefinitionId !== "string"
    ) {
      return null;
    }
    const quantity = this.optionalPositiveInteger(value.quantity);
    const priceGp = this.optionalNonNegativeNumber(value.priceGp);
    if (quantity === undefined || priceGp === undefined) {
      return null;
    }
    return {
      itemDefinitionId: value.itemDefinitionId,
      quantity,
      priceGp,
      buyLimit:
        value.buyLimit === null
          ? value.buyLimit
          : this.optionalNonNegativeInteger(value.buyLimit),
      requiresApproval: typeof value.requiresApproval === "boolean" ? value.requiresApproval : undefined,
    };
  }

  private cloneShopState(key: string, value: unknown): ShopState | null {
    if (!isRecord(value)) {
      return null;
    }
    return {
      shopId: typeof value.shopId === "string" ? value.shopId : key,
      inventory: Array.isArray(value.inventory)
        ? this.compactMap(value.inventory, (item) => this.cloneShopInventoryItem(item))
        : [],
      sellPriceMultiplier: this.optionalPositiveNumber(value.sellPriceMultiplier),
    };
  }

  private cloneCraftingProgress(value: unknown): CraftingProgress | null {
    if (
      !isRecord(value) ||
      typeof value.craftingId !== "string" ||
      typeof value.recipeId !== "string" ||
      typeof value.sessionCharacterId !== "string" ||
      typeof value.outputItemDefinitionId !== "string" ||
      (value.status !== "in_progress" && value.status !== "completed")
    ) {
      return null;
    }
    const outputQuantity = this.optionalPositiveInteger(value.outputQuantity);
    const completedHours = this.optionalNonNegativeNumber(value.completedHours);
    const requiredHours = this.optionalPositiveNumber(value.requiredHours);
    if (outputQuantity === undefined || completedHours === undefined || requiredHours === undefined) {
      return null;
    }
    return {
      craftingId: value.craftingId,
      recipeId: value.recipeId,
      sessionCharacterId: value.sessionCharacterId,
      outputItemDefinitionId: value.outputItemDefinitionId,
      outputQuantity,
      completedHours,
      requiredHours,
      status: value.status,
    };
  }

  private cloneDowntimeCompletion(value: unknown): NonNullable<EconomyState["downtimeCompletionsById"]>[string] | null {
    if (
      !isRecord(value) ||
      typeof value.downtimeTaskId !== "string" ||
      typeof value.downtimeType !== "string" ||
      typeof value.sessionCharacterId !== "string" ||
      typeof value.title !== "string" ||
      typeof value.completedAt !== "string"
    ) {
      return null;
    }
    const costGp = this.optionalNonNegativeNumber(value.costGp);
    if (costGp === undefined) {
      return null;
    }
    return {
      downtimeTaskId: value.downtimeTaskId,
      downtimeType: value.downtimeType,
      sessionCharacterId: value.sessionCharacterId,
      title: value.title,
      costGp,
      completedAt: value.completedAt,
      economyEffects: this.cloneJsonObjectArray(value.economyEffects),
      inventoryEffects: this.cloneJsonObjectArray(value.inventoryEffects),
      characterResourceEffects: this.cloneJsonObjectArray(value.characterResourceEffects),
    };
  }

  private cloneJsonObjectArray(value: unknown): JsonObject[] {
    return Array.isArray(value)
      ? this.compactMap(value, (entry, index) => {
          try {
            return decodeJsonObject(entry, `economy.downtimeEffect[${index}]`);
          } catch {
            return null;
          }
        })
      : [];
  }

  private compactMap<TInput, TOutput>(
    values: TInput[],
    map: (value: TInput, index: number) => TOutput | null,
  ): TOutput[] {
    return values.flatMap((value, index) => {
      const mapped = map(value, index);
      return mapped === null ? [] : [mapped];
    });
  }

  private compactRecord<TOutput>(
    record: Record<string, unknown>,
    map: (key: string, value: unknown) => TOutput | null,
  ): Record<string, TOutput> {
    return Object.fromEntries(
      Object.entries(record).flatMap(([key, value]) => {
        const mapped = map(key, value);
        return mapped === null ? [] : [[key, mapped] as const];
      }),
    );
  }

  private optionalFiniteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private optionalNonNegativeNumber(value: unknown): number | undefined {
    const parsed = this.optionalFiniteNumber(value);
    return parsed !== undefined && parsed >= 0 ? parsed : undefined;
  }

  private optionalPositiveNumber(value: unknown): number | undefined {
    const parsed = this.optionalFiniteNumber(value);
    return parsed !== undefined && parsed > 0 ? parsed : undefined;
  }

  private optionalNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  private optionalPositiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
  }

  private getDowntimeInventoryEffects(task: CampaignDowntimeTask): JsonObject[] {
    if (task.type === "crafting") {
      return this.cloneJsonObjectArray([{ type: "crafted_output_pending_gm_claim", title: task.title }]);
    }
    if (task.type === "identify") {
      return this.cloneJsonObjectArray([{ type: "item_identified_pending_gm_selection", title: task.title }]);
    }
    if (task.type === "repair") {
      return this.cloneJsonObjectArray([{ type: "item_repaired_pending_gm_selection", title: task.title }]);
    }
    return [];
  }

  private getDowntimeCharacterResourceEffects(task: CampaignDowntimeTask): JsonObject[] {
    if (task.type === "training") {
      return this.cloneJsonObjectArray([{ type: "training_progress_recorded", workDays: task.workDaysCompleted }]);
    }
    if (task.type === "research") {
      return this.cloneJsonObjectArray([{ type: "research_progress_recorded", workDays: task.workDaysCompleted }]);
    }
    if (task.type === "recovery") {
      return this.cloneJsonObjectArray([{ type: "recovery_completed", workDays: task.workDaysCompleted }]);
    }
    return [];
  }

  private cloneState(state: CampaignCalendarState): CampaignCalendarState {
    return {
      inGameDate: state.inGameDate,
      elapsedDays: state.elapsedDays,
      scheduleProposals: state.scheduleProposals.map((proposal) => ({
        ...proposal,
        responses: proposal.responses.map((response) => ({ ...response })),
      })),
      timeline: state.timeline.map((event) => ({ ...event })),
      downtimeTasks: state.downtimeTasks.map((task) => ({
        ...task,
        requiredTools: [...task.requiredTools],
      })),
      processedIdempotencyKeys: [...state.processedIdempotencyKeys],
    };
  }

  private requireIsoDate(value: string | null | undefined, field: string): string {
    if (!value || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${field} must be an ISO date string.`);
    }
    return new Date(value).toISOString();
  }

  private requirePositiveInteger(value: number | undefined, field: string): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }
    return value;
  }

  private requireNonNegativeInteger(value: number | undefined, field: string): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer.`);
    }
    return value;
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

  private isCalendarState(value: unknown): value is CampaignCalendarState {
    if (!isRecord(value)) return false;
    const candidate = value;
    return (
      (candidate.inGameDate === null || typeof candidate.inGameDate === "string") &&
      this.isFiniteNumber(candidate.elapsedDays) &&
      Array.isArray(candidate.scheduleProposals) &&
      candidate.scheduleProposals.every((schedule) => this.isScheduleProposal(schedule)) &&
      Array.isArray(candidate.timeline) &&
      candidate.timeline.every((event) => this.isTimelineEvent(event)) &&
      Array.isArray(candidate.downtimeTasks) &&
      candidate.downtimeTasks.every((task) => this.isDowntimeTask(task)) &&
      Array.isArray(candidate.processedIdempotencyKeys) &&
      candidate.processedIdempotencyKeys.every((key) => typeof key === "string")
    );
  }

  private isScheduleProposal(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      typeof value.startsAt === "string" &&
      this.isFiniteNumber(value.durationMinutes) &&
      typeof value.timeZone === "string" &&
      typeof value.proposedByUserId === "string" &&
      this.isScheduleStatus(value.status) &&
      (value.confirmedAt === null || typeof value.confirmedAt === "string") &&
      (value.confirmedByUserId === null || typeof value.confirmedByUserId === "string") &&
      Array.isArray(value.responses) &&
      value.responses.every((response) => this.isScheduleResponse(response))
    );
  }

  private isScheduleResponse(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.id === "string" &&
      typeof value.userId === "string" &&
      this.isScheduleAvailability(value.availability) &&
      (value.note === null || typeof value.note === "string") &&
      typeof value.respondedAt === "string"
    );
  }

  private isTimelineEvent(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.id === "string" &&
      typeof value.type === "string" &&
      (value.inGameDate === null || typeof value.inGameDate === "string") &&
      this.isFiniteNumber(value.elapsedDays) &&
      typeof value.createdByUserId === "string" &&
      typeof value.createdAt === "string" &&
      (value.note === null || typeof value.note === "string")
    );
  }

  private isDowntimeTask(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
      typeof value.id === "string" &&
      this.isDowntimeType(value.type) &&
      typeof value.sessionCharacterId === "string" &&
      typeof value.title === "string" &&
      this.isDowntimeStatus(value.status) &&
      this.isFiniteNumber(value.costGp) &&
      this.isFiniteNumber(value.workDaysRequired) &&
      this.isFiniteNumber(value.workDaysCompleted) &&
      Array.isArray(value.requiredTools) &&
      value.requiredTools.every((tool) => typeof tool === "string") &&
      typeof value.startedByUserId === "string" &&
      typeof value.startedAt === "string" &&
      typeof value.updatedAt === "string" &&
      (value.completedAt === null || typeof value.completedAt === "string") &&
      (value.note === null || typeof value.note === "string")
    );
  }

  private isScheduleStatus(value: unknown): value is CampaignScheduleStatus {
    return value === "proposed" || value === "confirmed" || value === "cancelled";
  }

  private isScheduleAvailability(value: unknown): value is CampaignScheduleAvailability {
    return value === "available" || value === "unavailable" || value === "tentative";
  }

  private isDowntimeStatus(value: unknown): value is CampaignDowntimeStatus {
    return value === "active" || value === "paused" || value === "completed";
  }

  private isDowntimeType(value: unknown): value is CampaignDowntimeType {
    return (
      value === "crafting" ||
      value === "training" ||
      value === "research" ||
      value === "recovery" ||
      value === "identify" ||
      value === "repair" ||
      value === "shop_restock"
    );
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
}
