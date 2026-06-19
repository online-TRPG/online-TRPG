import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CombatStatus as PrismaCombatStatus,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  AdjustHumanGmCombatHpDto,
  ApplyHumanGmCombatConditionDto,
  CombatEntityType,
  CombatResponseDto,
  CombatStatus,
  GrantHumanGmInventoryItemDto,
  HumanGmMessageDto,
  HumanGmNodeMoveOptionDto,
  ScenarioNodeType,
  SessionSnapshotDto,
  UpdateSessionNodeDto,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import type { SessionsService } from "./sessions.service";

type HumanGmRuntime = ReturnType<SessionsService["createHumanGmRuntime"]>;
type HumanGmOverrideLogResult = Awaited<ReturnType<HumanGmRuntime["createHumanGmOverrideTurnLog"]>>;

@Injectable()
export class HumanGmRuntimeService {
  async createHumanGmMessage(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: HumanGmMessageDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const { state, sessionScenario } = await runtime.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = runtime.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const gmMessages = Array.isArray(flags.gmMessages) ? [...(flags.gmMessages as unknown[])] : [];
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    const gmMessageId = randomUUID();
    gmMessages.push({
      id: gmMessageId,
      type: dto.asNpc ? "npc" : "gm",
      speakerName: dto.speakerName?.trim() || null,
      content: dto.content.trim(),
      createdAt: new Date().toISOString(),
      authorUserId: userId,
    });

    await runtime.prisma.$transaction(async (tx) => {
      if (session.status === PrismaSessionStatus.RECRUITING) {
        await runtime.ensureSessionScenarioNodeSnapshot(tx, sessionScenario.id, sessionScenario.scenarioId);
        if (state.currentNodeId) {
          await runtime.recordNodeVisit(tx, {
            sessionScenarioId: sessionScenario.id,
            nodeId: state.currentNodeId,
          });
        }
      }

      await tx.gameState.update({
        where: { sessionScenarioId: sessionScenario.id },
        data: {
          flagsJson: JSON.stringify({
            ...flags,
            gmMessages: gmMessages.slice(-50),
          }),
        },
      });
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: session.status === PrismaSessionStatus.RECRUITING ? PrismaSessionStatus.PLAYING : session.status,
        },
      });
      gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: dto.asNpc ? "npc_dialogue" : "scene_text",
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        gmUserId: userId,
        publicNarration: dto.content,
        privateNote: dto.privateNote,
        targetId: dto.speakerName?.trim() || null,
        statePatch: {
          gmMessageCreated: true,
          gmMessageId,
          messageType: dto.asNpc ? "npc" : "gm",
          speakerName: dto.speakerName?.trim() || null,
        },
        metadata: {
          gmMessageId,
          speakerName: dto.speakerName?.trim() || null,
          messageType: dto.asNpc ? "npc" : "gm",
        },
      });
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
    if (emittedGmTurnLog) {
      runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async grantHumanGmInventoryItem(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: GrantHumanGmInventoryItemDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM inventory grants.");
    }

    const quantity = dto.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException("지급할 아이템 수량이 올바르지 않습니다.");
    }

    const [activeScenario, targetCharacter, catalogItem] = await Promise.all([
      runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId),
      runtime.prisma.sessionCharacter.findUnique({
        where: { id: dto.sessionCharacterId },
        include: {
          character: true,
          participant: {
            select: { role: true },
          },
        },
      }),
      runtime.prisma.item.findFirst({
        where: {
          OR: [{ id: dto.itemDefinitionId }, { key: dto.itemDefinitionId }],
        },
        select: { id: true, key: true },
      }),
    ]);
    const itemDefinitionLookupIds = [dto.itemDefinitionId, catalogItem?.id, catalogItem?.key].filter((value): value is string => Boolean(value));
    const itemDefinition = await runtime.prisma.itemDefinition.findFirst({
      where: {
        OR: [{ id: { in: itemDefinitionLookupIds } }, { name: { equals: dto.itemDefinitionId, mode: "insensitive" } }],
      },
      select: { id: true, name: true, itemType: true },
    });

    if (!targetCharacter || targetCharacter.sessionId !== resolvedSessionId || targetCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw new NotFoundException("대상 세션 캐릭터를 찾을 수 없습니다.");
    }
    if (targetCharacter.participant.role === PrismaParticipantRole.GM) {
      throw new ForbiddenException("GM 참가자에게는 인벤토리 아이템을 지급할 수 없습니다.");
    }
    if (!itemDefinition) {
      throw new NotFoundException("지급할 아이템을 찾을 수 없습니다.");
    }

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
      await runtime.grantSessionInventoryItem(tx, {
        sessionCharacterId: targetCharacter.id,
        itemDefinitionId: itemDefinition.id,
        quantity,
      });
      await runtime.refreshSessionInventorySnapshot(targetCharacter.id, tx);
      return runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "adjust_item",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        targetId: targetCharacter.id,
        publicNarration: `GM이 ${targetCharacter.character.name}에게 ${itemDefinition.name} x${quantity}을(를) 지급했습니다.`,
        statePatch: {
          inventory: {
            sessionCharacterId: targetCharacter.id,
            itemDefinitionId: itemDefinition.id,
            quantityDelta: quantity,
          },
        },
        metadata: {
          itemName: itemDefinition.name,
          itemType: itemDefinition.itemType,
          quantity,
        },
      });
    });

    const updatedCharacter = await runtime.prisma.sessionCharacter.findUniqueOrThrow({
      where: { id: targetCharacter.id },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    runtime.realtimeEvents.emitCharacterUpdated(resolvedSessionId, mapSessionCharacter(updatedCharacter));
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async applyHumanGmCombatCondition(
    runtime: HumanGmRuntime,
    userId: string,
    sessionId: string,
    dto: ApplyHumanGmCombatConditionDto,
  ): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const combat = await runtime.prisma.combat.findFirst({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });

    if (!combat) {
      throw new NotFoundException("활성 전투를 찾을 수 없습니다.");
    }

    const targetId = dto.targetId.trim();
    const target = combat.participants.find((participant) => participant.id === targetId || participant.tokenId === targetId);
    if (!target) {
      throw new NotFoundException("상태를 적용할 전투 대상을 찾을 수 없습니다.");
    }

    const conditionId = dto.conditionId.trim();
    const operation = dto.operation ?? "add";
    const currentConditions = runtime.parseJson<unknown[]>(target.conditionsJson, []);
    const nextConditions =
      operation === "add" ? this.addHumanGmCondition(currentConditions, conditionId) : this.removeHumanGmCondition(currentConditions, conditionId);
    const conditionLabel = this.getHumanGmConditionLabel(conditionId);
    const publicNarration =
      operation === "add"
        ? `GM이 ${target.nameSnapshot}에게 ${conditionLabel} 상태를 적용했습니다.`
        : `GM이 ${target.nameSnapshot}에게서 ${conditionLabel} 상태를 제거했습니다.`;

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
      await tx.combatParticipant.update({
        where: { id: target.id },
        data: { conditionsJson: JSON.stringify(nextConditions) },
      });
      return runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "set_condition",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        targetId: target.id,
        publicNarration,
        statePatch: {
          combatParticipants: [
            {
              combatParticipantId: target.id,
              tokenId: target.tokenId,
              conditions: nextConditions,
            },
          ],
        },
        metadata: {
          operation,
          conditionId,
          tokenId: target.tokenId,
          targetName: target.nameSnapshot,
        },
      });
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    runtime.realtimeEvents.emitCombatUpdated(resolvedSessionId, this.mapHumanGmCombatConditionResponse(runtime, combat, target.id, nextConditions));
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async adjustHumanGmCombatHp(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: AdjustHumanGmCombatHpDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const combat = await runtime.prisma.combat.findFirst({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    if (!combat) {
      throw new NotFoundException("활성 전투를 찾을 수 없습니다.");
    }

    const targetId = dto.targetId.trim();
    const target = combat.participants.find((participant) => participant.id === targetId || participant.tokenId === targetId);
    if (!target) {
      throw new NotFoundException("HP를 조정할 전투 대상을 찾을 수 없습니다.");
    }
    const maximumHp = Math.max(0, target.maxHp ?? 0);
    const nextHp = runtime.clampNumber(dto.currentHp, 0, maximumHp);
    const previousHp = target.currentHp ?? maximumHp;
    const nextIsAlive = nextHp > 0;
    const currentConditions = runtime.parseJson<unknown[]>(target.conditionsJson, []);
    const publicNarration = `GM이 ${target.nameSnapshot}의 HP를 ${previousHp}에서 ${nextHp}(으)로 조정했습니다.`;

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
      await tx.combatParticipant.update({
        where: { id: target.id },
        data: { currentHp: nextHp, isAlive: nextIsAlive },
      });
      if (target.sessionCharacterId) {
        await tx.sessionCharacter.update({
          where: { id: target.sessionCharacterId },
          data: { currentHp: nextHp },
        });
      }
      return runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "adjust_hp",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        targetId: target.id,
        publicNarration,
        statePatch: {
          combatParticipants: [
            {
              combatParticipantId: target.id,
              tokenId: target.tokenId,
              previousHp,
              currentHp: nextHp,
              isAlive: nextIsAlive,
            },
          ],
          ...(target.sessionCharacterId
            ? {
                sessionCharacters: [
                  {
                    sessionCharacterId: target.sessionCharacterId,
                    previousHp,
                    currentHp: nextHp,
                  },
                ],
              }
            : {}),
        },
        metadata: {
          previousHp,
          nextHp,
          maximumHp,
          tokenId: target.tokenId,
          targetName: target.nameSnapshot,
        },
      });
    });

    target.currentHp = nextHp;
    target.isAlive = nextIsAlive;
    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    runtime.realtimeEvents.emitCombatUpdated(resolvedSessionId, this.mapHumanGmCombatConditionResponse(runtime, combat, target.id, currentConditions));
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async updateSessionNode(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: UpdateSessionNodeDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await runtime.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const targetNode = await runtime.getSessionScenarioNodeEntityOrThrow(activeScenario.id, dto.nodeId);
    const currentState = await runtime.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
    });
    if (!currentState?.currentNodeId) {
      throw new BadRequestException("The session does not have a current node.");
    }
    const currentNode = await runtime.getSessionScenarioNodeEntityOrThrow(activeScenario.id, currentState.currentNodeId);
    this.ensureReachableSessionNodeTarget(runtime, currentNode, targetNode.nodeId);
    const flags = runtime.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
    const targetDefaultMap = runtime.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);
    const targetRuntimeMap = targetDefaultMap
      ? await runtime.applyScenarioStartingPositions(resolvedSessionId, runtime.normalizeVttMap(targetDefaultMap, targetNode.nodeId))
      : null;
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    await runtime.prisma.$transaction(async (tx) => {
      await runtime.lockSessionRuntime(tx, resolvedSessionId);
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: session.status === PrismaSessionStatus.RECRUITING ? PrismaSessionStatus.PLAYING : session.status,
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          currentNodeId: targetNode.nodeId,
          phase: this.getPhaseForScenarioNodeType(targetNode.nodeType),
          flagsJson: JSON.stringify({
            ...flags,
            ...(targetRuntimeMap ? { vttMap: targetRuntimeMap } : {}),
          }),
        },
      });
      await runtime.recordNodeVisit(tx, {
        sessionScenarioId: activeScenario.id,
        nodeId: targetNode.nodeId,
      });
      gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "node_move",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        publicNarration: `GM moved the scene to ${targetNode.title}.`,
        targetId: targetNode.nodeId,
        statePatch: {
          currentNodeId: targetNode.nodeId,
          phase: this.getPhaseForScenarioNodeType(targetNode.nodeType),
          vttMapChanged: Boolean(targetRuntimeMap),
        },
        metadata: {
          nodeTitle: targetNode.title,
        },
      });
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
    if (emittedGmTurnLog) {
      runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async listHumanGmNodeMoveOptions(runtime: HumanGmRuntime, userId: string, sessionId: string): Promise<HumanGmNodeMoveOptionDto[]> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(session.id);
    await runtime.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const currentNodeId = activeScenario.gameState?.currentNodeId ?? null;
    if (!currentNodeId) return [];

    const currentNode = await runtime.getSessionScenarioNodeEntityOrThrow(activeScenario.id, currentNodeId);
    const transitions = runtime.parseJson<Record<string, unknown>[]>(currentNode.transitionsJson, []);
    const transitionStubs = transitions
      .map((transition) => {
        const nodeId = runtime.getStringProperty(transition, "nextNodeId");
        return nodeId
          ? {
              nodeId,
              label: runtime.getStringProperty(transition, "label"),
              condition: runtime.getStringProperty(transition, "condition"),
              note: runtime.getStringProperty(transition, "note"),
              isFallback: false,
            }
          : null;
      })
      .filter(
        (
          stub,
        ): stub is {
          nodeId: string;
          label: string | null;
          condition: string | null;
          note: string | null;
          isFallback: boolean;
        } => Boolean(stub),
      );

    if (currentNode.fallbackNodeId) {
      transitionStubs.push({
        nodeId: currentNode.fallbackNodeId,
        label: "기본 이동",
        condition: "default",
        note: null,
        isFallback: true,
      });
    }

    if (!transitionStubs.length) return [];

    const targetNodes = await runtime.prisma.sessionScenarioNode.findMany({
      where: {
        sessionScenarioId: activeScenario.id,
        nodeId: { in: Array.from(new Set(transitionStubs.map((stub) => stub.nodeId))) },
      },
      select: { nodeId: true, title: true, nodeType: true },
    });
    const nodeById = new Map(targetNodes.map((node) => [node.nodeId, node]));

    return transitionStubs.flatMap((stub) => {
      const targetNode = nodeById.get(stub.nodeId);
      if (!targetNode) return [];
      return [
        {
          nodeId: targetNode.nodeId,
          title: targetNode.title,
          nodeType: targetNode.nodeType,
          label: stub.label,
          condition: stub.condition,
          note: stub.note,
          isFallback: stub.isFallback,
        },
      ];
    });
  }

  async startCombat(runtime: HumanGmRuntime, userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await runtime.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.COMBAT);
    const resolvedSessionId = (await runtime.getSessionEntityOrThrow(sessionId)).id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
      kind: "combat_start",
      sessionId: resolvedSessionId,
      sessionScenarioId: activeScenario.id,
      gmUserId: userId,
      publicNarration: "GM started combat.",
      statePatch: {
        phase: PrismaGamePhase.COMBAT,
      },
    });
    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async endCombat(runtime: HumanGmRuntime, userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await runtime.completeActiveCombatState(resolvedSessionId);
    const gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
      kind: "combat_end",
      sessionId: resolvedSessionId,
      sessionScenarioId: activeScenario.id,
      gmUserId: userId,
      publicNarration: "GM ended combat.",
      statePatch: {
        phase: PrismaGamePhase.EXPLORATION,
      },
    });
    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  private addHumanGmCondition(currentConditions: unknown[], conditionId: string): unknown[] {
    const normalized = this.normalizeHumanGmConditionId(conditionId);
    if (
      currentConditions.some((condition) => {
        if (typeof condition === "string") {
          return this.normalizeHumanGmConditionId(condition) === normalized;
        }
        if (condition && typeof condition === "object" && !Array.isArray(condition)) {
          const structuredId = (condition as { conditionId?: unknown }).conditionId;
          return typeof structuredId === "string" && this.normalizeHumanGmConditionId(structuredId) === normalized;
        }
        return false;
      })
    ) {
      return currentConditions;
    }

    return [...currentConditions, conditionId];
  }

  private removeHumanGmCondition(currentConditions: unknown[], conditionId: string): unknown[] {
    const normalized = this.normalizeHumanGmConditionId(conditionId);
    return currentConditions.filter((condition) => {
      if (typeof condition === "string") {
        return this.normalizeHumanGmConditionId(condition) !== normalized;
      }
      if (condition && typeof condition === "object" && !Array.isArray(condition)) {
        const structuredId = (condition as { conditionId?: unknown }).conditionId;
        return typeof structuredId !== "string" || this.normalizeHumanGmConditionId(structuredId) !== normalized;
      }
      return true;
    });
  }

  private normalizeHumanGmConditionId(conditionId: string): string {
    return conditionId
      .trim()
      .toLowerCase()
      .replace(/^condition\./, "");
  }

  private getHumanGmConditionLabel(conditionId: string): string {
    const normalized = this.normalizeHumanGmConditionId(conditionId);
    const labels: Record<string, string> = {
      stunned: "기절",
      poisoned: "중독",
      prone: "넘어짐",
      burning: "화상",
      restrained: "구속",
      frightened: "공포",
      paralyzed: "마비",
      incapacitated: "무력화",
    };

    return labels[normalized] ?? conditionId;
  }

  private mapHumanGmCombatConditionResponse(
    runtime: HumanGmRuntime,
    combat: {
      id: string;
      sessionId: string;
      status: unknown;
      roundNo: number;
      turnNo: number;
      currentParticipantId?: string | null;
      participants: Array<{
        id: string;
        entityType?: unknown;
        sessionCharacterId?: string | null;
        tokenId?: string | null;
        nameSnapshot: string;
        currentHp?: number | null;
        maxHp?: number | null;
        armorClass?: number | null;
        initiative?: number;
        turnOrder?: number;
        isAlive?: boolean;
        isHostile?: boolean;
        conditionsJson?: string | null;
      }>;
    },
    changedParticipantId: string,
    nextConditions: unknown[],
  ): CombatResponseDto {
    const aliveParticipants = combat.participants.filter((participant) => participant.isAlive !== false);
    const currentTurnIndex = combat.currentParticipantId ? aliveParticipants.findIndex((participant) => participant.id === combat.currentParticipantId) : -1;
    const currentTurnOrder = combat.participants.find((participant) => participant.id === combat.currentParticipantId)?.turnOrder ?? Number.MAX_SAFE_INTEGER;

    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: combat.status as CombatStatus,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      roundTurnNo: currentTurnIndex >= 0 ? currentTurnIndex + 1 : 0,
      currentEntityId: combat.currentParticipantId ?? null,
      participants: combat.participants.map((participant) => {
        const conditionEntries =
          participant.id === changedParticipantId ? nextConditions : runtime.parseJson<unknown[]>(participant.conditionsJson ?? "[]", []);
        return {
          sessionEntityId: participant.id,
          entityType: (participant.entityType ?? CombatEntityType.MONSTER) as CombatEntityType,
          sessionCharacterId: participant.sessionCharacterId ?? null,
          tokenId: participant.tokenId ?? null,
          name: participant.nameSnapshot,
          currentHp: participant.currentHp ?? null,
          maxHp: participant.maxHp ?? null,
          armorClass: participant.armorClass ?? null,
          initiative: participant.initiative ?? 0,
          turnOrder: participant.turnOrder ?? 0,
          isAlive: participant.isAlive ?? true,
          isHostile: participant.isHostile ?? false,
          hasActedThisRound: participant.isAlive !== false && participant.id !== combat.currentParticipantId && (participant.turnOrder ?? 0) < currentTurnOrder,
          conditions: this.toHumanGmCombatConditionTags(conditionEntries),
          concentration: this.toHumanGmCombatConcentration(runtime, conditionEntries),
          actionResources: {
            actionAvailable: participant.id === combat.currentParticipantId,
            bonusActionAvailable: participant.id === combat.currentParticipantId,
            reactionAvailable: true,
            additionalActionAvailable: false,
            twoWeaponAttackAvailable: false,
            sneakAttackAvailable: true,
            movementFtTotal: 30,
            movementFtRemaining: 30,
            spellSlotLevel1Total: 0,
            spellSlotLevel1Remaining: 0,
            spellSlots: {},
          },
          monsterActions: [],
        };
      }),
    };
  }

  private toHumanGmCombatConditionTags(conditionEntries: unknown[]): string[] {
    const tags = conditionEntries.flatMap((condition) => {
      if (typeof condition === "string") {
        return [condition];
      }
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
        return [];
      }
      const record = condition as { conditionId?: unknown; tags?: unknown };
      return [
        typeof record.conditionId === "string" ? record.conditionId : null,
        ...(Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : []),
      ].filter((tag): tag is string => Boolean(tag));
    });
    return Array.from(new Set(tags));
  }

  private toHumanGmCombatConcentration(runtime: HumanGmRuntime, conditionEntries: unknown[]) {
    const conditions = runtime.conditionRuntime.parseConditionsJson(JSON.stringify(conditionEntries));
    const concentrationState = runtime.concentrationRuntime.readActiveConcentration(conditions);
    return concentrationState
      ? {
          spellId: concentrationState.spellId,
          targetIds: concentrationState.targetIds,
          effectIds: concentrationState.effectIds,
          startedAtRound: concentrationState.startedAtRound,
          endsAtRound: concentrationState.endsAtRound ?? null,
          endsAtTurn: concentrationState.endsAtTurn ?? null,
        }
      : null;
  }

  private ensureReachableSessionNodeTarget(
    runtime: HumanGmRuntime,
    currentNode: { transitionsJson: string; fallbackNodeId: string | null },
    targetNodeId: string,
  ): void {
    const transitions = runtime.parseJson<Record<string, unknown>[]>(currentNode.transitionsJson, []);
    const explicitTargetIds = transitions
      .map((transition) => runtime.getStringProperty(transition, "nextNodeId"))
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const allowedTargetIds = [...explicitTargetIds, ...(currentNode.fallbackNodeId ? [currentNode.fallbackNodeId] : [])];

    if (!allowedTargetIds.includes(targetNodeId)) {
      throw new ForbiddenException("GM can only move to a node reachable from the current node.");
    }
  }

  private getPhaseForScenarioNodeType(nodeType: string): PrismaGamePhase {
    if (nodeType === ScenarioNodeType.COMBAT) return PrismaGamePhase.COMBAT;
    if (nodeType === ScenarioNodeType.EXPLORATION) return PrismaGamePhase.EXPLORATION;
    return PrismaGamePhase.DIALOGUE;
  }
}
