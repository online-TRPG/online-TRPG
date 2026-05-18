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
  normalizeSkillToKo,
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
import { isDefaultProvidedScenarioId } from "../scenarios/provided-scenario.constants";
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
    const scenarioId = await this.resolveScenarioForLevel(userId, dto.scenarioId ?? null, level);
    const ancestry = dto.ancestry.trim();
    const abilities = dto.abilities ?? defaultAbilityScores;
    this.validateAbilitiesRange(abilities);
    await this.validatePointBuyForAncestry(ancestry, abilities);
    const className = dto.className.trim();
    const normalizedProficientSkills = dto.proficientSkills
      ? await this.validateProficientSkills(className, dto.proficientSkills)
      : [];
    const inventoryFromEquipment = await this.resolveStartingEquipment(
      className,
      dto.startingEquipmentSelection,
      dto.startingEquipmentItemSelections,
    );
    const inventory = inventoryFromEquipment ?? dto.inventory ?? [];
    const equippedWeaponId =
      dto.equippedWeaponId ?? this.resolveDefaultEquippedWeaponId(inventory);
    const offhandWeaponId = dto.offhandWeaponId ?? null;
    await this.validateEquipmentLoadout(inventory, equippedWeaponId, offhandWeaponId);
    const spellsJsonValue = await this.resolveStartingSpells(className, dto.startingSpells);
    const { proficiencyBonus, maxHp } = await this.resolveLevelStats(
      className,
      level,
      abilities,
      dto.proficiencyBonus,
      dto.maxHp,
    );
    const armorClass = this.resolveArmorClass(className, abilities, inventory, dto.armorClass);

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
        proficientSkillsJson: JSON.stringify(normalizedProficientSkills),
        maxHp,
        armorClass,
        speed: dto.speed ?? 30,
        inventoryJson: JSON.stringify(inventory),
        spellsJson: spellsJsonValue,
        equippedWeaponId,
        offhandWeaponId,
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
    const finalOffhandWeaponId =
      dto.offhandWeaponId === undefined ? existing.offhandWeaponId : dto.offhandWeaponId;

    if (dto.abilities !== undefined) {
      this.validateAbilitiesRange(finalAbilities);
      await this.validatePointBuyForAncestry(finalAncestry, finalAbilities);
    }
    const normalizedUpdateProficientSkills =
      dto.proficientSkills !== undefined
        ? await this.validateProficientSkills(finalClassName, dto.proficientSkills)
        : null;
    if (
      dto.inventory !== undefined ||
      dto.equippedWeaponId !== undefined ||
      dto.offhandWeaponId !== undefined
    ) {
      await this.validateEquipmentLoadout(finalInventory, finalEquippedWeaponId, finalOffhandWeaponId);
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
          normalizedUpdateProficientSkills ?? JSON.parse(existing.proficientSkillsJson),
        ),
        maxHp: resolvedStats?.maxHp ?? dto.maxHp ?? existing.maxHp,
        armorClass: dto.armorClass ?? existing.armorClass,
        speed: dto.speed ?? existing.speed,
        inventoryJson: JSON.stringify(finalInventory),
        equippedWeaponId: finalEquippedWeaponId,
        offhandWeaponId: finalOffhandWeaponId,
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
        offhandWeaponId: source.offhandWeaponId,
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
      spells: character.spellsJson
        ? (JSON.parse(character.spellsJson) as CharacterInventoryResponseDto["spells"])
        : null,
      equippedWeaponId: character.equippedWeaponId ?? null,
      offhandWeaponId: character.offhandWeaponId ?? null,
    };
  }

  async updateCharacterEquipment(
    userId: string,
    characterId: string,
    dto: UpdateCharacterEquipmentDto,
  ): Promise<CharacterResponseDto> {
    const character = await this.getOwnedCharacterOrThrow(userId, characterId);

    const inventory = JSON.parse(character.inventoryJson) as InventoryItemDto[];
    const finalLoadout = await this.resolveNextEquipmentLoadout({
      characterId,
      inventory,
      currentMainWeaponId: character.equippedWeaponId ?? null,
      currentOffhandWeaponId: character.offhandWeaponId ?? null,
      requestedMainWeaponId: dto.equippedWeaponId,
      requestedOffhandWeaponId: dto.offhandWeaponId,
    });

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        equippedWeaponId: finalLoadout.equippedWeaponId,
        offhandWeaponId: finalLoadout.offhandWeaponId,
      },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    for (const assignment of updated.sessionCharacters) {
      if (
        assignment.session.status === PrismaSessionStatus.PLAYING ||
        assignment.session.status === PrismaSessionStatus.PAUSED
      ) {
        this.realtimeEvents.emitSessionSnapshot(
          assignment.sessionId,
          await this.sessionsService.buildSnapshot(assignment.sessionId),
        );
      }
    }

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
    userId: string,
    scenarioId: string | null,
    level: number,
  ): Promise<string | null> {
    if (!scenarioId) {
      return null;
    }

    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true, createdByUserId: true, sourceType: true, startLevel: true },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${scenarioId} was not found.`);
    }

    const isDefaultProvidedScenario = isDefaultProvidedScenarioId(scenario.id);
    const isOwnScenario = scenario.createdByUserId === userId;
    if (!isDefaultProvidedScenario && !isOwnScenario) {
      // 다른 사용자가 만든 시나리오는 캐릭터 생성 선택지와 API 응답에서 모두 숨깁니다.
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

  // 클래스 시드의 skillChoices/skillChoiceCount 와 일치 검증 + 한국어 정규화.
  // - skillChoiceCount === 0 (시드에 없는 className 포함) 이면 입력 그대로 통과 — legacy 호환.
  // - 영문 코드("Arcana") 또는 한국어("비전학") 어느 쪽으로 들어와도 한국어로 normalize 후 비교.
  //   DB 의 ClassDefinition.skillChoicesJson 이 한국어이므로 한국어를 정규형으로 둔다.
  // - 반환값을 호출자가 그대로 proficientSkillsJson 에 저장하면 영/한 혼재가 사라진다.
  // - 개수 일치 / 옵션 포함 / 중복 금지.
  private async validateProficientSkills(
    className: string,
    skills: string[],
  ): Promise<string[]> {
    const klass = await this.catalogService.findClassByKey(className.toLowerCase());
    if (!klass || klass.skillChoiceCount === 0) {
      return skills;
    }

    const choices = JSON.parse(klass.skillChoicesJson) as string[];

    if (skills.length !== klass.skillChoiceCount) {
      throw new BadRequestException(
        `스킬: ${klass.koName} 은(는) 숙련 스킬 ${klass.skillChoiceCount}개를 선택해야 합니다. (받은 개수: ${skills.length})`,
      );
    }

    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const skill of skills) {
      const ko = normalizeSkillToKo(skill);
      if (!ko) {
        throw new BadRequestException(
          `스킬: 알 수 없는 항목 "${skill}" 입니다. (D&D 5e 스킬명을 영문 또는 한국어로 입력해주세요)`,
        );
      }
      if (seen.has(ko)) {
        throw new BadRequestException(`스킬: 중복된 항목 "${skill}" 이 들어왔습니다.`);
      }
      seen.add(ko);
      if (!choices.includes(ko)) {
        throw new BadRequestException(
          `스킬: "${skill}" 은(는) ${klass.koName} 의 선택 가능 목록(${choices.join(", ")})에 없습니다.`,
        );
      }
      normalized.push(ko);
    }

    return normalized;
  }

  private async resolveNextEquipmentLoadout(params: {
    characterId: string;
    inventory: InventoryItemDto[];
    currentMainWeaponId: string | null;
    currentOffhandWeaponId: string | null;
    requestedMainWeaponId?: string | null;
    requestedOffhandWeaponId?: string | null;
  }): Promise<{ equippedWeaponId: string | null; offhandWeaponId: string | null }> {
    let equippedWeaponId =
      params.requestedMainWeaponId === undefined
        ? params.currentMainWeaponId
        : params.requestedMainWeaponId;
    let offhandWeaponId =
      params.requestedOffhandWeaponId === undefined
        ? params.currentOffhandWeaponId
        : params.requestedOffhandWeaponId;

    if (
      params.requestedMainWeaponId &&
      params.requestedOffhandWeaponId === undefined &&
      params.currentMainWeaponId &&
      params.currentMainWeaponId !== params.requestedMainWeaponId &&
      !params.currentOffhandWeaponId
    ) {
      const currentMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        params.currentMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );
      const requestedMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        params.requestedMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );

      if (
        currentMain &&
        requestedMain &&
        this.isOneHandWeaponCandidate(currentMain) &&
        this.isOneHandWeaponCandidate(requestedMain)
      ) {
        equippedWeaponId = params.currentMainWeaponId;
        offhandWeaponId = params.requestedMainWeaponId;
      }
    }

    if (equippedWeaponId && offhandWeaponId && equippedWeaponId === offhandWeaponId) {
      offhandWeaponId = null;
    }

    if (!equippedWeaponId) {
      offhandWeaponId = null;
    }

    if (equippedWeaponId) {
      const main = await this.resolveEquippedWeaponCandidate(params.inventory, equippedWeaponId, {
        allowSessionInventoryForCharacterId: params.characterId,
      });
      if (main && !this.isOneHandWeaponCandidate(main)) {
        offhandWeaponId = null;
      }
    }

    await this.validateEquipmentLoadout(params.inventory, equippedWeaponId, offhandWeaponId, {
      allowSessionInventoryForCharacterId: params.characterId,
    });

    return { equippedWeaponId, offhandWeaponId };
  }

  private async validateEquipmentLoadout(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    offhandWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<void> {
    await this.validateInventoryAndEquippedWeapon(inventory, equippedWeaponId, options);
    await this.validateInventoryAndEquippedWeapon(inventory, offhandWeaponId, options);

    if (!equippedWeaponId || !offhandWeaponId) {
      return;
    }
    if (equippedWeaponId === offhandWeaponId) {
      throw new BadRequestException("장비: 같은 무기를 양손에 동시에 장착할 수 없습니다.");
    }

    const main = await this.resolveEquippedWeaponCandidate(inventory, equippedWeaponId, options);
    const offhand = await this.resolveEquippedWeaponCandidate(inventory, offhandWeaponId, options);
    if (!main || !offhand) {
      return;
    }
    if (!this.isOneHandWeaponCandidate(main) || !this.isOneHandWeaponCandidate(offhand)) {
      throw new BadRequestException(
        "장비: 쌍수 장착은 한손 근접 무기 두 개일 때만 가능합니다.",
      );
    }
  }

  // 인벤토리/장착 무기 검증.
  // - inventory 의 모든 itemDefinitionId 가 ItemDefinition 카탈로그에 존재 (legacy: itemDefinitionId 없는 항목은 skip)
  // - equippedWeaponId 가 null 이 아니면 inventory 안에 entry.id 또는 itemDefinitionId 가 일치하는 항목 있어야 함
  //   (action-rule.service.ts:1111 패턴과 동일)
  private async validateInventoryAndEquippedWeapon(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
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
      const matched = inventory.find(
        (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
      );
      if (matched) {
        if (!this.isWeaponInventoryItem(matched)) {
          throw new BadRequestException(
            `장비: 장착 대상(${equippedWeaponId})은 무기가 아닙니다.`,
          );
        }
        return;
      }

      if (options?.allowSessionInventoryForCharacterId) {
        const sessionInventoryMatch = await this.prisma.inventoryEntry.findFirst({
          where: {
            sessionCharacter: {
              characterId: options.allowSessionInventoryForCharacterId,
            },
            OR: [{ id: equippedWeaponId }, { itemDefinitionId: equippedWeaponId }],
          },
          include: { itemDefinition: true },
        });

        if (sessionInventoryMatch) {
          if (
            sessionInventoryMatch.itemDefinition.itemType !== "weapon" &&
            !sessionInventoryMatch.itemDefinition.damageDice
          ) {
            throw new BadRequestException(
              `장비: 장착 대상(${equippedWeaponId})은 무기가 아닙니다.`,
            );
          }
          return;
        }
      }

      if (!matched) {
        throw new BadRequestException(
          `장비: 장착 무기 id(${equippedWeaponId})가 인벤토리에 없습니다.`,
        );
      }
    }
  }

  private async resolveEquippedWeaponCandidate(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<InventoryItemDto | null> {
    if (!equippedWeaponId) {
      return null;
    }

    const matched = inventory.find(
      (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
    );
    if (matched) {
      return matched;
    }

    if (!options?.allowSessionInventoryForCharacterId) {
      return null;
    }

    const sessionInventoryMatch = await this.prisma.inventoryEntry.findFirst({
      where: {
        sessionCharacter: {
          characterId: options.allowSessionInventoryForCharacterId,
        },
        OR: [{ id: equippedWeaponId }, { itemDefinitionId: equippedWeaponId }],
      },
      include: { itemDefinition: true },
    });

    if (!sessionInventoryMatch) {
      return null;
    }

    return {
      id: sessionInventoryMatch.id,
      name: sessionInventoryMatch.itemDefinition.name,
      quantity: sessionInventoryMatch.quantity,
      itemDefinitionId: sessionInventoryMatch.itemDefinitionId,
      itemType: sessionInventoryMatch.itemDefinition.itemType,
      damageDice: sessionInventoryMatch.itemDefinition.damageDice ?? undefined,
      damageType: sessionInventoryMatch.itemDefinition.damageType ?? undefined,
      properties: this.parseStringArrayJson(sessionInventoryMatch.itemDefinition.propertiesJson),
    };
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
    itemSelections: Record<string, string> | undefined,
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
      for (let itemIndex = 0; itemIndex < option.items.length; itemIndex++) {
        const item = option.items[itemIndex]!;
        const baseCatalogItem = await this.prisma.item.findUnique({ where: { key: item.itemKey } });
        if (!baseCatalogItem) {
          throw new BadRequestException(
            `시작 장비: 아이템 시드에 ${item.itemKey} 가 없습니다.`,
          );
        }
        const catalogItem = await this.resolveConcreteStartingEquipmentItem(
          baseCatalogItem,
          itemSelections?.[`${slotIndex}:${itemIndex}`],
          slotIndex,
          itemIndex,
        );
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

  private async resolveConcreteStartingEquipmentItem(
    baseCatalogItem: { id: string; key: string; koName: string; category: string },
    selectedItemKey: string | undefined,
    slotIndex: number,
    itemIndex: number,
  ): Promise<{ id: string; key: string; koName: string; category: string }> {
    const matcher = this.getStartingEquipmentPlaceholderMatcher(baseCatalogItem.category);
    if (!matcher) {
      return baseCatalogItem;
    }

    const normalizedSelectedItemKey = selectedItemKey?.trim();
    if (!normalizedSelectedItemKey) {
      throw new BadRequestException(
        `시작 장비: 슬롯 ${slotIndex} 의 ${itemIndex}번째 항목(${baseCatalogItem.koName})은 실제 아이템 선택이 필요합니다.`,
      );
    }

    const selectedCatalogItem = await this.prisma.item.findUnique({
      where: { key: normalizedSelectedItemKey },
    });
    if (!selectedCatalogItem) {
      throw new BadRequestException(
        `시작 장비: 선택한 아이템 ${normalizedSelectedItemKey} 이(가) 아이템 시드에 없습니다.`,
      );
    }
    if (!matcher.isAllowed(selectedCatalogItem.category)) {
      throw new BadRequestException(
        `시작 장비: ${baseCatalogItem.koName} 자리에는 ${matcher.label}만 선택할 수 있습니다. (받은 값: ${selectedCatalogItem.koName})`,
      );
    }

    return selectedCatalogItem;
  }

  private getStartingEquipmentPlaceholderMatcher(category: string):
    | { label: string; isAllowed: (candidateCategory: string) => boolean }
    | null {
    switch (category) {
      case "placeholder-weapon-simple":
        return {
          label: "단순 무기",
          isAllowed: (candidateCategory) =>
            candidateCategory.startsWith("weapon-") && candidateCategory.endsWith("-simple"),
        };
      case "placeholder-weapon-simple-melee":
        return {
          label: "단순 근접 무기",
          isAllowed: (candidateCategory) => candidateCategory === "weapon-melee-simple",
        };
      case "placeholder-weapon-martial":
        return {
          label: "군용 무기",
          isAllowed: (candidateCategory) =>
            candidateCategory.startsWith("weapon-") && candidateCategory.endsWith("-martial"),
        };
      case "placeholder-weapon-martial-melee":
        return {
          label: "군용 근접 무기",
          isAllowed: (candidateCategory) => candidateCategory === "weapon-melee-martial",
        };
      case "placeholder-instrument":
        return {
          label: "악기",
          isAllowed: (candidateCategory) => candidateCategory === "instrument",
        };
      default:
        return null;
    }
  }

  private resolveDefaultEquippedWeaponId(inventory: InventoryItemDto[]): string | null {
    const weapon = inventory.find((item) => this.isWeaponInventoryItem(item));
    return weapon?.itemDefinitionId ?? weapon?.id ?? null;
  }

  private resolveArmorClass(
    className: string,
    abilities: AbilityScoresDto,
    inventory: InventoryItemDto[],
    fallbackArmorClass: number | undefined,
  ): number {
    const dexMod = this.getAbilityModifier(abilities.dex);
    const conMod = this.getAbilityModifier(abilities.con);
    const wisMod = this.getAbilityModifier(abilities.wis);
    const normalizedClass = className.trim().toLowerCase();
    const shieldBonus = inventory.some((item) => this.isShieldInventoryItem(item)) ? 2 : 0;
    const armorCandidates = inventory
      .filter((item) => this.isArmorInventoryItem(item))
      .map((item) => this.calculateArmorItemAc(item, dexMod))
      .filter((value): value is number => value !== null);

    const armorAc = armorCandidates.length ? Math.max(...armorCandidates) + shieldBonus : null;
    const unarmoredAc =
      normalizedClass.includes("barbarian")
        ? 10 + dexMod + conMod
        : normalizedClass.includes("monk")
          ? 10 + dexMod + wisMod
          : 10 + dexMod;
    const calculatedAc = Math.max(armorAc ?? Number.MIN_SAFE_INTEGER, unarmoredAc);

    return calculatedAc > 0 ? calculatedAc : fallbackArmorClass ?? 10;
  }

  private calculateArmorItemAc(item: InventoryItemDto, dexMod: number): number | null {
    const key = this.getInventoryItemSearchKey(item);
    if (key.includes("shield") || key.includes("방패")) {
      return null;
    }
    if (key.includes("chain-mail") || key.includes("chain mail") || key.includes("체인 메일")) {
      return 16;
    }
    if (key.includes("scale-mail") || key.includes("scale mail") || key.includes("스케일 메일")) {
      return 14 + Math.min(dexMod, 2);
    }
    if (key.includes("leather-armor") || key.includes("leather armor") || key.includes("가죽 갑옷")) {
      return 11 + dexMod;
    }
    return null;
  }

  private isWeaponInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "weapon" || key.includes("weapon-") || key.includes("무기");
  }

  private isOneHandWeaponCandidate(item: InventoryItemDto): boolean {
    if (!this.isWeaponInventoryItem(item)) {
      return false;
    }
    const properties = new Set(
      [...(item.properties ?? []), ...this.getFallbackWeaponProperties(item)]
        .map((property) => property.toLowerCase().replace(/\s+/g, "-")),
    );
    return !properties.has("two-handed") && !properties.has("ranged");
  }

  private isArmorInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "armor" || key.includes("armor-") || key.includes("갑옷");
  }

  private isShieldInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "shield" || key.includes("shield") || key.includes("방패");
  }

  private getInventoryItemSearchKey(item: InventoryItemDto): string {
    return [item.id, item.itemDefinitionId, item.name, item.itemType]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();
  }

  private getFallbackWeaponProperties(item: InventoryItemDto): string[] {
    const key = this.getInventoryItemSearchKey(item).replace(/_/g, "-");
    const profiles: Record<string, string[]> = {
      dagger: ["finesse", "light", "thrown"],
      dart: ["ranged", "thrown"],
      greataxe: ["melee", "heavy", "two-handed"],
      handaxe: ["light", "thrown"],
      javelin: ["thrown"],
      "light-crossbow": ["ranged", "two-handed"],
      longsword: ["melee", "versatile"],
      longbow: ["ranged", "two-handed"],
      mace: ["melee"],
      quarterstaff: ["melee", "versatile"],
      rapier: ["melee", "finesse"],
      scimitar: ["melee", "finesse", "light"],
      shortbow: ["ranged", "two-handed"],
      shortsword: ["melee", "finesse", "light"],
      warhammer: ["melee", "versatile"],
    };
    const matchedKey = Object.keys(profiles).find((profileKey) => key.includes(profileKey));
    if (matchedKey) return profiles[matchedKey]!;

    const koreanProfiles: Array<[string, string[]]> = [
      ["단검", profiles.dagger],
      ["다트", profiles.dart],
      ["그레이트액스", profiles.greataxe],
      ["핸드액스", profiles.handaxe],
      ["재블린", profiles.javelin],
      ["라이트 크로스보우", profiles["light-crossbow"]],
      ["롱소드", profiles.longsword],
      ["롱보우", profiles.longbow],
      ["메이스", profiles.mace],
      ["쿼터스태프", profiles.quarterstaff],
      ["레이피어", profiles.rapier],
      ["시미터", profiles.scimitar],
      ["쇼트보우", profiles.shortbow],
      ["쇼트소드", profiles.shortsword],
      ["워해머", profiles.warhammer],
    ];
    return koreanProfiles.find(([name]) => key.includes(name))?.[1] ?? [];
  }

  private parseStringArrayJson(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }

  private getAbilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
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
