import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionAcceptedResponseDto,
  ActionOutcome,
  ActionInputType,
  ActionQueueStatus,
  ActionScope,
  RestActionDto,
  SubmitActionDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
} from "@trpg/shared-types";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { CommandParserService } from "../rules/command-parser.service";
import { InventoryRuntimeService } from "../rules/inventory-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { ActionProcessorService } from "./action-processor.service";

type SrdEquipmentContent = {
  itemId: string;
  quantity: number;
};

type SrdEquipmentRecord = {
  id: string;
  name?: {
    en?: string;
    ko?: string;
    aliases?: string[];
  };
  category?: {
    kind?: string;
    equipmentCategory?: string;
  };
  economy?: {
    weight?: {
      lb?: number;
    } | null;
  };
  weapon?: {
    rangeRaw?: string;
    damage?: {
      dice?: string;
    };
    damageType?: string;
    properties?: Array<{ id?: string; raw?: string }>;
  };
  armor?: {
    category?: string;
    armorClass?: {
      base?: number;
      bonus?: number;
      raw?: string;
    };
    strengthRequirement?:
      | number
      | {
          minimum?: number;
        }
      | null;
    stealthDisadvantage?: boolean;
  };
  use?: {
    damage?: {
      dice?: string;
      raw?: string;
    };
    damageType?: string;
  };
  contents?: SrdEquipmentContent[];
};

@Injectable()
export class ActionsService {
  private srdEquipmentCache: SrdEquipmentRecord[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly commandParser: CommandParserService,
    private readonly inventoryRuntime: InventoryRuntimeService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async submitAction(
    userId: string,
    sessionId: string,
    dto: SubmitActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.characterId)) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_MISMATCH",
      });
    }

    // S14P31A201-71: sessionId+userId 복합키 조회로 본인 sessionCharacter 만 얻지만,
    // 캐릭터 이양/공유 등 향후 기능 대비해 Character.ownerUserId 도 명시 검증.
    if (sessionCharacter.character.ownerUserId !== userId) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_OWNERSHIP_MISMATCH",
      });
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const actionScope = this.resolveActionScope(dto.actionScope, state.phase);
    this.ensureCommandSyntax(dto.rawText);

    await this.ensureScopeAllowed({
      sessionId: session.id,
      userId,
      participantRole: participant.role,
      sessionCharacterId: sessionCharacter.id,
      sessionCharacterCurrentHp: sessionCharacter.currentHp,
      phase: state.phase,
      actionScope,
    });

    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: session.id,
        userId,
        sessionCharacterId: sessionCharacter.id,
        rawText: dto.rawText.trim(),
        inputType: this.resolveInputType(dto),
        actionScope,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: state.version,
        clientCreatedAt: new Date(dto.clientCreatedAt),
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    // MVP에서는 별도 큐 인프라 없이 요청 직후 한 건을 처리한다.
    // DB에는 큐 상태가 남기 때문에 나중에 BullMQ 같은 작업 큐로 옮겨도 API 계약을 유지할 수 있다.
    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: state.version,
    };
  }

  async submitRestAction(
    userId: string,
    sessionId: string,
    dto: RestActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!requester || requester.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const isGmOperator =
      requester.role === PrismaParticipantRole.HOST ||
      requester.role === PrismaParticipantRole.GM;

    const sessionCharacter = isGmOperator
      ? await this.prisma.sessionCharacter.findFirst({
          where: {
            sessionId: session.id,
            status: PrismaSessionCharacterStatus.ACTIVE,
            OR: [
              { id: dto.characterId },
              { characterId: dto.characterId },
            ],
          },
          include: { character: true },
        })
      : await this.prisma.sessionCharacter.findUnique({
          where: {
            sessionId_userId: {
              sessionId: session.id,
              userId,
            },
          },
          include: { character: true },
        });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "휴식할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (!isGmOperator) {
      if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.characterId)) {
        throw forbidden("ACTION_403", "휴식할 캐릭터를 확인할 수 없습니다.", {
          reason: "CHARACTER_MISMATCH",
        });
      }
      if (sessionCharacter.character.ownerUserId !== userId) {
        throw forbidden("ACTION_403", "휴식할 캐릭터를 확인할 수 없습니다.", {
          reason: "CHARACTER_OWNERSHIP_MISMATCH",
        });
      }
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id,
    );
    if (state.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    const rawText =
      dto.restType === "short" && dto.hitDiceToSpend
        ? `/rest short ${dto.hitDiceToSpend}`
        : `/rest ${dto.restType}`;
    if (session.gmMode === PrismaGmMode.HUMAN && !isGmOperator) {
      return this.recordHumanGmRestApprovalRequest({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        stateVersion: state.version,
        sessionCharacterId: sessionCharacter.id,
        userId: sessionCharacter.userId,
        restType: dto.restType,
        hitDiceToSpend: dto.hitDiceToSpend,
        rawText,
      });
    }

    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: session.id,
        userId: sessionCharacter.userId,
        sessionCharacterId: sessionCharacter.id,
        rawText,
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.PARTY_SHARED,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: state.version,
        clientCreatedAt: new Date(),
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: state.version,
    };
  }

  private async recordHumanGmRestApprovalRequest(params: {
    sessionId: string;
    sessionScenarioId: string;
    stateVersion: number;
    sessionCharacterId: string;
    userId: string;
    restType: "short" | "long";
    hitDiceToSpend?: number;
    rawText: string;
  }): Promise<ActionAcceptedResponseDto> {
    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        sessionCharacterId: params.sessionCharacterId,
        rawText: params.rawText,
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.PARTY_SHARED,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
        baseStateVersion: params.stateVersion,
        clientCreatedAt: new Date(),
      },
    });

    this.realtimeEvents.emitActionAccepted(params.sessionId, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      playerActionId: action.id,
      actorUserId: params.userId,
      sessionCharacterId: params.sessionCharacterId,
      rawInput: params.rawText,
      structuredAction: {
        type: "rest",
        restType: params.restType,
        approvalStatus: "gm_required",
        ...(params.restType === "short" && params.hitDiceToSpend
          ? { hitDiceToSpend: params.hitDiceToSpend }
          : {}),
      },
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "휴식 요청이 GM 승인 대기 상태로 기록되었습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);

    return {
      playerActionId: action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.REJECTED,
      baseStateVersion: params.stateVersion,
    };
  }

  async approveRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw badRequest("ACTION_400", "HUMAN GM 세션의 휴식 요청만 승인할 수 있습니다.", {
        reason: "HUMAN_GM_ONLY",
      });
    }

    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });
    const isGmOperator =
      requester?.status === PrismaParticipantStatus.JOINED &&
      (requester.role === PrismaParticipantRole.HOST ||
        requester.role === PrismaParticipantRole.GM);
    if (!isGmOperator) {
      throw forbidden("ACTION_403", "휴식 요청 승인에는 GM 권한이 필요합니다.", {
        reason: "GM_PERMISSION_REQUIRED",
      });
    }

    const action = await this.prisma.playerAction.findUnique({
      where: { id: actionId },
    });
    if (!action || action.sessionId !== session.id) {
      throw badRequest("ACTION_400", "승인할 휴식 요청을 찾을 수 없습니다.", {
        reason: "REST_APPROVAL_REQUEST_NOT_FOUND",
      });
    }
    if (
      action.queueStatus !== PrismaActionQueueStatus.REJECTED ||
      action.failureReason !== "REST_REQUIRES_GM_APPROVAL" ||
      !action.rawText.startsWith("/rest ")
    ) {
      throw badRequest("ACTION_400", "승인 가능한 휴식 요청이 아닙니다.", {
        reason: "INVALID_REST_APPROVAL_REQUEST",
      });
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (state.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    const approvedAction = await this.prisma.playerAction.update({
      where: { id: action.id },
      data: {
        queueStatus: PrismaActionQueueStatus.PENDING,
        failureReason: null,
        processedAt: null,
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: approvedAction.id,
      actorUserId: approvedAction.userId,
      rawText: approvedAction.rawText,
      clientCreatedAt: approvedAction.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: approvedAction.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: action.baseStateVersion,
    };
  }

  async useInventoryItem(
    userId: string,
    sessionId: string,
    dto: UseInventoryItemDto,
  ): Promise<UseInventoryItemResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "아이템을 사용할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (
      dto.targetSessionCharacterId &&
      dto.targetSessionCharacterId !== sessionCharacter.id
    ) {
      throw forbidden("ACTION_403", "현재는 자신의 캐릭터에게만 아이템을 사용할 수 있습니다.", {
        reason: "TARGET_CHARACTER_NOT_OWNED",
      });
    }

    const item = await this.prisma.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: sessionCharacter.id,
        OR: [
          { id: dto.itemId },
          { itemDefinitionId: dto.itemId },
          {
            itemDefinition: {
              is: {
                OR: [
                  { id: dto.itemId },
                  { name: { equals: dto.itemId, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    if (!item || item.quantity < 1) {
      throw badRequest("INVENTORY_400", "사용할 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ITEM_NOT_FOUND",
      });
    }

    if (!this.isBackendUsableInventoryItem(item.itemDefinition)) {
      throw badRequest("INVENTORY_400", "현재 바로 사용할 수 없는 아이템입니다.", {
        reason: "ITEM_NOT_QUICK_USABLE",
      });
    }

    const catalogItem = await this.prisma.item.findUnique({
      where: { id: item.itemDefinitionId },
    });
    const pack = this.resolveSrdPackRecord(item.itemDefinition, catalogItem?.key ?? null);
    if (pack?.contents?.length) {
      await this.unpackInventoryPack(sessionCharacter.id, item.id, pack);
      const updatedCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sessionCharacter.id },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      const mappedCharacter = mapSessionCharacter(updatedCharacter);
      const addedSummary = pack.contents
        .map((content) => {
          const contentRecord = this.findSrdEquipmentById(content.itemId);
          return `${this.getSrdEquipmentName(contentRecord, content.itemId)} x${content.quantity}`;
        })
        .join(", ");
      const message = `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 풀어 내용물을 획득했습니다: ${addedSummary}`;

      this.realtimeEvents.emitCharacterUpdated(session.id, mappedCharacter);
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );

      return {
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: 1,
        healedHp: null,
        message,
        character: mappedCharacter,
      };
    }
    if (this.isPackLikeInventoryItem(item.itemDefinition)) {
      throw badRequest("INVENTORY_400", "꾸러미 내용물 데이터를 찾을 수 없습니다.", {
        reason: "PACK_CONTENTS_NOT_FOUND",
      });
    }

    const healingAmount = this.resolveHealingAmount(item.itemDefinition);
    const healedHp = healingAmount
      ? Math.max(
          0,
          Math.min(
            sessionCharacter.character.maxHp,
            sessionCharacter.currentHp + healingAmount,
          ) - sessionCharacter.currentHp,
        )
      : null;

    if (healingAmount) {
      await this.prisma.sessionCharacter.update({
        where: { id: sessionCharacter.id },
        data: {
          currentHp: {
            increment: healedHp ?? 0,
          },
        },
      });
    }

    await this.inventoryRuntime.removeItem({ entryId: item.id, quantity: 1 });

    const updatedCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
      where: { id: sessionCharacter.id },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const mappedCharacter = mapSessionCharacter(updatedCharacter);
    const message =
      healedHp && healedHp > 0
        ? `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 사용해 HP를 ${healedHp} 회복했습니다.`
        : `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 사용했습니다.`;

    this.realtimeEvents.emitCharacterUpdated(session.id, mappedCharacter);
    this.realtimeEvents.emitSessionSnapshot(
      session.id,
      await this.sessionsService.buildSnapshot(session.id),
    );

    return {
      sessionId: session.id,
      itemId: item.id,
      itemName: item.itemDefinition.name,
      consumedQuantity: 1,
      healedHp,
      message,
      character: mappedCharacter,
    };
  }

  private ensurePlaying(status: PrismaSessionStatus): void {
    if (status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }
  }

  private isBackendUsableInventoryItem(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): boolean {
    const key = this.buildItemSearchKey(item);
    return (
      key.includes("consumable") ||
      key.includes("potion") ||
      key.includes("포션") ||
      key.includes("healing") ||
      this.isPackLikeInventoryItem(item)
    );
  }

  private isPackLikeInventoryItem(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): boolean {
    const key = this.buildItemSearchKey(item);
    return item.itemType === "pack" || key.includes("꾸러미");
  }

  private resolveHealingAmount(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): number | null {
    const key = this.buildItemSearchKey(item);
    return key.includes("healing") || key.includes("치유") ? 7 : null;
  }

  private buildItemSearchKey(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): string {
    const properties = this.parseStringArrayJson(item.propertiesJson);
    return [item.id, item.name, item.itemType, ...properties]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  private async unpackInventoryPack(
    sessionCharacterId: string,
    packEntryId: string,
    pack: SrdEquipmentRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const packEntry = await tx.inventoryEntry.findUnique({
        where: { id: packEntryId },
        include: { itemDefinition: true },
      });
      if (!packEntry || packEntry.sessionCharacterId !== sessionCharacterId || packEntry.quantity < 1) {
        throw badRequest("INVENTORY_400", "사용할 꾸러미를 찾을 수 없습니다.", {
          reason: "INVENTORY_PACK_NOT_FOUND",
        });
      }

      for (const content of pack.contents ?? []) {
        const contentRecord = this.findSrdEquipmentById(content.itemId);
        if (!contentRecord) {
          throw badRequest("INVENTORY_400", "꾸러미 내용물 정의를 찾을 수 없습니다.", {
            reason: "PACK_CONTENT_DEFINITION_NOT_FOUND",
            itemId: content.itemId,
          });
        }
        const quantity = Number.isInteger(content.quantity) && content.quantity > 0 ? content.quantity : 1;
        await tx.itemDefinition.upsert({
          where: { id: contentRecord.id },
          update: this.toItemDefinitionData(contentRecord),
          create: {
            id: contentRecord.id,
            ...this.toItemDefinitionData(contentRecord),
          },
        });
        await tx.inventoryEntry.create({
          data: {
            sessionCharacterId,
            itemDefinitionId: contentRecord.id,
            quantity,
          },
        });
      }

      if (packEntry.quantity > 1) {
        await tx.inventoryEntry.update({
          where: { id: packEntry.id },
          data: { quantity: { decrement: 1 } },
        });
      } else {
        await tx.inventoryEntry.delete({ where: { id: packEntry.id } });
      }
    });

    await this.inventoryRuntime.syncSessionInventorySnapshot(sessionCharacterId);
  }

  private toItemDefinitionData(record: SrdEquipmentRecord): {
    name: string;
    itemType: string;
    weightLb: number | null;
    description: string | null;
    damageDice: string | null;
    damageType: string | null;
    armorClassBase: number | null;
    armorClassBonus: number | null;
    armorStrengthRequirement: number | null;
    armorStealthDisadvantage: boolean | null;
    useEffect: string | null;
    packContentsJson: string | null;
    propertiesJson: string;
  } {
    const properties = [
      "srd-engine",
      record.category?.equipmentCategory,
      ...(record.weapon?.properties ?? []).map((property) => property.id ?? property.raw),
    ].filter((property): property is string => Boolean(property));
    return {
      name: this.getSrdEquipmentName(record, record.id),
      itemType: record.category?.kind ?? "gear",
      weightLb: typeof record.economy?.weight?.lb === "number" ? record.economy.weight.lb : null,
      description: this.buildSrdEquipmentDescription(record),
      damageDice: record.weapon?.damage?.dice ?? null,
      damageType: record.weapon?.damageType ?? null,
      armorClassBase: record.armor?.armorClass?.base ?? null,
      armorClassBonus: record.armor?.armorClass?.bonus ?? null,
      armorStrengthRequirement: this.readArmorStrengthRequirement(record),
      armorStealthDisadvantage: record.armor?.stealthDisadvantage ?? null,
      useEffect: this.buildSrdEquipmentUseEffect(record),
      packContentsJson: this.buildSrdPackContentsJson(record),
      propertiesJson: JSON.stringify([...new Set(properties)]),
    };
  }

  private buildSrdEquipmentDescription(record: SrdEquipmentRecord): string {
    const name = this.getSrdEquipmentName(record, record.id);
    if (record.contents?.length) {
      return `${name}입니다. 사용하면 꾸러미를 풀어 포함된 장비들을 인벤토리에 추가합니다.`;
    }
    if (record.weapon) {
      const damage = record.weapon.damage?.dice
        ? `${record.weapon.damage.dice}${record.weapon.damageType ? ` ${record.weapon.damageType}` : ""} 피해`
        : "무기 피해";
      const range = record.weapon.rangeRaw ? ` 사거리 ${record.weapon.rangeRaw}.` : "";
      return `${name} 무기입니다. 명중 시 ${damage}를 줍니다.${range}`;
    }
    if (record.armor) {
      const armorClass = record.armor.armorClass?.raw
        ? `AC ${record.armor.armorClass.raw}`
        : record.armor.armorClass?.base
          ? `기본 AC ${record.armor.armorClass.base}`
          : record.armor.armorClass?.bonus
            ? `AC +${record.armor.armorClass.bonus}`
            : "AC 보너스";
      return `${name} 방어구입니다. 장착하면 ${armorClass}를 적용합니다.`;
    }
    const useEffect = this.buildSrdEquipmentUseEffect(record);
    if (useEffect) {
      return useEffect;
    }
    return `${name}입니다. 세션 중 보유하거나 상황에 따라 사용할 수 있는 SRD 장비입니다.`;
  }

  private readArmorStrengthRequirement(record: SrdEquipmentRecord): number | null {
    const requirement = record.armor?.strengthRequirement;
    if (typeof requirement === "number") {
      return requirement;
    }
    if (requirement && typeof requirement.minimum === "number") {
      return requirement.minimum;
    }
    return null;
  }

  private buildSrdEquipmentUseEffect(record: SrdEquipmentRecord): string | null {
    const key = this.normalizeEquipmentLookupKey(
      [record.id, record.name?.en, record.name?.ko, record.category?.equipmentCategory]
        .filter(Boolean)
        .join(" "),
    );
    if (key.includes("potionofhealing") || key.includes("치유물약")) {
      return "사용하면 HP를 평균 7점 회복합니다.";
    }
    if (record.use?.damage?.dice) {
      return `사용하면 ${record.use.damage.dice}${record.use.damageType ? ` ${record.use.damageType}` : ""} 피해 효과를 적용합니다.`;
    }
    return null;
  }

  private buildSrdPackContentsJson(record: SrdEquipmentRecord): string | null {
    if (!record.contents?.length) {
      return null;
    }
    return JSON.stringify(
      record.contents.map((content) => {
        const contentRecord = this.findSrdEquipmentById(content.itemId);
        return {
          itemId: content.itemId,
          name: this.getSrdEquipmentName(contentRecord, content.itemId),
          quantity: content.quantity,
        };
      }),
    );
  }

  private resolveSrdPackRecord(
    item: { id: string; name: string; itemType: string; propertiesJson: string | null },
    catalogKey: string | null,
  ): SrdEquipmentRecord | null {
    const keyCandidates = [
      item.id,
      item.name,
      catalogKey,
      catalogKey ? catalogKey.replace(/-/g, " ") : null,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizeEquipmentLookupKey(value));
    return (
      this.loadSrdEquipment().find((record) => {
        if (!record.contents?.length) return false;
        const recordCandidates = [
          record.id,
          record.name?.en,
          record.name?.ko,
          ...(record.name?.aliases ?? []),
        ].map((value) => this.normalizeEquipmentLookupKey(value ?? ""));
        return keyCandidates.some((candidate) => recordCandidates.includes(candidate));
      }) ?? null
    );
  }

  private findSrdEquipmentById(itemId: string): SrdEquipmentRecord | null {
    return this.loadSrdEquipment().find((record) => record.id === itemId) ?? null;
  }

  private loadSrdEquipment(): SrdEquipmentRecord[] {
    if (this.srdEquipmentCache) {
      return this.srdEquipmentCache;
    }

    const candidates = [
      join(process.cwd(), "srd-data", "generated", "srd-engine", "equipment.jsonl"),
      join(process.cwd(), "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
      join(process.cwd(), "..", "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    ];
    const filePath = candidates.find((candidate) => existsSync(candidate));
    if (!filePath) {
      this.srdEquipmentCache = [];
      return this.srdEquipmentCache;
    }

    this.srdEquipmentCache = readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as SrdEquipmentRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is SrdEquipmentRecord => Boolean(record?.id));
    return this.srdEquipmentCache;
  }

  private getSrdEquipmentName(record: SrdEquipmentRecord | null | undefined, fallback: string): string {
    return record?.name?.ko?.trim() || record?.name?.en?.trim() || fallback;
  }

  private normalizeEquipmentLookupKey(value: string): string {
    return value
      .toLowerCase()
      .replace(/equipment[._-]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9가-힣]+/g, "")
      .replace(/s(?=pack$)/g, "");
  }

  private parseStringArrayJson(value: string | null): string[] {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  private resolveActionScope(
    requested: ActionScope | undefined,
    phase: PrismaGamePhase,
  ): PrismaActionScope {
    if (requested) {
      return requested === ActionScope.INDIVIDUAL_TURN
        ? PrismaActionScope.INDIVIDUAL_TURN
        : PrismaActionScope.PARTY_SHARED;
    }

    return phase === PrismaGamePhase.COMBAT
      ? PrismaActionScope.INDIVIDUAL_TURN
      : PrismaActionScope.PARTY_SHARED;
  }

  private resolveInputType(dto: SubmitActionDto): PrismaActionInputType {
    if (dto.inputType === ActionInputType.SELECT) {
      return PrismaActionInputType.SELECT;
    }

    return dto.rawText.trim().startsWith("/")
      ? PrismaActionInputType.COMMAND
      : PrismaActionInputType.TEXT;
  }

  private ensureCommandSyntax(rawText: string): void {
    if (!rawText.trim().startsWith("/")) {
      return;
    }

    const parsed = this.commandParser.parse(rawText);
    if (parsed.type === "unknown") {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "UNKNOWN_COMMAND",
      });
    }
  }

  private async ensureScopeAllowed(params: {
    sessionId: string;
    userId: string;
    participantRole: PrismaParticipantRole;
    sessionCharacterId: string;
    sessionCharacterCurrentHp: number;
    phase: PrismaGamePhase;
    actionScope: PrismaActionScope;
  }): Promise<void> {
    if (params.actionScope === PrismaActionScope.PARTY_SHARED) {
      if (params.phase === PrismaGamePhase.COMBAT) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "PARTY_ACTION_BLOCKED_IN_COMBAT",
        });
      }

      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: params.sessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (participantCount > 1 && params.participantRole !== PrismaParticipantRole.HOST) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "NOT_PARTY_REPRESENTATIVE",
        });
      }

      return;
    }

    if (params.phase !== PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "INDIVIDUAL_TURN_REQUIRES_COMBAT",
      });
    }

    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: "ACTIVE",
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });

    const current = combat?.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

    if (!combat || current?.sessionCharacterId !== params.sessionCharacterId) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "NOT_YOUR_TURN",
      });
    }

    // S14P31A201-80: 전투 중 HP 0 (기절/사망) 상태 캐릭터의 행동을 차단한다.
    // 비전투 시 narrative 자유도를 위해 검사하지 않는다 — UI 의 isAlive 플래그도
    // 전투 액션(MOVE/ATTACK/CHECK/READY/END_TURN)에 한해 사용된다 (action-rule.service.ts 참고).
    if (params.sessionCharacterCurrentHp <= 0) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_INCAPACITATED",
      });
    }
  }
}
