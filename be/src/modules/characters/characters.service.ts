import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CharacterResponseDto,
  CreateCharacterDto,
  UpdateCharacterDto,
} from "@trpg/shared-types";
import { mapCharacter } from "../../common/mappers/domain.mapper";
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

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async createCharacter(
    userId: string,
    dto: CreateCharacterDto,
  ): Promise<CharacterResponseDto> {
    // 세션에 실제로 참가한 사용자만 캐릭터를 만들 수 있게 하고,
    // 한 세션 안에서는 사용자당 캐릭터 1개만 허용한다.
    await this.sessionsService.ensureMembership(userId, dto.sessionId);
    await this.sessionsService.ensureNoCharacterForUser(userId, dto.sessionId);

    const currentHp = dto.currentHp ?? dto.maxHp ?? 10;
    const maxHp = dto.maxHp ?? 10;
    // 저장 시점에 잘못된 HP 조합을 막아두면
    // 이후 상태 조회나 실시간 이벤트에서는 별도 보정 없이 그대로 믿고 사용할 수 있다.
    if (currentHp > maxHp) {
      throw new ConflictException("currentHp cannot exceed maxHp.");
    }

    const character = await this.prisma.$transaction(async (tx) => {
      const created = await tx.character.create({
        data: {
          sessionId: dto.sessionId,
          ownerUserId: userId,
          name: dto.name.trim(),
          ancestry: dto.ancestry.trim(),
          className: dto.className.trim(),
          level: dto.level ?? 1,
          abilitiesJson: JSON.stringify(dto.abilities ?? defaultAbilityScores),
          proficiencyBonus: dto.proficiencyBonus ?? 2,
          proficientSkillsJson: JSON.stringify(dto.proficientSkills ?? []),
          maxHp,
          currentHp,
          tempHp: dto.tempHp ?? 0,
          armorClass: dto.armorClass ?? 10,
          speed: dto.speed ?? 30,
          inventoryJson: JSON.stringify(dto.inventory ?? []),
          equippedWeaponId: dto.equippedWeaponId,
          conditionsJson: JSON.stringify(dto.conditions ?? []),
        },
      });

      // participant에도 characterId를 함께 저장한다.
      // 이렇게 해두면 참가자 목록만 조회해도
      // "누가 아직 캐릭터를 만들지 않았는지"를 바로 판단할 수 있다.
      await tx.sessionParticipant.update({
        where: {
          sessionId_userId: {
            sessionId: dto.sessionId,
            userId,
          },
        },
        data: {
          characterId: created.id,
        },
      });

      return created;
    });

    const response = mapCharacter(character);
    // 같은 세션을 보고 있는 클라이언트가 즉시 캐릭터 목록을 갱신할 수 있도록 알린다.
    this.realtimeEvents.emitCharacterUpdated(character.sessionId, response);
    return response;
  }

  async listCharacters(
    userId: string,
    sessionId: string,
  ): Promise<CharacterResponseDto[]> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    const characters = await this.prisma.character.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return characters.map(mapCharacter);
  }

  async updateCharacter(
    userId: string,
    characterId: string,
    dto: UpdateCharacterDto,
  ): Promise<CharacterResponseDto> {
    // 수정은 캐릭터 주인만 할 수 있다.
    // create 쪽의 세션 권한 검사와 별개로, update는 소유권 검사까지 추가로 확인해야 한다.
    const existing = await this.prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!existing) {
      throw new NotFoundException(`Character ${characterId} was not found.`);
    }

    if (existing.ownerUserId !== userId) {
      throw new ForbiddenException("You do not own this character.");
    }

    const nextMaxHp = dto.maxHp ?? existing.maxHp;
    const nextCurrentHp = dto.currentHp ?? existing.currentHp;

    // 수정할 때도 현재 HP가 최대 HP를 넘지 않도록 같은 규칙을 유지한다.
    // 생성 때만 막고 수정 때 허용하면 데이터 정합성이 깨질 수 있다.
    if (nextCurrentHp > nextMaxHp) {
      throw new ConflictException("currentHp cannot exceed maxHp.");
    }

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
        maxHp: nextMaxHp,
        currentHp: nextCurrentHp,
        tempHp: dto.tempHp ?? existing.tempHp,
        armorClass: dto.armorClass ?? existing.armorClass,
        speed: dto.speed ?? existing.speed,
        inventoryJson: JSON.stringify(dto.inventory ?? JSON.parse(existing.inventoryJson)),
        // equippedWeaponId는 의미가 두 가지라서 따로 구분해서 처리한다.
        // undefined는 "이 필드는 이번 요청에서 건드리지 않음"이고,
        // null은 "현재 장착 무기를 해제함"이므로 그대로 저장해야 한다.
        equippedWeaponId:
          dto.equippedWeaponId === undefined
            ? existing.equippedWeaponId
            : dto.equippedWeaponId,
        conditionsJson: JSON.stringify(dto.conditions ?? JSON.parse(existing.conditionsJson)),
      },
    });

    const response = mapCharacter(updated);
    // 수정 결과도 실시간으로 흘려 보내야 다른 참가자 화면이 바로 최신 상태로 맞춰진다.
    this.realtimeEvents.emitCharacterUpdated(updated.sessionId, response);
    return response;
  }
}
