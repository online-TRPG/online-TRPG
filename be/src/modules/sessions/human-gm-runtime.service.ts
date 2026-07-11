import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CombatEntityType as PrismaCombatEntityType,
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
  HUMAN_GM_INVENTORY_QUANTITY_MAX,
  HUMAN_GM_INVENTORY_QUANTITY_MIN,
  HumanGmMessageDto,
  HumanGmNodeMoveOptionDto,
  RemoveHumanGmInventoryItemDto,
  ScenarioNodeType,
  SetHumanGmDifficultyClassDto,
  SessionSnapshotDto,
  UpdateSessionNodeDto,
  VTT_CHECK_DC_MAX,
  VTT_CHECK_DC_MIN,
  decodeLenientScenarioTransitionArray,
  decodeScenarioTransitionArray,
  decodeJsonObject,
  isRecord,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";
import {
  parseJsonOrFallback,
  parseJsonOrThrow,
  parseJsonRecordOrThrow,
} from "../../common/utils/json-runtime";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { ConditionRuntimeService, type ConditionStateEntry } from "../rules/condition-runtime.service";
import { SessionHumanGmMessageStoreService } from "./session-human-gm-message-store.service";
import type { SessionsService } from "./sessions.service";

type HumanGmRuntime = ReturnType<SessionsService["createHumanGmRuntime"]>;
type HumanGmOverrideLogResult = Awaited<ReturnType<HumanGmRuntime["createHumanGmOverrideTurnLog"]>>;

@Injectable()
export class HumanGmRuntimeService {
  private readonly conditionRuntime = new ConditionRuntimeService();

  constructor(private readonly sessionHumanGmMessageStore: SessionHumanGmMessageStoreService) {}

  async createHumanGmMessage(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: HumanGmMessageDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const { state, sessionScenario } = await runtime.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = parseJsonRecordOrThrow(state.flagsJson, {}, "gameState.flagsJson");
    const gmMessageId = randomUUID();
    const messageType = dto.asNpc ? "npc" : "gm";
    const speakerName = dto.speakerName?.trim() || null;
    const gmMessage = this.sessionHumanGmMessageStore.createMessage({
      id: gmMessageId,
      type: messageType,
      speakerName,
      content: dto.content.trim(),
      createdAt: new Date().toISOString(),
      authorUserId: userId,
    });

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
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
          flagsJson: JSON.stringify(this.sessionHumanGmMessageStore.append(flags, gmMessage)),
        },
      });
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: session.status === PrismaSessionStatus.RECRUITING ? PrismaSessionStatus.PLAYING : session.status,
        },
      });
      return runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: dto.asNpc ? "npc_dialogue" : "scene_text",
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        gmUserId: userId,
        publicNarration: dto.content,
        privateNote: dto.privateNote,
        targetId: speakerName,
        statePatch: {
          gmMessageCreated: true,
          gmMessageId,
          messageType,
          speakerName,
        },
        metadata: {
          gmMessageId,
          speakerName,
          messageType,
        },
      });
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog;
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

    const quantity = dto.quantity ?? HUMAN_GM_INVENTORY_QUANTITY_MIN;
    if (!Number.isInteger(quantity) || quantity < HUMAN_GM_INVENTORY_QUANTITY_MIN || quantity > HUMAN_GM_INVENTORY_QUANTITY_MAX) {
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
    const itemDefinitionLookupIds = compactPresentStrings([dto.itemDefinitionId, catalogItem?.id, catalogItem?.key]);
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

  async removeHumanGmInventoryItem(runtime: HumanGmRuntime, userId: string, sessionId: string, dto: RemoveHumanGmInventoryItemDto): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM inventory removals.");
    }

    const quantity = dto.quantity ?? HUMAN_GM_INVENTORY_QUANTITY_MIN;
    if (!Number.isInteger(quantity) || quantity < HUMAN_GM_INVENTORY_QUANTITY_MIN || quantity > HUMAN_GM_INVENTORY_QUANTITY_MAX) {
      throw new BadRequestException("회수할 아이템 수량이 올바르지 않습니다.");
    }

    const [activeScenario, targetCharacter] = await Promise.all([
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
    ]);

    if (!targetCharacter || targetCharacter.sessionId !== resolvedSessionId || targetCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw new NotFoundException("대상 세션 캐릭터를 찾을 수 없습니다.");
    }
    if (targetCharacter.participant.role === PrismaParticipantRole.GM) {
      throw new ForbiddenException("GM 참가자의 인벤토리 아이템은 회수할 수 없습니다.");
    }

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
      const removed = await runtime.removeSessionInventoryItem(tx, {
        sessionCharacterId: targetCharacter.id,
        itemId: dto.itemId,
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
        publicNarration: `GM이 ${targetCharacter.character.name}에게서 ${removed.itemName} x${removed.removedQuantity}을(를) 회수했습니다.`,
        statePatch: {
          inventory: {
            sessionCharacterId: targetCharacter.id,
            itemDefinitionId: removed.itemDefinitionId,
            quantityDelta: -removed.removedQuantity,
          },
        },
        metadata: {
          operation: "remove",
          itemName: removed.itemName,
          itemType: removed.itemType,
          quantity: removed.removedQuantity,
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

  async setHumanGmDifficultyClass(
    runtime: HumanGmRuntime,
    userId: string,
    sessionId: string,
    dto: SetHumanGmDifficultyClassDto,
  ): Promise<SessionSnapshotDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM DC overrides.");
    }
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const targetId = dto.targetId.trim();
    if (!targetId) {
      throw new BadRequestException("DC를 적용할 대상을 입력해야 합니다.");
    }
    if (!Number.isInteger(dto.dc) || dto.dc < VTT_CHECK_DC_MIN || dto.dc > VTT_CHECK_DC_MAX) {
      throw new BadRequestException(`DC 값은 ${VTT_CHECK_DC_MIN}에서 ${VTT_CHECK_DC_MAX} 사이의 정수여야 합니다.`);
    }
    const dc = runtime.clampNumber(dto.dc, VTT_CHECK_DC_MIN, VTT_CHECK_DC_MAX);
    const label = dto.label?.trim() || targetId;
    const ability = dto.ability?.trim() || null;
    const publicNarration = ability
      ? `GM이 ${label}의 ${ability} DC를 ${dc}(으)로 설정했습니다.`
      : `GM이 ${label}의 DC를 ${dc}(으)로 설정했습니다.`;

    const gmTurnLog = await runtime.prisma.$transaction((tx) =>
      runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "set_dc",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        targetId,
        publicNarration,
        privateNote: dto.privateNote,
        statePatch: {
          difficultyClassOverride: {
            targetId,
            label,
            ability,
            dc,
          },
        },
        metadata: {
          targetId,
          label,
          ability,
          dc,
        },
      }),
    );

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
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
    const currentConditions = this.parseHumanGmConditionEntries(target.conditionsJson);
    const nextConditions =
      operation === "add" ? this.addHumanGmCondition(currentConditions, conditionId) : this.removeHumanGmCondition(currentConditions, conditionId);
    const conditionLabel = this.getHumanGmConditionLabel(conditionId);
    const publicNarration =
      operation === "add"
        ? `GM이 ${target.nameSnapshot}에게 ${conditionLabel} 상태를 적용했습니다.`
        : `GM이 ${target.nameSnapshot}에게서 ${conditionLabel} 상태를 제거했습니다.`;
    const statePatch = decodeJsonObject({
      combatParticipants: [
        {
          combatParticipantId: target.id,
          tokenId: target.tokenId,
          conditions: nextConditions,
        },
      ],
    }, "humanGm.setCondition.statePatch");

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
        statePatch,
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
    const currentConditions = this.parseHumanGmConditionEntries(target.conditionsJson);
    const publicNarration = `GM이 ${target.nameSnapshot}의 HP를 ${previousHp}에서 ${nextHp}(으)로 조정했습니다.`;

    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
      await tx.combatParticipant.update({
        where: { id: target.id },
        data: { currentHp: nextHp, isAlive: nextIsAlive },
      });
      if (target.sessionCharacterId) {
        await tx.sessionCharacter.update({
          where: { id: target.sessionCharacterId },
          data: {
            currentHp: nextHp,
            status: nextIsAlive ? "ACTIVE" : "DEAD",
          },
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
    const flags = parseJsonRecordOrThrow(currentState?.flagsJson, {}, "gameState.flagsJson");
    const targetDefaultMap = runtime.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);
    const targetRuntimeMap = targetDefaultMap
      ? await runtime.applyScenarioStartingPositions(resolvedSessionId, runtime.normalizeVttMap(targetDefaultMap, targetNode.nodeId))
      : null;
    const gmTurnLog = await runtime.prisma.$transaction(async (tx) => {
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
      return runtime.createHumanGmOverrideTurnLog({
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
    const emittedGmTurnLog = gmTurnLog;
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
    const transitions = parseJsonOrFallback(currentNode.transitionsJson, [], decodeLenientScenarioTransitionArray);
    const transitionStubs = transitions
      .map((transition) => {
        const nodeId = transition.nextNodeId;
        return nodeId
          ? {
              nodeId,
              label: transition.label ?? null,
              condition: transition.condition ?? null,
              note: transition.note ?? null,
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
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const { state } = await runtime.getGameStateEntityOrThrow(resolvedSessionId);
    await runtime.transitionHumanGmCombat(userId, resolvedSessionId, PrismaGamePhase.COMBAT);
    await this.ensureHumanGmActiveCombatFromCurrentNode(
      runtime,
      resolvedSessionId,
      activeScenario.id,
      state.currentNodeId,
    );
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

  private async ensureHumanGmActiveCombatFromCurrentNode(
    runtime: HumanGmRuntime,
    sessionId: string,
    sessionScenarioId: string,
    currentNodeId: string | null,
  ): Promise<void> {
    if (!currentNodeId) {
      return;
    }

    const currentNode = await runtime.getSessionScenarioNodeEntityOrThrow(
      sessionScenarioId,
      currentNodeId,
    );
    const map = runtime.extractVttMapFromCheckOptions(
      currentNode.checkOptionsJson,
    );
    const tokens = (map?.tokens ?? []).filter((token) => token.hidden !== true);
    if (!tokens.length) {
      return;
    }

    await runtime.prisma.$transaction(async (tx) => {
      let combat = await tx.combat.findFirst({
        where: {
          sessionId,
          status: PrismaCombatStatus.ACTIVE,
        },
        include: { participants: true },
        orderBy: { createdAt: "desc" },
      });

      if (!combat) {
        combat = await tx.combat.create({
          data: {
            sessionId,
            sessionScenarioId,
            status: PrismaCombatStatus.ACTIVE,
            roundNo: 1,
            turnNo: 1,
          },
          include: { participants: true },
        });
      }

      const existingTokenIds = new Set(
        compactPresentStrings(combat.participants.map((participant) => participant.tokenId)),
      );
      let nextTurnOrder =
        Math.max(0, ...combat.participants.map((participant) => participant.turnOrder)) + 1;
      const createdParticipants: Array<{ id: string }> = [];

      for (const token of tokens) {
        if (existingTokenIds.has(token.id)) {
          continue;
        }
        const isMonster = Boolean(token.monster) || token.isHostile === true;
        const maxHp = isMonster ? 7 : 10;
        createdParticipants.push(
          await tx.combatParticipant.create({
            data: {
              combatId: combat.id,
              entityType: isMonster
                ? PrismaCombatEntityType.MONSTER
                : PrismaCombatEntityType.PLAYER_CHARACTER,
              sessionCharacterId: isMonster ? null : (token.sessionCharacterId ?? null),
              tokenId: token.id,
              nameSnapshot: token.name,
              currentHp: maxHp,
              maxHp,
              armorClass: isMonster ? 12 : 10,
              speedFt: 30,
              conditionsJson: "[]",
              initiative: Math.max(1, 20 - nextTurnOrder),
              turnOrder: nextTurnOrder,
              isAlive: true,
              isHostile: token.isHostile === true,
            },
          }),
        );
        nextTurnOrder += 1;
      }

      if (!combat.currentParticipantId) {
        const firstParticipantId =
          combat.participants[0]?.id ?? createdParticipants[0]?.id ?? null;
        if (firstParticipantId) {
          await tx.combat.update({
            where: { id: combat.id },
            data: { currentParticipantId: firstParticipantId },
          });
        }
      }
    });
  }

  private addHumanGmCondition(currentConditions: ConditionStateEntry[], conditionId: string): ConditionStateEntry[] {
    const normalized = this.normalizeHumanGmConditionId(conditionId);
    if (
      currentConditions.some((condition) => {
        if (typeof condition === "string") {
          return this.normalizeHumanGmConditionId(condition) === normalized;
        }
        if (isRecord(condition)) {
          const structuredId = condition.conditionId;
          return typeof structuredId === "string" && this.normalizeHumanGmConditionId(structuredId) === normalized;
        }
        return false;
      })
    ) {
      return currentConditions;
    }

    return [...currentConditions, conditionId];
  }

  private removeHumanGmCondition(currentConditions: ConditionStateEntry[], conditionId: string): ConditionStateEntry[] {
    const normalized = this.normalizeHumanGmConditionId(conditionId);
    return currentConditions.filter((condition) => {
      if (typeof condition === "string") {
        return this.normalizeHumanGmConditionId(condition) !== normalized;
      }
      if (isRecord(condition)) {
        const structuredId = condition.conditionId;
        return typeof structuredId !== "string" || this.normalizeHumanGmConditionId(structuredId) !== normalized;
      }
      return true;
    });
  }

  private parseHumanGmConditionEntries(value: string | null | undefined): ConditionStateEntry[] {
    return parseJsonOrThrow(
      value,
      [],
      (parsed) => this.decodeHumanGmConditionEntries(parsed),
      "sessionCharacter.conditionsJson",
    );
  }

  private decodeHumanGmConditionEntries(value: unknown): ConditionStateEntry[] {
    if (!Array.isArray(value)) {
      throw new Error("conditions must be an array.");
    }
    return value.map((entry, index) => {
      if (typeof entry === "string") {
        return entry;
      }
      const [condition] = this.conditionRuntime.parseConditionsJson(JSON.stringify([entry]));
      if (!condition) {
        throw new Error(`conditions[${index}] is invalid.`);
      }
      return condition;
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
    nextConditions: ConditionStateEntry[],
  ): CombatResponseDto {
    const aliveParticipants = combat.participants.filter((participant) => participant.isAlive !== false);
    const currentTurnIndex = combat.currentParticipantId ? aliveParticipants.findIndex((participant) => participant.id === combat.currentParticipantId) : -1;
    const currentTurnOrder = combat.participants.find((participant) => participant.id === combat.currentParticipantId)?.turnOrder ?? Number.MAX_SAFE_INTEGER;

    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: this.toSharedCombatStatus(combat.status),
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      roundTurnNo: currentTurnIndex >= 0 ? currentTurnIndex + 1 : 0,
      currentEntityId: combat.currentParticipantId ?? null,
      participants: combat.participants.map((participant) => {
        const conditionEntries =
          participant.id === changedParticipantId ? nextConditions : this.parseHumanGmConditionEntries(participant.conditionsJson);
        return {
          sessionEntityId: participant.id,
          entityType: this.toSharedCombatEntityType(participant.entityType ?? CombatEntityType.MONSTER),
          sessionCharacterId: participant.sessionCharacterId ?? null,
          tokenId: participant.tokenId ?? null,
          name: participant.nameSnapshot,
          currentHp: participant.currentHp ?? null,
          tempHp: null,
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
            extraAttackAvailable: false,
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

  private toHumanGmCombatConditionTags(conditionEntries: ConditionStateEntry[]): string[] {
    const tags = conditionEntries.flatMap((condition) => {
      if (typeof condition === "string") {
        return [condition];
      }
      if (!isRecord(condition)) {
        return [];
      }
      const record = condition;
      return compactPresentStrings([
        typeof record.conditionId === "string" ? record.conditionId : null,
        ...(Array.isArray(record.tags) ? decodeStringArray(record.tags) : []),
      ]);
    });
    return Array.from(new Set(tags));
  }

  private toHumanGmCombatConcentration(runtime: HumanGmRuntime, conditionEntries: ConditionStateEntry[]) {
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
    const transitions = parseJsonOrThrow(
      currentNode.transitionsJson,
      [],
      decodeScenarioTransitionArray,
      "scenarioNode.transitionsJson",
    );
    const explicitTargetIds = transitions
      .flatMap((transition) => (transition.nextNodeId ? [transition.nextNodeId] : []));
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

  private toSharedCombatStatus(value: unknown): CombatStatus {
    switch (value) {
      case PrismaCombatStatus.ACTIVE:
        return CombatStatus.ACTIVE;
      case PrismaCombatStatus.ENDED:
        return CombatStatus.ENDED;
      default:
        return CombatStatus.ACTIVE;
    }
  }

  private toSharedCombatEntityType(value: unknown): CombatEntityType {
    switch (value) {
      case PrismaCombatEntityType.PLAYER_CHARACTER:
        return CombatEntityType.PLAYER_CHARACTER;
      case PrismaCombatEntityType.NPC:
        return CombatEntityType.NPC;
      case PrismaCombatEntityType.MONSTER:
      default:
        return CombatEntityType.MONSTER;
    }
  }
}

function decodeStringArray(value: readonly unknown[]): string[] {
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function compactPresentStrings(value: readonly unknown[]): string[] {
  return value.flatMap((item) => (typeof item === "string" && item ? [item] : []));
}
