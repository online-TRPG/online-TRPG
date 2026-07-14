import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
  ScenarioCheckOptionDto,
  ScenarioNodeInputDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioNpcDto,
  ScenarioSummaryResponseDto,
  ScenarioTransitionDto,
  ScenarioValidationReportDto,
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
  VttMapStateDto,
  decodeLenientScenarioNodeCheckOptionsConfig,
  decodeLenientScenarioTransitionArray,
  decodeScenarioClueArray,
  decodeScenarioNodeCheckOptionsConfig,
  decodeScenarioNodeMeta,
  decodeScenarioNpcArray,
  decodeScenarioTransitionArray,
  decodeScenarioValidationReport,
  decodeTurnLogStateDiff,
  decodeTurnLogStructuredAction,
  isRecord,
} from '@trpg/shared-types';
import {
  parseJsonOrFallback,
  parseJsonOrThrow,
  parseJsonRecordOrFallback,
  parseUnknownJsonOrFallback,
} from '../../common/utils/json-runtime';
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

type ScenarioNodeMutationVttMap = Record<string, unknown> & {
  imageUrl?: string | null;
  tokens?: Array<Record<string, unknown> & { imageUrl?: string | null }>;
};

type NormalizedScenarioNodeInput = Required<
  Pick<ScenarioNodeInputDto, "nodeType" | "title" | "sceneText">
> &
  Pick<ScenarioNodeInputDto, "id" | "imageUrl" | "fallbackNodeId"> & {
    checkOptions: ScenarioCheckOptionDto[];
    transitions: ScenarioTransitionDto[];
    clues: NonNullable<ScenarioNodeInputDto["clues"]>;
    vttMap: VttMapStateDto | null;
    nodeMeta: NonNullable<ScenarioNodeInputDto["nodeMeta"]> | null;
  };

type ScenarioModerationTurnLogMetrics = {
  linkedSessionScenarioCount: number;
  pageQueryCount: number;
  pageCount: number;
  groupByCount: number;
  createManyCount: number;
  recoveryLookupCount: number;
  retryCount: number;
  createdCount: number;
  deduplicatedCount: number;
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
  private readonly logger = new Logger(ScenariosService.name);
  private scenarioProjectionReadReady = false;
  private scenarioProjectionReadinessCheck: Promise<void> | null = null;
  private static readonly REVISION_METADATA_MARKER = "P3_REVISION_META:";
  private static readonly COLLABORATION_METADATA_MARKER = "P4_COLLAB_META:";
  private static readonly MODERATION_REPORT_MARKER = "P4_MODERATION_REPORT:";
  private static readonly PUBLIC_ECOSYSTEM_METADATA_MARKER = "P5_PUBLIC_META:";
  private static readonly PUBLIC_DISCOVERY_MAX_RESULTS = 100;
  private static readonly MODERATION_QUEUE_MAX_RESULTS = 100;
  private static readonly ACTIVE_MODERATION_APPEAL_STATUSES = new Set([
    "submitted",
    "under_review",
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collaborationPolicy: ScenarioCollaborationPolicyService = new ScenarioCollaborationPolicyService(),
  ) {}

  async listScenarios(query?: ScenarioQueryDto, viewerUserId?: string | null): Promise<ScenarioSummaryResponseDto[]> {
    await this.ensureScenarioProjectionReadReady();
    const viewerCanModerate = await this.isScenarioModerationOperator(viewerUserId);
    const offset = query?.offset ?? 0;
    const limit = Math.min(query?.limit ?? ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS, ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS);
    const publicationFilter: Prisma.ScenarioPublicationWhereInput = {
      visibility: viewerCanModerate ? { in: ["PUBLIC", "LINK", "UNPUBLISHED"] } : "PUBLIC",
      moderationStatus: viewerCanModerate ? undefined : { notIn: ["HIDDEN", "REMOVED"] },
      tags: query?.tag?.trim() ? { has: query.tag.trim().toLowerCase() } : undefined,
      gmMode: query?.gmMode ? { in: [query.gmMode, "BOTH"] } : undefined,
    };
    const orderBy =
      query?.sort === "level"
        ? [{ startLevel: "asc" as const }, { recommendedEndLevel: "asc" as const }, { id: "asc" as const }]
        : query?.sort === "latest"
          ? [{ publication: { publishedAt: "desc" as const } }, { id: "asc" as const }]
          : [
              { publication: { forkCount: "desc" as const } },
              { publication: { publishedAt: "desc" as const } },
              { id: "asc" as const },
            ];
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        OR: [
          { id: { in: PROVIDED_SCENARIO_IDS } },
          {
            sourceType: PrismaScenarioSourceType.CLONED,
          },
        ],
        publication: publicationFilter,
        title: query?.search
          ? {
              contains: query.search,
            }
          : undefined,
        startLevel: query?.maxLevel ? { lte: query.maxLevel } : undefined,
        AND: query?.minLevel
          ? [
              {
                OR: [
                  { recommendedEndLevel: { gte: query.minLevel } },
                  { recommendedEndLevel: null, startLevel: { gte: query.minLevel } },
                ],
              },
            ]
          : undefined,
      },
      include: {
        publication: true,
        creator: {
          include: { profile: true },
        },
      },
      orderBy,
      skip: query?.cursor ? 1 : offset,
      cursor: query?.cursor ? { id: query.cursor } : undefined,
      take: limit,
    });

    return scenarios.map((scenario) =>
      this.enrichScenarioSummary(scenario, mapScenarioSummary(scenario), viewerUserId),
    );
  }

  async listMyScenarios(
    userId: string,
    query?: ScenarioQueryDto
  ): Promise<ScenarioSummaryResponseDto[]> {
    await this.ensureScenarioProjectionReadReady();
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        sourceType: { not: PrismaScenarioSourceType.CLONED },
        OR: [
          { createdByUserId: userId },
          { collaboratorGrants: { some: { userId } } },
        ],
        title: query?.search
          ? {
              contains: query.search,
            }
          : undefined,
      },
      include: {
        publication: true,
        creator: {
          include: { profile: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: query?.cursor ? 1 : (query?.offset ?? 0),
      cursor: query?.cursor ? { id: query.cursor } : undefined,
      take: Math.min(
        query?.limit ?? ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS,
        ScenariosService.PUBLIC_DISCOVERY_MAX_RESULTS,
      ),
    });

    return scenarios.map((scenario) =>
      this.enrichScenarioSummary(scenario, mapScenarioSummary(scenario), userId),
    );
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
    const npcs = this.decodeScenarioNpcsInput(dto.npcs ?? [], "scenario.npcs");
    const startNodeId =
      this.resolveStartNodeId(dto.startNodeId, nodes) ?? nodes[0]?.id ?? `${scenarioId}_start`;
    this.ensureRecommendedPlayerRange(
      dto.recommendedPlayersMin,
      dto.recommendedPlayersMax,
    );
    const attribution = this.nullableTrim(dto.attribution);
    const publicationMetadata = this.resolveScenarioPublicationMetadata(dto, attribution);

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
        attribution,
        startNodeId,
        npcsJson: JSON.stringify(npcs),
        publication: {
          create: this.buildScenarioPublicationProjection(attribution, publicationMetadata),
        },
        nodes: {
          create: nodes.map(({ scenarioId: _scenarioId, ...node }) => node),
        },
      },
      include: {
        publication: true,
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
    this.ensureRecommendedPlayerRange(
      dto.recommendedPlayersMin,
      dto.recommendedPlayersMax,
    );
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
    const nextNpcs = dto.npcs === undefined
      ? null
      : this.decodeScenarioNpcsInput(dto.npcs, "scenario.npcs");
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
    const nextAttribution =
      dto.attribution === undefined
        ? existing.attribution
        : this.nullableTrim(dto.attribution);
    const publicationMetadata = this.resolveScenarioPublicationMetadata(
      dto,
      nextAttribution,
      existing.publication,
    );
    this.ensureRecommendedPlayerRange(
      publicationMetadata.recommendedPlayersMin,
      publicationMetadata.recommendedPlayersMax,
    );

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
          attribution: nextAttribution,
          publication: {
            upsert: {
              create: this.buildScenarioPublicationProjection(
                nextAttribution,
                publicationMetadata,
              ),
              update: this.buildScenarioPublicationProjection(
                nextAttribution,
                publicationMetadata,
              ),
            },
          },
          startNodeId: nextStartNodeId,
          npcsJson: nextNpcs === null ? existing.npcsJson : JSON.stringify(nextNpcs),
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
    this.ensureRecommendedPlayerRange(
      dto.recommendedPlayersMin,
      dto.recommendedPlayersMax,
    );
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
      previousRevision?.nodes.map((node) => this.parseScenarioPolicyNode(node, `${previousRevision.id}_`)),
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
    const publicationMetadata = {
      tags: dto.tags === undefined
        ? draft.publication?.tags ?? publicMetadata.tags
        : this.compactTrimmedStrings(dto.tags).slice(0, 10),
      estimatedMinutes:
        dto.estimatedMinutes === undefined
          ? draft.publication?.estimatedMinutes ?? publicMetadata.estimatedMinutes
          : dto.estimatedMinutes,
      recommendedPlayersMin:
        dto.recommendedPlayersMin === undefined
          ? draft.publication?.recommendedPlayersMin
          : dto.recommendedPlayersMin,
      recommendedPlayersMax:
        dto.recommendedPlayersMax === undefined
          ? draft.publication?.recommendedPlayersMax
          : dto.recommendedPlayersMax,
      gmMode:
        dto.gmMode === undefined
          ? this.normalizeScenarioPublicGmMode(draft.publication?.gmMode) ?? publicMetadata.gmMode
          : dto.gmMode,
    };
    this.ensureRecommendedPlayerRange(
      publicationMetadata.recommendedPlayersMin,
      publicationMetadata.recommendedPlayersMax,
    );
    const publishedAttribution = this.appendScenarioPublicEcosystemMetadata(attribution, {
      ...publicMetadata,
      tags: publicationMetadata.tags,
      estimatedMinutes: publicationMetadata.estimatedMinutes,
      gmMode: publicationMetadata.gmMode,
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
        publication: {
          create: this.buildScenarioPublicationProjection(
            publishedAttribution,
            publicationMetadata,
          ),
        },
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
        publication: true,
        creator: {
          include: { profile: true },
        },
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return this.enrichScenarioSummary(published, mapScenario(published), userId);
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
    const unpublishedAttribution = this.appendScenarioRevisionMetadata(
      metadata.attribution,
      {
        revisionNumber: metadata.revisionNumber,
        changelog: metadata.changelog,
        publishedAt: metadata.publishedAt ?? revision.createdAt.toISOString(),
        publishedByUserId: metadata.publishedByUserId ?? userId,
        status: "unpublished",
        validationReport: metadata.validationReport,
      },
    );
    const updated = await this.prisma.scenario.update({
      where: { id },
      data: {
        attribution: unpublishedAttribution,
        publication: {
          upsert: {
            create: this.buildScenarioPublicationProjection(unpublishedAttribution),
            update: this.buildScenarioPublicationProjection(unpublishedAttribution),
          },
        },
      },
      include: {
        publication: true,
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
    const sourcePublicationMetadata = this.resolveScenarioPublicationMetadata(
      {},
      scenario.attribution,
      scenario.publication,
    );
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
        publication: {
          create: this.buildScenarioPublicationProjection(
            attribution,
            sourcePublicationMetadata,
          ),
        },
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
        publication: true,
        nodes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const sourceAttribution = this.appendScenarioPublicEcosystemMetadata(scenario.attribution, {
      ...sourceMetadata,
      forkCount: sourceMetadata.forkCount + 1,
    });
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: sourceAttribution,
        publication: {
          upsert: {
            create: this.buildScenarioPublicationProjection(
              sourceAttribution,
              sourcePublicationMetadata,
            ),
            update: this.buildScenarioPublicationProjection(
              sourceAttribution,
              sourcePublicationMetadata,
            ),
          },
        },
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
    const nextAttribution = this.appendScenarioPublicEcosystemMetadata(
      `${scenario.attribution ?? ""}\nP4_MODERATION_REPORT:${moderationEntry}`.trim(),
      {
        ...metadata,
        reports: nextReports,
        moderationStatus,
      },
    );
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: nextAttribution,
        publication: {
          upsert: {
            create: this.buildScenarioPublicationProjection(nextAttribution),
            update: this.buildScenarioPublicationProjection(nextAttribution),
          },
        },
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
    const nextAttribution = this.appendScenarioPublicEcosystemMetadata(scenario.attribution, {
      ...metadata,
      appeals: [
        ...metadata.appeals.filter((entry) => entry.appealedByUserId !== userId),
        appeal,
      ],
    });
    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: nextAttribution,
        publication: {
          upsert: {
            create: this.buildScenarioPublicationProjection(nextAttribution),
            update: this.buildScenarioPublicationProjection(nextAttribution),
          },
        },
      },
    });
    return { appealId: appeal.appealId, scenarioId: scenario.id, status: "submitted" };
  }

  async listScenarioModerationQueue(
    operatorUserId: string,
  ): Promise<ScenarioModerationQueueItemDto[]> {
    await this.ensureScenarioModerationOperator(operatorUserId);
    await this.ensureScenarioProjectionReadReady();
    const scenarios = await this.prisma.scenario.findMany({
      where: {
        OR: [
          { id: { in: PROVIDED_SCENARIO_IDS } },
          { sourceType: PrismaScenarioSourceType.CLONED },
        ],
        publication: {
          OR: [
            { reportCount: { gt: 0 } },
            { appealCount: { gt: 0 } },
            { moderationStatus: { not: "VISIBLE" } },
          ],
        },
      },
      orderBy: [
        { publication: { updatedAt: "desc" } },
        { id: "asc" },
      ],
      include: { publication: true },
      take: ScenariosService.MODERATION_QUEUE_MAX_RESULTS,
    });

    return scenarios.map((scenario) => this.mapScenarioModerationQueueItem(scenario));
  }

  async applyScenarioModerationAction(
    operatorUserId: string,
    id: string,
    dto: ApplyScenarioModerationActionDto,
  ): Promise<ScenarioModerationActionResponseDto> {
    await this.ensureScenarioModerationOperator(operatorUserId);
    const scenario = await this.getScenarioEntityById(id);
    this.ensurePublicScenarioEcosystemTarget(
      scenario,
      "공개 생태계 대상만 moderation 처리할 수 있습니다.",
      { allowHidden: true, allowRemoved: true, allowUnpublished: true },
    );
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const projectedStatus = scenario.publication?.moderationStatus.toLowerCase();
    const previousStatus =
      projectedStatus === "visible" ||
      projectedStatus === "reported" ||
      projectedStatus === "hidden" ||
      projectedStatus === "removed"
        ? projectedStatus
        : metadata.moderationStatus;
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
      await this.createScenarioModerationTurnLogsForLinkedSessions(
        scenario.id,
        duplicateAction,
      );
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

    let nextAttribution = scenario.attribution;
    if (
      action === "restored" &&
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      revision.status === "unpublished" &&
      revision.publishedByUserId
    ) {
      nextAttribution = this.appendScenarioRevisionMetadata(nextAttribution, {
        revisionNumber: revision.revisionNumber,
        changelog: revision.changelog,
        publishedAt: revision.publishedAt ?? now,
        publishedByUserId: revision.publishedByUserId,
        status: "public",
        validationReport: revision.validationReport,
      });
    }
    nextAttribution = this.appendScenarioPublicEcosystemMetadata(nextAttribution, {
      ...metadata,
      appeals: nextAppeals,
      moderationStatus: nextStatus,
      moderationActions: [...metadata.moderationActions, moderationAction],
    });

    await this.prisma.scenario.update({
      where: { id: scenario.id },
      data: {
        attribution: nextAttribution,
        publication: {
          upsert: {
            create: this.buildScenarioPublicationProjection(nextAttribution),
            update: this.buildScenarioPublicationProjection(nextAttribution),
          },
        },
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
        publication: true,
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
        publication: true,
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
    const projectionBlocksPublicAccess =
      scenario.publication?.moderationStatus === "HIDDEN" ||
      scenario.publication?.moderationStatus === "REMOVED";
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (scenario.publication
        ? (scenario.publication.visibility === "PUBLIC" ||
            scenario.publication.visibility === "LINK") &&
          !projectionBlocksPublicAccess
        : revision.status === "public" || revision.status === "link");
    const collaborativeViewerUserId =
      typeof viewerUserId === "string" && viewerUserId.length > 0 ? viewerUserId : null;
    const canViewCollaborativeDraft =
      collaborativeViewerUserId !== null &&
      scenario.sourceType !== PrismaScenarioSourceType.CLONED &&
      this.collaborationPolicy.resolvePermission({
        draft: this.buildScenarioPolicyDraft(scenario),
        userId: collaborativeViewerUserId,
        action: "view",
      }).allowed;

    const canViewProvidedScenario =
      isDefaultProvidedScenario && (!scenario.publication || !projectionBlocksPublicAccess);
    if (canViewProvidedScenario || isOwnScenario || isPublishedRevision || canViewCollaborativeDraft) {
      return;
    }

    // 다른 사용자가 만든 시나리오는 존재 여부도 노출하지 않도록 404로 숨깁니다.
    throw new NotFoundException(`Scenario ${scenario.id} was not found.`);
  }

  private ensurePublicScenarioEcosystemTarget(
    scenario: Awaited<ReturnType<ScenariosService['getScenarioEntityById']>>,
    message: string,
    options: { allowHidden?: boolean; allowRemoved?: boolean; allowUnpublished?: boolean } = {},
  ): void {
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const isProvidedPublicScenario = isProvidedScenarioId(scenario.id);
    const projectedVisibility = scenario.publication?.visibility;
    const projectedModerationStatus = scenario.publication?.moderationStatus;
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (projectedVisibility
        ? projectedVisibility === "PUBLIC" ||
          projectedVisibility === "LINK" ||
          (options.allowUnpublished && projectedVisibility === "UNPUBLISHED")
        : revision.status === "public" ||
          revision.status === "link" ||
          (options.allowUnpublished && revision.status === "unpublished"));
    const isRemoved = projectedModerationStatus
      ? projectedModerationStatus === "REMOVED"
      : metadata.moderationStatus === "removed";
    const isHidden = projectedModerationStatus
      ? projectedModerationStatus === "HIDDEN"
      : metadata.moderationStatus === "hidden";
    if (
      (!isProvidedPublicScenario && !isPublishedRevision) ||
      (!options.allowRemoved && isRemoved) ||
      (!options.allowHidden && isHidden)
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
      publication?: {
        visibility: string;
        moderationStatus: string;
        publishedAt: Date | null;
        revisionNumber: number | null;
        forkCount: number;
        gmMode: string | null;
        tags: string[];
        estimatedMinutes: number | null;
        recommendedPlayersMin: number | null;
        recommendedPlayersMax: number | null;
      } | null;
    },
    summary: T,
    viewerUserId?: string | null,
  ): T {
    this.warnOnScenarioPublicationProjectionMismatch(scenario);
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const publishStatus =
      scenario.publication?.visibility === "PUBLIC"
        ? "public"
        : scenario.publication?.visibility === "LINK"
          ? "link"
          : scenario.publication?.visibility === "UNPUBLISHED"
            ? "unpublished"
            : summary.publishStatus;
    const moderationStatus =
      scenario.publication?.moderationStatus === "HIDDEN"
        ? "hidden"
        : scenario.publication?.moderationStatus === "REMOVED"
          ? "removed"
          : scenario.publication?.moderationStatus === "REPORTED"
            ? "reported"
            : scenario.publication?.moderationStatus === "VISIBLE"
              ? "visible"
              : metadata.moderationStatus;
    const isPublishedRevision =
      scenario.sourceType === PrismaScenarioSourceType.CLONED &&
      (publishStatus === "public" || publishStatus === "link");
    const isPublicEcosystemScenario = isProvidedScenarioId(scenario.id) || isPublishedRevision;
    const isOwner = Boolean(viewerUserId && scenario.createdByUserId === viewerUserId);
    const isVisibleToPublicActions =
      moderationStatus !== "hidden" && moderationStatus !== "removed";
    const tags = scenario.publication ? scenario.publication.tags : metadata.tags;
    const forkCount = scenario.publication?.forkCount ?? metadata.forkCount;
    return {
      ...summary,
      revisionNumber: scenario.publication?.revisionNumber ?? summary.revisionNumber,
      publishedAt: scenario.publication?.publishedAt?.toISOString() ?? summary.publishedAt,
      publishStatus,
      tags,
      estimatedMinutes: scenario.publication
        ? scenario.publication.estimatedMinutes
        : metadata.estimatedMinutes,
      recommendedPlayersMin: scenario.publication?.recommendedPlayersMin ?? null,
      recommendedPlayersMax: scenario.publication?.recommendedPlayersMax ?? null,
      gmMode: scenario.publication ? scenario.publication.gmMode : metadata.gmMode,
      contentWarnings: metadata.contentWarnings,
      forkCount,
      forkAllowed: metadata.forkAllowed,
      moderationStatus,
      moderationProcessingStatus: this.resolveScenarioModerationProcessingStatus(metadata),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus(metadata),
      recommendationReason: this.buildRecommendationReason(summary, {
        forkCount,
        tags,
      }),
      viewerCapabilities: {
        canUnpublish: isPublishedRevision && isOwner && isVisibleToPublicActions,
        canFork: isPublicEcosystemScenario && metadata.forkAllowed && isVisibleToPublicActions,
        canReport: isPublicEcosystemScenario && isVisibleToPublicActions,
        canAppealModeration: isPublishedRevision && isOwner && moderationStatus !== "visible",
      },
    };
  }

  private buildRecommendationReason(
    scenario: ScenarioSummaryResponseDto,
    evidence: { forkCount: number; tags: string[] },
  ): string | null {
    const reasons = [
      evidence.forkCount ? `${evidence.forkCount}회 fork` : null,
      evidence.tags[0] ? `태그 ${evidence.tags[0]}` : null,
      scenario.startLevel ? `${scenario.startLevel}레벨 시작` : null,
    ];
    const presentReasons = this.compactStrings(reasons);
    return presentReasons.length ? presentReasons.slice(0, 3).join(" · ") : null;
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
      const transitions = this.parseTransitionRecords(node.transitionsJson);
      return transitions
        .flatMap((transition) =>
          typeof transition.nextNodeId === 'string' ? [transition.nextNodeId] : [],
        )
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
      nodes: scenario.nodes.map((node) => this.parseScenarioPolicyNode(node)),
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
    const transitions = this.parseTransitionRecords(transitionsJson);
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
    const transitions = this.parseTransitionRecords(transitionsJson);
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
    const parsed = this.parseJsonValueOrNull(json);
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
      if (isRecord(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]),
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
    const parsed = this.parseJsonValueOrNull(checkOptionsJson);
    if (!isRecord(parsed)) {
      return checkOptionsJson;
    }

    const vttMap = parsed.vttMap;
    if (!isRecord(vttMap)) {
      return checkOptionsJson;
    }

    const scenarioNodeId = vttMap.scenarioNodeId;
    if (typeof scenarioNodeId !== 'string') {
      return checkOptionsJson;
    }

    const localNodeId = scenarioNodeId.startsWith(`${sourceScenarioId}_`)
      ? scenarioNodeId.slice(sourceScenarioId.length + 1)
      : scenarioNodeId;

    return JSON.stringify({
      ...parsed,
      vttMap: {
        ...vttMap,
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
        collaboratorGrants: {
          deleteMany: {},
          create: collaborators.map((collaborator) => ({
            userId: collaborator.userId,
            role: collaborator.role,
          })),
        },
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
    return this.compactStrings(parts).join("\n") || null;
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
      return parseJsonOrFallback(metadataText, { collaborators: [], reviews: [] }, (value) =>
        this.decodeScenarioCollaborationMetadata(value),
      );
    } catch {
      return { collaborators: [], reviews: [] };
    }
  }

  private decodeScenarioCollaborationMetadata(value: unknown): {
    collaborators: ScenarioCollaborator[];
    reviews: ScenarioReviewRecord[];
  } {
    if (!isRecord(value)) {
      throw new Error("scenario collaboration metadata must be an object.");
    }
    return {
      collaborators: Array.isArray(value.collaborators)
        ? value.collaborators.flatMap((collaborator) => this.decodeScenarioCollaborator(collaborator))
        : [],
      reviews: Array.isArray(value.reviews)
        ? value.reviews.flatMap((review) => this.decodeScenarioReviewRecord(review))
        : [],
    };
  }

  private decodeScenarioCollaborator(value: unknown): ScenarioCollaborator[] {
    if (!isRecord(value) || typeof value.userId !== "string") {
      return [];
    }
    if (value.role !== "editor" && value.role !== "reviewer" && value.role !== "viewer") {
      return [];
    }
    return [{ userId: value.userId, role: value.role }];
  }

  private decodeScenarioReviewRecord(value: unknown): ScenarioReviewRecord[] {
    if (
      !isRecord(value) ||
      typeof value.reviewId !== "string" ||
      typeof value.requestedByUserId !== "string" ||
      typeof value.reviewerUserId !== "string" ||
      (value.status !== "none" &&
        value.status !== "requested" &&
        value.status !== "approved" &&
        value.status !== "rejected" &&
        value.status !== "changes_requested")
    ) {
      return [];
    }
    return [{
      reviewId: value.reviewId,
      requestedByUserId: value.requestedByUserId,
      reviewerUserId: value.reviewerUserId,
      status: value.status,
      ...(typeof value.comment === "string" || value.comment === null ? { comment: value.comment } : {}),
      ...(typeof value.decidedAt === "string" || value.decidedAt === null ? { decidedAt: value.decidedAt } : {}),
    }];
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
      .flatMap((part) => this.compactStrings([part]))
      .join("\n");
  }

  private warnOnScenarioPublicationProjectionMismatch(scenario: {
    id: string;
    attribution: string | null;
    publication?: { visibility: string; moderationStatus: string } | null;
  }): void {
    if (!scenario.publication) return;
    const revision = this.parseScenarioRevisionMetadata(scenario.attribution);
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const parsedVisibility =
      isProvidedScenarioId(scenario.id) || revision.status === "public"
        ? "PUBLIC"
        : revision.status === "link"
          ? "LINK"
          : "UNPUBLISHED";
    const parsedModerationStatus = metadata.moderationStatus.toUpperCase();
    if (
      scenario.publication.visibility !== parsedVisibility ||
      scenario.publication.moderationStatus !== parsedModerationStatus
    ) {
      this.logger.warn({
        event: "scenario_publication_projection_mismatch",
        scenarioId: scenario.id,
        projectionVisibility: scenario.publication.visibility,
        parsedVisibility,
        projectionModerationStatus: scenario.publication.moderationStatus,
        parsedModerationStatus,
      });
    }
  }

  private buildScenarioPublicationProjection(
    attribution: string | null | undefined,
    overrides?: {
      tags: string[];
      estimatedMinutes: number | null;
      recommendedPlayersMin?: number | null;
      recommendedPlayersMax?: number | null;
      gmMode: "AI" | "HUMAN" | "BOTH" | null;
    },
  ) {
    const revision = this.parseScenarioRevisionMetadata(attribution);
    const metadata = this.parseScenarioPublicEcosystemMetadata(attribution);
    const visibility =
      revision.status === "public"
        ? "PUBLIC"
        : revision.status === "link"
          ? "LINK"
          : "UNPUBLISHED";
    const moderationStatus = metadata.moderationStatus.toUpperCase();
    const publishedAt = revision.publishedAt
      ? new Date(revision.publishedAt)
      : null;

    return {
      visibility,
      moderationStatus,
      publishedAt:
        publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      revisionNumber: revision.revisionNumber,
      forkCount: metadata.forkCount,
      reportCount: metadata.reports.length,
      appealCount: this.countActiveModerationAppeals(metadata.appeals),
      gmMode: overrides?.gmMode,
      tags: overrides?.tags.map((tag) => tag.toLowerCase()),
      estimatedMinutes: overrides?.estimatedMinutes,
      recommendedPlayersMin: overrides?.recommendedPlayersMin,
      recommendedPlayersMax: overrides?.recommendedPlayersMax,
    };
  }

  private resolveScenarioPublicationMetadata(
    input: {
      tags?: string[];
      estimatedMinutes?: number | null;
      recommendedPlayersMin?: number | null;
      recommendedPlayersMax?: number | null;
      gmMode?: "AI" | "HUMAN" | "BOTH" | null;
    },
    attribution: string | null | undefined,
    existing?: {
      tags: string[];
      estimatedMinutes: number | null;
      recommendedPlayersMin: number | null;
      recommendedPlayersMax: number | null;
      gmMode: string | null;
    } | null,
  ) {
    const legacy = this.parseScenarioPublicEcosystemMetadata(attribution);
    return {
      tags:
        input.tags === undefined
          ? existing?.tags ?? legacy.tags
          : this.compactTrimmedStrings(input.tags).slice(0, 10),
      estimatedMinutes:
        input.estimatedMinutes === undefined
          ? existing?.estimatedMinutes ?? legacy.estimatedMinutes
          : input.estimatedMinutes,
      recommendedPlayersMin:
        input.recommendedPlayersMin === undefined
          ? existing?.recommendedPlayersMin ?? null
          : input.recommendedPlayersMin,
      recommendedPlayersMax:
        input.recommendedPlayersMax === undefined
          ? existing?.recommendedPlayersMax ?? null
          : input.recommendedPlayersMax,
      gmMode:
        input.gmMode === undefined
          ? this.normalizeScenarioPublicGmMode(existing?.gmMode) ?? legacy.gmMode
          : input.gmMode,
    };
  }

  private normalizeScenarioPublicGmMode(
    value: string | null | undefined,
  ): "AI" | "HUMAN" | "BOTH" | null {
    return value === "AI" || value === "HUMAN" || value === "BOTH" ? value : null;
  }

  private ensureRecommendedPlayerRange(
    min: number | null | undefined,
    max: number | null | undefined,
  ): void {
    if (min !== undefined && min !== null && max !== undefined && max !== null && min > max) {
      throw new BadRequestException("권장 최소 인원은 권장 최대 인원보다 클 수 없습니다.");
    }
  }

  private countActiveModerationAppeals(
    appeals: ScenarioPublicModerationAppealRecord[],
  ): number {
    return appeals.filter((appeal) =>
      ScenariosService.ACTIVE_MODERATION_APPEAL_STATUSES.has(appeal.status),
    ).length;
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
      const fallback = this.getDefaultScenarioPublicEcosystemMetadata();
      return parseJsonOrFallback(metadataText, fallback, (value) =>
        this.decodePublicEcosystemMetadata(value, fallback, raw),
      );
    } catch {
      return this.getDefaultScenarioPublicEcosystemMetadata();
    }
  }

  private decodePublicEcosystemMetadata(
    value: unknown,
    fallback: ScenarioPublicEcosystemMetadata,
    rawAttribution: string,
  ): ScenarioPublicEcosystemMetadata {
    if (!isRecord(value)) {
      throw new Error("scenario public ecosystem metadata must be an object.");
    }
    const ratings = Array.isArray(value.ratings)
      ? value.ratings.flatMap((rating) => this.decodePublicRating(rating))
      : fallback.ratings;
    const reports = Array.isArray(value.reports)
      ? value.reports.flatMap((report) => this.decodePublicModerationReport(report))
      : this.parseLegacyModerationReports(rawAttribution);
    const appeals = Array.isArray(value.appeals)
      ? value.appeals.flatMap((appeal) => this.decodePublicModerationAppeal(appeal))
      : fallback.appeals;
    const moderationActions = Array.isArray(value.moderationActions)
      ? value.moderationActions.flatMap((action) => this.decodePublicModerationAction(action))
      : fallback.moderationActions;

    return {
      tags: this.decodeTrimmedStringArray(value.tags, fallback.tags),
      estimatedMinutes: this.decodePositiveRoundedNumber(value.estimatedMinutes, fallback.estimatedMinutes),
      gmMode: this.decodeScenarioPublicGmMode(value.gmMode, fallback.gmMode),
      contentWarnings: this.decodeTrimmedStringArray(value.contentWarnings, fallback.contentWarnings),
      ratings,
      forkCount: this.decodeNonNegativeInteger(value.forkCount, fallback.forkCount),
      forkAllowed: typeof value.forkAllowed === "boolean" ? value.forkAllowed : fallback.forkAllowed,
      rightsDeclaration: this.decodePublicRightsDeclaration(value.rightsDeclaration, fallback.rightsDeclaration),
      moderationStatus: this.decodeScenarioPublicModerationStatus(value.moderationStatus, reports),
      reports,
      appeals,
      moderationActions,
      lineage: this.decodePublicLineage(value.lineage, fallback.lineage),
    };
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

  private async isScenarioModerationOperator(userId?: string | null): Promise<boolean> {
    if (!userId) {
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    });
    return Boolean(user && !user.deletedAt && (user.role === "ADMIN" || user.role === "MODERATOR"));
  }

  private async ensureScenarioModerationOperator(userId: string): Promise<void> {
    if (await this.isScenarioModerationOperator(userId)) {
      return;
    }
    throw new ForbiddenException("운영자 moderation 권한이 필요합니다.");
  }

  private async ensureScenarioProjectionReadReady(): Promise<void> {
    if (this.scenarioProjectionReadReady) return;
    if (!this.scenarioProjectionReadinessCheck) {
      this.scenarioProjectionReadinessCheck = this.checkScenarioProjectionReadiness();
    }
    try {
      await this.scenarioProjectionReadinessCheck;
    } finally {
      if (!this.scenarioProjectionReadReady) {
        this.scenarioProjectionReadinessCheck = null;
      }
    }
  }

  private async checkScenarioProjectionReadiness(): Promise<void> {
    const missingPublicationCount = await this.prisma.scenario.count({
      where: { publication: { is: null } },
    });
    if (missingPublicationCount > 0) {
      this.logger.error({
        event: "scenario_projection_read_blocked",
        missingPublicationCount,
      });
      throw new ServiceUnavailableException(
        "Scenario projection backfill is incomplete. Run the scenario publication backfill before using scenario lists.",
      );
    }
    this.scenarioProjectionReadReady = true;
  }

  private mapScenarioModerationQueueItem(scenario: {
    id: string;
    title: string;
    createdByUserId: string | null;
    attribution?: string | null;
    publication: {
      moderationStatus: string;
      reportCount: number;
      appealCount: number;
    } | null;
  }): ScenarioModerationQueueItemDto {
    const metadata = this.parseScenarioPublicEcosystemMetadata(scenario.attribution);
    const parsedAppealCount = this.countActiveModerationAppeals(metadata.appeals);
    if (
      scenario.publication &&
      (scenario.publication.moderationStatus !== metadata.moderationStatus.toUpperCase() ||
        scenario.publication.reportCount !== metadata.reports.length ||
        scenario.publication.appealCount !== parsedAppealCount)
    ) {
      this.logger.warn({
        event: "scenario_moderation_projection_mismatch",
        scenarioId: scenario.id,
        projectionModerationStatus: scenario.publication.moderationStatus,
        parsedModerationStatus: metadata.moderationStatus.toUpperCase(),
        projectionReportCount: scenario.publication.reportCount,
        parsedReportCount: metadata.reports.length,
        projectionAppealCount: scenario.publication.appealCount,
        parsedAppealCount,
      });
    }
    const projectionStatus = scenario.publication?.moderationStatus.toLowerCase();
    const moderationStatus =
      projectionStatus === "visible" ||
      projectionStatus === "reported" ||
      projectionStatus === "hidden" ||
      projectionStatus === "removed"
        ? projectionStatus
        : "hidden";
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      createdByUserId: scenario.createdByUserId,
      moderationStatus,
      processingStatus: this.resolveScenarioModerationProcessingStatus(metadata),
      creatorNoticeStatus: this.resolveScenarioCreatorNoticeStatus(metadata),
      reportCount: scenario.publication?.reportCount ?? metadata.reports.length,
      appealCount: scenario.publication?.appealCount ?? parsedAppealCount,
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
    const startedAt = performance.now();
    const pageSize = 500;
    let cursorId: string | undefined;
    const metrics: ScenarioModerationTurnLogMetrics = {
      linkedSessionScenarioCount: 0,
      pageQueryCount: 0,
      pageCount: 0,
      groupByCount: 0,
      createManyCount: 0,
      recoveryLookupCount: 0,
      retryCount: 0,
      createdCount: 0,
      deduplicatedCount: 0,
    };

    try {
      while (true) {
        metrics.pageQueryCount += 1;
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
          orderBy: { id: "asc" },
          take: pageSize,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        });
        if (!sessionScenarios.length) {
          break;
        }

        metrics.pageCount += 1;
        metrics.linkedSessionScenarioCount += sessionScenarios.length;
        await this.createScenarioModerationTurnLogPage(scenarioId, action, sessionScenarios, metrics);
        if (sessionScenarios.length < pageSize) {
          break;
        }
        cursorId = sessionScenarios[sessionScenarios.length - 1].id;
      }
      this.logScenarioModerationTurnLogMetrics(scenarioId, action.actionId, startedAt, metrics, "completed");
    } catch (error) {
      this.logScenarioModerationTurnLogMetrics(scenarioId, action.actionId, startedAt, metrics, "failed", error);
      throw error;
    }
  }

  private async createScenarioModerationTurnLogPage(
    scenarioId: string,
    action: ScenarioPublicModerationActionRecord,
    sessionScenarios: Array<{ id: string; sessionId: string }>,
    metrics: ScenarioModerationTurnLogMetrics,
  ): Promise<void> {
    const sessionIds = Array.from(new Set(sessionScenarios.map((entry) => entry.sessionId)));
    metrics.groupByCount += 1;
    const latestTurns = await this.prisma.turnLog.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: sessionIds } },
      _max: { turnNumber: true },
    });
    const nextTurnBySessionId = new Map(
      latestTurns.map((entry) => [entry.sessionId, entry._max.turnNumber ?? 0]),
    );
    const entries = sessionScenarios.map((sessionScenario) => {
      const turnNumber = (nextTurnBySessionId.get(sessionScenario.sessionId) ?? 0) + 1;
      nextTurnBySessionId.set(sessionScenario.sessionId, turnNumber);
      return {
        sessionScenario,
        data: this.buildScenarioModerationTurnLogData(
          scenarioId,
          action,
          sessionScenario,
          turnNumber,
        ),
      };
    });

    metrics.createManyCount += 1;
    const created = await this.prisma.turnLog.createMany({
      data: entries.map((entry) => entry.data),
      skipDuplicates: true,
    });
    metrics.createdCount += created.count;
    if (created.count === entries.length) {
      return;
    }

    const idempotencyKeys = entries.map((entry) => entry.data.idempotencyKey as string);
    metrics.recoveryLookupCount += 1;
    const existing = await this.prisma.turnLog.findMany({
      where: { idempotencyKey: { in: idempotencyKeys } },
      select: { idempotencyKey: true },
    });
    const existingKeys = new Set(existing.map((entry) => entry.idempotencyKey ?? null));
    const missingEntries = entries.filter(
      (entry) => !existingKeys.has(entry.data.idempotencyKey ?? null),
    );
    metrics.deduplicatedCount += entries.length - created.count - missingEntries.length;

    for (const entry of missingEntries) {
      await this.createScenarioModerationTurnLogWithRetry(
        scenarioId,
        action,
        entry.sessionScenario,
        metrics,
      );
    }
  }

  private async createScenarioModerationTurnLogWithRetry(
    scenarioId: string,
    action: ScenarioPublicModerationActionRecord,
    sessionScenario: { id: string; sessionId: string },
    metrics: ScenarioModerationTurnLogMetrics,
  ): Promise<void> {
    const idempotencyKey = this.buildScenarioModerationTurnLogIdempotencyKey(
      action.actionId,
      sessionScenario.id,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.turnLog.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        metrics.deduplicatedCount += 1;
        return;
      }

      const latest = await this.prisma.turnLog.findFirst({
        where: { sessionId: sessionScenario.sessionId },
        orderBy: { turnNumber: "desc" },
        select: { turnNumber: true },
      });
      try {
        await this.prisma.turnLog.create({
          data: this.buildScenarioModerationTurnLogData(
            scenarioId,
            action,
            sessionScenario,
            (latest?.turnNumber ?? 0) + 1,
          ),
        });
        metrics.createdCount += 1;
        return;
      } catch (error) {
        const isUniqueConflict =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (isUniqueConflict) {
          metrics.retryCount += 1;
        }
        if (!isUniqueConflict || attempt === 2) {
          throw error;
        }
      }
    }
  }

  private logScenarioModerationTurnLogMetrics(
    scenarioId: string,
    actionId: string,
    startedAt: number,
    metrics: ScenarioModerationTurnLogMetrics,
    status: "completed" | "failed",
    error?: unknown,
  ): void {
    if (process.env.PERFORMANCE_DIAGNOSTICS !== "1") return;
    const payload = {
      event: "scenario_moderation_turn_logs_built",
      status,
      scenarioId,
      actionId,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      ...metrics,
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    };
    if (status === "failed") {
      this.logger.warn(payload);
      return;
    }
    this.logger.debug(payload);
  }

  private buildScenarioModerationTurnLogData(
    scenarioId: string,
    action: ScenarioPublicModerationActionRecord,
    sessionScenario: { id: string; sessionId: string },
    turnNumber: number,
  ): Prisma.TurnLogCreateManyInput {
    return {
      idempotencyKey: this.buildScenarioModerationTurnLogIdempotencyKey(
        action.actionId,
        sessionScenario.id,
      ),
      sessionId: sessionScenario.sessionId,
      sessionScenarioId: sessionScenario.id,
      actorUserId: action.operatorUserId,
      turnNumber,
      rawInput: `/scenario moderation ${action.action}`,
      structuredActionJson: JSON.stringify(decodeTurnLogStructuredAction({
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
      })),
      stateDiffJson: JSON.stringify(decodeTurnLogStateDiff({
        reason: "p6_scenario_moderation_action",
        diff: {
          scenarioId,
          action: action.action,
          previousStatus: action.previousStatus,
          nextStatus: action.nextStatus,
          existingSessionSnapshotPreserved: true,
        },
      })),
      outcome: PrismaActionOutcome.SUCCESS,
      narration: `운영자 moderation 조치(${action.action})가 기록되었습니다. 기존 세션 snapshot은 유지됩니다.`,
    };
  }

  private buildScenarioModerationTurnLogIdempotencyKey(
    actionId: string,
    sessionScenarioId: string,
  ): string {
    return `${actionId}:${sessionScenarioId}`;
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
          return parseJsonOrFallback(chunk, null, (value) => this.decodeLegacyModerationReport(value));
        } catch {
          return null;
        }
      })
      .flatMap((report) => report ? [report] : []);
  }

  private decodeLegacyModerationReport(value: unknown): ScenarioPublicModerationReportRecord {
    const [report] = this.decodePublicModerationReport(value);
    if (!report) {
      throw new Error("legacy moderation report must include reportId, reportedByUserId, and createdAt.");
    }
    return report;
  }

  private decodePublicModerationReport(value: unknown): ScenarioPublicModerationReportRecord[] {
    if (
      !isRecord(value) ||
      typeof value.reportId !== "string" ||
      typeof value.reportedByUserId !== "string" ||
      typeof value.createdAt !== "string"
    ) {
      return [];
    }
    return [{
      reportId: value.reportId,
      reportedByUserId: value.reportedByUserId,
      reason: this.toScenarioModerationReportReason(value.reason),
      comment: typeof value.comment === "string" ? value.comment : null,
      createdAt: value.createdAt,
    }];
  }

  private decodePublicRating(value: unknown): ScenarioPublicRatingRecord[] {
    if (
      !isRecord(value) ||
      typeof value.userId !== "string" ||
      typeof value.rating !== "number" ||
      value.rating < 1 ||
      value.rating > 5 ||
      typeof value.updatedAt !== "string"
    ) {
      return [];
    }
    return [{
      userId: value.userId,
      rating: value.rating,
      review: typeof value.review === "string" ? value.review : null,
      updatedAt: value.updatedAt,
    }];
  }

  private decodePublicModerationAppeal(value: unknown): ScenarioPublicModerationAppealRecord[] {
    if (
      !isRecord(value) ||
      typeof value.appealId !== "string" ||
      typeof value.appealedByUserId !== "string" ||
      typeof value.message !== "string" ||
      typeof value.createdAt !== "string" ||
      (value.status !== "submitted" &&
        value.status !== "under_review" &&
        value.status !== "accepted" &&
        value.status !== "rejected")
    ) {
      return [];
    }
    return [{
      appealId: value.appealId,
      appealedByUserId: value.appealedByUserId,
      message: value.message,
      createdAt: value.createdAt,
      status: value.status,
    }];
  }

  private decodePublicModerationAction(value: unknown): ScenarioPublicModerationActionRecord[] {
    if (
      !isRecord(value) ||
      typeof value.actionId !== "string" ||
      typeof value.operatorUserId !== "string" ||
      typeof value.reason !== "string" ||
      typeof value.createdAt !== "string"
    ) {
      return [];
    }
    const action = this.toScenarioModerationAction(value.action);
    const previousStatus = this.toScenarioModerationStatus(value.previousStatus);
    const nextStatus = this.toScenarioModerationStatus(value.nextStatus);
    if (!action || !previousStatus || !nextStatus) {
      return [];
    }
    const processingStatus = this.toScenarioModerationProcessingStatus(value.processingStatus);
    const creatorNoticeStatus = this.toScenarioCreatorNoticeStatus(value.creatorNoticeStatus);
    return [{
      actionId: value.actionId,
      operatorUserId: value.operatorUserId,
      action,
      reason: value.reason,
      targetUserId: typeof value.targetUserId === "string" ? value.targetUserId : null,
      createdAt: value.createdAt,
      previousStatus,
      nextStatus,
      ...(processingStatus ? { processingStatus } : {}),
      ...(creatorNoticeStatus ? { creatorNoticeStatus } : {}),
      ...(value.auditRecordType === "scenario_moderation_action"
        ? { auditRecordType: value.auditRecordType }
        : {}),
    }];
  }

  private decodePublicRightsDeclaration(
    value: unknown,
    fallback: ScenarioPublicEcosystemMetadata["rightsDeclaration"],
  ): ScenarioPublicEcosystemMetadata["rightsDeclaration"] {
    if (!isRecord(value)) {
      return fallback;
    }
    return {
      confirmed: value.confirmed === true,
      basis: typeof value.basis === "string" ? value.basis : null,
      confirmedByUserId: typeof value.confirmedByUserId === "string" ? value.confirmedByUserId : null,
      confirmedAt: typeof value.confirmedAt === "string" ? value.confirmedAt : null,
    };
  }

  private decodePublicLineage(
    value: unknown,
    fallback: ScenarioPublicEcosystemMetadata["lineage"],
  ): ScenarioPublicEcosystemMetadata["lineage"] {
    if (!isRecord(value)) {
      return fallback;
    }
    return {
      sourceScenarioId: typeof value.sourceScenarioId === "string" ? value.sourceScenarioId : null,
      sourceRevisionId: typeof value.sourceRevisionId === "string" ? value.sourceRevisionId : null,
      forkedFromScenarioId: typeof value.forkedFromScenarioId === "string" ? value.forkedFromScenarioId : null,
      forkedAt: typeof value.forkedAt === "string" ? value.forkedAt : null,
      forkedByUserId: typeof value.forkedByUserId === "string" ? value.forkedByUserId : null,
    };
  }

  private decodeTrimmedStringArray(value: unknown, fallback: string[]): string[] {
    return Array.isArray(value)
      ? this.compactTrimmedStrings(value)
      : fallback;
  }

  private compactStrings(values: Array<string | null | undefined>): string[] {
    return values.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []);
  }

  private compactTrimmedStrings(values: unknown[]): string[] {
    return values.flatMap((value) => {
      if (typeof value !== "string") {
        return [];
      }
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    });
  }

  private decodePositiveRoundedNumber(value: unknown, fallback: number | null): number | null {
    return typeof value === "number" && value > 0 ? Math.round(value) : fallback;
  }

  private decodeNonNegativeInteger(value: unknown, fallback: number): number {
    return typeof value === "number" && value >= 0 ? Math.floor(value) : fallback;
  }

  private decodeScenarioPublicGmMode(
    value: unknown,
    fallback: ScenarioPublicEcosystemMetadata["gmMode"],
  ): ScenarioPublicEcosystemMetadata["gmMode"] {
    return value === "AI" || value === "HUMAN" || value === "BOTH" ? value : fallback;
  }

  private decodeScenarioPublicModerationStatus(
    value: unknown,
    reports: ScenarioPublicModerationReportRecord[],
  ): ScenarioPublicEcosystemMetadata["moderationStatus"] {
    if (value === "hidden" || value === "removed" || value === "reported" || value === "visible") {
      return value;
    }
    return reports.length >= 3 ? "hidden" : reports.length > 0 ? "reported" : "visible";
  }

  private toScenarioModerationAction(value: unknown): ApplyScenarioModerationActionDto["action"] | null {
    return value === "hidden" ||
      value === "restored" ||
      value === "warning" ||
      value === "creator_note_required" ||
      value === "escalated" ||
      value === "removed"
      ? value
      : null;
  }

  private toScenarioModerationStatus(
    value: unknown,
  ): ScenarioPublicEcosystemMetadata["moderationStatus"] | null {
    return value === "visible" || value === "reported" || value === "hidden" || value === "removed"
      ? value
      : null;
  }

  private toScenarioModerationProcessingStatus(value: unknown): ScenarioModerationProcessingStatus | undefined {
    return value === "queued" ||
      value === "reviewing" ||
      value === "actioned" ||
      value === "rejected" ||
      value === "restored" ||
      value === "escalated" ||
      value === "removed"
      ? value
      : undefined;
  }

  private toScenarioCreatorNoticeStatus(value: unknown): ScenarioCreatorNoticeStatus | undefined {
    return value === "none" ||
      value === "creator_notified" ||
      value === "creator_action_required"
      ? value
      : undefined;
  }

  private toScenarioModerationReportReason(value: unknown): ScenarioPublicModerationReportRecord["reason"] {
    return value === "copyright" ||
      value === "private_data" ||
      value === "license" ||
      value === "unsafe_content" ||
      value === "other"
      ? value
      : "other";
  }

  private appendScenarioRevisionMetadata(
    attribution: string | null | undefined,
    metadata: {
      revisionNumber: number | null;
      changelog: string | null;
      publishedAt: string;
      publishedByUserId: string;
      status: 'public' | 'link' | 'private' | 'unpublished';
      validationReport?: ScenarioValidationReportDto | null;
    },
  ): string | null {
    const publicAttribution = this.stripScenarioMetadataMarkers(attribution);
    const encoded = JSON.stringify(metadata);
    return [publicAttribution, `${ScenariosService.REVISION_METADATA_MARKER}${encoded}`]
      .flatMap((part) => this.compactStrings([part]))
      .join('\n');
  }

  private parseScenarioRevisionMetadata(attribution: string | null | undefined): {
    attribution: string | null;
    revisionNumber: number | null;
    changelog: string | null;
    validationReport: ScenarioValidationReportDto | null;
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
      const metadata = parseJsonOrFallback(metadataText, null, (value) => this.decodeScenarioRevisionMetadata(value));
      if (!metadata) {
        throw new Error("scenario revision metadata is missing.");
      }
      return {
        attribution: publicAttribution,
        revisionNumber: metadata.revisionNumber,
        changelog: metadata.changelog,
        validationReport: this.parseScenarioValidationReportOrNull(metadata.validationReport),
        publishedAt: metadata.publishedAt,
        publishedByUserId: metadata.publishedByUserId,
        status: metadata.status,
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

  private decodeScenarioRevisionMetadata(value: unknown): {
    revisionNumber: number | null;
    changelog: string | null;
    validationReport: unknown;
    publishedAt: string | null;
    publishedByUserId: string | null;
    status: 'draft' | 'public' | 'link' | 'private' | 'unpublished';
  } {
    if (!isRecord(value)) {
      throw new Error("scenario revision metadata must be an object.");
    }
    const status = value.status;
    return {
      revisionNumber:
        typeof value.revisionNumber === 'number' && Number.isInteger(value.revisionNumber)
          ? value.revisionNumber
          : null,
      changelog: typeof value.changelog === 'string' ? value.changelog : null,
      validationReport: value.validationReport,
      publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
      publishedByUserId: typeof value.publishedByUserId === 'string' ? value.publishedByUserId : null,
      status:
        status === 'public' || status === 'link' || status === 'private' || status === 'unpublished'
          ? status
          : 'draft',
    };
  }

  private parseScenarioValidationReportOrNull(value: unknown): ScenarioValidationReportDto | null {
    if (value === undefined || value === null) {
      return null;
    }
    try {
      return decodeScenarioValidationReport(value);
    } catch {
      return null;
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
      const transitions = this.parseTransitionRecords(node.transitionsJson);
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

  private parseJsonValueOrNull(value: string | null | undefined): unknown | null {
    return parseUnknownJsonOrFallback(value, null);
  }

  private parseScenarioNodeCheckOptionsConfig(value: string | null | undefined, nodeId: string | null): unknown {
    return parseJsonOrFallback(value, null, (parsed) => decodeLenientScenarioNodeCheckOptionsConfig(parsed, nodeId));
  }

  private parseScenarioNodeMeta(value: string | null | undefined): unknown {
    return parseJsonOrFallback(value, null, decodeScenarioNodeMeta);
  }

  private parseTransitionRecords(value: string | null | undefined): ScenarioTransitionDto[] {
    return parseJsonOrFallback(value, [], decodeLenientScenarioTransitionArray);
  }

  private parsePolicyTransitions(value: string | null | undefined): Array<{ nextNodeId?: string | null }> {
    return this.parseTransitionRecords(value).map((transition) => ({
      ...transition,
      nextNodeId: typeof transition.nextNodeId === "string" || transition.nextNodeId === null
        ? transition.nextNodeId
        : undefined,
    }));
  }

  private parseScenarioPolicyNode(
    node: {
      id: string;
      nodeType: string;
      title: string;
      sceneText: string;
      checkOptionsJson: string;
      nodeMetaJson: string | null;
      transitionsJson: string;
      fallbackNodeId: string | null;
    },
    idPrefixToStrip = "",
  ): ScenarioPolicyNode {
    const stripId = (value: string | null | undefined): string | null => {
      if (!value) {
        return null;
      }
      return idPrefixToStrip && value.startsWith(idPrefixToStrip)
        ? value.slice(idPrefixToStrip.length)
        : value;
    };
    return {
      id: stripId(node.id) ?? node.id,
      nodeType: node.nodeType,
      title: node.title,
      sceneText: node.sceneText,
      checkOptions: this.parseScenarioNodeCheckOptionsConfig(node.checkOptionsJson, node.id),
      nodeMeta: this.parseScenarioNodeMeta(node.nodeMetaJson),
      transitions: this.parsePolicyTransitions(node.transitionsJson).map((transition) => ({
        ...transition,
        nextNodeId: stripId(transition.nextNodeId),
      })),
      fallbackNodeId: stripId(node.fallbackNodeId),
    };
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
      kind: this.mapScenarioAssetKind(asset.kind),
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

  private mapScenarioAssetKind(kind: PrismaScenarioAssetKind): ScenarioAssetKind {
    switch (kind) {
      case PrismaScenarioAssetKind.MAP:
        return ScenarioAssetKind.MAP;
      case PrismaScenarioAssetKind.SCENE:
        return ScenarioAssetKind.SCENE;
      case PrismaScenarioAssetKind.TOKEN:
        return ScenarioAssetKind.TOKEN;
    }
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

    return source.map((rawNode, index) => {
      const node = this.decodeScenarioNodeInput(rawNode, index, scenarioId);
      const rawId = this.nullableTrim(node.id) ?? `${scenarioId}_node_${index + 1}`;
      const id = usedIds.has(rawId) ? `${rawId}_${randomUUID()}` : rawId;
      usedIds.add(id);

      return {
        id,
        scenarioId,
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: this.nullableTrim(node.imageUrl),
        checkOptionsJson: JSON.stringify({
          checks: node.checkOptions,
          vttMap: node.vttMap,
        }),
        transitionsJson: JSON.stringify(node.transitions),
        cluesJson: JSON.stringify(node.clues),
        nodeMetaJson: JSON.stringify(node.nodeMeta),
        fallbackNodeId: this.nullableTrim(node.fallbackNodeId),
      };
    });
  }

  private decodeScenarioNodeInput(
    value: unknown,
    index: number,
    scenarioId: string,
  ): NormalizedScenarioNodeInput {
    if (!isRecord(value)) {
      throw new BadRequestException(`scenario.nodes[${index}] must be an object.`);
    }

    const id = this.readScenarioOptionalNullableString(value, "id", `scenario.nodes[${index}].id`);
    const fallbackNodeId = this.readScenarioOptionalNullableString(
      value,
      "fallbackNodeId",
      `scenario.nodes[${index}].fallbackNodeId`,
    );
    const nodeType = this.readScenarioNodeType(value.nodeType, `scenario.nodes[${index}].nodeType`);
    const title = this.readScenarioRequiredString(value, "title", `scenario.nodes[${index}].title`, 100);
    const sceneText = this.readScenarioRequiredString(
      value,
      "sceneText",
      `scenario.nodes[${index}].sceneText`,
      4000,
    );
    const imageUrl = this.readScenarioOptionalNullableString(
      value,
      "imageUrl",
      `scenario.nodes[${index}].imageUrl`,
    );
    const nodeIdForMap = id ?? `${scenarioId}_node_${index + 1}`;
    const checkOptionsConfig = this.decodeScenarioBodyField(
      () =>
        decodeScenarioNodeCheckOptionsConfig(
          {
            checks: value.checkOptions ?? [],
            vttMap: value.vttMap ?? null,
          },
          nodeIdForMap,
        ),
      `scenario.nodes[${index}].checkOptions`,
    );
    const transitions = this.decodeScenarioBodyField(
      () => decodeScenarioTransitionArray(value.transitions ?? []),
      `scenario.nodes[${index}].transitions`,
    );
    const clues = this.decodeScenarioBodyField(
      () => decodeScenarioClueArray(value.clues ?? []),
      `scenario.nodes[${index}].clues`,
    );
    const nodeMeta = this.decodeScenarioBodyField(
      () => decodeScenarioNodeMeta(value.nodeMeta ?? null),
      `scenario.nodes[${index}].nodeMeta`,
    );

    return {
      ...(id ? { id } : {}),
      nodeType,
      title,
      sceneText,
      imageUrl,
      checkOptions: checkOptionsConfig.checks,
      transitions,
      clues,
      vttMap: checkOptionsConfig.vttMap,
      nodeMeta,
      fallbackNodeId,
    };
  }

  private decodeScenarioBodyField<T>(decode: () => T, label: string): T {
    try {
      return decode();
    } catch {
      throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
    }
  }

  private readScenarioNodeType(value: unknown, label: string): ScenarioNodeType {
    if (value === undefined || value === null) {
      return ScenarioNodeType.STORY;
    }
    if (
      value === ScenarioNodeType.STORY ||
      value === ScenarioNodeType.EXPLORATION ||
      value === ScenarioNodeType.COMBAT
    ) {
      return value;
    }
    throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
  }

  private readScenarioRequiredString(
    record: Record<string, unknown>,
    key: string,
    label: string,
    maxLength: number,
  ): string {
    const value = record[key];
    if (typeof value !== "string") {
      throw new BadRequestException(`${label} must be a string.`);
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) {
      throw new BadRequestException(`${label} 길이가 올바르지 않습니다.`);
    }
    return trimmed;
  }

  private readScenarioOptionalNullableString(
    record: Record<string, unknown>,
    key: string,
    label: string,
  ): string | null | undefined {
    const value = record[key];
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value !== "string") {
      throw new BadRequestException(`${label} must be a string or null.`);
    }
    return value;
  }

  private decodeScenarioNpcsInput(value: unknown, label: string): ScenarioNpcDto[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${label} must be an array.`);
    }
    const decoded = this.decodeScenarioBodyField(
      () => decodeScenarioNpcArray(value),
      label,
    );
    if (decoded.length !== value.length) {
      throw new BadRequestException(`${label} 항목 형식이 올바르지 않습니다.`);
    }
    return decoded;
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
    checks: ScenarioCheckOptionDto[];
    vttMap: ScenarioNodeMutationVttMap | null;
  } {
    const config = parseJsonOrThrow(
      value,
      { checks: [], vttMap: null },
      decodeScenarioNodeCheckOptionsConfig,
      "scenarioNode.checkOptionsJson",
    );
    return {
      checks: config.checks,
      vttMap: this.toScenarioNodeMutationVttMap(config.vttMap),
    };
  }

  private toScenarioNodeMutationVttMap(value: VttMapStateDto | null): ScenarioNodeMutationVttMap | null {
    if (!value) {
      return null;
    }

    const { imageUrl, tokens, ...rest } = value;
    return {
      ...rest,
      ...(typeof imageUrl === "string" || imageUrl === null ? { imageUrl } : {}),
      ...(Array.isArray(tokens)
        ? {
            tokens: tokens
              .map((token) => {
                const { imageUrl: tokenImageUrl, ...tokenRest } = token;
                return {
                  ...tokenRest,
                  ...(typeof tokenImageUrl === "string" || tokenImageUrl === null ? { imageUrl: tokenImageUrl } : {}),
                };
              }),
          }
        : {}),
    };
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
