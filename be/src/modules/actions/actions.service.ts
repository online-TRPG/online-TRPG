import { Injectable } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionAcceptedResponseDto,
  ActionInputType,
  ActionQueueStatus,
  ActionScope,
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
import { ActionProcessorService } from "./action-processor.service";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly commandParser: CommandParserService,
    private readonly inventoryRuntime: InventoryRuntimeService,
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
      key.includes("healing")
    );
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
  }
}
