import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioNode,
  ScenarioSourceType as PrismaScenarioSourceType,
} from "@prisma/client";
import { createHash, createHmac, randomUUID } from "crypto";
import {
  CreateScenarioDto,
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioNodeInputDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioSummaryResponseDto,
  ScenarioLicense,
  ScenarioNodeType,
  UploadScenarioNodeImageDto,
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
    const title = dto.title.trim();
    const nodes = this.normalizeNodeInputs(scenarioId, dto.nodes, {
      startNodeTitle: dto.startNodeTitle,
      startSceneText: dto.startSceneText,
    });
    const startNodeId = nodes[0]?.id ?? `${scenarioId}_start`;

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
          create: nodes.map(({ scenarioId: _scenarioId, ...node }) => node),
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
    const nextNodes = dto.nodes ? this.normalizeNodeInputs(id, dto.nodes) : null;
    const nextStartNodeId = nextNodes ? nextNodes[0]?.id ?? null : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.scenario.update({
        where: { id },
        data: {
          title: dto.title?.trim() || existing.title,
          description: dto.description === undefined ? existing.description : this.nullableTrim(dto.description),
          thumbnailUrl: dto.thumbnailUrl === undefined ? existing.thumbnailUrl : this.nullableTrim(dto.thumbnailUrl),
          ruleSetId: dto.ruleSetId === undefined ? existing.ruleSetId : this.nullableTrim(dto.ruleSetId),
          difficulty: dto.difficulty === undefined ? existing.difficulty : this.nullableTrim(dto.difficulty),
          license: dto.license ? this.toPrismaScenarioLicense(dto.license) : existing.license,
          attribution: dto.attribution === undefined ? existing.attribution : this.nullableTrim(dto.attribution),
          startNodeId: nextStartNodeId,
        },
      });

      if (nextNodes) {
        await tx.scenarioNode.deleteMany({ where: { scenarioId: id } });
        await tx.scenarioNode.createMany({ data: nextNodes });
        return;
      }

      if (shouldUpdateStartNode && startNode) {
        await tx.scenarioNode.update({
          where: { id: startNode.id },
          data: {
            title: dto.startNodeTitle?.trim() || startNode.title,
            sceneText: dto.startSceneText?.trim() || startNode.sceneText,
          },
        });
      }
    });

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

  async uploadScenarioNodeImage(
    userId: string,
    scenarioId: string,
    nodeId: string,
    dto: UploadScenarioNodeImageDto,
  ): Promise<ScenarioNodeImageUploadResponseDto> {
    await this.getEditableScenarioEntity(userId, scenarioId);
    const node = await this.getScenarioNodeEntityById(scenarioId, nodeId);

    if (!dto.contentType.startsWith("image/")) {
      throw new BadRequestException("이미지 파일만 업로드할 수 있습니다.");
    }

    const body = Buffer.from(dto.dataBase64, "base64");
    const maxBytes = Number(process.env.R2_MAX_IMAGE_BYTES ?? 5 * 1024 * 1024);

    if (body.byteLength > maxBytes) {
      throw new BadRequestException("이미지 파일이 너무 큽니다.");
    }

    const imageUrl = await this.putR2Object({
      body,
      contentType: dto.contentType,
      fileName: dto.fileName,
      scenarioId,
      nodeId: node.id,
    });

    await this.prisma.scenarioNode.update({
      where: { id: node.id },
      data: { imageUrl },
    });

    return { imageUrl };
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

  private normalizeNodeInputs(
    scenarioId: string,
    inputs: ScenarioNodeInputDto[] | null | undefined,
    fallback?: { startNodeTitle?: string; startSceneText?: string },
  ) {
    const source = inputs?.length
      ? inputs
      : [
          {
            id: `${scenarioId}_start`,
            nodeType: ScenarioNodeType.STORY,
            title: fallback?.startNodeTitle?.trim() || "시작 장면",
            sceneText:
              fallback?.startSceneText?.trim() || "아직 시작 장면 내용이 작성되지 않았습니다.",
            imageUrl: null,
            visibleToPlayers: true,
            checkOptions: [],
            transitions: [],
            clues: [],
            fallbackNodeId: null,
          },
        ];
    const usedIds = new Set<string>();

    return source.map((node, index) => {
      const rawId = this.nullableTrim(node.id) ?? `${scenarioId}_node_${index + 1}`;
      const id = usedIds.has(rawId) ? `${rawId}_${randomUUID()}` : rawId;
      usedIds.add(id);

      return {
        id,
        scenarioId,
        nodeType: node.nodeType ?? ScenarioNodeType.STORY,
        title: node.title.trim(),
        sceneText: node.sceneText.trim(),
        imageUrl: this.nullableTrim(node.imageUrl),
        visibleToPlayers: node.visibleToPlayers ?? true,
        checkOptionsJson: JSON.stringify([]),
        transitionsJson: JSON.stringify(node.transitions ?? []),
        cluesJson: JSON.stringify(node.clues ?? []),
        fallbackNodeId: null,
      };
    });
  }

  private async putR2Object({
    body,
    contentType,
    fileName,
    scenarioId,
    nodeId,
  }: {
    body: Buffer;
    contentType: string;
    fileName: string;
    scenarioId: string;
    nodeId: string;
  }): Promise<string> {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucket = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new BadRequestException("R2 업로드 환경변수가 설정되지 않았습니다.");
    }

    const extension = this.getSafeFileExtension(fileName, contentType);
    const key = `scenarios/${scenarioId}/nodes/${nodeId}/${randomUUID()}${extension}`;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const encodedPath = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const canonicalHeaders =
      `host:${url.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
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

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      body,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(`R2 업로드에 실패했습니다. (${response.status}) ${message}`);
    }

    return `${publicBaseUrl}/${key}`;
  }

  private formatAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  }

  private getSafeFileExtension(fileName: string, contentType: string): string {
    const lowered = fileName.toLowerCase();
    const match = lowered.match(/\.(png|jpe?g|webp|gif)$/);
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
      case "image/gif":
        return ".gif";
      default:
        return ".img";
    }
  }
}
