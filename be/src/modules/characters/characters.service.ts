import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  AbilityScoresDto,
  CharacterAvatarAssetResponseDto,
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  InventoryItemDto,
  LevelUpCharacterDto,
  normalizeInventoryItemsDisplay,
  SessionCharacterResponseDto,
  UploadCharacterAvatarDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
  UpdatePreparedSpellsDto,
} from "@trpg/shared-types";
import {
  normalizeSrdCharacterClassKey,
  resolveSubclassChoiceLevel,
} from "@trpg/srd-data/rules";
import { mapCharacter, mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { LevelUpService } from "../rules/level-up.service";
import type { HitDie } from "../rules/level-up.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import { SessionsService } from "../sessions/sessions.service";
import { CharacterAvatarAssetService } from "./character-avatar-asset.service";
import { CharacterCreationService } from "./character-creation.service";
import { CharacterEquipmentLoadoutService } from "./character-equipment-loadout.service";
import { CharacterFeatureSnapshotService } from "./character-feature-snapshot.service";
import { CharacterSpellSelectionService } from "./character-spell-selection.service";

const defaultAbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

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
    private readonly catalogService: CatalogService,
    private readonly ruleCatalogService: RuleCatalogService,
    private readonly levelUpService: LevelUpService,
    private readonly characterSpellSelection: CharacterSpellSelectionService,
    private readonly characterEquipmentLoadout: CharacterEquipmentLoadoutService,
    private readonly characterAvatarAssets: CharacterAvatarAssetService,
    private readonly characterFeatureSnapshot: CharacterFeatureSnapshotService,
    private readonly characterCreation: CharacterCreationService,
  ) {}

  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<CharacterResponseDto> {
    await this.ensureUserExists(userId);

    const level = dto.level ?? 1;
    const scenarioId = await this.characterCreation.resolveScenarioForLevel({
      userId,
      scenarioId: dto.scenarioId ?? null,
      level,
    });
    const ancestry = dto.ancestry.trim();
    const abilities = dto.abilities ?? defaultAbilityScores;
    this.characterCreation.assertAbilitiesInRange(abilities);
    const race = await this.characterCreation.findRaceForAncestry(ancestry);
    const className = dto.className.trim();
    const normalizedProficientSkills = dto.proficientSkills
      ? await this.characterCreation.resolveProficientSkills(className, dto.proficientSkills)
      : [];
    const inventoryFromEquipment = await this.characterEquipmentLoadout.resolveStartingEquipment({
      className,
      selection: dto.startingEquipmentSelection,
      itemSelections: dto.startingEquipmentItemSelections,
    });
    const inventory = inventoryFromEquipment ?? dto.inventory ?? [];
    const equippedWeaponId =
      dto.equippedWeaponId ?? this.characterEquipmentLoadout.resolveDefaultEquippedWeaponId(inventory);
    const offhandWeaponId =
      dto.offhandWeaponId ?? this.characterEquipmentLoadout.resolveDefaultOffhandEquipmentId(inventory, equippedWeaponId);
    await this.characterEquipmentLoadout.validateEquipmentLoadout(inventory, equippedWeaponId, offhandWeaponId);
    const spellsJsonValue = await this.characterSpellSelection.resolveStartingSpells(
      className,
      level,
      abilities,
      dto.startingSpells,
    );
    const subclassName = this.characterFeatureSnapshot.assertValidSubclassSelection({
      className,
      subclassName: dto.subclassName,
      level,
      requiredCode: "CHARACTER_SUBCLASS_REQUIRED",
      invalidCode: "CHARACTER_INVALID_SUBCLASS",
    });

    const features = await this.characterFeatureSnapshot.resolveCharacterFeatureSnapshot({
      ancestry,
      raceKey: race?.key ?? null,
      className,
      subclassName,
      level,
      requestedFeatures: dto.features ?? [],
      proficientSkills: normalizedProficientSkills,
      requireMissingFeatureChoices: true,
    });
    this.characterCreation.assertPointBuyForRace(abilities, race);
    const maxHpBonus = this.characterFeatureSnapshot.resolveMaxHpBonusFromFeatures({
      featureIds: features,
      className,
      level,
    });
    const { proficiencyBonus, maxHp } = await this.characterCreation.resolveLevelStats({
      className,
      level,
      abilities,
      requestedProficiencyBonus: dto.proficiencyBonus,
      requestedMaxHp: dto.maxHp,
      maxHpBonus,
    });
    const armorClass = this.characterEquipmentLoadout.resolveArmorClass(
      className,
      abilities,
      inventory,
      dto.armorClass,
      offhandWeaponId,
    );

    const character = await this.prisma.character.create({
      data: {
        ownerUserId: userId,
        scenarioId,
        name: dto.name.trim(),
        ancestry,
        className,
        subclassName,
        level,
        bio: dto.bio?.trim() ?? null,
        abilitiesJson: JSON.stringify(abilities),
        proficiencyBonus,
        featuresJson: JSON.stringify(features),
        proficientSkillsJson: JSON.stringify(normalizedProficientSkills),
        maxHp,
        armorClass,
        speed: dto.speed ?? race?.baseSpeed ?? 30,
        inventoryJson: JSON.stringify(inventory),
        spellsJson: spellsJsonValue,
        equippedWeaponId,
        offhandWeaponId,
        avatarType: this.characterAvatarAssets.resolveAvatarType(dto.avatarType),
        avatarPresetId: dto.avatarPresetId ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        avatarUpdatedAt: dto.avatarPresetId || dto.avatarUrl ? new Date() : null,
      },
      include: {
        sessionCharacters: {
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
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
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return characters.map(mapCharacter);
  }

  async listMyAvatarAssets(userId: string): Promise<CharacterAvatarAssetResponseDto[]> {
    return this.characterAvatarAssets.listMyAvatarAssets(userId);
  }

  async uploadMyAvatarAsset(
    userId: string,
    dto: UploadCharacterAvatarDto,
  ): Promise<CharacterAvatarAssetResponseDto> {
    return this.characterAvatarAssets.uploadMyAvatarAsset(userId, dto);
  }

  async deleteMyAvatarAsset(userId: string, assetId: string): Promise<void> {
    await this.characterAvatarAssets.deleteMyAvatarAsset(userId, assetId);
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
    const finalRace = await this.characterCreation.findRaceForAncestry(finalAncestry);
    const finalClassName = dto.className?.trim() ?? existing.className;
    const finalLevel = dto.level ?? existing.level;
    const finalInventory: InventoryItemDto[] =
      dto.inventory ?? (JSON.parse(existing.inventoryJson) as InventoryItemDto[]);
    const finalEquippedWeaponId =
      dto.equippedWeaponId === undefined ? existing.equippedWeaponId : dto.equippedWeaponId;
    const finalOffhandWeaponId =
      dto.offhandWeaponId === undefined ? existing.offhandWeaponId : dto.offhandWeaponId;

    if (dto.abilities !== undefined || dto.ancestry !== undefined) {
      this.characterCreation.assertAbilitiesInRange(finalAbilities);
    }
    const normalizedUpdateProficientSkills =
      dto.proficientSkills !== undefined
        ? await this.characterCreation.resolveProficientSkills(finalClassName, dto.proficientSkills)
        : null;
    if (
      dto.inventory !== undefined ||
      dto.equippedWeaponId !== undefined ||
      dto.offhandWeaponId !== undefined
    ) {
      await this.characterEquipmentLoadout.validateEquipmentLoadout(finalInventory, finalEquippedWeaponId, finalOffhandWeaponId);
    }

    // abilities/level/className/maxHp/proficiencyBonus 중 어느 하나라도 변경되면 룰북 공식 재계산.
    // - dto 가 maxHp/proficiencyBonus 보냈으면 공식과 일치 검증 (mismatch → throw).
    // - 안 보냈으면 공식값으로 자동 갱신 (legacy 행이 새 abilities/level 과 어긋나지 않게).
    const needsLevelStats =
      dto.abilities !== undefined ||
      dto.ancestry !== undefined ||
      dto.level !== undefined ||
      dto.className !== undefined ||
      dto.subclassName !== undefined ||
      dto.features !== undefined ||
      dto.maxHp !== undefined ||
      dto.proficiencyBonus !== undefined;

    const finalSubclassName =
      dto.subclassName === undefined ? existing.subclassName : dto.subclassName?.trim() ?? null;
    const validatedSubclassName = this.characterFeatureSnapshot.assertValidSubclassSelection({
      className: finalClassName,
      subclassName: finalSubclassName,
      level: finalLevel,
      requiredCode: "CHARACTER_SUBCLASS_REQUIRED",
      invalidCode: "CHARACTER_INVALID_SUBCLASS",
    });
    const requestedFeatures = dto.features ?? this.parseStringArrayJson(existing.featuresJson);
    const finalFeatures = await this.characterFeatureSnapshot.resolveCharacterFeatureSnapshot({
      ancestry: finalAncestry,
      raceKey: finalRace?.key ?? null,
      className: finalClassName,
      subclassName: validatedSubclassName,
      level: finalLevel,
      requestedFeatures,
      proficientSkills:
        normalizedUpdateProficientSkills ?? this.parseStringArrayJson(existing.proficientSkillsJson),
      requireMissingFeatureChoices:
        dto.features !== undefined || dto.className !== undefined || dto.level !== undefined,
    });
    if (
      dto.abilities !== undefined ||
      dto.ancestry !== undefined ||
      dto.level !== undefined ||
      dto.className !== undefined ||
      dto.features !== undefined
    ) {
      this.characterCreation.assertPointBuyForRace(finalAbilities, finalRace);
    }
    const resolvedStats = needsLevelStats
      ? await this.characterCreation.resolveLevelStats({
          className: finalClassName,
          level: finalLevel,
          abilities: finalAbilities,
          requestedProficiencyBonus: dto.proficiencyBonus,
          requestedMaxHp: dto.maxHp,
          maxHpBonus: this.characterFeatureSnapshot.resolveMaxHpBonusFromFeatures({
            featureIds: finalFeatures,
            className: finalClassName,
            level: finalLevel,
          }),
        })
      : null;

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        name: dto.name?.trim() ?? existing.name,
        ancestry: finalAncestry,
        className: finalClassName,
        subclassName: validatedSubclassName,
        level: finalLevel,
        bio: dto.bio === undefined ? existing.bio : dto.bio.trim(),
        abilitiesJson: JSON.stringify(finalAbilities),
        proficiencyBonus:
          resolvedStats?.proficiencyBonus ?? dto.proficiencyBonus ?? existing.proficiencyBonus,
        featuresJson: JSON.stringify(finalFeatures),
        proficientSkillsJson: JSON.stringify(
          normalizedUpdateProficientSkills ?? JSON.parse(existing.proficientSkillsJson),
        ),
        maxHp: resolvedStats?.maxHp ?? dto.maxHp ?? existing.maxHp,
        armorClass:
          dto.armorClass ??
          this.characterEquipmentLoadout.resolveArmorClass(
            finalClassName,
            finalAbilities,
            finalInventory,
            existing.armorClass,
            finalOffhandWeaponId,
          ),
        speed:
          dto.speed ??
          (dto.ancestry !== undefined
            ? finalRace?.baseSpeed ?? existing.speed
            : existing.speed),
        inventoryJson: JSON.stringify(finalInventory),
        equippedWeaponId: finalEquippedWeaponId,
        offhandWeaponId: finalOffhandWeaponId,
        avatarType:
          dto.avatarType === undefined
            ? existing.avatarType
            : this.characterAvatarAssets.resolveAvatarType(dto.avatarType),
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
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
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

  async levelUpCharacter(
    userId: string,
    characterId: string,
    dto: LevelUpCharacterDto,
  ): Promise<CharacterResponseDto> {
    const existing = await this.getOwnedCharacterOrThrow(userId, characterId);
    const activeAssignments = existing.sessionCharacters.filter((assignment) =>
      LOCKED_SESSION_STATUSES.has(assignment.session.status),
    );
    if (activeAssignments.length && !dto.applyToActiveSessions) {
      throw new ConflictException({
        code: "LEVEL_UP_REQUIRES_SESSION_APPLY_CONFIRMATION",
        message: "진행 중인 세션에 참여 중인 캐릭터는 세션 snapshot 반영 여부를 명시해야 합니다.",
        sessionIds: activeAssignments.map((assignment) => assignment.sessionId),
      });
    }

    const abilities = JSON.parse(existing.abilitiesJson) as AbilityScoresDto;
    const race = await this.characterCreation.findRaceForAncestry(existing.ancestry);
    const classKey = normalizeSrdCharacterClassKey(existing.className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass) {
      throw new BadRequestException("시드된 클래스가 아닌 캐릭터는 레벨업 계산을 적용할 수 없습니다.");
    }

    let resolution;
    try {
      resolution = this.levelUpService.resolveLevelUp({
        classKey,
        currentLevel: existing.level,
        targetLevel: dto.targetLevel,
        hitDie: klass.hitDie as HitDie,
        constitutionScore: abilities.con,
        currentMaxHp: existing.maxHp,
        hpMode: dto.hpMode ?? "average",
        rolledHpByLevel: dto.rolledHpByLevel ?? {},
        subclassChoiceLevel: resolveSubclassChoiceLevel(classKey),
        classFeatures: this.ruleCatalogService.listClassFeaturesForLevel(
          classKey,
          dto.targetLevel,
        ),
        subclassFeatures: existing.subclassName
          ? this.ruleCatalogService.listSubclassFeatures(
              classKey,
              existing.subclassName,
              dto.targetLevel,
            )
          : [],
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "레벨업 입력값이 유효하지 않습니다.",
      );
    }

    const selectedSubclassName = this.characterFeatureSnapshot.assertValidSubclassSelection({
      className: existing.className,
      subclassName: dto.subclassName?.trim() || existing.subclassName,
      level: resolution.toLevel,
      requiredCode: "LEVEL_UP_SUBCLASS_REQUIRED",
      invalidCode: "LEVEL_UP_INVALID_SUBCLASS",
    });
    const existingFeatureIds = this.parseStringArrayJson(existing.featuresJson);
    const selectedFeatIds = this.characterFeatureSnapshot.resolveLevelUpFeatSelections({
      requested: dto.featSelections,
      asiLevels: resolution.asiOrFeatChoiceRequiredAtLevels,
      existingFeatureIds,
    });

    const asiAdjustedAbilities = this.characterFeatureSnapshot.resolveLevelUpAbilityScores({
      current: abilities,
      requested: dto.abilityScoreIncreases,
      asiLevels: resolution.asiOrFeatChoiceRequiredAtLevels,
      featSelectionCount: selectedFeatIds.length,
    });
    const finalFeatures = await this.characterFeatureSnapshot.resolveCharacterFeatureSnapshot({
      ancestry: existing.ancestry,
      raceKey: race?.key ?? null,
      className: existing.className,
      subclassName: selectedSubclassName,
      level: resolution.toLevel,
      requestedFeatures: [
        ...existingFeatureIds,
        ...selectedFeatIds,
      ],
      proficientSkills: this.parseStringArrayJson(existing.proficientSkillsJson),
      requireMissingFeatureChoices: false,
    });
    const finalAbilities = this.characterFeatureSnapshot.applyP6CapstoneAbilityAdjustments({
      className: existing.className,
      fromLevel: resolution.fromLevel,
      toLevel: resolution.toLevel,
      abilities: asiAdjustedAbilities,
      featureIds: finalFeatures,
    });
    const nextSpellsJson =
      dto.knownSpells === undefined &&
      dto.preparedSpells === undefined &&
      dto.cantrips === undefined &&
      dto.forgottenSpells === undefined &&
      dto.forgottenCantrips === undefined
        ? undefined
        : this.characterSpellSelection.resolveLevelUpSpellsJson(existing.spellsJson, {
            knownSpells: dto.knownSpells,
            preparedSpells: dto.preparedSpells,
            cantrips: dto.cantrips,
            forgottenSpells: dto.forgottenSpells,
            forgottenCantrips: dto.forgottenCantrips,
            currentLevel: existing.level,
            level: resolution.toLevel,
            className: existing.className,
            abilities: finalAbilities,
          });
    const constitutionModifierDelta =
      this.levelUpService.resolveAbilityModifier(finalAbilities.con) -
      this.levelUpService.resolveAbilityModifier(abilities.con);
    const previousMaxHpFeatureBonus = this.characterFeatureSnapshot.resolveMaxHpBonusFromFeatures({
      featureIds: this.parseStringArrayJson(existing.featuresJson),
      className: existing.className,
      level: resolution.fromLevel,
    });
    const finalMaxHpFeatureBonus = this.characterFeatureSnapshot.resolveMaxHpBonusFromFeatures({
      featureIds: finalFeatures,
      className: existing.className,
      level: resolution.toLevel,
    });
    const finalMaxHp =
      resolution.maxHpAfter +
      constitutionModifierDelta * resolution.toLevel +
      (finalMaxHpFeatureBonus - previousMaxHpFeatureBonus);
    const inventory = this.parseInventoryItemsJson(existing.inventoryJson);
    const previousCalculatedArmorClass = this.characterEquipmentLoadout.resolveArmorClass(
      existing.className,
      abilities,
      inventory,
      existing.armorClass,
      existing.offhandWeaponId ?? null,
    );
    const normalizedClassName = normalizeSrdCharacterClassKey(existing.className);
    const canRecalculateArmorClass =
      inventory.some((item) => this.characterEquipmentLoadout.isArmorInventoryItem(item)) ||
      normalizedClassName.includes("barbarian") ||
      normalizedClassName.includes("monk") ||
      existing.armorClass === previousCalculatedArmorClass;
    const recalculatedArmorClass = this.characterEquipmentLoadout.resolveArmorClass(
      existing.className,
      finalAbilities,
      inventory,
      existing.armorClass,
      existing.offhandWeaponId ?? null,
    );
    const finalArmorClass = canRecalculateArmorClass
      ? recalculatedArmorClass
      : existing.armorClass;
    const hpDelta = Math.max(0, finalMaxHp - existing.maxHp);

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        level: resolution.toLevel,
        subclassName: selectedSubclassName ?? null,
        abilitiesJson: JSON.stringify(finalAbilities),
        proficiencyBonus: resolution.proficiencyBonusAfter,
        maxHp: finalMaxHp,
        armorClass: finalArmorClass,
        featuresJson: JSON.stringify(finalFeatures),
        ...(nextSpellsJson !== undefined ? { spellsJson: nextSpellsJson } : {}),
      },
      include: {
        sessionCharacters: {
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (dto.applyToActiveSessions) {
      for (const assignment of activeAssignments) {
        const currentHp =
          typeof assignment.currentHp === "number" ? assignment.currentHp : existing.maxHp;
        await this.prisma.sessionCharacter.update({
          where: { id: assignment.id },
          data: { currentHp: Math.min(finalMaxHp, currentHp + hpDelta) },
        });
        const updatedSessionCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
          where: { id: assignment.id },
          include: {
            character: true,
            resource: true,
            inventoryEntries: {
              include: { itemDefinition: true },
              orderBy: { createdAt: "asc" },
            },
          },
        });
        this.realtimeEvents.emitCharacterUpdated(
          assignment.sessionId,
          mapSessionCharacter(updatedSessionCharacter),
        );
        this.realtimeEvents.emitSessionSnapshot(
          assignment.sessionId,
          await this.sessionsService.buildSnapshot(assignment.sessionId),
        );
      }
    }

    return mapCharacter(updated);
  }
  async updatePreparedSpells(
    userId: string,
    characterId: string,
    dto: UpdatePreparedSpellsDto,
  ): Promise<CharacterResponseDto> {
    const existing = await this.getOwnedCharacterOrThrow(userId, characterId);
    const spellsJson = this.characterSpellSelection.resolvePreparedSpellsJson(existing.spellsJson, dto.preparedSpells, {
      className: existing.className,
      level: existing.level,
      abilities: JSON.parse(existing.abilitiesJson) as AbilityScoresDto,
    });

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        spellsJson,
      },
      include: {
        sessionCharacters: {
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
        },
      },
    });

    for (const assignment of updated.sessionCharacters) {
      if (
        assignment.session.status === PrismaSessionStatus.COMPLETED ||
        assignment.session.status === PrismaSessionStatus.DISBANDED
      ) {
        continue;
      }
      const updatedSessionCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: assignment.id },
        include: {
          character: true,
          resource: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      this.realtimeEvents.emitCharacterUpdated(
        assignment.sessionId,
        mapSessionCharacter(updatedSessionCharacter),
      );
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
        featuresJson: JSON.stringify(
          await this.characterFeatureSnapshot.resolveCharacterFeatureSnapshot({
            ancestry: source.ancestry,
            className: source.className,
            subclassName: source.subclassName,
            level: source.level,
            requestedFeatures: this.parseStringArrayJson(source.featuresJson),
            proficientSkills: this.parseStringArrayJson(source.proficientSkillsJson),
            requireMissingFeatureChoices: false,
          }),
        ),
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
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
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
      inventory: normalizeInventoryItemsDisplay(
        JSON.parse(character.inventoryJson) as CharacterInventoryResponseDto["inventory"],
      ),
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
    await this.assertCharacterNotLocked(characterId);

    const inventory = JSON.parse(character.inventoryJson) as InventoryItemDto[];
    const finalLoadout = await this.characterEquipmentLoadout.resolveNextEquipmentLoadout({
      characterId,
      inventory,
      currentMainWeaponId: character.equippedWeaponId ?? null,
      currentOffhandWeaponId: character.offhandWeaponId ?? null,
      requestedMainWeaponId: dto.equippedWeaponId,
      requestedOffhandWeaponId: dto.offhandWeaponId,
    });

    const finalOffhandEquipment = await this.characterEquipmentLoadout.resolveEquippedWeaponCandidate(
      inventory,
      finalLoadout.offhandWeaponId,
      { allowSessionInventoryForCharacterId: characterId },
    );

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        equippedWeaponId: finalLoadout.equippedWeaponId,
        offhandWeaponId: finalLoadout.offhandWeaponId,
        armorClass: this.characterEquipmentLoadout.resolveArmorClass(
          character.className,
          JSON.parse(character.abilitiesJson) as AbilityScoresDto,
          inventory,
          character.armorClass,
          finalLoadout.offhandWeaponId,
          finalOffhandEquipment ? this.characterEquipmentLoadout.isShieldInventoryItem(finalOffhandEquipment) : false,
        ),
      },
      include: {
        sessionCharacters: {
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
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
          include: {
            session: {
              include: {
                sessionScenarios: {
                  include: { gameState: true },
                  orderBy: { sequence: "asc" },
                },
              },
            },
          },
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

  private parseInventoryItemsJson(value: string | null | undefined): InventoryItemDto[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as InventoryItemDto[]) : [];
    } catch {
      return [];
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

}
