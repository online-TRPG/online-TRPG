import { Injectable, NotFoundException } from "@nestjs/common";
import {
  RaceAbilityIncreaseDto,
  RaceResponseDto,
} from "@trpg/shared-types";
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
      abilityIncreases: JSON.parse(race.abilityIncreasesJson) as RaceAbilityIncreaseDto,
      languages: JSON.parse(race.languagesJson) as string[],
      parentRaceId: race.parentRaceId,
    };
  }
}
