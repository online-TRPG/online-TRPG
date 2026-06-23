import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantStatus as PrismaParticipantStatus,
  ScenarioAssetKind as PrismaScenarioAssetKind,
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioNode,
  ScenarioSourceType as PrismaScenarioSourceType,
  SessionStatus as PrismaSessionStatus,
} from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'crypto';
import {
  CreateScenarioDto,
  ScenarioAssetKind,
  ScenarioAssetQueryDto,
  ScenarioAssetResponseDto,
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioNodeInputDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioSummaryResponseDto,
  PublishScenarioDto,
  ReportScenarioDto,
  ScenarioModerationReportResponseDto,
  CreateScenarioReviewDto,
  ScenarioCollaborationStateResponseDto,
  ScenarioLicense,
  ScenarioNodeType,
  UpsertScenarioCollaboratorDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UpdateScenarioDto,
} from '@trpg/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { mapScenario, mapScenarioSummary } from '../../common/mappers/domain.mapper';
import {
  DEFAULT_PROVIDED_SCENARIO_ID,
  PROVIDED_SCENARIO_IDS,
  isProvidedScenarioId,
} from './provided-scenario.constants';
import {
  ScenarioCollaborationPolicyService,
  ScenarioCollaborator,
  ScenarioReviewRecord,
  ScenarioPolicyDraft,
  ScenarioPolicyNode,
  ScenarioPublishVisibility,
} from './scenario-collaboration-policy.service';

@Injectable()
export class ScenariosService {
  private static readonly REVISION_METADATA_MARKER = "P3_REVISION_META:";
  private static readonly COLLABORATION_METADATA_MARKER = "P4_COLLAB_META:";
  private static readonly MODERATION_REPORT_MARKER = "P4_MODERATION_REPORT:";

  constructor(
    private readonly prisma: PrismaService,
    private readonly collaborationPolicy: ScenarioCollaborationPolicyService = new ScenarioCollaborationPolicyService(),
  ) {}

  async listScenarios(query?: ScenarioQueryDto): Promise<ScenarioSummaryResponseDto[]> {
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        OR: [
          { id: { in: PROVIDED_SCENARIO_IDS } },
          { sourceType: PrismaScenarioSourceType.CLONED },
        ],
        title: query?.search
          ? {
              contains: query.search,
            }
          : undefined,
      },
      orderBy: { createdAt: 'asc' },
    });

    return scenarios
      .filter((scenario) => {
        if (isProvidedScenarioId(scenario.id)) {
          return true;
        }
        const metadata = this.parseScenarioRevisionMetadata(scenario.attribution);
        return scenario.sourceType === PrismaScenarioSourceType.CLONED && metadata.status === "public";
      })
      .map(mapScenarioSummary);
  }

  async listMyScenarios(
    userId: string,
    query?: ScenarioQueryDto
  ): Promise<ScenarioSummaryResponseDto[]> {
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        title: query?.search
          ? {
              contains: query.search,
            }
          : undefined,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return scenarios
      .filter((scenario) => {
        if (scenario.createdByUserId === userId) {
          return true;
        }
        if (scenario.sourceType === PrismaScenarioSourceType.CLONED) {
          return false;
        }
        return this.collaborationPolicy.resolvePermission({
          draft: this.buildScenarioPolicyDraft({ ...scenario, nodes: [] }),
          userId,
          action: "view",
        }).allowed;
      })
      .map(mapScenarioSummary);
  }

  async getScenario(id: string, viewerUserId?: string | null): Promise<ScenarioResponseDto> {
    const scenario = await this.getScenarioEntityForViewer(id, viewerUserId);
    return mapScenario(scenario);
  }

  async getScenarioEntityForViewer(id: string, viewerUserId?: string | null) {
    const scenario = await this.getScenarioEntityById(id);
    this.ensureScenarioVisibleToViewer(scenario, viewerUserId);
    return scenario;
  }

  async listScenarioAssets(
    userId: string,
    scenarioId: string,
    query?: ScenarioAssetQueryDto
  ): Promise<ScenarioAssetResponseDto[]> {
    await this.getEditableScenarioEntity(userId, scenarioId, { access: "edit" });

    let assets;
    try {
      assets = await this.prisma.scenarioAsset.findMany({
        where: {
          scenarioId,
          kind: query?.kind ? this.toPrismaScenarioAssetKind(query.kind) : undefined,
        },
        orderBy: [{ createdAt: 'desc' }],
      });
    } catch (error) {
      this.rethrowScenarioAssetStorageError(error);
    }

    return assets.map((asset) => this.mapScenarioAsset(asset));
  }

  async createScenario(userId: string, dto: CreateScenarioDto): Promise<ScenarioResponseDto> {
    const scenarioId = `scenario_${randomUUID()}`;
    const title = dto.title.trim();
    const startLevel = this.requireScenarioStartLevel(dto.startLevel);
    const nodes = this.normalizeNodeInputs(scenarioId, dto.nodes, {
      startNodeTitle: dto.startNodeTitle,
      startSceneText: dto.startSceneText,
    });
    const startNodeId =
      this.resolveStartNodeId(dto.startNodeId, nodes) ?? nodes[0]?.id ?? `${scenarioId}_start`;

    const scenario = await this.prisma.scenario.create({
      data: {
        id: scenarioId,
        title,
        description: this.nullableTrim(dto.description),
        createdByUserId: userId,
        sourceType: PrismaScenarioSourceType.USER,
        thumbnailUrl: this.nullableTrim(dto.thumbnailUrl),
        ruleSetId: this.nullableTrim(dto.ruleSetId) ?? 'dnd5e',
        difficulty: this.nullableTrim(dto.difficulty),
        startLevel,
        recommendedEndLevel: dto.recommendedEndLevel ?? null,
        license: this.toPrismaScenarioLicense(dto.license ?? ScenarioLicense.ORIGINAL),
        attribution: this.nullableTrim(dto.attribution),
        startNodeId,
        npcsJson: JSON.stringify(dto.npcs ?? []),
        nodes: {
          create: nodes.map(({ scenarioId: _scenarioId, ...node }) => node),
        },
      },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return mapScenario(scenario);
  }

  async updateScenario(
    userId: string,
    id: string,
    dto: UpdateScenarioDto
  ): Promise<ScenarioResponseDto> {
    const existing = await this.getEditableScenarioEntity(userId, id, { access: "edit" });
    if (
      dto.expectedUpdatedAt &&
      new Date(dto.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    ) {
      throw new ConflictException(
        "다른 편집자가 먼저 시나리오를 저장했습니다. 최신 내용을 다시 불러온 뒤 변경 사항을 합쳐 주세요.",
      );
    }
    const shouldUpdateStartNode =
      dto.startNodeTitle !== undefined || dto.startSceneText !== undefined;
    const nextNodes = dto.nodes ? this.normalizeNodeInputs(id, dto.nodes) : null;
    const startNodeIdSource = nextNodes ?? existing.nodes;
    const nextStartNodeId =
      dto.startNodeId !== undefined || nextNodes
        ? (this.resolveStartNodeId(dto.startNodeId, startNodeIdSource) ??
          this.resolveStartNodeId(existing.startNodeId, startNodeIdSource) ??
          startNodeIdSource[0]?.id ??
          null)
        : undefined;
    const currentStartNodeId = nextStartNodeId ?? existing.startNodeId;
    const startNode =
      existing.nodes.find((node) => node.id === currentStartNodeId) ??
      existing.nodes.find((node) => node.id === existing.startNodeId) ??
      existing.nodes[0] ??
      null;
    const nextStartLevel =
      dto.startLevel === undefined
        ? existing.startLevel
        : this.requireScenarioStartLevel(dto.startLevel);

    await this.prisma.$transaction(async (tx) => {
      await tx.scenario.update({
        where: { id },
        data: {
          title: dto.title?.trim() || existing.title,
          description:
            dto.description === undefined
              ? existing.description
              : this.nullableTrim(dto.description),
          thumbnailUrl:
            dto.thumbnailUrl === undefined
              ? existing.thumbnailUrl
              : this.nullableTrim(dto.thumbnailUrl),
          ruleSetId:
            dto.ruleSetId === undefined ? existing.ruleSetId : this.nullableTrim(dto.ruleSetId),
          difficulty:
            dto.difficulty === undefined ? existing.difficulty : this.nullableTrim(dto.difficulty),
          startLevel: nextStartLevel,
          recommendedEndLevel:
            dto.recommendedEndLevel === undefined
              ? existing.recommendedEndLevel
              : dto.recommendedEndLevel,
          license: dto.license ? this.toPrismaScenarioLicense(dto.license) : existing.license,
          attribution:
            dto.attribution === undefined
              ? existing.attribution
              : this.nullableTrim(dto.attribution),
          startNodeId: nextStartNodeId,
          npcsJson: dto.npcs === undefined ? existing.npcsJson : JSON.stringify(dto.npcs ?? []),
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

    return this.getScenario(id, userId);
  }

  async publishScenario(
    userId: string,
    id: string,
    dto: PublishScenarioDto,
  ): Promise<ScenarioResponseDto> {
    const draft = await this.getEditableScenarioEntity(userId, id);
    const previousRevision = await this.prisma.scenario.findFirst({
      where: {
        baseScenarioId: draft.id,
        sourceType: PrismaScenarioSourceType.CLONED,
      },
      orderBy: { createdAt: "desc" },
      include: {
        nodes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const validationReport = this.buildScenarioValidationReport(
      draft,
      dto.visibility ?? "public",
      previousRevision?.nodes.map((node): ScenarioPolicyNode => ({
        id: node.id.replace(`${previousRevision.id}_`, ""),
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        checkOptions: this.parseJson<unknown>(node.checkOptionsJson, null),
        nodeMeta: this.parseJson<unknown>(node.nodeMetaJson, null),
        transitions: this.parseJson<Array<{ nextNodeId?: string | null }>>(node.transitionsJson, [])
          .map((transition) => ({
            ...transition,
            nextNodeId: transition.nextNodeId?.replace(`${previousRevision.id}_`, "") ?? null,
          })),
        fallbackNodeId: node.fallbackNodeId?.replace(`${previousRevision.id}_`, "") ?? null,
      })),
    );
    this.assertScenarioPublishable(validationReport);

    const revisionNumber =
      (await this.prisma.scenario.count({
        where: {
          baseScenarioId: draft.id,
          sourceType: PrismaScenarioSourceType.CLONED,
        },
      })) + 1;
    const publishedScenarioId = `${draft.id}_rev_${revisionNumber}_${randomUUID()}`;
    const changelog = this.nullableTrim(dto.changelog);
    const publishedAt = new Date();
    const attribution = this.appendScenarioRevisionMetadata(
      draft.attribution,
      {
        revisionNumber,
        changelog,
        publishedAt: publishedAt.toISOString(),
        publishedByUserId: userId,
        status: dto.visibility ?? "public",
        validationReport,
      },
    );

    const published = await this.prisma.scenario.create({
      data: {
        id: publishedScenarioId,
        title: draft.title,
        description: draft.description,
        createdByUserId: userId,
        sourceType: PrismaScenarioSourceType.CLONED,
        baseScenarioId: draft.id,
        thumbnailUrl: draft.thumbnailUrl,
        ruleSetId: draft.ruleSetId,
        difficulty: draft.difficulty,
        startLevel: draft.startLevel,
        recommendedEndLevel: draft.recommendedEndLevel,
        license: draft.license,
        attribution,
        startNodeId: draft.startNodeId
          ? `${publishedScenarioId}_${draft.startNodeId}`
          : null,
        npcsJson: draft.npcsJson,
        nodes: {
          create: draft.nodes.map((node) => ({
            id: `${publishedScenarioId}_${node.id}`,
            nodeType: node.nodeType,
            title: node.title,
            sceneText: node.sceneText,
            imageUrl: node.imageUrl,
            checkOptionsJson: this.rewriteScenarioCheckOptionsNodeReferences(
              node.checkOptionsJson,
              draft.id,
              publishedScenarioId,
            ),
            transitionsJson: this.rewriteScenarioNodeIdReferences(
              node.transitionsJson,
              draft.id,
              publishedScenarioId,
            ),
            cluesJson: node.cluesJson,
            nodeMetaJson: node.nodeMetaJson,
            fallbackNodeId: node.fallbackNodeId
              ? `${publishedScenarioId}_${node.fallbackNodeId}`
              : null,
          })),
        },
      },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return mapScenario(published);
  }

  async unpublishScenarioRevision(
    userId: string,
    id: string,
  ): Promise<ScenarioResponseDto> {
    const revision = await this.prisma.scenario.findUnique({
      where: { id },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!revision) {
      throw new NotFoundException(`Scenario ${id} was not found.`);
    }
    if (revision.createdByUserId !== userId) {
      throw new ForbiddenException('직접 발행한 revision만 공개 취소할 수 있습니다.');
    }
    if (revision.sourceType !== PrismaScenarioSourceType.CLONED || !revision.baseScenarioId) {
      throw new BadRequestException('공개 취소는 발행된 revision에만 사용할 수 있습니다.');
    }
    const metadata = this.parseScenarioRevisionMetadata(revision.attribution);
    const updated = await this.prisma.scenario.update({
      where: { id },
      data: {
        attribution: this.appendScenarioRevisionMetadata(
          metadata.attribution,
          {
            revisionNumber: metadata.revisionNumber,
            changelog: metadata.changelog,
            publishedAt: metadata.publishedAt ?? revision.createdAt.toISOString(),
            publishedByUserId: metadata.publishedByUserId ?? userId,
            status: "unpublished",
            validationReport: metadata.validationReport,
          },
        ),
      },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return mapScenario(updated);
  }

  async getScenarioCollaborationState(
    userId: string,
    id: string,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensureScenarioDraftEditableForCollaboration(scenario);
    const draft = this.buildScenarioPolicyDraft(scenario);
    const permission = this.collaborationPolicy.resolvePermission({ draft, userId, action: "view" });
    if (!permission.allowed) {
      throw new ForbiddenException("시나리오 협업 정보를 볼 권한이 없습니다.");
    }
    return this.mapCollaborationState(draft.collaborators, draft.reviews, draft.ownerUserId);
  }

  async upsertScenarioCollaborator(
    userId: string,
    id: string,
    dto: UpsertScenarioCollaboratorDto,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensureScenarioDraftEditableForCollaboration(scenario);
    const draft = this.buildScenarioPolicyDraft(scenario);
    const permission = this.collaborationPolicy.resolvePermission({
      draft,
      userId,
      action: "manage_collaborators",
    });
    if (!permission.allowed) {
      throw new ForbiddenException("collaborator를 관리할 권한이 없습니다.");
    }
    const targetUserId = dto.userId.trim();
    if (!targetUserId || targetUserId === scenario.createdByUserId) {
      throw new BadRequestException("owner는 collaborator 목록에 추가할 수 없습니다.");
    }
    const collaborators = [
      ...draft.collaborators.filter((collaborator) => collaborator.userId !== targetUserId),
      { userId: targetUserId, role: dto.role },
    ].sort((left, right) => left.userId.localeCompare(right.userId));
    return this.persistScenarioCollaborationState(scenario.id, draft.ownerUserId, collaborators, draft.reviews);
  }

  async removeScenarioCollaborator(
    userId: string,
    id: string,
    collaboratorUserId: string,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensureScenarioDraftEditableForCollaboration(scenario);
    const draft = this.buildScenarioPolicyDraft(scenario);
    const permission = this.collaborationPolicy.resolvePermission({
      draft,
      userId,
      action: "manage_collaborators",
    });
    if (!permission.allowed) {
      throw new ForbiddenException("collaborator를 관리할 권한이 없습니다.");
    }
    const collaborators = draft.collaborators.filter(
      (collaborator) => collaborator.userId !== collaboratorUserId,
    );
    return this.persistScenarioCollaborationState(scenario.id, draft.ownerUserId, collaborators, draft.reviews);
  }

  async createScenarioReview(
    userId: string,
    id: string,
    dto: CreateScenarioReviewDto,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensureScenarioDraftEditableForCollaboration(scenario);
    const draft = this.buildScenarioPolicyDraft(scenario);
    const isRequest = dto.status === "requested";
    const permission = this.collaborationPolicy.resolvePermission({
      draft,
      userId,
      action: isRequest ? "request_review" : "review",
    });
    if (!permission.allowed) {
      throw new ForbiddenException("review를 기록할 권한이 없습니다.");
    }
    const reviewerUserId = isRequest
      ? (dto.reviewerUserId?.trim() ||
        draft.collaborators.find((collaborator) => collaborator.role === "reviewer")?.userId)
      : userId;
    if (!reviewerUserId) {
      throw new BadRequestException("review 요청 전에 reviewer collaborator를 지정해 주세요.");
    }
    if (
      isRequest &&
      !draft.collaborators.some(
        (collaborator) =>
          collaborator.userId === reviewerUserId && collaborator.role === "reviewer",
      )
    ) {
      throw new BadRequestException("지정한 사용자는 reviewer collaborator가 아닙니다.");
    }
    const now = new Date().toISOString();
    const review: ScenarioReviewRecord = {
      reviewId: `review:${randomUUID()}`,
      requestedByUserId: isRequest
        ? userId
        : draft.reviews.at(-1)?.requestedByUserId ?? draft.ownerUserId,
      reviewerUserId,
      status: dto.status,
      comment: dto.comment?.trim() || null,
      decidedAt: dto.status === "requested" ? null : now,
    };
    return this.persistScenarioCollaborationState(
      scenario.id,
      draft.ownerUserId,
      draft.collaborators,
      [...draft.reviews, review],
    );
  }

  async reportScenario(
    userId: string,
    id: string,
    dto: ReportScenarioDto,
  ): Promise<ScenarioModerationReportResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    if (scenario.sourceType !== PrismaScenarioSourceType.CLONED || revision.status === "draft") {
      throw new BadRequestException("발행된 scenario revision만 신고할 수 있습니다.");
    }
    const reportId = `scenario-report:${randomUUID()}`;
    const moderationEntry = JSON.stringify({
      reportId,
      reportedByUserId: userId,
      reason: dto.reason,
      comment: dto.comment?.trim() || null,
      createdAt: new Date().toISOString(),
    });
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: `${scenario.attribution ?? ""}\nP4_MODERATION_REPORT:${moderationEntry}`.trim(),
      },
    });
    return { reportId, scenarioId: scenario.id, status: "received" };
  }

  async deleteScenario(userId: string, id: string): Promise<void> {
    await this.getEditableScenarioEntity(userId, id);

    const linkedSessionScenarios = await this.prisma.sessionScenario.findMany({
      where: { scenarioId: id },
      include: { session: true },
    });

    const deletableLinkedSessionStatuses: PrismaSessionStatus[] = [
      PrismaSessionStatus.RECRUITING,
      PrismaSessionStatus.COMPLETED,
      PrismaSessionStatus.DISBANDED,
    ];
    const blockingSession = linkedSessionScenarios.find(
      ({ session }) =>
        session.hostUserId !== userId ||
        !deletableLinkedSessionStatuses.includes(session.status)
    );

    if (blockingSession) {
      throw new ConflictException(
        '진행 중이거나 다른 사용자의 세션에 연결된 시나리오는 삭제할 수 없습니다.'
      );
    }

    const linkedRecruitingSessionIds = Array.from(
      new Set(
        linkedSessionScenarios
          .filter(
            ({ session }) =>
              session.hostUserId === userId && session.status === PrismaSessionStatus.RECRUITING
          )
          .map(({ sessionId }) => sessionId)
      )
    );

    await this.prisma.$transaction([
      ...(linkedRecruitingSessionIds.length > 0
        ? [
            this.prisma.sessionCharacter.deleteMany({
              where: { sessionId: { in: linkedRecruitingSessionIds } },
            }),
            this.prisma.sessionParticipant.updateMany({
              where: {
                sessionId: { in: linkedRecruitingSessionIds },
                status: PrismaParticipantStatus.JOINED,
              },
              data: {
                status: PrismaParticipantStatus.LEFT,
                leftAt: new Date(),
                connectionStatus: PrismaConnectionStatus.OFFLINE,
                isReady: false,
                readyAt: null,
              },
            }),
            this.prisma.session.updateMany({
              where: { id: { in: linkedRecruitingSessionIds } },
              data: { status: PrismaSessionStatus.DISBANDED },
            }),
          ]
        : []),
      this.prisma.sessionScenario.deleteMany({ where: { scenarioId: id } }),
      this.prisma.scenario.delete({ where: { id } }),
    ]);
  }

  async uploadScenarioAsset(
    userId: string,
    scenarioId: string,
    dto: UploadScenarioAssetDto
  ): Promise<ScenarioAssetResponseDto> {
    await this.getEditableScenarioEntity(userId, scenarioId, { access: "edit" });
    return this.createScenarioAsset(userId, scenarioId, dto);
  }

  async deleteScenarioAsset(userId: string, scenarioId: string, assetId: string): Promise<void> {
    await this.getEditableScenarioEntity(userId, scenarioId, { access: "edit" });

    let asset;
    try {
      asset = await this.prisma.scenarioAsset.findFirst({
        where: {
          id: assetId,
          scenarioId,
        },
      });
    } catch (error) {
      this.rethrowScenarioAssetStorageError(error);
    }

    if (!asset) {
      throw new NotFoundException(
        `Scenario asset ${assetId} was not found in scenario ${scenarioId}.`
      );
    }

    await this.deleteR2Object(asset.storageKey);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.scenarioAsset.delete({
          where: { id: asset.id },
        });
        await this.clearScenarioAssetReferences(tx, scenarioId, asset.kind, asset.publicUrl);
      });
    } catch (error) {
      this.rethrowScenarioAssetStorageError(error);
    }
  }

  async uploadScenarioNodeImage(
    userId: string,
    scenarioId: string,
    nodeId: string,
    dto: UploadScenarioNodeImageDto
  ): Promise<ScenarioNodeImageUploadResponseDto> {
    await this.getEditableScenarioEntity(userId, scenarioId, { access: "edit" });
    const node = await this.getScenarioNodeEntityById(scenarioId, nodeId);
    const asset = await this.createScenarioAsset(userId, scenarioId, {
      kind: ScenarioAssetKind.SCENE,
      fileName: dto.fileName,
      contentType: dto.contentType,
      dataBase64: dto.dataBase64,
    });

    await this.prisma.scenarioNode.update({
      where: { id: node.id },
      data: { imageUrl: asset.publicUrl },
    });

    return { imageUrl: asset.publicUrl };
  }

  async getDefaultScenarioEntity() {
    return this.getScenarioEntityById(DEFAULT_PROVIDED_SCENARIO_ID);
  }

  async getScenarioEntityById(id: string) {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} was not found.`);
    }

    return scenario;
  }

  private async getEditableScenarioEntity(
    userId: string,
    id: string,
    options: { access?: "owner" | "edit" } = {},
  ) {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario ${id} was not found.`);
    }

    if (scenario.sourceType === PrismaScenarioSourceType.CLONED) {
      throw new ForbiddenException('발행된 revision은 직접 수정할 수 없습니다. 원본 draft를 수정한 뒤 새 revision으로 발행하세요.');
    }
    if (options.access === "edit") {
      const permission = this.collaborationPolicy.resolvePermission({
        draft: this.buildScenarioPolicyDraft(scenario),
        userId,
        action: "edit",
      });
      if (!permission.allowed) {
        throw new ForbiddenException("시나리오 draft를 편집할 권한이 없습니다.");
      }
      return scenario;
    }

    if (scenario.createdByUserId !== userId) {
      throw new ForbiddenException('직접 만든 시나리오만 수정하거나 삭제할 수 있습니다.');
    }

    return scenario;
  }

  private ensureScenarioVisibleToViewer(
    scenario: Awaited<ReturnType<ScenariosService['getScenarioEntityById']>>,
    viewerUserId?: string | null
  ): void {
    const isDefaultProvidedScenario = isProvidedScenarioId(scenario.id);
    const isOwnScenario = Boolean(viewerUserId && scenario.createdByUserId === viewerUserId);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (revision.status === 'public' || revision.status === 'link');
    const canViewCollaborativeDraft =
      Boolean(viewerUserId) &&
      scenario.sourceType !== PrismaScenarioSourceType.CLONED &&
      this.collaborationPolicy.resolvePermission({
        draft: this.buildScenarioPolicyDraft(scenario),
        userId: viewerUserId as string,
        action: "view",
      }).allowed;

    if (isDefaultProvidedScenario || isOwnScenario || isPublishedRevision || canViewCollaborativeDraft) {
      return;
    }

    // 다른 사용자가 만든 시나리오는 존재 여부도 노출하지 않도록 404로 숨깁니다.
    throw new NotFoundException(`Scenario ${scenario.id} was not found.`);
  }

  private buildScenarioValidationReport(
    scenario: Awaited<ReturnType<ScenariosService['getEditableScenarioEntity']>>,
    visibility: ScenarioPublishVisibility = "private",
    previousRevisionNodes?: ScenarioPolicyNode[],
  ): {
    status: 'valid' | 'invalid';
    checkedAt: string;
    issueCount: number;
    issues: Array<{ code: string; message: string; nodeId?: string | null }>;
    nodeCounts: Record<'story' | 'exploration' | 'combat' | 'other', number>;
    p4Policy: {
      status: 'valid' | 'invalid';
      issueCount: number;
      blockerCount: number;
      warningCount: number;
      reviewGate: 'enforced_by_policy_service';
    };
    revisionDiff: ReturnType<ScenarioCollaborationPolicyService["diffNodes"]> | null;
  } {
    const issues: Array<{ code: string; message: string; nodeId?: string | null }> = [];
    if (!scenario.nodes.length) {
      issues.push({ code: 'NO_NODES', message: '발행하려면 최소 1개 이상의 시나리오 노드가 필요합니다.' });
    }
    const nodeIds = new Set(scenario.nodes.map((node) => node.id));
    const startNodeId = scenario.startNodeId ?? scenario.nodes[0]?.id ?? null;
    if (!startNodeId || !nodeIds.has(startNodeId)) {
      issues.push({ code: 'INVALID_START_NODE', message: '발행하려면 유효한 시작 노드가 필요합니다.', nodeId: startNodeId });
    }
    const brokenTransitions = scenario.nodes.flatMap((node) => {
      const transitions = this.parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
      return transitions
        .map((transition) => transition.nextNodeId)
        .filter((nextNodeId): nextNodeId is string => typeof nextNodeId === 'string')
        .filter((nextNodeId) => !nodeIds.has(nextNodeId))
        .map((nextNodeId) => ({ sourceNodeId: node.id, nextNodeId }));
    });
    for (const transition of brokenTransitions) {
      issues.push({
        code: 'BROKEN_TRANSITION',
        message: `발행할 수 없는 전환 대상이 있습니다: ${transition.nextNodeId}`,
        nodeId: transition.sourceNodeId,
      });
    }
    const brokenFallbacks = scenario.nodes
      .filter((node) => node.fallbackNodeId && !nodeIds.has(node.fallbackNodeId))
      .map((node) => ({ sourceNodeId: node.id, fallbackNodeId: node.fallbackNodeId }));
    for (const fallback of brokenFallbacks) {
      issues.push({
        code: 'BROKEN_FALLBACK',
        message: `발행할 수 없는 fallback 노드가 있습니다: ${fallback.fallbackNodeId}`,
        nodeId: fallback.sourceNodeId,
      });
    }
    const nodeCounts = scenario.nodes.reduce<Record<'story' | 'exploration' | 'combat' | 'other', number>>(
      (counts, node) => {
        if (node.nodeType === 'story' || node.nodeType === 'exploration' || node.nodeType === 'combat') {
          counts[node.nodeType] += 1;
        } else {
          counts.other += 1;
        }
        return counts;
      },
      { story: 0, exploration: 0, combat: 0, other: 0 },
    );
    const policyOwnerUserId = scenario.createdByUserId ?? "";
    const policyResult = this.collaborationPolicy.evaluatePublishPolicy({
      draft: this.buildScenarioPolicyDraft(scenario),
      actorUserId: policyOwnerUserId,
      visibility,
      previousRevisionNodes,
    });
    for (const issue of policyResult.issues.filter((candidate) => candidate.severity === "blocker")) {
      issues.push({
        code: `P4_POLICY_${issue.code}`,
        message: issue.message,
        nodeId: issue.nodeId,
      });
    }
    return {
      status: issues.length ? 'invalid' : 'valid',
      checkedAt: new Date().toISOString(),
      issueCount: issues.length,
      issues,
      nodeCounts,
      p4Policy: {
        status: policyResult.validationReport.status,
        issueCount: policyResult.validationReport.issueCount,
        blockerCount: policyResult.validationReport.blockerCount,
        warningCount: policyResult.validationReport.warningCount,
        reviewGate: 'enforced_by_policy_service',
      },
      revisionDiff: policyResult.diff,
    };
  }

  private assertScenarioPublishable(
    validationReport: ReturnType<ScenariosService['buildScenarioValidationReport']>,
  ): void {
    if (validationReport.status === 'valid') {
      return;
    }
    throw new BadRequestException(validationReport.issues[0]?.message ?? '시나리오 검증을 통과하지 못했습니다.');
  }

  private buildScenarioPolicyDraft(
    scenario: Awaited<ReturnType<ScenariosService['getEditableScenarioEntity']>>,
  ): ScenarioPolicyDraft {
    const ownerUserId = scenario.createdByUserId ?? "";
    const collaboration = this.parseScenarioCollaborationMetadata(scenario.attribution);
    return {
      scenarioId: scenario.id,
      ownerUserId,
      license: this.toScenarioPolicyLicense(scenario.license),
      attribution: this.parseScenarioRevisionMetadata(scenario.attribution).attribution,
      collaborators: collaboration.collaborators,
      reviews: collaboration.reviews,
      nodes: scenario.nodes.map((node): ScenarioPolicyNode => ({
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        checkOptions: this.parseJson<unknown>(node.checkOptionsJson, null),
        nodeMeta: this.parseJson<unknown>(node.nodeMetaJson, null),
        transitions: this.parseJson<Array<{ nextNodeId?: string | null }>>(node.transitionsJson, []),
        fallbackNodeId: node.fallbackNodeId,
      })),
    };
  }

  private toScenarioPolicyLicense(license: PrismaScenarioLicense): ScenarioPolicyDraft["license"] {
    switch (license) {
      case PrismaScenarioLicense.CC_BY_4_0:
        return "CC_BY";
      case PrismaScenarioLicense.OTHER_FREE:
        return "OTHER";
      case PrismaScenarioLicense.ORIGINAL:
      default:
        return "ORIGINAL";
    }
  }

  private rewriteScenarioNodeIdReferences(
    transitionsJson: string,
    sourceScenarioId: string,
    publishedScenarioId: string,
  ): string {
    const transitions = this.parseJson<Record<string, unknown>[]>(transitionsJson, []);
    return JSON.stringify(
      transitions.map((transition) => {
        const nextNodeId = transition.nextNodeId;
        if (typeof nextNodeId !== 'string') {
          return transition;
        }
        const localNodeId = nextNodeId.startsWith(`${sourceScenarioId}_`)
          ? nextNodeId.slice(sourceScenarioId.length + 1)
          : nextNodeId;
        return {
          ...transition,
          nextNodeId: `${publishedScenarioId}_${localNodeId}`,
        };
      }),
    );
  }

  private rewriteScenarioCheckOptionsNodeReferences(
    checkOptionsJson: string,
    sourceScenarioId: string,
    publishedScenarioId: string,
  ): string {
    const parsed = this.parseJson<unknown>(checkOptionsJson, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return checkOptionsJson;
    }

    const config = parsed as Record<string, unknown>;
    const vttMap = config.vttMap;
    if (!vttMap || typeof vttMap !== 'object' || Array.isArray(vttMap)) {
      return checkOptionsJson;
    }

    const mapRecord = vttMap as Record<string, unknown>;
    const scenarioNodeId = mapRecord.scenarioNodeId;
    if (typeof scenarioNodeId !== 'string') {
      return checkOptionsJson;
    }

    const localNodeId = scenarioNodeId.startsWith(`${sourceScenarioId}_`)
      ? scenarioNodeId.slice(sourceScenarioId.length + 1)
      : scenarioNodeId;

    return JSON.stringify({
      ...config,
      vttMap: {
        ...mapRecord,
        scenarioNodeId: `${publishedScenarioId}_${localNodeId}`,
      },
    });
  }

  private ensureScenarioDraftEditableForCollaboration(
    scenario: Awaited<ReturnType<ScenariosService['getScenarioEntityById']>>,
  ): void {
    if (scenario.sourceType === PrismaScenarioSourceType.CLONED) {
      throw new ForbiddenException("발행된 revision의 collaborator/review 상태는 수정할 수 없습니다.");
    }
  }

  private async persistScenarioCollaborationState(
    scenarioId: string,
    ownerUserId: string,
    collaborators: ScenarioCollaborator[],
    reviews: ScenarioReviewRecord[],
  ): Promise<ScenarioCollaborationStateResponseDto> {
    const scenario = await this.getScenarioEntityById(scenarioId);
    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: {
        attribution: this.appendScenarioCollaborationMetadata(scenario.attribution, {
          collaborators,
          reviews,
        }),
      },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const state = this.parseScenarioCollaborationMetadata(updated.attribution);
    return this.mapCollaborationState(
      state.collaborators,
      state.reviews,
      ownerUserId,
    );
  }

  private mapCollaborationState(
    collaborators: ScenarioCollaborator[],
    reviews: ScenarioReviewRecord[],
    ownerUserId?: string,
  ): ScenarioCollaborationStateResponseDto {
    return {
      collaborators: [
        ...(ownerUserId ? [{ userId: ownerUserId, role: "owner" as const }] : []),
        ...collaborators.map((collaborator) => ({
          userId: collaborator.userId,
          role: collaborator.role,
        })),
      ],
      reviews: reviews.map((review) => ({
        reviewId: review.reviewId,
        requestedByUserId: review.requestedByUserId,
        reviewerUserId: review.reviewerUserId,
        status: review.status,
        comment: review.comment ?? null,
        decidedAt: review.decidedAt ?? null,
      })),
    };
  }

  private appendScenarioCollaborationMetadata(
    attribution: string | null | undefined,
    metadata: {
      collaborators: ScenarioCollaborator[];
      reviews: ScenarioReviewRecord[];
    },
  ): string | null {
    const publicAttribution = this.parseScenarioRevisionMetadata(attribution).attribution;
    const revision = this.parseScenarioRevisionMetadata(attribution);
    const encoded = JSON.stringify(metadata);
    const parts = [
      publicAttribution,
      `${ScenariosService.COLLABORATION_METADATA_MARKER}${encoded}`,
      revision.revisionNumber !== null || revision.status !== "draft"
        ? `${ScenariosService.REVISION_METADATA_MARKER}${JSON.stringify({
            revisionNumber: revision.revisionNumber,
            changelog: revision.changelog,
            publishedAt: revision.publishedAt ?? new Date(0).toISOString(),
            publishedByUserId: revision.publishedByUserId ?? "",
            status: revision.status === "draft" ? "private" : revision.status,
            validationReport: revision.validationReport,
          })}`
        : null,
    ];
    return parts.filter((part): part is string => Boolean(part)).join("\n") || null;
  }

  private parseScenarioCollaborationMetadata(attribution: string | null | undefined): {
    collaborators: ScenarioCollaborator[];
    reviews: ScenarioReviewRecord[];
  } {
    const raw = attribution ?? "";
    const markerIndex = raw.indexOf(ScenariosService.COLLABORATION_METADATA_MARKER);
    if (markerIndex < 0) {
      return { collaborators: [], reviews: [] };
    }
    const afterMarker = raw.slice(markerIndex + ScenariosService.COLLABORATION_METADATA_MARKER.length);
    const nextMarkers = [
      afterMarker.indexOf(ScenariosService.REVISION_METADATA_MARKER),
      afterMarker.indexOf(ScenariosService.COLLABORATION_METADATA_MARKER),
    ].filter((index) => index >= 0);
    const metadataText = afterMarker.slice(0, nextMarkers.length ? Math.min(...nextMarkers) : undefined).trim();
    try {
      const metadata = JSON.parse(metadataText) as {
        collaborators?: ScenarioCollaborator[];
        reviews?: ScenarioReviewRecord[];
      };
      return {
        collaborators: Array.isArray(metadata.collaborators)
          ? metadata.collaborators.filter((collaborator) =>
              collaborator &&
              typeof collaborator.userId === "string" &&
              (collaborator.role === "editor" ||
                collaborator.role === "reviewer" ||
                collaborator.role === "viewer"),
            )
          : [],
        reviews: Array.isArray(metadata.reviews)
          ? metadata.reviews.filter((review) =>
              review &&
              typeof review.reviewId === "string" &&
              typeof review.requestedByUserId === "string" &&
              typeof review.reviewerUserId === "string" &&
              (review.status === "none" ||
                review.status === "requested" ||
                review.status === "approved" ||
                review.status === "rejected" ||
                review.status === "changes_requested"),
            )
          : [],
      };
    } catch {
      return { collaborators: [], reviews: [] };
    }
  }

  private stripScenarioMetadataMarkers(attribution: string | null | undefined): string | null {
    const raw = attribution ?? "";
    const markerIndexes = [
      raw.indexOf(ScenariosService.REVISION_METADATA_MARKER),
      raw.indexOf(ScenariosService.COLLABORATION_METADATA_MARKER),
      raw.indexOf(ScenariosService.MODERATION_REPORT_MARKER),
    ].filter((index) => index >= 0);
    const publicAttribution = markerIndexes.length ? raw.slice(0, Math.min(...markerIndexes)) : raw;
    return publicAttribution.trim() || null;
  }

  private appendScenarioRevisionMetadata(
    attribution: string | null | undefined,
    metadata: {
      revisionNumber: number | null;
      changelog: string | null;
      publishedAt: string;
      publishedByUserId: string;
      status: 'public' | 'link' | 'private' | 'unpublished';
      validationReport?: Record<string, unknown> | null;
    },
  ): string | null {
    const publicAttribution = this.stripScenarioMetadataMarkers(attribution);
    const encoded = JSON.stringify(metadata);
    return [publicAttribution, `${ScenariosService.REVISION_METADATA_MARKER}${encoded}`]
      .filter((part): part is string => Boolean(part))
      .join('\n');
  }

  private parseScenarioRevisionMetadata(attribution: string | null | undefined): {
    attribution: string | null;
    revisionNumber: number | null;
    changelog: string | null;
    validationReport: Record<string, unknown> | null;
    publishedAt: string | null;
    publishedByUserId: string | null;
    status: 'draft' | 'public' | 'link' | 'private' | 'unpublished';
  } {
    const raw = attribution ?? '';
    const markerIndex = raw.indexOf(ScenariosService.REVISION_METADATA_MARKER);
    if (markerIndex < 0) {
      return {
        attribution: this.stripScenarioMetadataMarkers(raw),
        revisionNumber: null,
        changelog: null,
        validationReport: null,
        publishedAt: null,
        publishedByUserId: null,
        status: 'draft',
      };
    }
    const publicAttribution = this.stripScenarioMetadataMarkers(raw.slice(0, markerIndex));
    const metadataText = raw
      .slice(markerIndex + ScenariosService.REVISION_METADATA_MARKER.length)
      .split(ScenariosService.MODERATION_REPORT_MARKER, 1)[0]
      .split(ScenariosService.COLLABORATION_METADATA_MARKER, 1)[0]
      .trim();
    try {
      const metadata = JSON.parse(metadataText) as Record<string, unknown>;
      const status = metadata.status;
      return {
        attribution: publicAttribution,
        revisionNumber:
          typeof metadata.revisionNumber === 'number' && Number.isInteger(metadata.revisionNumber)
            ? metadata.revisionNumber
            : null,
        changelog: typeof metadata.changelog === 'string' ? metadata.changelog : null,
        validationReport:
          metadata.validationReport &&
          typeof metadata.validationReport === 'object' &&
          !Array.isArray(metadata.validationReport)
            ? (metadata.validationReport as Record<string, unknown>)
            : null,
        publishedAt: typeof metadata.publishedAt === 'string' ? metadata.publishedAt : null,
        publishedByUserId:
          typeof metadata.publishedByUserId === 'string' ? metadata.publishedByUserId : null,
        status:
          status === 'public' || status === 'link' || status === 'private' || status === 'unpublished'
            ? status
            : 'draft',
      };
    } catch {
      return {
        attribution: publicAttribution,
        revisionNumber: null,
        changelog: null,
        validationReport: null,
        publishedAt: null,
        publishedByUserId: null,
        status: 'draft',
      };
    }
  }

  async getScenarioNodeEntityById(scenarioId: string, nodeId: string): Promise<ScenarioNode> {
    const node = await this.prisma.scenarioNode.findFirst({
      where: {
        scenarioId,
        id: nodeId,
      },
    });

    if (!node) {
      throw new NotFoundException(
        `Scenario node ${nodeId} was not found in scenario ${scenarioId}.`
      );
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

  private requireScenarioStartLevel(value: number | null | undefined): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
      throw new BadRequestException('Scenario start level must be set between 1 and 20.');
    }

    return value;
  }

  private resolveStartNodeId(
    requested: string | null | undefined,
    nodes: Array<{ id: string; transitionsJson?: string }>
  ): string | null {
    if (!nodes.length) {
      return null;
    }
    const normalized = this.nullableTrim(requested);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const incoming = new Map<string, number>();

    nodes.forEach((node) => {
      const transitions = this.parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
      transitions.forEach((transition) => {
        const nextNodeId = transition.nextNodeId;
        if (typeof nextNodeId === 'string' && nodeIds.has(nextNodeId)) {
          incoming.set(nextNodeId, (incoming.get(nextNodeId) ?? 0) + 1);
        }
      });
    });

    const rootNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
    if (
      normalized &&
      nodeIds.has(normalized) &&
      (rootNodes.length !== 1 || rootNodes[0].id === normalized)
    ) {
      return normalized;
    }

    return rootNodes.length === 1
      ? rootNodes[0].id
      : normalized && nodeIds.has(normalized)
        ? normalized
        : null;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
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

  private toPrismaScenarioAssetKind(kind: ScenarioAssetKind): PrismaScenarioAssetKind {
    switch (kind) {
      case ScenarioAssetKind.SCENE:
        return PrismaScenarioAssetKind.SCENE;
      case ScenarioAssetKind.TOKEN:
        return PrismaScenarioAssetKind.TOKEN;
      case ScenarioAssetKind.MAP:
      default:
        return PrismaScenarioAssetKind.MAP;
    }
  }

  private mapScenarioAsset(asset: {
    id: string;
    scenarioId: string;
    kind: PrismaScenarioAssetKind;
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
  }): ScenarioAssetResponseDto {
    return {
      id: asset.id,
      scenarioId: asset.scenarioId,
      kind: asset.kind as unknown as ScenarioAssetKind,
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

  private normalizeNodeInputs(
    scenarioId: string,
    inputs: ScenarioNodeInputDto[] | null | undefined,
    fallback?: { startNodeTitle?: string; startSceneText?: string }
  ) {
    const source = inputs?.length
      ? inputs
      : [
          {
            id: `${scenarioId}_start`,
            nodeType: ScenarioNodeType.STORY,
            title: fallback?.startNodeTitle?.trim() || '시작 장면',
            sceneText:
              fallback?.startSceneText?.trim() || '아직 시작 장면 내용이 작성되지 않았습니다.',
            imageUrl: null,
            vttMap: null,
            checkOptions: [],
            transitions: [],
            clues: [],
            nodeMeta: null,
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
        checkOptionsJson: JSON.stringify({
          checks: node.checkOptions ?? [],
          vttMap: node.vttMap ?? null,
        }),
        transitionsJson: JSON.stringify(node.transitions ?? []),
        cluesJson: JSON.stringify(node.clues ?? []),
        nodeMetaJson: JSON.stringify(node.nodeMeta ?? null),
        fallbackNodeId: this.nullableTrim(node.fallbackNodeId),
      };
    });
  }

  private async createScenarioAsset(
    userId: string,
    scenarioId: string,
    dto: UploadScenarioAssetDto
  ): Promise<ScenarioAssetResponseDto> {
    if (!dto.contentType.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 업로드할 수 있습니다.');
    }

    const body = Buffer.from(dto.dataBase64, 'base64');
    const maxBytes =
      dto.kind === ScenarioAssetKind.MAP
        ? Number(process.env.R2_MAX_MAP_IMAGE_BYTES ?? 10 * 1024 * 1024)
        : Number(process.env.R2_MAX_IMAGE_BYTES ?? 5 * 1024 * 1024);

    if (body.byteLength > maxBytes) {
      throw new BadRequestException('이미지 파일이 너무 큽니다.');
    }

    const { storageKey, publicUrl } = await this.putR2Object({
      body,
      contentType: dto.contentType,
      fileName: dto.fileName,
      keyPrefix: `scenarios/${scenarioId}/assets/${dto.kind.toLowerCase()}`,
    });

    let asset;
    try {
      asset = await this.prisma.scenarioAsset.create({
        data: {
          scenarioId,
          kind: this.toPrismaScenarioAssetKind(dto.kind),
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
      this.rethrowScenarioAssetStorageError(error);
    }

    return this.mapScenarioAsset(asset);
  }

  private async clearScenarioAssetReferences(
    tx: Prisma.TransactionClient,
    scenarioId: string,
    assetKind: PrismaScenarioAssetKind,
    publicUrl: string
  ): Promise<void> {
    const nodes = await tx.scenarioNode.findMany({
      where: { scenarioId },
      select: {
        id: true,
        imageUrl: true,
        checkOptionsJson: true,
      },
    });

    const nextUpdatedAt = new Date().toISOString();

    await Promise.all(
      nodes.map(async (node) => {
        let nextImageUrl = node.imageUrl;
        let nextConfig = this.parseScenarioNodeConfigForMutation(node.checkOptionsJson);
        let changed = false;

        if (assetKind === PrismaScenarioAssetKind.SCENE && node.imageUrl === publicUrl) {
          nextImageUrl = null;
          changed = true;
        }

        if (
          assetKind === PrismaScenarioAssetKind.MAP &&
          nextConfig.vttMap &&
          nextConfig.vttMap.imageUrl === publicUrl
        ) {
          nextConfig = {
            ...nextConfig,
            vttMap: {
              ...nextConfig.vttMap,
              imageUrl: null,
              updatedAt: nextUpdatedAt,
            },
          };
          changed = true;
        }

        if (assetKind === PrismaScenarioAssetKind.TOKEN && nextConfig.vttMap) {
          const currentTokens = Array.isArray(nextConfig.vttMap.tokens)
            ? nextConfig.vttMap.tokens
            : null;
          if (currentTokens) {
            let tokenChanged = false;
            const nextTokens = currentTokens.map((token) => {
              if (token.imageUrl === publicUrl) {
                tokenChanged = true;
                return {
                  ...token,
                  imageUrl: null,
                };
              }
              return token;
            });

            if (tokenChanged) {
              nextConfig = {
                ...nextConfig,
                vttMap: {
                  ...nextConfig.vttMap,
                  tokens: nextTokens,
                  updatedAt: nextUpdatedAt,
                },
              };
              changed = true;
            }
          }
        }

        if (!changed) {
          return;
        }

        await tx.scenarioNode.update({
          where: { id: node.id },
          data: {
            imageUrl: nextImageUrl,
            checkOptionsJson: JSON.stringify({
              checks: nextConfig.checks,
              vttMap: nextConfig.vttMap,
            }),
          },
        });
      })
    );
  }

  private parseScenarioNodeConfigForMutation(value: string): {
    checks: Record<string, unknown>[];
    vttMap:
      | ({
          imageUrl?: string | null;
          tokens?: Array<Record<string, unknown> & { imageUrl?: string | null }>;
        } & Record<string, unknown>)
      | null;
  } {
    let parsed: unknown = [];

    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }

    if (Array.isArray(parsed)) {
      return {
        checks: parsed.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
        ),
        vttMap: null,
      };
    }

    if (parsed && typeof parsed === 'object') {
      const candidate = parsed as Record<string, unknown>;
      return {
        checks: Array.isArray(candidate.checks)
          ? candidate.checks.filter(
              (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
            )
          : [],
        vttMap:
          candidate.vttMap && typeof candidate.vttMap === 'object'
            ? (candidate.vttMap as {
                imageUrl?: string | null;
                tokens?: Array<Record<string, unknown> & { imageUrl?: string | null }>;
              } & Record<string, unknown>)
            : null,
      };
    }

    return { checks: [], vttMap: null };
  }

  private rethrowScenarioAssetStorageError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      throw new ServiceUnavailableException(
        'Scenario asset storage schema is missing in the current database. Run `npm run prisma:push -w @trpg/be` and restart the backend.'
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
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new BadRequestException('R2 업로드 환경변수가 설정되지 않았습니다.');
    }

    const extension = this.getSafeFileExtension(fileName, contentType);
    const key = `${keyPrefix}/${randomUUID()}${extension}`;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const encodedPath = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'PUT',
      encodedPath,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, 'auto', 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': contentType,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
        },
        body,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown network error';
      throw new BadGatewayException(
        `R2 upload request failed before a response was received. ${detail}`
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
      throw new BadRequestException('R2 삭제 환경변수가 설정되지 않았습니다.');
    }

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url = new URL(`${endpoint}/${bucket}/${storageKey}`);
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update('').digest('hex');
    const encodedPath = `/${bucket}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'DELETE',
      encodedPath,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signingKey = this.getSignatureKey(secretAccessKey, dateStamp, 'auto', 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: authorization,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown network error';
      throw new BadGatewayException(
        `R2 delete request failed before a response was received. ${detail}`
      );
    }

    if (response.ok || response.status === 404) {
      return;
    }

    const message = await response.text();
    throw new BadRequestException(`R2 삭제에 실패했습니다. (${response.status}) ${message}`);
  }

  private formatAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private getSignatureKey(
    secret: string,
    dateStamp: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  private getSafeFileExtension(fileName: string, contentType: string): string {
    const lowered = fileName.toLowerCase();
    const match = lowered.match(/\.(png|jpe?g|webp|gif)$/);
    if (match) {
      return match[0] === '.jpeg' ? '.jpg' : match[0];
    }

    switch (contentType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return '.img';
    }
  }
}
