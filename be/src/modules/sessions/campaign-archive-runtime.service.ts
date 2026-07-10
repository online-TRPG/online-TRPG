import { ConflictException, Injectable } from "@nestjs/common";
import {
  CampaignArchiveResponseDto,
  CampaignArchivePublicRevisionLineageDto,
  CampaignArchiveSnapshotDto,
  CharacterTransferResponseDto,
  JsonObject,
  decodeJsonObject,
  isRecord,
  parseJsonWithDecoder,
} from "@trpg/shared-types";
import {
  parseJsonOrFallback,
} from "../../common/utils/json-runtime";
import {
  CAMPAIGN_CALENDAR_FLAGS_KEY,
  type CampaignDowntimeStatus,
} from "../rules/campaign-calendar-runtime.service";
import { ECONOMY_FLAGS_KEY } from "../rules/economy-state-runtime.service";

export type P6CharacterTransferRequestFlag = CharacterTransferResponseDto & {
  note: string | null;
  approvedByUserId?: string | null;
};

export const P6_CAMPAIGN_ARCHIVE_FLAG = "p6CampaignArchive";
export const P6_CHARACTER_TRANSFER_REQUESTS_FLAG = "p6CharacterTransferRequests";

type ArchiveCalendarSummary = {
  activeTaskCount: number;
  pausedTaskCount: number;
  completedTaskCount: number;
  taskIds: string[];
};

type ArchiveDowntimeSummaryTask = {
  id: string;
  status: CampaignDowntimeStatus;
};

type ArchiveCharacterEntry = CampaignArchiveResponseDto["characters"][number];

type ArchiveEconomySummary = {
  hasEconomyState: boolean;
  partyStashItemCount: number;
  walletCount: number;
  shopCount: number;
  craftingProgressCount: number;
  downtimeCompletionCount: number;
};

type ArchiveInventorySummary = {
  totalItemCount: number;
  characterInventoryCounts: Record<string, number>;
};

type ArchiveInventorySummaryItem = {
  quantity: number;
};

type ArchiveCombatSummary = {
  combatCount: number;
  turnLogCount: number;
  nodeVisitCount: number;
};

function decodeTransferInventoryItems(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    throw new Error("transfer inventory must be an array.");
  }
  return value.map((item, index) => decodeJsonObject(item, `transfer inventory[${index}]`));
}

function decodeArchiveInventorySummaryItems(value: unknown): ArchiveInventorySummaryItem[] {
  if (!Array.isArray(value)) {
    throw new Error("archive inventory must be an array.");
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    return [{ quantity: readArchiveInventoryQuantity(item.quantity) }];
  });
}

function readArchiveInventoryQuantity(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}

function decodeArchiveDowntimeSummaryTasks(value: unknown): ArchiveDowntimeSummaryTask[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((task) => {
    if (!isRecord(task) || typeof task.id !== "string" || !isArchiveDowntimeStatus(task.status)) {
      return [];
    }
    return [{ id: task.id, status: task.status }];
  });
}

function isArchiveDowntimeStatus(value: unknown): value is CampaignDowntimeStatus {
  return value === "active" || value === "paused" || value === "completed";
}

function decodeArchiveCharacterEntries(value: unknown): ArchiveCharacterEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const sessionCharacterId = readNonEmptyString(entry.sessionCharacterId);
    const characterId = readNonEmptyString(entry.characterId);
    const userId = readNonEmptyString(entry.userId);
    if (!sessionCharacterId || !characterId || !userId) {
      return [];
    }
    return [{
      sessionCharacterId,
      characterId,
      userId,
      name: typeof entry.name === "string" ? entry.name : "Unknown",
      className: typeof entry.className === "string" ? entry.className : "unknown",
      subclassName: typeof entry.subclassName === "string" ? entry.subclassName : null,
      level: readArchiveCharacterLevel(entry.level),
      status: typeof entry.status === "string" ? entry.status : "ACTIVE",
    }];
  });
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readArchiveCharacterLevel(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20 ? value : 1;
}

function summarizeArchiveEconomyState(value: unknown): ArchiveEconomySummary {
  if (!isRecord(value)) {
    return {
      hasEconomyState: false,
      partyStashItemCount: 0,
      walletCount: 0,
      shopCount: 0,
      craftingProgressCount: 0,
      downtimeCompletionCount: 0,
    };
  }

  return {
    hasEconomyState: true,
    partyStashItemCount: countArrayValues(value.partyStash, isArchiveEconomyInventoryItem),
    walletCount: countRecordValues(value.walletsBySessionCharacterId, isArchiveCurrencyWallet),
    shopCount: countRecordValues(value.shopStatesById, isArchiveShopState),
    craftingProgressCount: countRecordValues(value.craftingProgressById, isArchiveCraftingProgress),
    downtimeCompletionCount: countRecordValues(value.downtimeCompletionsById, isArchiveEconomyDowntimeCompletion),
  };
}

function countArrayValues(value: unknown, predicate: (entry: unknown) => boolean): number {
  return Array.isArray(value) ? value.filter(predicate).length : 0;
}

function countRecordValues(value: unknown, predicate: (entry: unknown) => boolean): number {
  return isRecord(value) ? Object.values(value).filter(predicate).length : 0;
}

function isArchiveEconomyInventoryItem(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.itemDefinitionId === "string" && isPositiveInteger(value.quantity);
}

function isArchiveCurrencyWallet(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return ["cp", "sp", "ep", "gp", "pp"].every((key) => {
    const amount = value[key];
    return amount === undefined || isNonNegativeFiniteNumber(amount);
  });
}

function isArchiveShopState(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.shopId === "string" && Array.isArray(value.inventory);
}

function isArchiveCraftingProgress(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.craftingId === "string" &&
    typeof value.recipeId === "string" &&
    typeof value.sessionCharacterId === "string" &&
    typeof value.outputItemDefinitionId === "string" &&
    isPositiveInteger(value.outputQuantity) &&
    isNonNegativeFiniteNumber(value.completedHours) &&
    isPositiveFiniteNumber(value.requiredHours) &&
    (value.status === "in_progress" || value.status === "completed")
  );
}

function isArchiveEconomyDowntimeCompletion(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.downtimeTaskId === "string" &&
    typeof value.downtimeType === "string" &&
    typeof value.sessionCharacterId === "string" &&
    typeof value.title === "string" &&
    isNonNegativeFiniteNumber(value.costGp) &&
    typeof value.completedAt === "string"
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function decodeStringArray(value: readonly unknown[]): string[] {
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

@Injectable()
export class CampaignArchiveRuntimeService {
  parseCampaignArchive(flags: Record<string, unknown>): CampaignArchiveResponseDto | null {
    const archive = flags[P6_CAMPAIGN_ARCHIVE_FLAG];
    if (!isRecord(archive)) {
      return null;
    }
    const candidate = archive;
    if (
      typeof candidate.archiveId !== "string" ||
      typeof candidate.sessionId !== "string" ||
      typeof candidate.sessionTitle !== "string" ||
      typeof candidate.scenarioId !== "string" ||
      typeof candidate.completedAt !== "string" ||
      typeof candidate.completedByUserId !== "string" ||
      typeof candidate.epilogue !== "string"
    ) {
      return null;
    }

    return {
      archiveId: candidate.archiveId,
      sessionId: candidate.sessionId,
      sessionTitle: candidate.sessionTitle,
      scenarioId: candidate.scenarioId,
      scenarioTitle: typeof candidate.scenarioTitle === "string" ? candidate.scenarioTitle : null,
      completedAt: candidate.completedAt,
      completedByUserId: candidate.completedByUserId,
      epilogue: candidate.epilogue,
      shareScope:
        candidate.shareScope === "private" || candidate.shareScope === "public_summary"
          ? candidate.shareScope
          : "party",
      allowCharacterTransfer: candidate.allowCharacterTransfer !== false,
      finalNodeId: typeof candidate.finalNodeId === "string" ? candidate.finalNodeId : null,
      finalRewardIds: Array.isArray(candidate.finalRewardIds)
        ? decodeStringArray(candidate.finalRewardIds).slice(0, 20)
        : [],
      characters: decodeArchiveCharacterEntries(candidate.characters),
      analytics: {
        turnLogCount: this.getNumberProperty(candidate.analytics, "turnLogCount"),
        combatCount: this.getNumberProperty(candidate.analytics, "combatCount"),
        completedDowntimeTaskCount: this.getNumberProperty(candidate.analytics, "completedDowntimeTaskCount"),
        nodeVisitCount: this.getNumberProperty(candidate.analytics, "nodeVisitCount"),
        sessionCharacterCount: this.getNumberProperty(candidate.analytics, "sessionCharacterCount"),
      },
      snapshot: this.parseCampaignArchiveSnapshot(candidate.snapshot, {
        turnLogCount: this.getNumberProperty(candidate.analytics, "turnLogCount"),
        combatCount: this.getNumberProperty(candidate.analytics, "combatCount"),
        nodeVisitCount: this.getNumberProperty(candidate.analytics, "nodeVisitCount"),
      }),
    };
  }

  buildCampaignArchiveSnapshot(params: {
    flags: Record<string, unknown>;
    stateVersion: number;
    currentNodeId: string | null;
    sessionCharacters: Array<{
      id: string;
      inventorySnapshotJson?: string | null;
      character: { inventoryJson?: string | null };
    }>;
    turnLogCount: number;
    combatCount: number;
    nodeVisitCount: number;
    scenarioAttribution: string | null;
  }): CampaignArchiveSnapshotDto {
    const calendarSummary = this.summarizeArchiveCalendarFlags(params.flags);
    const economySummary = this.summarizeArchiveEconomyFlags(params.flags);
    const characterInventoryCounts = Object.fromEntries(
      params.sessionCharacters.map((entry) => [
        entry.id,
        this.countArchiveInventoryItems(entry.inventorySnapshotJson ?? entry.character.inventoryJson),
      ]),
    );

    return {
      stateVersion: params.stateVersion,
      currentNodeId: params.currentNodeId,
      downtime: calendarSummary,
      economy: economySummary,
      inventory: {
        totalItemCount: Object.values(characterInventoryCounts).reduce((sum, count) => sum + count, 0),
        characterInventoryCounts,
      },
      combat: {
        combatCount: params.combatCount,
        turnLogCount: params.turnLogCount,
        nodeVisitCount: params.nodeVisitCount,
      },
      publicRevisionLineage: this.extractPublicRevisionLineage(params.scenarioAttribution),
    };
  }

  parseCharacterTransferRequests(flags: Record<string, unknown>): P6CharacterTransferRequestFlag[] {
    const value = flags[P6_CHARACTER_TRANSFER_REQUESTS_FLAG];
    const requests = Array.isArray(value) ? value : [];
    return requests.flatMap((request) => {
      if (
        !isRecord(request) ||
        typeof request.requestId !== "string" ||
        typeof request.targetSessionId !== "string" ||
        typeof request.sourceSessionId !== "string" ||
        typeof request.sourceSessionCharacterId !== "string" ||
        typeof request.requestedByUserId !== "string" ||
        (request.status !== "requested" && request.status !== "approved" && request.status !== "rejected") ||
        (request.mode !== "clone" && request.mode !== "transfer") ||
        typeof request.createdAt !== "string"
      ) {
        return [];
      }

      return [{
        requestId: request.requestId,
        targetSessionId: request.targetSessionId,
        sourceSessionId: request.sourceSessionId,
        sourceSessionCharacterId: request.sourceSessionCharacterId,
        requestedByUserId: request.requestedByUserId,
        status: request.status,
        mode: request.mode,
        targetSessionCharacterId:
          typeof request.targetSessionCharacterId === "string" ? request.targetSessionCharacterId : null,
        sourceDisposition:
          request.sourceDisposition === "copied" || request.sourceDisposition === "retired_after_transfer"
            ? request.sourceDisposition
            : null,
        createdAt: request.createdAt,
        resolvedAt: typeof request.resolvedAt === "string" ? request.resolvedAt : null,
        note: typeof request.note === "string" ? request.note : null,
        approvedByUserId: typeof request.approvedByUserId === "string" ? request.approvedByUserId : null,
      }];
    });
  }

  ensureCharacterTransferPolicy(params: {
    targetSession: { ruleSetId?: string | null };
    targetScenario: { startLevel?: number | null; recommendedEndLevel?: number | null; ruleSetId?: string | null };
    sourceSession: { ruleSetId?: string | null };
    sourceCharacter: { level: number };
  }): void {
    const targetRuleSetId = params.targetSession.ruleSetId ?? params.targetScenario.ruleSetId ?? null;
    const sourceRuleSetId = params.sourceSession.ruleSetId ?? null;
    if (targetRuleSetId && sourceRuleSetId && targetRuleSetId !== sourceRuleSetId) {
      throw new ConflictException("같은 rule set의 캠페인으로만 캐릭터를 이관할 수 있습니다.");
    }

    const minLevel = Math.max(params.targetScenario.startLevel ?? 1, 1);
    const maxLevel = Math.max(params.targetScenario.recommendedEndLevel ?? 20, minLevel);
    if (params.sourceCharacter.level < minLevel || params.sourceCharacter.level > maxLevel) {
      throw new ConflictException(
        `대상 캠페인 레벨 범위(${minLevel}-${maxLevel})에 맞는 캐릭터만 이관할 수 있습니다.`,
      );
    }
  }

  ensureCharacterMatchesScenarioLevel(params: {
    characterName?: string | null;
    characterLevel: number;
    scenario: { title?: string | null; startLevel?: number | null; recommendedEndLevel?: number | null };
  }): void {
    if (this.isCharacterLevelInScenarioRange(params.characterLevel, params.scenario)) {
      return;
    }

    throw new ConflictException(this.buildScenarioLevelMismatchMessage(params));
  }

  ensureCharacterTransferInventoryPolicy(inventoryJson: string | null | undefined): string {
    if (!inventoryJson) {
      return "[]";
    }
    let inventory: JsonObject[];
    try {
      inventory = parseJsonWithDecoder(inventoryJson, decodeTransferInventoryItems, "transfer inventory");
    } catch {
      throw new ConflictException("이관 가능한 캐릭터 inventory 형식이 아닙니다.");
    }
    if (inventory.length > 100) {
      throw new ConflictException("캐릭터 이관 inventory는 100개 이하의 개인 소지품만 허용됩니다.");
    }

    for (const item of inventory) {
      if (this.isCampaignBoundTransferItem(item)) {
        throw new ConflictException("캠페인 귀속/파티 공유/경제 장부 아이템은 캐릭터 이관에 포함할 수 없습니다.");
      }
    }

    return JSON.stringify(inventory);
  }

  toCharacterTransferResponse(request: P6CharacterTransferRequestFlag): CharacterTransferResponseDto {
    return {
      requestId: request.requestId,
      targetSessionId: request.targetSessionId,
      sourceSessionId: request.sourceSessionId,
      sourceSessionCharacterId: request.sourceSessionCharacterId,
      requestedByUserId: request.requestedByUserId,
      status: request.status,
      mode: request.mode,
      targetSessionCharacterId: request.targetSessionCharacterId,
      sourceDisposition: request.sourceDisposition ?? null,
      note: request.note,
      createdAt: request.createdAt,
      resolvedAt: request.resolvedAt,
    };
  }

  countCompletedDowntimeTasks(flags: Record<string, unknown>): number {
    return this.summarizeArchiveCalendarFlags(flags).completedTaskCount;
  }

  private summarizeArchiveCalendarFlags(flags: Record<string, unknown>): ArchiveCalendarSummary {
    const calendar = isRecord(flags[CAMPAIGN_CALENDAR_FLAGS_KEY]) ? flags[CAMPAIGN_CALENDAR_FLAGS_KEY] : {};
    const downtimeTasks = decodeArchiveDowntimeSummaryTasks(calendar.downtimeTasks);

    return {
      activeTaskCount: downtimeTasks.filter((task) => task.status === "active").length,
      pausedTaskCount: downtimeTasks.filter((task) => task.status === "paused").length,
      completedTaskCount: downtimeTasks.filter((task) => task.status === "completed").length,
      taskIds: downtimeTasks.map((task) => task.id).slice(0, 50),
    };
  }

  private summarizeArchiveEconomyFlags(flags: Record<string, unknown>): ArchiveEconomySummary {
    return summarizeArchiveEconomyState(flags[ECONOMY_FLAGS_KEY]);
  }

  private parseCampaignArchiveSnapshot(
    value: unknown,
    fallbackCombat: ArchiveCombatSummary,
  ): CampaignArchiveSnapshotDto {
    if (!isRecord(value)) {
      return {
        stateVersion: 0,
        currentNodeId: null,
        downtime: this.emptyArchiveCalendarSummary(),
        economy: this.emptyArchiveEconomySummary(),
        inventory: this.emptyArchiveInventorySummary(),
        combat: fallbackCombat,
        publicRevisionLineage: null,
      };
    }
    const candidate = value;

    return {
      stateVersion: this.getNumberProperty(candidate, "stateVersion"),
      currentNodeId: typeof candidate.currentNodeId === "string" ? candidate.currentNodeId : null,
      downtime: this.parseArchiveCalendarSummary(candidate.downtime),
      economy: this.parseArchiveEconomySummary(candidate.economy),
      inventory: this.parseArchiveInventorySummary(candidate.inventory),
      combat: this.parseArchiveCombatSummary(candidate.combat, fallbackCombat),
      publicRevisionLineage: this.normalizePublicRevisionLineage(candidate.publicRevisionLineage),
    };
  }

  private parseArchiveCalendarSummary(value: unknown): ArchiveCalendarSummary {
    const downtime = isRecord(value) ? value : {};
    return {
      activeTaskCount: this.getNumberProperty(downtime, "activeTaskCount"),
      pausedTaskCount: this.getNumberProperty(downtime, "pausedTaskCount"),
      completedTaskCount: this.getNumberProperty(downtime, "completedTaskCount"),
      taskIds: Array.isArray(downtime.taskIds)
        ? decodeStringArray(downtime.taskIds).slice(0, 50)
        : [],
    };
  }

  private parseArchiveEconomySummary(value: unknown): ArchiveEconomySummary {
    const economy = isRecord(value) ? value : {};
    return {
      hasEconomyState: economy.hasEconomyState === true,
      partyStashItemCount: this.getNumberProperty(economy, "partyStashItemCount"),
      walletCount: this.getNumberProperty(economy, "walletCount"),
      shopCount: this.getNumberProperty(economy, "shopCount"),
      craftingProgressCount: this.getNumberProperty(economy, "craftingProgressCount"),
      downtimeCompletionCount: this.getNumberProperty(economy, "downtimeCompletionCount"),
    };
  }

  private parseArchiveInventorySummary(value: unknown): ArchiveInventorySummary {
    const inventory = isRecord(value) ? value : {};
    const characterInventoryCounts: Record<string, number> = {};
    if (isRecord(inventory.characterInventoryCounts)) {
      for (const [key, count] of Object.entries(inventory.characterInventoryCounts)) {
        if (key && this.isNonNegativeInteger(count)) {
          characterInventoryCounts[key] = count;
        }
      }
    }
    return {
      totalItemCount: this.getNumberProperty(inventory, "totalItemCount"),
      characterInventoryCounts,
    };
  }

  private parseArchiveCombatSummary(value: unknown, fallbackCombat: ArchiveCombatSummary): ArchiveCombatSummary {
    const combat = isRecord(value) ? value : {};
    return {
      combatCount: this.getNumberProperty(combat, "combatCount") || fallbackCombat.combatCount,
      turnLogCount: this.getNumberProperty(combat, "turnLogCount") || fallbackCombat.turnLogCount,
      nodeVisitCount: this.getNumberProperty(combat, "nodeVisitCount") || fallbackCombat.nodeVisitCount,
    };
  }

  private emptyArchiveCalendarSummary(): ArchiveCalendarSummary {
    return { activeTaskCount: 0, pausedTaskCount: 0, completedTaskCount: 0, taskIds: [] };
  }

  private emptyArchiveEconomySummary(): ArchiveEconomySummary {
    return {
      hasEconomyState: false,
      partyStashItemCount: 0,
      walletCount: 0,
      shopCount: 0,
      craftingProgressCount: 0,
      downtimeCompletionCount: 0,
    };
  }

  private emptyArchiveInventorySummary(): ArchiveInventorySummary {
    return { totalItemCount: 0, characterInventoryCounts: {} };
  }

  private countArchiveInventoryItems(inventoryJson: string | null | undefined): number {
    const items = parseJsonOrFallback<ArchiveInventorySummaryItem[]>(inventoryJson, [], decodeArchiveInventorySummaryItems);
    return items.reduce<number>((sum, item) => sum + item.quantity, 0);
  }

  private extractPublicRevisionLineage(attribution: string | null): CampaignArchivePublicRevisionLineageDto | null {
    if (!attribution) {
      return null;
    }
    const marker = "P5_PUBLIC_META:";
    const markerIndex = attribution.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    return parseJsonOrFallback(
      attribution.slice(markerIndex + marker.length).trim(),
      null,
      (value) => this.decodePublicRevisionLineageMetadata(value),
    );
  }

  private decodePublicRevisionLineageMetadata(value: unknown): CampaignArchivePublicRevisionLineageDto | null {
    if (!isRecord(value)) {
      throw new Error("public revision metadata must be an object.");
    }
    return this.normalizePublicRevisionLineage(value.lineage);
  }

  private normalizePublicRevisionLineage(value: unknown): CampaignArchivePublicRevisionLineageDto | null {
    if (!isRecord(value)) {
      return null;
    }
    return {
      sourceScenarioId: typeof value.sourceScenarioId === "string" ? value.sourceScenarioId : null,
      sourceRevisionId: typeof value.sourceRevisionId === "string" ? value.sourceRevisionId : null,
      forkedFromScenarioId: typeof value.forkedFromScenarioId === "string" ? value.forkedFromScenarioId : null,
      forkedAt: typeof value.forkedAt === "string" ? value.forkedAt : null,
      forkedByUserId: typeof value.forkedByUserId === "string" ? value.forkedByUserId : null,
    };
  }

  private isCharacterLevelInScenarioRange(
    characterLevel: number,
    scenario: { startLevel?: number | null; recommendedEndLevel?: number | null },
  ): boolean {
    const { minLevel, maxLevel } = this.getScenarioLevelRange(scenario);
    return characterLevel >= minLevel && characterLevel <= maxLevel;
  }

  private buildScenarioLevelMismatchMessage(params: {
    characterName?: string | null;
    characterLevel: number;
    scenario: { title?: string | null; startLevel?: number | null; recommendedEndLevel?: number | null };
  }): string {
    const { minLevel, maxLevel } = this.getScenarioLevelRange(params.scenario);
    const characterLabel = params.characterName?.trim() || "선택한 캐릭터";
    const scenarioLabel = params.scenario.title?.trim() || "이 시나리오";
    const levelLabel = minLevel === maxLevel ? `${minLevel}레벨` : `${minLevel}-${maxLevel}레벨`;
    return `${scenarioLabel}에는 ${levelLabel} 캐릭터만 참여할 수 있습니다. ${characterLabel}의 현재 레벨은 ${params.characterLevel}입니다.`;
  }

  private getScenarioLevelRange(scenario: { startLevel?: number | null; recommendedEndLevel?: number | null }): {
    minLevel: number;
    maxLevel: number;
  } {
    const minLevel = Math.max(scenario.startLevel ?? 1, 1);
    const maxLevel = Math.max(scenario.recommendedEndLevel ?? minLevel, minLevel);
    return { minLevel, maxLevel };
  }

  private isCampaignBoundTransferItem(item: JsonObject): boolean {
    const stringFlags = [
      item.ownerScope,
      item.scope,
      item.sourceScope,
      item.itemScope,
      item.transferScope,
      item.itemType,
      item.useEffect,
    ]
      .flatMap((value) => (typeof value === "string" ? [value] : []))
      .map((value) => value.toLowerCase());
    const tags = [...(Array.isArray(item.tags) ? item.tags : []), ...(Array.isArray(item.properties) ? item.properties : [])]
      .flatMap((value) => (typeof value === "string" ? [value] : []))
      .map((value) => value.toLowerCase());
    const blockedMarkers = [
      "campaign",
      "campaign_bound",
      "session",
      "session_bound",
      "party",
      "party_stash",
      "economy",
      "currency",
      "wallet",
    ];

    return (
      item.transferable === false ||
      item.campaignBound === true ||
      item.sessionBound === true ||
      item.partyStash === true ||
      item.isPartyStash === true ||
      typeof item.boundToSessionId === "string" ||
      typeof item.boundSessionId === "string" ||
      typeof item.sourceSessionId === "string" ||
      typeof item.campaignArchiveId === "string" ||
      typeof item.attunedBySessionCharacterId === "string" ||
      item.currency !== undefined ||
      item.wallet !== undefined ||
      item.economy !== undefined ||
      item.economyState !== undefined ||
      stringFlags.some((value) => blockedMarkers.includes(value)) ||
      tags.some((value) => blockedMarkers.includes(value))
    );
  }

  private getNumberProperty(source: unknown, property: string): number {
    if (!isRecord(source)) {
      return 0;
    }
    const value = source[property];
    return this.isNonNegativeInteger(value) ? value : 0;
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
}
