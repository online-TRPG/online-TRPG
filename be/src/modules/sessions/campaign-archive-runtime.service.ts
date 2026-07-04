import { ConflictException, Injectable } from "@nestjs/common";
import {
  CampaignArchiveResponseDto,
  CampaignArchiveSnapshotDto,
  CharacterTransferResponseDto,
} from "@trpg/shared-types";

export type P6CharacterTransferRequestFlag = CharacterTransferResponseDto & {
  note: string | null;
  approvedByUserId?: string | null;
};

@Injectable()
export class CampaignArchiveRuntimeService {
  parseCampaignArchive(flags: Record<string, unknown>): CampaignArchiveResponseDto | null {
    const archive = flags.p6CampaignArchive;
    if (!archive || typeof archive !== "object") {
      return null;
    }
    const candidate = archive as Record<string, unknown>;
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
        ? candidate.finalRewardIds.filter((id): id is string => typeof id === "string").slice(0, 20)
        : [],
      characters: Array.isArray(candidate.characters)
        ? candidate.characters
            .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
            .map((entry) => ({
              sessionCharacterId: typeof entry.sessionCharacterId === "string" ? entry.sessionCharacterId : "",
              characterId: typeof entry.characterId === "string" ? entry.characterId : "",
              userId: typeof entry.userId === "string" ? entry.userId : "",
              name: typeof entry.name === "string" ? entry.name : "Unknown",
              className: typeof entry.className === "string" ? entry.className : "unknown",
              subclassName: typeof entry.subclassName === "string" ? entry.subclassName : null,
              level: typeof entry.level === "number" ? entry.level : 1,
              status: typeof entry.status === "string" ? entry.status : "ACTIVE",
            }))
            .filter((entry) => entry.sessionCharacterId && entry.characterId && entry.userId)
        : [],
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
    const calendar = params.flags.campaignCalendar && typeof params.flags.campaignCalendar === "object"
      ? (params.flags.campaignCalendar as Record<string, unknown>)
      : {};
    const downtimeTasks = Array.isArray(calendar.downtimeTasks)
      ? calendar.downtimeTasks.filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === "object")
      : [];
    const economy = params.flags.economy && typeof params.flags.economy === "object"
      ? (params.flags.economy as Record<string, unknown>)
      : null;
    const partyStash = Array.isArray(economy?.partyStash) ? economy.partyStash : [];
    const wallets = economy?.walletsBySessionCharacterId && typeof economy.walletsBySessionCharacterId === "object"
      ? (economy.walletsBySessionCharacterId as Record<string, unknown>)
      : {};
    const shops = economy?.shopStatesById && typeof economy.shopStatesById === "object"
      ? (economy.shopStatesById as Record<string, unknown>)
      : {};
    const crafting = economy?.craftingProgressById && typeof economy.craftingProgressById === "object"
      ? (economy.craftingProgressById as Record<string, unknown>)
      : {};
    const downtimeCompletions = economy?.downtimeCompletionsById && typeof economy.downtimeCompletionsById === "object"
      ? (economy.downtimeCompletionsById as Record<string, unknown>)
      : {};
    const characterInventoryCounts = Object.fromEntries(
      params.sessionCharacters.map((entry) => [
        entry.id,
        this.countArchiveInventoryItems(entry.inventorySnapshotJson ?? entry.character.inventoryJson),
      ]),
    );

    return {
      stateVersion: params.stateVersion,
      currentNodeId: params.currentNodeId,
      downtime: {
        activeTaskCount: downtimeTasks.filter((task) => task.status === "active").length,
        pausedTaskCount: downtimeTasks.filter((task) => task.status === "paused").length,
        completedTaskCount: downtimeTasks.filter((task) => task.status === "completed").length,
        taskIds: downtimeTasks
          .map((task) => task.id)
          .filter((id): id is string => typeof id === "string")
          .slice(0, 50),
      },
      economy: {
        hasEconomyState: Boolean(economy),
        partyStashItemCount: partyStash.length,
        walletCount: Object.keys(wallets).length,
        shopCount: Object.keys(shops).length,
        craftingProgressCount: Object.keys(crafting).length,
        downtimeCompletionCount: Object.keys(downtimeCompletions).length,
      },
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
    const requests = Array.isArray(flags.p6CharacterTransferRequests) ? flags.p6CharacterTransferRequests : [];
    return requests
      .filter((request): request is Record<string, unknown> => Boolean(request) && typeof request === "object")
      .filter((request) =>
        typeof request.requestId === "string" &&
        typeof request.targetSessionId === "string" &&
        typeof request.sourceSessionId === "string" &&
        typeof request.sourceSessionCharacterId === "string" &&
        typeof request.requestedByUserId === "string" &&
        (request.status === "requested" || request.status === "approved" || request.status === "rejected") &&
        (request.mode === "clone" || request.mode === "transfer") &&
        typeof request.createdAt === "string",
      )
      .map((request) => ({
        requestId: request.requestId as string,
        targetSessionId: request.targetSessionId as string,
        sourceSessionId: request.sourceSessionId as string,
        sourceSessionCharacterId: request.sourceSessionCharacterId as string,
        requestedByUserId: request.requestedByUserId as string,
        status: request.status as "requested" | "approved" | "rejected",
        mode: request.mode as "clone" | "transfer",
        targetSessionCharacterId:
          typeof request.targetSessionCharacterId === "string" ? request.targetSessionCharacterId : null,
        sourceDisposition:
          request.sourceDisposition === "copied" || request.sourceDisposition === "retired_after_transfer"
            ? request.sourceDisposition
            : null,
        createdAt: request.createdAt as string,
        resolvedAt: typeof request.resolvedAt === "string" ? request.resolvedAt : null,
        note: typeof request.note === "string" ? request.note : null,
        approvedByUserId: typeof request.approvedByUserId === "string" ? request.approvedByUserId : null,
      }));
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(inventoryJson) as unknown;
    } catch {
      throw new ConflictException("이관 가능한 캐릭터 inventory 형식이 아닙니다.");
    }
    if (!Array.isArray(parsed)) {
      throw new ConflictException("이관 가능한 캐릭터 inventory 형식이 아닙니다.");
    }
    if (parsed.length > 100) {
      throw new ConflictException("캐릭터 이관 inventory는 100개 이하의 개인 소지품만 허용됩니다.");
    }
    const inventory = parsed.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ConflictException("이관 가능한 캐릭터 inventory 형식이 아닙니다.");
      }
      return item as Record<string, unknown>;
    });

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
    const calendar = flags.campaignCalendar;
    if (!calendar || typeof calendar !== "object") {
      return 0;
    }
    const tasks = (calendar as Record<string, unknown>).downtimeTasks;
    if (!Array.isArray(tasks)) {
      return 0;
    }
    return tasks.filter((task) => Boolean(task) && typeof task === "object" && (task as Record<string, unknown>).status === "completed").length;
  }

  private parseCampaignArchiveSnapshot(
    value: unknown,
    fallbackCombat: { turnLogCount: number; combatCount: number; nodeVisitCount: number },
  ): CampaignArchiveSnapshotDto {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        stateVersion: 0,
        currentNodeId: null,
        downtime: { activeTaskCount: 0, pausedTaskCount: 0, completedTaskCount: 0, taskIds: [] },
        economy: {
          hasEconomyState: false,
          partyStashItemCount: 0,
          walletCount: 0,
          shopCount: 0,
          craftingProgressCount: 0,
          downtimeCompletionCount: 0,
        },
        inventory: { totalItemCount: 0, characterInventoryCounts: {} },
        combat: fallbackCombat,
        publicRevisionLineage: null,
      };
    }
    const candidate = value as Record<string, unknown>;
    const downtime = candidate.downtime && typeof candidate.downtime === "object"
      ? (candidate.downtime as Record<string, unknown>)
      : {};
    const economy = candidate.economy && typeof candidate.economy === "object"
      ? (candidate.economy as Record<string, unknown>)
      : {};
    const inventory = candidate.inventory && typeof candidate.inventory === "object"
      ? (candidate.inventory as Record<string, unknown>)
      : {};
    const combat = candidate.combat && typeof candidate.combat === "object"
      ? (candidate.combat as Record<string, unknown>)
      : {};
    const inventoryCounts = inventory.characterInventoryCounts && typeof inventory.characterInventoryCounts === "object"
      ? Object.fromEntries(
          Object.entries(inventory.characterInventoryCounts as Record<string, unknown>)
            .filter(([key, count]) => key && typeof count === "number" && Number.isFinite(count)),
        ) as Record<string, number>
      : {};

    return {
      stateVersion: this.getNumberProperty(candidate, "stateVersion"),
      currentNodeId: typeof candidate.currentNodeId === "string" ? candidate.currentNodeId : null,
      downtime: {
        activeTaskCount: this.getNumberProperty(downtime, "activeTaskCount"),
        pausedTaskCount: this.getNumberProperty(downtime, "pausedTaskCount"),
        completedTaskCount: this.getNumberProperty(downtime, "completedTaskCount"),
        taskIds: Array.isArray(downtime.taskIds)
          ? downtime.taskIds.filter((id): id is string => typeof id === "string").slice(0, 50)
          : [],
      },
      economy: {
        hasEconomyState: economy.hasEconomyState === true,
        partyStashItemCount: this.getNumberProperty(economy, "partyStashItemCount"),
        walletCount: this.getNumberProperty(economy, "walletCount"),
        shopCount: this.getNumberProperty(economy, "shopCount"),
        craftingProgressCount: this.getNumberProperty(economy, "craftingProgressCount"),
        downtimeCompletionCount: this.getNumberProperty(economy, "downtimeCompletionCount"),
      },
      inventory: {
        totalItemCount: this.getNumberProperty(inventory, "totalItemCount"),
        characterInventoryCounts: inventoryCounts,
      },
      combat: {
        combatCount: this.getNumberProperty(combat, "combatCount") || fallbackCombat.combatCount,
        turnLogCount: this.getNumberProperty(combat, "turnLogCount") || fallbackCombat.turnLogCount,
        nodeVisitCount: this.getNumberProperty(combat, "nodeVisitCount") || fallbackCombat.nodeVisitCount,
      },
      publicRevisionLineage:
        candidate.publicRevisionLineage && typeof candidate.publicRevisionLineage === "object" && !Array.isArray(candidate.publicRevisionLineage)
          ? (candidate.publicRevisionLineage as Record<string, unknown>)
          : null,
    };
  }

  private countArchiveInventoryItems(inventoryJson: string | null | undefined): number {
    const items = this.parseJson<unknown[]>(inventoryJson, []);
    if (!Array.isArray(items)) {
      return 0;
    }
    return items.reduce<number>((sum, item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return sum;
      }
      const quantity = (item as Record<string, unknown>).quantity;
      return sum + (typeof quantity === "number" && Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 1);
    }, 0);
  }

  private extractPublicRevisionLineage(attribution: string | null): Record<string, unknown> | null {
    if (!attribution) {
      return null;
    }
    const marker = "P5_PUBLIC_META:";
    const markerIndex = attribution.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(attribution.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
      return parsed.lineage && typeof parsed.lineage === "object" && !Array.isArray(parsed.lineage)
        ? (parsed.lineage as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
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

  private isCampaignBoundTransferItem(item: Record<string, unknown>): boolean {
    const stringFlags = [
      item.ownerScope,
      item.scope,
      item.sourceScope,
      item.itemScope,
      item.transferScope,
      item.itemType,
      item.useEffect,
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());
    const tags = [...(Array.isArray(item.tags) ? item.tags : []), ...(Array.isArray(item.properties) ? item.properties : [])]
      .filter((value): value is string => typeof value === "string")
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
    if (!source || typeof source !== "object") {
      return 0;
    }
    const value = (source as Record<string, unknown>)[property];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
