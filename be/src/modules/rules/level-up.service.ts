import { Injectable } from "@nestjs/common";
import { resolveCrossedAbilityScoreImprovementLevels } from "@trpg/srd-data/rules";
import { RuleCatalogEntry } from "./rule-catalog.types";

export type HitDie = "d6" | "d8" | "d10" | "d12";

export type LevelUpHpMode = "average" | "rolled";

export type LevelUpInput = {
  classKey: string;
  currentLevel: number;
  targetLevel: number;
  hitDie: HitDie;
  constitutionScore: number;
  currentMaxHp?: number | null;
  hpMode?: LevelUpHpMode;
  rolledHpByLevel?: Record<number, number>;
  subclassChoiceLevel?: number | null;
  classFeatures?: RuleCatalogEntry[];
  subclassFeatures?: RuleCatalogEntry[];
};

export type LevelUpFeatureGrant = {
  level: number;
  featureId: string;
  kind: RuleCatalogEntry["kind"];
  tags: string[];
};

export type LevelUpResolution = {
  classKey: string;
  fromLevel: number;
  toLevel: number;
  proficiencyBonusBefore: number;
  proficiencyBonusAfter: number;
  hitDie: HitDie;
  constitutionModifier: number;
  hpMode: LevelUpHpMode;
  maxHpBefore: number;
  maxHpAfter: number;
  hpGains: Array<{
    level: number;
    baseGain: number;
    constitutionModifier: number;
    totalGain: number;
  }>;
  grantedFeatures: LevelUpFeatureGrant[];
  subclassChoiceRequiredAtLevels: number[];
  asiOrFeatChoiceRequiredAtLevels: number[];
};

export type CharacterLevelStatsResolution = {
  level: number;
  proficiencyBonus: number;
  maxHp: number;
  hitDie: HitDie;
  constitutionModifier: number;
};

const HIT_DIE_STATS: Record<HitDie, { max: number; average: number }> = {
  d6: { max: 6, average: 4 },
  d8: { max: 8, average: 5 },
  d10: { max: 10, average: 6 },
  d12: { max: 12, average: 7 },
};

@Injectable()
export class LevelUpService {
  resolveCharacterLevelStats(input: {
    level: number;
    hitDie: string;
    constitutionScore: number;
  }): CharacterLevelStatsResolution {
    const level = this.assertLevel(input.level, "level");
    const hitDie = this.assertHitDie(input.hitDie);
    const constitutionModifier = this.resolveAbilityModifier(input.constitutionScore);
    const stats = HIT_DIE_STATS[hitDie];

    return {
      level,
      proficiencyBonus: this.resolveProficiencyBonus(level),
      maxHp: this.calculateMaxHpAtLevel({
        level,
        stats,
        constitutionModifier,
      }),
      hitDie,
      constitutionModifier,
    };
  }

  resolveLevelUp(input: LevelUpInput): LevelUpResolution {
    const classKey = this.normalizeClassKey(input.classKey);
    const currentLevel = this.assertLevel(input.currentLevel, "currentLevel");
    const targetLevel = this.assertLevel(input.targetLevel, "targetLevel");
    if (targetLevel <= currentLevel) {
      throw new Error("targetLevel must be greater than currentLevel.");
    }

    const hitDie = this.assertHitDie(input.hitDie);
    const constitutionModifier = this.resolveAbilityModifier(input.constitutionScore);
    const hpMode = input.hpMode ?? "average";
    const stats = HIT_DIE_STATS[hitDie];
    const maxHpBefore = input.currentMaxHp ?? this.calculateMaxHpAtLevel({
      level: currentLevel,
      stats,
      constitutionModifier,
    });

    const hpGains = this.resolveHpGains({
      currentLevel,
      targetLevel,
      stats,
      constitutionModifier,
      hpMode,
      rolledHpByLevel: input.rolledHpByLevel ?? {},
    });
    const maxHpAfter = maxHpBefore + hpGains.reduce((sum, gain) => sum + gain.totalGain, 0);

    return {
      classKey,
      fromLevel: currentLevel,
      toLevel: targetLevel,
      proficiencyBonusBefore: this.resolveProficiencyBonus(currentLevel),
      proficiencyBonusAfter: this.resolveProficiencyBonus(targetLevel),
      hitDie,
      constitutionModifier,
      hpMode,
      maxHpBefore,
      maxHpAfter,
      hpGains,
      grantedFeatures: this.resolveGrantedFeatures(input, currentLevel, targetLevel),
      subclassChoiceRequiredAtLevels: this.resolveSubclassChoiceLevels(
        currentLevel,
        targetLevel,
        input.subclassChoiceLevel,
      ),
      asiOrFeatChoiceRequiredAtLevels: this.resolveAsiLevels(
        classKey,
        currentLevel,
        targetLevel,
      ),
    };
  }

  resolveProficiencyBonus(level: number): number {
    const normalizedLevel = this.assertLevel(level, "level");
    return Math.floor((normalizedLevel - 1) / 4) + 2;
  }

  private resolveHpGains(params: {
    currentLevel: number;
    targetLevel: number;
    stats: { average: number };
    constitutionModifier: number;
    hpMode: LevelUpHpMode;
    rolledHpByLevel: Record<number, number>;
  }): LevelUpResolution["hpGains"] {
    const gains: LevelUpResolution["hpGains"] = [];
    for (let level = params.currentLevel + 1; level <= params.targetLevel; level += 1) {
      const baseGain = params.hpMode === "rolled"
        ? this.assertRolledHp(params.rolledHpByLevel[level], level)
        : params.stats.average;
      gains.push({
        level,
        baseGain,
        constitutionModifier: params.constitutionModifier,
        totalGain: Math.max(baseGain + params.constitutionModifier, 1),
      });
    }
    return gains;
  }

  private calculateMaxHpAtLevel(params: {
    level: number;
    stats: { max: number; average: number };
    constitutionModifier: number;
  }): number {
    return params.stats.max + params.constitutionModifier +
      (params.level - 1) * Math.max(params.stats.average + params.constitutionModifier, 1);
  }

  private resolveGrantedFeatures(
    input: LevelUpInput,
    currentLevel: number,
    targetLevel: number,
  ): LevelUpFeatureGrant[] {
    return [...(input.classFeatures ?? []), ...(input.subclassFeatures ?? [])]
      .filter((entry) => {
        const minLevel = entry.levelRequirement.minClassLevel ?? entry.levelRequirement.minCharacterLevel ?? 1;
        return minLevel > currentLevel && minLevel <= targetLevel;
      })
      .sort((left, right) => {
        const leftLevel = left.levelRequirement.minClassLevel ?? left.levelRequirement.minCharacterLevel ?? 1;
        const rightLevel = right.levelRequirement.minClassLevel ?? right.levelRequirement.minCharacterLevel ?? 1;
        return leftLevel - rightLevel || left.id.localeCompare(right.id);
      })
      .map((entry) => ({
        level: entry.levelRequirement.minClassLevel ?? entry.levelRequirement.minCharacterLevel ?? 1,
        featureId: entry.id,
        kind: entry.kind,
        tags: entry.runtimeEffect.tags,
      }));
  }

  private resolveSubclassChoiceLevels(
    currentLevel: number,
    targetLevel: number,
    subclassChoiceLevel: number | null | undefined,
  ): number[] {
    if (subclassChoiceLevel === null || subclassChoiceLevel === undefined) {
      return [];
    }
    const level = this.assertLevel(subclassChoiceLevel, "subclassChoiceLevel");
    return level > currentLevel && level <= targetLevel ? [level] : [];
  }

  private resolveAsiLevels(
    classKey: string,
    currentLevel: number,
    targetLevel: number,
  ): number[] {
    return resolveCrossedAbilityScoreImprovementLevels(classKey, currentLevel, targetLevel);
  }

  private normalizeClassKey(classKey: string): string {
    const normalized = classKey.trim().toLowerCase().replace(/_/g, "-");
    if (!normalized) {
      throw new Error("classKey must not be empty.");
    }
    return normalized;
  }

  private assertLevel(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      throw new Error(`${field} must be an integer from 1 to 20.`);
    }
    return value;
  }

  private assertHitDie(value: string): HitDie {
    if (!(value in HIT_DIE_STATS)) {
      throw new Error("hitDie must be one of d6, d8, d10, or d12.");
    }
    return value as HitDie;
  }

  private assertRolledHp(value: number | undefined, level: number): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(`rolledHpByLevel.${level} must be a positive integer.`);
    }
    return value;
  }

  private resolveAbilityModifier(score: number): number {
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      throw new Error("constitutionScore must be an integer from 1 to 30.");
    }
    return Math.floor((score - 10) / 2);
  }
}
