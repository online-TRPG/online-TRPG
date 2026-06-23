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
  ConnectionStatus,
  ActionOutcome,
  ApplySessionEconomyActionDto,
  CreateHumanGmAiAssistSuggestionDto,
  CreateSessionDto,
  CreateVttMapPingDto,
  DiceAdvantageState,
  GameStateResponseDto,
  GmMode,
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
  SessionVisibility,
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
} from "@trpg/shared-types";
import {
  mapGameState,
  mapParticipant,
  mapScenarioSummary,
  mapSession,
  mapSessionCharacter,
  mapSessionScenario,
  mapUser,
} from "../../common/mappers/domain.mapper";
import { generateEightDigitPublicId } from "../../common/utils/public-id";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { GmOverrideKind, GmOverrideService } from "../rules/gm-override.service";
import { ConcentrationRuntimeService } from "../rules/concentration-runtime.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { EconomyRuntimeService, EconomyState } from "../rules/economy-runtime.service";
import { EconomyStateRuntimeService } from "../rules/economy-state-runtime.service";
import { getExecutableItemDefinition } from "../rules/p3-item-manifest";
import { ScenariosService } from "../scenarios/scenarios.service";
import { UsersService } from "../users/users.service";
import { getRestApprovalCutoff, getRestApprovalExpiresAt } from "../actions/rest-approval-policy";
import { HumanGmRuntimeService } from "./human-gm-runtime.service";
import { SessionRevealService, type RevealPolicyMode } from "./session-reveal.service";
import { SessionSnapshotService } from "./session-snapshot.service";
import { SessionVttObjectRuntimeService } from "./session-vtt-object-runtime.service";

const sessionStatusToPrisma: Record<SessionStatus, PrismaSessionStatus> = {
  [SessionStatus.RECRUITING]: PrismaSessionStatus.RECRUITING,
  [SessionStatus.PLAYING]: PrismaSessionStatus.PLAYING,
  [SessionStatus.PAUSED]: PrismaSessionStatus.PAUSED,
  [SessionStatus.COMPLETED]: PrismaSessionStatus.COMPLETED,
  [SessionStatus.DISBANDED]: PrismaSessionStatus.DISBANDED,
};

const gmModeToPrisma: Record<GmMode, PrismaGmMode> = {
  [GmMode.AI]: PrismaGmMode.AI,
  [GmMode.HUMAN]: PrismaGmMode.HUMAN,
};

const participantRoleToApi: Record<PrismaParticipantRole, ParticipantRole> = {
  [PrismaParticipantRole.HOST]: ParticipantRole.HOST,
  [PrismaParticipantRole.GM]: ParticipantRole.GM,
  [PrismaParticipantRole.PLAYER]: ParticipantRole.PLAYER,
  [PrismaParticipantRole.SPECTATOR]: ParticipantRole.SPECTATOR,
};

const participantRoleToPrisma: Record<ParticipantRole, PrismaParticipantRole> = {
  [ParticipantRole.HOST]: PrismaParticipantRole.HOST,
  [ParticipantRole.GM]: PrismaParticipantRole.GM,
  [ParticipantRole.PLAYER]: PrismaParticipantRole.PLAYER,
  [ParticipantRole.SPECTATOR]: PrismaParticipantRole.SPECTATOR,
};

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

type ActiveCombatForPlayerMapUpdate = Prisma.CombatGetPayload<{
  include: { participants: true };
}>;

type HumanGmOverrideLogResult = {
  turnLog: TurnLogResponseDto;
  stateDiff: StateDiffResponseDto | null;
};

function isSessionListItem(item: SessionListItemResponseDto | null): item is SessionListItemResponseDto {
  return item !== null;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly gmOverrideService = new GmOverrideService();
  private readonly conditionRuntime = new ConditionRuntimeService();
  private readonly concentrationRuntime = new ConcentrationRuntimeService();
  private readonly economyRuntime = new EconomyRuntimeService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly scenariosService: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly humanGmRuntime: HumanGmRuntimeService = new HumanGmRuntimeService(),
    private readonly sessionReveal: SessionRevealService = new SessionRevealService(),
    private readonly sessionSnapshot: SessionSnapshotService = new SessionSnapshotService(),
    private readonly sessionVttObjectRuntime: SessionVttObjectRuntimeService = new SessionVttObjectRuntimeService(),
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
      parseJson: this.parseJson.bind(this),
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
      parseJson: this.parseJson.bind(this),
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

  createSessionVttObjectRuntime() {
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
      parseJson: this.parseJson.bind(this),
      recordSessionReveal: this.recordSessionReveal.bind(this),
      rectsOverlap: this.rectsOverlap.bind(this),
      refreshSessionInventorySnapshot: this.refreshSessionInventorySnapshot.bind(this),
    };
  }

  async createSession(userId: string, dto: CreateSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);

    const scenario = dto.scenarioId
      ? await this.scenariosService.getScenarioEntityForViewer(dto.scenarioId, userId)
      : await this.scenariosService.getDefaultScenarioEntity();

    const startNodeId = this.resolveScenarioStartNodeId(scenario.nodes, scenario.startNodeId);
    if (!startNodeId) {
      throw new UnprocessableEntityException("The selected scenario does not have a start node.");
    }

    const inviteCode = await this.generateInviteCode();
    const visibility = this.resolveVisibility(dto.visibility, dto.isPrivate, dto.isPublic);
    const gmMode = gmModeToPrisma[dto.gmMode];
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
          flagsJson: JSON.stringify({
            p3ScenarioRevisionSnapshot: this.buildP3ScenarioRevisionSnapshotFlag(
              scenario,
            ),
          }),
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
    const where: Prisma.SessionWhereInput = {
      visibility: PrismaSessionVisibility.PUBLIC,
      status: params.status ? sessionStatusToPrisma[params.status] : PrismaSessionStatus.RECRUITING,
      // 삭제된 호스트가 남긴 공개 세션은 목록 DTO 조립 중 404를 만들 수 있어 조회 단계에서 제외한다.
      host: {
        is: {
          deletedAt: null,
        },
      },
      ruleSetId: params.ruleSetId,
      sessionScenarios: params.scenarioId
        ? {
            some: {
              scenarioId: params.scenarioId,
              status: PrismaSessionScenarioStatus.ACTIVE,
            },
          }
        : {
            some: {},
          },
    };

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

    const items = (
      await Promise.all(
        sessions.map(async (session): Promise<SessionListItemResponseDto | null> => {
          const ensuredSession = await this.ensureSessionPublicId(session);
          const activeScenario = this.getActiveSessionScenario(ensuredSession.sessionScenarios);
          if (!activeScenario) {
            return null;
          }

          // 이미 include로 가져온 host를 사용하면, 목록 조립 중 추가 사용자 조회 실패로 전체 응답이 깨지는 일을 막을 수 있다.
          return {
            session: mapSession(ensuredSession),
            scenario: mapScenarioSummary(activeScenario.scenario),
            host: mapUser(ensuredSession.host),
            owner: mapUser(ensuredSession.host),
            participantCount: ensuredSession.participants.length,
            availableSlots: Math.max(ensuredSession.maxParticipants - ensuredSession.participants.length, 0),
            role: this.getParticipantRoleForUser(ensuredSession.participants, params.requesterUserId),
          };
        }),
      )
    ).filter(isSessionListItem);

    return { items, totalElements };
  }

  async joinSessionById(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);
    const session = await this.getSessionEntityOrThrow(sessionId);
    return this.joinSessionEntity(userId, session);
  }

  async joinSessionByInvite(userId: string, dto: JoinSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);

    const session = await this.prisma.session.findUnique({
      where: { inviteCode: dto.inviteCode.trim().toUpperCase() },
    });

    if (!session) {
      throw new NotFoundException("Session with this invite code was not found.");
    }

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

      if (!remainingParticipants.length) {
        await this.deleteSessionScenarioLinks(tx, resolvedSessionId);
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { status: PrismaSessionStatus.DISBANDED },
        });
        canEmitSnapshot = false;
        return;
      }

      if (session.gmUserId === userId) {
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { gmUserId: null },
        });
      }

      if (session.hostUserId === userId) {
        const nextHost = remainingParticipants[0];

        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { hostUserId: nextHost.userId },
        });

        await tx.sessionParticipant.update({
          where: {
            sessionId_userId: {
              sessionId: resolvedSessionId,
              userId: nextHost.userId,
            },
          },
          data: {
            role: session.gmUserId === nextHost.userId ? PrismaParticipantRole.GM : PrismaParticipantRole.HOST,
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
    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaParticipantStatus.JOINED,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return participants.map(mapParticipant);
  }

  async getParticipantStatusesForUser(userId: string, sessionId: string): Promise<ParticipantStatusResponseDto[]> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaParticipantStatus.JOINED,
      },
      select: {
        userId: true,
        connectionStatus: true,
      },
      orderBy: { joinedAt: "asc" },
    });

    return participants.map((participant) => ({
      userId: participant.userId,
      connectionStatus: participant.connectionStatus === PrismaConnectionStatus.ONLINE ? ConnectionStatus.ONLINE : ConnectionStatus.OFFLINE,
    }));
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
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const existingMap = this.toVttMapOrNull(flags.vttMap);
    const canSeeGmMap = this.canSeeGmOnlyRuntimeData(userId, session);

    if (existingMap) {
      const map = await this.applyScenarioStartingPositions(resolvedSessionId, existingMap);
      if (JSON.stringify(map.tokens) !== JSON.stringify(existingMap.tokens)) {
        await this.prisma.gameState.update({
          where: { sessionScenarioId: sessionScenario.id },
          data: {
            flagsJson: JSON.stringify({
              ...flags,
              vttMap: map,
            }),
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

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const requestedMap = this.normalizeVttMap(dto.map, state.currentNodeId ?? null);
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

    let map = requestedMap;
    map = await this.applyVttObjectProximityEvents({
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
    });
    const hazardTriggerResult = await this.applyVttHazardTriggers({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      map,
      previousMap,
    });
    map = hazardTriggerResult.map;
    const beforeHazardDetectionMap = map;
    map = await this.applyVttHazardDetections({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
      previousMap,
    });
    const hazardDetectionChanged = beforeHazardDetectionMap !== map;

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: map,
        }),
      },
    });

    const playerMap = this.redactVttMapForPlayer(map);
    this.realtimeEvents.emitVttMapUpdated(resolvedSessionId, {
      hostUserId: session.hostUserId,
      hostMap: map,
      playerMap,
    });
    if (hazardTriggerResult.triggered || hazardDetectionChanged) {
      this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    }
    return session.hostUserId === userId ? map : playerMap;
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

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
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

    const requestedToken = {
      ...token,
      x: this.clampNumber(Math.floor(dto.to.x), 0, Math.max(0, previousMap.width - token.size)),
      y: this.clampNumber(Math.floor(dto.to.y), 0, Math.max(0, previousMap.height - token.size)),
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
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const now = Date.now();
    const map: VttMapStateDto = {
      ...previousMap,
      pings: [
        ...(previousMap.pings ?? []).filter((ping) => Date.parse(ping.expiresAt) > now).slice(-4),
        {
          id: `ping:${randomUUID()}`,
          x: this.clampNumber(Math.floor(dto.x), 0, previousMap.width),
          y: this.clampNumber(Math.floor(dto.y), 0, previousMap.height),
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
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
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

    let map: VttMapStateDto = {
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
    map = await this.applyVttObjectProximityEvents({
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
    });
    const hazardTriggerResult = await this.applyVttHazardTriggers({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      map,
      previousMap,
    });
    map = hazardTriggerResult.map;
    map = await this.applyVttHazardDetections({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
      previousMap,
    });

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: map,
        }),
      },
    });

    this.realtimeEvents.emitVttMapUpdated(resolvedSessionId, {
      hostUserId: session.hostUserId,
      hostMap: map,
      playerMap: this.redactVttMapForPlayer(map),
    });
    if (hazardTriggerResult.triggered) {
      this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    }

    return { map, moved: true, distanceMovedFt: movement.distanceMovedFt };
  }

  async hideVttToken(sessionId: string, tokenId: string): Promise<VttMapStateDto | null> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(session.id);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.getVttMapBaseline(session.id, sessionScenario.id, state);
    const targetToken = previousMap.tokens.find((token) => token.id === tokenId);
    if (!targetToken || targetToken.hidden === true) {
      return targetToken ? previousMap : null;
    }

    const map: VttMapStateDto = {
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

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: map,
        }),
      },
    });

    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: map,
      playerMap: this.redactVttMapForPlayer(map),
    });

    return map;
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
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
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

    let map: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((candidate) => (candidate.id === token.id ? requestedToken : candidate)),
      updatedAt: new Date().toISOString(),
    };
    map = await this.applyVttObjectProximityEvents({
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
    });
    const hazardTriggerResult = await this.applyVttHazardTriggers({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      map,
      previousMap,
    });
    map = hazardTriggerResult.map;
    map = await this.applyVttHazardDetections({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
      previousMap,
    });

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: map,
        }),
      },
    });

    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: map,
      playerMap: this.redactVttMapForPlayer(map),
    });
    if (hazardTriggerResult.triggered) {
      this.realtimeEvents.emitSessionSnapshot(session.id, await this.buildSnapshot(session.id));
    }

    return {
      status: MainCommandStatus.RESOLVED,
      message: `${token.name}이(가) 목표 위치로 이동했습니다.`,
      map,
    };
  }

  async getPlayerScenarioForUser(userId: string, sessionId: string): Promise<PlayerScenarioViewDto> {
    return this.sessionReveal.getPlayerScenarioForUser(this.createSessionRevealRuntime(), userId, sessionId);
  }

  async getPublicClueSummariesForUser(userId: string, sessionId: string): Promise<string[]> {
    return this.sessionReveal.getPublicClueSummariesForUser(this.createSessionRevealRuntime(), userId, sessionId);
  }

  async revealSessionContent(userId: string, sessionId: string, dto: RevealSessionContentDto): Promise<SessionRevealResponseDto> {
    return this.sessionReveal.revealSessionContent(this.createSessionRevealRuntime(), userId, sessionId, dto);
  }

  async updateSession(userId: string, sessionId: string, dto: UpdateSessionDto): Promise<SessionResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureHost(userId, session.hostUserId);

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be updated.");
    }

    const nextMaxParticipants = dto.maxParticipants ?? dto.maxPlayers;
    if (nextMaxParticipants !== undefined) {
      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: resolvedSessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (nextMaxParticipants < participantCount) {
        throw new ConflictException("maxParticipants cannot be smaller than the participant count.");
      }
    }

    if (dto.captainUserId !== undefined && dto.captainUserId !== null) {
      const captainMember = await this.prisma.sessionParticipant.findFirst({
        where: {
          sessionId: resolvedSessionId,
          userId: dto.captainUserId,
          status: PrismaParticipantStatus.JOINED,
        },
        select: { id: true },
      });
      if (!captainMember) {
        throw new ConflictException("captainUserId must be a JOINED participant of the session.");
      }
    }

    const updated = await this.prisma.session.update({
      where: { id: resolvedSessionId },
      data: {
        title: dto.title?.trim() ?? session.title,
        description: dto.description?.trim() ?? session.description,
        maxParticipants: nextMaxParticipants ?? session.maxParticipants,
        visibility: this.resolveVisibility(dto.visibility, dto.isPrivate, dto.isPublic, session.visibility),
        gmMode: dto.gmMode ? gmModeToPrisma[dto.gmMode] : session.gmMode,
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

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw new ConflictException("GM can only be assigned in HUMAN GM sessions.");
    }
    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("GM can only be assigned while the session is recruiting.");
    }

    const targetParticipant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId: dto.gmUserId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });
    if (!targetParticipant || targetParticipant.status !== PrismaParticipantStatus.JOINED) {
      throw new ConflictException("gmUserId must be a JOINED participant of the session.");
    }

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

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be deleted.");
    }

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

    const where: Prisma.SessionWhereInput = {
      status: params.status ? sessionStatusToPrisma[params.status] : undefined,
      ruleSetId: params.ruleSetId,
      sessionScenarios: params.scenarioId
        ? {
            some: {
              scenarioId: params.scenarioId,
              status: PrismaSessionScenarioStatus.ACTIVE,
            },
          }
        : {
            some: {},
          },
      participants: {
        some: {
          userId,
          status: PrismaParticipantStatus.JOINED,
          role: params.role ? participantRoleToPrisma[params.role] : undefined,
        },
      },
    };

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

    const items = (
      await Promise.all(
        sessions.map(async (session): Promise<SessionListItemResponseDto | null> => {
          const ensuredSession = await this.ensureSessionPublicId(session);
          const activeScenario = this.getActiveSessionScenario(ensuredSession.sessionScenarios);
          if (!activeScenario) {
            return null;
          }

          // 내 세션 목록도 include된 host를 재사용해, soft delete된 계정 때문에 목록 전체가 실패하지 않도록 한다.
          return {
            session: mapSession(ensuredSession),
            scenario: mapScenarioSummary(activeScenario.scenario),
            host: mapUser(ensuredSession.host),
            owner: mapUser(ensuredSession.host),
            participantCount: ensuredSession.participants.length,
            availableSlots: Math.max(ensuredSession.maxParticipants - ensuredSession.participants.length, 0),
            role: this.getParticipantRoleForUser(ensuredSession.participants, userId),
          };
        }),
      )
    ).filter(isSessionListItem);

    return { items, totalElements };
  }

  async selectCharacterForSession(userId: string, sessionId: string, dto: SelectSessionCharacterDto): Promise<SessionParticipantResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before selecting a character.");
    }

    if (participant.role === PrismaParticipantRole.GM) {
      throw new ConflictException("The HUMAN GM does not select a player character.");
    }

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Characters can only be selected while the session is recruiting.");
    }

    if (!dto.characterId) {
      await this.prisma.sessionCharacter.deleteMany({
        where: {
          sessionId: resolvedSessionId,
          userId,
        },
      });

      const updatedParticipant = await this.prisma.sessionParticipant.update({
        where: { id: participant.id },
        data: {
          isReady: false,
          readyAt: null,
        },
        include: {
          user: true,
          sessionCharacter: {
            include: { character: true },
          },
        },
      });

      const mappedParticipant = mapParticipant(updatedParticipant);
      this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mappedParticipant);
      this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
      return mappedParticipant;
    }

    const character = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
      include: {
        sessionCharacters: {
          include: { session: true },
        },
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${dto.characterId} was not found.`);
    }

    if (character.ownerUserId !== userId) {
      throw new ForbiddenException("You can only select your own character.");
    }

    const activeAssignment = character.sessionCharacters.find(
      (assignment) =>
        assignment.sessionId !== resolvedSessionId &&
        assignment.session.status !== PrismaSessionStatus.COMPLETED &&
        assignment.session.status !== PrismaSessionStatus.DISBANDED,
    );

    if (activeAssignment) {
      throw new ConflictException("이미 다른 세션에서 플레이 중인 캐릭터입니다. 다른 세션에서 해당 캐릭터를 선택 해제한 후 다시 시도해주세요.");
    }

    const sessionCharacter = await this.prisma.sessionCharacter.upsert({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
      update: {
        characterId: character.id,
        status: PrismaSessionCharacterStatus.ACTIVE,
        currentHp: character.maxHp,
        tempHp: 0,
        conditionsJson: JSON.stringify([]),
        inventorySnapshotJson: character.inventoryJson,
      },
      create: {
        sessionId: resolvedSessionId,
        userId,
        characterId: character.id,
        status: PrismaSessionCharacterStatus.ACTIVE,
        currentHp: character.maxHp,
        tempHp: 0,
        conditionsJson: JSON.stringify([]),
        inventorySnapshotJson: character.inventoryJson,
      },
      include: { character: true },
    });

    await this.replaceSessionInventoryEntries(sessionCharacter.id, this.parseJson<InventoryItemDto[]>(character.inventoryJson, []));
    const sessionCharacterWithInventory = await this.prisma.sessionCharacter.findUniqueOrThrow({
      where: { id: sessionCharacter.id },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const updatedParticipant = await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        isReady: false,
        readyAt: null,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    const mappedParticipant = mapParticipant(updatedParticipant);
    this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mappedParticipant);
    this.realtimeEvents.emitCharacterUpdated(resolvedSessionId, mapSessionCharacter(sessionCharacterWithInventory));
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    return mappedParticipant;
  }

  async updateParticipantReadyState(userId: string, sessionId: string, dto: UpdateParticipantReadyDto): Promise<SessionParticipantResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before updating ready state.");
    }

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Ready state can only be changed while the session is recruiting.");
    }

    if (participant.role === PrismaParticipantRole.GM) {
      const updatedParticipant = await this.prisma.sessionParticipant.update({
        where: { id: participant.id },
        data: {
          isReady: true,
          readyAt: participant.readyAt ?? new Date(),
        },
        include: {
          user: true,
          sessionCharacter: {
            include: { character: true },
          },
        },
      });

      const mappedParticipant = mapParticipant(updatedParticipant);
      this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mappedParticipant);
      this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
      return mappedParticipant;
    }

    if (dto.isReady && !participant.sessionCharacter) {
      throw new ConflictException("Select a character before marking yourself ready.");
    }

    const updatedParticipant = await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        isReady: dto.isReady,
        readyAt: dto.isReady ? new Date() : null,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    const mappedParticipant = mapParticipant(updatedParticipant);
    this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mappedParticipant);
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
            include: { character: true },
          },
        },
      })
      .catch(() => {
        throw new ForbiddenException("You must join the session before resuming it.");
      });

    const mapped = mapParticipant(participant);
    this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mapped);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
    return this.buildSnapshot(resolvedSessionId);
  }

  async getInviteInfo(userId: string, sessionId: string): Promise<SessionInviteResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const appBaseUrl = process.env.APP_BASE_URL?.trim();

    return {
      sessionId: resolvedSessionId,
      inviteCode: session.inviteCode,
      shareUrl: appBaseUrl ? `${appBaseUrl}/join/${session.inviteCode}` : null,
    };
  }

  async startSession(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureGmRuntimeOperator(userId, session);

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be started.");
    }

    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaParticipantStatus.JOINED,
      },
      include: {
        sessionCharacter: true,
      },
      orderBy: { joinedAt: "asc" },
    });

    if (!participants.length) {
      throw new ConflictException("At least one participant is required to start the session.");
    }

    const playerParticipants = participants.filter((participant) => participant.role !== PrismaParticipantRole.GM);
    if (session.gmMode === PrismaGmMode.HUMAN) {
      const gmUserId = session.gmUserId ?? session.hostUserId;
      const gmParticipant = participants.find((participant) => participant.userId === gmUserId && participant.role === PrismaParticipantRole.GM);
      if (!gmParticipant) {
        throw new ConflictException("A HUMAN GM session requires a joined GM participant.");
      }
    }

    if (!playerParticipants.length) {
      throw new ConflictException("At least one player is required to start the session.");
    }

    const participantWithoutCharacter = playerParticipants.find((participant) => !participant.sessionCharacter);
    if (participantWithoutCharacter) {
      throw new ConflictException("All players must select a character before the session starts.");
    }

    const participantNotReady = playerParticipants.find((participant) => !participant.isReady);
    if (participantNotReady) {
      throw new ConflictException("All players must be ready before the session starts.");
    }

    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const state = activeScenario.gameState;
    await this.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const currentNodeId = state?.currentNodeId ?? null;
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const existingMap = this.toVttMapOrNull(flags.vttMap);
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
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: runtimeMap,
          }),
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
    const baseState = this.ensureEconomyState(stateRuntime.readEconomyStateFromFlags(gameState?.flagsJson));
    const state = this.prepareEconomyStateForAction(baseState, dto);
    const result = this.resolveEconomyAction(state, dto);
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
      result.auditEvent.sessionCharacterId &&
      result.auditEvent.itemDefinitionId &&
      result.auditEvent.quantity
    ) {
      await this.prisma.$transaction(async (tx) => {
        await this.grantSessionInventoryItem(tx, {
          sessionCharacterId: result.auditEvent.sessionCharacterId as string,
          itemDefinitionId: result.auditEvent.itemDefinitionId as string,
          quantity: result.auditEvent.quantity as number,
        });
        await this.refreshSessionInventorySnapshot(result.auditEvent.sessionCharacterId as string, tx);
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

  private ensureEconomyState(state: EconomyState | null): EconomyState {
    return state ?? {
      partyStash: [],
      walletsBySessionCharacterId: {},
      shopStatesById: {},
      craftingProgressById: {},
    };
  }

  private prepareEconomyStateForAction(
    state: EconomyState,
    dto: ApplySessionEconomyActionDto,
  ): EconomyState {
    const next: EconomyState = {
      partyStash: state.partyStash.map((item) => ({ ...item })),
      walletsBySessionCharacterId: Object.fromEntries(
        Object.entries(state.walletsBySessionCharacterId).map(([key, wallet]) => [key, { ...wallet }]),
      ),
      shopStatesById: Object.fromEntries(
        Object.entries(state.shopStatesById).map(([shopId, shop]) => [
          shopId,
          { ...shop, inventory: shop.inventory.map((item) => ({ ...item })) },
        ]),
      ),
      craftingProgressById: Object.fromEntries(
        Object.entries(state.craftingProgressById).map(([key, progress]) => [key, { ...progress }]),
      ),
    };
    const sessionCharacterId = dto.sessionCharacterId?.trim();
    if (sessionCharacterId && dto.currency && dto.actionType !== "grant_reward") {
      next.walletsBySessionCharacterId[sessionCharacterId] = {
        ...(next.walletsBySessionCharacterId[sessionCharacterId] ?? {}),
        ...this.normalizeEconomyWallet(dto.currency),
      };
    }
    if (dto.actionType === "purchase" && dto.shopId && dto.itemDefinitionId && dto.priceGp !== undefined) {
      const shopId = dto.shopId.trim();
      const shop = next.shopStatesById[shopId] ?? { shopId, inventory: [] };
      const existing = shop.inventory.find((item) => item.itemDefinitionId === dto.itemDefinitionId);
      if (!existing) {
        shop.inventory.push({
          itemDefinitionId: dto.itemDefinitionId,
          quantity: dto.stockQuantity ?? dto.quantity ?? 1,
          priceGp: dto.priceGp,
        });
      }
      next.shopStatesById[shopId] = shop;
    }
    if (dto.actionType !== "grant_reward") {
      for (const item of dto.items ?? []) {
        const existing = next.partyStash.find((candidate) => candidate.itemDefinitionId === item.itemDefinitionId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          next.partyStash.push({ ...item });
        }
      }
    }
    return next;
  }

  private resolveEconomyAction(
    state: EconomyState,
    dto: ApplySessionEconomyActionDto,
  ): ReturnType<EconomyRuntimeService["purchaseFromShop"]> {
    const sessionCharacterId = dto.sessionCharacterId?.trim() || "";
    const itemDefinitionId = dto.itemDefinitionId?.trim() || "";
    const shopId = dto.shopId?.trim() || "";
    switch (dto.actionType) {
      case "purchase":
        return this.economyRuntime.purchaseFromShop({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          shopId: this.requireEconomyField(shopId, "shopId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
        });
      case "sell":
        return this.economyRuntime.sellToShop({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          shopId: this.requireEconomyField(shopId, "shopId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
          basePriceGp: dto.priceGp ?? 0,
        });
      case "grant_reward":
        return this.economyRuntime.grantReward({
          state,
          recipientSessionCharacterIds: sessionCharacterId ? [sessionCharacterId] : Object.keys(state.walletsBySessionCharacterId),
          reward: {
            rewardId: dto.rewardId?.trim() || `reward:${Date.now()}`,
            currency: dto.currency ? this.normalizeEconomyWallet(dto.currency) : undefined,
            items: dto.items?.map((item) => ({ ...item })),
            splitCurrency: dto.splitCurrency ?? false,
          },
        });
      case "distribute":
        return this.economyRuntime.distributeFromPartyStash({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
        });
      case "start_crafting":
        return this.economyRuntime.startCrafting({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          craftingId: dto.craftingId?.trim() || `crafting:${Date.now()}`,
          knownToolProficiencies: dto.knownToolProficiencies ?? [],
          recipe: {
            recipeId: this.requireEconomyField(dto.recipeId?.trim() || "", "recipeId"),
            outputItemDefinitionId: this.requireEconomyField(
              dto.outputItemDefinitionId?.trim() || itemDefinitionId,
              "outputItemDefinitionId",
            ),
            outputQuantity: dto.outputQuantity ?? dto.quantity ?? 1,
            requiredMaterials: dto.requiredMaterials?.map((item) => ({ ...item })) ?? [],
            requiredToolProficiencies: dto.requiredToolProficiencies ?? [],
            laborHours: dto.laborHours ?? 1,
            costGp: dto.costGp,
          },
        });
      case "progress_crafting":
        return this.economyRuntime.progressCrafting({
          state,
          craftingId: this.requireEconomyField(dto.craftingId?.trim() || "", "craftingId"),
          laborHours: dto.laborHours ?? 1,
        });
      case "identify":
        return this.economyRuntime.identifyItem({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          costGp: dto.costGp,
        });
      case "repair":
        return this.economyRuntime.repairItem({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          costGp: dto.costGp,
        });
      case "attune":
        return this.economyRuntime.attuneItem({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          requiresAttunement:
            dto.requiresAttunement ?? getExecutableItemDefinition(itemDefinitionId)?.requiresAttunement ?? true,
        });
      case "recover_charges":
        return this.economyRuntime.recoverItemCharges({
          state,
          sessionCharacterId: this.requireEconomyField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireEconomyField(itemDefinitionId, "itemDefinitionId"),
          chargesRecovered: dto.chargesRecovered ?? 1,
          maximumCharges: dto.maximumCharges ?? getExecutableItemDefinition(itemDefinitionId)?.maxCharges ?? 1,
        });
      default:
        throw new BadRequestException("Unsupported economy action.");
    }
  }

  private normalizeEconomyWallet(wallet: {
    cp?: number;
    sp?: number;
    ep?: number;
    gp?: number;
    pp?: number;
  }): { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number } {
    return Object.fromEntries(
      (["cp", "sp", "ep", "gp", "pp"] as const)
        .map((key) => [key, Math.trunc(Number(wallet[key] ?? 0))] as const)
        .filter(([, value]) => Number.isFinite(value) && value !== 0),
    );
  }

  private requireEconomyField(value: string, fieldName: string): string {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required for this economy action.`);
    }
    return value;
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const notes = Array.isArray(flags.gmPrivateNotes) ? flags.gmPrivateNotes : [];
    return notes
      .filter((note): note is HumanGmPrivateNoteDto => this.isHumanGmPrivateNote(note))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
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
    const initialFlags = this.parseJson<Record<string, unknown>>(initialState?.flagsJson, {});
    const suggestion = this.getHumanGmAiAssistSuggestions(initialFlags).find((candidate) => candidate.id === dto.suggestionId);
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
      const currentFlags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
      const currentSuggestion = this.getHumanGmAiAssistSuggestions(currentFlags).find((candidate) => candidate.id === dto.suggestionId);
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
      const mergedFlags = this.parseJson<Record<string, unknown>>(mergedState?.flagsJson, {});
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const suggestion = this.getHumanGmAiAssistSuggestions(flags).find((candidate) => candidate.id === dto.suggestionId);
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const currentNodeId = state?.currentNodeId ?? null;
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === "string")
      : [];
    const nextCompletedCombatNodeIds =
      currentNodeId && !completedCombatNodeIds.includes(currentNodeId) ? [...completedCombatNodeIds, currentNodeId] : completedCombatNodeIds;

    this.logger.debug(
      `[COMBAT_COMPLETE_STATE] sessionId=${resolvedSessionId} combatId=${combatId ?? "active"} currentNodeId=${currentNodeId ?? "null"} previousPhase=${state?.phase ?? "null"} nextCompletedCombatNodeIds=${JSON.stringify(nextCompletedCombatNodeIds)}`,
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
            flagsJson: JSON.stringify({
              ...flags,
              completedCombatNodeIds: nextCompletedCombatNodeIds,
            }),
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
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
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
            flagsJson: JSON.stringify({
              ...flags,
              partyDefeated: true,
              partyDefeatedAt: defeatedAt.toISOString(),
              defeatedCombatNodeId: state.currentNodeId ?? null,
            }),
          },
        });
      }
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  private async lockSessionRuntime(tx: unknown, sessionId: string): Promise<void> {
    const client = tx as { $executeRaw?: Prisma.TransactionClient["$executeRaw"] };
    if (!client.$executeRaw) {
      return;
    }
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
  }

  async completeSessionFromEndingNode(params: { sessionId: string; sessionScenarioId: string; nodeId: string; reason: string }): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(params.sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    if (activeScenario.id !== params.sessionScenarioId) {
      throw new ConflictException("The ending node does not belong to the active session scenario.");
    }

    const state = activeScenario.gameState;
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
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
            flagsJson: JSON.stringify({
              ...flags,
              sessionCompletedAt: completedAt.toISOString(),
              completedNodeId: params.nodeId,
              completionReason: params.reason,
            }),
          },
        });
      }
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionStatusUpdated(resolvedSessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
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
    checkEffect?: Record<string, unknown>;
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
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).breakVttDoorAtPoint(params);
  }

  async breakVttObjectAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: { x: number; y: number } }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.sessionVttObjectRuntime.create(this.createSessionVttObjectRuntime()).breakVttObjectAtPoint(params);
  }

  async applyVttDoorCheckSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    doorId: string;
    nodeId: string;
    effect: "open" | "broken";
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
    checkEffect?: Record<string, unknown>;
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

  async findSessionScenarioRevealable(sessionScenarioId: string, contentId: string): Promise<Record<string, unknown>> {
    const nodes = await this.prisma.sessionScenarioNode.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true, cluesJson: true },
    });

    for (const node of nodes) {
      const clues = this.parseJson<Record<string, unknown>[]>(node.cluesJson, []);
      const clue = clues.find((candidate) => this.getStringProperty(candidate, "id") === contentId);
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
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: resolvedSessionId,
          userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      return;
    }

    if (participant.connectionStatus === status) {
      return;
    }

    const updatedParticipant = await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        connectionStatus: status,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    this.realtimeEvents.emitParticipantUpdated(resolvedSessionId, mapParticipant(updatedParticipant));
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
    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new UnprocessableEntityException("Only recruiting sessions can be joined.");
    }

    const existingParticipant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    if (existingParticipant?.status === PrismaParticipantStatus.JOINED) {
      throw new ConflictException("You already joined this session.");
    }

    const participantCount = await this.prisma.sessionParticipant.count({
      where: {
        sessionId: session.id,
        status: PrismaParticipantStatus.JOINED,
      },
    });

    if (participantCount >= session.maxParticipants) {
      throw new UnprocessableEntityException("This session is already full.");
    }

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
              include: { character: true },
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
              include: { character: true },
            },
          },
        });

    this.realtimeEvents.emitParticipantUpdated(session.id, mapParticipant(participant));
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.buildSnapshot(session.id));
    return this.buildSnapshot(session.id);
  }

  private ensureHost(userId: string, hostUserId: string): void {
    if (userId !== hostUserId) {
      throw new ForbiddenException("Only the session host can perform this action.");
    }
  }

  private ensureGmRuntimeOperator(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): void {
    if (!this.canUseGmRuntimeControls(userId, session)) {
      throw new ForbiddenException("GM 권한이 필요합니다.");
    }
  }

  canUseGmRuntimeControls(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): boolean {
    if (session.gmMode === PrismaGmMode.HUMAN) {
      return (session.gmUserId ?? session.hostUserId) === userId;
    }
    return session.hostUserId === userId;
  }

  private canSeeGmOnlyRuntimeData(userId: string, session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null }): boolean {
    return session.gmMode === PrismaGmMode.HUMAN && (session.gmUserId ?? session.hostUserId) === userId;
  }

  private resolveScenarioStartNodeId(nodes: Array<{ id: string; transitionsJson: string }>, requestedStartNodeId: string | null | undefined): string | null {
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (!nodeIds.size) {
      return null;
    }

    const incoming = new Map<string, number>();
    nodes.forEach((node) => {
      const transitions = this.parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
      transitions.forEach((transition) => {
        const nextNodeId = transition.nextNodeId;
        if (typeof nextNodeId === "string" && nodeIds.has(nextNodeId)) {
          incoming.set(nextNodeId, (incoming.get(nextNodeId) ?? 0) + 1);
        }
      });
    });

    const rootNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
    if (requestedStartNodeId && nodeIds.has(requestedStartNodeId) && (rootNodes.length !== 1 || rootNodes[0].id === requestedStartNodeId)) {
      return requestedStartNodeId;
    }

    return rootNodes.length === 1 ? rootNodes[0].id : requestedStartNodeId && nodeIds.has(requestedStartNodeId) ? requestedStartNodeId : nodes[0].id;
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
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });

    if (
      participant?.status !== PrismaParticipantStatus.JOINED ||
      (participant.role !== PrismaParticipantRole.GM && participant.role !== PrismaParticipantRole.HOST)
    ) {
      throw new ForbiddenException("GM 권한이 필요합니다.");
    }
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
    statePatch?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
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
      ? {
          baseVersion,
          nextVersion,
          reason: resolution.stateDiff.reason,
          diff: resolution.stateDiff.diff,
        }
      : null;

    const created = await client.turnLog.create({
      data: {
        sessionId: resolution.turnLog.sessionId,
        sessionScenarioId: resolution.turnLog.sessionScenarioId,
        actorUserId: resolution.turnLog.actorUserId,
        turnNumber: (latest?.turnNumber ?? 0) + 1,
        rawInput: resolution.turnLog.rawInput,
        structuredActionJson: JSON.stringify(resolution.turnLog.structuredAction),
        stateDiffJson: stateDiff ? JSON.stringify(stateDiff) : null,
        outcome: PrismaActionOutcome.SUCCESS,
        narration: resolution.turnLog.narration,
      },
    });

    const nextFlagsJson = privateNote
      ? JSON.stringify(this.appendHumanGmPrivateNote(this.parseJson<Record<string, unknown>>(state?.flagsJson, {}), {
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
      structuredAction: this.parseJson<Record<string, unknown> | null>(created.structuredActionJson, null),
      diceResult: null,
      stateDiff: this.parseJson<Record<string, unknown> | null>(created.stateDiffJson, null),
      outcome: created.outcome as ActionOutcome,
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
    const latest = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const failureReason = params.failureReason.trim().slice(0, 500) || "Unknown AI assist application failure.";
    const failedOperation = params.failedOperation?.trim().slice(0, 100) || null;
    const structuredAction = {
      type: "gm_override",
      kind: "ai_assist_apply_failure",
      targetId: params.suggestion.targetId,
      public: true,
      hasPrivateNote: false,
      metadata: {
        assistType: params.suggestion.assistType,
        suggestionId: params.suggestion.id,
        suggestedActionId: params.suggestion.suggestedActionId,
        targetId: params.suggestion.targetId,
        failedOperation,
        failureReason,
      },
    };
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.gmUserId,
        turnNumber: (latest?.turnNumber ?? 0) + 1,
        rawInput: "gm:ai_assist_apply_failure",
        structuredActionJson: JSON.stringify(structuredAction),
        stateDiffJson: null,
        outcome: PrismaActionOutcome.FAILURE,
        narration: "GM AI assist 제안 승인 후 적용에 실패했습니다.",
      },
    });

    return {
      turnLog: {
        turnLogId: created.id,
        turnNumber: created.turnNumber,
        playerActionId: created.playerActionId,
        actorUserId: created.actorUserId,
        sessionCharacterId: created.sessionCharacterId,
        actionClientCreatedAt: null,
        actionCreatedAt: null,
        actionQueueStatus: null,
        rawInput: created.rawInput,
        structuredAction: this.parseJson<Record<string, unknown> | null>(created.structuredActionJson, null),
        diceResult: null,
        stateDiff: null,
        outcome: created.outcome as ActionOutcome,
        narration: created.narration,
        createdAt: created.createdAt.toISOString(),
      },
      stateDiff: null,
    };
  }

  private appendHumanGmPrivateNote(flags: Record<string, unknown>, note: HumanGmPrivateNoteDto): Record<string, unknown> {
    const currentNotes = Array.isArray(flags.gmPrivateNotes) ? flags.gmPrivateNotes.filter((value) => this.isHumanGmPrivateNote(value)) : [];
    return {
      ...flags,
      gmPrivateNotes: [...currentNotes, note].slice(-100),
    };
  }

  private isHumanGmPrivateNote(value: unknown): value is HumanGmPrivateNoteDto {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.turnLogId === "string" &&
      typeof candidate.kind === "string" &&
      (candidate.targetId === null || typeof candidate.targetId === "string") &&
      typeof candidate.note === "string" &&
      typeof candidate.gmUserId === "string" &&
      typeof candidate.createdAt === "string"
    );
  }

  private appendHumanGmAiAssistSuggestion(
    flags: Record<string, unknown>,
    suggestion: HumanGmAiAssistSuggestionDto,
  ): Record<string, unknown> {
    return {
      ...flags,
      humanGmAiAssistSuggestions: [...this.getHumanGmAiAssistSuggestions(flags), suggestion].slice(-100),
    };
  }

  private markHumanGmAiAssistSuggestionAccepted(
    flags: Record<string, unknown>,
    suggestionId: string,
    acceptedByUserId: string,
  ): Record<string, unknown> {
    const acceptedAt = new Date().toISOString();
    const suggestions = this.getHumanGmAiAssistSuggestions(flags).map((suggestion) =>
      suggestion.id === suggestionId
        ? {
            ...suggestion,
            status: "ACCEPTED" as const,
            acceptedByUserId,
            acceptedAt,
          }
        : suggestion,
    );
    return {
      ...flags,
      humanGmAiAssistSuggestions: suggestions,
    };
  }

  private getHumanGmAiAssistSuggestions(flags: Record<string, unknown>): HumanGmAiAssistSuggestionDto[] {
    const suggestions = Array.isArray(flags.humanGmAiAssistSuggestions) ? flags.humanGmAiAssistSuggestions : [];
    return suggestions.filter((suggestion): suggestion is HumanGmAiAssistSuggestionDto => this.isHumanGmAiAssistSuggestion(suggestion));
  }

  private isHumanGmAiAssistSuggestion(value: unknown): value is HumanGmAiAssistSuggestionDto {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.assistType === "string" &&
      typeof candidate.content === "string" &&
      (candidate.suggestedActionId === null || typeof candidate.suggestedActionId === "string") &&
      (candidate.targetId === null || typeof candidate.targetId === "string") &&
      (candidate.status === "PENDING" || candidate.status === "ACCEPTED") &&
      typeof candidate.createdByUserId === "string" &&
      (candidate.acceptedByUserId === null || typeof candidate.acceptedByUserId === "string") &&
      typeof candidate.createdAt === "string" &&
      (candidate.acceptedAt === null || typeof candidate.acceptedAt === "string")
    );
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

  parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }

  private async replaceSessionInventoryEntries(sessionCharacterId: string, inventory: InventoryItemDto[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryEntry.deleteMany({ where: { sessionCharacterId } });

      const itemDefinitionIds = inventory.map((item) => item.itemDefinitionId).filter((value): value is string => Boolean(value));
      if (!itemDefinitionIds.length) {
        return;
      }

      const existingDefinitions = await tx.itemDefinition.findMany({
        where: { id: { in: itemDefinitionIds } },
        select: { id: true },
      });
      const existingDefinitionIds = new Set(existingDefinitions.map((item) => item.id));
      const entries = inventory
        .filter((item) => item.itemDefinitionId && existingDefinitionIds.has(item.itemDefinitionId))
        .map((item) => ({
          sessionCharacterId,
          itemDefinitionId: item.itemDefinitionId!,
          quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        }));

      if (entries.length) {
        await tx.inventoryEntry.createMany({ data: entries });
      }
    });

    await this.refreshSessionInventorySnapshot(sessionCharacterId);
  }

  private async grantSessionInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      sessionCharacterId: string;
      itemDefinitionId: string;
      quantity: number;
    },
  ): Promise<void> {
    const existingEntry = await tx.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: params.sessionCharacterId,
        itemDefinitionId: params.itemDefinitionId,
        containerEntryId: null,
      },
      orderBy: { createdAt: "asc" },
    });

    if (existingEntry) {
      await tx.inventoryEntry.update({
        where: { id: existingEntry.id },
        data: { quantity: { increment: params.quantity } },
      });
      return;
    }

    await tx.inventoryEntry.create({
      data: {
        sessionCharacterId: params.sessionCharacterId,
        itemDefinitionId: params.itemDefinitionId,
        quantity: params.quantity,
      },
    });
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
    const entry = await tx.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: params.sessionCharacterId,
        OR: [
          { id: params.itemId },
          { itemDefinitionId: params.itemId },
          {
            itemDefinition: {
              is: {
                OR: [
                  { id: params.itemId },
                  { name: { equals: params.itemId, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });
    if (!entry) {
      throw new NotFoundException("회수할 인벤토리 아이템을 찾을 수 없습니다.");
    }

    const removedQuantity = Math.min(params.quantity, entry.quantity);
    if (removedQuantity >= entry.quantity) {
      await tx.inventoryEntry.delete({ where: { id: entry.id } });
    } else {
      await tx.inventoryEntry.update({
        where: { id: entry.id },
        data: { quantity: { decrement: removedQuantity } },
      });
    }

    return {
      itemDefinitionId: entry.itemDefinitionId,
      itemName: entry.itemDefinition.name,
      itemType: entry.itemDefinition.itemType,
      removedQuantity,
    };
  }

  private async refreshSessionInventorySnapshot(sessionCharacterId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const entries = await client.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    await client.sessionCharacter.update({
      where: { id: sessionCharacterId },
      data: {
        inventorySnapshotJson: JSON.stringify(
          entries.map((entry) => ({
            id: entry.id,
            name: entry.itemDefinition.name,
            quantity: entry.quantity,
            itemDefinitionId: entry.itemDefinitionId,
            itemType: entry.itemDefinition.itemType,
            weightLb: entry.itemDefinition.weightLb ?? undefined,
            volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
            damageDice: entry.itemDefinition.damageDice ?? undefined,
            damageType: entry.itemDefinition.damageType ?? undefined,
            properties: this.parseJson<string[] | undefined>(entry.itemDefinition.propertiesJson, undefined),
            containerId: entry.containerEntryId ?? undefined,
          })),
        ),
      },
    });
  }

  private async buildDefaultVttMap(sessionId: string, scenarioNodeId: string | null): Promise<VttMapStateDto> {
    const gridSize = 64;
    const width = 1280;
    const height = 832;
    const startingPositions = this.createDefaultStartingPositions(gridSize, width, height, 4);
    const tokens = await this.buildSessionCharacterTokens(sessionId, {
      gridSize,
      width,
      height,
      startingPositions,
    });

    return {
      id: `map:${sessionId}`,
      scenarioNodeId,
      imageUrl: null,
      gridType: "square",
      gridSize,
      width,
      height,
      tokens,
      fogRects: [],
      startingPositions,
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
      updatedAt: new Date().toISOString(),
    };
  }

  private async applyScenarioStartingPositions(sessionId: string, map: VttMapStateDto): Promise<VttMapStateDto> {
    const tokens = await this.buildSessionCharacterTokens(sessionId, map, map.tokens);
    return {
      ...map,
      tokens,
    };
  }

  private async buildSessionCharacterTokens(
    sessionId: string,
    map: Pick<VttMapStateDto, "gridSize" | "width" | "height" | "startingPositions">,
    existingTokens: VttMapStateDto["tokens"] = [],
  ): Promise<VttMapStateDto["tokens"]> {
    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId,
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });
    const preservedTokens = existingTokens.filter((token) => !token.sessionCharacterId).slice(0, 68);
    const existingPlayerTokenByCharacterId = new Map(
      existingTokens.filter((token) => token.sessionCharacterId).map((token) => [token.sessionCharacterId as string, token]),
    );

    const playerTokens = sessionCharacters.slice(0, 12).map((sessionCharacter, index) => {
      const existingToken = existingPlayerTokenByCharacterId.get(sessionCharacter.id);
      if (existingToken) {
        return {
          ...existingToken,
          id: existingToken.id || `token:${sessionCharacter.id}`,
          sessionCharacterId: sessionCharacter.id,
          name: existingToken.name || sessionCharacter.character.name,
          imageUrl: existingToken.imageUrl ?? sessionCharacter.character.avatarUrl ?? null,
          x: this.clampNumber(existingToken.x, 0, map.width - map.gridSize),
          y: this.clampNumber(existingToken.y, 0, map.height - map.gridSize),
          size: this.clampNumber(existingToken.size, 24, 160),
          isHostile: false,
          monster: null,
        };
      }

      const slot = map.startingPositions?.[index] ?? null;
      const fallback = this.getDefaultPlayerTokenPosition(index, map.gridSize, map.width, map.height);

      return {
        id: `token:${sessionCharacter.id}`,
        sessionCharacterId: sessionCharacter.id,
        name: sessionCharacter.character.name,
        imageUrl: sessionCharacter.character.avatarUrl ?? null,
        x: slot ? this.clampNumber(slot.x, 0, map.width - map.gridSize) : fallback.x,
        y: slot ? this.clampNumber(slot.y, 0, map.height - map.gridSize) : fallback.y,
        size: map.gridSize,
        hidden: false,
        isHostile: false,
        monster: null,
      };
    });

    return [...preservedTokens, ...playerTokens].slice(0, 80);
  }

  private createDefaultStartingPositions(gridSize: number, width: number, height: number, count: number): NonNullable<VttMapStateDto["startingPositions"]> {
    return Array.from({ length: count }, (_, index) => {
      const position = this.getDefaultPlayerTokenPosition(index, gridSize, width, height);
      return {
        id: `start:${index + 1}`,
        label: `P${index + 1}`,
        x: position.x,
        y: position.y,
      };
    });
  }

  private getDefaultPlayerTokenPosition(index: number, gridSize: number, width: number, height: number): { x: number; y: number } {
    const columns = 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: this.clampNumber(gridSize * (2 + column), 0, width - gridSize),
      y: this.clampNumber(height - gridSize * (3 - row), 0, height - gridSize),
    };
  }

  async getVttMapBaseline(
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
  ): Promise<VttMapStateDto> {
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const existingMap = this.toVttMapOrNull(flags.vttMap);
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

  private async finalizeRuntimeVttMapChange(params: {
    session: { id: string; hostUserId: string };
    sessionScenarioId: string;
    currentNodeId: string | null;
    flags: Record<string, unknown>;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<{ map: VttMapStateDto; playerMap: VttMapStateDto }> {
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

    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...params.flags,
          vttMap: map,
        }),
      },
    });

    const playerMap = this.redactVttMapForPlayer(map);
    this.realtimeEvents.emitVttMapUpdated(params.session.id, {
      hostUserId: params.session.hostUserId,
      hostMap: map,
      playerMap,
    });
    if (hazardTriggerResult.triggered || hazardDetectionChanged) {
      this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.buildSnapshot(params.session.id));
    }

    return { map, playerMap };
  }

  async resolveVttMapInteractionPoint(
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
    dto: VttMapInteractionDto,
  ): Promise<{ x: number; y: number } | null> {
    if (dto.mapPoint) {
      return {
        x: Math.floor(dto.mapPoint.x),
        y: Math.floor(dto.mapPoint.y),
      };
    }
    const targetId = dto.targetId?.trim();
    if (!targetId) {
      return null;
    }
    const map = await this.getVttMapBaseline(sessionId, sessionScenarioId, state);
    const door = (map.doorCells ?? []).find((cell) => cell.id === targetId);
    if (door) {
      return this.getCellCenter(door);
    }
    const objectCell = (map.objectCells ?? []).find((cell) => cell.id === targetId);
    if (objectCell) {
      return this.getCellCenter(objectCell);
    }
    return null;
  }

  private getCellCenter(cell: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    return {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
    };
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
    const movementSpends: Array<{
      combatId: string;
      combatParticipantId: string;
      roundNo: number;
      turnNo: number;
      sessionCharacterId: string | null;
      distanceFt: number;
    }> = [];

    this.ensurePlayerMapShellUnchanged(baseline, requestedMap, allowFullMapShell);

    const requestedById = new Map(requestedMap.tokens.map((token) => [token.id, token]));
    const nextTokens = baseline.tokens.map((token) => {
      const requestedToken = requestedById.get(token.id);
      if (!requestedToken) {
        if (token.hidden === true) {
          return token;
        }
        throw new ForbiddenException("Players cannot remove map tokens.");
      }

      const canMoveToken = Boolean(token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId));
      if (!canMoveToken) {
        // Player clients submit the full visible map. Other players may have moved
        // since this client last rendered, so keep uncontrolled tokens from the
        // server baseline instead of treating stale echoed positions as tampering.
        return token;
      }

      this.ensureOnlyTokenPositionChanged(token, requestedToken);
      this.ensureTokenPathIsReachable(baseline, token, requestedToken);
      if (activeCombat && currentCombatParticipant) {
        const participant =
          activeCombat.participants.find((candidate) => candidate.tokenId === token.id) ??
          activeCombat.participants.find((candidate) => candidate.sessionCharacterId === token.sessionCharacterId) ??
          null;
        if (!participant || participant.id !== currentCombatParticipant.id) {
          throw new ForbiddenException("Only the current combat actor can move this token.");
        }
        const distanceFt = this.calculateTokenGridMovementFt(baseline, token, requestedToken);
        if (distanceFt > 0) {
          movementSpends.push({
            combatId: activeCombat.id,
            combatParticipantId: participant.id,
            roundNo: activeCombat.roundNo,
            turnNo: activeCombat.turnNo,
            sessionCharacterId: participant.sessionCharacterId,
            distanceFt,
          });
        }
      }
      return {
        ...token,
        x: requestedToken.x,
        y: requestedToken.y,
      };
    });

    if (requestedMap.tokens.some((token) => !baseline.tokens.some((base) => base.id === token.id))) {
      throw new ForbiddenException("Players cannot add map tokens.");
    }

    await this.spendCombatMovement(activeCombat, movementSpends);

    return {
      ...baseline,
      tokens: nextTokens,
      pings: requestedMap.pings ?? baseline.pings,
      updatedAt: new Date().toISOString(),
    };
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
    activeCombat: ActiveCombatForPlayerMapUpdate | null,
    movementSpends: Array<{
      combatId: string;
      combatParticipantId: string;
      roundNo: number;
      turnNo: number;
      sessionCharacterId: string | null;
      distanceFt: number;
    }>,
  ): Promise<void> {
    if (!activeCombat || movementSpends.length === 0) {
      return;
    }

    const distanceByParticipant = new Map<string, (typeof movementSpends)[number]>();
    for (const spend of movementSpends) {
      const current = distanceByParticipant.get(spend.combatParticipantId);
      distanceByParticipant.set(spend.combatParticipantId, {
        ...spend,
        distanceFt: (current?.distanceFt ?? 0) + spend.distanceFt,
      });
    }

    const sessionCharacterIds = Array.from(
      new Set(
        Array.from(distanceByParticipant.values())
          .map((spend) => spend.sessionCharacterId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const sessionCharacters = sessionCharacterIds.length
      ? await this.prisma.sessionCharacter.findMany({
          where: { id: { in: sessionCharacterIds } },
          select: { id: true, character: { select: { speed: true } } },
        })
      : [];
    const characterSpeedBySessionCharacterId = new Map(sessionCharacters.map((entry) => [entry.id, entry.character.speed]));

    for (const spend of distanceByParticipant.values()) {
      const participant = activeCombat.participants.find((candidate) => candidate.id === spend.combatParticipantId);
      const movementFtTotal =
        (spend.sessionCharacterId ? characterSpeedBySessionCharacterId.get(spend.sessionCharacterId) : null) ?? participant?.speedFt ?? 30;
      const turnState = await this.prisma.combatTurnState.upsert({
        where: {
          combatId_roundNo_turnNo_combatParticipantId: {
            combatId: spend.combatId,
            roundNo: spend.roundNo,
            turnNo: spend.turnNo,
            combatParticipantId: spend.combatParticipantId,
          },
        },
        create: {
          combatId: spend.combatId,
          combatParticipantId: spend.combatParticipantId,
          roundNo: spend.roundNo,
          turnNo: spend.turnNo,
          sessionCharacterId: spend.sessionCharacterId,
        },
        update: {},
      });
      if (turnState.movementFtSpent + spend.distanceFt > movementFtTotal) {
        throw new ForbiddenException("Not enough movement remaining for this combat turn.");
      }

      await this.prisma.combatTurnState.update({
        where: {
          combatId_roundNo_turnNo_combatParticipantId: {
            combatId: spend.combatId,
            roundNo: spend.roundNo,
            turnNo: spend.turnNo,
            combatParticipantId: spend.combatParticipantId,
          },
        },
        data: { movementFtSpent: { increment: spend.distanceFt } },
      });
    }
  }

  ensureTokenPathIsReachable(map: VttMapStateDto, fromToken: VttMapStateDto["tokens"][number], toToken: VttMapStateDto["tokens"][number]): void {
    if (!this.hasReachableTokenPath(map, fromToken, toToken)) {
      throw new ForbiddenException("Token movement path is blocked by the map.");
    }
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
    const sourceToken = map.tokens.find((token) => token.id === params.sourceTokenId);
    const targetToken = map.tokens.find((token) => token.id === params.targetTokenId);
    if (!sourceToken || !targetToken) {
      return null;
    }

    const startColumn = this.getGridIndex(sourceToken.x, map.gridSize, map.width);
    const startRow = this.getGridIndex(sourceToken.y, map.gridSize, map.height);
    const targetColumn = this.getGridIndex(targetToken.x, map.gridSize, map.width);
    const targetRow = this.getGridIndex(targetToken.y, map.gridSize, map.height);
    const stopWithinCells = Math.max(1, Math.ceil(params.stopWithinFt / 5));
    const maxSteps = Math.max(0, Math.floor(params.maxDistanceFt / 5));
    if (!maxSteps || this.getChebyshevDistance(startColumn, startRow, targetColumn, targetRow) <= stopWithinCells) {
      return null;
    }

    const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
    const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
    type MovementNode = {
      column: number;
      row: number;
      steps: number;
      previousKey: string | null;
    };
    const startKey = `${startColumn}:${startRow}`;
    const queue: MovementNode[] = [{ column: startColumn, row: startRow, steps: 0, previousKey: null }];
    const visited = new Set([`${startColumn}:${startRow}`]);
    const nodeByKey = new Map<string, MovementNode>();
    nodeByKey.set(startKey, queue[0]);
    const reachable: Array<MovementNode & { targetDistance: number }> = [];
    const directions = [
      { column: 1, row: 0 },
      { column: -1, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: -1 },
      { column: 1, row: 1 },
      { column: 1, row: -1 },
      { column: -1, row: 1 },
      { column: -1, row: -1 },
    ];

    while (queue.length) {
      const current = queue.shift()!;
      const targetDistance = this.getChebyshevDistance(current.column, current.row, targetColumn, targetRow);
      if (current.steps > 0 && targetDistance >= stopWithinCells) {
        reachable.push({ ...current, targetDistance });
      }
      if (current.steps >= maxSteps) {
        continue;
      }

      for (const direction of directions) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
          steps: current.steps + 1,
          previousKey: `${current.column}:${current.row}`,
        };
        const key = `${next.column}:${next.row}`;
        if (next.column < 0 || next.row < 0 || next.column > maxColumn || next.row > maxRow || visited.has(key)) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - sourceToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - sourceToken.size);
        if (this.isTokenPlacementBlocked(map, sourceToken, x, y) || !this.canMoveBetweenGridCells(map, sourceToken, current, next)) {
          continue;
        }

        visited.add(key);
        nodeByKey.set(key, next);
        queue.push(next);
      }
    }

    const best = reachable.sort((left, right) => {
      if (left.targetDistance !== right.targetDistance) {
        return left.targetDistance - right.targetDistance;
      }
      return right.steps - left.steps;
    })[0];
    if (!best || (best.column === startColumn && best.row === startRow)) {
      return null;
    }

    const path = this.buildTokenMovementPath(map, sourceToken, best, nodeByKey);
    if (!path.length) {
      return null;
    }

    const destination = path[path.length - 1];
    return {
      x: destination.x,
      y: destination.y,
      distanceMovedFt: best.steps * 5,
      path,
    };
  }

  private buildTokenMovementPath(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    destination: { column: number; row: number; previousKey: string | null },
    nodeByKey: Map<string, { column: number; row: number; previousKey: string | null }>,
  ): Array<{ x: number; y: number }> {
    const cells: Array<{ column: number; row: number }> = [];
    let current: { column: number; row: number; previousKey: string | null } | undefined = destination;

    while (current) {
      cells.push({ column: current.column, row: current.row });
      current = current.previousKey ? nodeByKey.get(current.previousKey) : undefined;
    }

    return cells
      .reverse()
      .slice(1)
      .map((cell) => ({
        x: Math.min(Math.max(cell.column * map.gridSize, 0), map.width - token.size),
        y: Math.min(Math.max(cell.row * map.gridSize, 0), map.height - token.size),
      }));
  }

  private canMoveBetweenGridCells(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    from: { column: number; row: number },
    to: { column: number; row: number },
  ): boolean {
    const deltaColumn = to.column - from.column;
    const deltaRow = to.row - from.row;
    if (Math.abs(deltaColumn) !== 1 || Math.abs(deltaRow) !== 1) {
      return true;
    }

    const horizontalX = Math.min(Math.max((from.column + deltaColumn) * map.gridSize, 0), map.width - token.size);
    const horizontalY = Math.min(Math.max(from.row * map.gridSize, 0), map.height - token.size);
    const verticalX = Math.min(Math.max(from.column * map.gridSize, 0), map.width - token.size);
    const verticalY = Math.min(Math.max((from.row + deltaRow) * map.gridSize, 0), map.height - token.size);

    return !this.isTokenPlacementBlocked(map, token, horizontalX, horizontalY) && !this.isTokenPlacementBlocked(map, token, verticalX, verticalY);
  }

  private async emitVttTokenMovementFrames(params: {
    sessionId: string;
    hostUserId: string;
    map: VttMapStateDto;
    sourceTokenId: string;
    path: Array<{ x: number; y: number }>;
  }): Promise<void> {
    if (!params.path.length) {
      return;
    }

    let frameMap = params.map;
    for (const step of params.path) {
      frameMap = {
        ...frameMap,
        tokens: frameMap.tokens.map((token) =>
          token.id === params.sourceTokenId
            ? {
                ...token,
                x: step.x,
                y: step.y,
              }
            : token,
        ),
        updatedAt: new Date().toISOString(),
      };

      this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
        hostUserId: params.hostUserId,
        hostMap: frameMap,
        playerMap: this.redactVttMapForPlayer(frameMap),
      });
      await this.sleep(180);
    }
  }

  private isTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    const blockers = [
      ...(map.terrainCells ?? []).filter((cell) => !cell.terrainEffectId),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
      // ignoreTokens: 경로 탐색 시 다른 토큰(아군 길막 등)은 통과 허용한다.
      ...(options.ignoreTokens
        ? []
        : map.tokens
            .filter((otherToken) => otherToken.id !== token.id && otherToken.hidden !== true)
            .map((otherToken) => ({
              x: otherToken.x,
              y: otherToken.y,
              width: otherToken.size,
              height: otherToken.size,
            }))),
    ];
    const tokenRect = { x, y, width: token.size, height: token.size };
    return blockers.some((blocker) => this.rectsOverlap(tokenRect, blocker));
  }

  private getTokenDestinationFromMapPoint(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    point: { x: number; y: number },
  ): { x: number; y: number } {
    const column = this.getGridIndex(point.x, map.gridSize, map.width);
    const row = this.getGridIndex(point.y, map.gridSize, map.height);

    return {
      x: this.clampNumber(column * map.gridSize, 0, map.width - token.size),
      y: this.clampNumber(row * map.gridSize, 0, map.height - token.size),
    };
  }

  private rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private ensurePlayerMapShellUnchanged(baseline: VttMapStateDto, requested: VttMapStateDto, allowFullMapShell = false): void {
    const comparableBaseline = allowFullMapShell ? baseline : this.redactVttMapForPlayer(baseline);
    const isSameStartingPositions =
      requested.startingPositions?.length === 0 ||
      JSON.stringify(comparableBaseline.startingPositions ?? []) === JSON.stringify(requested.startingPositions ?? []);
    const sameFogRects = JSON.stringify(comparableBaseline.fogRects) === JSON.stringify(requested.fogRects);
    const sameTerrainCells = JSON.stringify(comparableBaseline.terrainCells ?? []) === JSON.stringify(requested.terrainCells ?? []);
    const sameWallCells = JSON.stringify(comparableBaseline.wallCells ?? []) === JSON.stringify(requested.wallCells ?? []);
    const sameDoorCells = JSON.stringify(comparableBaseline.doorCells ?? []) === JSON.stringify(requested.doorCells ?? []);
    const sameObjectCells = JSON.stringify(comparableBaseline.objectCells ?? []) === JSON.stringify(requested.objectCells ?? []);
    const sameShell =
      baseline.id === requested.id &&
      baseline.scenarioNodeId === requested.scenarioNodeId &&
      baseline.imageUrl === requested.imageUrl &&
      baseline.gridType === requested.gridType &&
      baseline.gridSize === requested.gridSize &&
      baseline.width === requested.width &&
      baseline.height === requested.height &&
      isSameStartingPositions &&
      sameFogRects &&
      sameTerrainCells &&
      sameWallCells &&
      sameDoorCells &&
      sameObjectCells;

    if (!sameShell) {
      this.logger.warn(
        `[VTT_SHELL_MISMATCH] baselineId=${baseline.id} requestedId=${requested.id} baselineNode=${baseline.scenarioNodeId ?? "null"} requestedNode=${requested.scenarioNodeId ?? "null"} starting=${isSameStartingPositions} fog=${sameFogRects} terrain=${sameTerrainCells} wall=${sameWallCells} door=${sameDoorCells} object=${sameObjectCells} baselineObjects=${(comparableBaseline.objectCells ?? []).length} requestedObjects=${(requested.objectCells ?? []).length}`,
      );
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  private calculateTokenGridMovementFt(map: VttMapStateDto, fromToken: VttMapStateDto["tokens"][number], toToken: VttMapStateDto["tokens"][number]): number {
    const fromColumn = this.getGridIndex(fromToken.x, map.gridSize, map.width);
    const fromRow = this.getGridIndex(fromToken.y, map.gridSize, map.height);
    const toColumn = this.getGridIndex(toToken.x, map.gridSize, map.width);
    const toRow = this.getGridIndex(toToken.y, map.gridSize, map.height);
    return this.getChebyshevDistance(fromColumn, fromRow, toColumn, toRow) * 5;
  }

  private ensureOnlyTokenPositionChanged(baseline: VttMapStateDto["tokens"][number], requested: VttMapStateDto["tokens"][number]): void {
    const baselineStatic = { ...baseline, x: 0, y: 0 };
    const requestedStatic = { ...requested, x: 0, y: 0 };

    if (JSON.stringify(baselineStatic) !== JSON.stringify(requestedStatic)) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  private hasReachableTokenPath(map: VttMapStateDto, fromToken: VttMapStateDto["tokens"][number], toToken: VttMapStateDto["tokens"][number]): boolean {
    const startColumn = this.getGridIndex(fromToken.x, map.gridSize, map.width);
    const startRow = this.getGridIndex(fromToken.y, map.gridSize, map.height);
    const endColumn = this.getGridIndex(toToken.x, map.gridSize, map.width);
    const endRow = this.getGridIndex(toToken.y, map.gridSize, map.height);
    const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
    const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
    const queue: Array<{ column: number; row: number }> = [{ column: startColumn, row: startRow }];
    const visited = new Set([`${startColumn}:${startRow}`]);
    // 상하좌우 + 대각 8방향. 대각 이동을 허용한다.
    const directions = [
      { column: 1, row: 0 },
      { column: -1, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: -1 },
      { column: 1, row: 1 },
      { column: 1, row: -1 },
      { column: -1, row: 1 },
      { column: -1, row: -1 },
    ];

    while (queue.length) {
      const current = queue.shift()!;
      if (current.column === endColumn && current.row === endRow) {
        return true;
      }

      for (const direction of directions) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
        };
        const key = `${next.column}:${next.row}`;
        if (next.column < 0 || next.row < 0 || next.column > maxColumn || next.row > maxRow || visited.has(key)) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - toToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - toToken.size);
        if (this.isTokenPlacementBlocked(map, toToken, x, y, { ignoreTokens: true })) {
          continue;
        }

        visited.add(key);
        queue.push(next);
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getChebyshevDistance(leftColumn: number, leftRow: number, rightColumn: number, rightRow: number): number {
    return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow));
  }

  private getGridIndex(value: number, gridSize: number, maxSize: number): number {
    return Math.floor(Math.min(Math.max(value, 0), Math.max(0, maxSize - 1)) / gridSize);
  }

  private normalizeHazardKind(value: unknown): "TRAP" | "AMBUSH" | "HAZARD" {
    return value === "AMBUSH" || value === "HAZARD" ? value : "TRAP";
  }

  normalizeVttMap(map: VttMapStateDto, scenarioNodeId: string | null): VttMapStateDto {
    const gridSize = this.clampNumber(map.gridSize, 16, 160);
    const width = this.clampNumber(map.width, 320, 4000);
    const height = this.clampNumber(map.height, 240, 4000);
    const tokens = map.tokens
      .slice(0, 80)
      .map((token) => ({
        id: token.id,
        npcId: token.npcId ?? null,
        sessionCharacterId: token.sessionCharacterId ?? null,
        name: token.name.slice(0, 80),
        imageUrl: token.imageUrl ?? null,
        x: Number(token.x) || 0,
        y: Number(token.y) || 0,
        size: this.clampNumber(token.size, 24, 160),
        hidden: token.hidden === true,
        isHostile: token.isHostile === true,
        ...(token.monster || token.isHostile
          ? {
              encounterRole: token.encounterRole === "fixed" ? ("fixed" as const) : ("scalable" as const),
              encounterGroupId: typeof token.encounterGroupId === "string" && token.encounterGroupId.trim() ? token.encounterGroupId.trim().slice(0, 80) : null,
              encounterPriority: this.clampNumber(Number(token.encounterPriority) || 0, 0, 99),
            }
          : {}),
        monster: token.monster
          ? {
              id: token.monster.id,
              nameEn: token.monster.nameEn,
              nameKo: token.monster.nameKo ?? null,
              basicRaw: token.monster.basicRaw,
              armorClassRaw: token.monster.armorClassRaw ?? null,
              hitPointsRaw: token.monster.hitPointsRaw ?? null,
              speedRaw: token.monster.speedRaw ?? null,
              challengeRaw: token.monster.challengeRaw ?? null,
              sensesRaw: token.monster.sensesRaw ?? null,
              languagesRaw: token.monster.languagesRaw ?? null,
              traits: Array.isArray(token.monster.traits) ? token.monster.traits.slice(0, 20) : [],
              actions: Array.isArray(token.monster.actions) ? token.monster.actions.slice(0, 20) : [],
              legendaryActions: Array.isArray(token.monster.legendaryActions) ? token.monster.legendaryActions.slice(0, 20) : [],
              playReference: token.monster.playReference ?? null,
              source: token.monster.source
                ? {
                    file: token.monster.source.file ?? undefined,
                    page: token.monster.source.page ?? undefined,
                    heading: token.monster.source.heading ?? undefined,
                  }
                : null,
            }
          : null,
      }))
      .map((token) => ({
        ...token,
        x: this.clampNumber(token.x, 0, Math.max(0, width - token.size)),
        y: this.clampNumber(token.y, 0, Math.max(0, height - token.size)),
      }));
    const fogRects = map.fogRects.slice(0, 200).map((rect) => ({
      id: rect.id,
      x: this.clampNumber(rect.x, 0, width),
      y: this.clampNumber(rect.y, 0, height),
      width: this.clampNumber(rect.width, 1, width),
      height: this.clampNumber(rect.height, 1, height),
    }));
    const startingPositions = (map.startingPositions ?? []).slice(0, 12).map((position, index) => ({
      id: position.id || `start:${index + 1}`,
      label: typeof position.label === "string" && position.label.trim() ? position.label.trim() : null,
      x: this.clampNumber(position.x, 0, width - gridSize),
      y: this.clampNumber(position.y, 0, height - gridSize),
    }));
    const now = Date.now();
    const pings = (map.pings ?? [])
      .filter((ping) => {
        const expiresAt = Date.parse(ping.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt > now;
      })
      .slice(-12)
      .map((ping, index) => ({
        id: typeof ping.id === "string" && ping.id.trim() ? ping.id.trim().slice(0, 80) : `ping:${index + 1}`,
        x: this.clampNumber(ping.x, 0, width),
        y: this.clampNumber(ping.y, 0, height),
        label: typeof ping.label === "string" && ping.label.trim() ? ping.label.trim().slice(0, 8) : "!",
        expiresAt: ping.expiresAt,
      }));
    const lightSources = (map.lightSources ?? []).slice(-40).map((source, index) => ({
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : `light:${index + 1}`,
      x: this.clampNumber(source.x, 0, width - gridSize),
      y: this.clampNumber(source.y, 0, height - gridSize),
      rangeFt: this.clampNumber(source.rangeFt, 5, 120),
      label: typeof source.label === "string" && source.label.trim() ? source.label.trim().slice(0, 40) : null,
      createdBySessionCharacterId:
        typeof source.createdBySessionCharacterId === "string" && source.createdBySessionCharacterId.trim() ? source.createdBySessionCharacterId.trim() : null,
    }));
    const encounterScaling =
      map.encounterScaling && typeof map.encounterScaling === "object"
        ? {
            enabled: map.encounterScaling.enabled === true,
            basePartySize: this.clampNumber(Number(map.encounterScaling.basePartySize) || 4, 1, 12),
            minMonsterCount: this.clampNumber(Number(map.encounterScaling.minMonsterCount) || 1, 0, 80),
            mode: "by_party_ratio" as const,
          }
        : null;
    const normalizeStructureCell = (
      cell: {
        id?: string;
        name?: string | null;
        description?: string | null;
        terrainEffectId?: string | null;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        shapeCells?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      },
      prefix: string,
      index: number,
    ) => ({
      id: cell.id || `${prefix}:${index + 1}`,
      name: typeof cell.name === "string" && cell.name.trim() ? cell.name.trim().slice(0, 80) : null,
      description: typeof cell.description === "string" && cell.description.trim() ? cell.description.trim().slice(0, 500) : null,
      terrainEffectId:
        typeof cell.terrainEffectId === "string" && cell.terrainEffectId.trim()
          ? cell.terrainEffectId
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
              .slice(0, 80)
          : null,
      x: this.clampNumber(Number(cell.x), 0, width - gridSize),
      y: this.clampNumber(Number(cell.y), 0, height - gridSize),
      width: this.clampNumber(Number(cell.width) || gridSize, gridSize, width),
      height: this.clampNumber(Number(cell.height) || gridSize, gridSize, height),
    });
    const normalizeObjectShapeCells = (
      cell: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        shapeCells?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      },
      fallback: { x: number; y: number; width: number; height: number },
    ) => {
      const rawShapeCells = Array.isArray(cell.shapeCells) && cell.shapeCells.length ? cell.shapeCells : [fallback];
      const shapeByKey = new Map<string, { x: number; y: number; width: number; height: number }>();

      rawShapeCells.slice(0, 80).forEach((shapeCell) => {
        const normalized = {
          x: this.clampNumber(Number(shapeCell.x), 0, width - gridSize),
          y: this.clampNumber(Number(shapeCell.y), 0, height - gridSize),
          width: this.clampNumber(Number(shapeCell.width) || gridSize, gridSize, width),
          height: this.clampNumber(Number(shapeCell.height) || gridSize, gridSize, height),
        };
        shapeByKey.set(`${normalized.x}:${normalized.y}:${normalized.width}:${normalized.height}`, normalized);
      });

      const shapeCells = Array.from(shapeByKey.values()).sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y));
      const left = Math.min(...shapeCells.map((shapeCell) => shapeCell.x));
      const top = Math.min(...shapeCells.map((shapeCell) => shapeCell.y));
      const right = Math.max(...shapeCells.map((shapeCell) => shapeCell.x + shapeCell.width));
      const bottom = Math.max(...shapeCells.map((shapeCell) => shapeCell.y + shapeCell.height));

      return {
        shapeCells,
        bounds: {
          x: this.clampNumber(left, 0, width - gridSize),
          y: this.clampNumber(top, 0, height - gridSize),
          width: this.clampNumber(right - left, gridSize, width),
          height: this.clampNumber(bottom - top, gridSize, height),
        },
      };
    };
    const terrainCells = (map.terrainCells ?? []).slice(0, 400).map((cell, index) => normalizeStructureCell(cell, "terrain", index));
    const wallCells = (map.wallCells ?? []).slice(0, 400).map((cell, index) => normalizeStructureCell(cell, "wall", index));
    const doorCells = (map.doorCells ?? []).slice(0, 200).map((cell, index) => ({
      ...normalizeStructureCell(cell, "door", index),
      state: cell.state === "open" || cell.state === "closed" || cell.state === "locked" || cell.state === "broken" ? cell.state : "closed",
      keyItemId: typeof cell.keyItemId === "string" && cell.keyItemId.trim() ? cell.keyItemId.trim() : null,
      canBreak: cell.canBreak === true,
      breakCheckDc: typeof cell.breakCheckDc === "number" && Number.isFinite(cell.breakCheckDc) ? this.clampNumber(cell.breakCheckDc, 1, 40) : null,
    }));
    const objectCells = (map.objectCells ?? []).slice(0, 300).map((cell, index) => {
      const baseCell = normalizeStructureCell(cell, "object", index);
      const normalizedShape = normalizeObjectShapeCells(cell, baseCell);

      return {
        ...baseCell,
        ...normalizedShape.bounds,
        shapeCells: normalizedShape.shapeCells,
        visibleToPlayers: cell.visibleToPlayers !== false,
        canBreak: cell.canBreak === true,
        broken: cell.broken === true,
        breakCheckDc: typeof cell.breakCheckDc === "number" && Number.isFinite(cell.breakCheckDc) ? this.clampNumber(cell.breakCheckDc, 1, 40) : null,
        hiddenClueIds: Array.isArray(cell.hiddenClueIds) ? cell.hiddenClueIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        hiddenItemIds: Array.isArray(cell.hiddenItemIds) ? cell.hiddenItemIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        hiddenEventIds: Array.isArray(cell.hiddenEventIds) ? cell.hiddenEventIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        observedBySessionCharacterIds: Array.isArray(cell.observedBySessionCharacterIds)
          ? cell.observedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 30)
          : [],
        revealChecks: Array.isArray(cell.revealChecks)
          ? cell.revealChecks
              .map((check) => ({
                contentId: typeof check.contentId === "string" ? check.contentId.trim() : "",
                requiresCheck: check.requiresCheck !== false,
                ability: typeof check.ability === "string" && check.ability.trim() ? check.ability.trim() : null,
                skill: typeof check.skill === "string" && check.skill.trim() ? check.skill.trim() : null,
                dc: this.clampNumber(Number(check.dc) || 15, 1, 40),
              }))
              .filter((check) => check.contentId)
              .slice(0, 60)
          : [],
        events: Array.isArray(cell.events)
          ? cell.events
              .filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY")
              .slice(0, 20)
              .map((event, eventIndex) => ({
                id: typeof event.id === "string" && event.id.trim() ? event.id.trim().slice(0, 120) : `event:object:${index + 1}:${eventIndex + 1}`,
                name: typeof event.name === "string" && event.name.trim() ? event.name.trim().slice(0, 80) : null,
                type: "REVEAL_FOG_ON_PROXIMITY" as const,
                trigger: {
                  distanceFeet: this.clampNumber(Number(event.trigger?.distanceFeet), 0, 500),
                  once: event.trigger?.once !== false,
                },
                effect: {
                  revealRadiusFeet: this.clampNumber(Number(event.effect?.revealRadiusFeet), 5, 500),
                },
              }))
          : [],
        hazard:
          cell.hazard && typeof cell.hazard === "object"
            ? {
                kind: this.normalizeHazardKind(cell.hazard.kind),
                armed: cell.hazard.armed !== false,
                triggerOnce: cell.hazard.triggerOnce !== false,
                detectionRadiusCells: this.clampNumber(Number(cell.hazard.detectionRadiusCells) || 3, 1, 20),
                detectionDc: this.clampNumber(Number(cell.hazard.detectionDc) || 12, 1, 40),
                linkedClueIds: Array.isArray(cell.hazard.linkedClueIds) ? cell.hazard.linkedClueIds.filter((id) => typeof id === "string").slice(0, 30) : [],
                attemptedBySessionCharacterIds: Array.isArray(cell.hazard.attemptedBySessionCharacterIds)
                  ? cell.hazard.attemptedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 80)
                  : [],
                detectedBySessionCharacterIds: Array.isArray(cell.hazard.detectedBySessionCharacterIds)
                  ? cell.hazard.detectedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 80)
                  : [],
              }
            : null,
      };
    });

    return {
      id: map.id || randomUUID(),
      scenarioNodeId: map.scenarioNodeId ?? scenarioNodeId,
      imageUrl: map.imageUrl ?? null,
      gridType: map.gridType === "hex" ? "hex" : "square",
      gridSize,
      width,
      height,
      tokens,
      encounterScaling,
      fogRects,
      startingPositions,
      pings,
      lightSources,
      terrainCells,
      wallCells,
      doorCells,
      objectCells,
      updatedAt: new Date().toISOString(),
    };
  }

  private toVttMapOrNull(value: unknown): VttMapStateDto | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Partial<VttMapStateDto>;
    if (!candidate.id || !Array.isArray(candidate.tokens) || !Array.isArray(candidate.fogRects)) {
      return null;
    }

    return this.normalizeVttMap(
      {
        id: candidate.id,
        scenarioNodeId: candidate.scenarioNodeId ?? null,
        imageUrl: candidate.imageUrl ?? null,
        gridType: candidate.gridType === "hex" ? "hex" : "square",
        gridSize: Number(candidate.gridSize) || 64,
        width: Number(candidate.width) || 1280,
        height: Number(candidate.height) || 832,
        tokens: candidate.tokens,
        encounterScaling: candidate.encounterScaling && typeof candidate.encounterScaling === "object" ? candidate.encounterScaling : null,
        fogRects: candidate.fogRects,
        lightSources: Array.isArray(candidate.lightSources) ? candidate.lightSources : [],
        startingPositions: Array.isArray(candidate.startingPositions) ? candidate.startingPositions : [],
        pings: Array.isArray(candidate.pings) ? candidate.pings : [],
        terrainCells: Array.isArray(candidate.terrainCells) ? candidate.terrainCells : [],
        wallCells: Array.isArray(candidate.wallCells) ? candidate.wallCells : [],
        doorCells: Array.isArray(candidate.doorCells) ? candidate.doorCells : [],
        objectCells: Array.isArray(candidate.objectCells) ? candidate.objectCells : [],
        updatedAt: candidate.updatedAt ?? new Date().toISOString(),
      },
      candidate.scenarioNodeId ?? null,
    );
  }

  clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private async getScenarioDefaultVttMapForNode(sessionScenarioId: string, nodeId: string | null | undefined): Promise<VttMapStateDto | null> {
    if (!nodeId) {
      return null;
    }

    const node = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId,
          nodeId,
        },
      },
      select: { checkOptionsJson: true },
    });
    if (!node) {
      return null;
    }

    return this.extractVttMapFromCheckOptions(node.checkOptionsJson);
  }

  private extractVttMapFromCheckOptions(value: string): VttMapStateDto | null {
    const parsed = this.parseJson<unknown>(value, []);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }

    return this.toVttMapOrNull((parsed as Record<string, unknown>).vttMap);
  }

  private extractChecksFromCheckOptions(value: string): Record<string, unknown>[] {
    const parsed = this.parseJson<unknown>(value, []);
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    }
    if (parsed && typeof parsed === "object") {
      const checks = (parsed as Record<string, unknown>).checks;
      return Array.isArray(checks) ? (checks as Record<string, unknown>[]) : [];
    }
    return [];
  }

  private async getSessionScenarioNodeEntityOrThrow(sessionScenarioId: string, nodeId: string) {
    const node = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId,
          nodeId,
        },
      },
    });

    if (!node) {
      throw new NotFoundException(`Session scenario node ${nodeId} was not found.`);
    }

    return node;
  }

  private async ensureSessionScenarioNodeSnapshotForScenario(sessionScenarioId: string, scenarioId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.ensureSessionScenarioNodeSnapshot(tx, sessionScenarioId, scenarioId));
  }

  private async ensureSessionScenarioNodeSnapshot(tx: Prisma.TransactionClient, sessionScenarioId: string, scenarioId: string): Promise<void> {
    const existingNodeCount = await tx.sessionScenarioNode.count({
      where: { sessionScenarioId },
    });
    if (existingNodeCount > 0) {
      return;
    }

    const nodes = await tx.scenarioNode.findMany({
      where: { scenarioId },
      orderBy: { createdAt: "asc" },
    });

    await tx.sessionScenarioNode.createMany({
      data: nodes.map((node) => ({
        sessionScenarioId,
        originalNodeId: node.id,
        nodeId: node.id,
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl,
        checkOptionsJson: node.checkOptionsJson,
        transitionsJson: node.transitionsJson,
        cluesJson: node.cluesJson,
        nodeMetaJson: node.nodeMetaJson ?? null,
        fallbackNodeId: node.fallbackNodeId,
      })),
    });
  }

  private buildP3ScenarioRevisionSnapshotFlag(scenario: {
    id: string;
    sourceType: string;
    baseScenarioId: string | null;
    attribution: string | null;
    updatedAt: Date;
  }): Record<string, unknown> {
    const metadata = this.parseP3ScenarioRevisionMetadata(scenario.attribution);
    return {
      scenarioId: scenario.id,
      baseScenarioId: scenario.baseScenarioId,
      sourceType: scenario.sourceType,
      revisionNumber: metadata.revisionNumber,
      publishStatus: metadata.status,
      publishedAt: metadata.publishedAt,
      publishedByUserId: metadata.publishedByUserId,
      scenarioUpdatedAt: scenario.updatedAt.toISOString(),
      snapshotCreatedAt: new Date().toISOString(),
    };
  }

  private parseP3ScenarioRevisionMetadata(attribution: string | null | undefined): {
    revisionNumber: number | null;
    publishedAt: string | null;
    publishedByUserId: string | null;
    status: "draft" | "public" | "link" | "private" | "unpublished";
  } {
    const raw = attribution ?? "";
    const marker = "P3_REVISION_META:";
    const markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) {
      return {
        revisionNumber: null,
        publishedAt: null,
        publishedByUserId: null,
        status: "draft",
      };
    }
    try {
      const metadata = JSON.parse(raw.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
      const status = metadata.status;
      return {
        revisionNumber:
          typeof metadata.revisionNumber === "number" && Number.isInteger(metadata.revisionNumber)
            ? metadata.revisionNumber
            : null,
        publishedAt: typeof metadata.publishedAt === "string" ? metadata.publishedAt : null,
        publishedByUserId:
          typeof metadata.publishedByUserId === "string" ? metadata.publishedByUserId : null,
        status:
          status === "public" || status === "link" || status === "private" || status === "unpublished"
            ? status
            : "draft",
      };
    } catch {
      return {
        revisionNumber: null,
        publishedAt: null,
        publishedByUserId: null,
        status: "draft",
      };
    }
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
    params: {
      sessionScenarioId: string;
      contentId: string;
      contentKind: string;
      scope: string;
      recipientId?: string | null;
      revealedBy: string;
      reason?: string | null;
      turnLogId?: string | null;
      snapshot?: Record<string, unknown> | null;
    },
  ) {
    return this.sessionReveal.recordSessionReveal(this.createSessionRevealRuntime(), tx, params);
  }

  private getParticipantRoleForUser(
    participants: Array<{ userId: string; role: PrismaParticipantRole }>,
    userId: string | undefined,
  ): ParticipantRole | undefined {
    if (!userId) {
      return undefined;
    }

    const participant = participants.find((candidate) => candidate.userId === userId);
    return participant ? participantRoleToApi[participant.role] : undefined;
  }

  private async getActiveSessionScenarioEntityOrThrow(sessionId: string) {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const sessionScenario = await this.prisma.sessionScenario.findFirst({
      where: {
        sessionId: resolvedSessionId,
        status: PrismaSessionScenarioStatus.ACTIVE,
      },
      include: {
        scenario: true,
        gameState: true,
      },
      orderBy: { sequence: "asc" },
    });

    if (sessionScenario) {
      return sessionScenario;
    }

    const fallbackScenario = await this.prisma.sessionScenario.findFirst({
      where: { sessionId: resolvedSessionId },
      include: {
        scenario: true,
        gameState: true,
      },
      orderBy: { sequence: "asc" },
    });

    if (!fallbackScenario) {
      throw new NotFoundException(`Session ${resolvedSessionId} does not have a scenario.`);
    }

    return fallbackScenario;
  }

  private async deleteSessionScenarioLinks(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
    await tx.sessionScenario.deleteMany({ where: { sessionId } });
  }

  private getActiveSessionScenario<T extends { status: PrismaSessionScenarioStatus }>(sessionScenarios: T[]): T | null {
    return sessionScenarios.find((candidate) => candidate.status === PrismaSessionScenarioStatus.ACTIVE) ?? sessionScenarios[0] ?? null;
  }

  private resolveVisibility(
    visibility?: SessionVisibility,
    isPrivate?: boolean,
    isPublic?: boolean,
    fallback: PrismaSessionVisibility = PrismaSessionVisibility.PUBLIC,
  ): PrismaSessionVisibility {
    if (visibility) {
      return visibility === SessionVisibility.PRIVATE ? PrismaSessionVisibility.PRIVATE : PrismaSessionVisibility.PUBLIC;
    }

    if (isPrivate !== undefined) {
      return isPrivate ? PrismaSessionVisibility.PRIVATE : PrismaSessionVisibility.PUBLIC;
    }

    if (isPublic !== undefined) {
      return isPublic ? PrismaSessionVisibility.PUBLIC : PrismaSessionVisibility.PRIVATE;
    }

    return fallback;
  }

  private async generateInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const existing = await this.prisma.session.findUnique({
        where: { inviteCode: code },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException("Failed to allocate a unique invite code.");
  }

  private async ensureSessionPublicId<T extends { id: string; publicId: string | null }>(session: T): Promise<T & { publicId: string }> {
    if (session.publicId) {
      return session as T & { publicId: string };
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const updated = await this.prisma.session.update({
          where: { id: session.id },
          data: { publicId: generateEightDigitPublicId() },
          select: { publicId: true },
        });

        return {
          ...session,
          publicId: updated.publicId!,
        };
      } catch {
        // unique collision: retry with another random value
      }
    }

    throw new ConflictException("세션 공개 식별자를 생성하지 못했습니다.");
  }

  private async generateSessionPublicId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicId = generateEightDigitPublicId();
      const existing = await this.prisma.session.findUnique({
        where: { publicId },
        select: { id: true },
      });

      if (!existing) {
        return publicId;
      }
    }

    throw new ConflictException("세션 공개 식별자를 생성하지 못했습니다.");
  }
}
