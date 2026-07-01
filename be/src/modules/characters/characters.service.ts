import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, createHmac, randomUUID } from "crypto";
import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  Prisma,
  Race,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  AbilityScoresDto,
  CharacterAvatarAssetResponseDto,
  CharacterAvatarType,
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  InventoryItemDto,
  LevelUpCharacterDto,
  normalizeInventoryItemsDisplay,
  normalizeSkillToKo,
  POINT_BUY_COST,
  POINT_BUY_TOTAL,
  RaceAbilityIncreaseDto,
  SessionCharacterResponseDto,
  StartingEquipmentDto,
  StartingSpellsDto,
  UploadCharacterAvatarDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
  UpdatePreparedSpellsDto,
} from "@trpg/shared-types";
import {
  getCantripsKnownLimit,
  getKnownSpellsLimit,
  getSrdClassSpellcastingProgression,
  normalizeSrdCharacterClassKey,
  resolveAvailableAbilityScoreImprovementLevels,
  resolveCharacterSpellSelectionRequirements,
  resolveKnownSpellDelta,
  resolveMaximumCastableSpellLevel,
  resolvePreparedSpellLimit as resolveSrdPreparedSpellLimit,
  resolveSubclassChoiceLevel,
} from "@trpg/srd-data/rules";
import { mapCharacter, mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { isProvidedScenarioId } from "../scenarios/provided-scenario.constants";
import { PrismaService } from "../../database/prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { RacesService } from "../races/races.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { LevelUpService } from "../rules/level-up.service";
import type { HitDie } from "../rules/level-up.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import { SessionsService } from "../sessions/sessions.service";

const defaultAbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

type CharacterAvatarAssetRow = {
  id: string;
  fileName: string;
  contentType: string;
  storageKey: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type CharacterAvatarAssetDelegate = {
  findMany: (args: unknown) => Promise<CharacterAvatarAssetRow[]>;
  create: (args: unknown) => Promise<CharacterAvatarAssetRow>;
  findFirst: (args: unknown) => Promise<CharacterAvatarAssetRow | null>;
};

// 능력치 범위: D&D 5e 공식 상한 20 + 매직 아이템/주문 보정 여유로 30. Point Buy(8~15)는 별도로 검사.
const ABILITY_SCORE_MIN = 1;
const ABILITY_SCORE_MAX = 30;
const ASI_ABILITY_SCORE_MAX = 20;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

// PATCH 류를 막는 세션 상태. RECRUITING/COMPLETED/DISBANDED 는 수정 허용.
const LOCKED_SESSION_STATUSES: ReadonlySet<PrismaSessionStatus> = new Set([
  PrismaSessionStatus.PLAYING,
  PrismaSessionStatus.PAUSED,
]);

const ALLOWED_FEAT_IDS: ReadonlySet<string> = new Set(["feat.alert"]);
const ALLOWED_FIGHTING_STYLE_IDS: ReadonlySet<string> = new Set([
  "archery",
  "defense",
  "dueling",
  "great_weapon_fighting",
  "protection",
  "two_weapon_fighting",
]);
const ALLOWED_FAVORED_ENEMY_IDS: ReadonlySet<string> = new Set([
  "aberrations",
  "beasts",
  "celestials",
  "constructs",
  "dragons",
  "elementals",
  "fey",
  "fiends",
  "giants",
  "monstrosities",
  "oozes",
  "plants",
  "undead",
  "humanoid",
]);
const ALLOWED_FAVORED_HUMANOID_IDS: ReadonlySet<string> = new Set([
  "dwarves",
  "elves",
  "halflings",
  "humans",
  "dragonborn",
  "gnomes",
  "half-elves",
  "half-orcs",
  "tieflings",
  "gnolls",
  "goblins",
  "hobgoblins",
  "kobolds",
  "lizardfolk",
  "orcs",
]);
const ALLOWED_ASI_ABILITY_KEYS: ReadonlySet<string> = new Set([...ABILITY_KEYS]);

function getAsiChoiceLevelsForClass(className: string): number[] {
  return resolveAvailableAbilityScoreImprovementLevels(className, 20);
}

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly racesService: RacesService,
    private readonly catalogService: CatalogService,
    private readonly ruleCatalogService: RuleCatalogService,
    private readonly levelUpService: LevelUpService,
  ) {}

  private get characterAvatarAssetDelegate(): CharacterAvatarAssetDelegate {
    return (this.prisma as unknown as {
      characterAvatarAsset: CharacterAvatarAssetDelegate;
    }).characterAvatarAsset;
  }

  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<CharacterResponseDto> {
    await this.ensureUserExists(userId);

    const level = dto.level ?? 1;
    const scenarioId = await this.resolveScenarioForLevel(userId, dto.scenarioId ?? null, level);
    const ancestry = dto.ancestry.trim();
    const abilities = dto.abilities ?? defaultAbilityScores;
    this.validateAbilitiesRange(abilities);
    const race = await this.findRaceForAncestry(ancestry);
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
    const offhandWeaponId =
      dto.offhandWeaponId ?? this.resolveDefaultOffhandEquipmentId(inventory, equippedWeaponId);
    await this.validateEquipmentLoadout(inventory, equippedWeaponId, offhandWeaponId);
    const spellsJsonValue = await this.resolveStartingSpells(
      className,
      level,
      abilities,
      dto.startingSpells,
    );
    const subclassName = this.assertValidSubclassSelection({
      className,
      subclassName: dto.subclassName,
      level,
      requiredCode: "CHARACTER_SUBCLASS_REQUIRED",
      invalidCode: "CHARACTER_INVALID_SUBCLASS",
    });

    const features = await this.resolveCharacterFeatureSnapshot({
      ancestry,
      raceKey: race?.key ?? null,
      className,
      subclassName,
      level,
      requestedFeatures: dto.features ?? [],
      proficientSkills: normalizedProficientSkills,
      requireMissingFeatureChoices: true,
    });
    await this.validatePointBuyForAncestry(ancestry, abilities, race);
    const maxHpBonus = this.resolveMaxHpBonusFromFeatures(features, className, level);
    const { proficiencyBonus, maxHp } = await this.resolveLevelStats(
      className,
      level,
      abilities,
      dto.proficiencyBonus,
      dto.maxHp,
      maxHpBonus,
    );
    const armorClass = this.resolveArmorClass(
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
        avatarType: this.toAvatarType(dto.avatarType),
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
    await this.ensureUserExists(userId);

    let assets;
    try {
      assets = await this.characterAvatarAssetDelegate.findMany({
        where: { uploadedByUserId: userId },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    return assets.map((asset) => this.mapCharacterAvatarAsset(asset));
  }

  async uploadMyAvatarAsset(
    userId: string,
    dto: UploadCharacterAvatarDto,
  ): Promise<CharacterAvatarAssetResponseDto> {
    await this.ensureUserExists(userId);

    const allowedContentTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowedContentTypes.has(dto.contentType)) {
      throw new BadRequestException("초상화는 PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.");
    }

    const body = Buffer.from(dto.dataBase64, "base64");
    const maxBytes = Number(process.env.R2_MAX_AVATAR_IMAGE_BYTES ?? 5 * 1024 * 1024);
    if (body.byteLength <= 0) {
      throw new BadRequestException("초상화 이미지가 비어 있습니다.");
    }
    if (body.byteLength > maxBytes) {
      throw new BadRequestException("초상화 이미지 파일이 너무 큽니다.");
    }

    const { storageKey, publicUrl } = await this.putR2Object({
      body,
      contentType: dto.contentType,
      fileName: dto.fileName,
      keyPrefix: `users/${userId}/avatars`,
    });

    let asset;
    try {
      asset = await this.characterAvatarAssetDelegate.create({
        data: {
          fileName: dto.fileName.trim(),
          contentType: dto.contentType,
          storageKey,
          publicUrl,
          width: null,
          height: null,
          fileSizeBytes: body.byteLength,
          uploadedByUserId: userId,
        },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    return this.mapCharacterAvatarAsset(asset);
  }

  async deleteMyAvatarAsset(userId: string, assetId: string): Promise<void> {
    await this.ensureUserExists(userId);

    let asset;
    try {
      asset = await this.characterAvatarAssetDelegate.findFirst({
        where: { id: assetId, uploadedByUserId: userId },
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }

    if (!asset) {
      throw new NotFoundException("초상화 이미지를 찾을 수 없습니다.");
    }

    await this.deleteR2Object(asset.storageKey);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.character.updateMany({
          where: {
            ownerUserId: userId,
            avatarUrl: asset.publicUrl,
          },
          data: {
            avatarType: PrismaCharacterAvatarType.DEFAULT,
            avatarPresetId: null,
            avatarUrl: null,
            avatarUpdatedAt: new Date(),
          },
        });
        await (tx as unknown as { characterAvatarAsset: { delete: (args: unknown) => Promise<unknown> } })
          .characterAvatarAsset
          .delete({ where: { id: asset.id } });
      });
    } catch (error) {
      this.rethrowCharacterAvatarAssetStorageError(error);
    }
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
    const finalRace = await this.findRaceForAncestry(finalAncestry);
    const finalClassName = dto.className?.trim() ?? existing.className;
    const finalLevel = dto.level ?? existing.level;
    const finalInventory: InventoryItemDto[] =
      dto.inventory ?? (JSON.parse(existing.inventoryJson) as InventoryItemDto[]);
    const finalEquippedWeaponId =
      dto.equippedWeaponId === undefined ? existing.equippedWeaponId : dto.equippedWeaponId;
    const finalOffhandWeaponId =
      dto.offhandWeaponId === undefined ? existing.offhandWeaponId : dto.offhandWeaponId;

    if (dto.abilities !== undefined || dto.ancestry !== undefined) {
      this.validateAbilitiesRange(finalAbilities);
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
      dto.ancestry !== undefined ||
      dto.level !== undefined ||
      dto.className !== undefined ||
      dto.subclassName !== undefined ||
      dto.features !== undefined ||
      dto.maxHp !== undefined ||
      dto.proficiencyBonus !== undefined;

    const finalSubclassName =
      dto.subclassName === undefined ? existing.subclassName : dto.subclassName?.trim() ?? null;
    const validatedSubclassName = this.assertValidSubclassSelection({
      className: finalClassName,
      subclassName: finalSubclassName,
      level: finalLevel,
      requiredCode: "CHARACTER_SUBCLASS_REQUIRED",
      invalidCode: "CHARACTER_INVALID_SUBCLASS",
    });
    const requestedFeatures = dto.features ?? this.parseStringArrayJson(existing.featuresJson);
    const finalFeatures = await this.resolveCharacterFeatureSnapshot({
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
      await this.validatePointBuyForAncestry(finalAncestry, finalAbilities, finalRace);
    }
    const resolvedStats = needsLevelStats
      ? await this.resolveLevelStats(
          finalClassName,
          finalLevel,
          finalAbilities,
          dto.proficiencyBonus,
          dto.maxHp,
          this.resolveMaxHpBonusFromFeatures(finalFeatures, finalClassName, finalLevel),
        )
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
          this.resolveArmorClass(
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
    const race = await this.findRaceForAncestry(existing.ancestry);
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

    const selectedSubclassName = this.assertValidSubclassSelection({
      className: existing.className,
      subclassName: dto.subclassName?.trim() || existing.subclassName,
      level: resolution.toLevel,
      requiredCode: "LEVEL_UP_SUBCLASS_REQUIRED",
      invalidCode: "LEVEL_UP_INVALID_SUBCLASS",
    });
    const existingFeatureIds = this.parseStringArrayJson(existing.featuresJson);
    const selectedFeatIds = this.resolveLevelUpFeatSelections(
      dto.featSelections,
      resolution.asiOrFeatChoiceRequiredAtLevels,
      existingFeatureIds,
    );

    const asiAdjustedAbilities = this.resolveLevelUpAbilityScores(
      abilities,
      dto.abilityScoreIncreases,
      resolution.asiOrFeatChoiceRequiredAtLevels,
      selectedFeatIds.length,
    );
    const finalFeatures = await this.resolveCharacterFeatureSnapshot({
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
    const finalAbilities = this.applyP6CapstoneAbilityAdjustments({
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
        : this.resolveLevelUpSpellsJson(existing.spellsJson, {
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
      this.getAbilityModifier(finalAbilities.con) - this.getAbilityModifier(abilities.con);
    const previousMaxHpFeatureBonus = this.resolveMaxHpBonusFromFeatures(
      this.parseStringArrayJson(existing.featuresJson),
      existing.className,
      resolution.fromLevel,
    );
    const finalMaxHpFeatureBonus = this.resolveMaxHpBonusFromFeatures(
      finalFeatures,
      existing.className,
      resolution.toLevel,
    );
    const finalMaxHp =
      resolution.maxHpAfter +
      constitutionModifierDelta * resolution.toLevel +
      (finalMaxHpFeatureBonus - previousMaxHpFeatureBonus);
    const inventory = this.parseInventoryItemsJson(existing.inventoryJson);
    const previousCalculatedArmorClass = this.resolveArmorClass(
      existing.className,
      abilities,
      inventory,
      existing.armorClass,
      existing.offhandWeaponId ?? null,
    );
    const normalizedClassName = normalizeSrdCharacterClassKey(existing.className);
    const canRecalculateArmorClass =
      inventory.some((item) => this.isArmorInventoryItem(item)) ||
      normalizedClassName.includes("barbarian") ||
      normalizedClassName.includes("monk") ||
      existing.armorClass === previousCalculatedArmorClass;
    const recalculatedArmorClass = this.resolveArmorClass(
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

  private resolveLevelUpFeatSelections(
    requested: LevelUpCharacterDto["featSelections"],
    asiLevels: number[],
    existingFeatureIds: string[],
  ): string[] {
    const featSelections = (requested ?? [])
      .map((featId) => featId.trim().toLowerCase())
      .filter(Boolean);
    if (featSelections.length > asiLevels.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_TOO_MANY_FEATS",
        message: "Feat 선택 수는 이번 레벨업에서 지나간 ASI 지점 수를 넘을 수 없습니다.",
        levels: asiLevels,
        featSelections,
      });
    }
    const duplicateFeatIds = featSelections.filter(
      (featId, index) => featSelections.indexOf(featId) !== index,
    );
    if (duplicateFeatIds.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_DUPLICATE_FEAT",
        message: "같은 Feat는 중복 선택할 수 없습니다.",
        featIds: Array.from(new Set(duplicateFeatIds)),
      });
    }
    const invalidFeatId = featSelections.find((featId) => !ALLOWED_FEAT_IDS.has(featId));
    if (invalidFeatId) {
      throw new BadRequestException({
        code: "LEVEL_UP_INVALID_FEAT",
        message: "현재 캐릭터 빌더에서 사용할 수 없는 Feat입니다.",
        featId: invalidFeatId,
      });
    }
    const existingFeatIds = new Set(
      existingFeatureIds
        .map((featureId) => featureId.trim().toLowerCase())
        .filter((featureId) => featureId.startsWith("feat.")),
    );
    const alreadyOwnedFeatId = featSelections.find((featId) => existingFeatIds.has(featId));
    if (alreadyOwnedFeatId) {
      throw new BadRequestException({
        code: "LEVEL_UP_FEAT_ALREADY_OWNED",
        message: "이미 보유한 Feat는 다시 선택할 수 없습니다.",
        featId: alreadyOwnedFeatId,
      });
    }
    return featSelections;
  }

  private resolveLevelUpAbilityScores(
    current: AbilityScoresDto,
    requested: LevelUpCharacterDto["abilityScoreIncreases"],
    asiLevels: number[],
    featSelectionCount = 0,
  ): AbilityScoresDto {
    const requiredPoints = Math.max(0, asiLevels.length - featSelectionCount) * 2;
    const increases = requested ?? {};
    let allocatedPoints = 0;
    const next = { ...current };

    for (const ability of ABILITY_KEYS) {
      const increase = increases[ability] ?? 0;
      if (!Number.isInteger(increase) || increase < 0) {
        throw new BadRequestException({
          code: "LEVEL_UP_INVALID_ASI",
          message: "능력치 상승치는 0 이상의 정수여야 합니다.",
          ability,
          increase,
        });
      }
      allocatedPoints += increase;
      const nextScore = current[ability] + increase;
      if (nextScore > ASI_ABILITY_SCORE_MAX) {
        throw new BadRequestException({
          code: "LEVEL_UP_INVALID_ASI",
          message: `ASI로 올린 능력치는 ${ASI_ABILITY_SCORE_MAX}을 넘을 수 없습니다.`,
          ability,
          currentScore: current[ability],
          increase,
          maximum: ASI_ABILITY_SCORE_MAX,
        });
      }
      next[ability] = nextScore;
    }

    if (allocatedPoints !== requiredPoints) {
      throw new BadRequestException({
        code: "LEVEL_UP_ASI_REQUIRED",
        message: requiredPoints
          ? `이번 레벨업에는 능력치 상승 ${requiredPoints}점을 모두 배분해야 합니다.`
          : "이번 레벨업 구간에는 능력치 상승점을 배분할 수 없습니다.",
        levels: asiLevels,
        requiredPoints,
        allocatedPoints,
      });
    }

    return next;
  }

  private applyP6CapstoneAbilityAdjustments(params: {
    className: string;
    fromLevel: number;
    toLevel: number;
    abilities: AbilityScoresDto;
    featureIds: string[];
  }): AbilityScoresDto {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    if (
      params.fromLevel < 20 &&
      params.toLevel >= 20 &&
      classKey === "barbarian" &&
      params.featureIds.includes("class.barbarian.feature.primal_champion")
    ) {
      return {
        ...params.abilities,
        str: Math.min(params.abilities.str + 4, 24),
        con: Math.min(params.abilities.con + 4, 24),
      };
    }
    return params.abilities;
  }

  async updatePreparedSpells(
    userId: string,
    characterId: string,
    dto: UpdatePreparedSpellsDto,
  ): Promise<CharacterResponseDto> {
    const existing = await this.getOwnedCharacterOrThrow(userId, characterId);
    const spellsJson = this.resolvePreparedSpellsJson(existing.spellsJson, dto.preparedSpells, {
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

  private resolvePreparedSpellsJson(
    spellsJson: string | null,
    requestedPreparedSpells: string[],
    character: { className: string; level: number; abilities: AbilityScoresDto },
  ): string {
    const spells = this.parseSpellsJson(spellsJson);
    if (!spells) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_NOT_AVAILABLE",
        message: "주문을 가진 캐릭터만 준비 주문을 갱신할 수 있습니다.",
      });
    }

    const knownSpellIds = new Set(spells.spells.map((spell) => this.normalizeSpellId(spell)));
    const preparedSpells = Array.from(
      new Set(requestedPreparedSpells.map((spell) => this.normalizeSpellId(spell)).filter(Boolean)),
    );
    const unknownPreparedSpell = preparedSpells.find((spell) => !knownSpellIds.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    this.assertPreparedSpellLimit(character, preparedSpells);

    return JSON.stringify({
      ...spells,
      preparedSpells,
    });
  }

  private resolveLevelUpSpellsJson(
    spellsJson: string | null,
    params: {
      knownSpells?: string[];
      preparedSpells?: string[];
      cantrips?: string[];
      forgottenSpells?: string[];
      forgottenCantrips?: string[];
      currentLevel: number;
      level: number;
      className: string;
      abilities: AbilityScoresDto;
    },
  ): string {
    const parsedSpells = this.parseSpellsJson(spellsJson);
    const spells = parsedSpells ?? this.createEmptyLevelUpSpellState(params.className, params.level);
    if (!spells) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELLS_NOT_AVAILABLE",
        message: "주문을 가진 캐릭터만 레벨업 주문을 갱신할 수 있습니다.",
      });
    }

    const knownSpellPool = this.getExecutableSlotSpellPool(params.className, params.level);
    const cantripPool = this.getExecutableCantripIds();
    const currentCantrips = spells.cantrips
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const currentKnownSpells = spells.spells
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const requestedCantrips = this.normalizeUniqueSpellSelection(params.cantrips);
    const requestedKnownSpells = (params.knownSpells ?? [])
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const forgottenCantrips = this.normalizeUniqueSpellSelection(params.forgottenCantrips);
    const forgottenKnownSpells = this.normalizeUniqueSpellSelection(params.forgottenSpells);
    this.assertForgottenSpellsExist(currentCantrips, forgottenCantrips, "LEVEL_UP_CANTRIP_NOT_KNOWN");
    this.assertForgottenSpellsExist(currentKnownSpells, forgottenKnownSpells, "LEVEL_UP_SPELL_NOT_KNOWN");
    this.assertNewSpellSelections(
      currentCantrips,
      requestedCantrips,
      forgottenCantrips,
      "LEVEL_UP_CANTRIP_ALREADY_KNOWN",
    );
    this.assertNewSpellSelections(
      currentKnownSpells,
      requestedKnownSpells,
      forgottenKnownSpells,
      "LEVEL_UP_SPELL_ALREADY_KNOWN",
    );
    const nextCantrips = Array.from(new Set([
      ...currentCantrips.filter((spell) => !forgottenCantrips.includes(spell)),
      ...requestedCantrips,
    ]));
    const nextKnownSpells = Array.from(new Set([
      ...currentKnownSpells.filter((spell) => !forgottenKnownSpells.includes(spell)),
      ...requestedKnownSpells,
    ]));
    const unsupportedCantrip = requestedCantrips.find((spell) => !cantripPool.has(spell));
    if (unsupportedCantrip) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_NOT_AVAILABLE",
        message: "현재 실행 주문 카탈로그에 있는 캔트립만 습득할 수 있습니다.",
        spellId: unsupportedCantrip,
      });
    }
    const unsupportedKnownSpell = requestedKnownSpells.find((spell) => !knownSpellPool.has(spell));
    if (unsupportedKnownSpell) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_NOT_AVAILABLE",
        message: "현재 실행 주문 카탈로그에 있는 슬롯 주문만 레벨업으로 습득할 수 있습니다.",
        spellId: unsupportedKnownSpell,
      });
    }
    this.assertLevelUpCantripProgression({
      className: params.className,
      currentLevel: params.currentLevel,
      targetLevel: params.level,
      currentCantrips,
      requestedCantrips,
      forgottenCantrips,
      nextCantrips,
    });
    this.assertLevelUpKnownSpellProgression({
      className: params.className,
      currentLevel: params.currentLevel,
      targetLevel: params.level,
      currentKnownSpells,
      requestedKnownSpells,
      forgottenKnownSpells,
      nextKnownSpells,
      availableSpellCount: knownSpellPool.size,
    });

    if (!this.isPreparedSpellcaster(params.className, params.level)) {
      const requestedPreparedSpells = this.normalizeUniqueSpellSelection(params.preparedSpells);
      if (requestedPreparedSpells.length > 0) {
        throw new BadRequestException({
          code: "PREPARED_SPELLS_NOT_SUPPORTED",
          message: "이 직업은 준비 주문 모델을 사용하지 않습니다.",
          className: params.className,
        });
      }
      const knownCasterSpells = { ...spells };
      delete knownCasterSpells.preparedSpells;
      return JSON.stringify({
        ...knownCasterSpells,
        cantrips: nextCantrips,
        spells: nextKnownSpells,
      });
    }

    const preparedSpells =
      params.preparedSpells === undefined
        ? (spells.preparedSpells ?? [])
        : Array.from(
            new Set(
              params.preparedSpells.map((spell) => this.normalizeSpellId(spell)).filter(Boolean),
            ),
          );
    const nextKnownSet = new Set(nextKnownSpells);
    const unknownPreparedSpell = preparedSpells.find((spell) => !nextKnownSet.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    this.assertPreparedSpellLimit({
      className: params.className,
      level: params.level,
      abilities: params.abilities,
    }, preparedSpells);

    return JSON.stringify({
      ...spells,
      cantrips: nextCantrips,
      spells: nextKnownSpells,
      preparedSpells,
    });
  }

  private createEmptyLevelUpSpellState(
    className: string,
    level: number,
  ): StartingSpellsDto | null {
    const classKey = normalizeSrdCharacterClassKey(className);
    const progression = getSrdClassSpellcastingProgression(classKey, level);
    if (!progression) {
      return null;
    }

    return {
      cantrips: [],
      spells: [],
      ...(this.isPreparedSpellcaster(classKey, level) ? { preparedSpells: [] } : {}),
    };
  }

  private normalizeUniqueSpellSelection(spells: string[] | undefined): string[] {
    return Array.from(
      new Set((spells ?? []).map((spell) => this.normalizeSpellId(spell)).filter(Boolean)),
    );
  }

  private assertForgottenSpellsExist(
    currentSpells: string[],
    forgottenSpells: string[],
    code: string,
  ): void {
    const current = new Set(currentSpells);
    const unknown = forgottenSpells.find((spell) => !current.has(spell));
    if (unknown) {
      throw new BadRequestException({
        code,
        message: "현재 알고 있는 주문만 교체 대상으로 지정할 수 있습니다.",
        spellId: unknown,
      });
    }
  }

  private assertNewSpellSelections(
    currentSpells: string[],
    requestedSpells: string[],
    forgottenSpells: string[],
    code: string,
  ): void {
    const current = new Set(currentSpells);
    const forgotten = new Set(forgottenSpells);
    const duplicate = requestedSpells.find((spell) => current.has(spell) || forgotten.has(spell));
    if (duplicate) {
      throw new BadRequestException({
        code,
        message: "새로 습득할 주문은 현재 주문 또는 교체 대상과 중복될 수 없습니다.",
        spellId: duplicate,
      });
    }
  }

  private assertLevelUpCantripProgression(params: {
    className: string;
    currentLevel: number;
    targetLevel: number;
    currentCantrips: string[];
    requestedCantrips: string[];
    forgottenCantrips: string[];
    nextCantrips: string[];
  }): void {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const spellDelta = resolveKnownSpellDelta({
      classKey,
      currentLevel: params.currentLevel,
      targetLevel: params.targetLevel,
    });
    const targetLimit = getCantripsKnownLimit(classKey, params.targetLevel);
    if (!spellDelta.targetHasCantripProgression || targetLimit === null) {
      if (params.requestedCantrips.length || params.forgottenCantrips.length) {
        throw new BadRequestException({
          code: "LEVEL_UP_CANTRIPS_NOT_SUPPORTED",
          message: "이 직업은 현재 레벨에서 캔트립 성장 모델을 사용하지 않습니다.",
        });
      }
      return;
    }

    const levelDelta = params.targetLevel - params.currentLevel;
    const learnedAllowance = spellDelta.cantripDelta;
    if (params.forgottenCantrips.length > levelDelta) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_REPLACEMENT_LIMIT_EXCEEDED",
        message: "한 레벨당 캔트립 하나까지만 교체할 수 있습니다.",
        replacementLimit: levelDelta,
      });
    }
    if (params.requestedCantrips.length < params.forgottenCantrips.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_REPLACEMENT_INCOMPLETE",
        message: "교체 대상으로 뺀 캔트립 수만큼 새 캔트립을 선택해야 합니다.",
      });
    }
    if (params.requestedCantrips.length > learnedAllowance + params.forgottenCantrips.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_LEARN_LIMIT_EXCEEDED",
        message: "이번 레벨업에서 습득하거나 교체할 수 있는 캔트립 수를 초과했습니다.",
        learnLimit: learnedAllowance + params.forgottenCantrips.length,
      });
    }
    if (
      params.nextCantrips.length >
      Math.min(targetLimit, this.getExecutableCantripIds().size)
    ) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_LIMIT_EXCEEDED",
        message: "목표 레벨의 캔트립 습득 상한을 초과했습니다.",
      });
    }
  }

  private assertLevelUpKnownSpellProgression(params: {
    className: string;
    currentLevel: number;
    targetLevel: number;
    currentKnownSpells: string[];
    requestedKnownSpells: string[];
    forgottenKnownSpells: string[];
    nextKnownSpells: string[];
    availableSpellCount: number;
  }): void {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const levelDelta = params.targetLevel - params.currentLevel;
    const spellDelta = resolveKnownSpellDelta({
      classKey,
      currentLevel: params.currentLevel,
      targetLevel: params.targetLevel,
    });
    if (!spellDelta.canReplaceKnownSpells) {
      if (params.forgottenKnownSpells.length) {
        throw new BadRequestException({
          code: classKey === "wizard"
            ? "LEVEL_UP_WIZARD_SPELL_REPLACEMENT_NOT_SUPPORTED"
            : "LEVEL_UP_SPELL_REPLACEMENT_NOT_SUPPORTED",
          message: classKey === "wizard"
            ? "위저드 주문책 주문은 레벨업으로 제거하지 않습니다."
            : "이 직업은 known spell 교체 모델을 사용하지 않습니다.",
        });
      }
    }

    if (classKey === "wizard") {
      if (params.requestedKnownSpells.length > spellDelta.knownSpellDelta) {
        throw new BadRequestException({
          code: "LEVEL_UP_SPELL_LEARN_LIMIT_EXCEEDED",
          message: "위저드는 레벨당 주문책 주문 두 개를 추가할 수 있습니다.",
          learnLimit: spellDelta.knownSpellDelta,
        });
      }
      return;
    }

    const targetLimit = getKnownSpellsLimit(classKey, params.targetLevel);
    if (!spellDelta.targetHasKnownSpellProgression || targetLimit === null) {
      return;
    }

    const learnedAllowance = spellDelta.knownSpellDelta;
    if (params.forgottenKnownSpells.length > levelDelta) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_REPLACEMENT_LIMIT_EXCEEDED",
        message: "한 레벨당 알고 있는 슬롯 주문 하나까지만 교체할 수 있습니다.",
        replacementLimit: levelDelta,
      });
    }
    if (params.requestedKnownSpells.length < params.forgottenKnownSpells.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_REPLACEMENT_INCOMPLETE",
        message: "교체 대상으로 뺀 슬롯 주문 수만큼 새 주문을 선택해야 합니다.",
      });
    }
    if (params.requestedKnownSpells.length > learnedAllowance + params.forgottenKnownSpells.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_LEARN_LIMIT_EXCEEDED",
        message: "이번 레벨업에서 습득하거나 교체할 수 있는 슬롯 주문 수를 초과했습니다.",
        learnLimit: learnedAllowance + params.forgottenKnownSpells.length,
      });
    }
    if (params.nextKnownSpells.length > Math.min(targetLimit, params.availableSpellCount)) {
      throw new BadRequestException({
        code: "LEVEL_UP_KNOWN_SPELL_LIMIT_EXCEEDED",
        message: "목표 레벨의 알고 있는 주문 수 상한을 초과했습니다.",
      });
    }
  }

  private assertPreparedSpellLimit(
    character: { className: string; level: number; abilities: AbilityScoresDto },
    preparedSpells: string[],
  ): void {
    const limit = this.resolvePreparedSpellLimit(character);
    if (limit === null) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_NOT_SUPPORTED",
        message: "이 직업은 준비 주문 모델을 사용하지 않습니다.",
        className: character.className,
      });
    }
    if (preparedSpells.length <= limit) {
      return;
    }

    throw new BadRequestException({
      code: "PREPARED_SPELL_LIMIT_EXCEEDED",
      message: "준비 가능한 주문 수를 초과했습니다.",
      preparedCount: preparedSpells.length,
      preparedLimit: limit,
    });
  }

  private resolvePreparedSpellLimit(
    character: { className: string; level: number; abilities: AbilityScoresDto },
  ): number | null {
    return resolveSrdPreparedSpellLimit({
      classKey: character.className,
      level: character.level,
      abilities: character.abilities,
    });
  }

  private isPreparedSpellcaster(className: string, level = 1): boolean {
    return this.resolvePreparedSpellLimit({
      className,
      level,
      abilities: defaultAbilityScores,
    }) !== null;
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
          await this.resolveCharacterFeatureSnapshot({
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
    const finalLoadout = await this.resolveNextEquipmentLoadout({
      characterId,
      inventory,
      currentMainWeaponId: character.equippedWeaponId ?? null,
      currentOffhandWeaponId: character.offhandWeaponId ?? null,
      requestedMainWeaponId: dto.equippedWeaponId,
      requestedOffhandWeaponId: dto.offhandWeaponId,
    });

    const finalOffhandEquipment = await this.resolveEquippedWeaponCandidate(
      inventory,
      finalLoadout.offhandWeaponId,
      { allowSessionInventoryForCharacterId: characterId },
    );

    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        equippedWeaponId: finalLoadout.equippedWeaponId,
        offhandWeaponId: finalLoadout.offhandWeaponId,
        armorClass: this.resolveArmorClass(
          character.className,
          JSON.parse(character.abilitiesJson) as AbilityScoresDto,
          inventory,
          character.armorClass,
          finalLoadout.offhandWeaponId,
          finalOffhandEquipment ? this.isShieldInventoryItem(finalOffhandEquipment) : false,
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

    const isProvidedScenario = isProvidedScenarioId(scenario.id);
    const isOwnScenario = scenario.createdByUserId === userId;
    if (!isProvidedScenario && !isOwnScenario) {
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
    resolvedRace?: Race | null,
  ): Promise<void> {
    const race = resolvedRace ?? await this.findRaceForAncestry(ancestry);
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

    const totalCost = (["str", "dex", "con", "int", "wis", "cha"] as const).reduce(
      (sum, key) => sum + (POINT_BUY_COST[finalScores[key] - (increases[key] ?? 0)] ?? 0),
      0,
    );
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
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
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
    const currentMainWeaponId = await this.normalizeEquippedWeaponId(
      params.inventory,
      params.currentMainWeaponId,
      params.characterId,
    );
    const currentOffhandWeaponId = await this.normalizeEquippedWeaponId(
      params.inventory,
      params.currentOffhandWeaponId,
      params.characterId,
    );
    const requestedMainWeaponId =
      params.requestedMainWeaponId === undefined
        ? undefined
        : await this.normalizeEquippedWeaponId(
            params.inventory,
            params.requestedMainWeaponId,
            params.characterId,
          );
    const requestedOffhandWeaponId =
      params.requestedOffhandWeaponId === undefined
        ? undefined
        : await this.normalizeEquippedWeaponId(
            params.inventory,
            params.requestedOffhandWeaponId,
            params.characterId,
          );
    let equippedWeaponId =
      requestedMainWeaponId === undefined ? currentMainWeaponId : requestedMainWeaponId;
    let offhandWeaponId =
      requestedOffhandWeaponId === undefined ? currentOffhandWeaponId : requestedOffhandWeaponId;

    if (
      requestedMainWeaponId &&
      requestedOffhandWeaponId === undefined &&
      currentMainWeaponId &&
      !currentOffhandWeaponId
    ) {
      const currentMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        currentMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );
      const requestedMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        requestedMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );

      if (
        currentMain &&
        requestedMain &&
        this.isOneHandWeaponCandidate(currentMain) &&
        this.isOneHandWeaponCandidate(requestedMain) &&
        (currentMainWeaponId !== requestedMainWeaponId ||
          (requestedMain.quantity ?? 0) >= 2)
      ) {
        equippedWeaponId = currentMainWeaponId;
        offhandWeaponId = requestedMainWeaponId;
      }
    }

    if (equippedWeaponId && offhandWeaponId && equippedWeaponId === offhandWeaponId) {
      const duplicatedWeapon = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        equippedWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );
      if ((duplicatedWeapon?.quantity ?? 0) < 2) {
        offhandWeaponId = null;
      }
    }

    if (!equippedWeaponId && offhandWeaponId) {
      const offhand = await this.resolveEquippedWeaponCandidate(params.inventory, offhandWeaponId, {
        allowSessionInventoryForCharacterId: params.characterId,
      });
      if (!offhand || this.isWeaponInventoryItem(offhand)) {
        offhandWeaponId = null;
      }
    }

    if (equippedWeaponId) {
      const main = await this.resolveEquippedWeaponCandidate(params.inventory, equippedWeaponId, {
        allowSessionInventoryForCharacterId: params.characterId,
      });
      if (main && !this.isOneHandWeaponCandidate(main)) {
        if (requestedOffhandWeaponId !== undefined && offhandWeaponId) {
          throw new BadRequestException(
            "장비: 두손 무기를 장착한 상태에서는 왼손 장비를 함께 장착할 수 없습니다.",
          );
        }
        offhandWeaponId = null;
      }
    }

    await this.validateEquipmentLoadout(params.inventory, equippedWeaponId, offhandWeaponId, {
      allowSessionInventoryForCharacterId: params.characterId,
    });

    return { equippedWeaponId, offhandWeaponId };
  }

  private async normalizeEquippedWeaponId(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null | undefined,
    characterId: string,
  ): Promise<string | null> {
    if (!equippedWeaponId) {
      return null;
    }
    const matched = await this.resolveEquippedWeaponCandidate(inventory, equippedWeaponId, {
      allowSessionInventoryForCharacterId: characterId,
    });
    return matched?.itemDefinitionId ?? matched?.id ?? equippedWeaponId;
  }

  private async validateEquipmentLoadout(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    offhandWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<void> {
    await this.validateInventoryAndEquippedWeapon(inventory, equippedWeaponId, "rightHand", options);
    await this.validateInventoryAndEquippedWeapon(inventory, offhandWeaponId, "leftHand", options);

    if (!equippedWeaponId || !offhandWeaponId) {
      return;
    }
    const main = await this.resolveEquippedWeaponCandidate(inventory, equippedWeaponId, options);
    const offhand = await this.resolveEquippedWeaponCandidate(inventory, offhandWeaponId, options);

    if (equippedWeaponId === offhandWeaponId && (main?.quantity ?? 0) < 2) {
      throw new BadRequestException("장비: 같은 무기를 양손에 동시에 장착할 수 없습니다.");
    }

    if (!main || !offhand) {
      return;
    }
    if (!this.isOneHandWeaponCandidate(main)) {
      throw new BadRequestException(
        "장비: 두손 무기를 장착한 상태에서는 왼손 장비를 함께 장착할 수 없습니다.",
      );
    }

    if (this.isShieldInventoryItem(offhand)) {
      return;
    }

    if (!this.isOneHandWeaponCandidate(offhand)) {
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
    slot: "rightHand" | "leftHand",
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
      const matched = await this.resolveEquippedWeaponCandidate(
        inventory,
        equippedWeaponId,
        options,
      );
      if (matched) {
        const isValidEquipment =
          slot === "rightHand"
            ? this.isWeaponInventoryItem(matched)
            : this.isWeaponInventoryItem(matched) || this.isShieldInventoryItem(matched);
        if (!isValidEquipment) {
          throw new BadRequestException(
            slot === "rightHand"
              ? `장비: 오른손 장착 대상(${equippedWeaponId})은 무기가 아닙니다.`
              : `장비: 왼손 장착 대상(${equippedWeaponId})은 무기 또는 방패가 아닙니다.`,
          );
        }
        return;
      }

      if (!matched) {
        throw new BadRequestException(
          `장비: 장착 장비 id(${equippedWeaponId})가 인벤토리에 없습니다.`,
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
          status: PrismaSessionCharacterStatus.ACTIVE,
          session: {
            status: { in: [PrismaSessionStatus.PLAYING, PrismaSessionStatus.PAUSED] },
          },
        },
        OR: [{ id: equippedWeaponId }, { itemDefinitionId: equippedWeaponId }],
      },
      include: { itemDefinition: true },
    });

    if (sessionInventoryMatch) {
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

    const sessionCharacter = await this.prisma.sessionCharacter.findFirst({
      where: {
        characterId: options.allowSessionInventoryForCharacterId,
        status: PrismaSessionCharacterStatus.ACTIVE,
        session: {
          status: { in: [PrismaSessionStatus.PLAYING, PrismaSessionStatus.PAUSED] },
        },
      },
      select: {
        inventorySnapshotJson: true,
        character: { select: { inventoryJson: true } },
      },
    });
    const snapshotInventory = this.parseInventoryItemsJson(
      sessionCharacter?.inventorySnapshotJson ?? sessionCharacter?.character.inventoryJson,
    );
    return (
      snapshotInventory.find(
        (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
      ) ?? null
    );
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
    maxHpBonus = 0,
  ): Promise<{ proficiencyBonus: number; maxHp: number }> {
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass) {
      return {
        proficiencyBonus: dtoProf ?? 2,
        maxHp: dtoMaxHp ?? 10 + maxHpBonus,
      };
    }

    let stats: { proficiencyBonus: number; maxHp: number; constitutionModifier: number };
    try {
      stats = this.levelUpService.resolveCharacterLevelStats({
        level,
        hitDie: klass.hitDie,
        constitutionScore: abilities.con,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("hitDie")) {
        throw new BadRequestException(message || "레벨 보정 입력값이 유효하지 않습니다.");
      }
      throw new BadRequestException(
        `레벨 보정: ${klass.koName} 의 hitDie ${klass.hitDie} 가 지원되지 않습니다.`,
      );
    }
    const expectedProf = stats.proficiencyBonus;
    const expectedMaxHp = stats.maxHp + maxHpBonus;

    if (dtoProf !== undefined && dtoProf !== expectedProf) {
      throw new BadRequestException(
        `숙련 보너스: 레벨 ${level} 의 정답은 ${expectedProf} 인데 ${dtoProf} 가 들어왔습니다.`,
      );
    }
    if (dtoMaxHp !== undefined && dtoMaxHp !== expectedMaxHp) {
      throw new BadRequestException(
        `maxHp: ${klass.koName}/레벨 ${level}/Con ${abilities.con}(mod ${stats.constitutionModifier}) 의 공식값은 ${expectedMaxHp} 인데 ${dtoMaxHp} 가 들어왔습니다.`,
      );
    }

    return { proficiencyBonus: expectedProf, maxHp: expectedMaxHp };
  }

  private resolveMaxHpBonusFromFeatures(
    featureIds: string[],
    className: string,
    level: number,
  ): number {
    const normalizedClassName = normalizeSrdCharacterClassKey(className);
    const normalizedLevel = Math.max(Math.floor(level), 0);
    let bonus = 0;

    for (const tag of this.ruleCatalogService.resolveRuntimeTags(featureIds)) {
      const perLevelMatch = /^hp_bonus:per_level:\+(\d+)$/.exec(tag);
      if (perLevelMatch) {
        bonus += Number(perLevelMatch[1]) * normalizedLevel;
        continue;
      }

      const perClassLevelMatch = /^hp_bonus:per_([a-z0-9_-]+)_level:\+(\d+)$/.exec(tag);
      if (perClassLevelMatch && perClassLevelMatch[1] === normalizedClassName) {
        bonus += Number(perClassLevelMatch[2]) * normalizedLevel;
      }
    }

    return bonus;
  }

  // ClassDefinition과 SRD spellcasting progression을 함께 사용해 시작 주문 수를 결정한다.
  // 준비형 직업은 주문시전이 열린 레벨부터 현재 실행 슬롯 주문 카탈로그를 known 목록으로 사용한다.
  // 반환값: spellsJson 에 저장할 문자열(또는 null = 마법 없는 클래스/legacy)
  private async resolveStartingSpells(
    className: string,
    level: number,
    abilities: AbilityScoresDto,
    startingSpells: StartingSpellsDto | undefined,
  ): Promise<string | null> {
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass) return null;

    const executableSlotSpellPool = this.getExecutableSlotSpellPool(classKey, level);
    const requirements = resolveCharacterSpellSelectionRequirements({
      classKey,
      level,
      abilities,
      executableSpellPools: {
        cantrips: Array.from(this.getExecutableCantripIds()),
        slotSpells: Array.from(executableSlotSpellPool),
      },
    });
    const needCantrips = requirements.cantripCount;
    const needSpells = requirements.knownOrSpellbookSpellCount;
    const usesDynamicPreparedPool = requirements.usesDynamicPreparedPool;

    if (needCantrips === 0 && needSpells === 0 && !usesDynamicPreparedPool) {
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

    const cantrips = startingSpells.cantrips.map((s) => s.trim()).filter((s) => s.length > 0);
    const spells = usesDynamicPreparedPool
      ? Array.from(executableSlotSpellPool).sort()
      : startingSpells.spells.map((s) => s.trim()).filter((s) => s.length > 0);
    if (cantrips.length !== needCantrips) {
      throw new BadRequestException(
        `시작 주문: 비어 있지 않은 캔트립 ${cantrips.length}개가 ${klass.koName} 요구치 ${needCantrips}개와 일치하지 않습니다.`,
      );
    }
    if (!usesDynamicPreparedPool && spells.length !== needSpells) {
      throw new BadRequestException(
        `시작 주문: 비어 있지 않은 주문 ${spells.length}개가 ${klass.koName} 요구치 ${needSpells}개와 일치하지 않습니다.`,
      );
    }
    this.assertUniqueStartingSpellIds(cantrips, "캔트립");
    this.assertUniqueStartingSpellIds(spells, "주문");
    this.assertExecutableStartingSpellPool(
      cantrips,
      "캔트립",
      this.getExecutableCantripIds(),
    );
    this.assertExecutableStartingSpellPool(spells, "주문", executableSlotSpellPool);
    const knownSpellIds = new Set(spells.map((spell) => this.normalizeSpellId(spell)));
    const rawPreparedSpells = startingSpells.preparedSpells
      ? Array.from(
          new Set(
            startingSpells.preparedSpells
              .map((spell) => this.normalizeSpellId(spell))
              .filter(Boolean),
          ),
        )
      : undefined;
    const preparedSpellLimit = requirements.preparedSpellCount;
    const preparedSpells =
      rawPreparedSpells && (rawPreparedSpells.length > 0 || preparedSpellLimit !== null)
        ? rawPreparedSpells
        : undefined;
    if (preparedSpellLimit !== null && !preparedSpells) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_REQUIRED",
        message: "이 직업은 생성 시 준비 주문을 선택해야 합니다.",
        preparedLimit: preparedSpellLimit,
      });
    }
    const unknownPreparedSpell = preparedSpells?.find((spell) => !knownSpellIds.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    if (preparedSpells) {
      this.assertPreparedSpellLimit({ className, level, abilities }, preparedSpells);
      if (preparedSpellLimit !== null && preparedSpells.length !== preparedSpellLimit) {
        throw new BadRequestException({
          code: "PREPARED_SPELL_COUNT_MISMATCH",
          message: "준비 주문 수가 직업/레벨/능력치 기준과 일치하지 않습니다.",
          preparedCount: preparedSpells.length,
          preparedLimit: preparedSpellLimit,
        });
      }
    }

    return JSON.stringify({
      cantrips,
      spells,
      ...(preparedSpells ? { preparedSpells } : {}),
    });
  }

  // className 이 ClassDefinition 시드에 있으면 시작 장비 강제(슬롯 개수만큼 정확히 1 옵션씩 선택).
  // 반환값: inventory(시작 장비 아이템 모두). null = 시드에 없음(legacy ancestry/className 케이스)
  private async resolveStartingEquipment(
    className: string,
    selection: number[] | undefined,
    itemSelections: Record<string, string> | undefined,
  ): Promise<InventoryItemDto[] | null> {
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
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

  private resolveDefaultOffhandEquipmentId(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
  ): string | null {
    const mainWeapon = inventory.find(
      (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
    );
    if (mainWeapon && !this.isOneHandWeaponCandidate(mainWeapon)) {
      return null;
    }

    const shield = inventory.find((item) => this.isShieldInventoryItem(item));
    return shield?.itemDefinitionId ?? shield?.id ?? null;
  }

  private resolveArmorClass(
    className: string,
    abilities: AbilityScoresDto,
    inventory: InventoryItemDto[],
    fallbackArmorClass: number | undefined,
    offhandEquipmentId: string | null = null,
    hasEquippedShield = false,
  ): number {
    const dexMod = this.getAbilityModifier(abilities.dex);
    const conMod = this.getAbilityModifier(abilities.con);
    const wisMod = this.getAbilityModifier(abilities.wis);
    const normalizedClass = normalizeSrdCharacterClassKey(className);
    const shieldBonus = hasEquippedShield || inventory.some(
      (item) =>
        this.isShieldInventoryItem(item) &&
        Boolean(offhandEquipmentId) &&
        (item.id === offhandEquipmentId || item.itemDefinitionId === offhandEquipmentId),
    )
      ? 2
      : 0;
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

  private parseSpellsJson(value: string | null | undefined): StartingSpellsDto | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<StartingSpellsDto> | null;
      if (!parsed || !Array.isArray(parsed.cantrips) || !Array.isArray(parsed.spells)) {
        return null;
      }
      return {
        cantrips: parsed.cantrips.filter((spell): spell is string => typeof spell === "string"),
        spells: parsed.spells.filter((spell): spell is string => typeof spell === "string"),
        preparedSpells: Array.isArray(parsed.preparedSpells)
          ? parsed.preparedSpells.filter((spell): spell is string => typeof spell === "string")
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private normalizeSpellId(spellId: string): string {
    const normalized = spellId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private assertUniqueStartingSpellIds(spellIds: string[], label: string): void {
    const normalized = spellIds.map((spellId) => this.normalizeSpellId(spellId));
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(`시작 주문: ${label} 선택에 중복이 있습니다.`);
    }
  }

  private assertExecutableStartingSpellPool(spellIds: string[], label: string, allowedSpellIds: Set<string>): void {
    const unsupportedSpellId = spellIds
      .map((spellId) => this.normalizeSpellId(spellId))
      .find((spellId) => !allowedSpellIds.has(spellId));
    if (unsupportedSpellId) {
      throw new BadRequestException(`시작 주문: ${label} ${unsupportedSpellId}은(는) 현재 실행 주문 카탈로그에 없습니다.`);
    }
  }

  private getExecutableSlotSpellPool(className: string, level: number): Set<string> {
    const maxSpellLevel = this.getMaximumSlotSpellLevelForClassLevel(className, level);
    return new Set(
      this.ruleCatalogService
        .listEntries("spell_definitions")
        .filter((entry) => {
          const spellLevel = this.getCatalogSpellLevel(entry);
          return spellLevel > 0 && spellLevel <= maxSpellLevel;
        })
        .map((entry) => entry.id),
    );
  }

  private getExecutableCantripIds(): Set<string> {
    return new Set(
      this.ruleCatalogService
        .listEntries("spell_definitions")
        .filter((entry) => this.getCatalogSpellLevel(entry) === 0)
        .map((entry) => entry.id),
    );
  }

  private getCatalogSpellLevel(
    entry: ReturnType<RuleCatalogService["listEntries"]>[number],
  ): number {
    const tag = entry.runtimeEffect.tags.find((value) =>
      value.startsWith("spell_level:"),
    );
    const level = Number(tag?.slice("spell_level:".length));
    return Number.isInteger(level) && level >= 0 ? level : -1;
  }

  private getMaximumSlotSpellLevelForClassLevel(className: string, level: number): number {
    return resolveMaximumCastableSpellLevel(className, level);
  }

  private async resolveCharacterFeatureSnapshot(params: {
    ancestry: string;
    raceKey?: string | null;
    className: string;
    subclassName?: string | null;
    level: number;
    requestedFeatures: string[];
    proficientSkills: string[];
    requireMissingFeatureChoices: boolean;
  }): Promise<string[]> {
    const raceKey = params.raceKey ?? await this.resolveRaceTraitFeatureKey(params.ancestry);
    this.assertRaceFeatureSelections(raceKey, params.requestedFeatures);
    this.assertClassFeatureSelections({
      className: params.className,
      level: params.level,
      requestedFeatures: params.requestedFeatures,
      proficientSkills: params.proficientSkills,
      requireMissingSelections: params.requireMissingFeatureChoices,
    });
    this.assertAllowedFeatSelections({
      className: params.className,
      level: params.level,
      requestedFeatures: params.requestedFeatures,
      requireMissingSelections: params.requireMissingFeatureChoices,
    });
    return this.ruleCatalogService.getCharacterFeatureSnapshot({
      raceKey,
      classKey: params.className,
      subclassKey: params.subclassName,
      classLevel: params.level,
      requestedFeatureIds: params.requestedFeatures,
    }).featureIds;
  }

  private assertAllowedFeatSelections(params: {
    className: string;
    level: number;
    requestedFeatures: string[];
    requireMissingSelections: boolean;
  }): void {
    const normalizedFeatures = params.requestedFeatures.map((feature) =>
      feature.trim().toLowerCase(),
    );
    const requestedFeatIds = normalizedFeatures.filter((feature) => feature.startsWith("feat."));
    const requestedAsiChoices = normalizedFeatures
      .filter((feature) => feature.startsWith("asi:"))
      .map((feature) => feature.slice("asi:".length));
    const duplicateFeatIds = requestedFeatIds.filter(
      (featId, index) => requestedFeatIds.indexOf(featId) !== index,
    );
    if (duplicateFeatIds.length) {
      throw new BadRequestException({
        code: "CHARACTER_DUPLICATE_FEAT",
        message: "같은 Feat는 중복 선택할 수 없습니다.",
        featIds: Array.from(new Set(duplicateFeatIds)),
      });
    }
    const duplicateAsiChoices = requestedAsiChoices.filter(
      (abilityKey, index) => requestedAsiChoices.indexOf(abilityKey) !== index,
    );
    if (duplicateAsiChoices.length) {
      throw new BadRequestException({
        code: "CHARACTER_DUPLICATE_ASI_CHOICE",
        message: "생성/수정 단계에서는 같은 능력치 ASI를 중복 선택할 수 없습니다.",
        abilityKeys: Array.from(new Set(duplicateAsiChoices)),
      });
    }
    const invalidFeatId = requestedFeatIds.find((featId) => !ALLOWED_FEAT_IDS.has(featId));
    if (invalidFeatId) {
      throw new BadRequestException({
        code: "CHARACTER_INVALID_FEAT",
        message: "현재 캐릭터 빌더에서 사용할 수 없는 Feat입니다.",
        featId: invalidFeatId,
      });
    }
    const invalidAsiChoice = requestedAsiChoices.find(
      (abilityKey) => !ALLOWED_ASI_ABILITY_KEYS.has(abilityKey),
    );
    if (invalidAsiChoice) {
      throw new BadRequestException({
        code: "CHARACTER_INVALID_ASI_CHOICE",
        message: "ASI 선택값이 유효하지 않습니다.",
        abilityKey: invalidAsiChoice,
      });
    }
    const availableFeatChoiceCount = getAsiChoiceLevelsForClass(params.className)
      .filter((level) => level <= params.level)
      .length;
    const requestedChoiceCount = requestedFeatIds.length + requestedAsiChoices.length;
    if (requestedChoiceCount > availableFeatChoiceCount) {
      throw new BadRequestException({
        code: "CHARACTER_FEAT_LEVEL_REQUIREMENT",
        message: "현재 레벨에서 선택할 수 있는 ASI/Feat 수를 초과했습니다.",
        level: params.level,
        availableFeatChoiceCount,
        requestedChoiceCount,
      });
    }
    if (params.requireMissingSelections && requestedChoiceCount !== availableFeatChoiceCount) {
      throw new BadRequestException({
        code: "CHARACTER_ASI_FEAT_CHOICE_REQUIRED",
        message: "현재 레벨까지의 모든 ASI/Feat 지점을 선택해야 합니다.",
        level: params.level,
        requiredChoiceCount: availableFeatChoiceCount,
        requestedChoiceCount,
      });
    }
  }

  private assertRaceFeatureSelections(
    raceKey: string | null,
    requestedFeatures: string[],
  ): void {
    const normalizedFeatures = requestedFeatures.map((feature) =>
      feature.trim().toLowerCase(),
    );
    if (raceKey !== "dragonborn") {
      if (
        normalizedFeatures.some((feature) =>
          feature.startsWith("draconic_ancestry:"),
        )
      ) {
        throw new BadRequestException({
          code: "CHARACTER_INVALID_RACE_FEATURE",
          message: "드래곤본이 아닌 종족은 용 혈통을 선택할 수 없습니다.",
        });
      }
      return;
    }
    const ancestry = normalizedFeatures
      .find((feature) => feature.startsWith("draconic_ancestry:"))
      ?.slice("draconic_ancestry:".length);
    const allowed = new Set([
      "black",
      "blue",
      "brass",
      "bronze",
      "copper",
      "gold",
      "green",
      "red",
      "silver",
      "white",
    ]);
    if (!ancestry || !allowed.has(ancestry)) {
      throw new BadRequestException({
        code: "CHARACTER_DRACONIC_ANCESTRY_REQUIRED",
        message: "드래곤본은 용 혈통을 선택해야 합니다.",
      });
    }
  }

  private assertClassFeatureSelections(params: {
    className: string;
    level: number;
    requestedFeatures: string[];
    proficientSkills: string[];
    requireMissingSelections: boolean;
  }): void {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const normalizedFeatures = params.requestedFeatures.map((feature) =>
      feature.trim().toLowerCase(),
    );
    const fightingStyles = this.getFeatureSelectionValues(normalizedFeatures, "fighting_style:");
    const favoredEnemies = this.getFeatureSelectionValues(normalizedFeatures, "favored_enemy:");
    const favoredHumanoids = this.getFeatureSelectionValues(
      normalizedFeatures,
      "favored_enemy_humanoid:",
    );
    const expertiseSelections = this.getFeatureSelectionValues(normalizedFeatures, "expertise:");

    const fightingStyleRequired =
      classKey === "fighter" ||
      ((classKey === "paladin" || classKey === "ranger") && params.level >= 2);
    if (!fightingStyleRequired && fightingStyles.length) {
      throw new BadRequestException({
        code: "CHARACTER_INVALID_CLASS_FEATURE",
        message: "현재 직업/레벨에서는 전투 유파를 선택할 수 없습니다.",
      });
    }
    if (fightingStyleRequired && (params.requireMissingSelections || fightingStyles.length)) {
      this.assertExactUniqueSelectionCount({
        code: "CHARACTER_FIGHTING_STYLE_REQUIRED",
        label: "전투 유파",
        values: fightingStyles,
        count: 1,
      });
      this.assertAllowedSelectionValues({
        code: "CHARACTER_INVALID_FIGHTING_STYLE",
        label: "전투 유파",
        values: fightingStyles,
        allowed: ALLOWED_FIGHTING_STYLE_IDS,
      });
    }

    if (classKey !== "ranger" && (favoredEnemies.length || favoredHumanoids.length)) {
      throw new BadRequestException({
        code: "CHARACTER_INVALID_CLASS_FEATURE",
        message: "레인저가 아닌 직업은 주적을 선택할 수 없습니다.",
      });
    }
    if (classKey === "ranger" && (params.requireMissingSelections || favoredEnemies.length || favoredHumanoids.length)) {
      this.assertExactUniqueSelectionCount({
        code: "CHARACTER_FAVORED_ENEMY_REQUIRED",
        label: "주적",
        values: favoredEnemies,
        count: 1,
      });
      this.assertAllowedSelectionValues({
        code: "CHARACTER_INVALID_FAVORED_ENEMY",
        label: "주적",
        values: favoredEnemies,
        allowed: ALLOWED_FAVORED_ENEMY_IDS,
      });
      const humanoidCount = favoredEnemies[0] === "humanoid" ? 2 : 0;
      this.assertExactUniqueSelectionCount({
        code: "CHARACTER_FAVORED_HUMANOID_REQUIRED",
        label: "인간형 주적",
        values: favoredHumanoids,
        count: humanoidCount,
      });
      this.assertAllowedSelectionValues({
        code: "CHARACTER_INVALID_FAVORED_HUMANOID",
        label: "인간형 주적",
        values: favoredHumanoids,
        allowed: ALLOWED_FAVORED_HUMANOID_IDS,
      });
    }

    if (classKey !== "rogue" && expertiseSelections.length) {
      throw new BadRequestException({
        code: "CHARACTER_INVALID_CLASS_FEATURE",
        message: "로그가 아닌 직업은 현재 캐릭터 빌더에서 전문화를 선택할 수 없습니다.",
      });
    }
    if (classKey === "rogue" && (params.requireMissingSelections || expertiseSelections.length)) {
      this.assertExactUniqueSelectionCount({
        code: "CHARACTER_EXPERTISE_REQUIRED",
        label: "전문화",
        values: expertiseSelections,
        count: 2,
      });
      const normalizedSkillSet = new Set(
        params.proficientSkills.map((skill) => skill.trim().toLowerCase()),
      );
      const invalidExpertise = expertiseSelections.find(
        (selection) =>
          selection !== "thieves_tools" &&
          !normalizedSkillSet.has(selection.trim().toLowerCase()),
      );
      if (invalidExpertise) {
        throw new BadRequestException({
          code: "CHARACTER_INVALID_EXPERTISE",
          message: "전문화는 숙련된 기술 또는 Thieves' tools 중에서 선택해야 합니다.",
          selection: invalidExpertise,
        });
      }
    }
  }

  private getFeatureSelectionValues(features: string[], prefix: string): string[] {
    return features
      .filter((feature) => feature.startsWith(prefix))
      .map((feature) => feature.slice(prefix.length).trim())
      .filter((value) => value.length > 0);
  }

  private assertExactUniqueSelectionCount(params: {
    code: string;
    label: string;
    values: string[];
    count: number;
  }): void {
    if (
      params.values.length !== params.count ||
      new Set(params.values).size !== params.values.length
    ) {
      throw new BadRequestException({
        code: params.code,
        message: `${params.label} 선택은 ${params.count}개여야 합니다.`,
        requiredCount: params.count,
        receivedCount: params.values.length,
      });
    }
  }

  private assertAllowedSelectionValues(params: {
    code: string;
    label: string;
    values: string[];
    allowed: ReadonlySet<string>;
  }): void {
    const invalidValue = params.values.find((value) => !params.allowed.has(value));
    if (invalidValue) {
      throw new BadRequestException({
        code: params.code,
        message: `${params.label} 선택값이 유효하지 않습니다.`,
        value: invalidValue,
      });
    }
  }

  private assertValidSubclassSelection(params: {
    className: string;
    subclassName?: string | null;
    level: number;
    requiredCode: string;
    invalidCode: string;
  }): string | null {
    const subclassName = params.subclassName?.trim() || null;
    const choiceLevel = resolveSubclassChoiceLevel(params.className);
    if (choiceLevel !== null && params.level >= choiceLevel && !subclassName) {
      throw new BadRequestException({
        code: params.requiredCode,
        message: `${params.className} ${params.level}레벨에는 서브클래스 선택이 필요합니다.`,
        levels: [choiceLevel],
      });
    }
    if (!subclassName) {
      return null;
    }

    const subclassFeatures = this.ruleCatalogService.listSubclassFeatures(
      params.className,
      subclassName,
      params.level,
    );
    if (!subclassFeatures.length) {
      throw new BadRequestException({
        code: params.invalidCode,
        message: `${params.className} ${params.level}레벨에서 사용할 수 없는 서브클래스입니다.`,
        subclassName,
      });
    }
    return subclassName;
  }

  private async resolveRaceTraitFeatureKey(ancestry: string): Promise<string | null> {
    const race = await this.findRaceForAncestry(ancestry);
    const raceKey = race?.key ?? ancestry.trim();
    return raceKey || null;
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

  private mapCharacterAvatarAsset(asset: {
    id: string;
    fileName: string;
    contentType: string;
    storageKey: string;
    publicUrl: string;
    width: number | null;
    height: number | null;
    fileSizeBytes: number;
    uploadedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }): CharacterAvatarAssetResponseDto {
    return {
      id: asset.id,
      fileName: asset.fileName,
      contentType: asset.contentType,
      storageKey: asset.storageKey,
      publicUrl: asset.publicUrl,
      width: asset.width,
      height: asset.height,
      fileSizeBytes: asset.fileSizeBytes,
      uploadedByUserId: asset.uploadedByUserId,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private rethrowCharacterAvatarAssetStorageError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw new ServiceUnavailableException(
        "Character avatar asset storage schema is missing. Run `npm run prisma:push -w @trpg/be` and restart the backend.",
      );
    }

    throw error;
  }

  private async putR2Object({
    body,
    contentType,
    fileName,
    keyPrefix,
  }: {
    body: Buffer;
    contentType: string;
    fileName: string;
    keyPrefix: string;
  }): Promise<{ storageKey: string; publicUrl: string }> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new BadRequestException("R2 업로드 환경변수가 설정되지 않았습니다.");
    }

    const extension = this.getSafeAvatarFileExtension(fileName, contentType);
    const key = `${keyPrefix}/${randomUUID()}${extension}`;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const encodedPath = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      encodedPath,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, "auto", "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": contentType,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
        },
        body,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown network error";
      throw new BadGatewayException(
        `R2 avatar upload request failed before a response was received. ${detail}`,
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(`R2 업로드에 실패했습니다. (${response.status}) ${message}`);
    }

    return {
      storageKey: key,
      publicUrl: `${publicBaseUrl}/${key}`,
    };
  }

  private async deleteR2Object(storageKey: string): Promise<void> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      throw new BadRequestException("R2 삭제 환경변수가 설정되지 않았습니다.");
    }

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${storageKey}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update("").digest("hex");
    const encodedPath = `/${bucket}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "DELETE",
      encodedPath,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, "auto", "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: authorization,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown network error";
      throw new BadGatewayException(
        `R2 avatar delete request failed before a response was received. ${detail}`,
      );
    }

    if (response.ok || response.status === 404) {
      return;
    }

    const message = await response.text();
    throw new BadRequestException(`R2 삭제에 실패했습니다. (${response.status}) ${message}`);
  }

  private formatAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private getSignatureKey(
    secret: string,
    dateStamp: string,
    region: string,
    service: string,
  ): Buffer {
    const kDate = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  }

  private getSafeAvatarFileExtension(fileName: string, contentType: string): string {
    const lowered = fileName.toLowerCase();
    const match = lowered.match(/\.(png|jpe?g|webp)$/);
    if (match) {
      return match[0] === ".jpeg" ? ".jpg" : match[0];
    }

    switch (contentType) {
      case "image/png":
        return ".png";
      case "image/jpeg":
        return ".jpg";
      case "image/webp":
        return ".webp";
      default:
        return ".img";
    }
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
