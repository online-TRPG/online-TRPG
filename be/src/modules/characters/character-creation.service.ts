import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Race } from "@prisma/client";
import {
  AbilityScoresDto,
  normalizeSkillToKo,
  POINT_BUY_COST,
  POINT_BUY_TOTAL,
  RaceAbilityIncreaseDto,
  isRecord,
} from "@trpg/shared-types";
import { normalizeSrdCharacterClassKey } from "@trpg/srd-data/rules";
import {
  decodeStringArray,
  parseJsonOrThrow,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { RacesService } from "../races/races.service";
import { LevelUpService } from "../rules/level-up.service";
import { isProvidedScenarioId } from "../scenarios/provided-scenario.constants";

const ABILITY_SCORE_MIN = 1;
const ABILITY_SCORE_MAX = 30;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

@Injectable()
export class CharacterCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly racesService: RacesService,
    private readonly catalogService: CatalogService,
    private readonly levelUpService: LevelUpService,
  ) {}

  async findRaceForAncestry(ancestry: string): Promise<Race | null> {
    const trimmed = ancestry.trim();
    if (!trimmed) return null;

    const byKey = await this.racesService.findByKey(trimmed.toLowerCase());
    if (byKey) return byKey;

    return this.prisma.race.findFirst({ where: { koName: trimmed } });
  }

  async resolveScenarioForLevel(params: {
    userId: string;
    scenarioId: string | null;
    level: number;
  }): Promise<string | null> {
    if (!params.scenarioId) {
      return null;
    }

    const scenario = await this.prisma.scenario.findUnique({
      where: { id: params.scenarioId },
      select: { id: true, createdByUserId: true, sourceType: true, startLevel: true },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${params.scenarioId} was not found.`);
    }

    const isProvidedScenario = isProvidedScenarioId(scenario.id);
    const isOwnScenario = scenario.createdByUserId === params.userId;
    if (!isProvidedScenario && !isOwnScenario) {
      throw new NotFoundException(`Scenario ${params.scenarioId} was not found.`);
    }

    if (params.level !== scenario.startLevel) {
      throw new BadRequestException(
        `캐릭터 레벨(${params.level})이 시나리오 시작 레벨(${scenario.startLevel})과 일치하지 않습니다.`,
      );
    }

    return scenario.id;
  }

  assertAbilitiesInRange(abilities: AbilityScoresDto): void {
    for (const key of ABILITY_KEYS) {
      const score = abilities[key];
      if (!Number.isInteger(score) || score < ABILITY_SCORE_MIN || score > ABILITY_SCORE_MAX) {
        throw new BadRequestException(
          `능력치 범위: ${key.toUpperCase()}(${score})가 허용 범위(${ABILITY_SCORE_MIN}~${ABILITY_SCORE_MAX})를 벗어났습니다.`,
        );
      }
    }
  }

  assertPointBuyForRace(abilities: AbilityScoresDto, race: Race | null | undefined): void {
    if (!race) {
      return;
    }

    const increases = parseJsonOrThrow(
      race.abilityIncreasesJson,
      emptyRaceAbilityIncrease(),
      decodeRaceAbilityIncrease,
      "race.abilityIncreasesJson",
    );
    const finalScores: Record<keyof AbilityScoresDto, number> = {
      str: abilities.str,
      dex: abilities.dex,
      con: abilities.con,
      int: abilities.int,
      wis: abilities.wis,
      cha: abilities.cha,
    };

    const totalCost = ABILITY_KEYS.reduce(
      (sum, key) => sum + (POINT_BUY_COST[finalScores[key] - (increases[key] ?? 0)] ?? 0),
      0,
    );
    if (totalCost !== POINT_BUY_TOTAL) {
      throw new BadRequestException(
        `Point Buy: 총 비용 ${totalCost}점이 ${POINT_BUY_TOTAL}점과 일치하지 않습니다.`,
      );
    }
  }

  async resolveProficientSkills(className: string, skills: string[]): Promise<string[]> {
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass || klass.skillChoiceCount === 0) {
      return skills;
    }

    const choices: string[] = parseJsonOrThrow(
      klass.skillChoicesJson,
      [],
      decodeStringArray,
      "characterClass.skillChoicesJson",
    );

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

  async resolveLevelStats(params: {
    className: string;
    level: number;
    abilities: AbilityScoresDto;
    requestedProficiencyBonus: number | undefined;
    requestedMaxHp: number | undefined;
    maxHpBonus?: number;
  }): Promise<{ proficiencyBonus: number; maxHp: number }> {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const klass = await this.catalogService.findClassByKey(classKey);
    const maxHpBonus = params.maxHpBonus ?? 0;
    if (!klass) {
      return {
        proficiencyBonus: params.requestedProficiencyBonus ?? 2,
        maxHp: params.requestedMaxHp ?? 10 + maxHpBonus,
      };
    }

    let stats: { proficiencyBonus: number; maxHp: number; constitutionModifier: number };
    try {
      stats = this.levelUpService.resolveCharacterLevelStats({
        level: params.level,
        hitDie: klass.hitDie,
        constitutionScore: params.abilities.con,
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

    if (
      params.requestedProficiencyBonus !== undefined &&
      params.requestedProficiencyBonus !== expectedProf
    ) {
      throw new BadRequestException(
        `숙련 보너스: 레벨 ${params.level} 의 정답은 ${expectedProf} 인데 ${params.requestedProficiencyBonus} 가 들어왔습니다.`,
      );
    }
    if (params.requestedMaxHp !== undefined && params.requestedMaxHp !== expectedMaxHp) {
      throw new BadRequestException(
        `maxHp: ${klass.koName}/레벨 ${params.level}/Con ${params.abilities.con}(mod ${stats.constitutionModifier}) 의 공식값은 ${expectedMaxHp} 인데 ${params.requestedMaxHp} 가 들어왔습니다.`,
      );
    }

    return { proficiencyBonus: expectedProf, maxHp: expectedMaxHp };
  }
}

function emptyRaceAbilityIncrease(): RaceAbilityIncreaseDto {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
}

function decodeRaceAbilityIncrease(value: unknown): RaceAbilityIncreaseDto {
  if (!isRecord(value)) {
    throw new Error("race ability increases must be an object.");
  }
  const record = value;
  return {
    str: readFiniteNumber(record.str),
    dex: readFiniteNumber(record.dex),
    con: readFiniteNumber(record.con),
    int: readFiniteNumber(record.int),
    wis: readFiniteNumber(record.wis),
    cha: readFiniteNumber(record.cha),
  };
}

function readFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
