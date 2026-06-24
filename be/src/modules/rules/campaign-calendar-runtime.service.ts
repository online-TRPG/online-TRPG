import { BadRequestException, Injectable } from "@nestjs/common";
import { ActionOutcome, ApplyCampaignCalendarActionDto, StateDiffResponseDto, TurnLogResponseDto } from "@trpg/shared-types";
import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { notFound } from "../../common/exceptions/domain-error";
import { ECONOMY_FLAGS_KEY } from "./economy-state-runtime.service";
import { EconomyState } from "./economy-runtime.service";

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
      const flags = this.parseFlags(gameState.flagsJson);
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
      const stateDiff: StateDiffResponseDto = {
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
      };

      const created = await tx.turnLog.create({
        data: {
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          actorUserId: params.resolution.auditEvent.actorUserId,
          sessionCharacterId: params.resolution.auditEvent.sessionCharacterId ?? null,
          turnNumber: (latest?.turnNumber ?? 0) + 1,
          rawInput: params.rawInput ?? `/campaign ${params.resolution.auditEvent.type}`,
          structuredActionJson: JSON.stringify({
            type: "campaign_calendar",
            campaignAction: params.resolution.auditEvent.type,
            auditEvent: params.resolution.auditEvent,
          }),
          stateDiffJson: JSON.stringify(stateDiff),
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
    const flags = this.parseFlags(flagsJson);
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
        economyEffects: [
          ...(task.costGp > 0
            ? [{ type: "currency_spent", currency: "gp", amount: task.costGp }]
            : []),
          ...(task.type === "shop_restock" ? [{ type: "shop_restock_ready" }] : []),
        ],
        inventoryEffects: this.getDowntimeInventoryEffects(task),
        characterResourceEffects: this.getDowntimeCharacterResourceEffects(task),
      },
    };
    return economy;
  }

  private cloneEconomyState(value: unknown): EconomyState {
    const candidate = value && typeof value === "object" ? (value as Partial<EconomyState>) : {};
    const downtimeCompletions =
      candidate.downtimeCompletionsById && typeof candidate.downtimeCompletionsById === "object"
        ? candidate.downtimeCompletionsById
        : {};
    return {
      partyStash: Array.isArray(candidate.partyStash)
        ? candidate.partyStash.map((item) => ({ ...item }))
        : [],
      walletsBySessionCharacterId:
        candidate.walletsBySessionCharacterId && typeof candidate.walletsBySessionCharacterId === "object"
          ? Object.fromEntries(
              Object.entries(candidate.walletsBySessionCharacterId).map(([key, wallet]) => [
                key,
                { ...(wallet ?? {}) },
              ]),
            )
          : {},
      shopStatesById:
        candidate.shopStatesById && typeof candidate.shopStatesById === "object"
          ? Object.fromEntries(
              Object.entries(candidate.shopStatesById).map(([key, shop]) => [
                key,
                {
                  ...(shop ?? {}),
                  inventory: Array.isArray(shop?.inventory)
                    ? shop.inventory.map((item) => ({ ...item }))
                    : [],
                },
              ]),
            )
          : {},
      craftingProgressById:
        candidate.craftingProgressById && typeof candidate.craftingProgressById === "object"
          ? Object.fromEntries(
              Object.entries(candidate.craftingProgressById).map(([key, progress]) => [
                key,
                { ...(progress ?? {}) },
              ]),
            )
          : {},
      downtimeCompletionsById: Object.fromEntries(
        Object.entries(downtimeCompletions).map(([key, completion]) => [
          key,
          {
            ...completion,
            economyEffects: completion.economyEffects?.map((effect) => ({ ...effect })) ?? [],
            inventoryEffects: completion.inventoryEffects?.map((effect) => ({ ...effect })) ?? [],
            characterResourceEffects:
              completion.characterResourceEffects?.map((effect) => ({ ...effect })) ?? [],
          },
        ]),
      ),
    };
  }

  private getDowntimeInventoryEffects(task: CampaignDowntimeTask): Array<Record<string, unknown>> {
    if (task.type === "crafting") {
      return [{ type: "crafted_output_pending_gm_claim", title: task.title }];
    }
    if (task.type === "identify") {
      return [{ type: "item_identified_pending_gm_selection", title: task.title }];
    }
    if (task.type === "repair") {
      return [{ type: "item_repaired_pending_gm_selection", title: task.title }];
    }
    return [];
  }

  private getDowntimeCharacterResourceEffects(task: CampaignDowntimeTask): Array<Record<string, unknown>> {
    if (task.type === "training") {
      return [{ type: "training_progress_recorded", workDays: task.workDaysCompleted }];
    }
    if (task.type === "research") {
      return [{ type: "research_progress_recorded", workDays: task.workDaysCompleted }];
    }
    if (task.type === "recovery") {
      return [{ type: "recovery_completed", workDays: task.workDaysCompleted }];
    }
    return [];
  }

  private cloneState(state: CampaignCalendarState): CampaignCalendarState {
    return JSON.parse(JSON.stringify(state)) as CampaignCalendarState;
  }

  private requireIsoDate(value: string | null | undefined, field: string): string {
    if (!value || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${field} must be an ISO date string.`);
    }
    return new Date(value).toISOString();
  }

  private requirePositiveInteger(value: number | undefined, field: string): number {
    if (!Number.isInteger(value) || (value ?? 0) < 1) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }
    return value as number;
  }

  private requireNonNegativeInteger(value: number | undefined, field: string): number {
    if (!Number.isInteger(value) || (value ?? -1) < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer.`);
    }
    return value as number;
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

  private isCalendarState(value: unknown): value is CampaignCalendarState {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<CampaignCalendarState>;
    return (
      (candidate.inGameDate === null || typeof candidate.inGameDate === "string") &&
      typeof candidate.elapsedDays === "number" &&
      Array.isArray(candidate.scheduleProposals) &&
      Array.isArray(candidate.timeline) &&
      Array.isArray(candidate.downtimeTasks) &&
      Array.isArray(candidate.processedIdempotencyKeys)
    );
  }
}
