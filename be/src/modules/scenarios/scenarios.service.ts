import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioNode,
  ScenarioSourceType as PrismaScenarioSourceType,
} from "@prisma/client";
import { randomUUID } from "crypto";
import {
  CreateScenarioDto,
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  ScenarioLicense,
  UpdateScenarioDto,
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

  async listMyScenarios(userId: string, query?: ScenarioQueryDto): Promise<ScenarioSummaryResponseDto[]> {
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        createdByUserId: userId,
        title: query?.search
          ? {
              contains: query.search,
            }
          : undefined,
      },
      orderBy: { updatedAt: "desc" },
    });

    return scenarios.map(mapScenarioSummary);
  }

  async getScenario(id: string): Promise<ScenarioResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    return mapScenario(scenario);
  }

  async createScenario(userId: string, dto: CreateScenarioDto): Promise<ScenarioResponseDto> {
    const scenarioId = `scenario_${randomUUID()}`;
    const startNodeId = `${scenarioId}_start`;
    const title = dto.title.trim();
    const startNodeTitle = dto.startNodeTitle?.trim() || "시작 장면";
    const startSceneText =
      dto.startSceneText?.trim() || "아직 시작 장면 내용이 작성되지 않았습니다.";

    const scenario = await this.prisma.scenario.create({
      data: {
        id: scenarioId,
        title,
        description: this.nullableTrim(dto.description),
        createdByUserId: userId,
        sourceType: PrismaScenarioSourceType.USER,
        thumbnailUrl: this.nullableTrim(dto.thumbnailUrl),
        ruleSetId: this.nullableTrim(dto.ruleSetId) ?? "dnd5e",
        difficulty: this.nullableTrim(dto.difficulty),
        license: this.toPrismaScenarioLicense(dto.license ?? ScenarioLicense.ORIGINAL),
        attribution: this.nullableTrim(dto.attribution),
        startNodeId,
        nodes: {
          create: {
            id: startNodeId,
            title: startNodeTitle,
            sceneText: startSceneText,
            visibleToPlayers: true,
            checkOptionsJson: JSON.stringify([]),
            transitionsJson: JSON.stringify([]),
            cluesJson: JSON.stringify([]),
            fallbackNodeId: null,
          },
        },
      },
      include: {
        nodes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return mapScenario(scenario);
  }

  async updateScenario(userId: string, id: string, dto: UpdateScenarioDto): Promise<ScenarioResponseDto> {
    const existing = await this.getEditableScenarioEntity(userId, id);
    const shouldUpdateStartNode = dto.startNodeTitle !== undefined || dto.startSceneText !== undefined;
    const startNode = existing.nodes.find((node) => node.id === existing.startNodeId) ?? existing.nodes[0] ?? null;

    await this.prisma.scenario.update({
      where: { id },
      data: {
        title: dto.title?.trim() || existing.title,
        description: dto.description === undefined ? existing.description : this.nullableTrim(dto.description),
        thumbnailUrl: dto.thumbnailUrl === undefined ? existing.thumbnailUrl : this.nullableTrim(dto.thumbnailUrl),
        ruleSetId: dto.ruleSetId === undefined ? existing.ruleSetId : this.nullableTrim(dto.ruleSetId),
        difficulty: dto.difficulty === undefined ? existing.difficulty : this.nullableTrim(dto.difficulty),
        license: dto.license ? this.toPrismaScenarioLicense(dto.license) : existing.license,
        attribution: dto.attribution === undefined ? existing.attribution : this.nullableTrim(dto.attribution),
      },
    });

    if (shouldUpdateStartNode && startNode) {
      await this.prisma.scenarioNode.update({
        where: { id: startNode.id },
        data: {
          title: dto.startNodeTitle?.trim() || startNode.title,
          sceneText: dto.startSceneText?.trim() || startNode.sceneText,
        },
      });
    }

    return this.getScenario(id);
  }

  async deleteScenario(userId: string, id: string): Promise<void> {
    await this.getEditableScenarioEntity(userId, id);

    const linkedSessions = await this.prisma.sessionScenario.count({
      where: { scenarioId: id },
    });

    if (linkedSessions > 0) {
      throw new ConflictException("세션에 연결된 시나리오는 삭제할 수 없습니다.");
    }

    await this.prisma.scenario.delete({ where: { id } });
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

  private async getEditableScenarioEntity(userId: string, id: string) {
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

    if (scenario.createdByUserId !== userId) {
      throw new ForbiddenException("직접 만든 시나리오만 수정하거나 삭제할 수 있습니다.");
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

  private nullableTrim(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private toPrismaScenarioLicense(license: ScenarioLicense): PrismaScenarioLicense {
    switch (license) {
      case ScenarioLicense.CC_BY_4_0:
        return PrismaScenarioLicense.CC_BY_4_0;
      case ScenarioLicense.OTHER_FREE:
        return PrismaScenarioLicense.OTHER_FREE;
      case ScenarioLicense.ORIGINAL:
      default:
        return PrismaScenarioLicense.ORIGINAL;
    }
  }
}
