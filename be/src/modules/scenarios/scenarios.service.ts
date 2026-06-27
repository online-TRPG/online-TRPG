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
  ActionOutcome as PrismaActionOutcome,
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
  ApplyScenarioModerationActionDto,
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioNodeInputDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioSummaryResponseDto,
  PublishScenarioDto,
  ForkScenarioDto,
  AppealScenarioModerationDto,
  ReportScenarioDto,
  ScenarioModerationActionResponseDto,
  ScenarioModerationAppealResponseDto,
  ScenarioModerationQueueItemDto,
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

type ScenarioPublicRatingRecord = {
  userId: string;
  rating: number;
  review: string | null;
  updatedAt: string;
};

type ScenarioPublicModerationReportRecord = {
  reportId: string;
  reportedByUserId: string;
  reason: "copyright" | "private_data" | "license" | "unsafe_content" | "other";
  comment: string | null;
  createdAt: string;
};

type ScenarioPublicModerationAppealRecord = {
  appealId: string;
  appealedByUserId: string;
  message: string;
  createdAt: string;
  status: "submitted" | "under_review" | "accepted" | "rejected";
};

type ScenarioPublicModerationActionRecord = {
  actionId: string;
  operatorUserId: string;
  action: ApplyScenarioModerationActionDto["action"];
  reason: string;
  targetUserId: string | null;
  createdAt: string;
  previousStatus: "visible" | "reported" | "hidden" | "removed";
  nextStatus: "visible" | "reported" | "hidden" | "removed";
  processingStatus?: ScenarioModerationProcessingStatus;
  creatorNoticeStatus?: ScenarioCreatorNoticeStatus;
  auditRecordType?: "scenario_moderation_action";
};

type ScenarioModerationProcessingStatus =
  | "queued"
  | "reviewing"
  | "actioned"
  | "rejected"
  | "restored"
  | "escalated"
  | "removed";

type ScenarioCreatorNoticeStatus =
  | "none"
  | "creator_notified"
  | "creator_action_required";

type ScenarioPublicEcosystemMetadata = {
  tags: string[];
  estimatedMinutes: number | null;
  gmMode: "AI" | "HUMAN" | "BOTH" | null;
  contentWarnings: string[];
  ratings: ScenarioPublicRatingRecord[];
  forkCount: number;
  forkAllowed: boolean;
  rightsDeclaration: {
    confirmed: boolean;
    basis: string | null;
    confirmedByUserId: string | null;
    confirmedAt: string | null;
  };
  moderationStatus: "visible" | "reported" | "hidden" | "removed";
  reports: ScenarioPublicModerationReportRecord[];
  appeals: ScenarioPublicModerationAppealRecord[];
  moderationActions: ScenarioPublicModerationActionRecord[];
  lineage: {
    sourceScenarioId: string | null;
    sourceRevisionId: string | null;
    forkedFromScenarioId: string | null;
    forkedAt: string | null;
    forkedByUserId: string | null;
  };
};

@Injectable()
export class ScenariosService {
  private static readonly REVISION_METADATA_MARKER = "P3_REVISION_META:";
  private static readonly COLLABORATION_METADATA_MARKER = "P4_COLLAB_META:";
  private static readonly MODERATION_REPORT_MARKER = "P4_MODERATION_REPORT:";
  private static readonly PUBLIC_ECOSYSTEM_METADATA_MARKER = "P5_PUBLIC_META:";
  private static readonly PUBLIC_DISCOVERY_SCAN_LIMIT = 500;
  private static readonly PUBLIC_DISCOVERY_MAX_RESULTS = 100;
  private static readonly MODERATION_QUEUE_SCAN_LIMIT = 500;
  private static readonly MODERATION_QUEUE_MAX_RESULTS = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly collaborationPolicy: ScenarioCollaborationPolicyService = new ScenarioCollaborationPolicyService(),
  ) {}

  async listScenarios(query?: ScenarioQueryDto, viewerUserId?: string | null): Promise<ScenarioSummaryResponseDto[]> {
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
      include: {
        creator: {
          include: { profile: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: ScenariosService.PUBLIC_DISCOVERY_SCAN_LIMIT,
    });

    const discovered = scenarios
      .filter((scenario) => {
        if (isProvidedScenarioId(scenario.id)) {
          const publicMetadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
          return publicMetadata.moderationStatus !== "hidden" && publicMetadata.moderationStatus !== "removed";
        }
        const metadata = this.parseScenarioRevisionMetadata(scenario.attribution);
        const publicMetadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
        return (
          scenario.sourceType === PrismaScenarioSourceType.CLONED &&
          metadata.status === "public" &&
          publicMetadata.moderationStatus !== "hidden" &&
          publicMetadata.moderationStatus !== "removed"
        );
      })
      .map((scenario) => this.enrichScenarioSummary(scenario, mapScenarioSummary(scenario), viewerUserId))
      .filter((scenario) => this.matchesScenarioDiscoveryQuery(scenario, query));

    const sorted = this.sortScenarioDiscovery(discovered, query?.sort ?? "recommended");
    const offset = query?.offset ?? 0;
    const limit = Math.min(query?.limit ?? ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS, ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS);
    return sorted.slice(offset, offset + limit);
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
      include: {
        creator: {
          include: { profile: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return scenarios
      .filter((scenario) => {
        if (scenario.sourceType === PrismaScenarioSourceType.CLONED) {
          return false;
        }
        if (scenario.createdByUserId === userId) {
          return true;
        }
        return this.collaborationPolicy.resolvePermission({
          draft: this.buildScenarioPolicyDraft({ ...scenario, nodes: [] }),
          userId,
          action: "view",
        }).allowed;
      })
      .map((scenario) => this.enrichScenarioSummary(scenario, mapScenarioSummary(scenario), userId));
  }

  async getScenario(id: string, viewerUserId?: string | null): Promise<ScenarioResponseDto> {
    const scenario = await this.getScenarioEntityForViewer(id, viewerUserId);
    return this.enrichScenarioSummary(scenario, mapScenario(scenario), viewerUserId);
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
        creator: {
          include: { profile: true },
        },
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
    const visibility = dto.visibility ?? "public";
    const isSharedPublication = visibility === "public" || visibility === "link";
    if (isSharedPublication && dto.rightsConfirmed !== true) {
      throw new BadRequestException(
        "공개/링크 발행 전 직접 창작했거나 공개·재배포 권한이 있음을 확인해야 합니다.",
      );
    }
    const rightsBasis = this.nullableTrim(dto.rightsBasis);
    if (isSharedPublication && !rightsBasis && draft.license !== PrismaScenarioLicense.ORIGINAL) {
      throw new BadRequestException("외부 라이선스 또는 허가 기반 공개 시나리오는 출처/권리 근거가 필요합니다.");
    }
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
      visibility,
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
        status: visibility,
        validationReport,
      },
    );
    const publicMetadata = this.parseScenarioPublicEcosystemMetadata(attribution);
    const publishedAttribution = this.appendScenarioPublicEcosystemMetadata(attribution, {
      ...publicMetadata,
      forkAllowed: dto.forkAllowed === true,
      rightsDeclaration: {
        confirmed: dto.rightsConfirmed === true,
        basis: rightsBasis,
        confirmedByUserId: dto.rightsConfirmed === true ? userId : null,
        confirmedAt: dto.rightsConfirmed === true ? publishedAt.toISOString() : null,
      },
    });

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
        attribution: publishedAttribution,
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
        creator: {
          include: { profile: true },
        },
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
        creator: {
          include: { profile: true },
        },
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
    const publicMetadata = this.parseScenarioPublicEcosystemMetadata(revision.attribution);
    if (publicMetadata.moderationStatus === "hidden" || publicMetadata.moderationStatus === "removed") {
      throw new ForbiddenException("운영자 검토 중이거나 삭제 처리된 공개 시나리오는 작성자가 공개 취소할 수 없습니다.");
    }
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

  async forkScenario(userId: string, id: string, dto: ForkScenarioDto = {}): Promise<ScenarioResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensurePublicScenarioEcosystemTarget(scenario, "공개 또는 링크 revision만 fork할 수 있습니다.");
    const forkId = `scenario_fork_${randomUUID()}`;
    const now = new Date().toISOString();
    const sourceRevision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const sourceMetadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    if (!sourceMetadata.forkAllowed) {
      throw new BadRequestException("이 공개 시나리오는 작성자가 fork를 허용하지 않았습니다.");
    }
    const nodeIdMap = new Map(scenario.nodes.map((node) => [node.id, `${forkId}_${node.id}`]));
    const attribution = this.appendScenarioPublicEcosystemMetadata(
      this.stripScenarioMetadataMarkers(scenario.attribution),
      {
        ...this.getDefaultScenarioPublicEcosystemMetadata(),
        lineage: {
          sourceScenarioId: scenario.baseScenarioId ?? scenario.id,
          sourceRevisionId: scenario.id,
          forkedFromScenarioId: scenario.id,
          forkedAt: now,
          forkedByUserId: userId,
        },
      },
    );
    const fork = await this.prisma.scenario.create({
      data: {
        id: forkId,
        title: dto.title?.trim() || `${scenario.title} Fork`,
        description: scenario.description,
        createdByUserId: userId,
        sourceType: PrismaScenarioSourceType.USER,
        baseScenarioId: scenario.id,
        thumbnailUrl: scenario.thumbnailUrl,
        ruleSetId: scenario.ruleSetId,
        difficulty: scenario.difficulty,
        startLevel: scenario.startLevel,
        recommendedEndLevel: scenario.recommendedEndLevel,
        license: scenario.license,
        attribution,
        startNodeId: scenario.startNodeId ? nodeIdMap.get(scenario.startNodeId) ?? scenario.startNodeId : null,
        npcsJson: scenario.npcsJson,
        nodes: {
          create: scenario.nodes.map((node) => ({
            id: nodeIdMap.get(node.id) ?? `${forkId}_${node.id}`,
            nodeType: node.nodeType,
            title: node.title,
            sceneText: node.sceneText,
            imageUrl: node.imageUrl,
            checkOptionsJson: this.rewriteScenarioJsonNodeReferences(node.checkOptionsJson, nodeIdMap),
            transitionsJson: this.rewriteScenarioNodeReferences(node.transitionsJson, nodeIdMap),
            cluesJson: this.rewriteScenarioJsonNodeReferences(node.cluesJson, nodeIdMap),
            nodeMetaJson: node.nodeMetaJson
              ? this.rewriteScenarioJsonNodeReferences(node.nodeMetaJson, nodeIdMap)
              : null,
            fallbackNodeId: node.fallbackNodeId ? nodeIdMap.get(node.fallbackNodeId) ?? node.fallbackNodeId : null,
          })),
        },
      },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: this.appendScenarioPublicEcosystemMetadata(scenario.attribution, {
          ...sourceMetadata,
          forkCount: sourceMetadata.forkCount + 1,
        }),
      },
    });

    return {
      ...this.enrichScenarioSummary(fork, mapScenario(fork)),
      changelog: sourceRevision.changelog,
    };
  }

  async reportScenario(
    userId: string,
    id: string,
    dto: ReportScenarioDto,
  ): Promise<ScenarioModerationReportResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    this.ensurePublicScenarioEcosystemTarget(scenario, "발행된 scenario revision만 신고할 수 있습니다.");
    const reportId = `scenario-report:${randomUUID()}`;
    const report = {
      reportId,
      reportedByUserId: userId,
      reason: dto.reason,
      comment: dto.comment?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const nextReports = [
      ...metadata.reports.filter((entry) => entry.reportedByUserId !== userId),
      report,
    ];
    const moderationStatus = nextReports.length >= 3 ? "hidden" : "reported";
    const moderationEntry = JSON.stringify(report);
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: this.appendScenarioPublicEcosystemMetadata(
          `${scenario.attribution ?? ""}\nP4_MODERATION_REPORT:${moderationEntry}`.trim(),
          {
            ...metadata,
            reports: nextReports,
            moderationStatus,
          },
        ),
      },
    });
    return { reportId, scenarioId: scenario.id, status: "received" };
  }

  async appealScenarioModeration(
    userId: string,
    id: string,
    dto: AppealScenarioModerationDto,
  ): Promise<ScenarioModerationAppealResponseDto> {
    const scenario = await this.getScenarioEntityById(id);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (revision.status === "public" || revision.status === "link");
    if (!isPublishedRevision && !isProvidedScenarioId(scenario.id)) {
      throw new BadRequestException("발행된 scenario revision에만 이의 제기를 남길 수 있습니다.");
    }
    if (!scenario.createdByUserId || scenario.createdByUserId !== userId) {
      throw new ForbiddenException("시나리오 owner만 moderation 이의 제기를 남길 수 있습니다.");
    }
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    if (metadata.moderationStatus === "visible") {
      throw new BadRequestException("신고 또는 비공개 상태가 아닌 시나리오에는 이의 제기가 필요하지 않습니다.");
    }
    const appeal: ScenarioPublicModerationAppealRecord = {
      appealId: `scenario-appeal:${randomUUID()}`,
      appealedByUserId: userId,
      message: dto.message.trim(),
      createdAt: new Date().toISOString(),
      status: "submitted",
    };
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: this.appendScenarioPublicEcosystemMetadata(scenario.attribution, {
          ...metadata,
          appeals: [
            ...metadata.appeals.filter((entry) => entry.appealedByUserId !== userId),
            appeal,
          ],
        }),
      },
    });
    return { appealId: appeal.appealId, scenarioId: scenario.id, status: "submitted" };
  }

  async listScenarioModerationQueue(
    operatorUserId: string,
  ): Promise<ScenarioModerationQueueItemDto[]> {
    this.ensureScenarioModerationOperator(operatorUserId);
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        OR: [
          { sourceType: PrismaScenarioSourceType.CLONED },
          { id: { in: PROVIDED_SCENARIO_IDS } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: ScenariosService.MODERATION_QUEUE_SCAN_LIMIT,
    });

    return scenarios
      .map((scenario) => this.mapScenarioModerationQueueItem(scenario))
      .filter(
        (item) =>
          item.reportCount > 0 ||
          item.appealCount > 0 ||
          item.moderationStatus !== "visible",
      )
      .slice(0, ScenariosService.MODERATION_QUEUE_MAX_RESULTS);
  }

  async applyScenarioModerationAction(
    operatorUserId: string,
    id: string,
    dto: ApplyScenarioModerationActionDto,
  ): Promise<ScenarioModerationActionResponseDto> {
    this.ensureScenarioModerationOperator(operatorUserId);
    const scenario = await this.getScenarioEntityById(id);
    this.ensurePublicScenarioEcosystemTarget(
      scenario,
      "공개 생태계 대상만 moderation 처리할 수 있습니다.",
      { allowHidden: true },
    );
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const previousStatus = metadata.moderationStatus;
    const now = new Date().toISOString();
    const actionId = `scenario-moderation-action:${randomUUID()}`;
    const action = dto.action;
    const reason = dto.reason.trim();
    const targetUserId = dto.targetUserId?.trim() || null;
    const duplicateAction = this.resolveDuplicateScenarioModerationAction(metadata, {
      operatorUserId,
      action,
      reason,
      targetUserId,
    });
    if (duplicateAction) {
      return {
        actionId: duplicateAction.actionId,
        scenarioId: scenario.id,
        action: duplicateAction.action,
        moderationStatus: duplicateAction.nextStatus,
        processingStatus:
          duplicateAction.processingStatus ??
          this.resolveScenarioModerationProcessingStatus(metadata),
        creatorNoticeStatus:
          duplicateAction.creatorNoticeStatus ??
          this.resolveScenarioCreatorNoticeStatus(metadata),
      };
    }
    const nextStatus = this.resolveScenarioModerationStatusAfterAction(action, previousStatus);
    const nextAppeals = metadata.appeals.map((appeal) => {
      if (
        action === "restored" &&
        (appeal.status === "submitted" || appeal.status === "under_review")
      ) {
        return { ...appeal, status: "accepted" as const };
      }
      if (
        action === "hidden" &&
        (appeal.status === "submitted" || appeal.status === "under_review")
      ) {
        return { ...appeal, status: "rejected" as const };
      }
      if (
        action === "removed" &&
        (appeal.status === "submitted" || appeal.status === "under_review")
      ) {
        return { ...appeal, status: "rejected" as const };
      }
      if (action === "escalated" && appeal.status === "submitted") {
        return { ...appeal, status: "under_review" as const };
      }
      return appeal;
    });
    const nextMetadataForStatus = {
      ...metadata,
      appeals: nextAppeals,
      moderationStatus: nextStatus,
    };
    const moderationAction: ScenarioPublicModerationActionRecord = {
      actionId,
      operatorUserId,
      action,
      reason,
      targetUserId,
      createdAt: now,
      previousStatus,
      nextStatus,
      processingStatus: this.resolveScenarioModerationProcessingStatus({
        ...nextMetadataForStatus,
        moderationActions: [
          ...metadata.moderationActions,
          {
            actionId,
            operatorUserId,
            action,
            reason,
            targetUserId,
            createdAt: now,
            previousStatus,
            nextStatus,
          },
        ],
      }),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus({
        ...nextMetadataForStatus,
        moderationActions: [
          ...metadata.moderationActions,
          {
            actionId,
            operatorUserId,
            action,
            reason,
            targetUserId,
            createdAt: now,
            previousStatus,
            nextStatus,
          },
        ],
      }),
      auditRecordType: "scenario_moderation_action",
    };

    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: this.appendScenarioPublicEcosystemMetadata(scenario.attribution, {
          ...metadata,
          appeals: nextAppeals,
          moderationStatus: nextStatus,
          moderationActions: [...metadata.moderationActions, moderationAction],
        }),
      },
    });
    await this.createScenarioModerationTurnLogsForLinkedSessions(scenario.id, moderationAction);

    return {
      actionId,
      scenarioId: scenario.id,
      action,
      moderationStatus: nextStatus,
      processingStatus: this.resolveScenarioModerationProcessingStatus({
        ...metadata,
        appeals: nextAppeals,
        moderationStatus: nextStatus,
        moderationActions: [...metadata.moderationActions, moderationAction],
      }),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus({
        ...metadata,
        appeals: nextAppeals,
        moderationStatus: nextStatus,
        moderationActions: [...metadata.moderationActions, moderationAction],
      }),
    };
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

  private ensurePublicScenarioEcosystemTarget(
    scenario: Awaited<ReturnType<ScenariosService['getScenarioEntityById']>>,
    message: string,
    options: { allowHidden?: boolean } = {},
  ): void {
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const isProvidedPublicScenario = isProvidedScenarioId(scenario.id);
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (revision.status === "public" || revision.status === "link");
    if (
      (!isProvidedPublicScenario && !isPublishedRevision) ||
      metadata.moderationStatus === "removed" ||
      (!options.allowHidden && metadata.moderationStatus === "hidden")
    ) {
      throw new BadRequestException(message);
    }
  }

  private enrichScenarioSummary<T extends ScenarioSummaryResponseDto>(
    scenario: {
      id: string;
      attribution: string | null;
      difficulty: string | null;
      startLevel: number;
      recommendedEndLevel: number | null;
      sourceType: PrismaScenarioSourceType;
      baseScenarioId: string | null;
      createdByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    summary: T,
    viewerUserId?: string | null,
  ): T {
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (revision.status === "public" || revision.status === "link");
    const isPublicEcosystemScenario = isProvidedScenarioId(scenario.id) || isPublishedRevision;
    const isOwner = Boolean(viewerUserId && scenario.createdByUserId === viewerUserId);
    const isVisibleToPublicActions =
      metadata.moderationStatus !== "hidden" && metadata.moderationStatus !== "removed";
    const tags = metadata.tags.length
      ? metadata.tags
      : [scenario.difficulty, summary.sourceType === "SYSTEM" ? "provided" : null]
          .filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
          .map((tag) => tag.trim());
    return {
      ...summary,
      tags,
      estimatedMinutes: metadata.estimatedMinutes,
      gmMode: metadata.gmMode,
      contentWarnings: metadata.contentWarnings,
      forkCount: metadata.forkCount,
      forkAllowed: metadata.forkAllowed,
      moderationStatus: metadata.moderationStatus,
      moderationProcessingStatus: this.resolveScenarioModerationProcessingStatus(metadata),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus(metadata),
      recommendationReason: this.buildRecommendationReason(summary, {
        forkCount: metadata.forkCount,
        tags,
      }),
      viewerCapabilities: {
        canUnpublish: isPublishedRevision && isOwner && isVisibleToPublicActions,
        canFork: isPublicEcosystemScenario && metadata.forkAllowed && isVisibleToPublicActions,
        canReport: isPublicEcosystemScenario && isVisibleToPublicActions,
        canAppealModeration: isPublishedRevision && isOwner && metadata.moderationStatus !== "visible",
      },
    };
  }

  private matchesScenarioDiscoveryQuery(
    scenario: ScenarioSummaryResponseDto,
    query?: ScenarioQueryDto,
  ): boolean {
    if (!query) {
      return true;
    }
    const minLevel = query.minLevel;
    const maxLevel = query.maxLevel;
    if (typeof minLevel === "number" && (scenario.recommendedEndLevel ?? scenario.startLevel) < minLevel) {
      return false;
    }
    if (typeof maxLevel === "number" && scenario.startLevel > maxLevel) {
      return false;
    }
    if (query.tag?.trim()) {
      const tag = query.tag.trim().toLowerCase();
      if (!(scenario.tags ?? []).some((candidate) => candidate.toLowerCase() === tag)) {
        return false;
      }
    }
    if (query.gmMode && scenario.gmMode && scenario.gmMode !== "BOTH" && scenario.gmMode !== query.gmMode) {
      return false;
    }
    return true;
  }

  private sortScenarioDiscovery(
    scenarios: ScenarioSummaryResponseDto[],
    sort: "recommended" | "latest" | "level",
  ): ScenarioSummaryResponseDto[] {
    const score = (scenario: ScenarioSummaryResponseDto) =>
      (scenario.forkCount ?? 0) * 2 +
      (scenario.publishStatus === "public" ? 10 : 0);
    return [...scenarios].sort((a, b) => {
      if (sort === "latest") {
        return new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime();
      }
      if (sort === "level") {
        return a.startLevel - b.startLevel || (a.recommendedEndLevel ?? a.startLevel) - (b.recommendedEndLevel ?? b.startLevel);
      }
      return score(b) - score(a) || new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime();
    });
  }

  private buildRecommendationReason(
    scenario: ScenarioSummaryResponseDto,
    evidence: { forkCount: number; tags: string[] },
  ): string | null {
    const reasons = [
      evidence.forkCount ? `${evidence.forkCount}회 fork` : null,
      evidence.tags[0] ? `태그 ${evidence.tags[0]}` : null,
      scenario.startLevel ? `${scenario.startLevel}레벨 시작` : null,
    ].filter((reason): reason is string => Boolean(reason));
    return reasons.length ? reasons.slice(0, 3).join(" · ") : null;
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
      reviewGate: 'optional_collaboration_review';
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
        reviewGate: 'optional_collaboration_review',
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

  private rewriteScenarioNodeReferences(transitionsJson: string, nodeIdMap: Map<string, string>): string {
    const transitions = this.parseJson<Record<string, unknown>[]>(transitionsJson, []);
    return JSON.stringify(
      transitions.map((transition) => {
        const nextNodeId = transition.nextNodeId;
        return typeof nextNodeId === "string" && nodeIdMap.has(nextNodeId)
          ? { ...transition, nextNodeId: nodeIdMap.get(nextNodeId) }
          : transition;
      }),
    );
  }

  private rewriteScenarioJsonNodeReferences(json: string, nodeIdMap: Map<string, string>): string {
    const parsed = this.parseJson<unknown>(json, null);
    if (parsed === null) {
      return json;
    }
    const rewrite = (value: unknown): unknown => {
      if (typeof value === "string") {
        return nodeIdMap.get(value) ?? value;
      }
      if (Array.isArray(value)) {
        return value.map(rewrite);
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, rewrite(entry)]),
        );
      }
      return value;
    };
    return JSON.stringify(rewrite(parsed));
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
      raw.indexOf(ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER),
    ].filter((index) => index >= 0);
    const publicAttribution = markerIndexes.length ? raw.slice(0, Math.min(...markerIndexes)) : raw;
    return publicAttribution.trim() || null;
  }

  private appendScenarioPublicEcosystemMetadata(
    attribution: string | null | undefined,
    metadata: ScenarioPublicEcosystemMetadata,
  ): string | null {
    const raw = attribution ?? "";
    const markerIndex = raw.indexOf(ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER);
    const beforeMarker = markerIndex >= 0 ? raw.slice(0, markerIndex).trim() : raw.trim();
    const encoded = JSON.stringify(metadata);
    return [beforeMarker, `${ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER}${encoded}`]
      .filter((part): part is string => Boolean(part))
      .join("\n");
  }

  private parseScenarioPublicEcosystemMetadata(
    attribution: string | null | undefined,
  ): ScenarioPublicEcosystemMetadata {
    const raw = attribution ?? "";
    const markerIndex = raw.indexOf(ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER);
    if (markerIndex < 0) {
      const reports = this.parseLegacyModerationReports(raw);
      return {
        ...this.getDefaultScenarioPublicEcosystemMetadata(),
        reports,
        moderationStatus: reports.length >= 3 ? "hidden" : reports.length > 0 ? "reported" : "visible",
      };
    }
    const afterMarker = raw.slice(markerIndex + ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER.length);
    const nextMarkers = [
      afterMarker.indexOf(ScenariosService.REVISION_METADATA_MARKER),
      afterMarker.indexOf(ScenariosService.COLLABORATION_METADATA_MARKER),
      afterMarker.indexOf(ScenariosService.MODERATION_REPORT_MARKER),
    ].filter((index) => index >= 0);
    const metadataText = afterMarker.slice(0, nextMarkers.length ? Math.min(...nextMarkers) : undefined).trim();
    try {
      const parsed = JSON.parse(metadataText) as Partial<ScenarioPublicEcosystemMetadata>;
      const fallback = this.getDefaultScenarioPublicEcosystemMetadata();
      const ratings = Array.isArray(parsed.ratings)
        ? parsed.ratings.filter((rating): rating is ScenarioPublicRatingRecord =>
            rating &&
            typeof rating.userId === "string" &&
            typeof rating.rating === "number" &&
            rating.rating >= 1 &&
            rating.rating <= 5 &&
            typeof rating.updatedAt === "string",
          )
        : fallback.ratings;
      const reports = Array.isArray(parsed.reports)
        ? parsed.reports.filter((report): report is ScenarioPublicModerationReportRecord =>
            report &&
            typeof report.reportId === "string" &&
            typeof report.reportedByUserId === "string" &&
            (report.reason === "copyright" ||
              report.reason === "private_data" ||
              report.reason === "license" ||
              report.reason === "unsafe_content" ||
              report.reason === "other") &&
            typeof report.createdAt === "string",
          )
        : this.parseLegacyModerationReports(raw);
      const appeals = Array.isArray(parsed.appeals)
        ? parsed.appeals.filter((appeal): appeal is ScenarioPublicModerationAppealRecord =>
            appeal &&
            typeof appeal.appealId === "string" &&
            typeof appeal.appealedByUserId === "string" &&
            typeof appeal.message === "string" &&
            typeof appeal.createdAt === "string" &&
            (appeal.status === "submitted" ||
              appeal.status === "under_review" ||
              appeal.status === "accepted" ||
              appeal.status === "rejected"),
          )
        : fallback.appeals;
      const moderationActions = Array.isArray(parsed.moderationActions)
        ? parsed.moderationActions.filter((action): action is ScenarioPublicModerationActionRecord =>
            action &&
            typeof action.actionId === "string" &&
            typeof action.operatorUserId === "string" &&
            (action.action === "hidden" ||
              action.action === "restored" ||
              action.action === "warning" ||
              action.action === "creator_note_required" ||
              action.action === "escalated" ||
              action.action === "removed") &&
            typeof action.reason === "string" &&
            typeof action.createdAt === "string" &&
            (action.previousStatus === "visible" ||
              action.previousStatus === "reported" ||
              action.previousStatus === "hidden" ||
              action.previousStatus === "removed") &&
            (action.nextStatus === "visible" ||
              action.nextStatus === "reported" ||
              action.nextStatus === "hidden" ||
              action.nextStatus === "removed"),
          )
          .map((action) => ({
            ...action,
            targetUserId: typeof action.targetUserId === "string" ? action.targetUserId : null,
            processingStatus:
              action.processingStatus === "queued" ||
              action.processingStatus === "reviewing" ||
              action.processingStatus === "actioned" ||
              action.processingStatus === "rejected" ||
              action.processingStatus === "restored" ||
              action.processingStatus === "escalated" ||
              action.processingStatus === "removed"
                ? action.processingStatus
                : undefined,
            creatorNoticeStatus:
              action.creatorNoticeStatus === "none" ||
              action.creatorNoticeStatus === "creator_notified" ||
              action.creatorNoticeStatus === "creator_action_required"
                ? action.creatorNoticeStatus
                : undefined,
            auditRecordType:
              action.auditRecordType === "scenario_moderation_action"
                ? action.auditRecordType
                : undefined,
          }))
        : fallback.moderationActions;
      return {
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim())
          : fallback.tags,
        estimatedMinutes:
          typeof parsed.estimatedMinutes === "number" && parsed.estimatedMinutes > 0
            ? Math.round(parsed.estimatedMinutes)
            : fallback.estimatedMinutes,
        gmMode:
          parsed.gmMode === "AI" || parsed.gmMode === "HUMAN" || parsed.gmMode === "BOTH"
            ? parsed.gmMode
            : fallback.gmMode,
        contentWarnings: Array.isArray(parsed.contentWarnings)
          ? parsed.contentWarnings
              .filter((warning): warning is string => typeof warning === "string" && Boolean(warning.trim()))
              .map((warning) => warning.trim())
          : fallback.contentWarnings,
        ratings,
        forkCount:
          typeof parsed.forkCount === "number" && parsed.forkCount >= 0
            ? Math.floor(parsed.forkCount)
            : fallback.forkCount,
        forkAllowed:
          typeof parsed.forkAllowed === "boolean"
            ? parsed.forkAllowed
            : fallback.forkAllowed,
        rightsDeclaration:
          parsed.rightsDeclaration &&
          typeof parsed.rightsDeclaration === "object" &&
          !Array.isArray(parsed.rightsDeclaration)
            ? {
                confirmed: parsed.rightsDeclaration.confirmed === true,
                basis:
                  typeof parsed.rightsDeclaration.basis === "string"
                    ? parsed.rightsDeclaration.basis
                    : null,
                confirmedByUserId:
                  typeof parsed.rightsDeclaration.confirmedByUserId === "string"
                    ? parsed.rightsDeclaration.confirmedByUserId
                    : null,
                confirmedAt:
                  typeof parsed.rightsDeclaration.confirmedAt === "string"
                    ? parsed.rightsDeclaration.confirmedAt
                    : null,
              }
            : fallback.rightsDeclaration,
        moderationStatus:
          parsed.moderationStatus === "hidden" ||
          parsed.moderationStatus === "removed" ||
          parsed.moderationStatus === "reported" ||
          parsed.moderationStatus === "visible"
            ? parsed.moderationStatus
            : reports.length >= 3
              ? "hidden"
              : reports.length > 0
                ? "reported"
                : "visible",
        reports,
        appeals,
        moderationActions,
        lineage:
          parsed.lineage && typeof parsed.lineage === "object" && !Array.isArray(parsed.lineage)
            ? {
                sourceScenarioId:
                  typeof parsed.lineage.sourceScenarioId === "string" ? parsed.lineage.sourceScenarioId : null,
                sourceRevisionId:
                  typeof parsed.lineage.sourceRevisionId === "string" ? parsed.lineage.sourceRevisionId : null,
                forkedFromScenarioId:
                  typeof parsed.lineage.forkedFromScenarioId === "string" ? parsed.lineage.forkedFromScenarioId : null,
                forkedAt: typeof parsed.lineage.forkedAt === "string" ? parsed.lineage.forkedAt : null,
                forkedByUserId:
                  typeof parsed.lineage.forkedByUserId === "string" ? parsed.lineage.forkedByUserId : null,
              }
            : fallback.lineage,
      };
    } catch {
      return this.getDefaultScenarioPublicEcosystemMetadata();
    }
  }

  private getDefaultScenarioPublicEcosystemMetadata(): ScenarioPublicEcosystemMetadata {
    return {
      tags: [],
      estimatedMinutes: null,
      gmMode: null,
      contentWarnings: [],
      ratings: [],
      forkCount: 0,
      forkAllowed: true,
      rightsDeclaration: {
        confirmed: false,
        basis: null,
        confirmedByUserId: null,
        confirmedAt: null,
      },
      moderationStatus: "visible",
      reports: [],
      appeals: [],
      moderationActions: [],
      lineage: {
        sourceScenarioId: null,
        sourceRevisionId: null,
        forkedFromScenarioId: null,
        forkedAt: null,
        forkedByUserId: null,
      },
    };
  }

  private ensureScenarioModerationOperator(userId: string): void {
    const normalized = userId.trim().toLowerCase();
    if (
      normalized.startsWith("operator-") ||
      normalized.startsWith("admin-") ||
      normalized.startsWith("moderator-")
    ) {
      return;
    }
    throw new ForbiddenException("운영자 moderation 권한이 필요합니다.");
  }

  private mapScenarioModerationQueueItem(scenario: {
    id: string;
    title: string;
    createdByUserId: string | null;
    attribution?: string | null;
  }): ScenarioModerationQueueItemDto {
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      createdByUserId: scenario.createdByUserId,
      moderationStatus: metadata.moderationStatus,
      processingStatus: this.resolveScenarioModerationProcessingStatus(metadata),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus(metadata),
      reportCount: metadata.reports.length,
      appealCount: metadata.appeals.filter((appeal) =>
        appeal.status === "submitted" || appeal.status === "under_review",
      ).length,
      actionCount: metadata.moderationActions.length,
      reports: metadata.reports.map((report) => ({ ...report })),
      appeals: metadata.appeals.map((appeal) => ({ ...appeal })),
      actions: metadata.moderationActions.map((action) => ({ ...action })),
    };
  }

  private resolveScenarioModerationStatusAfterAction(
    action: ApplyScenarioModerationActionDto["action"],
    previousStatus: ScenarioPublicEcosystemMetadata["moderationStatus"],
  ): ScenarioPublicEcosystemMetadata["moderationStatus"] {
    if (action === "removed") {
      return "removed";
    }
    if (action === "hidden") {
      return "hidden";
    }
    if (action === "restored") {
      return "visible";
    }
    if (action === "warning" || action === "creator_note_required") {
      return previousStatus === "hidden" ? "hidden" : "reported";
    }
    if (action === "escalated") {
      return previousStatus === "hidden" ? "hidden" : "reported";
    }
    return previousStatus;
  }

  private resolveDuplicateScenarioModerationAction(
    metadata: ScenarioPublicEcosystemMetadata,
    params: {
      operatorUserId: string;
      action: ApplyScenarioModerationActionDto["action"];
      reason: string;
      targetUserId: string | null;
    },
  ): ScenarioPublicModerationActionRecord | null {
    const latestAction = metadata.moderationActions[metadata.moderationActions.length - 1];
    if (
      latestAction &&
      latestAction.operatorUserId === params.operatorUserId &&
      latestAction.action === params.action &&
      latestAction.reason === params.reason &&
      latestAction.targetUserId === params.targetUserId
    ) {
      return latestAction;
    }
    return null;
  }

  private async createScenarioModerationTurnLogsForLinkedSessions(
    scenarioId: string,
    action: ScenarioPublicModerationActionRecord,
  ): Promise<void> {
    const sessionScenarios = await this.prisma.sessionScenario.findMany({
      where: {
        scenarioId,
        session: {
          status: {
            notIn: [PrismaSessionStatus.COMPLETED, PrismaSessionStatus.DISBANDED],
          },
        },
      },
      select: {
        id: true,
        sessionId: true,
      },
      take: ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS,
    });

    for (const sessionScenario of sessionScenarios) {
      const latest = await this.prisma.turnLog.findFirst({
        where: { sessionId: sessionScenario.sessionId },
        orderBy: { turnNumber: "desc" },
        select: { turnNumber: true },
      });
      await this.prisma.turnLog.create({
        data: {
          sessionId: sessionScenario.sessionId,
          sessionScenarioId: sessionScenario.id,
          actorUserId: action.operatorUserId,
          turnNumber: (latest?.turnNumber ?? 0) + 1,
          rawInput: `/scenario moderation ${action.action}`,
          structuredActionJson: JSON.stringify({
            type: "p6_scenario_moderation_action",
            auditRecordType: action.auditRecordType,
            actionId: action.actionId,
            scenarioId,
            action: action.action,
            targetUserId: action.targetUserId,
            previousStatus: action.previousStatus,
            nextStatus: action.nextStatus,
            processingStatus: action.processingStatus,
            creatorNoticeStatus: action.creatorNoticeStatus,
          }),
          stateDiffJson: JSON.stringify({
            reason: "p6_scenario_moderation_action",
            diff: {
              scenarioId,
              action: action.action,
              previousStatus: action.previousStatus,
              nextStatus: action.nextStatus,
              existingSessionSnapshotPreserved: true,
            },
          }),
          outcome: PrismaActionOutcome.SUCCESS,
          narration: `운영자 moderation 조치(${action.action})가 기록되었습니다. 기존 세션 snapshot은 유지됩니다.`,
        },
      });
    }
  }

  private resolveScenarioModerationProcessingStatus(
    metadata: ScenarioPublicEcosystemMetadata,
  ): ScenarioModerationProcessingStatus {
    const latestAction = metadata.moderationActions[metadata.moderationActions.length - 1];
    if (latestAction?.action === "escalated") {
      return "escalated";
    }
    if (latestAction?.action === "removed") {
      return "removed";
    }
    if (latestAction?.action === "restored") {
      return "restored";
    }
    if (
      latestAction?.action === "hidden" &&
      metadata.appeals.some((appeal) => appeal.status === "rejected")
    ) {
      return "rejected";
    }
    if (latestAction) {
      return "actioned";
    }
    if (metadata.appeals.some((appeal) => appeal.status === "under_review")) {
      return "reviewing";
    }
    return "queued";
  }

  private resolveScenarioCreatorNoticeStatus(
    metadata: ScenarioPublicEcosystemMetadata,
  ): ScenarioCreatorNoticeStatus {
    const latestAction = metadata.moderationActions[metadata.moderationActions.length - 1];
    if (!latestAction) {
      return "none";
    }
    if (latestAction.action === "creator_note_required") {
      return "creator_action_required";
    }
    return "creator_notified";
  }

  private parseLegacyModerationReports(raw: string): ScenarioPublicModerationReportRecord[] {
    return raw
      .split(ScenariosService.MODERATION_REPORT_MARKER)
      .slice(1)
      .map((chunk) => chunk.split(ScenariosService.REVISION_METADATA_MARKER, 1)[0])
      .map((chunk) => chunk.split(ScenariosService.COLLABORATION_METADATA_MARKER, 1)[0])
      .map((chunk) => chunk.split(ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER, 1)[0])
      .map((chunk) => chunk.trim())
      .map((chunk) => {
        try {
          return JSON.parse(chunk) as ScenarioPublicModerationReportRecord;
        } catch {
          return null;
        }
      })
      .filter((report): report is ScenarioPublicModerationReportRecord =>
        Boolean(report) &&
        typeof report?.reportId === "string" &&
        typeof report?.reportedByUserId === "string" &&
        typeof report?.createdAt === "string",
      );
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
      .split(ScenariosService.PUBLIC_ECOSYSTEM_METADATA_MARKER, 1)[0]
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
