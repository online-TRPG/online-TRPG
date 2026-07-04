import { BadRequestException, Injectable } from "@nestjs/common";
import type { AbilityScoresDto } from "@trpg/shared-types";
import {
  normalizeSrdCharacterClassKey,
  resolveAvailableAbilityScoreImprovementLevels,
  resolveSubclassChoiceLevel,
} from "@trpg/srd-data/rules";
import { PrismaService } from "../../database/prisma.service";
import { RacesService } from "../races/races.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";

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
const ALLOWED_ASI_ABILITY_KEYS: ReadonlySet<string> = new Set([
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
]);
const ASI_ABILITY_SCORE_MAX = 20;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

function getAsiChoiceLevelsForClass(className: string): number[] {
  return resolveAvailableAbilityScoreImprovementLevels(className, 20);
}

@Injectable()
export class CharacterFeatureSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly racesService: RacesService,
    private readonly ruleCatalogService: RuleCatalogService,
  ) {}

  async resolveCharacterFeatureSnapshot(params: {
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

  assertValidSubclassSelection(params: {
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

  resolveLevelUpFeatSelections(params: {
    requested: string[] | undefined;
    asiLevels: number[];
    existingFeatureIds: string[];
  }): string[] {
    const featSelections = (params.requested ?? [])
      .map((featId) => featId.trim().toLowerCase())
      .filter(Boolean);
    if (featSelections.length > params.asiLevels.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_TOO_MANY_FEATS",
        message: "Feat 선택 수는 이번 레벨업에서 지나간 ASI 지점 수를 넘을 수 없습니다.",
        levels: params.asiLevels,
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
      params.existingFeatureIds
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

  resolveLevelUpAbilityScores(params: {
    current: AbilityScoresDto;
    requested: Partial<Record<keyof AbilityScoresDto, number>> | undefined;
    asiLevels: number[];
    featSelectionCount?: number;
  }): AbilityScoresDto {
    const requiredPoints =
      Math.max(0, params.asiLevels.length - (params.featSelectionCount ?? 0)) * 2;
    const increases = params.requested ?? {};
    let allocatedPoints = 0;
    const next = { ...params.current };

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
      const nextScore = params.current[ability] + increase;
      if (nextScore > ASI_ABILITY_SCORE_MAX) {
        throw new BadRequestException({
          code: "LEVEL_UP_INVALID_ASI",
          message: `ASI로 올린 능력치는 ${ASI_ABILITY_SCORE_MAX}을 넘을 수 없습니다.`,
          ability,
          currentScore: params.current[ability],
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
        levels: params.asiLevels,
        requiredPoints,
        allocatedPoints,
      });
    }

    return next;
  }

  applyP6CapstoneAbilityAdjustments(params: {
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

  resolveMaxHpBonusFromFeatures(params: {
    featureIds: string[];
    className: string;
    level: number;
  }): number {
    const normalizedClassName = normalizeSrdCharacterClassKey(params.className);
    const normalizedLevel = Math.max(Math.floor(params.level), 0);
    let bonus = 0;

    for (const tag of this.ruleCatalogService.resolveRuntimeTags(params.featureIds)) {
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

  private async resolveRaceTraitFeatureKey(ancestry: string): Promise<string | null> {
    const race = await this.findRaceForAncestry(ancestry);
    const raceKey = race?.key ?? ancestry.trim();
    return raceKey || null;
  }

  private async findRaceForAncestry(ancestry: string) {
    const trimmed = ancestry.trim();
    if (!trimmed) return null;

    const byKey = await this.racesService.findByKey(trimmed.toLowerCase());
    if (byKey) return byKey;

    return this.prisma.race.findFirst({ where: { koName: trimmed } });
  }
}
