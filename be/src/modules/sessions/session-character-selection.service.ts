import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  InventoryItemDto,
  isRecord,
  SessionParticipantResponseDto,
} from "@trpg/shared-types";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { parseJsonOrThrow } from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";
import { SessionInventoryService } from "./session-inventory.service";
import { SessionParticipantStatusService } from "./session-participant-status.service";

@Injectable()
export class SessionCharacterSelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService,
    private readonly sessionInventory: SessionInventoryService,
    private readonly sessionParticipantStatus: SessionParticipantStatusService,
  ) {}

  async selectCharacter(params: {
    sessionId: string;
    userId: string;
    sessionStatus: PrismaSessionStatus;
    characterId?: string | null;
    getScenarioForSelectionValidation: () => Promise<{
      scenario: {
        title?: string | null;
        startLevel?: number | null;
        recommendedEndLevel?: number | null;
      };
    }>;
  }): Promise<SessionParticipantResponseDto> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before selecting a character.");
    }

    if (participant.role === PrismaParticipantRole.GM) {
      throw new ConflictException("The HUMAN GM does not select a player character.");
    }

    if (params.sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Characters can only be selected while the session is recruiting.");
    }

    if (!params.characterId) {
      await this.prisma.sessionCharacter.deleteMany({
        where: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      });

      return this.sessionParticipantStatus.clearReadyState({
        sessionId: params.sessionId,
        participantId: participant.id,
      });
    }

    const character = await this.prisma.character.findUnique({
      where: { id: params.characterId },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${params.characterId} was not found.`);
    }

    if (character.ownerUserId !== params.userId) {
      throw new ForbiddenException("You can only select your own character.");
    }

    const activeAssignment = character.sessionCharacters.find(
      (assignment) =>
        assignment.sessionId !== params.sessionId &&
        assignment.session.status !== PrismaSessionStatus.COMPLETED &&
        assignment.session.status !== PrismaSessionStatus.DISBANDED,
    );

    if (activeAssignment) {
      throw new ConflictException(
        "이미 다른 세션에서 플레이 중인 캐릭터입니다. 다른 세션에서 해당 캐릭터를 선택 해제한 후 다시 시도해주세요.",
      );
    }

    const activeScenario = await params.getScenarioForSelectionValidation();
    this.campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel({
      characterName: character.name,
      characterLevel: character.level,
      scenario: activeScenario.scenario,
    });
    const inventory = parseJsonOrThrow(
      character.inventoryJson,
      [],
      decodeInventoryItemsForSelection,
      "character.inventoryJson",
    );
    const inventorySnapshotJson = JSON.stringify(inventory);

    const sessionCharacter = await this.prisma.sessionCharacter.upsert({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      update: {
        characterId: character.id,
        status: PrismaSessionCharacterStatus.ACTIVE,
        currentHp: character.maxHp,
        tempHp: 0,
        conditionsJson: JSON.stringify([]),
        inventorySnapshotJson,
      },
      create: {
        sessionId: params.sessionId,
        userId: params.userId,
        characterId: character.id,
        status: PrismaSessionCharacterStatus.ACTIVE,
        currentHp: character.maxHp,
        tempHp: 0,
        conditionsJson: JSON.stringify([]),
        inventorySnapshotJson,
      },
      include: { character: true },
    });

    await this.sessionInventory.replaceSessionInventoryEntries(
      sessionCharacter.id,
      inventory,
    );
    const sessionCharacterWithInventory =
      await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sessionCharacter.id },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

    const mappedParticipant = await this.sessionParticipantStatus.clearReadyState({
      sessionId: params.sessionId,
      participantId: participant.id,
    });

    this.realtimeEvents.emitCharacterUpdated(
      params.sessionId,
      mapSessionCharacter(sessionCharacterWithInventory),
    );
    return mappedParticipant;
  }

}

function decodeInventoryItemsForSelection(value: unknown): InventoryItemDto[] {
  if (!Array.isArray(value)) {
    throw new Error("character inventory must be an array.");
  }
  return value.flatMap((entry) => decodeInventoryItemForSelection(entry));
}

function decodeInventoryItemForSelection(value: unknown): InventoryItemDto[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return [];
  }
  const item: InventoryItemDto = {
    id: value.id,
    name: value.name,
    quantity: readPositiveIntegerOrFallback(value.quantity, 1),
  };
  if (typeof value.itemDefinitionId === "string") item.itemDefinitionId = value.itemDefinitionId;
  if (typeof value.itemType === "string") item.itemType = value.itemType;
  if (typeof value.description === "string") item.description = value.description;
  if (isNonNegativeFiniteNumber(value.weightLb)) item.weightLb = value.weightLb;
  if (isNonNegativeFiniteNumber(value.volumeCuFt)) item.volumeCuFt = value.volumeCuFt;
  if (typeof value.damageDice === "string") item.damageDice = value.damageDice;
  if (typeof value.damageType === "string") item.damageType = value.damageType;
  if (isNonNegativeInteger(value.rangeFt)) item.rangeFt = value.rangeFt;
  if (isNonNegativeInteger(value.longRangeFt)) item.longRangeFt = value.longRangeFt;
  if (isNonNegativeInteger(value.armorClassBase)) item.armorClassBase = value.armorClassBase;
  if (isFiniteNumber(value.armorClassBonus)) item.armorClassBonus = value.armorClassBonus;
  if (isNonNegativeInteger(value.armorStrengthRequirement)) item.armorStrengthRequirement = value.armorStrengthRequirement;
  if (typeof value.armorStealthDisadvantage === "boolean") item.armorStealthDisadvantage = value.armorStealthDisadvantage;
  if (typeof value.useEffect === "string") item.useEffect = value.useEffect;
  return [item];
}

function readPositiveIntegerOrFallback(value: unknown, fallback: number): number {
  return isPositiveInteger(value) ? value : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
