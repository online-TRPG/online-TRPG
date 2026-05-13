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
  AbilityScoresDto,
  CharacterAvatarType,
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  InventoryItemDto,
  POINT_BUY_COST,
  POINT_BUY_MAX_BASE,
  POINT_BUY_MIN_BASE,
  POINT_BUY_TOTAL,
  RaceAbilityIncreaseDto,
  SessionCharacterResponseDto,
  StartingEquipmentDto,
  StartingSpellsDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
} from "@trpg/shared-types";
import { mapCharacter, mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { RacesService } from "../races/races.service";
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

// 능력치 범위: D&D 5e 공식 상한 20 + 매직 아이템/주문 보정 여유로 30. Point Buy(8~15)는 별도로 검사.
const ABILITY_SCORE_MIN = 1;
const ABILITY_SCORE_MAX = 30;

// PATCH 류를 막는 세션 상태. RECRUITING/COMPLETED/DISBANDED 는 수정 허용.
const LOCKED_SESSION_STATUSES: ReadonlySet<PrismaSessionStatus> = new Set([
  PrismaSessionStatus.PLAYING,
  PrismaSessionStatus.PAUSED,
]);

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly racesService: RacesService,
    private readonly catalogService: CatalogService,
  ) {}

  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<CharacterResponseDto> {
    await this.ensureUserExists(userId);

    const level = dto.level ?? 1;
    const scenarioId = await this.resolveScenarioForLevel(dto.scenarioId ?? null, level);
    const ancestry = dto.ancestry.trim();
    const abilities = dto.abilities ?? defaultAbilityScores;
    this.validateAbilitiesRange(abilities);
    await this.validatePointBuyForAncestry(ancestry, abilities);
    const className = dto.className.trim();
    if (dto.proficientSkills) {
      await this.validateProficientSkills(className, dto.proficientSkills);
    }
    const inventoryFromEquipment = await this.resolveStartingEquipment(
      className,
      dto.startingEquipmentSelection,
    );
    const inventory = inventoryFromEquipment ?? dto.inventory ?? [];
    await this.validateInventoryAndEquippedWeapon(inventory, dto.equippedWeaponId ?? null);
    const spellsJsonValue = await this.resolveStartingSpells(className, dto.startingSpells);
    const { proficiencyBonus, maxHp } = await this.resolveLevelStats(
      className,
      level,
      abilities,
      dto.proficiencyBonus,
      dto.maxHp,
    );

    const character = await this.prisma.character.create({
      data: {
        ownerUserId: userId,
        scenarioId,
        name: dto.name.trim(),
        ancestry,
        className,
        subclassName: dto.subclassName?.trim() ?? null,
        level,
        bio: dto.bio?.trim() ?? null,
        abilitiesJson: JSON.stringify(abilities),
        proficiencyBonus,
        featuresJson: JSON.stringify(dto.features ?? []),
        proficientSkillsJson: JSON.stringify(dto.proficientSkills ?? []),
        maxHp,
        armorClass: dto.armorClass ?? 10,
        speed: dto.speed ?? 30,
        inventoryJson: JSON.stringify(inventory),
        spellsJson: spellsJsonValue,
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
    await this.assertCharacterNotLocked(characterId);

    // 변경 후 최종 상태 — 검증과 레벨 통계 재계산용
    const finalAbilities: AbilityScoresDto =
      dto.abilities ?? (JSON.parse(existing.abilitiesJson) as AbilityScoresDto);
    const finalAncestry = dto.ancestry?.trim() ?? existing.ancestry;
    const finalClassName = dto.className?.trim() ?? existing.className;
    const finalLevel = dto.level ?? existing.level;
    const finalInventory: InventoryItemDto[] =
      dto.inventory ?? (JSON.parse(existing.inventoryJson) as InventoryItemDto[]);
    const finalEquippedWeaponId =
      dto.equippedWeaponId === undefined ? existing.equippedWeaponId : dto.equippedWeaponId;

    if (dto.abilities !== undefined) {
      this.validateAbilitiesRange(finalAbilities);
      await this.validatePointBuyForAncestry(finalAncestry, finalAbilities);
    }
    if (dto.proficientSkills !== undefined) {
      await this.validateProficientSkills(finalClassName, dto.proficientSkills);
    }
    if (dto.inventory !== undefined || dto.equippedWeaponId !== undefined) {
      await this.validateInventoryAndEquippedWeapon(finalInventory, finalEquippedWeaponId);
    }

    // abilities/level/className/maxHp/proficiencyBonus 중 어느 하나라도 변경되면 룰북 공식 재계산.
    // - dto 가 maxHp/proficiencyBonus 보냈으면 공식과 일치 검증 (mismatch → throw).
    // - 안 보냈으면 공식값으로 자동 갱신 (legacy 행이 새 abilities/level 과 어긋나지 않게).
    const needsLevelStats =
      dto.abilities !== undefined ||
      dto.level !== undefined ||
      dto.className !== undefined ||
      dto.maxHp !== undefined ||
      dto.proficiencyBonus !== undefined;
    const resolvedStats = needsLevelStats
      ? await this.resolveLevelStats(
          finalClassName,
          finalLevel,
          finalAbilities,
          dto.proficiencyBonus,
          dto.maxHp,
        )
      : null;

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        name: dto.name?.trim() ?? existing.name,
        ancestry: finalAncestry,
        className: finalClassName,
        subclassName:
          dto.subclassName === undefined ? existing.subclassName : dto.subclassName?.trim() ?? null,
        level: finalLevel,
        bio: dto.bio === undefined ? existing.bio : dto.bio.trim(),
        abilitiesJson: JSON.stringify(finalAbilities),
        proficiencyBonus:
          resolvedStats?.proficiencyBonus ?? dto.proficiencyBonus ?? existing.proficiencyBonus,
        featuresJson: JSON.stringify(dto.features ?? JSON.parse(existing.featuresJson ?? "[]")),
        proficientSkillsJson: JSON.stringify(
          dto.proficientSkills ?? JSON.parse(existing.proficientSkillsJson),
        ),
        maxHp: resolvedStats?.maxHp ?? dto.maxHp ?? existing.maxHp,
        armorClass: dto.armorClass ?? existing.armorClass,
        speed: dto.speed ?? existing.speed,
        inventoryJson: JSON.stringify(finalInventory),
        equippedWeaponId: finalEquippedWeaponId,
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
    await this.assertCharacterNotLocked(characterId);

    const clone = await this.prisma.character.create({
      data: {
        ownerUserId: source.ownerUserId,
        scenarioId: source.scenarioId,
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
        spellsJson: source.spellsJson,
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
    await this.assertCharacterNotLocked(characterId);

    const finalEquippedWeaponId =
      dto.equippedWeaponId === undefined ? character.equippedWeaponId : dto.equippedWeaponId;
    if (dto.equippedWeaponId !== undefined) {
      const inventory = JSON.parse(character.inventoryJson) as InventoryItemDto[];
      await this.validateInventoryAndEquippedWeapon(inventory, finalEquippedWeaponId);
    }

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        equippedWeaponId: finalEquippedWeaponId,
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

  private async resolveScenarioForLevel(
    scenarioId: string | null,
    level: number,
  ): Promise<string | null> {
    if (!scenarioId) {
      return null;
    }

    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true, startLevel: true },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${scenarioId} was not found.`);
    }

    if (level !== scenario.startLevel) {
      throw new BadRequestException(
        `캐릭터 레벨(${level})이 시나리오 시작 레벨(${scenario.startLevel})과 일치하지 않습니다.`,
      );
    }

    return scenario.id;
  }

  // ancestry(종족 키 또는 이름)에 해당하는 Race row 가 있으면 Point Buy 규칙 강제.
  // 시드에 없는 ancestry(예: 'Unknown' 또는 legacy 자유 입력)는 검증 skip — 기존 캐릭터 호환.
  private async validatePointBuyForAncestry(
    ancestry: string,
    abilities: AbilityScoresDto,
  ): Promise<void> {
    const race = await this.findRaceForAncestry(ancestry);
    if (!race) {
      return;
    }

    const increases = JSON.parse(race.abilityIncreasesJson) as RaceAbilityIncreaseDto;
    const finalScores: Record<keyof AbilityScoresDto, number> = {
      str: abilities.str,
      dex: abilities.dex,
      con: abilities.con,
      int: abilities.int,
      wis: abilities.wis,
      cha: abilities.cha,
    };

    let totalCost = 0;
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
      const base = finalScores[key] - (increases[key] ?? 0);
      if (!Number.isInteger(base) || base < POINT_BUY_MIN_BASE || base > POINT_BUY_MAX_BASE) {
        throw new BadRequestException(
          `Point Buy: ${key.toUpperCase()} 기본 능력치(${base})가 허용 범위(${POINT_BUY_MIN_BASE}~${POINT_BUY_MAX_BASE})를 벗어났습니다. (종족 보정 ${increases[key] ?? 0} 차감 후 값)`,
        );
      }
      totalCost += POINT_BUY_COST[base] ?? 0;
    }

    if (totalCost !== POINT_BUY_TOTAL) {
      throw new BadRequestException(
        `Point Buy: 총 비용 ${totalCost}점이 ${POINT_BUY_TOTAL}점과 일치하지 않습니다.`,
      );
    }
  }

  // 능력치 6종 모두 ABILITY_SCORE_MIN..ABILITY_SCORE_MAX 정수. 종족 보정 후 최종값 기준.
  // Point Buy 와 별개 sanity check — 시드에 없는 종족(legacy)도 적용.
  private validateAbilitiesRange(abilities: AbilityScoresDto): void {
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
      const score = abilities[key];
      if (!Number.isInteger(score) || score < ABILITY_SCORE_MIN || score > ABILITY_SCORE_MAX) {
        throw new BadRequestException(
          `능력치 범위: ${key.toUpperCase()}(${score})가 허용 범위(${ABILITY_SCORE_MIN}~${ABILITY_SCORE_MAX})를 벗어났습니다.`,
        );
      }
    }
  }

  // 클래스 시드의 skillChoices/skillChoiceCount 와 일치 검증.
  // - skillChoiceCount === 0 (시드에 없는 className 포함) 이면 검증 skip — legacy 호환.
  // - 개수 일치 / 옵션 포함 / 중복 금지.
  private async validateProficientSkills(className: string, skills: string[]): Promise<void> {
    const klass = await this.catalogService.findClassByKey(className.toLowerCase());
    if (!klass || klass.skillChoiceCount === 0) {
      return;
    }

    const choices = JSON.parse(klass.skillChoicesJson) as string[];

    if (skills.length !== klass.skillChoiceCount) {
      throw new BadRequestException(
        `스킬: ${klass.koName} 은(는) 숙련 스킬 ${klass.skillChoiceCount}개를 선택해야 합니다. (받은 개수: ${skills.length})`,
      );
    }

    const seen = new Set<string>();
    for (const skill of skills) {
      if (seen.has(skill)) {
        throw new BadRequestException(`스킬: 중복된 항목 "${skill}" 이 들어왔습니다.`);
      }
      seen.add(skill);
      if (!choices.includes(skill)) {
        throw new BadRequestException(
          `스킬: "${skill}" 은(는) ${klass.koName} 의 선택 가능 목록(${choices.join(", ")})에 없습니다.`,
        );
      }
    }
  }

  // 인벤토리/장착 무기 검증.
  // - inventory 의 모든 itemDefinitionId 가 ItemDefinition 카탈로그에 존재 (legacy: itemDefinitionId 없는 항목은 skip)
  // - equippedWeaponId 가 null 이 아니면 inventory 안에 entry.id 또는 itemDefinitionId 가 일치하는 항목 있어야 함
  //   (action-rule.service.ts:1111 패턴과 동일)
  private async validateInventoryAndEquippedWeapon(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
  ): Promise<void> {
    const definitionIds = inventory
      .map((item) => item.itemDefinitionId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (definitionIds.length > 0) {
      const found = await this.prisma.item.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((row) => row.id));
      for (const id of definitionIds) {
        if (!foundIds.has(id)) {
          throw new BadRequestException(`장비: 카탈로그에 없는 itemDefinitionId(${id}) 가 인벤토리에 있습니다.`);
        }
      }
    }

    if (equippedWeaponId) {
      const matched = inventory.some(
        (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
      );
      if (!matched) {
        throw new BadRequestException(
          `장비: 장착 무기 id(${equippedWeaponId})가 인벤토리에 없습니다.`,
        );
      }
    }
  }

  // 캐릭터가 PLAYING/PAUSED 세션에 속해 있으면 ConflictException(409).
  // S14P31A201-70: 진행 중인 세션에서는 영속 Character 수정 금지.
  private async assertCharacterNotLocked(characterId: string): Promise<void> {
    const locked = await this.prisma.sessionCharacter.findFirst({
      where: {
        characterId,
        session: { status: { in: Array.from(LOCKED_SESSION_STATUSES) } },
      },
      include: { session: { select: { id: true, status: true } } },
    });
    if (locked) {
      throw new ConflictException({
        code: "CHARACTER_LOCKED_BY_SESSION",
        message: "진행 중인 세션에 참여 중인 캐릭터는 수정할 수 없습니다.",
        sessionId: locked.sessionId,
        sessionStatus: locked.session.status,
      });
    }
  }

  // 레벨별 보정: proficiencyBonus + maxHp 자동 계산 + dto 와 일치 검증.
  // - proficiencyBonus = ((level-1) div 4) + 2  (1-4 +2, 5-8 +3, 9-12 +4, 13-16 +5, 17-20 +6)
  // - maxHp = max(hitDie) + Con + (level-1) * (avg(hitDie) + Con)
  // - hitDie max/avg: d6=6/4, d8=8/5, d10=10/6, d12=12/7
  // 시드에 없는 className 은 dto 값 그대로 사용 (legacy)
  private async resolveLevelStats(
    className: string,
    level: number,
    abilities: AbilityScoresDto,
    dtoProf: number | undefined,
    dtoMaxHp: number | undefined,
  ): Promise<{ proficiencyBonus: number; maxHp: number }> {
    const klass = await this.catalogService.findClassByKey(className.toLowerCase());
    if (!klass) {
      return {
        proficiencyBonus: dtoProf ?? 2,
        maxHp: dtoMaxHp ?? 10,
      };
    }

    const hitDieMaxAvg: Record<string, { max: number; avg: number }> = {
      d6: { max: 6, avg: 4 },
      d8: { max: 8, avg: 5 },
      d10: { max: 10, avg: 6 },
      d12: { max: 12, avg: 7 },
    };
    const hd = hitDieMaxAvg[klass.hitDie];
    if (!hd) {
      throw new BadRequestException(
        `레벨 보정: ${klass.koName} 의 hitDie ${klass.hitDie} 가 지원되지 않습니다.`,
      );
    }
    const conMod = Math.floor((abilities.con - 10) / 2);
    const expectedProf = Math.floor((level - 1) / 4) + 2;
    const expectedMaxHp = hd.max + conMod + (level - 1) * (hd.avg + conMod);

    if (dtoProf !== undefined && dtoProf !== expectedProf) {
      throw new BadRequestException(
        `숙련 보너스: 레벨 ${level} 의 정답은 ${expectedProf} 인데 ${dtoProf} 가 들어왔습니다.`,
      );
    }
    if (dtoMaxHp !== undefined && dtoMaxHp !== expectedMaxHp) {
      throw new BadRequestException(
        `maxHp: ${klass.koName}/레벨 ${level}/Con ${abilities.con}(mod ${conMod}) 의 공식값은 ${expectedMaxHp} 인데 ${dtoMaxHp} 가 들어왔습니다.`,
      );
    }

    return { proficiencyBonus: expectedProf, maxHp: expectedMaxHp };
  }

  // className 이 ClassDefinition 시드에 있고 startingCantripCount/startingSpellCount > 0 면 시작 주문 강제.
  // - cantrips.length === startingCantripCount, spells.length === startingSpellCount
  // 반환값: spellsJson 에 저장할 문자열(또는 null = 마법 없는 클래스/legacy)
  private async resolveStartingSpells(
    className: string,
    startingSpells: StartingSpellsDto | undefined,
  ): Promise<string | null> {
    const klass = await this.catalogService.findClassByKey(className.toLowerCase());
    if (!klass) return null;

    const needCantrips = klass.startingCantripCount;
    const needSpells = klass.startingSpellCount;

    if (needCantrips === 0 && needSpells === 0) {
      return null;
    }

    if (!startingSpells || !Array.isArray(startingSpells.cantrips) || !Array.isArray(startingSpells.spells)) {
      throw new BadRequestException(
        `시작 주문: ${klass.koName} 은(는) 캔트립 ${needCantrips}개 + 주문 ${needSpells}개를 지정해야 합니다.`,
      );
    }

    if (startingSpells.cantrips.length !== needCantrips) {
      throw new BadRequestException(
        `시작 주문: 캔트립 ${startingSpells.cantrips.length}개가 ${klass.koName} 요구치 ${needCantrips}개와 일치하지 않습니다.`,
      );
    }

    if (startingSpells.spells.length !== needSpells) {
      throw new BadRequestException(
        `시작 주문: 주문 ${startingSpells.spells.length}개가 ${klass.koName} 요구치 ${needSpells}개와 일치하지 않습니다.`,
      );
    }

    return JSON.stringify({
      cantrips: startingSpells.cantrips.map((s) => s.trim()).filter((s) => s.length > 0),
      spells: startingSpells.spells.map((s) => s.trim()).filter((s) => s.length > 0),
    });
  }

  // className 이 ClassDefinition 시드에 있으면 시작 장비 강제(슬롯 개수만큼 정확히 1 옵션씩 선택).
  // 반환값: inventory(시작 장비 아이템 모두). null = 시드에 없음(legacy ancestry/className 케이스)
  private async resolveStartingEquipment(
    className: string,
    selection: number[] | undefined,
  ): Promise<InventoryItemDto[] | null> {
    const lower = className.toLowerCase();
    const klass = await this.catalogService.findClassByKey(lower);
    if (!klass) {
      return null;
    }

    const startingEquipment = JSON.parse(klass.startingEquipmentJson) as StartingEquipmentDto;
    const slots = startingEquipment.slots;

    if (!Array.isArray(selection) || selection.length !== slots.length) {
      throw new BadRequestException(
        `시작 장비: ${slots.length}개 슬롯 모두에 옵션 인덱스를 보내야 합니다. (받은 길이: ${selection?.length ?? 0})`,
      );
    }

    const inventory: InventoryItemDto[] = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]!;
      const optionIndex = selection[slotIndex]!;
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= slot.options.length) {
        throw new BadRequestException(
          `시작 장비: 슬롯 ${slotIndex} 의 옵션 인덱스 ${optionIndex} 가 유효 범위(0..${slot.options.length - 1})를 벗어났습니다.`,
        );
      }
      const option = slot.options[optionIndex]!;
      for (const item of option.items) {
        const catalogItem = await this.prisma.item.findUnique({ where: { key: item.itemKey } });
        if (!catalogItem) {
          throw new BadRequestException(
            `시작 장비: 아이템 시드에 ${item.itemKey} 가 없습니다.`,
          );
        }
        inventory.push({
          id: `${catalogItem.key}-${slotIndex}-${inventory.length}`,
          name: catalogItem.koName,
          quantity: item.quantity,
          itemDefinitionId: catalogItem.id,
          itemType: catalogItem.category,
        });
      }
    }
    return inventory;
  }

  // ancestry 입력값은 race.key('elf') 또는 race.koName('엘프') 둘 다 허용.
  private async findRaceForAncestry(ancestry: string) {
    const trimmed = ancestry.trim();
    if (!trimmed) return null;

    const byKey = await this.racesService.findByKey(trimmed.toLowerCase());
    if (byKey) return byKey;

    return this.prisma.race.findFirst({ where: { koName: trimmed } });
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
