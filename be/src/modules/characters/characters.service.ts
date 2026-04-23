import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SessionStatus as PrismaSessionStatus } from "@prisma/client";
import {
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  SessionCharacterResponseDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
} from "@trpg/shared-types";
import { mapCharacter, mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { SessionsService } from "../sessions/sessions.service";

const defaultAbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<CharacterResponseDto> {
    await this.ensureUserExists(userId);

    const character = await this.prisma.character.create({
      data: {
        ownerUserId: userId,
        name: dto.name.trim(),
        ancestry: dto.ancestry.trim(),
        className: dto.className.trim(),
        level: dto.level ?? 1,
        abilitiesJson: JSON.stringify(dto.abilities ?? defaultAbilityScores),
        proficiencyBonus: dto.proficiencyBonus ?? 2,
        proficientSkillsJson: JSON.stringify(dto.proficientSkills ?? []),
        maxHp: dto.maxHp ?? 10,
        armorClass: dto.armorClass ?? 10,
        speed: dto.speed ?? 30,
        inventoryJson: JSON.stringify(dto.inventory ?? []),
        equippedWeaponId: dto.equippedWeaponId ?? null,
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

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        name: dto.name?.trim() ?? existing.name,
        ancestry: dto.ancestry?.trim() ?? existing.ancestry,
        className: dto.className?.trim() ?? existing.className,
        level: dto.level ?? existing.level,
        abilitiesJson: JSON.stringify(dto.abilities ?? JSON.parse(existing.abilitiesJson)),
        proficiencyBonus: dto.proficiencyBonus ?? existing.proficiencyBonus,
        proficientSkillsJson: JSON.stringify(
          dto.proficientSkills ?? JSON.parse(existing.proficientSkillsJson),
        ),
        maxHp: dto.maxHp ?? existing.maxHp,
        armorClass: dto.armorClass ?? existing.armorClass,
        speed: dto.speed ?? existing.speed,
        inventoryJson: JSON.stringify(dto.inventory ?? JSON.parse(existing.inventoryJson)),
        equippedWeaponId:
          dto.equippedWeaponId === undefined ? existing.equippedWeaponId : dto.equippedWeaponId,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    return mapCharacter(updated);
  }

  async deleteCharacter(userId: string, characterId: string): Promise<void> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);

    const activeAssignment = character.sessionCharacters.find((assignment) =>
      assignment.session.status !== PrismaSessionStatus.COMPLETED,
    );

    if (activeAssignment) {
      throw new ConflictException("This character is currently assigned to an active session.");
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
        level: source.level,
        abilitiesJson: source.abilitiesJson,
        proficiencyBonus: source.proficiencyBonus,
        proficientSkillsJson: source.proficientSkillsJson,
        maxHp: source.maxHp,
        armorClass: source.armorClass,
        speed: source.speed,
        inventoryJson: source.inventoryJson,
        equippedWeaponId: source.equippedWeaponId,
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
      where: { sessionId },
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
}
