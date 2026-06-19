import { Injectable, NotFoundException } from "@nestjs/common";
import { ActionOutcome as PrismaActionOutcome, Prisma, SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import {
  ActionOutcome,
  DiceAdvantageState,
  MainCommandCheckOptionDto,
  MainCommandStatus,
  TurnLogResponseDto,
  VttMapStateDto,
  VttObjectHazardDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionRevealService } from "./session-reveal.service";

export type SessionVttObjectRuntime = {
  prisma: PrismaService;
  realtimeEvents: RealtimeEventsService;
  sessionReveal: SessionRevealService;
  buildSnapshot: (...args: any[]) => any;
  clampNumber: (...args: any[]) => any;
  createSessionRevealRuntime: (...args: any[]) => any;
  getSessionEntityOrThrow: (...args: any[]) => any;
  getStringProperty: (...args: any[]) => any;
  getVttMapBaseline: (...args: any[]) => any;
  getVttMapForSessionScenario: (...args: any[]) => any;
  normalizeVttMap: (...args: any[]) => any;
  parseJson: (...args: any[]) => any;
  recordSessionReveal: (...args: any[]) => any;
  rectsOverlap: (...args: any[]) => any;
  refreshSessionInventorySnapshot: (...args: any[]) => any;
};

@Injectable()
export class SessionVttObjectRuntimeService {
  create(runtime: SessionVttObjectRuntime): SessionVttObjectRuntimeRunner {
    return new SessionVttObjectRuntimeRunner(runtime);
  }
}

export class SessionVttObjectRuntimeRunner {
  constructor(private readonly runtime: SessionVttObjectRuntime) {}

  private get prisma(): PrismaService {
    return this.runtime.prisma;
  }

  private get realtimeEvents(): RealtimeEventsService {
    return this.runtime.realtimeEvents;
  }

  private get sessionReveal(): SessionRevealService {
    return this.runtime.sessionReveal;
  }

  private buildSnapshot(...args: any[]): any {
    return this.runtime.buildSnapshot(...args);
  }

  private clampNumber(...args: any[]): any {
    return this.runtime.clampNumber(...args);
  }

  private createSessionRevealRuntime(...args: any[]): any {
    return this.runtime.createSessionRevealRuntime(...args);
  }

  private getSessionEntityOrThrow(...args: any[]): any {
    return this.runtime.getSessionEntityOrThrow(...args);
  }

  private getStringProperty(...args: any[]): string | null {
    return this.runtime.getStringProperty(...args) as string | null;
  }

  private getVttMapBaseline(...args: any[]): Promise<VttMapStateDto> {
    return this.runtime.getVttMapBaseline(...args) as Promise<VttMapStateDto>;
  }

  private getVttMapForSessionScenario(...args: any[]): Promise<VttMapStateDto> {
    return this.runtime.getVttMapForSessionScenario(...args) as Promise<VttMapStateDto>;
  }

  private normalizeVttMap(...args: any[]): VttMapStateDto {
    return this.runtime.normalizeVttMap(...args) as VttMapStateDto;
  }

  private parseJson<T>(...args: any[]): T {
    return this.runtime.parseJson(...args) as T;
  }

  private recordSessionReveal(...args: any[]): any {
    return this.runtime.recordSessionReveal(...args);
  }

  private rectsOverlap(...args: any[]): boolean {
    return this.runtime.rectsOverlap(...args) as boolean;
  }

  private refreshSessionInventorySnapshot(...args: any[]): any {
    return this.runtime.refreshSessionInventorySnapshot(...args);
  }

  async describeVttObjectAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{ message: string; checkOptions?: MainCommandCheckOptionDto[] } | null> {
    const map = await this.getVttMapForSessionScenario(params.sessionId, params.sessionScenarioId);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || objectCell.visibleToPlayers === false) {
      return null;
    }

    const name = objectCell.name?.trim() || "오브젝트";
    const description = objectCell.description?.trim() || "겉으로 드러난 추가 설명은 없습니다.";
    if (await this.isVttObjectHiddenContentExhausted(params.sessionId, params.sessionScenarioId, objectCell)) {
      return { message: "여기에는 더 숨겨진 것이 없습니다." };
    }

    const revealCheck = this.getFirstVttObjectRevealCheck(objectCell);
    if (revealCheck) {
      return {
        message: `${name}을(를) 자세히 조사하려면 판정이 필요합니다.`,
        checkOptions: [
          {
            ...(revealCheck.ability ? { ability: revealCheck.ability } : {}),
            ...(revealCheck.skill ? { skill: revealCheck.skill } : {}),
            dc: revealCheck.dc,
            reason: `${name} 조사`,
          },
        ],
      };
    }
    return { message: `${name}: ${description}` };
  }

  async revealVttObjectContentsAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    sessionCharacterId?: string | null;
    turnLogId?: string | null;
    revealedBy?: string;
    checkOption?: MainCommandCheckOptionDto | null;
  }): Promise<{
    count: number;
    revealedClues: Array<{ id: string; title: string; text: string | null }>;
    revealedItems: Array<{ id: string; name: string; quantity: number; description: string | null }>;
  }> {
    const map = await this.getVttMapForSessionScenario(params.sessionId, params.sessionScenarioId);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || objectCell.visibleToPlayers === false) {
      return { count: 0, revealedClues: [], revealedItems: [] };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const clueSnapshots = await this.getCurrentNodeClueSnapshots(tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
      });
      const hiddenItemIds = (objectCell.hiddenItemIds ?? []).map((contentId) => contentId.trim()).filter((contentId) => contentId);
      const itemDefinitions = hiddenItemIds.length
        ? await tx.itemDefinition.findMany({
            where: {
              OR: [{ id: { in: hiddenItemIds } }, { name: { in: hiddenItemIds } }],
            },
            select: { id: true, name: true, description: true },
          })
        : [];
      const itemDefinitionByLookup = new Map<string, { id: string; name: string; description: string | null }>();
      itemDefinitions.forEach((itemDefinition) => {
        itemDefinitionByLookup.set(itemDefinition.id, itemDefinition);
        itemDefinitionByLookup.set(itemDefinition.name, itemDefinition);
      });
      const revealInputs: Array<{
        contentId: string;
        contentKind: "clue" | "item" | "event";
        snapshot: Record<string, unknown>;
      }> = this.getVttObjectHiddenContentKeys(objectCell)
        .map((item) => {
          if (item.contentKind === "clue") {
            return {
              ...item,
              snapshot: clueSnapshots.get(item.contentId) ?? { id: item.contentId },
            };
          }
          if (item.contentKind === "item") {
            const itemDefinition = itemDefinitionByLookup.get(item.contentId);
            return {
              ...item,
              snapshot: {
                id: itemDefinition?.id ?? item.contentId,
                name: itemDefinition?.name ?? item.contentId,
                sourceObjectId: objectCell.id,
              },
            };
          }
          return {
            ...item,
            snapshot: { id: item.contentId, sourceObjectId: objectCell.id },
          };
        })
        .filter((item) => item.contentId.trim());
      const revealChecks = this.getVttObjectRevealChecks(objectCell);
      const filteredRevealInputs = revealInputs.filter((item) => this.canRevealVttObjectContentByCheck(item.contentId, revealChecks, params.checkOption));
      const existingReveals = filteredRevealInputs.length
        ? await tx.sessionReveal.findMany({
            where: {
              sessionScenarioId: params.sessionScenarioId,
              scope: "party",
              recipientKey: "party",
              OR: filteredRevealInputs.map((item) => ({
                contentId: item.contentId,
                contentKind: item.contentKind,
              })),
            },
            select: {
              contentId: true,
              contentKind: true,
            },
          })
        : [];
      const existingRevealKeys = new Set(existingReveals.map((reveal) => `${reveal.contentKind}:${reveal.contentId}`));
      const newRevealInputs = filteredRevealInputs.filter((item) => !existingRevealKeys.has(`${item.contentKind}:${item.contentId}`));
      const revealedItemCandidates = filteredRevealInputs
        .filter((item) => item.contentKind === "item")
        .map((item) => {
          const itemDefinition = itemDefinitionByLookup.get(item.contentId);
          return itemDefinition ? { contentId: item.contentId, itemDefinition } : null;
        })
        .filter(
          (
            item,
          ): item is {
            contentId: string;
            itemDefinition: { id: string; name: string; description: string | null };
          } => Boolean(item),
        );
      const partyOwnedItemDefinitionIds =
        params.sessionCharacterId && revealedItemCandidates.length
          ? await this.getPartyInventoryItemDefinitionIds(
              tx,
              params.sessionId,
              revealedItemCandidates.map((item) => item.itemDefinition.id),
            )
          : new Set<string>();
      const newRevealKeys = new Set(newRevealInputs.map((item) => `${item.contentKind}:${item.contentId}`));
      const grantItemCandidates = revealedItemCandidates.filter(
        (item) => newRevealKeys.has(`item:${item.contentId}`) || !partyOwnedItemDefinitionIds.has(item.itemDefinition.id),
      );

      await Promise.all(
        newRevealInputs.map((item) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId: item.contentId,
            contentKind: item.contentKind,
            scope: "party",
            revealedBy: params.revealedBy ?? "system",
            reason: "vtt_object_investigation",
            turnLogId: params.turnLogId,
            snapshot: item.snapshot,
          }),
        ),
      );
      if (params.sessionCharacterId && grantItemCandidates.length) {
        await tx.inventoryEntry.createMany({
          data: grantItemCandidates.map(({ itemDefinition }) => ({
            sessionCharacterId: params.sessionCharacterId!,
            itemDefinitionId: itemDefinition.id,
            quantity: 1,
          })),
        });
      }
      const recoveredItemCount = grantItemCandidates.filter((item) => existingRevealKeys.has(`item:${item.contentId}`)).length;

      return {
        count: newRevealInputs.length + recoveredItemCount,
        revealedClues: newRevealInputs
          .filter((item) => item.contentKind === "clue")
          .map((item) => this.sessionReveal.toRevealClueSummary(this.createSessionRevealRuntime(), item.contentId, item.snapshot)),
        revealedItems: grantItemCandidates.map(({ itemDefinition }) => ({
          id: itemDefinition.id,
          name: itemDefinition.name,
          quantity: 1,
          description: itemDefinition.description,
        })),
      };
    });
    if (params.sessionCharacterId && result.revealedItems.length) {
      await this.refreshSessionInventorySnapshot(params.sessionCharacterId);
    }
    return result;
  }

  async revealObservableVttObjectsInPartyVision(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    visionRangeFeet?: number;
  }): Promise<{ count: number; objectNames: string[] }> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return { count: 0, objectNames: [] };
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCells = map.objectCells ?? [];
    const partyTokens = map.tokens.filter((token) => token.sessionCharacterId && token.hidden !== true && token.isHostile !== true);
    if (!objectCells.length || !partyTokens.length) {
      return { count: 0, objectNames: [] };
    }

    const visionRangeFeet = params.visionRangeFeet ?? 40;
    const observableObjectIds = new Set<string>();
    const objectNames: string[] = [];
    for (const objectCell of objectCells) {
      if (this.isVttObjectObserved(objectCell)) {
        continue;
      }
      if (!this.hasDiscoverableVttObjectContent(objectCell)) {
        continue;
      }
      if (!this.isVttObjectInPartyVision(map, objectCell, partyTokens, visionRangeFeet)) {
        continue;
      }

      observableObjectIds.add(objectCell.id);
      objectNames.push(objectCell.name?.trim() || "수상한 오브젝트");
    }

    if (!observableObjectIds.size) {
      return { count: 0, objectNames: [] };
    }

    const nextMap = this.normalizeVttMap(
      {
        ...map,
        objectCells: objectCells.map((objectCell) =>
          observableObjectIds.has(objectCell.id)
            ? {
                ...objectCell,
                visibleToPlayers: true,
                observedBySessionCharacterIds: Array.from(new Set([...(objectCell.observedBySessionCharacterIds ?? []), "party"])),
              }
            : objectCell,
        ),
      },
      state.currentNodeId ?? null,
    );
    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: nextMap,
        }),
      },
    });

    const session = await this.getSessionEntityOrThrow(params.sessionId);
    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: nextMap,
      playerMap: this.redactVttMapForPlayer(nextMap),
    });

    return { count: observableObjectIds.size, objectNames };
  }

  async openVttDoorAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    itemId?: string | null;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    const result = await this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 지나갈 수 있습니다.` };
      }
      if (door.state === "locked") {
        const requiredKeyId = door.keyItemId?.trim() || null;
        const providedItemId = params.itemId?.trim() || null;
        if (requiredKeyId && providedItemId !== requiredKeyId) {
          return {
            door,
            status: MainCommandStatus.IMPOSSIBLE,
            message: `${doorName}은 잠겨 있습니다. 맞는 열쇠가 필요합니다.`,
          };
        }
        if (!requiredKeyId || !providedItemId) {
          return {
            door,
            status: MainCommandStatus.CHECK_REQUIRED,
            message: `${doorName}은 잠겨 있습니다. 자물쇠를 열려면 판정이 필요합니다.`,
            checkOptions: [{ skill: "sleight_of_hand", dc: 15, reason: "잠긴 문 해제" }],
            checkEffect: this.buildVttDoorCheckEffect(door, params, "open"),
          };
        }
      }

      return {
        door: { ...door, state: "open" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 열었습니다.`,
      };
    });

    return result
      ? {
          status: result.status,
          message: result.message,
          checkOptions: result.checkOptions,
          checkEffect: result.checkEffect,
        }
      : null;
  }

  async closeVttDoorAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
  } | null> {
    return this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "closed") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 닫혀 있습니다.` };
      }
      if (door.state === "locked") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 잠겨 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.IMPOSSIBLE, message: `${doorName}은 파괴되어 닫을 수 없습니다.` };
      }

      return {
        door: { ...door, state: "closed" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 닫았습니다.`,
      };
    });
  }

  async triggerVttObjectEventAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    includeHiddenObject?: boolean;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
  }> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드와 다른 오브젝트 이벤트는 실행할 수 없습니다.",
      };
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || (!params.includeHiddenObject && objectCell.visibleToPlayers === false)) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "실행할 오브젝트 이벤트를 현재 맵에서 찾을 수 없습니다.",
      };
    }

    const events = (objectCell.events ?? []).filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY");
    if (!events.length || !map.fogRects.length) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${objectCell.name?.trim() || "오브젝트"}에는 지금 실행할 수 있는 이벤트가 없습니다.`,
      };
    }

    const revealEvent = events[0];
    const revealRadiusFeet = this.clampNumber(Number(revealEvent.effect?.revealRadiusFeet), 5, 500);
    const revealBox = this.buildFogRevealBoxForObject(map, objectCell, revealRadiusFeet);
    const nextFogRects = map.fogRects.flatMap((rect) => this.subtractFogBox(rect, revealBox)).slice(0, 200);
    if (JSON.stringify(nextFogRects) === JSON.stringify(map.fogRects)) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${objectCell.name?.trim() || "오브젝트"} 주변에는 추가로 공개할 안개 영역이 없습니다.`,
      };
    }

    const nextMap = this.normalizeVttMap(
      {
        ...map,
        fogRects: nextFogRects,
        updatedAt: new Date().toISOString(),
      },
      state.currentNodeId ?? null,
    );
    await this.prisma.$transaction(async (tx) => {
      await this.recordSessionReveal(tx, {
        sessionScenarioId: params.sessionScenarioId,
        contentId: revealEvent.id,
        contentKind: "event",
        scope: "party",
        revealedBy: "player",
        reason: "vtt_object_manual_trigger",
        snapshot: {
          id: revealEvent.id,
          name: revealEvent.name ?? null,
          type: revealEvent.type,
          sourceObjectId: objectCell.id,
          sourceObjectName: objectCell.name ?? null,
          currentNodeId: state.currentNodeId,
          trigger: revealEvent.trigger,
          effect: revealEvent.effect,
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });
    });

    const session = await this.getSessionEntityOrThrow(params.sessionId);
    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: nextMap,
      playerMap: this.redactVttMapForPlayer(nextMap),
    });
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.buildSnapshot(session.id));

    return {
      status: MainCommandStatus.RESOLVED,
      message: `${objectCell.name?.trim() || "오브젝트"}의 이벤트를 실행해 주변 영역을 공개했습니다.`,
    };
  }

  async breakVttDoorAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 있습니다.` };
      }
      if (!door.canBreak) {
        return {
          door,
          status: MainCommandStatus.IMPOSSIBLE,
          message: `${doorName}은 현재 방식으로 부수기 어렵습니다.`,
        };
      }
      if (door.breakCheckDc) {
        return {
          door,
          status: MainCommandStatus.CHECK_REQUIRED,
          message: `${doorName}을 부수려면 DC ${door.breakCheckDc} 판정이 필요합니다.`,
          checkOptions: [{ ability: "str", dc: door.breakCheckDc, reason: "문 파괴" }],
          checkEffect: this.buildVttDoorCheckEffect(door, params, "broken"),
        };
      }

      return {
        door: { ...door, state: "broken" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 부쉈습니다.`,
      };
    });
  }

  async applyVttDoorCheckSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    doorId: string;
    nodeId: string;
    effect: "open" | "broken";
  }): Promise<{ status: MainCommandStatus; message: string }> {
    const result = await this.updateVttDoorById(params, (door) => {
      const doorName = door.name?.trim() || "문";
      if (params.effect === "open") {
        if (door.state === "open") {
          return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
        }
        return {
          door: { ...door, state: "open" as const },
          status: MainCommandStatus.RESOLVED,
          message: `판정에 성공해 ${doorName}을 열었습니다.`,
        };
      }

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 있습니다.` };
      }
      return {
        door: { ...door, state: "broken" as const },
        status: MainCommandStatus.RESOLVED,
        message: `판정에 성공해 ${doorName}을 부쉈습니다.`,
      };
    });

    return (
      result ?? {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "판정 대상 문을 현재 맵에서 찾을 수 없습니다.",
      }
    );
  }

  async disarmVttHazardAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드와 다른 함정은 해제할 수 없습니다.",
      };
    }

    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const hazardCell = this.findVttObjectAtPoint(map, params.mapPoint);
    const hazard = hazardCell?.hazard;
    if (!hazardCell || !hazard) {
      return null;
    }

    const hazardName = hazardCell.name?.trim() || this.getHazardKindLabel(hazard.kind);
    if (hazard.armed === false) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${hazardName}은 이미 해제되어 있습니다.`,
      };
    }
    if (!this.isVttHazardDetected(hazard)) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${hazardName}의 정확한 구조를 아직 파악하지 못했습니다. 먼저 위험을 탐지해야 합니다.`,
      };
    }

    const dc = this.clampNumber(Number(hazard.detectionDc) || 15, 5, 30);
    return {
      status: MainCommandStatus.CHECK_REQUIRED,
      message: `${hazardName}을 해제하려면 판정이 필요합니다.`,
      checkOptions: [{ skill: "sleight_of_hand", dc, reason: "함정 해제" }],
      checkEffect: this.buildVttHazardCheckEffect(hazardCell, params, "disarm"),
    };
  }

  async applyVttHazardDisarmSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    hazardId: string;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    const result = await this.updateVttHazardById(params, (cell) => {
      const hazardName = cell.name?.trim() || this.getHazardKindLabel(cell.hazard?.kind ?? "TRAP");
      if (!cell.hazard) {
        return {
          cell,
          status: MainCommandStatus.IMPOSSIBLE,
          message: "판정 대상 함정을 현재 맵에서 찾을 수 없습니다.",
        };
      }
      if (cell.hazard.armed === false) {
        return {
          cell,
          status: MainCommandStatus.MESSAGE,
          message: `${hazardName}은 이미 해제되어 있습니다.`,
        };
      }
      return {
        cell: {
          ...cell,
          hazard: {
            ...cell.hazard,
            armed: false,
            attemptedBySessionCharacterIds: [],
            detectedBySessionCharacterIds: [],
          },
        },
        status: MainCommandStatus.RESOLVED,
        message: `판정에 성공해 ${hazardName}을 해제했습니다. 맵의 위험 표시가 제거됩니다.`,
      };
    });

    return (
      result ?? {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "판정 대상 함정을 현재 맵에서 찾을 수 없습니다.",
      }
    );
  }

  async applyVttObjectProximityEvents(params: { sessionScenarioId: string; currentNodeId: string | null; map: VttMapStateDto }): Promise<VttMapStateDto> {
    const objectCells = params.map.objectCells ?? [];
    const candidates = objectCells.flatMap((objectCell) =>
      (objectCell.events ?? []).filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY").map((event) => ({ objectCell, event })),
    );
    if (!candidates.length || !params.map.fogRects.length) {
      return params.map;
    }

    const onceEventIds = candidates.filter(({ event }) => event.trigger.once !== false).map(({ event }) => event.id);
    const revealedEventIds = onceEventIds.length
      ? new Set(
          (
            await this.prisma.sessionReveal.findMany({
              where: {
                sessionScenarioId: params.sessionScenarioId,
                contentKind: "event",
                contentId: { in: onceEventIds },
              },
              select: { contentId: true },
            })
          ).map((reveal) => reveal.contentId),
        )
      : new Set<string>();

    const partyTokens = params.map.tokens.filter((token) => token.sessionCharacterId && token.hidden !== true && token.isHostile !== true);
    if (!partyTokens.length) {
      return params.map;
    }

    let fogRects = params.map.fogRects;
    const triggeredEvents: Array<{
      objectCell: NonNullable<VttMapStateDto["objectCells"]>[number];
      event: NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["events"]>[number];
    }> = [];

    for (const { objectCell, event } of candidates) {
      if (objectCell.visibleToPlayers === false || revealedEventIds.has(event.id)) {
        continue;
      }

      const triggerDistanceFeet = this.clampNumber(Number(event.trigger?.distanceFeet), 0, 500);
      const isNear = partyTokens.some(
        (token) => this.calculatePointToRectDistanceFeet(params.map, this.getTokenCenter(token), objectCell) <= triggerDistanceFeet,
      );
      if (!isNear) {
        continue;
      }

      const revealRadiusFeet = this.clampNumber(Number(event.effect?.revealRadiusFeet), 5, 500);
      const revealBox = this.buildFogRevealBoxForObject(params.map, objectCell, revealRadiusFeet);
      const nextFogRects = fogRects.flatMap((rect) => this.subtractFogBox(rect, revealBox)).slice(0, 200);
      if (JSON.stringify(nextFogRects) === JSON.stringify(fogRects)) {
        continue;
      }

      fogRects = nextFogRects;
      triggeredEvents.push({ objectCell, event });
    }

    if (!triggeredEvents.length) {
      return params.map;
    }

    await this.prisma.$transaction((tx) =>
      Promise.all(
        triggeredEvents.map(({ objectCell, event }) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId: event.id,
            contentKind: "event",
            scope: "party",
            revealedBy: "system",
            reason: "vtt_object_proximity",
            snapshot: {
              id: event.id,
              name: event.name ?? null,
              type: event.type,
              sourceObjectId: objectCell.id,
              sourceObjectName: objectCell.name ?? null,
              currentNodeId: params.currentNodeId,
              trigger: event.trigger,
              effect: event.effect,
            },
          }),
        ),
      ),
    );

    return {
      ...params.map,
      fogRects,
      updatedAt: new Date().toISOString(),
    };
  }

  async applyVttHazardDetections(params: {
    sessionId: string;
    sessionScenarioId: string;
    currentNodeId: string | null;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<VttMapStateDto> {
    if (!params.currentNodeId) {
      return params.map;
    }

    const objectCells = params.map.objectCells ?? [];
    const hazardCells = objectCells.filter((cell) => cell.hazard && cell.hazard.armed !== false);
    if (!hazardCells.length) {
      return params.map;
    }

    const movedTokenIds = new Set(
      params.map.tokens
        .filter((token) => {
          if (!token.sessionCharacterId || token.hidden === true || token.isHostile === true) {
            return false;
          }
          const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
          return Boolean(previousToken && (previousToken.x !== token.x || previousToken.y !== token.y));
        })
        .map((token) => token.id),
    );
    if (!movedTokenIds.size) {
      return params.map;
    }

    const partyTokens = params.map.tokens.filter((token) => movedTokenIds.has(token.id));
    if (!partyTokens.length) {
      return params.map;
    }

    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId: params.sessionId,
        id: { in: partyTokens.map((token) => token.sessionCharacterId as string) },
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
    });
    const characterBySessionId = new Map(sessionCharacters.map((entry) => [entry.id, entry]));

    let objectCellsChanged = false;
    const nextObjectCells = [...objectCells];

    for (let index = 0; index < nextObjectCells.length; index += 1) {
      const objectCell = nextObjectCells[index];
      const hazard = objectCell.hazard;
      if (!hazard || hazard.armed === false) {
        continue;
      }

      const detectionRadiusFeet = this.clampNumber(Number(hazard.detectionRadiusCells) || 3, 1, 20) * 5;
      const attempted = new Set(hazard.attemptedBySessionCharacterIds ?? []);
      const detected = new Set(hazard.detectedBySessionCharacterIds ?? []);
      const alreadyDetected = hazard.triggerOnce !== false && detected.size > 0;
      if (alreadyDetected) {
        continue;
      }

      for (const token of partyTokens) {
        const sessionCharacterId = token.sessionCharacterId;
        if (!sessionCharacterId || attempted.has(sessionCharacterId) || detected.has(sessionCharacterId)) {
          continue;
        }
        const distanceFeet = this.calculatePointToRectDistanceFeet(params.map, this.getTokenCenter(token), objectCell);
        if (distanceFeet > detectionRadiusFeet) {
          continue;
        }
        const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
        const previousDistanceFeet = previousToken
          ? this.calculatePointToRectDistanceFeet(params.previousMap, this.getTokenCenter(previousToken), objectCell)
          : Number.POSITIVE_INFINITY;
        if (previousDistanceFeet <= detectionRadiusFeet) {
          continue;
        }

        const sessionCharacter = characterBySessionId.get(sessionCharacterId);
        if (!sessionCharacter) {
          continue;
        }

        const check = this.rollHazardDetection(sessionCharacter.character);
        const detectionDc = this.clampNumber(Number(hazard.detectionDc) || 12, 1, 40);
        const success = check.total >= detectionDc;
        attempted.add(sessionCharacterId);
        if (success) {
          detected.add(sessionCharacterId);
        }

        const turnLog = await this.createAutoHazardTurnLog({
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          sessionCharacterId,
          characterName: sessionCharacter.character.name,
          hazardId: objectCell.id,
          hazardName: objectCell.name ?? null,
          hazardKind: hazard.kind,
          detectionDc,
          distanceFeet,
          detectionRadiusFeet,
          check,
          success,
          linkedClueIds: [],
        });

        this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);
        break;
      }

      const nextHazard = {
        ...hazard,
        attemptedBySessionCharacterIds: Array.from(attempted).slice(0, 80),
        detectedBySessionCharacterIds: Array.from(detected).slice(0, 80),
      };
      if (JSON.stringify(nextHazard) !== JSON.stringify(hazard)) {
        nextObjectCells[index] = { ...objectCell, hazard: nextHazard };
        objectCellsChanged = true;
      }
    }

    if (!objectCellsChanged) {
      return params.map;
    }

    return {
      ...params.map,
      objectCells: nextObjectCells,
      updatedAt: new Date().toISOString(),
    };
  }

  private rollHazardDetection(character: { abilitiesJson: string; proficiencyBonus: number; proficientSkillsJson: string }): {
    expression: string;
    roll: number;
    modifier: number;
    total: number;
    skill: string;
    ability: string;
  } {
    const abilities = this.parseJson<Record<string, number>>(character.abilitiesJson, {});
    const wis = Number(abilities.wis) || 10;
    const abilityModifier = Math.floor((wis - 10) / 2);
    const proficientSkills = this.parseJson<string[]>(character.proficientSkillsJson, []);
    const hasPerception = proficientSkills.some((skill) => {
      const normalized = skill.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
      return normalized === "perception" || normalized === "감지";
    });
    const modifier = abilityModifier + (hasPerception ? character.proficiencyBonus : 0);
    const roll = Math.floor(Math.random() * 20) + 1;
    return {
      expression: `1d20${modifier >= 0 ? "+" : ""}${modifier}`,
      roll,
      modifier,
      total: roll + modifier,
      skill: "perception",
      ability: "wis",
    };
  }

  private async createAutoHazardTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    sessionCharacterId: string;
    characterName: string;
    hazardId: string;
    hazardName: string | null;
    hazardKind: "TRAP" | "AMBUSH" | "HAZARD";
    detectionDc: number;
    distanceFeet: number;
    detectionRadiusFeet: number;
    check: { expression: string; roll: number; modifier: number; total: number; skill: string; ability: string };
    success: boolean;
    linkedClueIds: string[];
  }): Promise<TurnLogResponseDto> {
    const lastTurn = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;
    const hazardLabel = params.hazardName?.trim() || this.getHazardKindLabel(params.hazardKind);
    const narration = params.success
      ? `${params.characterName}은(는) 발걸음을 늦추고 ${hazardLabel} 주변의 어긋난 흔적을 알아차립니다. 위험 위치가 맵에 표시됩니다.`
      : `${params.characterName}은(는) 주변을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
    const structuredAction = {
      type: "auto_hazard_detection",
      intent: "DETECT_DANGER",
      hazardId: params.hazardId,
      hazardName: params.hazardName,
      hazardKind: params.hazardKind,
      detectionDc: params.detectionDc,
      distanceFeet: params.distanceFeet,
      detectionRadiusFeet: params.detectionRadiusFeet,
      linkedClueIds: params.linkedClueIds,
    };
    const diceResult = {
      expression: params.check.expression,
      rolls: [params.check.roll],
      modifier: params.check.modifier,
      total: params.check.total,
      dc: params.detectionDc,
      ability: params.check.ability,
      skill: params.check.skill,
      outcome: params.success ? "SUCCESS" : "FAILURE",
    };
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: null,
        actorUserId: null,
        sessionCharacterId: params.sessionCharacterId,
        turnNumber,
        rawInput: "[자동 위험탐지]",
        structuredActionJson: JSON.stringify(structuredAction),
        diceResultJson: JSON.stringify(diceResult),
        stateDiffJson: null,
        outcome: params.success ? PrismaActionOutcome.SUCCESS : PrismaActionOutcome.FAILURE,
        narration,
      },
    });

    return {
      turnLogId: created.id,
      turnNumber: created.turnNumber,
      playerActionId: created.playerActionId,
      actorUserId: created.actorUserId,
      sessionCharacterId: created.sessionCharacterId,
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      actionQueueStatus: null,
      rawInput: created.rawInput,
      structuredAction,
      diceResult,
      stateDiff: null,
      outcome: params.success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async applyVttHazardTriggers(params: {
    sessionId: string;
    sessionScenarioId: string;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<{ map: VttMapStateDto; triggered: boolean }> {
    const objectCells = params.map.objectCells ?? [];
    const hazardCells = objectCells.filter((cell) => cell.hazard && cell.hazard.armed !== false);
    if (!hazardCells.length) {
      return { map: params.map, triggered: false };
    }

    const movedTokens = params.map.tokens
      .map((token) => {
        const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
        if (!previousToken || !token.sessionCharacterId || token.hidden === true) {
          return null;
        }
        if (previousToken.x === token.x && previousToken.y === token.y) {
          return null;
        }
        return { token, previousToken };
      })
      .filter((entry): entry is { token: VttMapStateDto["tokens"][number]; previousToken: VttMapStateDto["tokens"][number] } => Boolean(entry));

    if (!movedTokens.length) {
      return { map: params.map, triggered: false };
    }

    const nextObjectCells = [...objectCells];
    let objectCellsChanged = false;
    let triggered = false;

    for (const { token, previousToken } of movedTokens) {
      const sessionCharacterId = token.sessionCharacterId;
      if (!sessionCharacterId) {
        continue;
      }

      const hazardIndex = nextObjectCells.findIndex((cell) => {
        const hazard = cell.hazard;
        return Boolean(hazard && hazard.armed !== false && this.doesTokenMovementCrossCell(params.map, previousToken, token, cell));
      });
      if (hazardIndex < 0) {
        continue;
      }

      const hazardCell = nextObjectCells[hazardIndex];
      const hazard = hazardCell.hazard;
      if (!hazard) {
        continue;
      }

      const character = await this.prisma.sessionCharacter.findUnique({
        where: { id: sessionCharacterId },
        include: { character: true },
      });
      if (!character || character.sessionId !== params.sessionId || character.status !== PrismaSessionCharacterStatus.ACTIVE) {
        continue;
      }

      const damage = this.rollVttHazardDamage(hazard.kind);
      const nextHp = this.clampNumber(character.currentHp - damage.total, 0, character.character.maxHp);
      const nextStatus = nextHp > 0 ? PrismaSessionCharacterStatus.ACTIVE : PrismaSessionCharacterStatus.DEAD;
      await this.prisma.sessionCharacter.update({
        where: { id: character.id },
        data: {
          currentHp: nextHp,
          status: nextStatus,
        },
      });

      const hazardName = hazardCell.name?.trim() || this.getHazardKindLabel(hazard.kind);
      await this.createVttHazardTriggerTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        sessionCharacterId,
        characterName: character.character.name,
        hazardId: hazardCell.id,
        hazardName,
        hazardKind: hazard.kind,
        damage,
        currentHp: nextHp,
        maxHp: character.character.maxHp,
      });

      const nextHazard = {
        ...hazard,
        armed: hazard.triggerOnce === false,
        attemptedBySessionCharacterIds: [],
        detectedBySessionCharacterIds: [],
      };
      nextObjectCells[hazardIndex] = { ...hazardCell, hazard: nextHazard };
      objectCellsChanged = true;
      triggered = true;
    }

    if (!objectCellsChanged) {
      return { map: params.map, triggered };
    }

    return {
      map: {
        ...params.map,
        objectCells: nextObjectCells,
        updatedAt: new Date().toISOString(),
      },
      triggered,
    };
  }

  private rollVttHazardDamage(kind: "TRAP" | "AMBUSH" | "HAZARD"): {
    expression: string;
    rolls: number[];
    modifier: number;
    total: number;
    damageType: string;
  } {
    const damageType = kind === "HAZARD" ? "bludgeoning" : "piercing";
    const roll = Math.floor(Math.random() * 6) + 1;
    return {
      expression: "1d6",
      rolls: [roll],
      modifier: 0,
      total: roll,
      damageType,
    };
  }

  private async createVttHazardTriggerTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    sessionCharacterId: string;
    characterName: string;
    hazardId: string;
    hazardName: string;
    hazardKind: "TRAP" | "AMBUSH" | "HAZARD";
    damage: { expression: string; rolls: number[]; modifier: number; total: number; damageType: string };
    currentHp: number;
    maxHp: number;
  }): Promise<void> {
    const lastTurn = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;
    const narration = `${params.characterName}이(가) ${params.hazardName}을(를) 밟았습니다. 함정이 발동해 ${params.damage.total} 피해를 입었습니다.`;
    const structuredAction = {
      type: "vtt_hazard_trigger",
      hazardId: params.hazardId,
      hazardName: params.hazardName,
      hazardKind: params.hazardKind,
      damageType: params.damage.damageType,
      damageTotal: params.damage.total,
    };
    const diceResult = {
      expression: params.damage.expression,
      rolls: params.damage.rolls,
      modifier: params.damage.modifier,
      total: params.damage.total,
      advantageState: DiceAdvantageState.NORMAL,
      damageType: params.damage.damageType,
      outcome: "SUCCESS",
    };
    const stateDiff = {
      reason: "vtt_hazard_trigger",
      diff: {
        characters: [
          {
            id: params.sessionCharacterId,
            currentHp: params.currentHp,
            maxHp: params.maxHp,
          },
        ],
      },
    };
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: null,
        actorUserId: null,
        sessionCharacterId: params.sessionCharacterId,
        turnNumber,
        rawInput: "[함정 발동]",
        structuredActionJson: JSON.stringify(structuredAction),
        diceResultJson: JSON.stringify(diceResult),
        stateDiffJson: JSON.stringify(stateDiff),
        outcome: PrismaActionOutcome.SUCCESS,
        narration,
      },
    });

    this.realtimeEvents.emitTurnLogCreated(params.sessionId, {
      turnLogId: created.id,
      turnNumber: created.turnNumber,
      playerActionId: created.playerActionId,
      actorUserId: created.actorUserId,
      sessionCharacterId: created.sessionCharacterId,
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      actionQueueStatus: null,
      rawInput: created.rawInput,
      structuredAction,
      diceResult,
      stateDiff,
      outcome: ActionOutcome.SUCCESS,
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    });
    this.realtimeEvents.emitDiceRolled(params.sessionId, diceResult);
  }

  private doesTokenMovementCrossCell(
    map: VttMapStateDto,
    previousToken: VttMapStateDto["tokens"][number],
    token: VttMapStateDto["tokens"][number],
    cell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): boolean {
    const from = this.getTokenCenter(previousToken);
    const to = this.getTokenCenter(token);
    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distancePx / Math.max(8, map.gridSize / 2)));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      const center = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
      const tokenRect = {
        x: center.x - token.size / 2,
        y: center.y - token.size / 2,
        width: token.size,
        height: token.size,
      };
      const shapeCells = cell.shapeCells?.length ? cell.shapeCells : [cell];
      if (shapeCells.some((shapeCell) => this.rectsOverlap(tokenRect, shapeCell))) {
        return true;
      }
    }
    return false;
  }

  private async revealHazardLinkedClues(params: {
    sessionScenarioId: string;
    nodeId: string;
    clueIds: string[];
    hazardId: string;
    hazardName: string | null;
    turnLogId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const clueSnapshots = await this.getCurrentNodeClueSnapshots(tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
      });
      await Promise.all(
        params.clueIds.map((contentId) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId,
            contentKind: "clue",
            scope: "party",
            revealedBy: "system",
            reason: "auto_hazard_detection",
            turnLogId: params.turnLogId,
            snapshot: {
              ...(clueSnapshots.get(contentId) ?? { id: contentId }),
              sourceHazardId: params.hazardId,
              sourceHazardName: params.hazardName,
            },
          }),
        ),
      );
    });
  }

  private getHazardKindLabel(kind: "TRAP" | "AMBUSH" | "HAZARD"): string {
    switch (kind) {
      case "AMBUSH":
        return "매복";
      case "HAZARD":
        return "위험 요소";
      case "TRAP":
      default:
        return "함정";
    }
  }

  private normalizeHazardKind(value: unknown): "TRAP" | "AMBUSH" | "HAZARD" {
    return value === "AMBUSH" || value === "HAZARD" ? value : "TRAP";
  }

  private async updateVttDoorAtPoint(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      mapPoint: { x: number; y: number };
    },
    updateDoor: (door: NonNullable<VttMapStateDto["doorCells"]>[number]) => {
      door: NonNullable<VttMapStateDto["doorCells"]>[number];
      status: MainCommandStatus;
      message: string;
      checkOptions?: MainCommandCheckOptionDto[];
      checkEffect?: Record<string, unknown>;
    },
  ): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const doorCells = map.doorCells ?? [];
    const doorIndex = doorCells.findIndex((door) => this.isPointInVttCell(params.mapPoint, door));
    if (doorIndex < 0) {
      return null;
    }

    const result = updateDoor(doorCells[doorIndex]);
    if (result.door !== doorCells[doorIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          doorCells: doorCells.map((door, index) => (index === doorIndex ? result.door : door)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return {
      status: result.status,
      message: result.message,
      checkOptions: result.checkOptions,
      checkEffect: result.checkEffect,
    };
  }

  private async updateVttDoorById(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      doorId: string;
    },
    updateDoor: (door: NonNullable<VttMapStateDto["doorCells"]>[number]) => {
      door: NonNullable<VttMapStateDto["doorCells"]>[number];
      status: MainCommandStatus;
      message: string;
    },
  ): Promise<{ status: MainCommandStatus; message: string } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return null;
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const doorCells = map.doorCells ?? [];
    const doorIndex = doorCells.findIndex((door) => door.id === params.doorId);
    if (doorIndex < 0) {
      return null;
    }

    const result = updateDoor(doorCells[doorIndex]);
    if (result.door !== doorCells[doorIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          doorCells: doorCells.map((door, index) => (index === doorIndex ? result.door : door)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return { status: result.status, message: result.message };
  }

  private async updateVttHazardById(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      hazardId: string;
    },
    updateHazard: (cell: NonNullable<VttMapStateDto["objectCells"]>[number]) => {
      cell: NonNullable<VttMapStateDto["objectCells"]>[number];
      status: MainCommandStatus;
      message: string;
    },
  ): Promise<{ status: MainCommandStatus; message: string } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return null;
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCells = map.objectCells ?? [];
    const objectIndex = objectCells.findIndex((cell) => cell.id === params.hazardId);
    if (objectIndex < 0) {
      return null;
    }

    const result = updateHazard(objectCells[objectIndex]);
    if (result.cell !== objectCells[objectIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          objectCells: objectCells.map((cell, index) => (index === objectIndex ? result.cell : cell)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return { status: result.status, message: result.message };
  }

  private buildVttDoorCheckEffect(
    door: NonNullable<VttMapStateDto["doorCells"]>[number],
    params: { nodeId: string; mapPoint: { x: number; y: number } },
    effect: "open" | "broken",
  ): Record<string, unknown> {
    return {
      type: "vttDoor",
      doorId: door.id,
      effect,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    };
  }

  private buildVttHazardCheckEffect(
    cell: NonNullable<VttMapStateDto["objectCells"]>[number],
    params: { nodeId: string; mapPoint: { x: number; y: number } },
    effect: "disarm",
  ): Record<string, unknown> {
    return {
      type: "vttHazard",
      hazardId: cell.id,
      effect,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    };
  }

  private findVttObjectAtPoint(map: VttMapStateDto, point: { x: number; y: number }): NonNullable<VttMapStateDto["objectCells"]>[number] | null {
    return (map.objectCells ?? []).find((cell) => this.isPointInVttCell(point, cell)) ?? null;
  }

  private async isVttObjectHiddenContentExhausted(
    sessionId: string,
    sessionScenarioId: string,
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Promise<boolean> {
    const hiddenContentKeys = this.getVttObjectHiddenContentKeys(objectCell);
    if (!hiddenContentKeys.length) {
      return false;
    }

    const existingReveals = await this.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        scope: "party",
        recipientKey: "party",
        OR: hiddenContentKeys.map((item) => ({
          contentId: item.contentId,
          contentKind: item.contentKind,
        })),
      },
      select: {
        contentId: true,
        contentKind: true,
      },
    });
    const existingRevealKeys = new Set(existingReveals.map((reveal) => `${reveal.contentKind}:${reveal.contentId}`));
    const itemContentIds = hiddenContentKeys.filter((item) => item.contentKind === "item").map((item) => item.contentId);
    if (itemContentIds.length) {
      const itemDefinitions = await this.prisma.itemDefinition.findMany({
        where: {
          OR: [{ id: { in: itemContentIds } }, { name: { in: itemContentIds } }],
        },
        select: { id: true },
      });
      const partyOwnedItemDefinitionIds = await this.getPartyInventoryItemDefinitionIds(
        this.prisma,
        sessionId,
        itemDefinitions.map((item) => item.id),
      );
      if (itemDefinitions.some((itemDefinition) => !partyOwnedItemDefinitionIds.has(itemDefinition.id))) {
        return false;
      }
    }

    return hiddenContentKeys.every((item) => existingRevealKeys.has(`${item.contentKind}:${item.contentId}`));
  }

  private async getPartyInventoryItemDefinitionIds(
    client: Pick<Prisma.TransactionClient, "inventoryEntry">,
    sessionId: string,
    itemDefinitionIds: string[],
  ): Promise<Set<string>> {
    if (!itemDefinitionIds.length) {
      return new Set();
    }
    const entries = await client.inventoryEntry.findMany({
      where: {
        itemDefinitionId: { in: [...new Set(itemDefinitionIds)] },
        sessionCharacter: { sessionId },
      },
      select: { itemDefinitionId: true },
    });
    return new Set(entries.map((entry) => entry.itemDefinitionId));
  }

  private getVttObjectHiddenContentKeys(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Array<{ contentId: string; contentKind: "clue" | "item" | "event" }> {
    return [
      ...(objectCell.hiddenClueIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "clue" as const,
      })),
      ...(objectCell.hiddenItemIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "item" as const,
      })),
      ...(objectCell.hiddenEventIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "event" as const,
      })),
    ]
      .map((item) => ({
        contentId: item.contentId.trim(),
        contentKind: item.contentKind,
      }))
      .filter((item) => item.contentId);
  }

  private getFirstVttObjectRevealCheck(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): { contentId: string; requiresCheck: boolean; ability: string | null; skill: string | null; dc: number } | null {
    return this.getVttObjectRevealChecks(objectCell).find((check) => check.requiresCheck) ?? null;
  }

  private getVttObjectRevealChecks(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Array<{ contentId: string; requiresCheck: boolean; ability: string | null; skill: string | null; dc: number }> {
    return (objectCell.revealChecks ?? [])
      .map((check) => {
        const contentId = typeof check.contentId === "string" ? check.contentId.trim() : "";
        if (!contentId) {
          return null;
        }
        return {
          contentId,
          requiresCheck: check.requiresCheck !== false,
          ability: typeof check.ability === "string" && check.ability.trim() ? check.ability.trim() : null,
          skill: typeof check.skill === "string" && check.skill.trim() ? check.skill.trim() : null,
          dc: this.clampNumber(Number(check.dc) || 15, 1, 40),
        };
      })
      .filter(
        (
          check,
        ): check is {
          contentId: string;
          requiresCheck: boolean;
          ability: string | null;
          skill: string | null;
          dc: number;
        } => Boolean(check),
      );
  }

  private canRevealVttObjectContentByCheck(
    contentId: string,
    revealChecks: Array<{
      contentId: string;
      requiresCheck: boolean;
      ability: string | null;
      skill: string | null;
      dc: number;
    }>,
    checkOption?: MainCommandCheckOptionDto | null,
  ): boolean {
    const checksForContent = revealChecks.filter((check) => check.contentId === contentId);
    if (!checksForContent.length) {
      return true;
    }
    if (checksForContent.some((check) => !check.requiresCheck)) {
      return true;
    }
    if (!checkOption) {
      return false;
    }

    return checksForContent
      .filter((check) => check.requiresCheck)
      .some((check) => {
        const abilityMatches = !check.ability || !checkOption.ability || check.ability === checkOption.ability;
        const skillMatches = !check.skill || !checkOption.skill || check.skill === checkOption.skill;
        const dcMatches = !checkOption.dc || check.dc === checkOption.dc;
        return abilityMatches && skillMatches && dcMatches;
      });
  }

  private hasDiscoverableVttObjectContent(objectCell: NonNullable<VttMapStateDto["objectCells"]>[number]): boolean {
    return Boolean(objectCell.hiddenClueIds?.length || objectCell.hiddenItemIds?.length);
  }

  private isVttObjectObserved(objectCell: NonNullable<VttMapStateDto["objectCells"]>[number]): boolean {
    return Boolean(Array.isArray(objectCell.observedBySessionCharacterIds) && objectCell.observedBySessionCharacterIds.length);
  }

  private isVttObjectInPartyVision(
    map: VttMapStateDto,
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
    partyTokens: VttMapStateDto["tokens"],
    visionRangeFeet: number,
  ): boolean {
    return partyTokens.some((token) => {
      const tokenCenter = this.getTokenCenter(token);
      const objectCenter = this.getVttCellCenter(objectCell);
      return (
        this.calculatePointToRectDistanceFeet(map, tokenCenter, objectCell) <= visionRangeFeet && !this.isVttLineOfSightBlocked(map, tokenCenter, objectCenter)
      );
    });
  }

  private getVttCellCenter(cell: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    return {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
    };
  }

  private getTokenCenter(token: VttMapStateDto["tokens"][number]): { x: number; y: number } {
    return {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
  }

  private isVttLineOfSightBlocked(map: VttMapStateDto, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    const blockers = [
      ...(map.terrainCells ?? []).filter((cell) => !cell.terrainEffectId),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
    ];
    if (!blockers.length) {
      return false;
    }

    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distancePx / Math.max(8, map.gridSize / 4)));
    for (let index = 1; index < steps; index += 1) {
      const ratio = index / steps;
      const point = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
      if (blockers.some((blocker) => this.isPointInVttCell(point, blocker))) {
        return true;
      }
    }

    return false;
  }

  private calculatePointToRectDistanceFeet(
    map: VttMapStateDto,
    point: { x: number; y: number },
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
      shapeCells?: Array<{ x: number; y: number; width: number; height: number }>;
    },
  ): number {
    const shapeCells = rect.shapeCells?.length ? rect.shapeCells : [rect];
    const distancePx = Math.min(
      ...shapeCells.map((shapeCell) => {
        const nearestX = this.clampNumber(point.x, shapeCell.x, shapeCell.x + shapeCell.width);
        const nearestY = this.clampNumber(point.y, shapeCell.y, shapeCell.y + shapeCell.height);
        return Math.hypot(point.x - nearestX, point.y - nearestY);
      }),
    );
    return Math.round((distancePx / map.gridSize) * 5);
  }

  private buildFogRevealBoxForObject(
    map: VttMapStateDto,
    objectCell: { x: number; y: number; width: number; height: number },
    revealRadiusFeet: number,
  ): { x: number; y: number; width: number; height: number } {
    const radiusPx = (revealRadiusFeet / 5) * map.gridSize;
    const centerX = objectCell.x + objectCell.width / 2;
    const centerY = objectCell.y + objectCell.height / 2;
    const left = this.clampNumber(centerX - radiusPx, 0, map.width);
    const top = this.clampNumber(centerY - radiusPx, 0, map.height);
    const right = this.clampNumber(centerX + radiusPx, 0, map.width);
    const bottom = this.clampNumber(centerY + radiusPx, 0, map.height);

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  private subtractFogBox(rect: VttMapStateDto["fogRects"][number], cut: { x: number; y: number; width: number; height: number }): VttMapStateDto["fogRects"] {
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;
    const cutRight = cut.x + cut.width;
    const cutBottom = cut.y + cut.height;
    const left = Math.max(rect.x, cut.x);
    const top = Math.max(rect.y, cut.y);
    const right = Math.min(rectRight, cutRight);
    const bottom = Math.min(rectBottom, cutBottom);

    if (left >= right || top >= bottom) {
      return [rect];
    }

    return [
      { ...rect, id: `${rect.id}:top:${Date.now()}`, height: top - rect.y },
      { ...rect, id: `${rect.id}:bottom:${Date.now()}`, y: bottom, height: rectBottom - bottom },
      { ...rect, id: `${rect.id}:left:${Date.now()}`, y: top, width: left - rect.x, height: bottom - top },
      { ...rect, id: `${rect.id}:right:${Date.now()}`, x: right, y: top, width: rectRight - right, height: bottom - top },
    ].filter((piece) => piece.width > 0 && piece.height > 0);
  }

  private isPointInVttCell(
    point: { x: number; y: number },
    cell: {
      x: number;
      y: number;
      width: number;
      height: number;
      shapeCells?: Array<{ x: number; y: number; width: number; height: number }>;
    },
  ): boolean {
    const shapeCells = cell.shapeCells?.length ? cell.shapeCells : [cell];
    return shapeCells.some(
      (shapeCell) => point.x >= shapeCell.x && point.x <= shapeCell.x + shapeCell.width && point.y >= shapeCell.y && point.y <= shapeCell.y + shapeCell.height,
    );
  }

  private async getCurrentNodeClueSnapshots(
    tx: Prisma.TransactionClient,
    params: { sessionScenarioId: string; nodeId: string },
  ): Promise<Map<string, Record<string, unknown>>> {
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { cluesJson: true },
    });

    const clues = this.parseJson<Record<string, unknown>[]>(node?.cluesJson, []);
    const entries: Array<[string, Record<string, unknown>]> = [];
    clues.forEach((clue) => {
      const contentId = this.getStringProperty(clue, "id");
      if (contentId) {
        entries.push([contentId, clue]);
      }
    });
    return new Map(entries);
  }

  redactVttMapForPlayer(map: VttMapStateDto): VttMapStateDto {
    return {
      ...map,
      tokens: map.tokens
        .filter((token) => token.hidden !== true)
        .map((token) => ({
          ...token,
          hidden: false,
        })),
      startingPositions: [],
      objectCells: (map.objectCells ?? [])
        .filter((cell) => cell.visibleToPlayers !== false || this.isVttHazardDetected(cell.hazard))
        .map((cell) => ({
          ...cell,
          visibleToPlayers: cell.visibleToPlayers !== false || this.isVttHazardDetected(cell.hazard),
          hiddenClueIds: [],
          hiddenItemIds: [],
          hiddenEventIds: [],
          observedBySessionCharacterIds: this.isVttObjectObserved(cell) ? ["party"] : [],
          revealChecks: [],
          events: [],
          hazard: this.isVttHazardDetected(cell.hazard)
            ? {
                kind: this.normalizeHazardKind(cell.hazard?.kind),
                armed: cell.hazard?.armed !== false,
                triggerOnce: cell.hazard?.triggerOnce !== false,
                // GM 전용 수치는 숨기되, normalizeVttMap 의 `Number(x) || default`
                // 보정으로 0 이 기본값으로 되살아나면 ensurePlayerMapShellUnchanged
                // 비교가 깨지므로 클램프 최소값(1)을 내보낸다.
                detectionRadiusCells: 1,
                detectionDc: 1,
                linkedClueIds: [],
                attemptedBySessionCharacterIds: [],
                detectedBySessionCharacterIds: ["party"],
              }
            : null,
        })),
      doorCells: (map.doorCells ?? []).map((cell) => ({
        ...cell,
        keyItemId: null,
      })),
    };
  }

  private isVttHazardDetected(hazard: VttObjectHazardDto | null | undefined): boolean {
    return Boolean(hazard && hazard.armed !== false && Array.isArray(hazard.detectedBySessionCharacterIds) && hazard.detectedBySessionCharacterIds.length);
  }
}
