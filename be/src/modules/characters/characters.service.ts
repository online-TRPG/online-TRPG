import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  CharacterAvatarType,
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  MVP_CHARACTER_LEVEL,
  MVP_CLASS_VALUES,
  MVP_RACE_VALUES,
  SessionCharacterResponseDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
} from "@trpg/shared-types";
import { mapCharacter, mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";

const defaultAbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

const mvpClassLookup = new Map(MVP_CLASS_VALUES.map((value) => [value.toLowerCase(), value]));
const mvpRaceLookup = new Map(MVP_RACE_VALUES.map((value) => [value.toLowerCase(), value]));

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<CharacterResponseDto> {
    await this.ensureUserExists(userId);
    const mvpCharacter = this.normalizeMvpCharacterInput(dto);

    const character = await this.prisma.character.create({
      data: {
        ownerUserId: userId,
        name: dto.name.trim(),
        ancestry: mvpCharacter.ancestry,
        className: mvpCharacter.className,
        subclassName: dto.subclassName?.trim() ?? null,
        level: mvpCharacter.level,
        bio: dto.bio?.trim() ?? null,
        abilitiesJson: JSON.stringify(dto.abilities ?? defaultAbilityScores),
        proficiencyBonus: dto.proficiencyBonus ?? 2,
        featuresJson: JSON.stringify(dto.features ?? []),
        proficientSkillsJson: JSON.stringify(dto.proficientSkills ?? []),
        maxHp: dto.maxHp ?? 10,
        armorClass: dto.armorClass ?? 10,
        speed: dto.speed ?? 30,
        inventoryJson: JSON.stringify(dto.inventory ?? []),
        equippedWeaponId: dto.equippedWeaponId ?? null,
        avatarType: this.toAvatarType(dto.avatarType),
        avatarPresetId: dto.avatarPresetId ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        avatarUpdatedAt: dto.avatarPresetId || dto.avatarUrl ? new Date() : null,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    return mapCharacter(character);
  }

  async listMyCharacters(userId: string): Promise<CharacterResponseDto[]> {
    await this.ensureUserExists(userId);

    const characters = await this.prisma.character.findMany({
      where: { ownerUserId: userId },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return characters.map(mapCharacter);
  }

  async getCharacter(userId: string, characterId: string): Promise<CharacterResponseDto> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);
    return mapCharacter(character);
  }

  async updateCharacter(
    userId: string,
    characterId: string,
    dto: UpdateCharacterDto,
  ): Promise<CharacterResponseDto> {
    const existing = await this.getOwnedCharacterOrThrow(userId, characterId);
    const mvpCharacter = this.normalizeMvpCharacterUpdateInput(dto, {
      ancestry: existing.ancestry,
      className: existing.className,
      level: existing.level,
    });

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        name: dto.name?.trim() ?? existing.name,
        ancestry: mvpCharacter.ancestry,
        className: mvpCharacter.className,
        subclassName:
          dto.subclassName === undefined ? existing.subclassName : dto.subclassName?.trim() ?? null,
        level: mvpCharacter.level,
        bio: dto.bio === undefined ? existing.bio : dto.bio.trim(),
        abilitiesJson: JSON.stringify(dto.abilities ?? JSON.parse(existing.abilitiesJson)),
        proficiencyBonus: dto.proficiencyBonus ?? existing.proficiencyBonus,
        featuresJson: JSON.stringify(dto.features ?? JSON.parse(existing.featuresJson ?? "[]")),
        proficientSkillsJson: JSON.stringify(
          dto.proficientSkills ?? JSON.parse(existing.proficientSkillsJson),
        ),
        maxHp: dto.maxHp ?? existing.maxHp,
        armorClass: dto.armorClass ?? existing.armorClass,
        speed: dto.speed ?? existing.speed,
        inventoryJson: JSON.stringify(dto.inventory ?? JSON.parse(existing.inventoryJson)),
        equippedWeaponId:
          dto.equippedWeaponId === undefined ? existing.equippedWeaponId : dto.equippedWeaponId,
        avatarType:
          dto.avatarType === undefined ? existing.avatarType : this.toAvatarType(dto.avatarType),
        avatarPresetId:
          dto.avatarPresetId === undefined ? existing.avatarPresetId : dto.avatarPresetId,
        avatarUrl: dto.avatarUrl === undefined ? existing.avatarUrl : dto.avatarUrl,
        avatarUpdatedAt:
          dto.avatarType !== undefined || dto.avatarPresetId !== undefined || dto.avatarUrl !== undefined
            ? new Date()
            : existing.avatarUpdatedAt,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    const lobbyAssignments = updated.sessionCharacters.filter(
      (assignment) => assignment.session.status === PrismaSessionStatus.RECRUITING,
    );

    for (const assignment of lobbyAssignments) {
      await this.prisma.sessionCharacter.update({
        where: { id: assignment.id },
        data: {
          currentHp: updated.maxHp,
          inventorySnapshotJson: updated.inventoryJson,
        },
      });

      await this.prisma.sessionParticipant.update({
        where: {
          sessionId_userId: {
            sessionId: assignment.sessionId,
            userId: assignment.userId,
          },
        },
        data: {
          isReady: false,
          readyAt: null,
        },
      });

      this.realtimeEvents.emitSessionSnapshot(
        assignment.sessionId,
        await this.sessionsService.buildSnapshot(assignment.sessionId),
      );
    }

    return mapCharacter(updated);
  }

  async deleteCharacter(userId: string, characterId: string): Promise<void> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);

    const activeAssignment = character.sessionCharacters.find((assignment) =>
      assignment.session.status !== PrismaSessionStatus.COMPLETED &&
      assignment.session.status !== PrismaSessionStatus.DISBANDED,
    );

    if (activeAssignment) {
      throw new ConflictException("활동 중인 세션에서 사용 중인 캐릭터는 삭제할 수 없습니다. 해당 캐릭터를 선택 해제한 후 다시 시도해주세요.");
    }

    await this.prisma.character.delete({
      where: { id: characterId },
    });
  }

  async cloneCharacter(userId: string, characterId: string): Promise<CharacterResponseDto> {
    const source = await this.getOwnedCharacterOrThrow(userId, characterId);

    const clone = await this.prisma.character.create({
      data: {
        ownerUserId: source.ownerUserId,
        name: `${source.name} Copy`,
        ancestry: source.ancestry,
        className: source.className,
        subclassName: source.subclassName,
        level: source.level,
        abilitiesJson: source.abilitiesJson,
        proficiencyBonus: source.proficiencyBonus,
        featuresJson: source.featuresJson,
        proficientSkillsJson: source.proficientSkillsJson,
        maxHp: source.maxHp,
        armorClass: source.armorClass,
        speed: source.speed,
        inventoryJson: source.inventoryJson,
        equippedWeaponId: source.equippedWeaponId,
        bio: source.bio,
        avatarType: source.avatarType,
        avatarPresetId: source.avatarPresetId,
        avatarUrl: source.avatarUrl,
        avatarUpdatedAt: source.avatarUpdatedAt,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    return mapCharacter(clone);
  }

  async getCharacterInventory(
    userId: string,
    characterId: string,
  ): Promise<CharacterInventoryResponseDto> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);

    return {
      characterId: character.id,
      inventory: JSON.parse(character.inventoryJson) as CharacterInventoryResponseDto["inventory"],
      equippedWeaponId: character.equippedWeaponId ?? null,
    };
  }

  async updateCharacterEquipment(
    userId: string,
    characterId: string,
    dto: UpdateCharacterEquipmentDto,
  ): Promise<CharacterResponseDto> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        equippedWeaponId:
          dto.equippedWeaponId === undefined ? character.equippedWeaponId : dto.equippedWeaponId,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    return mapCharacter(updated);
  }

  async listSessionCharacters(
    userId: string,
    sessionId: string,
  ): Promise<SessionCharacterResponseDto[]> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId,
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });

    return sessionCharacters.map(mapSessionCharacter);
  }

  private async getOwnedCharacterOrThrow(userId: string, characterId: string) {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} was not found.`);
    }

    if (character.ownerUserId !== userId) {
      throw new ForbiddenException("You do not own this character.");
    }

    return character;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    }).catch(() => {
      throw new NotFoundException(`User ${userId} was not found.`);
    });
  }

  private normalizeMvpCharacterInput(dto: CreateCharacterDto): {
    ancestry: string;
    className: string;
    level: number;
  } {
    return {
      ancestry: this.normalizeMvpRace(dto.ancestry),
      className: this.normalizeMvpClass(dto.className),
      level: this.normalizeMvpLevel(dto.level),
    };
  }

  private normalizeMvpCharacterUpdateInput(
    dto: UpdateCharacterDto,
    existing: { ancestry: string; className: string; level: number },
  ): {
    ancestry: string;
    className: string;
    level: number;
  } {
    return {
      ancestry: this.normalizeMvpRace(dto.ancestry ?? existing.ancestry),
      className: this.normalizeMvpClass(dto.className ?? existing.className),
      level: this.normalizeMvpLevel(dto.level ?? existing.level),
    };
  }

  private normalizeMvpRace(value: string): string {
    const normalized = value.trim().toLowerCase();
    const race = mvpRaceLookup.get(normalized);
    if (!race) {
      throw new BadRequestException(`MVP에서는 ${MVP_RACE_VALUES.join(", ")} 종족만 선택할 수 있습니다.`);
    }
    return race;
  }

  private normalizeMvpClass(value: string): string {
    const normalized = value.trim().toLowerCase();
    const className = mvpClassLookup.get(normalized);
    if (!className) {
      throw new BadRequestException(`MVP에서는 ${MVP_CLASS_VALUES.join(", ")} 클래스만 선택할 수 있습니다.`);
    }
    return className;
  }

  private normalizeMvpLevel(value: number | undefined): number {
    const level = value ?? MVP_CHARACTER_LEVEL;
    if (level !== MVP_CHARACTER_LEVEL) {
      throw new BadRequestException(`MVP 캐릭터 레벨은 ${MVP_CHARACTER_LEVEL}로 고정됩니다.`);
    }
    return MVP_CHARACTER_LEVEL;
  }

  private toAvatarType(value?: CharacterAvatarType): PrismaCharacterAvatarType {
    switch (value) {
      case CharacterAvatarType.PRESET:
        return PrismaCharacterAvatarType.PRESET;
      case CharacterAvatarType.UPLOAD:
        return PrismaCharacterAvatarType.UPLOAD;
      case CharacterAvatarType.DEFAULT:
      default:
        return PrismaCharacterAvatarType.DEFAULT;
    }
  }
}
