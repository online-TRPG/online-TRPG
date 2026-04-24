import { Injectable, NotFoundException } from "@nestjs/common";
import { ScenarioNode } from "@prisma/client";
import {
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import {
  mapScenario,
  mapScenarioSummary,
} from "../../common/mappers/domain.mapper";
import { DEFAULT_SCENARIO_ID } from "../../database/seed/default-scenario";

@Injectable()
export class ScenariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listScenarios(query?: ScenarioQueryDto): Promise<ScenarioSummaryResponseDto[]> {
    const scenarios = await this.prisma.scenario.findMany({
      where: query?.search
        ? {
            title: {
              contains: query.search,
            },
          }
        : undefined,
      orderBy: { createdAt: "asc" },
    });

    return scenarios.map(mapScenarioSummary);
  }

  async getScenario(id: string): Promise<ScenarioResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    return mapScenario(scenario);
  }

  async getDefaultScenarioEntity() {
    return this.getScenarioEntityById(DEFAULT_SCENARIO_ID);
  }

  async getScenarioEntityById(id: string) {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id },
      include: {
        nodes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} was not found.`);
    }

    return scenario;
  }

  async getScenarioNodeEntityById(scenarioId: string, nodeId: string): Promise<ScenarioNode> {
    const node = await this.prisma.scenarioNode.findFirst({
      where: {
        scenarioId,
        id: nodeId,
      },
    });

    if (!node) {
      throw new NotFoundException(`Scenario node ${nodeId} was not found in scenario ${scenarioId}.`);
    }

    return node;
  }
}
