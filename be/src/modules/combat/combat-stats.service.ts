import { Injectable } from "@nestjs/common";
import { isRecord, type VttMapStateDto } from "@trpg/shared-types";
import { parseJsonOrThrow } from "../../common/utils/json-runtime";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";

const DEFAULT_MONSTER_AC = 10;
const DEFAULT_MONSTER_HP = 1;

type VttMapToken = VttMapStateDto["tokens"][number];

@Injectable()
export class CombatStatsService {
  constructor(private readonly srdEngine: SrdEngineLoaderService) {}

  resolveMonsterTokenCombatStats(token: VttMapToken): {
    currentHp: number;
    maxHp: number;
    armorClass: number;
  } {
    const engineStats = this.srdEngine.getMonsterCombatStats(token.monster?.id);
    if (engineStats) {
      return {
        currentHp: engineStats.currentHp,
        maxHp: engineStats.maxHp,
        armorClass: engineStats.armorClass,
      };
    }

    const maxHp =
      this.parseFirstInteger(token.monster?.hitPointsRaw) ??
      this.parseFirstInteger(token.monster?.basicRaw) ??
      DEFAULT_MONSTER_HP;
    const armorClass =
      this.parseFirstInteger(token.monster?.armorClassRaw) ??
      DEFAULT_MONSTER_AC;

    return { currentHp: maxHp, maxHp, armorClass };
  }

  scaleMonsterTokensForParty(
    monsterTokens: VttMapToken[],
    playerCount: number,
    map: VttMapStateDto,
  ): { monsterTokens: VttMapToken[]; excludedTokenIds: string[]; applied: boolean } {
    const scaling = map.encounterScaling;
    if (!scaling?.enabled || scaling.mode !== "by_party_ratio" || !monsterTokens.length) {
      return { monsterTokens, excludedTokenIds: [], applied: false };
    }

    const basePartySize = this.readIntegerInRange(scaling.basePartySize, 1, 12, 4);
    const minMonsterCount = this.readIntegerInRange(scaling.minMonsterCount, 0, monsterTokens.length, 1);
    const fixedTokens = monsterTokens.filter((token) => token.encounterRole === "fixed");
    const scalableEntries = monsterTokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.encounterRole !== "fixed");

    if (!scalableEntries.length || playerCount >= basePartySize) {
      return { monsterTokens, excludedTokenIds: [], applied: true };
    }

    const groups = new Map<string, Array<{ token: VttMapToken; index: number }>>();
    for (const entry of scalableEntries) {
      const groupId =
        entry.token.encounterGroupId?.trim() ||
        entry.token.monster?.id ||
        entry.token.name?.trim() ||
        "default";
      groups.set(groupId, [...(groups.get(groupId) ?? []), entry]);
    }

    const includedIds = new Set(fixedTokens.map((token) => token.id));
    for (const entries of groups.values()) {
      const targetCount = this.clampNumber(
        Math.ceil((entries.length * Math.max(playerCount, 1)) / basePartySize),
        0,
        entries.length,
      );
      entries
        .slice()
        .sort((left, right) => {
          const leftPriority = left.token.encounterPriority ?? 0;
          const rightPriority = right.token.encounterPriority ?? 0;
          return rightPriority - leftPriority || left.index - right.index;
        })
        .slice(0, targetCount)
        .forEach(({ token }) => includedIds.add(token.id));
    }

    if (includedIds.size < minMonsterCount) {
      scalableEntries
        .filter(({ token }) => !includedIds.has(token.id))
        .sort((left, right) => {
          const leftPriority = left.token.encounterPriority ?? 0;
          const rightPriority = right.token.encounterPriority ?? 0;
          return rightPriority - leftPriority || left.index - right.index;
        })
        .slice(0, minMonsterCount - includedIds.size)
        .forEach(({ token }) => includedIds.add(token.id));
    }

    const scaledMonsterTokens = monsterTokens.filter((token) => includedIds.has(token.id));
    const excludedTokenIds = monsterTokens
      .filter((token) => !includedIds.has(token.id))
      .map((token) => token.id);

    return { monsterTokens: scaledMonsterTokens, excludedTokenIds, applied: true };
  }

  resolveCharacterDexterityModifier(abilitiesJson: string | null | undefined): number {
    return this.getAbilityModifier(this.resolveDexterityScoreFromUnknown(this.parseJsonObject(abilitiesJson)));
  }

  resolveMonsterDexterityModifier(token: VttMapToken): number {
    const monster = isRecord(token.monster) ? token.monster : null;
    const score =
      this.resolveDexterityScoreFromUnknown(monster) ??
      this.parseAbilityScoreFromText("dex", token.monster?.basicRaw) ??
      this.parseAbilityScoreFromText("dex", token.monster?.playReference) ??
      10;

    return this.getAbilityModifier(score);
  }

  resolveMonsterSpeedFt(token: VttMapToken): number {
    const engineStats = this.srdEngine.getMonsterCombatStats(token.monster?.id);
    if (engineStats) {
      return engineStats.speedFt;
    }

    return (
      this.parseFirstInteger(token.monster?.speedRaw) ??
      this.parseSpeedFromText(token.monster?.basicRaw) ??
      this.parseSpeedFromText(token.monster?.playReference) ??
      30
    );
  }

  resolveTokenName(token: VttMapToken): string {
    return token.name?.trim() || token.monster?.nameKo?.trim() || token.monster?.nameEn?.trim() || "Monster";
  }

  private resolveDexterityScoreFromUnknown(source: unknown): number | null {
    if (!isRecord(source)) {
      return null;
    }

    const record = source;
    const directScore =
      this.parseNumericValue(record.dex) ??
      this.parseNumericValue(record.dexterity) ??
      this.parseNumericValue(record.dexterityScore);
    if (directScore !== null) {
      return directScore;
    }

    return (
      this.resolveDexterityScoreFromUnknown(record.abilities) ??
      this.resolveDexterityScoreFromUnknown(record.abilityScores) ??
      this.resolveDexterityScoreFromUnknown(record.stats)
    );
  }

  private parseAbilityScoreFromText(ability: string, value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const pattern = new RegExp(`\\b${ability}\\b\\s*[:=]?\\s*(\\d{1,2})`, "i");
    const match = value.match(pattern);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseSpeedFromText(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const match = value.match(/\bspeed\b[^0-9]*(\d{1,3})\s*ft\b/i);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
    return parseJsonOrThrow(value, null, this.decodeJsonObject, "character.abilitiesJson");
  }

  private decodeJsonObject(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
      throw new Error("value must be an object.");
    }
    return value;
  }

  private parseNumericValue(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string") {
      return null;
    }

    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getAbilityModifier(score: number | null | undefined): number {
    return Math.floor(((score ?? 10) - 10) / 2);
  }

  private parseFirstInteger(value: string | null | undefined): number | null {
    const match = value?.match(/\d+/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private readIntegerInRange(value: unknown, min: number, max: number, fallback: number): number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  }
}
