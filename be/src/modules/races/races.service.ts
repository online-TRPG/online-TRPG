import { Injectable, NotFoundException } from "@nestjs/common";
import {
  RaceAbilityIncreaseDto,
  RaceResponseDto,
  isRecord,
} from "@trpg/shared-types";
import {
  parseJsonOrFallback,
  parseJsonStringArrayOrFallback,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class RacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRaces(): Promise<RaceResponseDto[]> {
    const races = await this.prisma.race.findMany({
      orderBy: [{ parentRaceId: "asc" }, { key: "asc" }],
    });
    return races.map((race) => this.toDto(race));
  }

  async findByKey(key: string) {
    return this.prisma.race.findUnique({ where: { key } });
  }

  async findByKeyOrThrow(key: string) {
    const race = await this.findByKey(key);
    if (!race) {
      throw new NotFoundException(`Race ${key} was not found.`);
    }
    return race;
  }

  toDto(race: {
    id: string;
    key: string;
    koName: string;
    size: string;
    baseSpeed: number;
    abilityIncreasesJson: string;
    languagesJson: string;
    parentRaceId: string | null;
  }): RaceResponseDto {
    return {
      id: race.id,
      key: race.key,
      koName: race.koName,
      size: race.size,
      baseSpeed: race.baseSpeed,
      abilityIncreases: parseJsonOrFallback(
        race.abilityIncreasesJson,
        emptyRaceAbilityIncrease(),
        decodeRaceAbilityIncrease,
      ),
      languages: parseJsonStringArrayOrFallback(race.languagesJson, []),
      parentRaceId: race.parentRaceId,
    };
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
