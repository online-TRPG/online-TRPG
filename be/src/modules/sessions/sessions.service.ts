import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  CombatStatus as PrismaCombatStatus,
  ConnectionStatus as PrismaConnectionStatus,
  ActionQueueStatus as PrismaActionQueueStatus,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  ActionOutcome as PrismaActionOutcome,
  Prisma,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import {
  ApplyHumanGmCombatConditionDto,
  AdjustHumanGmCombatHpDto,
  AcceptHumanGmAiAssistSuggestionDto,
  CombatEntityType,
  CombatResponseDto,
  CombatStatus,
  ActionOutcome,
  ApplyCampaignCalendarActionDto,
  ApplySessionEconomyActionDto,
  CampaignArchiveResponseDto,
  CharacterTransferResponseDto,
  CharacterVaultItemDto,
  CompleteCampaignDto,
  CreateHumanGmAiAssistSuggestionDto,
  CreateSessionDto,
  CreateVttMapPingDto,
  DiceAdvantageState,
  GameStateResponseDto,
  GrantHumanGmInventoryItemDto,
  RemoveHumanGmInventoryItemDto,
  HumanGmNodeMoveOptionDto,
  HumanGmMessageDto,
  HumanGmAiAssistSuggestionDto,
  ReportHumanGmAiAssistApplicationFailureDto,
  SetHumanGmDifficultyClassDto,
  HumanGmPrivateNoteDto,
  InventoryItemDto,
  JoinSessionDto,
  MainCommandCheckOptionDto,
  MainCommandCheckEffectDto,
  MainCommandStatus,
  MainCommandTargetType,
  MoveSessionTokenDto,
  ParticipantRole,
  ParticipantStatusResponseDto,
  PlayerCheckOptionDto,
  PlayerScenarioClueDto,
  PlayerScenarioNodeDto,
  PlayerVisibleTargetDto,
  PlayerScenarioViewDto,
  RequestCharacterTransferDto,
  RevealSessionContentDto,
  SelectSessionCharacterDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionRevealResponseDto,
  SessionResponseDto,
  ScenarioNodeType,
  SessionSnapshotDto,
  SessionStatus,
  StateDiffResponseDto,
  TurnLogResponseDto,
  UpdateParticipantReadyDto,
  UpdateHumanGmDto,
  UpdateSessionDto,
  UpdateSessionNodeDto,
  UpdateVttMapDto,
  VttMapInteractionDto,
  VttObjectHazardDto,
  VttMapStateDto,
  VTT_CHECK_EFFECT_ACTIONS,
  decodeVttMapState,
  decodeLenientScenarioClueArray,
  decodeStateDiffResponse,
  ScenarioCheckOptionDto,
  decodeTurnLogStateDiff,
  decodeTurnLogStructuredAction,
  isRecord,
  type JsonObject,
} from "@trpg/shared-types";
import {
  mapGameState,
  mapParticipant,
  mapSession,
  mapSessionCharacter,
  mapSessionScenario,
} from "../../common/mappers/domain.mapper";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
  parseJsonRecordOrThrow,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { GmOverrideKind, GmOverrideService } from "../rules/gm-override.service";
import { ConcentrationRuntimeService } from "../rules/concentration-runtime.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { EconomyStateRuntimeService } from "../rules/economy-state-runtime.service";
import { CampaignCalendarRuntimeService } from "../rules/campaign-calendar-runtime.service";
import { ScenariosService } from "../scenarios/scenarios.service";
import { UsersService } from "../users/users.service";
import { getRestApprovalCutoff, getRestApprovalExpiresAt } from "../actions/rest-approval-policy";
import { CampaignArchiveRuntimeService, type P6CharacterTransferRequestFlag } from "./campaign-archive-runtime.service";
import { HumanGmRuntimeService } from "./human-gm-runtime.service";
import { SessionCampaignArchiveAuditService } from "./session-campaign-archive-audit.service";
import { SessionCampaignArchiveBuilderService } from "./session-campaign-archive-builder.service";
import { SessionCampaignArchiveFlagStoreService } from "./session-campaign-archive-flag-store.service";
import { SessionAccessPolicyService } from "./session-access-policy.service";
import { SessionCampaignCalendarActionPolicyService } from "./session-campaign-calendar-action-policy.service";
import { SessionCharacterTransferClonePayloadService } from "./session-character-transfer-clone-payload.service";
import { SessionCharacterTransferRequestStoreService } from "./session-character-transfer-request-store.service";
import { SessionCharacterVaultItemService } from "./session-character-vault-item.service";
import { SessionCharacterSelectionService } from "./session-character-selection.service";
import { SessionCompletionFlagStoreService } from "./session-completion-flag-store.service";
import { SessionDeletePolicyService } from "./session-delete-policy.service";
import { SessionEconomyService } from "./session-economy.service";
import { SessionGmRuntimeParticipantAccessService } from "./session-gm-runtime-participant-access.service";
import { SessionHumanGmAiAssistFailureAuditService } from "./session-human-gm-ai-assist-failure-audit.service";
import { SessionHumanGmAssignmentPolicyService } from "./session-human-gm-assignment-policy.service";
import { SessionHumanGmAiAssistSuggestionStoreService } from "./session-human-gm-ai-assist-suggestion-store.service";
import { SessionHumanGmPrivateNoteStoreService } from "./session-human-gm-private-note-store.service";
import { SessionInventoryService } from "./session-inventory.service";
import { SessionInviteService } from "./session-invite.service";
import { SessionJoinPolicyService } from "./session-join-policy.service";
import { SessionLeaveResolutionService } from "./session-leave-resolution.service";
import { SessionListFilterService } from "./session-list-filter.service";
import { SessionListItemService } from "./session-list-item.service";
import { SessionParticipantStatusService } from "./session-participant-status.service";
import { SessionPublicIdService } from "./session-public-id.service";
import { SessionRevealService, type RecordSessionRevealParams, type RevealableScenarioClue, type RevealPolicyMode } from "./session-reveal.service";
import { SessionVttInteractionPointService } from "./session-vtt-interaction-point.service";
import { SessionVttDefaultMapReaderService } from "./session-vtt-default-map-reader.service";
import { SessionScenarioNodeSnapshotService } from "./session-scenario-node-snapshot.service";
import { SessionScenarioRevisionSnapshotService } from "./session-scenario-revision-snapshot.service";
import { SessionScenarioLinkService } from "./session-scenario-link.service";
import { SessionSettingsService } from "./session-settings.service";
import { SessionSnapshotService } from "./session-snapshot.service";
import { SessionStartNodeService } from "./session-start-node.service";
import { SessionStartPolicyService } from "./session-start-policy.service";
import { SessionUpdatePolicyService } from "./session-update-policy.service";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";
import { SessionVttMapPersistenceService } from "./session-vtt-map-persistence.service";
import { SessionVttMovementFramePublisherService } from "./session-vtt-movement-frame-publisher.service";
import {
  SessionVttCombatMovementSpendService,
  type ActiveCombatForVttMovementSpend,
  type VttCombatMovementSpend,
} from "./session-vtt-combat-movement-spend.service";
import { SessionVttMovementPolicyService } from "./session-vtt-movement-policy.service";
import {
  SessionVttObjectRuntimeService,
  type SessionVttObjectRuntime,
} from "./session-vtt-object-runtime.service";
import { SessionVttPlayerMapUpdateService } from "./session-vtt-player-map-update.service";

export type SessionPageParams = {
  status?: SessionStatus;
  scenarioId?: string;
  ruleSetId?: string;
  role?: ParticipantRole;
  requesterUserId?: string;
  page?: number;
  size?: number;
};

export type SessionPageResult = {
  items: SessionListItemResponseDto[];
  totalElements: number;
};

type HumanGmOverrideLogResult = {
  turnLog: TurnLogResponseDto;
  stateDiff: StateDiffResponseDto | null;
};

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly gmOverrideService = new GmOverrideService();
  private readonly conditionRuntime = new ConditionRuntimeService();
  private readonly concentrationRuntime = new ConcentrationRuntimeService();
  private static readonly CHARACTER_VAULT_MAX_RESULTS = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly scenariosService: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly humanGmRuntime: HumanGmRuntimeService,
    private readonly sessionReveal: SessionRevealService,
    private readonly sessionSnapshot: SessionSnapshotService,
    private readonly sessionVttObjectRuntime: SessionVttObjectRuntimeService,
    private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService,
    private readonly sessionCampaignArchiveAudit: SessionCampaignArchiveAuditService,
    private readonly sessionCampaignArchiveBuilder: SessionCampaignArchiveBuilderService,
    private readonly sessionCampaignArchiveFlagStore: SessionCampaignArchiveFlagStoreService,
    private readonly sessionEconomy: SessionEconomyService,
    private readonly sessionCampaignCalendarActionPolicy: SessionCampaignCalendarActionPolicyService,
    private readonly sessionCharacterTransferClonePayload: SessionCharacterTransferClonePayloadService,
    private readonly sessionCharacterTransferRequestStore: SessionCharacterTransferRequestStoreService,
    private readonly sessionCharacterVaultItem: SessionCharacterVaultItemService,
    private readonly sessionCompletionFlagStore: SessionCompletionFlagStoreService,
    private readonly sessionGmRuntimeParticipantAccess: SessionGmRuntimeParticipantAccessService,
    private readonly sessionHumanGmAiAssistFailureAudit: SessionHumanGmAiAssistFailureAuditService,
    private readonly sessionInventory: SessionInventoryService,
    private readonly sessionParticipantStatus: SessionParticipantStatusService,
    private readonly sessionCharacterSelection: SessionCharacterSelectionService,
    private readonly sessionListItem: SessionListItemService,
    private readonly sessionPublicId: SessionPublicIdService,
    private readonly sessionInvite: SessionInviteService,
    private readonly sessionSettings: SessionSettingsService,
    private readonly sessionStartPolicy: SessionStartPolicyService,
    private readonly sessionUpdatePolicy: SessionUpdatePolicyService,
    private readonly sessionHumanGmAssignmentPolicy: SessionHumanGmAssignmentPolicyService,
    private readonly sessionHumanGmAiAssistSuggestionStore: SessionHumanGmAiAssistSuggestionStoreService,
    private readonly sessionHumanGmPrivateNoteStore: SessionHumanGmPrivateNoteStoreService,
    private readonly sessionDeletePolicy: SessionDeletePolicyService,
    private readonly sessionJoinPolicy: SessionJoinPolicyService,
    private readonly sessionLeaveResolution: SessionLeaveResolutionService,
    private readonly sessionVttInteractionPoint: SessionVttInteractionPointService,
    private readonly sessionVttDefaultMapReader: SessionVttDefaultMapReaderService,
    private readonly sessionStartNode: SessionStartNodeService,
    private readonly sessionAccessPolicy: SessionAccessPolicyService,
    private readonly sessionListFilter: SessionListFilterService,
    private readonly sessionScenarioRevisionSnapshot: SessionScenarioRevisionSnapshotService,
    private readonly sessionScenarioNodeSnapshot: SessionScenarioNodeSnapshotService,
    private readonly sessionScenarioLink: SessionScenarioLinkService,
    private readonly sessionVttMapBootstrap: SessionVttMapBootstrapService,
    private readonly sessionVttMapNormalization: SessionVttMapNormalizationService,
    private readonly sessionVttMapPersistence: SessionVttMapPersistenceService,
    private readonly sessionVttMovementFramePublisher: SessionVttMovementFramePublisherService,
    private readonly sessionVttCombatMovementSpend: SessionVttCombatMovementSpendService,
    private readonly sessionVttMovementPolicy: SessionVttMovementPolicyService,
    private readonly sessionVttPlayerMapUpdate: SessionVttPlayerMapUpdateService,
  ) {}

  createHumanGmRuntime() {
    return {
      prisma: this.prisma,
      realtimeEvents: this.realtimeEvents,
      getHumanGmSessionForOperator: this.getHumanGmSessionForOperator.bind(this),
      getGameStateEntityOrThrow: this.getGameStateEntityOrThrow.bind(this),
      getActiveSessionScenarioEntityOrThrow: this.getActiveSessionScenarioEntityOrThrow.bind(this),
      ensureSessionScenarioNodeSnapshot: this.ensureSessionScenarioNodeSnapshot.bind(this),
      ensureSessionScenarioNodeSnapshotForScenario: this.ensureSessionScenarioNodeSnapshotForScenario.bind(this),
      getSessionScenarioNodeEntityOrThrow: this.getSessionScenarioNodeEntityOrThrow.bind(this),
      recordNodeVisit: this.recordNodeVisit.bind(this),
      createHumanGmOverrideTurnLog: this.createHumanGmOverrideTurnLog.bind(this),
      buildSnapshot: this.buildSnapshot.bind(this),
      grantSessionInventoryItem: this.grantSessionInventoryItem.bind(this),
      removeSessionInventoryItem: this.removeSessionInventoryItem.bind(this),
      refreshSessionInventorySnapshot: this.refreshSessionInventorySnapshot.bind(this),
      conditionRuntime: this.conditionRuntime,
      concentrationRuntime: this.concentrationRuntime,
      clampNumber: this.clampNumber.bind(this),
      extractVttMapFromCheckOptions: this.extractVttMapFromCheckOptions.bind(this),
      applyScenarioStartingPositions: this.applyScenarioStartingPositions.bind(this),
      normalizeVttMap: this.normalizeVttMap.bind(this),
      lockSessionRuntime: this.lockSessionRuntime.bind(this),
      getStringProperty: this.getStringProperty.bind(this),
      transitionHumanGmCombat: this.transitionHumanGmCombat.bind(this),
      getSessionEntityOrThrow: this.getSessionEntityOrThrow.bind(this),
      completeActiveCombatState: this.completeActiveCombatState.bind(this),
    };
  }

  createSessionRevealRuntime() {
    return {
      prisma: this.prisma,
      realtimeEvents: this.realtimeEvents,
      getSessionEntityOrThrow: this.getSessionEntityOrThrow.bind(this),
      ensureMembership: this.ensureMembership.bind(this),
      getGameStateEntityOrThrow: this.getGameStateEntityOrThrow.bind(this),
      getActiveSessionScenarioEntityOrThrow: this.getActiveSessionScenarioEntityOrThrow.bind(this),
      getHumanGmSessionForOperator: this.getHumanGmSessionForOperator.bind(this),
      ensureSessionScenarioNodeSnapshotForScenario: this.ensureSessionScenarioNodeSnapshotForScenario.bind(this),
      buildSnapshot: this.buildSnapshot.bind(this),
      createHumanGmOverrideTurnLog: this.createHumanGmOverrideTurnLog.bind(this),
      findSessionScenarioRevealable: this.findSessionScenarioRevealable.bind(this),
      getStringProperty: this.getStringProperty.bind(this),
      extractChecksFromCheckOptions: this.extractChecksFromCheckOptions.bind(this),
    };
  }

  createSessionSnapshotRuntime() {
    return {
      prisma: this.prisma,
      usersService: this.usersService,
      getSessionEntityOrThrow: this.getSessionEntityOrThrow.bind(this),
      ensureSessionPublicId: this.ensureSessionPublicId.bind(this),
      getActiveSessionScenario: this.getActiveSessionScenario.bind(this),
    };
  }

  createSessionVttObjectRuntime(): SessionVttObjectRuntime {
    return {
      prisma: this.prisma,
      realtimeEvents: this.realtimeEvents,
      sessionReveal: this.sessionReveal ?? new SessionRevealService(),
      buildSnapshot: this.buildSnapshot.bind(this),
      clampNumber: this.clampNumber.bind(this),
      createSessionRevealRuntime: this.createSessionRevealRuntime.bind(this),
      getSessionEntityOrThrow: this.getSessionEntityOrThrow.bind(this),
      getStringProperty: this.getStringProperty.bind(this),
      getVttMapBaseline: this.getVttMapBaseline.bind(this),
      getVttMapForSessionScenario: this.getVttMapForSessionScenario.bind(this),
      normalizeVttMap: this.normalizeVttMap.bind(this),
      recordSessionReveal: this.recordSessionReveal.bind(this),
      rectsOverlap: this.rectsOverlap.bind(this),
      refreshSessionInventorySnapshot: this.refreshSessionInventorySnapshot.bind(this),
      logPerformanceMetric:
        process.env.PERFORMANCE_DIAGNOSTICS === "1"
          ? this.logVttPerformanceMetric.bind(this)
          : undefined,
    };
  }

  private logVttPerformanceMetric(payload: Record<string, unknown>): void {
    this.logger.debug(payload);
  }

  async createSession(userId: string, dto: CreateSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);

    const scenario = dto.scenarioId
      ? await this.scenariosService.getScenarioEntityForViewer(dto.scenarioId, userId)
      : await this.scenariosService.getDefaultScenarioEntity();

    const startNodeId = this.sessionStartNode.resolveStartNodeId(scenario.nodes, scenario.startNodeId);
    if (!startNodeId) {
      throw new UnprocessableEntityException("The selected scenario does not have a start node.");
    }

    const inviteCode = await this.generateInviteCode();
    const visibility = this.sessionSettings.resolveVisibility({
      visibility: dto.visibility,
      isPrivate: dto.isPrivate,
      isPublic: dto.isPublic,
    });
    const gmMode = this.sessionSettings.resolveGmMode(dto.gmMode);
    const isHumanGmSession = gmMode === PrismaGmMode.HUMAN;

    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          publicId: await this.generateSessionPublicId(),
          title: dto.title.trim(),
          description: dto.description?.trim() ?? "",
          hostUserId: userId,
          inviteCode,
          maxParticipants: dto.maxParticipants ?? dto.maxPlayers ?? 4,
          visibility,
          ruleSetId: dto.ruleSetId ?? scenario.ruleSetId ?? null,
          gmMode,
          gmUserId: isHumanGmSession ? userId : null,
          nextSessionAt: dto.nextSessionAt ? new Date(dto.nextSessionAt) : null,
        },
      });

      const sessionScenario = await tx.sessionScenario.create({
        data: {
          sessionId: createdSession.id,
          scenarioId: scenario.id,
          sequence: 1,
          status: PrismaSessionScenarioStatus.ACTIVE,
        },
      });

      await tx.sessionParticipant.create({
        data: {
          sessionId: createdSession.id,
          userId,
          role: isHumanGmSession ? PrismaParticipantRole.GM : PrismaParticipantRole.HOST,
          status: PrismaParticipantStatus.JOINED,
          connectionStatus: PrismaConnectionStatus.ONLINE,
          isReady: isHumanGmSession,
          readyAt: isHumanGmSession ? new Date() : null,
        },
      });

      await tx.gameState.create({
        data: {
          sessionScenarioId: sessionScenario.id,
          version: 1,
          currentNodeId: startNodeId,
          phase: PrismaGamePhase.LOBBY,
          flagsJson: JSON.stringify(this.sessionScenarioRevisionSnapshot.buildInitialFlags(scenario)),
        },
      });

      if (startNodeId) {
        await this.ensureSessionScenarioNodeSnapshot(tx, sessionScenario.id, scenario.id);
        await this.recordNodeVisit(tx, {
          sessionScenarioId: sessionScenario.id,
          nodeId: startNodeId,
        });
      }

      return createdSession;
    });

    return this.buildSnapshot(session.id);
  }

  async listAvailableSessions(params: SessionPageParams = {}): Promise<SessionPageResult> {
    const where = this.sessionListFilter.buildAvailableWhere(params);

    const [totalElements, sessions] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: {
          host: true,
          participants: {
            where: { status: PrismaParticipantStatus.JOINED },
          },
          sessionScenarios: {
            include: {
              scenario: true,
              gameState: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (params.page ?? 0) * (params.size ?? 10),
        take: params.size ?? 10,
      }),
    ]);

    const ensuredSessions = await Promise.all(sessions.map((session) => this.ensureSessionPublicId(session)));
    const items = this.sessionListItem.buildMany(ensuredSessions, params.requesterUserId);

    return { items, totalElements };
  }

  async joinSessionById(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);
    const session = await this.getSessionEntityOrThrow(sessionId);
    return this.joinSessionEntity(userId, session);
  }

  async joinSessionByInvite(userId: string, dto: JoinSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);
    const session = await this.sessionInvite.getSessionByCode(dto.inviteCode);
    return this.joinSessionEntity(userId, session);
  }

  async leaveSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const participant = await this.getJoinedParticipantOrThrow(userId, resolvedSessionId);
    let canEmitSnapshot = true;

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionParticipant.update({
        where: { id: participant.id },
        data: {
          status: PrismaParticipantStatus.LEFT,
          leftAt: new Date(),
          connectionStatus: PrismaConnectionStatus.OFFLINE,
          isReady: false,
          readyAt: null,
        },
      });

      await tx.sessionCharacter.deleteMany({
        where: {
          sessionId: resolvedSessionId,
          userId,
        },
      });

      const remainingParticipants = await tx.sessionParticipant.findMany({
        where: {
          sessionId: resolvedSessionId,
          status: PrismaParticipantStatus.JOINED,
        },
        orderBy: { joinedAt: "asc" },
      });

      const leaveResolution = this.sessionLeaveResolution.resolve({
        leavingUserId: userId,
        sessionHostUserId: session.hostUserId,
        sessionGmUserId: session.gmUserId,
        remainingParticipants,
      });

      if (leaveResolution.shouldDisband) {
        await this.deleteSessionScenarioLinks(tx, resolvedSessionId);
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { status: PrismaSessionStatus.DISBANDED },
        });
        canEmitSnapshot = leaveResolution.canEmitSnapshot;
        return;
      }

      if (leaveResolution.shouldClearGmUser) {
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { gmUserId: null },
        });
      }

      if (leaveResolution.nextHostUserId && leaveResolution.nextHostRole) {
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { hostUserId: leaveResolution.nextHostUserId },
        });

        await tx.sessionParticipant.update({
          where: {
            sessionId_userId: {
              sessionId: resolvedSessionId,
              userId: leaveResolution.nextHostUserId,
            },
          },
          data: {
            role: leaveResolution.nextHostRole,
          },
        });
      }
    });

    if (canEmitSnapshot) {
      this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    }
  }

  async getSessionForUser(userId: string, sessionId: string): Promise<SessionDetailResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;

    if (session.visibility === PrismaSessionVisibility.PRIVATE) {
      await this.ensureMembership(userId, resolvedSessionId);
    }

    return this.buildDetail(resolvedSessionId);
  }

  async getParticipantsForUser(userId: string, sessionId: string): Promise<SessionParticipantResponseDto[]> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    return this.sessionParticipantStatus.listJoinedParticipants(resolvedSessionId);
  }

  async getParticipantStatusesForUser(userId: string, sessionId: string): Promise<ParticipantStatusResponseDto[]> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    return this.sessionParticipantStatus.listConnectionStatuses(resolvedSessionId);
  }

  async getStateForUser(userId: string, sessionId: string): Promise<GameStateResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    return mapGameState(state, resolvedSessionId);
  }

  async getVttMapForUser(userId: string, sessionId: string): Promise<VttMapStateDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.parseRecordJson(state.flagsJson);
    const existingMap = this.readRuntimeVttMapFromFlags(flags);
    const canSeeGmMap = this.canSeeGmOnlyRuntimeData(userId, session);

    if (existingMap) {
      const map = await this.applyScenarioStartingPositions(resolvedSessionId, existingMap);
      if (JSON.stringify(map.tokens) !== JSON.stringify(existingMap.tokens)) {
        await this.prisma.gameState.update({
          where: { sessionScenarioId: sessionScenario.id },
          data: {
            flagsJson: JSON.stringify(this.sessionVttMapPersistence.buildMapFlags(flags, map)),
          },
        });
      }
      return canSeeGmMap ? map : this.redactVttMapForPlayer(map);
    }

    const scenarioMap = await this.getScenarioDefaultVttMapForNode(sessionScenario.id, state.currentNodeId);
    if (scenarioMap) {
      const normalizedMap = this.normalizeVttMap(scenarioMap, state.currentNodeId ?? null);
      const map = await this.applyScenarioStartingPositions(resolvedSessionId, normalizedMap);
      return canSeeGmMap ? map : this.redactVttMapForPlayer(map);
    }

    const map = await this.buildDefaultVttMap(resolvedSessionId, state.currentNodeId ?? null);
    return canSeeGmMap ? map : this.redactVttMapForPlayer(map);
  }

  async updateVttMap(userId: string, sessionId: string, dto: UpdateVttMapDto): Promise<VttMapStateDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    if (session.hostUserId !== userId) {
      this.logger.debug(`[VTT_LEGACY_PLAYER_MAP_UPDATE_IGNORED] sessionId=${resolvedSessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"}`);
      return this.getVttMapForUser(userId, resolvedSessionId);
    }

    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const requestedMap = this.normalizeInputVttMap(dto.map, state.currentNodeId ?? null, "vttMap");
    const hasActiveCombat = Boolean(
      await this.prisma.combat.findFirst({
        where: { sessionId: resolvedSessionId, status: PrismaCombatStatus.ACTIVE },
        select: { id: true },
      }),
    );
    this.logger.debug(
      `[VTT_MOVE_REQUEST] sessionId=${resolvedSessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"} host=${session.hostUserId === userId} activeCombat=${hasActiveCombat} requestedTokens=${requestedMap.tokens.length}`,
    );
    if (hasActiveCombat) {
      throw new ForbiddenException("Combat map changes must use combat command endpoints.");
    }

    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: requestedMap,
      previousMap,
    });
    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async updateGmVttMap(userId: string, sessionId: string, dto: UpdateVttMapDto): Promise<VttMapStateDto> {
    return this.updateVttMap(userId, sessionId, dto);
  }

  async moveSessionToken(userId: string, sessionId: string, dto: MoveSessionTokenDto): Promise<VttMapStateDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const activeCombat = await this.prisma.combat.findFirst({
      where: { sessionId: resolvedSessionId, status: PrismaCombatStatus.ACTIVE },
      select: { id: true },
    });
    if (activeCombat) {
      throw new ForbiddenException("Combat movement must use the combat move command.");
    }

    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const controlledTokenIds = await this.getControlledSessionCharacterIds(userId, resolvedSessionId);
    const token = previousMap.tokens.find((candidate) => {
      if (candidate.hidden === true || candidate.isHostile === true) {
        return false;
      }
      if (dto.tokenId && candidate.id === dto.tokenId) {
        return true;
      }
      return Boolean(dto.sessionCharacterId && candidate.sessionCharacterId === dto.sessionCharacterId);
    });

    if (!token?.sessionCharacterId || !controlledTokenIds.has(token.sessionCharacterId)) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }

    const moveTo = this.readVttMapPointInput(dto.to, "moveToken.to");
    const requestedToken = {
      ...token,
      x: this.clampNumber(Math.floor(moveTo.x), 0, Math.max(0, previousMap.width - token.size)),
      y: this.clampNumber(Math.floor(moveTo.y), 0, Math.max(0, previousMap.height - token.size)),
    };
    this.ensureTokenPathIsReachable(previousMap, token, requestedToken);

    const changedMap: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((candidate) => (candidate.id === token.id ? requestedToken : candidate)),
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
    });

    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async createVttMapPing(userId: string, sessionId: string, dto: CreateVttMapPingDto): Promise<VttMapStateDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const now = Date.now();
    const map: VttMapStateDto = {
      ...previousMap,
      pings: [
        ...(previousMap.pings ?? []).filter((ping) => Date.parse(ping.expiresAt) > now).slice(-4),
        {
          id: `ping:${randomUUID()}`,
          x: this.clampNumber(Math.floor(this.readVttMapNumberInput(dto.x, "ping.x")), 0, previousMap.width),
          y: this.clampNumber(Math.floor(this.readVttMapNumberInput(dto.y, "ping.y")), 0, previousMap.height),
          label: dto.label?.trim().slice(0, 8) || "!",
          expiresAt: new Date(now + 2200).toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map,
      previousMap,
    });

    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async moveVttTokenTowardToken(params: {
    sessionId: string;
    sourceTokenId: string;
    targetTokenId: string;
    maxDistanceFt: number;
    stopWithinFt?: number | null;
  }): Promise<{ map: VttMapStateDto; moved: boolean; distanceMovedFt: number }> {
    const session = await this.getSessionEntityOrThrow(params.sessionId);
    const resolvedSessionId = session.id;
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const movement = this.calculateTokenStepTowardTarget(previousMap, {
      sourceTokenId: params.sourceTokenId,
      targetTokenId: params.targetTokenId,
      maxDistanceFt: params.maxDistanceFt,
      stopWithinFt: params.stopWithinFt ?? 5,
    });

    if (!movement) {
      return { map: previousMap, moved: false, distanceMovedFt: 0 };
    }

    await this.emitVttTokenMovementFrames({
      sessionId: resolvedSessionId,
      hostUserId: session.hostUserId,
      map: previousMap,
      sourceTokenId: params.sourceTokenId,
      path: movement.path,
    });

    const changedMap: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((token) =>
        token.id === params.sourceTokenId
          ? {
              ...token,
              x: movement.x,
              y: movement.y,
            }
          : token,
      ),
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
    });

    return { map: result.map, moved: true, distanceMovedFt: movement.distanceMovedFt };
  }

  async hideVttToken(sessionId: string, tokenId: string): Promise<VttMapStateDto | null> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(session.id);
    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(session.id, sessionScenario.id, state);
    const targetToken = previousMap.tokens.find((token) => token.id === tokenId);
    if (!targetToken || targetToken.hidden === true) {
      return targetToken ? previousMap : null;
    }

    const changedMap: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              hidden: true,
            }
          : token,
      ),
      updatedAt: new Date().toISOString(),
    };

    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
    });

    return result.map;
  }

  async hideVttTokenForSessionCharacter(sessionId: string, sessionCharacterId: string): Promise<VttMapStateDto | null> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(session.id);
    const map = await this.getVttMapBaseline(session.id, sessionScenario.id, state);
    const token = map.tokens.find((candidate) => candidate.sessionCharacterId === sessionCharacterId && candidate.hidden !== true);
    return token ? this.hideVttToken(session.id, token.id) : null;
  }

  async moveSessionCharacterTokenToMapPoint(params: {
    sessionId: string;
    sessionCharacterId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{ status: MainCommandStatus; message: string; map: VttMapStateDto | null }> {
    const session = await this.getSessionEntityOrThrow(params.sessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(session.id);
    const flags = this.parseRecordJson(state.flagsJson);
    const previousMap = await this.getVttMapBaseline(session.id, sessionScenario.id, state);
    const token = previousMap.tokens.find(
      (candidate) => candidate.sessionCharacterId === params.sessionCharacterId && candidate.hidden !== true && candidate.isHostile !== true,
    );

    if (!token) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "이동할 플레이어 토큰을 현재 맵에서 찾을 수 없습니다.",
        map: null,
      };
    }

    const destination = this.getTokenDestinationFromMapPoint(previousMap, token, params.mapPoint);
    const requestedToken = {
      ...token,
      x: destination.x,
      y: destination.y,
    };

    if (token.x === requestedToken.x && token.y === requestedToken.y) {
      return {
        status: MainCommandStatus.RESOLVED,
        message: `${token.name}은(는) 이미 목표 위치에 있습니다.`,
        map: previousMap,
      };
    }

    if (this.isTokenPlacementBlocked(previousMap, token, requestedToken.x, requestedToken.y)) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "목표 타일이 막혀 있어 그 위치로 이동할 수 없습니다.",
        map: previousMap,
      };
    }

    const changedMap: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((candidate) => (candidate.id === token.id ? requestedToken : candidate)),
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
    });

    return {
      status: MainCommandStatus.RESOLVED,
      message: `${token.name}이(가) 목표 위치로 이동했습니다.`,
      map: result.map,
    };
  }

  async getPlayerScenarioForUser(userId: string, sessionId: string): Promise<PlayerScenarioViewDto> {
    return this.sessionReveal.getPlayerScenarioForUser(this.createSessionRevealRuntime(), userId, sessionId);
  }

  async getPublicClueSummariesForUser(userId: string, sessionId: string): Promise<string[]> {
    return this.sessionReveal.getPublicClueSummariesForUser(this.createSessionRevealRuntime(), userId, sessionId);
  }

  async revealSessionContent(
    userId: string,
    sessionId: string,
    dto: Omit<RevealSessionContentDto, "contentKind"> & { contentKind?: string },
  ): Promise<SessionRevealResponseDto> {
    return this.sessionReveal.revealSessionContent(this.createSessionRevealRuntime(), userId, sessionId, dto);
  }

  async updateSession(userId: string, sessionId: string, dto: UpdateSessionDto): Promise<SessionResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureHost(userId, session.hostUserId);

    const nextMaxParticipants = dto.maxParticipants ?? dto.maxPlayers;
    await this.sessionUpdatePolicy.ensureCanUpdate({
      sessionId: resolvedSessionId,
      sessionStatus: session.status,
      nextMaxParticipants,
      captainUserId: dto.captainUserId,
    });

    const updated = await this.prisma.session.update({
      where: { id: resolvedSessionId },
      data: {
        title: dto.title?.trim() ?? session.title,
        description: dto.description?.trim() ?? session.description,
        maxParticipants: nextMaxParticipants ?? session.maxParticipants,
        visibility: this.sessionSettings.resolveVisibility({
          visibility: dto.visibility,
          isPrivate: dto.isPrivate,
          isPublic: dto.isPublic,
          fallback: session.visibility,
        }),
        gmMode: dto.gmMode ? this.sessionSettings.resolveGmMode(dto.gmMode) : session.gmMode,
        captainUserId: dto.captainUserId === undefined ? session.captainUserId : dto.captainUserId,
        nextSessionAt: dto.nextSessionAt === undefined ? session.nextSessionAt : dto.nextSessionAt === null ? null : new Date(dto.nextSessionAt),
      },
      include: {
        sessionScenarios: {
          include: {
            scenario: true,
            gameState: true,
          },
          orderBy: { sequence: "asc" },
        },
      },
    });

    const mapped = mapSession(updated);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, mapped);
    return mapped;
  }

  async updateHumanGm(userId: string, sessionId: string, dto: UpdateHumanGmDto): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureHost(userId, session.hostUserId);

    await this.sessionHumanGmAssignmentPolicy.ensureCanAssign({
      sessionId: resolvedSessionId,
      sessionGmMode: session.gmMode,
      sessionStatus: session.status,
      gmUserId: dto.gmUserId,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionCharacter.deleteMany({
        where: {
          sessionId: resolvedSessionId,
          userId: dto.gmUserId,
        },
      });
      await tx.sessionParticipant.updateMany({
        where: {
          sessionId: resolvedSessionId,
          role: PrismaParticipantRole.GM,
        },
        data: {
          role: PrismaParticipantRole.PLAYER,
          isReady: false,
          readyAt: null,
        },
      });
      await tx.sessionParticipant.update({
        where: {
          sessionId_userId: {
            sessionId: resolvedSessionId,
            userId: dto.gmUserId,
          },
        },
        data: {
          role: PrismaParticipantRole.GM,
          isReady: true,
          readyAt: new Date(),
        },
      });
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: { gmUserId: dto.gmUserId },
      });
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureHost(userId, session.hostUserId);

    this.sessionDeletePolicy.ensureCanDelete(session.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionCharacter.deleteMany({ where: { sessionId: resolvedSessionId } });
      await this.deleteSessionScenarioLinks(tx, resolvedSessionId);
      await tx.sessionParticipant.updateMany({
        where: {
          sessionId: resolvedSessionId,
          status: PrismaParticipantStatus.JOINED,
        },
        data: {
          status: PrismaParticipantStatus.LEFT,
          leftAt: new Date(),
          connectionStatus: PrismaConnectionStatus.OFFLINE,
          isReady: false,
          readyAt: null,
        },
      });
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: { status: PrismaSessionStatus.DISBANDED },
      });
    });
  }

  async listMySessions(userId: string, params: SessionPageParams = {}): Promise<SessionPageResult> {
    await this.usersService.getUserEntityOrThrow(userId);

    const where = this.sessionListFilter.buildMySessionsWhere(userId, params);

    const [totalElements, sessions] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: {
          host: true,
          participants: {
            where: { status: PrismaParticipantStatus.JOINED },
          },
          sessionScenarios: {
            include: {
              scenario: true,
              gameState: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (params.page ?? 0) * (params.size ?? 10),
        take: params.size ?? 10,
      }),
    ]);

    const ensuredSessions = await Promise.all(sessions.map((session) => this.ensureSessionPublicId(session)));
    const items = this.sessionListItem.buildMany(ensuredSessions, userId);

    return { items, totalElements };
  }

  async selectCharacterForSession(userId: string, sessionId: string, dto: SelectSessionCharacterDto): Promise<SessionParticipantResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const mappedParticipant = await this.sessionCharacterSelection.selectCharacter({
      sessionId: resolvedSessionId,
      userId,
      sessionStatus: session.status,
      characterId: dto.characterId,
      getScenarioForSelectionValidation: () =>
        this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId),
    });
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    return mappedParticipant;
  }

  async updateParticipantReadyState(userId: string, sessionId: string, dto: UpdateParticipantReadyDto): Promise<SessionParticipantResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const mappedParticipant = await this.sessionParticipantStatus.updateReadyState({
      sessionId: resolvedSessionId,
      userId,
      sessionStatus: session.status,
      isReady: dto.isReady,
      getScenarioForReadyValidation: () =>
        this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId),
    });
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    return mappedParticipant;
  }

  async resumeSession(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const participant = await this.prisma.sessionParticipant
      .update({
        where: {
          sessionId_userId: {
            sessionId: resolvedSessionId,
            userId,
          },
        },
        data: {
          status: PrismaParticipantStatus.JOINED,
          leftAt: null,
          connectionStatus: PrismaConnectionStatus.ONLINE,
        },
        include: {
          user: true,
          sessionCharacter: {
            select: {
              id: true,
              characterId: true,
            },
          },
        },
      })
      .catch(() => {
        throw new ForbiddenException("You must join the session before resuming it.");
      });

    const mapped = mapParticipant(participant);
    this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mapped);
    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async getInviteInfo(userId: string, sessionId: string): Promise<SessionInviteResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    return this.sessionInvite.buildInviteInfo({
      sessionId: resolvedSessionId,
      inviteCode: session.inviteCode,
      appBaseUrl: process.env.APP_BASE_URL,
    });
  }

  async startSession(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureGmRuntimeOperator(userId, session);

    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaParticipantStatus.JOINED,
      },
      include: {
        sessionCharacter: {
          include: { character: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    this.sessionStartPolicy.ensureCanStart({
      session,
      participants,
      scenario: activeScenario.scenario,
    });

    const state = activeScenario.gameState;
    await this.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const currentNodeId = state?.currentNodeId ?? null;
    const flags = this.parseRecordJson(state?.flagsJson);
    const existingMap = this.readRuntimeVttMapFromFlags(flags);
    const scenarioMap = currentNodeId ? await this.getScenarioDefaultVttMapForNode(activeScenario.id, currentNodeId) : null;
    const runtimeMap = existingMap
      ? await this.applyScenarioStartingPositions(resolvedSessionId, existingMap)
      : scenarioMap
        ? await this.applyScenarioStartingPositions(resolvedSessionId, this.normalizeVttMap(scenarioMap, currentNodeId))
        : await this.buildDefaultVttMap(resolvedSessionId, currentNodeId);

    await this.prisma.$transaction(async (tx) => {
      await this.ensureSessionScenarioNodeSnapshot(tx, activeScenario.id, activeScenario.scenarioId);
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: PrismaSessionStatus.PLAYING,
        },
      });
      await tx.sessionScenario.update({
        where: { id: activeScenario.id },
        data: {
          startedAt: activeScenario.startedAt ?? new Date(),
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          phase: PrismaGamePhase.EXPLORATION,
          flagsJson: JSON.stringify(this.sessionVttMapPersistence.buildMapFlags(flags, runtimeMap)),
        },
      });
      if (state?.currentNodeId) {
        await this.recordNodeVisit(tx, {
          sessionScenarioId: activeScenario.id,
          nodeId: state.currentNodeId,
        });
      }
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async createHumanGmMessage(userId: string, sessionId: string, dto: HumanGmMessageDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.createHumanGmMessage(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async grantHumanGmInventoryItem(userId: string, sessionId: string, dto: GrantHumanGmInventoryItemDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.grantHumanGmInventoryItem(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async removeHumanGmInventoryItem(userId: string, sessionId: string, dto: RemoveHumanGmInventoryItemDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.removeHumanGmInventoryItem(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async applyHumanGmEconomyAction(
    userId: string,
    sessionId: string,
    dto: ApplySessionEconomyActionDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getGmEconomySessionForOperator(userId, sessionId);
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for economy actions.");
    }
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const stateRuntime = new EconomyStateRuntimeService(this.prisma);
    const gameState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const baseState =
      stateRuntime.readEconomyStateFromFlags(gameState?.flagsJson) ??
      this.sessionEconomy.createInitialState();
    const state = this.sessionEconomy.prepareStateForAction(baseState, dto);
    const result = this.sessionEconomy.resolveAction(state, dto);
    if (!result.accepted) {
      throw new BadRequestException(`Economy action rejected: ${result.reason}.`);
    }

    const applied = await stateRuntime.applyResolution({
      sessionId: session.id,
      sessionScenarioId: activeScenario.id,
      resolution: result,
      actorUserId: userId,
      sessionCharacterId: dto.sessionCharacterId ?? result.auditEvent.sessionCharacterId ?? null,
      rawInput: `/economy ${dto.actionType}`,
      reason: `economy:${dto.actionType}`,
    });

    if (
      result.auditEvent.type === "party_stash_distributed" &&
      typeof result.auditEvent.sessionCharacterId === "string" &&
      typeof result.auditEvent.itemDefinitionId === "string" &&
      typeof result.auditEvent.quantity === "number" &&
      Number.isInteger(result.auditEvent.quantity) &&
      result.auditEvent.quantity >= 1
    ) {
      const sessionCharacterId = result.auditEvent.sessionCharacterId;
      const itemDefinitionId = result.auditEvent.itemDefinitionId;
      const quantity = result.auditEvent.quantity;
      await this.prisma.$transaction(async (tx) => {
        await this.grantSessionInventoryItem(tx, {
          sessionCharacterId,
          itemDefinitionId,
          quantity,
        });
        await this.refreshSessionInventorySnapshot(sessionCharacterId, tx);
      });
      const updatedCharacter = await this.prisma.sessionCharacter.findUnique({
        where: { id: result.auditEvent.sessionCharacterId },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (updatedCharacter) {
        this.realtimeEvents.emitCharacterUpdated(session.id, mapSessionCharacter(updatedCharacter));
      }
    }

    this.realtimeEvents.emitTurnLogCreated(session.id, applied.turnLog);
    this.realtimeEvents.emitStateDiffApplied(session.id, applied.stateDiff);
    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return snapshot;
  }

  async applyCampaignCalendarAction(
    userId: string,
    sessionId: string,
    dto: ApplyCampaignCalendarActionDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    await this.ensureMembership(userId, session.id);
    if (!this.isPlayerCampaignCalendarAction(dto.actionType)) {
      this.ensureGmRuntimeOperator(userId, session);
      await this.ensureJoinedGmRuntimeParticipant(userId, session.id);
    }
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for campaign calendar actions.");
    }
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const calendarRuntime = new CampaignCalendarRuntimeService(this.prisma);
    const gameState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const baseState =
      calendarRuntime.readCalendarStateFromFlags(gameState?.flagsJson) ??
      calendarRuntime.createInitialState();
    const resolution = calendarRuntime.resolveAction({
      state: baseState,
      dto,
      actorUserId: userId,
    });
    const applied = await calendarRuntime.applyResolution({
      sessionId: session.id,
      sessionScenarioId: activeScenario.id,
      resolution,
      rawInput: `/campaign ${dto.actionType}`,
      reason: `campaign_calendar:${dto.actionType}`,
    });

    this.realtimeEvents.emitTurnLogCreated(session.id, applied.turnLog);
    this.realtimeEvents.emitStateDiffApplied(session.id, applied.stateDiff);
    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return snapshot;
  }

  private isPlayerCampaignCalendarAction(actionType: ApplyCampaignCalendarActionDto["actionType"]): boolean {
    return this.sessionCampaignCalendarActionPolicy.canPlayerSubmit(actionType);
  }

  async setHumanGmDifficultyClass(userId: string, sessionId: string, dto: SetHumanGmDifficultyClassDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.setHumanGmDifficultyClass(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async listHumanGmPrivateNotes(userId: string, sessionId: string): Promise<HumanGmPrivateNoteDto[]> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const flags = this.parseRecordJsonForRead(state?.flagsJson);
    return this.sessionHumanGmPrivateNoteStore.listNewestFirst(flags);
  }

  async createHumanGmAiAssistSuggestion(
    userId: string,
    sessionId: string,
    dto: CreateHumanGmAiAssistSuggestionDto,
  ): Promise<HumanGmAiAssistSuggestionDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM AI assist suggestions.");
    }
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const flags = this.parseRecordJson(state?.flagsJson);
    const suggestion: HumanGmAiAssistSuggestionDto = {
      id: `ai-assist:${randomUUID()}`,
      assistType: dto.assistType,
      content: dto.content.trim(),
      suggestedActionId: dto.suggestedActionId?.trim() || null,
      targetId: dto.targetId?.trim() || null,
      status: "PENDING",
      createdByUserId: userId,
      acceptedByUserId: null,
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };

    await this.prisma.gameState.update({
      where: { sessionScenarioId: activeScenario.id },
      data: {
        flagsJson: JSON.stringify(this.appendHumanGmAiAssistSuggestion(flags, suggestion)),
      },
    });

    return suggestion;
  }

  async listHumanGmAiAssistSuggestions(
    userId: string,
    sessionId: string,
  ): Promise<HumanGmAiAssistSuggestionDto[]> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const flags = this.parseRecordJsonForRead(state?.flagsJson);
    return this.getHumanGmAiAssistSuggestions(flags)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async acceptHumanGmAiAssistSuggestion(
    userId: string,
    sessionId: string,
    dto: AcceptHumanGmAiAssistSuggestionDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM AI assist acceptance.");
    }
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const initialState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const initialFlags = this.parseRecordJson(initialState?.flagsJson);
    const suggestion = this.getHumanGmAiAssistSuggestion(initialFlags, dto.suggestionId);
    if (!suggestion) {
      throw new NotFoundException("승인할 AI assist 제안을 찾을 수 없습니다.");
    }
    if (suggestion.status !== "PENDING") {
      throw new ConflictException("이미 처리된 AI assist 제안입니다.");
    }

    const gmTurnLog = await this.prisma.$transaction(async (tx) => {
      const currentState = await tx.gameState.findUnique({
        where: { sessionScenarioId: activeScenario.id },
        select: { flagsJson: true },
      });
      const currentFlags = this.parseRecordJson(currentState?.flagsJson);
      const currentSuggestion = this.getHumanGmAiAssistSuggestion(currentFlags, dto.suggestionId);
      if (!currentSuggestion) {
        throw new NotFoundException("승인할 AI assist 제안을 찾을 수 없습니다.");
      }
      if (currentSuggestion.status !== "PENDING") {
        throw new ConflictException("이미 처리된 AI assist 제안입니다.");
      }
      const acceptedLog = await this.createHumanGmOverrideTurnLog({
        tx,
        kind: "ai_assist_accept",
        sessionId: session.id,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        publicNarration: dto.publicNarration?.trim() || "GM이 AI assist 제안을 승인했습니다.",
        privateNote: dto.privateNote,
        metadata: {
          assistType: currentSuggestion.assistType,
          suggestionId: currentSuggestion.id,
          suggestedActionId: currentSuggestion.suggestedActionId,
          targetId: currentSuggestion.targetId,
        },
      });
      const mergedState = await tx.gameState.findUnique({
        where: { sessionScenarioId: activeScenario.id },
        select: { flagsJson: true },
      });
      const mergedFlags = this.parseRecordJson(mergedState?.flagsJson);
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          flagsJson: JSON.stringify(this.markHumanGmAiAssistSuggestionAccepted(mergedFlags, currentSuggestion.id, userId)),
        },
      });
      return acceptedLog;
    });

    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitTurnLogCreated(session.id, gmTurnLog.turnLog);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return snapshot;
  }

  async reportHumanGmAiAssistApplicationFailure(
    userId: string,
    sessionId: string,
    dto: ReportHumanGmAiAssistApplicationFailureDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM AI assist failure audit.");
    }
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
      select: { flagsJson: true },
    });
    const flags = this.parseRecordJson(state?.flagsJson);
    const suggestion = this.getHumanGmAiAssistSuggestion(flags, dto.suggestionId);
    if (!suggestion) {
      throw new NotFoundException("실패를 기록할 AI assist 제안을 찾을 수 없습니다.");
    }
    if (suggestion.status !== "ACCEPTED") {
      throw new ConflictException("승인되지 않은 AI assist 제안의 적용 실패는 기록할 수 없습니다.");
    }

    const failureLog = await this.createHumanGmAiAssistApplicationFailureTurnLog({
      sessionId: session.id,
      sessionScenarioId: activeScenario.id,
      gmUserId: userId,
      suggestion,
      failureReason: dto.failureReason,
      failedOperation: dto.failedOperation,
    });
    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitTurnLogCreated(session.id, failureLog.turnLog);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return snapshot;
  }

  async applyHumanGmCombatCondition(userId: string, sessionId: string, dto: ApplyHumanGmCombatConditionDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.applyHumanGmCombatCondition(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async adjustHumanGmCombatHp(userId: string, sessionId: string, dto: AdjustHumanGmCombatHpDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.adjustHumanGmCombatHp(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async updateSessionNode(userId: string, sessionId: string, dto: UpdateSessionNodeDto): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.updateSessionNode(this.createHumanGmRuntime(), userId, sessionId, dto);
  }

  async listHumanGmNodeMoveOptions(userId: string, sessionId: string): Promise<HumanGmNodeMoveOptionDto[]> {
    return this.humanGmRuntime.listHumanGmNodeMoveOptions(this.createHumanGmRuntime(), userId, sessionId);
  }

  async startCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.startCombat(this.createHumanGmRuntime(), userId, sessionId);
  }

  async endCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    return this.humanGmRuntime.endCombat(this.createHumanGmRuntime(), userId, sessionId);
  }

  async completeActiveCombatState(sessionId: string, combatId?: string): Promise<void> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const state = activeScenario.gameState;
    const flags = this.parseRecordJson(state?.flagsJson);
    const currentNodeId = state?.currentNodeId ?? null;
    const combatCompletionFlags = this.sessionCompletionFlagStore.buildCombatCompletionFlags(flags, currentNodeId);

    this.logger.debug(
      `[COMBAT_COMPLETE_STATE] sessionId=${resolvedSessionId} combatId=${combatId ?? "active"} currentNodeId=${currentNodeId ?? "null"} previousPhase=${state?.phase ?? "null"} nextCompletedCombatNodeIds=${JSON.stringify(combatCompletionFlags.completedCombatNodeIds)}`,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: session.status === PrismaSessionStatus.COMPLETED ? PrismaSessionStatus.COMPLETED : PrismaSessionStatus.PLAYING,
        },
      });
      await tx.combat.updateMany({
        where: {
          sessionId: resolvedSessionId,
          status: PrismaCombatStatus.ACTIVE,
        },
        data: {
          status: PrismaCombatStatus.ENDED,
          endedAt: new Date(),
          currentParticipantId: null,
        },
      });
      if (state) {
        await tx.gameState.update({
          where: { sessionScenarioId: activeScenario.id },
          data: {
            phase: PrismaGamePhase.EXPLORATION,
            version: { increment: 1 },
            flagsJson: JSON.stringify(combatCompletionFlags.flags),
          },
        });
      }
      if (currentNodeId) {
        await this.recordCurrentNodeCluesByPolicy(tx, {
          sessionScenarioId: activeScenario.id,
          nodeId: currentNodeId,
          policyModes: ["POST_COMBAT"],
          revealedBy: "system",
          reason: "post_combat",
        });
      }
    });
  }

  async completeSessionAfterPartyDefeat(sessionId: string, combatId?: string): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const state = activeScenario.gameState;
    const flags = this.parseRecordJson(state?.flagsJson);
    const defeatedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.lockSessionRuntime(tx, resolvedSessionId);
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: { status: PrismaSessionStatus.COMPLETED },
      });
      await tx.combat.updateMany({
        where: {
          sessionId: resolvedSessionId,
          status: PrismaCombatStatus.ACTIVE,
        },
        data: {
          status: PrismaCombatStatus.ENDED,
          endedAt: defeatedAt,
          currentParticipantId: null,
        },
      });
      if (state) {
        await tx.gameState.update({
          where: { sessionScenarioId: activeScenario.id },
          data: {
            phase: PrismaGamePhase.COMBAT,
            version: { increment: 1 },
            flagsJson: JSON.stringify(
              this.sessionCompletionFlagStore.buildPartyDefeatFlags(flags, {
                defeatedAt,
                nodeId: state.currentNodeId ?? null,
              }),
            ),
          },
        });
      }
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  private async lockSessionRuntime(tx: Pick<Prisma.TransactionClient, "$executeRaw">, sessionId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
  }

  async completeSessionFromEndingNode(params: { sessionId: string; sessionScenarioId: string; nodeId: string; reason: string }): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(params.sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    if (activeScenario.id !== params.sessionScenarioId) {
      throw new ConflictException("The ending node does not belong to the active session scenario.");
    }

    const state = activeScenario.gameState;
    const flags = this.parseRecordJson(state?.flagsJson);
    const completedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: { status: PrismaSessionStatus.COMPLETED },
      });
      await tx.sessionScenario.update({
        where: { id: activeScenario.id },
        data: { status: PrismaSessionScenarioStatus.COMPLETED },
      });
      if (state) {
        await tx.gameState.update({
          where: { sessionScenarioId: activeScenario.id },
          data: {
            version: { increment: 1 },
            flagsJson: JSON.stringify(
              this.sessionCompletionFlagStore.buildEndingNodeCompletionFlags(flags, {
                completedAt,
                nodeId: params.nodeId,
                reason: params.reason,
              }),
            ),
          },
        });
      }
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async completeLongCampaign(
    userId: string,
    sessionId: string,
    dto: CompleteCampaignDto,
  ): Promise<CampaignArchiveResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureHost(userId, session.hostUserId);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const state = activeScenario.gameState;
    if (!state) {
      throw new NotFoundException(`Game state for session ${session.id} was not found.`);
    }
    const flags = this.parseRecordJson(state.flagsJson);
    const existingArchive = this.campaignArchiveRuntime.parseCampaignArchive(flags);
    if (existingArchive) {
      return existingArchive;
    }

    const [sessionCharacters, turnLogCount, combatCount, nodeVisitCount] = await Promise.all([
      this.prisma.sessionCharacter.findMany({
        where: { sessionId: session.id },
        include: { character: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.turnLog.count({ where: { sessionId: session.id } }),
      this.prisma.combat.count({ where: { sessionId: session.id } }),
      this.prisma.sessionNodeVisit.count({ where: { sessionScenarioId: activeScenario.id } }),
    ]);

    const archive = this.sessionCampaignArchiveBuilder.buildArchive({
      session,
      activeScenario,
      state,
      flags,
      dto,
      completedByUserId: userId,
      sessionCharacters,
      turnLogCount,
      combatCount,
      nodeVisitCount,
    });
    const completedAt = archive.completedAt;

    await this.prisma.$transaction(async (tx) => {
      await this.lockSessionRuntime(tx, session.id);
      await tx.session.update({
        where: { id: session.id },
        data: { status: PrismaSessionStatus.COMPLETED },
      });
      await tx.sessionScenario.update({
        where: { id: activeScenario.id },
        data: {
          status: PrismaSessionScenarioStatus.COMPLETED,
          endedAt: new Date(completedAt),
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify(this.sessionCampaignArchiveFlagStore.buildCompletionFlags(flags, archive)),
        },
      });
      await this.createCampaignArchiveAuditLog(tx, {
        sessionId: session.id,
        sessionScenarioId: activeScenario.id,
        actorUserId: userId,
        archive,
        baseVersion: state.version,
        nextVersion: state.version + 1,
      });
    });

    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitSessionStatusUpdated(session.id, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return archive;
  }

  async getCampaignArchive(userId: string, sessionId: string): Promise<CampaignArchiveResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    await this.ensureMembership(userId, session.id);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    const flags = this.parseRecordJsonForRead(activeScenario.gameState?.flagsJson);
    const archive = this.campaignArchiveRuntime.parseCampaignArchive(flags);
    if (!archive) {
      throw new NotFoundException(`Campaign archive for session ${session.id} was not found.`);
    }
    return archive;
  }

  async listCharacterVault(userId: string): Promise<CharacterVaultItemDto[]> {
    const assignments = await this.prisma.sessionCharacter.findMany({
      where: {
        userId,
        session: { status: PrismaSessionStatus.COMPLETED },
      },
      include: {
        character: true,
        session: {
          include: {
            sessionScenarios: {
              include: { gameState: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: SessionsService.CHARACTER_VAULT_MAX_RESULTS,
    });

    return this.sessionCharacterVaultItem.buildMany(assignments);
  }

  async requestCharacterTransfer(
    userId: string,
    targetSessionId: string,
    dto: RequestCharacterTransferDto,
  ): Promise<CharacterTransferResponseDto> {
    const targetSession = await this.getSessionEntityOrThrow(targetSessionId);
    await this.ensureMembership(userId, targetSession.id);
    const targetScenario = await this.getActiveSessionScenarioEntityOrThrow(targetSession.id);
    const targetState = targetScenario.gameState;
    if (!targetState) {
      throw new NotFoundException(`Game state for session ${targetSession.id} was not found.`);
    }
    const sourceAssignment = await this.prisma.sessionCharacter.findUnique({
      where: { id: dto.sourceSessionCharacterId },
      include: {
        character: true,
        session: {
          include: {
            sessionScenarios: {
              include: { gameState: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    if (!sourceAssignment || sourceAssignment.userId !== userId || sourceAssignment.sessionId !== dto.sourceSessionId) {
      throw new NotFoundException(`Vault character ${dto.sourceSessionCharacterId} was not found.`);
    }
    if (sourceAssignment.session.status !== PrismaSessionStatus.COMPLETED) {
      throw new ConflictException("완료된 캠페인의 캐릭터만 이관할 수 있습니다.");
    }
    const sourceScenario = this.getActiveSessionScenario(sourceAssignment.session.sessionScenarios);
    const sourceArchive = this.campaignArchiveRuntime.parseCampaignArchive(
      this.parseRecordJson(sourceScenario?.gameState?.flagsJson),
    );
    if (!sourceArchive?.allowCharacterTransfer) {
      throw new ConflictException("이 캠페인은 캐릭터 이관을 허용하지 않습니다.");
    }
    this.campaignArchiveRuntime.ensureCharacterTransferPolicy({
      targetSession,
      targetScenario: targetScenario.scenario,
      sourceSession: sourceAssignment.session,
      sourceCharacter: sourceAssignment.character,
    });
    this.campaignArchiveRuntime.ensureCharacterTransferInventoryPolicy(
      sourceAssignment.inventorySnapshotJson ?? sourceAssignment.character.inventoryJson,
    );

    const flags = this.parseRecordJson(targetState.flagsJson);
    const requests = this.campaignArchiveRuntime.parseCharacterTransferRequests(flags);
    const duplicate = this.sessionCharacterTransferRequestStore.findPendingDuplicate(requests, {
      requestedByUserId: userId,
      sourceSessionCharacterId: sourceAssignment.id,
    });
    if (duplicate) {
      return this.campaignArchiveRuntime.toCharacterTransferResponse(duplicate);
    }

    const request: P6CharacterTransferRequestFlag = {
      requestId: `character-transfer:${randomUUID()}`,
      targetSessionId: targetSession.id,
      sourceSessionId: sourceAssignment.sessionId,
      sourceSessionCharacterId: sourceAssignment.id,
      requestedByUserId: userId,
      status: "requested",
      mode: dto.mode ?? "clone",
      targetSessionCharacterId: null,
      sourceDisposition: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      note: dto.note?.trim() || null,
      approvedByUserId: null,
    };

    await this.prisma.gameState.update({
      where: { sessionScenarioId: targetScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify(this.sessionCharacterTransferRequestStore.append(flags, requests, request)),
      },
    });

    this.realtimeEvents.emitSessionSnapshot(targetSession.id, await this.buildSnapshot(targetSession.id));
    return this.campaignArchiveRuntime.toCharacterTransferResponse(request);
  }

  async approveCharacterTransfer(
    userId: string,
    targetSessionId: string,
    requestId: string,
  ): Promise<CharacterTransferResponseDto> {
    const targetSession = await this.getSessionEntityOrThrow(targetSessionId);
    this.ensureHost(userId, targetSession.hostUserId);
    const targetScenario = await this.getActiveSessionScenarioEntityOrThrow(targetSession.id);
    const targetState = targetScenario.gameState;
    if (!targetState) {
      throw new NotFoundException(`Game state for session ${targetSession.id} was not found.`);
    }
    const flags = this.parseRecordJson(targetState.flagsJson);
    const requests = this.campaignArchiveRuntime.parseCharacterTransferRequests(flags);
    const requestEntry = this.sessionCharacterTransferRequestStore.findByIdWithIndex(requests, requestId);
    if (!requestEntry) {
      throw new NotFoundException(`Character transfer request ${requestId} was not found.`);
    }
    const { request, requestIndex } = requestEntry;
    if (request.status === "approved") {
      return this.campaignArchiveRuntime.toCharacterTransferResponse(request);
    }
    if (request.status !== "requested") {
      throw new ConflictException("승인 가능한 캐릭터 이관 요청이 아닙니다.");
    }

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: targetSession.id,
          userId: request.requestedByUserId,
        },
      },
    });
    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ConflictException("대상 세션에 참가 중인 플레이어만 캐릭터를 이관할 수 있습니다.");
    }
    const existingAssignment = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: targetSession.id,
          userId: request.requestedByUserId,
        },
      },
    });
    if (existingAssignment) {
      throw new ConflictException("대상 세션에 이미 선택된 캐릭터가 있습니다.");
    }
    const sourceAssignment = await this.prisma.sessionCharacter.findUnique({
      where: { id: request.sourceSessionCharacterId },
      include: { character: true, session: true },
    });
    if (!sourceAssignment) {
      throw new NotFoundException(`Vault character ${request.sourceSessionCharacterId} was not found.`);
    }
    this.campaignArchiveRuntime.ensureCharacterTransferPolicy({
      targetSession,
      targetScenario: targetScenario.scenario,
      sourceSession: sourceAssignment.session,
      sourceCharacter: sourceAssignment.character,
    });
    const transferableInventoryJson = this.campaignArchiveRuntime.ensureCharacterTransferInventoryPolicy(
      sourceAssignment.inventorySnapshotJson ?? sourceAssignment.character.inventoryJson,
    );

    const resolvedAt = new Date().toISOString();
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockSessionRuntime(tx, targetSession.id);
      const clonedCharacter = await tx.character.create({
        data: this.sessionCharacterTransferClonePayload.buildCharacterCreateData({
          requestedByUserId: request.requestedByUserId,
          targetScenarioId: targetScenario.scenarioId,
          sourceCharacter: sourceAssignment.character,
          transferableInventoryJson,
        }),
      });
      const sessionCharacter = await tx.sessionCharacter.create({
        data: this.sessionCharacterTransferClonePayload.buildSessionCharacterCreateData({
          targetSessionId: targetSession.id,
          requestedByUserId: request.requestedByUserId,
          clonedCharacter,
        }),
      });
      if (request.mode === "transfer") {
        await tx.sessionCharacter.update({
          where: { id: sourceAssignment.id },
          data: { status: PrismaSessionCharacterStatus.RETIRED },
        });
      }
      const nextRequest: P6CharacterTransferRequestFlag = {
        ...request,
        status: "approved",
        targetSessionCharacterId: sessionCharacter.id,
        sourceDisposition: request.mode === "transfer" ? "retired_after_transfer" : "copied",
        resolvedAt,
        approvedByUserId: userId,
      };
      await tx.gameState.update({
        where: { sessionScenarioId: targetScenario.id },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify(this.sessionCharacterTransferRequestStore.replaceAt(flags, requests, requestIndex, nextRequest)),
        },
      });
      return nextRequest;
    });

    this.realtimeEvents.emitSessionSnapshot(targetSession.id, await this.buildSnapshot(targetSession.id));
    return this.campaignArchiveRuntime.toCharacterTransferResponse(created);
  }

  async rejectCharacterTransfer(
    userId: string,
    targetSessionId: string,
    requestId: string,
  ): Promise<CharacterTransferResponseDto> {
    const targetSession = await this.getSessionEntityOrThrow(targetSessionId);
    this.ensureHost(userId, targetSession.hostUserId);
    const targetScenario = await this.getActiveSessionScenarioEntityOrThrow(targetSession.id);
    const targetState = targetScenario.gameState;
    if (!targetState) {
      throw new NotFoundException(`Game state for session ${targetSession.id} was not found.`);
    }
    const flags = this.parseRecordJson(targetState.flagsJson);
    const requests = this.campaignArchiveRuntime.parseCharacterTransferRequests(flags);
    const requestEntry = this.sessionCharacterTransferRequestStore.findByIdWithIndex(requests, requestId);
    if (!requestEntry) {
      throw new NotFoundException(`Character transfer request ${requestId} was not found.`);
    }
    const { request, requestIndex } = requestEntry;
    if (request.status === "rejected") {
      return this.campaignArchiveRuntime.toCharacterTransferResponse(request);
    }
    if (request.status !== "requested") {
      throw new ConflictException("거절 가능한 캐릭터 이관 요청이 아닙니다.");
    }

    const nextRequest: P6CharacterTransferRequestFlag = {
      ...request,
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      approvedByUserId: userId,
    };

    await this.prisma.gameState.update({
      where: { sessionScenarioId: targetScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify(this.sessionCharacterTransferRequestStore.replaceAt(flags, requests, requestIndex, nextRequest)),
      },
    });

    this.realtimeEvents.emitSessionSnapshot(targetSession.id, await this.buildSnapshot(targetSession.id));
    return this.campaignArchiveRuntime.toCharacterTransferResponse(nextRequest);
  }

  async revealCurrentNodeCluesAfterAction(params: {
    sessionScenarioId: string;
    nodeId: string;
    actionText: string;
    outcome: ActionOutcome;
    policyModes?: RevealPolicyMode[];
    turnLogId?: string | null;
    revealedBy?: string;
  }, client?: Prisma.TransactionClient): Promise<number> {
    return this.sessionReveal.revealCurrentNodeCluesAfterAction(
      this.createSessionRevealRuntime(),
      params,
      client,
    );
  }

  async revealCurrentNodeCluesAfterActionWithDetails(params: {
    sessionScenarioId: string;
    nodeId: string;
    actionText: string;
    outcome: ActionOutcome;
    policyModes?: RevealPolicyMode[];
    turnLogId?: string | null;
    revealedBy?: string;
  }, client?: Prisma.TransactionClient): Promise<Array<{ id: string; title: string; text: string | null }>> {
    return this.sessionReveal.revealCurrentNodeCluesAfterActionWithDetails(
      this.createSessionRevealRuntime(),
      params,
      client,
    );
  }

  async describeVttObjectAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{ message: string; checkOptions?: MainCommandCheckOptionDto[] } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).describeVttObjectAtPoint(params);
  }

  async revealVttObjectContentsAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    sessionCharacterId?: string | null;
    turnLogId?: string | null;
    revealedBy?: string;
    checkOption?: MainCommandCheckOptionDto | null;
  }): Promise<{
    count: number;
    revealedClues: Array<{ id: string; title: string; text: string | null }>;
    revealedItems: Array<{ id: string; name: string; quantity: number; description: string | null }>;
  }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).revealVttObjectContentsAtPoint(params);
  }

  async revealObservableVttObjectsInPartyVision(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
  }): Promise<{ count: number; objectNames: string[] }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).revealObservableVttObjectsInPartyVision(params);
  }

  async openVttDoorAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    itemId?: string | null;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: MainCommandCheckEffectDto;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).openVttDoorAtPoint(params);
  }

  async closeVttDoorAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).closeVttDoorAtPoint(params);
  }

  async triggerVttObjectEventAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    includeHiddenObject?: boolean;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).triggerVttObjectEventAtPoint(params);
  }

  async breakVttDoorAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: MainCommandCheckEffectDto;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).breakVttDoorAtPoint(params);
  }

  async breakVttObjectAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: MainCommandCheckEffectDto;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).breakVttObjectAtPoint(params);
  }

  async applyVttDoorCheckSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    doorId: string;
    nodeId: string;
    effect: typeof VTT_CHECK_EFFECT_ACTIONS.OPEN | typeof VTT_CHECK_EFFECT_ACTIONS.BROKEN;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttDoorCheckSuccess(params);
  }

  async applyVttObjectBreakSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    objectId: string;
    nodeId: string;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttObjectBreakSuccess(params);
  }

  async disarmVttHazardAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: MainCommandCheckEffectDto;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).disarmVttHazardAtPoint(params);
  }

  async applyVttHazardDisarmSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    hazardId: string;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttHazardDisarmSuccess(params);
  }

  async buildSnapshot(sessionId: string): Promise<SessionSnapshotDto> {
    return (this.sessionSnapshot ?? new SessionSnapshotService()).buildSnapshot(this.createSessionSnapshotRuntime(), sessionId);
  }

  async buildDetail(sessionId: string): Promise<SessionDetailResponseDto> {
    return (this.sessionSnapshot ?? new SessionSnapshotService()).buildDetail(this.createSessionSnapshotRuntime(), sessionId);
  }

  async buildPendingRestApprovals(sessionId: string): Promise<NonNullable<SessionSnapshotDto["pendingRestApprovals"]>> {
    return (this.sessionSnapshot ?? new SessionSnapshotService()).buildPendingRestApprovals(
      this.createSessionSnapshotRuntime(),
      sessionId,
    );
  }

  mapPlayerScenarioNode(
    node: Parameters<SessionRevealService["mapPlayerScenarioNode"]>[1],
    revealedClueSnapshots: Parameters<SessionRevealService["mapPlayerScenarioNode"]>[2] = new Map(),
  ): PlayerScenarioNodeDto {
    return (this.sessionReveal ?? new SessionRevealService()).mapPlayerScenarioNode(
      this.createSessionRevealRuntime(),
      node,
      revealedClueSnapshots,
    );
  }

  async findSessionScenarioRevealable(sessionScenarioId: string, contentId: string): Promise<RevealableScenarioClue> {
    const nodes = await this.prisma.sessionScenarioNode.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true, cluesJson: true },
    });

    for (const node of nodes) {
      const clues = parseJsonOrFallback(node.cluesJson, [], decodeLenientScenarioClueArray);
      const clue = clues.find((candidate) => candidate.id === contentId);
      if (clue) {
        return { ...clue, nodeId: node.nodeId };
      }
    }

    throw new NotFoundException(`Revealable content ${contentId} was not found in the active scenario.`);
  }

  async ensureMembership(userId: string, sessionId: string): Promise<void> {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before accessing it.");
    }
  }

  async updateParticipantConnectionStatus(userId: string, sessionId: string, status: PrismaConnectionStatus): Promise<void> {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    await this.sessionParticipantStatus.updateConnectionStatus({
      sessionId: resolvedSessionId,
      userId,
      status,
    });
  }

  async getSessionEntityOrThrow(sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        OR: [{ id: sessionId }, { publicId: sessionId }],
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    return this.ensureSessionPublicId(session);
  }

  async getGameStateEntityOrThrow(sessionId: string) {
    const sessionScenario = await this.getActiveSessionScenarioEntityOrThrow(sessionId);
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: sessionScenario.id },
    });

    if (!state) {
      throw new NotFoundException(`Game state for session ${sessionId} was not found.`);
    }

    return { sessionScenario, state };
  }

  private async getJoinedParticipantOrThrow(userId: string, sessionId: string) {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before accessing it.");
    }

    return participant;
  }

  private async joinSessionEntity(
    userId: string,
    session: {
      id: string;
      status: PrismaSessionStatus;
      maxParticipants: number;
    },
  ): Promise<SessionSnapshotDto> {
    const existingParticipant = await this.sessionJoinPolicy.ensureCanJoin({
      sessionId: session.id,
      userId,
      sessionStatus: session.status,
      maxParticipants: session.maxParticipants,
    });

    const participant = existingParticipant
      ? await this.prisma.sessionParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            role: existingParticipant.role === PrismaParticipantRole.HOST ? PrismaParticipantRole.HOST : PrismaParticipantRole.PLAYER,
            status: PrismaParticipantStatus.JOINED,
            joinedAt: new Date(),
            leftAt: null,
            connectionStatus: PrismaConnectionStatus.ONLINE,
          },
          include: {
            user: true,
            sessionCharacter: {
              select: {
                id: true,
                characterId: true,
              },
            },
          },
        })
      : await this.prisma.sessionParticipant.create({
          data: {
            sessionId: session.id,
            userId,
            role: PrismaParticipantRole.PLAYER,
            status: PrismaParticipantStatus.JOINED,
            connectionStatus: PrismaConnectionStatus.ONLINE,
          },
          include: {
            user: true,
            sessionCharacter: {
              select: {
                id: true,
                characterId: true,
              },
            },
          },
        });

    this.realtimeEvents.emitParticipantUpdated(session.id, mapParticipant(participant));
    const snapshot = await this.buildSnapshot(session.id);
    this.realtimeEvents.emitSessionSnapshot(session.id, snapshot);
    return snapshot;
  }

  private ensureHost(userId: string, hostUserId: string): void {
    return this.sessionAccessPolicy.ensureHost(userId, hostUserId);
  }

  private ensureGmRuntimeOperator(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): void {
    return this.sessionAccessPolicy.ensureGmRuntimeOperator(userId, session);
  }

  canUseGmRuntimeControls(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): boolean {
    return this.sessionAccessPolicy.canUseGmRuntimeControls(userId, session);
  }

  private canSeeGmOnlyRuntimeData(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): boolean {
    return this.sessionAccessPolicy.canSeeGmOnlyRuntimeData(userId, session);
  }

  private async getHumanGmSessionForOperator(userId: string, sessionId: string) {
    const session = await this.getSessionEntityOrThrow(sessionId);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw new ConflictException("This endpoint is only available for HUMAN GM sessions.");
    }

    this.ensureGmRuntimeOperator(userId, session);
    await this.ensureJoinedGmRuntimeParticipant(userId, session.id);
    return session;
  }

  private async getGmEconomySessionForOperator(userId: string, sessionId: string) {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureGmRuntimeOperator(userId, session);
    await this.ensureJoinedGmRuntimeParticipant(userId, session.id);
    return session;
  }

  private async ensureJoinedGmRuntimeParticipant(userId: string, sessionId: string): Promise<void> {
    return this.sessionGmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant(userId, sessionId);
  }

  private async createHumanGmOverrideTurnLog(params: {
    tx?: Prisma.TransactionClient;
    kind: GmOverrideKind;
    sessionId: string;
    sessionScenarioId: string;
    gmUserId: string;
    publicNarration: string;
    privateNote?: string | null;
    targetId?: string | null;
    statePatch?: JsonObject | null;
    metadata?: JsonObject | null;
  }): Promise<HumanGmOverrideLogResult> {
    const resolution = this.gmOverrideService.resolveOverride({
      kind: params.kind,
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      gmUserId: params.gmUserId,
      publicNarration: params.publicNarration,
      privateNote: params.privateNote,
      targetId: params.targetId,
      statePatch: params.statePatch,
      metadata: params.metadata,
    });

    if (!resolution.accepted) {
      throw new BadRequestException(`GM override rejected: ${resolution.rejectedReason}.`);
    }

    const client = params.tx ?? this.prisma;
    const latest = await client.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const privateNote = params.privateNote?.trim() || null;
    const state = resolution.stateDiff || privateNote
      ? await client.gameState.findUnique({
          where: { sessionScenarioId: params.sessionScenarioId },
          select: { version: true, flagsJson: true },
        })
      : null;
    const baseVersion = state?.version ?? 1;
    const nextVersion = resolution.stateDiff ? baseVersion + 1 : baseVersion;
    const stateDiff: StateDiffResponseDto | null = resolution.stateDiff
      ? decodeStateDiffResponse({
          baseVersion,
          nextVersion,
          reason: resolution.stateDiff.reason,
          diff: resolution.stateDiff.diff,
        })
      : null;

    const created = await client.turnLog.create({
      data: {
        sessionId: resolution.turnLog.sessionId,
        sessionScenarioId: resolution.turnLog.sessionScenarioId,
        actorUserId: resolution.turnLog.actorUserId,
        turnNumber: (latest?.turnNumber ?? 0) + 1,
        rawInput: resolution.turnLog.rawInput,
        structuredActionJson: JSON.stringify(decodeTurnLogStructuredAction(resolution.turnLog.structuredAction)),
        stateDiffJson: stateDiff ? JSON.stringify(decodeTurnLogStateDiff(stateDiff)) : null,
        outcome: PrismaActionOutcome.SUCCESS,
        narration: resolution.turnLog.narration,
      },
    });

    const nextFlagsJson = privateNote
      ? JSON.stringify(this.appendHumanGmPrivateNote(this.parseRecordJson(state?.flagsJson), {
          id: `gm-note:${created.id}`,
          turnLogId: created.id,
          kind: params.kind,
          targetId: resolution.turnLog.structuredAction.targetId,
          note: privateNote,
          gmUserId: params.gmUserId,
          createdAt: created.createdAt.toISOString(),
        }))
      : null;

    if (stateDiff || nextFlagsJson) {
      await client.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          ...(stateDiff ? { version: nextVersion } : {}),
          ...(nextFlagsJson ? { flagsJson: nextFlagsJson } : {}),
        },
      });
    }
    if (stateDiff) {
      await client.stateDiff.create({
        data: {
          sessionScenarioId: params.sessionScenarioId,
          turnLogId: created.id,
          baseVersion,
          nextVersion,
          reason: stateDiff.reason,
          diffJson: JSON.stringify(stateDiff.diff),
        },
      });
    }

    const turnLog: TurnLogResponseDto = {
      turnLogId: created.id,
      turnNumber: created.turnNumber,
      playerActionId: created.playerActionId,
      actorUserId: created.actorUserId,
      sessionCharacterId: created.sessionCharacterId,
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      actionQueueStatus: null,
      rawInput: created.rawInput,
      structuredAction: parseJsonOrFallback(created.structuredActionJson, null, decodeTurnLogStructuredAction),
      diceResult: null,
      stateDiff: parseJsonOrFallback(created.stateDiffJson, null, decodeTurnLogStateDiff),
      outcome: this.toSharedOutcome(created.outcome),
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    };

    return { turnLog, stateDiff };
  }

  private async createHumanGmAiAssistApplicationFailureTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    gmUserId: string;
    suggestion: HumanGmAiAssistSuggestionDto;
    failureReason: string;
    failedOperation?: string | null;
  }): Promise<HumanGmOverrideLogResult> {
    return this.sessionHumanGmAiAssistFailureAudit.createFailureTurnLog(params);
  }

  private appendHumanGmPrivateNote(flags: Record<string, unknown>, note: HumanGmPrivateNoteDto): Record<string, unknown> {
    return this.sessionHumanGmPrivateNoteStore.append(flags, note);
  }

  private async createCampaignArchiveAuditLog(
    tx: Prisma.TransactionClient,
    params: {
      sessionId: string;
      sessionScenarioId: string;
      actorUserId: string;
      archive: CampaignArchiveResponseDto;
      baseVersion: number;
      nextVersion: number;
    },
  ): Promise<void> {
    return this.sessionCampaignArchiveAudit.createCompletionAuditLog(tx, params);
  }

  private appendHumanGmAiAssistSuggestion(
    flags: Record<string, unknown>,
    suggestion: HumanGmAiAssistSuggestionDto,
  ): Record<string, unknown> {
    return this.sessionHumanGmAiAssistSuggestionStore.append(flags, suggestion);
  }

  private markHumanGmAiAssistSuggestionAccepted(
    flags: Record<string, unknown>,
    suggestionId: string,
    acceptedByUserId: string,
  ): Record<string, unknown> {
    return this.sessionHumanGmAiAssistSuggestionStore.markAccepted(flags, suggestionId, acceptedByUserId);
  }

  private getHumanGmAiAssistSuggestions(flags: Record<string, unknown>): HumanGmAiAssistSuggestionDto[] {
    return this.sessionHumanGmAiAssistSuggestionStore.list(flags);
  }

  private getHumanGmAiAssistSuggestion(
    flags: Record<string, unknown>,
    suggestionId: string,
  ): HumanGmAiAssistSuggestionDto | null {
    return this.sessionHumanGmAiAssistSuggestionStore.findById(flags, suggestionId);
  }

  private async transitionHumanGmCombat(userId: string, sessionId: string, phase: PrismaGamePhase): Promise<void> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);

    await this.prisma.$transaction(async (tx) => {
      if (session.status === PrismaSessionStatus.RECRUITING) {
        await this.ensureSessionScenarioNodeSnapshot(tx, activeScenario.id, activeScenario.scenarioId);
        if (activeScenario.gameState?.currentNodeId) {
          await this.recordNodeVisit(tx, {
            sessionScenarioId: activeScenario.id,
            nodeId: activeScenario.gameState.currentNodeId,
          });
        }
      }

      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: session.status === PrismaSessionStatus.COMPLETED ? PrismaSessionStatus.COMPLETED : PrismaSessionStatus.PLAYING,
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: { phase },
      });
      if (phase === PrismaGamePhase.EXPLORATION && activeScenario.gameState?.currentNodeId) {
        await this.recordCurrentNodeCluesByPolicy(tx, {
          sessionScenarioId: activeScenario.id,
          nodeId: activeScenario.gameState.currentNodeId,
          policyModes: ["POST_COMBAT"],
          revealedBy: "system",
          reason: "post_combat",
        });
      }
    });
  }

  private parseRecordJson(value: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrThrow(value, {}, "gameState.flagsJson");
  }

  private parseRecordJsonForRead(value: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrFallback(value);
  }

  private toSharedOutcome(value: PrismaActionOutcome): ActionOutcome {
    switch (value) {
      case PrismaActionOutcome.SUCCESS:
        return ActionOutcome.SUCCESS;
      case PrismaActionOutcome.FAILURE:
        return ActionOutcome.FAILURE;
      case PrismaActionOutcome.IMPOSSIBLE:
        return ActionOutcome.IMPOSSIBLE;
      case PrismaActionOutcome.NO_ROLL:
        return ActionOutcome.NO_ROLL;
    }
  }

  private async replaceSessionInventoryEntries(sessionCharacterId: string, inventory: InventoryItemDto[]): Promise<void> {
    return this.sessionInventory.replaceSessionInventoryEntries(sessionCharacterId, inventory);
  }

  private async grantSessionInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      sessionCharacterId: string;
      itemDefinitionId: string;
      quantity: number;
    },
  ): Promise<void> {
    return this.sessionInventory.grantSessionInventoryItem(tx, params);
  }

  private async removeSessionInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      sessionCharacterId: string;
      itemId: string;
      quantity: number;
    },
  ): Promise<{
    itemDefinitionId: string;
    itemName: string;
    itemType: string;
    removedQuantity: number;
  }> {
    return this.sessionInventory.removeSessionInventoryItem(tx, params);
  }

  private async refreshSessionInventorySnapshot(sessionCharacterId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    return this.sessionInventory.refreshSessionInventorySnapshot(sessionCharacterId, client);
  }

  private async buildDefaultVttMap(sessionId: string, scenarioNodeId: string | null): Promise<VttMapStateDto> {
    return this.sessionVttMapBootstrap.buildDefaultMap(sessionId, scenarioNodeId);
  }

  private async applyScenarioStartingPositions(sessionId: string, map: VttMapStateDto): Promise<VttMapStateDto> {
    return this.sessionVttMapBootstrap.applyScenarioStartingPositions(sessionId, map);
  }

  async getVttMapBaseline(
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
  ): Promise<VttMapStateDto> {
    const flags = this.parseRecordJsonForRead(state.flagsJson);
    const existingMap = this.readRuntimeVttMapFromFlags(flags);
    if (existingMap) {
      return this.applyScenarioStartingPositions(sessionId, existingMap);
    }

    const scenarioMap = await this.getScenarioDefaultVttMapForNode(sessionScenarioId, state.currentNodeId);
    if (scenarioMap) {
      const normalizedMap = this.normalizeVttMap(scenarioMap, state.currentNodeId ?? null);
      return this.applyScenarioStartingPositions(sessionId, normalizedMap);
    }

    return this.buildDefaultVttMap(sessionId, state.currentNodeId ?? null);
  }

  async getVttMapForSessionScenario(sessionId: string, sessionScenarioId: string): Promise<VttMapStateDto> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${sessionScenarioId} was not found.`);
    }

    return this.getVttMapBaseline(sessionId, sessionScenarioId, state);
  }

  async applyVttObjectProximityEvents(params: { sessionScenarioId: string; currentNodeId: string | null; map: VttMapStateDto }): Promise<VttMapStateDto> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttObjectProximityEvents(params);
  }

  async applyVttHazardDetections(params: {
    sessionId: string;
    sessionScenarioId: string;
    currentNodeId: string | null;
    previousMap: VttMapStateDto;
    map: VttMapStateDto;
  }): Promise<VttMapStateDto> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttHazardDetections(params);
  }

  async applyVttHazardTriggers(params: {
    sessionId: string;
    sessionScenarioId: string;
    currentNodeId?: string | null;
    previousMap: VttMapStateDto;
    map: VttMapStateDto;
  }): Promise<{ map: VttMapStateDto; triggered: boolean }> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).applyVttHazardTriggers(params);
  }

  redactVttMapForPlayer(map: VttMapStateDto): VttMapStateDto {
    return (this.sessionVttObjectRuntime ?? new SessionVttObjectRuntimeService())
      .create(this.createSessionVttObjectRuntime())
      .redactVttMapForPlayer(map);
  }

  async finalizeRuntimeVttMapChange(params: {
    session: { id: string; hostUserId: string };
    sessionScenarioId: string;
    currentNodeId: string | null;
    flags: Record<string, unknown>;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<{
    map: VttMapStateDto;
    playerMap: VttMapStateDto;
    hazardTriggered: boolean;
    hazardDetectionChanged: boolean;
    snapshotPublished: boolean;
  }> {
    // Keep VTT mutations in one sequence: proximity events, hazard triggers,
    // hazard discovery, persistence, redacted publish, then optional snapshot.
    let map = await this.applyVttObjectProximityEvents({
      sessionScenarioId: params.sessionScenarioId,
      currentNodeId: params.currentNodeId,
      map: params.map,
    });
    const hazardTriggerResult = await this.applyVttHazardTriggers({
      sessionId: params.session.id,
      sessionScenarioId: params.sessionScenarioId,
      map,
      previousMap: params.previousMap,
    });
    map = hazardTriggerResult.map;
    const beforeHazardDetectionMap = map;
    map = await this.applyVttHazardDetections({
      sessionId: params.session.id,
      sessionScenarioId: params.sessionScenarioId,
      currentNodeId: params.currentNodeId,
      map,
      previousMap: params.previousMap,
    });
    const hazardDetectionChanged = beforeHazardDetectionMap !== map;

    await this.sessionVttMapPersistence.saveMap({
      sessionScenarioId: params.sessionScenarioId,
      flags: params.flags,
      map,
    });

    const playerMap = this.redactVttMapForPlayer(map);
    this.sessionVttMapPersistence.publishMapUpdated({
      sessionId: params.session.id,
      hostUserId: params.session.hostUserId,
      previousHostMap: params.previousMap,
      previousPlayerMap: this.redactVttMapForPlayer(params.previousMap),
      hostMap: map,
      playerMap,
    });
    const snapshotPublished = hazardTriggerResult.triggered || hazardDetectionChanged;
    if (snapshotPublished) {
      this.sessionVttMapPersistence.publishSnapshot(params.session.id, await this.buildSnapshot(params.session.id));
    }

    return {
      map,
      playerMap,
      hazardTriggered: hazardTriggerResult.triggered,
      hazardDetectionChanged,
      snapshotPublished,
    };
  }

  async resolveVttMapInteractionPoint(
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
    dto: VttMapInteractionDto,
  ): Promise<{ x: number; y: number } | null> {
    const mapPoint = this.sessionVttInteractionPoint.resolveMapPoint(dto);
    if (mapPoint) {
      return mapPoint;
    }
    const targetId = this.sessionVttInteractionPoint.getTargetId(dto);
    if (!targetId) {
      return null;
    }
    const map = await this.getVttMapBaseline(sessionId, sessionScenarioId, state);
    return this.sessionVttInteractionPoint.resolveTargetPoint(map, targetId);
  }

  private async applyPlayerVttMapUpdate(
    userId: string,
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
    requestedMap: VttMapStateDto,
    allowFullMapShell = false,
  ): Promise<VttMapStateDto> {
    const baseline = await this.getVttMapBaseline(sessionId, sessionScenarioId, state);
    const controlledTokenIds = await this.getControlledSessionCharacterIds(userId, sessionId);
    const activeCombat = await this.prisma.combat.findFirst({
      where: { sessionId, status: PrismaCombatStatus.ACTIVE },
      include: { participants: { orderBy: { turnOrder: "asc" } } },
    });
    const currentCombatParticipant = activeCombat
      ? (activeCombat.participants.find((participant) => participant.id === activeCombat.currentParticipantId) ?? null)
      : null;
    this.logger.debug(
      `[VTT_PLAYER_UPDATE] sessionId=${sessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"} controlled=${JSON.stringify(Array.from(controlledTokenIds))} activeCombat=${activeCombat?.id ?? "none"} currentCombatParticipant=${currentCombatParticipant?.id ?? "none"} currentCombatSessionCharacter=${currentCombatParticipant?.sessionCharacterId ?? "none"}`,
    );
    if (activeCombat && (!currentCombatParticipant?.sessionCharacterId || !controlledTokenIds.has(currentCombatParticipant.sessionCharacterId))) {
      throw new ForbiddenException("Only the current combat actor can manipulate the map.");
    }
    const result = this.sessionVttPlayerMapUpdate.apply({
      baseline,
      comparableBaseline: allowFullMapShell ? baseline : this.redactVttMapForPlayer(baseline),
      requestedMap,
      controlledTokenIds,
      activeCombat,
      currentCombatParticipant,
    });

    await this.spendCombatMovement(activeCombat, result.movementSpends);

    return result.map;
  }

  async getControlledSessionCharacterIds(userId: string, sessionId: string): Promise<Set<string>> {
    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId,
        userId,
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      select: { id: true },
    });

    return new Set(sessionCharacters.map((character) => character.id));
  }

  private async spendCombatMovement(
    activeCombat: ActiveCombatForVttMovementSpend | null,
    movementSpends: VttCombatMovementSpend[],
  ): Promise<void> {
    return this.sessionVttCombatMovementSpend.spend(activeCombat, movementSpends);
  }

  ensureTokenPathIsReachable(map: VttMapStateDto, fromToken: VttMapStateDto["tokens"][number], toToken: VttMapStateDto["tokens"][number]): void {
    return this.sessionVttMovementPolicy.ensureTokenPathIsReachable(map, fromToken, toToken);
  }

  private calculateTokenStepTowardTarget(
    map: VttMapStateDto,
    params: {
      sourceTokenId: string;
      targetTokenId: string;
      maxDistanceFt: number;
      stopWithinFt: number;
    },
  ): { x: number; y: number; distanceMovedFt: number; path: Array<{ x: number; y: number }> } | null {
    return this.sessionVttMovementPolicy.calculateTokenStepTowardTarget(map, params);
  }

  private async emitVttTokenMovementFrames(params: {
    sessionId: string;
    hostUserId: string;
    map: VttMapStateDto;
    sourceTokenId: string;
    path: Array<{ x: number; y: number }>;
  }): Promise<void> {
    return this.sessionVttMovementFramePublisher.publish({
      ...params,
      redactVttMapForPlayer: this.redactVttMapForPlayer.bind(this),
    });
  }

  private isTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    return this.sessionVttMovementPolicy.isTokenPlacementBlocked(map, token, x, y, options);
  }

  private getTokenDestinationFromMapPoint(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    point: { x: number; y: number },
  ): { x: number; y: number } {
    return this.sessionVttMovementPolicy.getTokenDestinationFromMapPoint(map, token, point);
  }

  private ensurePlayerMapShellUnchanged(baseline: VttMapStateDto, requested: VttMapStateDto, allowFullMapShell = false): void {
    const comparableBaseline = allowFullMapShell ? baseline : this.redactVttMapForPlayer(baseline);
    return this.sessionVttMovementPolicy.ensurePlayerMapShellUnchanged({
      baseline,
      comparableBaseline,
      requested,
    });
  }

  private calculateTokenGridMovementFt(map: VttMapStateDto, fromToken: VttMapStateDto["tokens"][number], toToken: VttMapStateDto["tokens"][number]): number {
    return this.sessionVttMovementPolicy.calculateTokenGridMovementFt(map, fromToken, toToken);
  }

  private ensureOnlyTokenPositionChanged(baseline: VttMapStateDto["tokens"][number], requested: VttMapStateDto["tokens"][number]): void {
    return this.sessionVttMovementPolicy.ensureOnlyTokenPositionChanged(baseline, requested);
  }

  normalizeVttMap(map: VttMapStateDto, scenarioNodeId: string | null): VttMapStateDto {
    return this.sessionVttMapNormalization.normalize(map, scenarioNodeId);
  }

  normalizeInputVttMap(value: unknown, scenarioNodeId: string | null, label = "vttMap"): VttMapStateDto {
    try {
      return this.normalizeVttMap(decodeVttMapState(value), scenarioNodeId);
    } catch {
      throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
    }
  }

  readVttMapPointInput(value: unknown, label: string): { x: number; y: number } {
    if (!isRecord(value)) {
      throw new BadRequestException(`${label} must be an object.`);
    }
    return {
      x: this.readVttMapNumberInput(value.x, `${label}.x`),
      y: this.readVttMapNumberInput(value.y, `${label}.y`),
    };
  }

  readVttMapNumberInput(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number.`);
    }
    return value;
  }

  private readRuntimeVttMapFromFlags(flags: unknown): VttMapStateDto | null {
    return this.sessionVttMapNormalization.toVttMapFromFlags(flags);
  }

  clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private async getScenarioDefaultVttMapForNode(sessionScenarioId: string, nodeId: string | null | undefined): Promise<VttMapStateDto | null> {
    return this.sessionVttDefaultMapReader.getScenarioDefaultVttMapForNode(sessionScenarioId, nodeId);
  }

  private extractVttMapFromCheckOptions(value: string): VttMapStateDto | null {
    return this.sessionVttDefaultMapReader.extractVttMapFromCheckOptions(value);
  }

  private extractChecksFromCheckOptions(value: string): ScenarioCheckOptionDto[] {
    return this.sessionVttDefaultMapReader.extractChecksFromCheckOptions(value);
  }

  private async getSessionScenarioNodeEntityOrThrow(sessionScenarioId: string, nodeId: string) {
    return this.sessionScenarioNodeSnapshot.getNodeEntityOrThrow(sessionScenarioId, nodeId);
  }

  private async ensureSessionScenarioNodeSnapshotForScenario(sessionScenarioId: string, scenarioId: string): Promise<void> {
    return this.sessionScenarioNodeSnapshot.ensureForScenario(sessionScenarioId, scenarioId);
  }

  private async ensureSessionScenarioNodeSnapshot(tx: Prisma.TransactionClient, sessionScenarioId: string, scenarioId: string): Promise<void> {
    return this.sessionScenarioNodeSnapshot.ensure(tx, sessionScenarioId, scenarioId);
  }

  private buildP3ScenarioRevisionSnapshotFlag(scenario: {
    id: string;
    sourceType: string;
    baseScenarioId: string | null;
    attribution: string | null;
    updatedAt: Date;
  }): Record<string, unknown> {
    return this.sessionScenarioRevisionSnapshot.buildFlag(scenario);
  }

  private async recordCurrentNodeCluesByPolicy(
    tx: Prisma.TransactionClient,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      actionText?: string | null;
      outcome?: ActionOutcome | null;
      policyModes?: RevealPolicyMode[];
      revealedBy: string;
      reason?: string | null;
      turnLogId?: string | null;
    },
  ): Promise<Array<{ id: string; title: string; text: string | null }>> {
    return this.sessionReveal.recordCurrentNodeCluesByPolicy(this.createSessionRevealRuntime(), tx, params);
  }

  private getStringProperty(value: Record<string, unknown>, key: string): string | null {
    const candidate = value[key];
    return typeof candidate === "string" && candidate.trim() ? candidate : null;
  }

  private async recordNodeVisit(
    tx: Prisma.TransactionClient,
    params: { sessionScenarioId: string; nodeId: string; enteredByTurnLogId?: string | null },
  ): Promise<void> {
    return this.sessionReveal.recordNodeVisit(this.createSessionRevealRuntime(), tx, params);
  }

  private async recordSessionReveal(
    tx: Prisma.TransactionClient,
    params: RecordSessionRevealParams,
  ) {
    return this.sessionReveal.recordSessionReveal(this.createSessionRevealRuntime(), tx, params);
  }

  private async getActiveSessionScenarioEntityOrThrow(sessionId: string) {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    return this.sessionScenarioLink.getActiveEntityOrThrow(resolvedSessionId);
  }

  private async deleteSessionScenarioLinks(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
    return this.sessionScenarioLink.deleteLinks(tx, sessionId);
  }

  private getActiveSessionScenario<T extends { status: PrismaSessionScenarioStatus }>(sessionScenarios: T[]): T | null {
    return this.sessionScenarioLink.selectActive(sessionScenarios);
  }

  private async generateInviteCode(): Promise<string> {
    return this.sessionInvite.generateCode();
  }

  private async ensureSessionPublicId<T extends { id: string; publicId: string | null }>(
    session: T,
  ): Promise<Omit<T, "publicId"> & { publicId: string }> {
    return this.sessionPublicId.ensure(session);
  }

  private async generateSessionPublicId(): Promise<string> {
    return this.sessionPublicId.generate();
  }
}
