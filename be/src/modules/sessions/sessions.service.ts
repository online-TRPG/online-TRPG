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
  ConnectionStatus,
  ActionOutcome,
  CreateSessionDto,
  CreateVttMapPingDto,
  DiceAdvantageState,
  GameStateResponseDto,
  GmMode,
  GrantHumanGmInventoryItemDto,
  HumanGmNodeMoveOptionDto,
  HumanGmMessageDto,
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
import {
  GmOverrideKind,
  GmOverrideService,
} from "../rules/gm-override.service";
import { ScenariosService } from "../scenarios/scenarios.service";
import { UsersService } from "../users/users.service";

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

type RevealPolicyMode =
  | "AUTO_REVEAL"
  | "PLAYER_ACTION"
  | "CHECK_SUCCESS"
  | "CHECK_PARTIAL"
  | "POST_COMBAT"
  | "GM_APPROVAL";

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

function isSessionListItem(
  item: SessionListItemResponseDto | null,
): item is SessionListItemResponseDto {
  return item !== null;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly gmOverrideService = new GmOverrideService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly scenariosService: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

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
          flagsJson: JSON.stringify({}),
        },
      });

      return createdSession;
    });

    return this.buildSnapshot(session.id);
  }

  async listAvailableSessions(params: SessionPageParams = {}): Promise<SessionPageResult> {
    const where: Prisma.SessionWhereInput = {
      visibility: PrismaSessionVisibility.PUBLIC,
      status: params.status
        ? sessionStatusToPrisma[params.status]
        : PrismaSessionStatus.RECRUITING,
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
          availableSlots: Math.max(
            ensuredSession.maxParticipants - ensuredSession.participants.length,
            0,
          ),
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
            role:
              session.gmUserId === nextHost.userId
                ? PrismaParticipantRole.GM
                : PrismaParticipantRole.HOST,
          },
        });
      }
    });

    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, await this.buildSnapshot(resolvedSessionId));
  }

  async getSessionForUser(userId: string, sessionId: string): Promise<SessionDetailResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;

    if (session.visibility === PrismaSessionVisibility.PRIVATE) {
      await this.ensureMembership(userId, resolvedSessionId);
    }

    return this.buildDetail(resolvedSessionId);
  }

  async getParticipantsForUser(
    userId: string,
    sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
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

  async getParticipantStatusesForUser(
    userId: string,
    sessionId: string,
  ): Promise<ParticipantStatusResponseDto[]> {
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
      connectionStatus:
        participant.connectionStatus === PrismaConnectionStatus.ONLINE
          ? ConnectionStatus.ONLINE
          : ConnectionStatus.OFFLINE,
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

    const scenarioMap = await this.getScenarioDefaultVttMapForNode(
      sessionScenario.id,
      state.currentNodeId,
    );
    if (scenarioMap) {
      const normalizedMap = this.normalizeVttMap(scenarioMap, state.currentNodeId ?? null);
      const map = await this.applyScenarioStartingPositions(resolvedSessionId, normalizedMap);
      return canSeeGmMap ? map : this.redactVttMapForPlayer(map);
    }

    const map = await this.buildDefaultVttMap(resolvedSessionId, state.currentNodeId ?? null);
    return canSeeGmMap ? map : this.redactVttMapForPlayer(map);
  }

  async updateVttMap(
    userId: string,
    sessionId: string,
    dto: UpdateVttMapDto,
  ): Promise<VttMapStateDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    if (session.hostUserId !== userId) {
      this.logger.debug(
        `[VTT_LEGACY_PLAYER_MAP_UPDATE_IGNORED] sessionId=${resolvedSessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"}`,
      );
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

  async updateGmVttMap(
    userId: string,
    sessionId: string,
    dto: UpdateVttMapDto,
  ): Promise<VttMapStateDto> {
    return this.updateVttMap(userId, sessionId, dto);
  }

  async moveSessionToken(
    userId: string,
    sessionId: string,
    dto: MoveSessionTokenDto,
  ): Promise<VttMapStateDto> {
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
      tokens: previousMap.tokens.map((candidate) =>
        candidate.id === token.id ? requestedToken : candidate,
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

    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async createVttMapPing(
    userId: string,
    sessionId: string,
    dto: CreateVttMapPingDto,
  ): Promise<VttMapStateDto> {
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
        ...(previousMap.pings ?? [])
          .filter((ping) => Date.parse(ping.expiresAt) > now)
          .slice(-4),
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

  async hideVttTokenForSessionCharacter(
    sessionId: string,
    sessionCharacterId: string,
  ): Promise<VttMapStateDto | null> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(session.id);
    const map = await this.getVttMapBaseline(session.id, sessionScenario.id, state);
    const token = map.tokens.find(
      (candidate) => candidate.sessionCharacterId === sessionCharacterId && candidate.hidden !== true,
    );
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
      (candidate) =>
        candidate.sessionCharacterId === params.sessionCharacterId &&
        candidate.hidden !== true &&
        candidate.isHostile !== true,
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
      tokens: previousMap.tokens.map((candidate) =>
        candidate.id === token.id ? requestedToken : candidate,
      ),
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
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const { sessionScenario, state } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const visits = await this.prisma.sessionNodeVisit.findMany({
      where: { sessionScenarioId: sessionScenario.id },
      orderBy: { firstVisitedAt: "asc" },
    });
    const visitedNodeIds = Array.from(
      new Set([
        ...visits.map((visit) => visit.nodeId),
        ...(state.currentNodeId ? [state.currentNodeId] : []),
      ]),
    );
    const nodes = visitedNodeIds.length
      ? await this.prisma.sessionScenarioNode.findMany({
          where: {
            sessionScenarioId: sessionScenario.id,
            nodeId: { in: visitedNodeIds },
          },
        })
      : [];
    const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
    const revealedClueSnapshots = await this.getRevealedClueSnapshotsForUser(
      sessionScenario.id,
      resolvedSessionId,
      userId,
    );
    const visitedNodes = visitedNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => this.mapPlayerScenarioNode(node, revealedClueSnapshots));
    const revealedClues = this.getUniquePlayerClues(
      visitedNodes.flatMap((node) => node.publicClues),
    );

    return {
      sessionScenarioId: sessionScenario.id,
      scenarioId: sessionScenario.scenarioId,
      currentNodeId: state.currentNodeId ?? null,
      currentNode: state.currentNodeId
        ? visitedNodes.find((node) => node.id === state.currentNodeId) ?? null
        : null,
      visitedNodes,
      revealedClues,
    };
  }

  async getPublicClueSummariesForUser(userId: string, sessionId: string): Promise<string[]> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.ensureMembership(userId, resolvedSessionId);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const revealedClueSnapshots = await this.getRevealedClueSnapshotsForUser(
      activeScenario.id,
      resolvedSessionId,
      userId,
    );
    if (!revealedClueSnapshots.size) {
      return [];
    }

    return Array.from(revealedClueSnapshots.values())
      .map((clue) => this.mapPlayerScenarioClue(clue))
      .filter((clue): clue is PlayerScenarioClueDto => Boolean(clue))
      .map((clue) => `${clue.title}: ${clue.text}`);
  }

  async revealSessionContent(
    userId: string,
    sessionId: string,
    dto: RevealSessionContentDto,
  ): Promise<SessionRevealResponseDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await this.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const contentKind = dto.contentKind?.trim() || "clue";
    const scope = dto.scope ?? "party";
    const recipientId = dto.recipientId?.trim() || null;
    const content = await this.findSessionScenarioRevealable(activeScenario.id, dto.contentId);
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    const reveal = await this.prisma.$transaction(async (tx) => {
      const createdReveal = await this.recordSessionReveal(tx, {
        sessionScenarioId: activeScenario.id,
        contentId: dto.contentId,
        contentKind,
        scope,
        recipientId,
        revealedBy: "human_gm",
        reason: dto.reason?.trim() || "manual_gm_reveal",
        snapshot: content,
      });
      gmTurnLog = await this.createHumanGmOverrideTurnLog({
        tx,
        kind: "reveal_handout",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        publicNarration: dto.reason?.trim() || "GM revealed session content.",
        targetId: dto.contentId,
        statePatch: {
          revealId: createdReveal.id,
          contentId: dto.contentId,
          contentKind,
          scope,
          recipientId,
        },
        metadata: {
          reason: dto.reason?.trim() || "manual_gm_reveal",
        },
      });
      return createdReveal;
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
    if (emittedGmTurnLog) {
      this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return this.mapSessionReveal(reveal);
  }

  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<SessionResponseDto> {
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
        captainUserId:
          dto.captainUserId === undefined ? session.captainUserId : dto.captainUserId,
        nextSessionAt:
          dto.nextSessionAt === undefined
            ? session.nextSessionAt
            : dto.nextSessionAt === null
              ? null
              : new Date(dto.nextSessionAt),
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

  async updateHumanGm(
    userId: string,
    sessionId: string,
    dto: UpdateHumanGmDto,
  ): Promise<SessionSnapshotDto> {
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
          availableSlots: Math.max(
            ensuredSession.maxParticipants - ensuredSession.participants.length,
            0,
          ),
          role: this.getParticipantRoleForUser(ensuredSession.participants, userId),
        };
      }),
      )
    ).filter(isSessionListItem);

    return { items, totalElements };
  }

  async selectCharacterForSession(
    userId: string,
    sessionId: string,
    dto: SelectSessionCharacterDto,
  ): Promise<SessionParticipantResponseDto> {
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
      this.realtimeEvents.emitSessionSnapshot(
        resolvedSessionId,
        await this.buildSnapshot(resolvedSessionId),
      );
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

    await this.replaceSessionInventoryEntries(
      sessionCharacter.id,
      this.parseJson<InventoryItemDto[]>(character.inventoryJson, []),
    );
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
    this.realtimeEvents.emitCharacterUpdated(
      resolvedSessionId,
      mapSessionCharacter(sessionCharacterWithInventory),
    );
    this.realtimeEvents.emitSessionSnapshot(
      resolvedSessionId,
      await this.buildSnapshot(resolvedSessionId),
    );
    return mappedParticipant;
  }

  async updateParticipantReadyState(
    userId: string,
    sessionId: string,
    dto: UpdateParticipantReadyDto,
  ): Promise<SessionParticipantResponseDto> {
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
      this.realtimeEvents.emitSessionSnapshot(
        resolvedSessionId,
        await this.buildSnapshot(resolvedSessionId),
      );
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
    this.realtimeEvents.emitSessionSnapshot(
      resolvedSessionId,
      await this.buildSnapshot(resolvedSessionId),
    );
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
    this.realtimeEvents.emitSessionSnapshot(
      resolvedSessionId,
      await this.buildSnapshot(resolvedSessionId),
    );
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

    const playerParticipants = participants.filter(
      (participant) => participant.role !== PrismaParticipantRole.GM,
    );
    if (session.gmMode === PrismaGmMode.HUMAN) {
      const gmUserId = session.gmUserId ?? session.hostUserId;
      const gmParticipant = participants.find(
        (participant) =>
          participant.userId === gmUserId &&
          participant.role === PrismaParticipantRole.GM,
      );
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
    const scenarioMap = currentNodeId
      ? await this.getScenarioDefaultVttMapForNode(activeScenario.id, currentNodeId)
      : null;
    const runtimeMap = existingMap
      ? await this.applyScenarioStartingPositions(resolvedSessionId, existingMap)
      : scenarioMap
        ? await this.applyScenarioStartingPositions(
            resolvedSessionId,
            this.normalizeVttMap(scenarioMap, currentNodeId),
          )
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

  async createHumanGmMessage(
    userId: string,
    sessionId: string,
    dto: HumanGmMessageDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const { state, sessionScenario } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const gmMessages = Array.isArray(flags.gmMessages) ? [...(flags.gmMessages as unknown[])] : [];
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    gmMessages.push({
      id: randomUUID(),
      type: dto.asNpc ? "npc" : "gm",
      speakerName: dto.speakerName?.trim() || null,
      content: dto.content.trim(),
      createdAt: new Date().toISOString(),
      authorUserId: userId,
    });

    await this.prisma.$transaction(async (tx) => {
      if (session.status === PrismaSessionStatus.RECRUITING) {
        await this.ensureSessionScenarioNodeSnapshot(
          tx,
          sessionScenario.id,
          sessionScenario.scenarioId,
        );
        if (state.currentNodeId) {
          await this.recordNodeVisit(tx, {
            sessionScenarioId: sessionScenario.id,
            nodeId: state.currentNodeId,
          });
        }
      }

      await tx.gameState.update({
        where: { sessionScenarioId: sessionScenario.id },
        data: {
          flagsJson: JSON.stringify({
            ...flags,
            gmMessages: gmMessages.slice(-50),
          }),
        },
      });
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.RECRUITING
              ? PrismaSessionStatus.PLAYING
              : session.status,
        },
      });
      gmTurnLog = await this.createHumanGmOverrideTurnLog({
        tx,
        kind: dto.asNpc ? "npc_dialogue" : "scene_text",
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        gmUserId: userId,
        publicNarration: dto.content,
        privateNote: dto.privateNote,
        targetId: dto.speakerName?.trim() || null,
        statePatch: {
          gmMessageCreated: true,
          messageType: dto.asNpc ? "npc" : "gm",
          speakerName: dto.speakerName?.trim() || null,
        },
        metadata: {
          speakerName: dto.speakerName?.trim() || null,
          messageType: dto.asNpc ? "npc" : "gm",
        },
      });
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
    if (emittedGmTurnLog) {
      this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async grantHumanGmInventoryItem(
    userId: string,
    sessionId: string,
    dto: GrantHumanGmInventoryItemDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    if (session.status === PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Started sessions are required for GM inventory grants.");
    }

    const quantity = dto.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException("지급할 아이템 수량이 올바르지 않습니다.");
    }

    const [activeScenario, targetCharacter, catalogItem] = await Promise.all([
      this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId),
      this.prisma.sessionCharacter.findUnique({
        where: { id: dto.sessionCharacterId },
        include: {
          character: true,
          participant: {
            select: { role: true },
          },
        },
      }),
      this.prisma.item.findFirst({
        where: {
          OR: [{ id: dto.itemDefinitionId }, { key: dto.itemDefinitionId }],
        },
        select: { id: true, key: true },
      }),
    ]);
    const itemDefinitionLookupIds = [
      dto.itemDefinitionId,
      catalogItem?.id,
      catalogItem?.key,
    ].filter((value): value is string => Boolean(value));
    const itemDefinition = await this.prisma.itemDefinition.findFirst({
      where: {
        OR: [
          { id: { in: itemDefinitionLookupIds } },
          { name: { equals: dto.itemDefinitionId, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, itemType: true },
    });

    if (
      !targetCharacter ||
      targetCharacter.sessionId !== resolvedSessionId ||
      targetCharacter.status !== PrismaSessionCharacterStatus.ACTIVE
    ) {
      throw new NotFoundException("대상 세션 캐릭터를 찾을 수 없습니다.");
    }
    if (targetCharacter.participant.role === PrismaParticipantRole.GM) {
      throw new ForbiddenException("GM 참가자에게는 인벤토리 아이템을 지급할 수 없습니다.");
    }
    if (!itemDefinition) {
      throw new NotFoundException("지급할 아이템을 찾을 수 없습니다.");
    }

    const gmTurnLog = await this.prisma.$transaction(async (tx) => {
      await this.grantSessionInventoryItem(tx, {
        sessionCharacterId: targetCharacter.id,
        itemDefinitionId: itemDefinition.id,
        quantity,
      });
      await this.refreshSessionInventorySnapshot(targetCharacter.id, tx);
      return this.createHumanGmOverrideTurnLog({
        tx,
        kind: "adjust_item",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        targetId: targetCharacter.id,
        publicNarration: `GM이 ${targetCharacter.character.name}에게 ${itemDefinition.name} x${quantity}을(를) 지급했습니다.`,
        statePatch: {
          inventory: {
            sessionCharacterId: targetCharacter.id,
            itemDefinitionId: itemDefinition.id,
            quantityDelta: quantity,
          },
        },
        metadata: {
          itemName: itemDefinition.name,
          itemType: itemDefinition.itemType,
          quantity,
        },
      });
    });

    const updatedCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
      where: { id: targetCharacter.id },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    this.realtimeEvents.emitCharacterUpdated(
      resolvedSessionId,
      mapSessionCharacter(updatedCharacter),
    );
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async updateSessionNode(
    userId: string,
    sessionId: string,
    dto: UpdateSessionNodeDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await this.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const targetNode = await this.getSessionScenarioNodeEntityOrThrow(activeScenario.id, dto.nodeId);
    const currentState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: activeScenario.id },
    });
    if (!currentState?.currentNodeId) {
      throw new BadRequestException("The session does not have a current node.");
    }
    const currentNode = await this.getSessionScenarioNodeEntityOrThrow(
      activeScenario.id,
      currentState.currentNodeId,
    );
    this.ensureReachableSessionNodeTarget(currentNode, targetNode.nodeId);
    const flags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
    const targetDefaultMap = this.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);
    const targetRuntimeMap = targetDefaultMap
      ? await this.applyScenarioStartingPositions(
          resolvedSessionId,
          this.normalizeVttMap(targetDefaultMap, targetNode.nodeId),
        )
      : null;
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    await this.prisma.$transaction(async (tx) => {
      await this.lockSessionRuntime(tx, resolvedSessionId);
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.RECRUITING
              ? PrismaSessionStatus.PLAYING
              : session.status,
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          currentNodeId: targetNode.nodeId,
          phase: this.getPhaseForScenarioNodeType(targetNode.nodeType),
          flagsJson: JSON.stringify({
            ...flags,
            ...(targetRuntimeMap ? { vttMap: targetRuntimeMap } : {}),
          }),
        },
      });
      await this.recordNodeVisit(tx, {
        sessionScenarioId: activeScenario.id,
        nodeId: targetNode.nodeId,
      });
      gmTurnLog = await this.createHumanGmOverrideTurnLog({
        tx,
        kind: "node_move",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        publicNarration: `GM moved the scene to ${targetNode.title}.`,
        targetId: targetNode.nodeId,
        statePatch: {
          currentNodeId: targetNode.nodeId,
          phase: this.getPhaseForScenarioNodeType(targetNode.nodeType),
          vttMapChanged: Boolean(targetRuntimeMap),
        },
        metadata: {
          nodeTitle: targetNode.title,
        },
      });
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
    if (emittedGmTurnLog) {
      this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async listHumanGmNodeMoveOptions(
    userId: string,
    sessionId: string,
  ): Promise<HumanGmNodeMoveOptionDto[]> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(session.id);
    await this.ensureSessionScenarioNodeSnapshotForScenario(
      activeScenario.id,
      activeScenario.scenarioId,
    );
    const currentNodeId = activeScenario.gameState?.currentNodeId ?? null;
    if (!currentNodeId) return [];

    const currentNode = await this.getSessionScenarioNodeEntityOrThrow(
      activeScenario.id,
      currentNodeId,
    );
    const transitions = this.parseJson<Record<string, unknown>[]>(
      currentNode.transitionsJson,
      [],
    );
    const transitionStubs = transitions
      .map((transition) => {
        const nodeId = this.getStringProperty(transition, "nextNodeId");
        return nodeId
          ? {
              nodeId,
              label: this.getStringProperty(transition, "label"),
              condition: this.getStringProperty(transition, "condition"),
              note: this.getStringProperty(transition, "note"),
              isFallback: false,
            }
          : null;
      })
      .filter((stub): stub is {
        nodeId: string;
        label: string | null;
        condition: string | null;
        note: string | null;
        isFallback: boolean;
      } => Boolean(stub));

    if (currentNode.fallbackNodeId) {
      transitionStubs.push({
        nodeId: currentNode.fallbackNodeId,
        label: "기본 이동",
        condition: "default",
        note: null,
        isFallback: true,
      });
    }

    if (!transitionStubs.length) return [];

    const targetNodes = await this.prisma.sessionScenarioNode.findMany({
      where: {
        sessionScenarioId: activeScenario.id,
        nodeId: { in: Array.from(new Set(transitionStubs.map((stub) => stub.nodeId))) },
      },
      select: { nodeId: true, title: true, nodeType: true },
    });
    const nodeById = new Map(targetNodes.map((node) => [node.nodeId, node]));

    return transitionStubs.flatMap((stub) => {
      const targetNode = nodeById.get(stub.nodeId);
      if (!targetNode) return [];
      return [
        {
          nodeId: targetNode.nodeId,
          title: targetNode.title,
          nodeType: targetNode.nodeType,
          label: stub.label,
          condition: stub.condition,
          note: stub.note,
          isFallback: stub.isFallback,
        },
      ];
    });
  }

  async startCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.COMBAT);
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const gmTurnLog = await this.createHumanGmOverrideTurnLog({
      kind: "combat_start",
      sessionId: resolvedSessionId,
      sessionScenarioId: activeScenario.id,
      gmUserId: userId,
      publicNarration: "GM started combat.",
      statePatch: {
        phase: PrismaGamePhase.COMBAT,
      },
    });
    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async endCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await this.completeActiveCombatState(resolvedSessionId);
    const gmTurnLog = await this.createHumanGmOverrideTurnLog({
      kind: "combat_end",
      sessionId: resolvedSessionId,
      sessionScenarioId: activeScenario.id,
      gmUserId: userId,
      publicNarration: "GM ended combat.",
      statePatch: {
        phase: PrismaGamePhase.EXPLORATION,
      },
    });
    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitTurnLogCreated(resolvedSessionId, gmTurnLog.turnLog);
    if (gmTurnLog.stateDiff) {
      this.realtimeEvents.emitStateDiffApplied(resolvedSessionId, gmTurnLog.stateDiff);
    }
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
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
      currentNodeId && !completedCombatNodeIds.includes(currentNodeId)
        ? [...completedCombatNodeIds, currentNodeId]
        : completedCombatNodeIds;

    this.logger.debug(
      `[COMBAT_COMPLETE_STATE] sessionId=${resolvedSessionId} combatId=${combatId ?? "active"} currentNodeId=${currentNodeId ?? "null"} previousPhase=${state?.phase ?? "null"} nextCompletedCombatNodeIds=${JSON.stringify(nextCompletedCombatNodeIds)}`,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.COMPLETED
              ? PrismaSessionStatus.COMPLETED
              : PrismaSessionStatus.PLAYING,
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

  async completeSessionFromEndingNode(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    reason: string;
  }): Promise<SessionSnapshotDto> {
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
  }): Promise<number> {
    const revealedClues = await this.revealCurrentNodeCluesAfterActionWithDetails(params);
    return revealedClues.length;
  }

  async revealCurrentNodeCluesAfterActionWithDetails(params: {
    sessionScenarioId: string;
    nodeId: string;
    actionText: string;
    outcome: ActionOutcome;
    policyModes?: RevealPolicyMode[];
    turnLogId?: string | null;
    revealedBy?: string;
  }): Promise<Array<{ id: string; title: string; text: string | null }>> {
    return this.prisma.$transaction((tx) =>
      this.recordCurrentNodeCluesByPolicy(tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
        actionText: params.actionText,
        outcome: params.outcome,
        policyModes: params.policyModes ?? ["PLAYER_ACTION", "CHECK_SUCCESS", "CHECK_PARTIAL"],
        turnLogId: params.turnLogId,
        revealedBy: params.revealedBy ?? "system",
      }),
    );
  }

  async describeVttObjectAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{ message: string; checkOptions?: MainCommandCheckOptionDto[] } | null> {
    const map = await this.getVttMapForSessionScenario(params.sessionId, params.sessionScenarioId);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || objectCell.visibleToPlayers === false) {
      return null;
    }

    const name = objectCell.name?.trim() || "오브젝트";
    const description = objectCell.description?.trim() || "겉으로 드러난 추가 설명은 없습니다.";
    if (await this.isVttObjectHiddenContentExhausted(params.sessionId, params.sessionScenarioId, objectCell)) {
      return { message: "여기에는 더 숨겨진 것이 없습니다." };
    }

    const revealCheck = this.getFirstVttObjectRevealCheck(objectCell);
    if (revealCheck) {
      return {
        message: `${name}을(를) 자세히 조사하려면 판정이 필요합니다.`,
        checkOptions: [
          {
            ...(revealCheck.ability ? { ability: revealCheck.ability } : {}),
            ...(revealCheck.skill ? { skill: revealCheck.skill } : {}),
            dc: revealCheck.dc,
            reason: `${name} 조사`,
          },
        ],
      };
    }
    return { message: `${name}: ${description}` };
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
    const map = await this.getVttMapForSessionScenario(params.sessionId, params.sessionScenarioId);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || objectCell.visibleToPlayers === false) {
      return { count: 0, revealedClues: [], revealedItems: [] };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const clueSnapshots = await this.getCurrentNodeClueSnapshots(tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
      });
      const hiddenItemIds = (objectCell.hiddenItemIds ?? [])
        .map((contentId) => contentId.trim())
        .filter((contentId) => contentId);
      const itemDefinitions = hiddenItemIds.length
        ? await tx.itemDefinition.findMany({
            where: {
              OR: [
                { id: { in: hiddenItemIds } },
                { name: { in: hiddenItemIds } },
              ],
            },
            select: { id: true, name: true, description: true },
          })
        : [];
      const itemDefinitionByLookup = new Map<string, { id: string; name: string; description: string | null }>();
      itemDefinitions.forEach((itemDefinition) => {
        itemDefinitionByLookup.set(itemDefinition.id, itemDefinition);
        itemDefinitionByLookup.set(itemDefinition.name, itemDefinition);
      });
      const revealInputs: Array<{
        contentId: string;
        contentKind: "clue" | "item" | "event";
        snapshot: Record<string, unknown>;
      }> = this.getVttObjectHiddenContentKeys(objectCell)
        .map((item) => {
          if (item.contentKind === "clue") {
            return {
              ...item,
              snapshot: clueSnapshots.get(item.contentId) ?? { id: item.contentId },
            };
          }
          if (item.contentKind === "item") {
            const itemDefinition = itemDefinitionByLookup.get(item.contentId);
            return {
              ...item,
              snapshot: {
                id: itemDefinition?.id ?? item.contentId,
                name: itemDefinition?.name ?? item.contentId,
                sourceObjectId: objectCell.id,
              },
            };
          }
          return {
            ...item,
            snapshot: { id: item.contentId, sourceObjectId: objectCell.id },
          };
        })
        .filter((item) => item.contentId.trim());
      const revealChecks = this.getVttObjectRevealChecks(objectCell);
      const filteredRevealInputs = revealInputs.filter((item) =>
        this.canRevealVttObjectContentByCheck(item.contentId, revealChecks, params.checkOption),
      );
      const existingReveals = filteredRevealInputs.length
        ? await tx.sessionReveal.findMany({
            where: {
              sessionScenarioId: params.sessionScenarioId,
              scope: "party",
              recipientKey: "party",
              OR: filteredRevealInputs.map((item) => ({
                contentId: item.contentId,
                contentKind: item.contentKind,
              })),
            },
            select: {
              contentId: true,
              contentKind: true,
            },
          })
        : [];
      const existingRevealKeys = new Set(
        existingReveals.map((reveal) => `${reveal.contentKind}:${reveal.contentId}`),
      );
      const newRevealInputs = filteredRevealInputs.filter(
        (item) => !existingRevealKeys.has(`${item.contentKind}:${item.contentId}`),
      );
      const revealedItemCandidates = filteredRevealInputs
        .filter((item) => item.contentKind === "item")
        .map((item) => {
          const itemDefinition = itemDefinitionByLookup.get(item.contentId);
          return itemDefinition ? { contentId: item.contentId, itemDefinition } : null;
        })
        .filter(
          (item): item is {
            contentId: string;
            itemDefinition: { id: string; name: string; description: string | null };
          } =>
            Boolean(item),
        );
      const partyOwnedItemDefinitionIds =
        params.sessionCharacterId && revealedItemCandidates.length
          ? await this.getPartyInventoryItemDefinitionIds(
              tx,
              params.sessionId,
              revealedItemCandidates.map((item) => item.itemDefinition.id),
            )
          : new Set<string>();
      const newRevealKeys = new Set(
        newRevealInputs.map((item) => `${item.contentKind}:${item.contentId}`),
      );
      const grantItemCandidates = revealedItemCandidates.filter(
        (item) =>
          newRevealKeys.has(`item:${item.contentId}`) ||
          !partyOwnedItemDefinitionIds.has(item.itemDefinition.id),
      );

      await Promise.all(
        newRevealInputs.map((item) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId: item.contentId,
            contentKind: item.contentKind,
            scope: "party",
            revealedBy: params.revealedBy ?? "system",
            reason: "vtt_object_investigation",
            turnLogId: params.turnLogId,
            snapshot: item.snapshot,
          }),
        ),
      );
      if (params.sessionCharacterId && grantItemCandidates.length) {
        await tx.inventoryEntry.createMany({
          data: grantItemCandidates.map(({ itemDefinition }) => ({
            sessionCharacterId: params.sessionCharacterId!,
            itemDefinitionId: itemDefinition.id,
            quantity: 1,
          })),
        });
      }
      const recoveredItemCount = grantItemCandidates.filter((item) =>
        existingRevealKeys.has(`item:${item.contentId}`),
      ).length;

      return {
        count: newRevealInputs.length + recoveredItemCount,
        revealedClues: newRevealInputs
          .filter((item) => item.contentKind === "clue")
          .map((item) => this.toRevealClueSummary(item.contentId, item.snapshot)),
        revealedItems: grantItemCandidates.map(({ itemDefinition }) => ({
          id: itemDefinition.id,
          name: itemDefinition.name,
          quantity: 1,
          description: itemDefinition.description,
        })),
      };
    });
    if (params.sessionCharacterId && result.revealedItems.length) {
      await this.refreshSessionInventorySnapshot(params.sessionCharacterId);
    }
    return result;
  }

  async revealObservableVttObjectsInPartyVision(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    visionRangeFeet?: number;
  }): Promise<{ count: number; objectNames: string[] }> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return { count: 0, objectNames: [] };
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCells = map.objectCells ?? [];
    const partyTokens = map.tokens.filter(
      (token) => token.sessionCharacterId && token.hidden !== true && token.isHostile !== true,
    );
    if (!objectCells.length || !partyTokens.length) {
      return { count: 0, objectNames: [] };
    }

    const visionRangeFeet = params.visionRangeFeet ?? 40;
    const observableObjectIds = new Set<string>();
    const objectNames: string[] = [];
    for (const objectCell of objectCells) {
      if (this.isVttObjectObserved(objectCell)) {
        continue;
      }
      if (!this.hasDiscoverableVttObjectContent(objectCell)) {
        continue;
      }
      if (!this.isVttObjectInPartyVision(map, objectCell, partyTokens, visionRangeFeet)) {
        continue;
      }

      observableObjectIds.add(objectCell.id);
      objectNames.push(objectCell.name?.trim() || "수상한 오브젝트");
    }

    if (!observableObjectIds.size) {
      return { count: 0, objectNames: [] };
    }

    const nextMap = this.normalizeVttMap(
      {
        ...map,
        objectCells: objectCells.map((objectCell) =>
          observableObjectIds.has(objectCell.id)
            ? {
                ...objectCell,
                visibleToPlayers: true,
                observedBySessionCharacterIds: Array.from(
                  new Set([...(objectCell.observedBySessionCharacterIds ?? []), "party"]),
                ),
              }
            : objectCell,
        ),
      },
      state.currentNodeId ?? null,
    );
    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: nextMap,
        }),
      },
    });

    const session = await this.getSessionEntityOrThrow(params.sessionId);
    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: nextMap,
      playerMap: this.redactVttMapForPlayer(nextMap),
    });

    return { count: observableObjectIds.size, objectNames };
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
    const result = await this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 지나갈 수 있습니다.` };
      }
      if (door.state === "locked") {
        const requiredKeyId = door.keyItemId?.trim() || null;
        const providedItemId = params.itemId?.trim() || null;
        if (requiredKeyId && providedItemId !== requiredKeyId) {
          return {
            door,
            status: MainCommandStatus.IMPOSSIBLE,
            message: `${doorName}은 잠겨 있습니다. 맞는 열쇠가 필요합니다.`,
          };
        }
        if (!requiredKeyId || !providedItemId) {
          return {
            door,
            status: MainCommandStatus.CHECK_REQUIRED,
            message: `${doorName}은 잠겨 있습니다. 자물쇠를 열려면 판정이 필요합니다.`,
            checkOptions: [{ skill: "sleight_of_hand", dc: 15, reason: "잠긴 문 해제" }],
            checkEffect: this.buildVttDoorCheckEffect(door, params, "open"),
          };
        }
      }

      return {
        door: { ...door, state: "open" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 열었습니다.`,
      };
    });

    return result
      ? {
          status: result.status,
          message: result.message,
          checkOptions: result.checkOptions,
          checkEffect: result.checkEffect,
        }
        : null;
  }

  async closeVttDoorAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{
    status: MainCommandStatus;
    message: string;
  } | null> {
    return this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "closed") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 닫혀 있습니다.` };
      }
      if (door.state === "locked") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 잠겨 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.IMPOSSIBLE, message: `${doorName}은 파괴되어 닫을 수 없습니다.` };
      }

      return {
        door: { ...door, state: "closed" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 닫았습니다.`,
      };
    });
  }

  async triggerVttObjectEventAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    includeHiddenObject?: boolean;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
  }> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드와 다른 오브젝트 이벤트는 실행할 수 없습니다.",
      };
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCell = this.findVttObjectAtPoint(map, params.mapPoint);
    if (!objectCell || (!params.includeHiddenObject && objectCell.visibleToPlayers === false)) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "실행할 오브젝트 이벤트를 현재 맵에서 찾을 수 없습니다.",
      };
    }

    const events = (objectCell.events ?? []).filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY");
    if (!events.length || !map.fogRects.length) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${objectCell.name?.trim() || "오브젝트"}에는 지금 실행할 수 있는 이벤트가 없습니다.`,
      };
    }

    const revealEvent = events[0];
    const revealRadiusFeet = this.clampNumber(Number(revealEvent.effect?.revealRadiusFeet), 5, 500);
    const revealBox = this.buildFogRevealBoxForObject(map, objectCell, revealRadiusFeet);
    const nextFogRects = map.fogRects.flatMap((rect) => this.subtractFogBox(rect, revealBox)).slice(0, 200);
    if (JSON.stringify(nextFogRects) === JSON.stringify(map.fogRects)) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${objectCell.name?.trim() || "오브젝트"} 주변에는 추가로 공개할 안개 영역이 없습니다.`,
      };
    }

    const nextMap = this.normalizeVttMap(
      {
        ...map,
        fogRects: nextFogRects,
        updatedAt: new Date().toISOString(),
      },
      state.currentNodeId ?? null,
    );
    await this.prisma.$transaction(async (tx) => {
      await this.recordSessionReveal(tx, {
        sessionScenarioId: params.sessionScenarioId,
        contentId: revealEvent.id,
        contentKind: "event",
        scope: "party",
        revealedBy: "player",
        reason: "vtt_object_manual_trigger",
        snapshot: {
          id: revealEvent.id,
          name: revealEvent.name ?? null,
          type: revealEvent.type,
          sourceObjectId: objectCell.id,
          sourceObjectName: objectCell.name ?? null,
          currentNodeId: state.currentNodeId,
          trigger: revealEvent.trigger,
          effect: revealEvent.effect,
        },
      });
      await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });
    });

    const session = await this.getSessionEntityOrThrow(params.sessionId);
    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: nextMap,
      playerMap: this.redactVttMapForPlayer(nextMap),
    });
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.buildSnapshot(session.id));

    return {
      status: MainCommandStatus.RESOLVED,
      message: `${objectCell.name?.trim() || "오브젝트"}의 이벤트를 실행해 주변 영역을 공개했습니다.`,
    };
  }

  async breakVttDoorAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.updateVttDoorAtPoint(params, (door) => {
      const doorName = door.name?.trim() || "문";

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 있습니다.` };
      }
      if (!door.canBreak) {
        return {
          door,
          status: MainCommandStatus.IMPOSSIBLE,
          message: `${doorName}은 현재 방식으로 부수기 어렵습니다.`,
        };
      }
      if (door.breakCheckDc) {
        return {
          door,
          status: MainCommandStatus.CHECK_REQUIRED,
          message: `${doorName}을 부수려면 DC ${door.breakCheckDc} 판정이 필요합니다.`,
          checkOptions: [{ ability: "str", dc: door.breakCheckDc, reason: "문 파괴" }],
          checkEffect: this.buildVttDoorCheckEffect(door, params, "broken"),
        };
      }

      return {
        door: { ...door, state: "broken" as const },
        status: MainCommandStatus.RESOLVED,
        message: `${doorName}을 부쉈습니다.`,
      };
    });
  }

  async applyVttDoorCheckSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    doorId: string;
    nodeId: string;
    effect: "open" | "broken";
  }): Promise<{ status: MainCommandStatus; message: string }> {
    const result = await this.updateVttDoorById(params, (door) => {
      const doorName = door.name?.trim() || "문";
      if (params.effect === "open") {
        if (door.state === "open") {
          return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
        }
        return {
          door: { ...door, state: "open" as const },
          status: MainCommandStatus.RESOLVED,
          message: `판정에 성공해 ${doorName}을 열었습니다.`,
        };
      }

      if (door.state === "open") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 열려 있습니다.` };
      }
      if (door.state === "broken") {
        return { door, status: MainCommandStatus.MESSAGE, message: `${doorName}은 이미 파괴되어 있습니다.` };
      }
      return {
        door: { ...door, state: "broken" as const },
        status: MainCommandStatus.RESOLVED,
        message: `판정에 성공해 ${doorName}을 부쉈습니다.`,
      };
    });

    return (
      result ?? {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "판정 대상 문을 현재 맵에서 찾을 수 없습니다.",
      }
    );
  }

  async disarmVttHazardAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드와 다른 함정은 해제할 수 없습니다.",
      };
    }

    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const hazardCell = this.findVttObjectAtPoint(map, params.mapPoint);
    const hazard = hazardCell?.hazard;
    if (!hazardCell || !hazard) {
      return null;
    }

    const hazardName = hazardCell.name?.trim() || this.getHazardKindLabel(hazard.kind);
    if (hazard.armed === false) {
      return {
        status: MainCommandStatus.MESSAGE,
        message: `${hazardName}은 이미 해제되어 있습니다.`,
      };
    }
    if (!this.isVttHazardDetected(hazard)) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${hazardName}의 정확한 구조를 아직 파악하지 못했습니다. 먼저 위험을 탐지해야 합니다.`,
      };
    }

    const dc = this.clampNumber(Number(hazard.detectionDc) || 15, 5, 30);
    return {
      status: MainCommandStatus.CHECK_REQUIRED,
      message: `${hazardName}을 해제하려면 판정이 필요합니다.`,
      checkOptions: [{ skill: "sleight_of_hand", dc, reason: "함정 해제" }],
      checkEffect: this.buildVttHazardCheckEffect(hazardCell, params, "disarm"),
    };
  }

  async applyVttHazardDisarmSuccess(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    hazardId: string;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    const result = await this.updateVttHazardById(params, (cell) => {
      const hazardName = cell.name?.trim() || this.getHazardKindLabel(cell.hazard?.kind ?? "TRAP");
      if (!cell.hazard) {
        return {
          cell,
          status: MainCommandStatus.IMPOSSIBLE,
          message: "판정 대상 함정을 현재 맵에서 찾을 수 없습니다.",
        };
      }
      if (cell.hazard.armed === false) {
        return {
          cell,
          status: MainCommandStatus.MESSAGE,
          message: `${hazardName}은 이미 해제되어 있습니다.`,
        };
      }
      return {
        cell: {
          ...cell,
          hazard: {
            ...cell.hazard,
            armed: false,
            attemptedBySessionCharacterIds: [],
            detectedBySessionCharacterIds: [],
          },
        },
        status: MainCommandStatus.RESOLVED,
        message: `판정에 성공해 ${hazardName}을 해제했습니다. 맵의 위험 표시가 제거됩니다.`,
      };
    });

    return (
      result ?? {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "판정 대상 함정을 현재 맵에서 찾을 수 없습니다.",
      }
    );
  }

  async buildSnapshot(sessionId: string): Promise<SessionSnapshotDto> {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const session = await this.prisma.session.findUnique({
      where: { id: resolvedSessionId },
      include: {
        participants: {
          where: { status: PrismaParticipantStatus.JOINED },
          include: {
            user: true,
            sessionCharacter: {
              include: {
                character: true,
                resource: true,
                inventoryEntries: {
                  include: { itemDefinition: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          where: {
            status: PrismaSessionCharacterStatus.ACTIVE,
          },
          include: {
            character: true,
            resource: true,
            inventoryEntries: {
              include: { itemDefinition: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        sessionScenarios: {
          include: {
            scenario: true,
            gameState: true,
          },
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${resolvedSessionId} was not found.`);
    }

    const ensuredSession = await this.ensureSessionPublicId(session);
    const activeScenario = this.getActiveSessionScenario(session.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }

    return {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
    };
  }

  async buildDetail(sessionId: string): Promise<SessionDetailResponseDto> {
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const session = await this.prisma.session.findUnique({
      where: { id: resolvedSessionId },
      include: {
        host: true,
        participants: {
          where: { status: PrismaParticipantStatus.JOINED },
          include: {
            user: true,
            sessionCharacter: {
              include: {
                character: true,
                resource: true,
                inventoryEntries: {
                  include: { itemDefinition: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          where: {
            status: PrismaSessionCharacterStatus.ACTIVE,
          },
          include: {
            character: true,
            resource: true,
            inventoryEntries: {
              include: { itemDefinition: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        sessionScenarios: {
          include: {
            scenario: true,
            gameState: true,
          },
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${resolvedSessionId} was not found.`);
    }

    const ensuredSession = await this.ensureSessionPublicId(session);
    const ensuredHost = await this.usersService.getUserEntityOrThrow(session.hostUserId);
    const activeScenario = this.getActiveSessionScenario(ensuredSession.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }

    return {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
      scenario: mapScenarioSummary(activeScenario.scenario),
      host: mapUser(ensuredHost),
      owner: mapUser(ensuredHost),
      captain: null,
    };
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

  async updateParticipantConnectionStatus(
    userId: string,
    sessionId: string,
    status: PrismaConnectionStatus,
  ): Promise<void> {
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
            role:
              existingParticipant.role === PrismaParticipantRole.HOST
                ? PrismaParticipantRole.HOST
                : PrismaParticipantRole.PLAYER,
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

  private ensureGmRuntimeOperator(
    userId: string,
    session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null },
  ): void {
    if (!this.canUseGmRuntimeControls(userId, session)) {
      throw new ForbiddenException("GM 권한이 필요합니다.");
    }
  }

  canUseGmRuntimeControls(
    userId: string,
    session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null },
  ): boolean {
    if (session.gmMode === PrismaGmMode.HUMAN) {
      return (session.gmUserId ?? session.hostUserId) === userId;
    }
    return session.hostUserId === userId;
  }

  private canSeeGmOnlyRuntimeData(
    userId: string,
    session: { hostUserId: string; gmMode: PrismaGmMode; gmUserId?: string | null },
  ): boolean {
    return session.gmMode === PrismaGmMode.HUMAN && (session.gmUserId ?? session.hostUserId) === userId;
  }

  private resolveScenarioStartNodeId(
    nodes: Array<{ id: string; transitionsJson: string }>,
    requestedStartNodeId: string | null | undefined,
  ): string | null {
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
    if (
      requestedStartNodeId &&
      nodeIds.has(requestedStartNodeId) &&
      (rootNodes.length !== 1 || rootNodes[0].id === requestedStartNodeId)
    ) {
      return requestedStartNodeId;
    }

    return rootNodes.length === 1
      ? rootNodes[0].id
      : requestedStartNodeId && nodeIds.has(requestedStartNodeId)
        ? requestedStartNodeId
        : nodes[0].id;
  }

  private async getHumanGmSessionForOperator(userId: string, sessionId: string) {
    const session = await this.getSessionEntityOrThrow(sessionId);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw new ConflictException("This endpoint is only available for HUMAN GM sessions.");
    }

    this.ensureGmRuntimeOperator(userId, session);
    return session;
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
    const state = resolution.stateDiff
      ? await client.gameState.findUnique({
          where: { sessionScenarioId: params.sessionScenarioId },
          select: { version: true },
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

    if (stateDiff) {
      await client.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: { version: nextVersion },
      });
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
      rawInput: created.rawInput,
      structuredAction: this.parseJson<Record<string, unknown> | null>(
        created.structuredActionJson,
        null,
      ),
      diceResult: null,
      stateDiff: this.parseJson<Record<string, unknown> | null>(created.stateDiffJson, null),
      outcome: created.outcome as ActionOutcome,
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    };

    return { turnLog, stateDiff };
  }

  private async transitionHumanGmCombat(
    userId: string,
    sessionId: string,
    phase: PrismaGamePhase,
  ): Promise<void> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);

    await this.prisma.$transaction(async (tx) => {
      if (session.status === PrismaSessionStatus.RECRUITING) {
        await this.ensureSessionScenarioNodeSnapshot(
          tx,
          activeScenario.id,
          activeScenario.scenarioId,
        );
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
          status:
            session.status === PrismaSessionStatus.COMPLETED
              ? PrismaSessionStatus.COMPLETED
              : PrismaSessionStatus.PLAYING,
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

  private ensureReachableSessionNodeTarget(
    currentNode: { transitionsJson: string; fallbackNodeId: string | null },
    targetNodeId: string,
  ): void {
    const transitions = this.parseJson<Record<string, unknown>[]>(
      currentNode.transitionsJson,
      [],
    );
    const explicitTargetIds = transitions
      .map((transition) => this.getStringProperty(transition, "nextNodeId"))
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const allowedTargetIds = [
      ...explicitTargetIds,
      ...(currentNode.fallbackNodeId ? [currentNode.fallbackNodeId] : []),
    ];

    if (!allowedTargetIds.includes(targetNodeId)) {
      throw new ForbiddenException("GM can only move to a node reachable from the current node.");
    }
  }

  private getPhaseForScenarioNodeType(nodeType: string): PrismaGamePhase {
    if (nodeType === ScenarioNodeType.COMBAT) return PrismaGamePhase.COMBAT;
    if (nodeType === ScenarioNodeType.EXPLORATION) return PrismaGamePhase.EXPLORATION;
    return PrismaGamePhase.DIALOGUE;
  }

  parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }

  private async replaceSessionInventoryEntries(
    sessionCharacterId: string,
    inventory: InventoryItemDto[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryEntry.deleteMany({ where: { sessionCharacterId } });

      const itemDefinitionIds = inventory
        .map((item) => item.itemDefinitionId)
        .filter((value): value is string => Boolean(value));
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

  private async refreshSessionInventorySnapshot(
    sessionCharacterId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const entries = await client.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });
    if (!entries.length) {
      return;
    }

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
            properties: this.parseJson<string[] | undefined>(
              entry.itemDefinition.propertiesJson,
              undefined,
            ),
            containerId: entry.containerEntryId ?? undefined,
          })),
        ),
      },
    });
  }

  private async buildDefaultVttMap(
    sessionId: string,
    scenarioNodeId: string | null,
  ): Promise<VttMapStateDto> {
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

  private async applyScenarioStartingPositions(
    sessionId: string,
    map: VttMapStateDto,
  ): Promise<VttMapStateDto> {
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
      existingTokens
        .filter((token) => token.sessionCharacterId)
        .map((token) => [token.sessionCharacterId as string, token]),
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

  private createDefaultStartingPositions(
    gridSize: number,
    width: number,
    height: number,
    count: number,
  ): NonNullable<VttMapStateDto["startingPositions"]> {
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

  private getDefaultPlayerTokenPosition(
    index: number,
    gridSize: number,
    width: number,
    height: number,
  ): { x: number; y: number } {
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

    const scenarioMap = await this.getScenarioDefaultVttMapForNode(
      sessionScenarioId,
      state.currentNodeId,
    );
    if (scenarioMap) {
      const normalizedMap = this.normalizeVttMap(scenarioMap, state.currentNodeId ?? null);
      return this.applyScenarioStartingPositions(sessionId, normalizedMap);
    }

    return this.buildDefaultVttMap(sessionId, state.currentNodeId ?? null);
  }

  async getVttMapForSessionScenario(
    sessionId: string,
    sessionScenarioId: string,
  ): Promise<VttMapStateDto> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${sessionScenarioId} was not found.`);
    }

    return this.getVttMapBaseline(sessionId, sessionScenarioId, state);
  }

  async applyVttObjectProximityEvents(params: {
    sessionScenarioId: string;
    currentNodeId: string | null;
    map: VttMapStateDto;
  }): Promise<VttMapStateDto> {
    const objectCells = params.map.objectCells ?? [];
    const candidates = objectCells.flatMap((objectCell) =>
      (objectCell.events ?? [])
        .filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY")
        .map((event) => ({ objectCell, event })),
    );
    if (!candidates.length || !params.map.fogRects.length) {
      return params.map;
    }

    const onceEventIds = candidates
      .filter(({ event }) => event.trigger.once !== false)
      .map(({ event }) => event.id);
    const revealedEventIds = onceEventIds.length
      ? new Set(
          (
            await this.prisma.sessionReveal.findMany({
              where: {
                sessionScenarioId: params.sessionScenarioId,
                contentKind: "event",
                contentId: { in: onceEventIds },
              },
              select: { contentId: true },
            })
          ).map((reveal) => reveal.contentId),
        )
      : new Set<string>();

    const partyTokens = params.map.tokens.filter(
      (token) => token.sessionCharacterId && token.hidden !== true && token.isHostile !== true,
    );
    if (!partyTokens.length) {
      return params.map;
    }

    let fogRects = params.map.fogRects;
    const triggeredEvents: Array<{
      objectCell: NonNullable<VttMapStateDto["objectCells"]>[number];
      event: NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["events"]>[number];
    }> = [];

    for (const { objectCell, event } of candidates) {
      if (objectCell.visibleToPlayers === false || revealedEventIds.has(event.id)) {
        continue;
      }

      const triggerDistanceFeet = this.clampNumber(Number(event.trigger?.distanceFeet), 0, 500);
      const isNear = partyTokens.some(
        (token) =>
          this.calculatePointToRectDistanceFeet(params.map, this.getTokenCenter(token), objectCell) <=
          triggerDistanceFeet,
      );
      if (!isNear) {
        continue;
      }

      const revealRadiusFeet = this.clampNumber(Number(event.effect?.revealRadiusFeet), 5, 500);
      const revealBox = this.buildFogRevealBoxForObject(params.map, objectCell, revealRadiusFeet);
      const nextFogRects = fogRects.flatMap((rect) => this.subtractFogBox(rect, revealBox)).slice(0, 200);
      if (JSON.stringify(nextFogRects) === JSON.stringify(fogRects)) {
        continue;
      }

      fogRects = nextFogRects;
      triggeredEvents.push({ objectCell, event });
    }

    if (!triggeredEvents.length) {
      return params.map;
    }

    await this.prisma.$transaction((tx) =>
      Promise.all(
        triggeredEvents.map(({ objectCell, event }) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId: event.id,
            contentKind: "event",
            scope: "party",
            revealedBy: "system",
            reason: "vtt_object_proximity",
            snapshot: {
              id: event.id,
              name: event.name ?? null,
              type: event.type,
              sourceObjectId: objectCell.id,
              sourceObjectName: objectCell.name ?? null,
              currentNodeId: params.currentNodeId,
              trigger: event.trigger,
              effect: event.effect,
            },
          }),
        ),
      ),
    );

    return {
      ...params.map,
      fogRects,
      updatedAt: new Date().toISOString(),
    };
  }

  async applyVttHazardDetections(params: {
    sessionId: string;
    sessionScenarioId: string;
    currentNodeId: string | null;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<VttMapStateDto> {
    if (!params.currentNodeId) {
      return params.map;
    }

    const objectCells = params.map.objectCells ?? [];
    const hazardCells = objectCells.filter((cell) => cell.hazard && cell.hazard.armed !== false);
    if (!hazardCells.length) {
      return params.map;
    }

    const movedTokenIds = new Set(
      params.map.tokens
        .filter((token) => {
          if (!token.sessionCharacterId || token.hidden === true || token.isHostile === true) {
            return false;
          }
          const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
          return Boolean(previousToken && (previousToken.x !== token.x || previousToken.y !== token.y));
        })
        .map((token) => token.id),
    );
    if (!movedTokenIds.size) {
      return params.map;
    }

    const partyTokens = params.map.tokens.filter(
      (token) => movedTokenIds.has(token.id),
    );
    if (!partyTokens.length) {
      return params.map;
    }

    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId: params.sessionId,
        id: { in: partyTokens.map((token) => token.sessionCharacterId as string) },
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
    });
    const characterBySessionId = new Map(sessionCharacters.map((entry) => [entry.id, entry]));

    let objectCellsChanged = false;
    const nextObjectCells = [...objectCells];

    for (let index = 0; index < nextObjectCells.length; index += 1) {
      const objectCell = nextObjectCells[index];
      const hazard = objectCell.hazard;
      if (!hazard || hazard.armed === false) {
        continue;
      }

      const detectionRadiusFeet = this.clampNumber(Number(hazard.detectionRadiusCells) || 3, 1, 20) * 5;
      const attempted = new Set(hazard.attemptedBySessionCharacterIds ?? []);
      const detected = new Set(hazard.detectedBySessionCharacterIds ?? []);
      const alreadyDetected = hazard.triggerOnce !== false && detected.size > 0;
      if (alreadyDetected) {
        continue;
      }

      for (const token of partyTokens) {
        const sessionCharacterId = token.sessionCharacterId;
        if (!sessionCharacterId || attempted.has(sessionCharacterId) || detected.has(sessionCharacterId)) {
          continue;
        }
        const distanceFeet = this.calculatePointToRectDistanceFeet(
          params.map,
          this.getTokenCenter(token),
          objectCell,
        );
        if (distanceFeet > detectionRadiusFeet) {
          continue;
        }
        const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
        const previousDistanceFeet = previousToken
          ? this.calculatePointToRectDistanceFeet(
              params.previousMap,
              this.getTokenCenter(previousToken),
              objectCell,
            )
          : Number.POSITIVE_INFINITY;
        if (previousDistanceFeet <= detectionRadiusFeet) {
          continue;
        }

        const sessionCharacter = characterBySessionId.get(sessionCharacterId);
        if (!sessionCharacter) {
          continue;
        }

        const check = this.rollHazardDetection(sessionCharacter.character);
        const detectionDc = this.clampNumber(Number(hazard.detectionDc) || 12, 1, 40);
        const success = check.total >= detectionDc;
        attempted.add(sessionCharacterId);
        if (success) {
          detected.add(sessionCharacterId);
        }

        const turnLog = await this.createAutoHazardTurnLog({
          sessionId: params.sessionId,
          sessionScenarioId: params.sessionScenarioId,
          sessionCharacterId,
          characterName: sessionCharacter.character.name,
          hazardId: objectCell.id,
          hazardName: objectCell.name ?? null,
          hazardKind: hazard.kind,
          detectionDc,
          distanceFeet,
          detectionRadiusFeet,
          check,
          success,
          linkedClueIds: [],
        });

        this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);
        break;
      }

      const nextHazard = {
        ...hazard,
        attemptedBySessionCharacterIds: Array.from(attempted).slice(0, 80),
        detectedBySessionCharacterIds: Array.from(detected).slice(0, 80),
      };
      if (JSON.stringify(nextHazard) !== JSON.stringify(hazard)) {
        nextObjectCells[index] = { ...objectCell, hazard: nextHazard };
        objectCellsChanged = true;
      }
    }

    if (!objectCellsChanged) {
      return params.map;
    }

    return {
      ...params.map,
      objectCells: nextObjectCells,
      updatedAt: new Date().toISOString(),
    };
  }

  private rollHazardDetection(character: {
    abilitiesJson: string;
    proficiencyBonus: number;
    proficientSkillsJson: string;
  }): { expression: string; roll: number; modifier: number; total: number; skill: string; ability: string } {
    const abilities = this.parseJson<Record<string, number>>(character.abilitiesJson, {});
    const wis = Number(abilities.wis) || 10;
    const abilityModifier = Math.floor((wis - 10) / 2);
    const proficientSkills = this.parseJson<string[]>(character.proficientSkillsJson, []);
    const hasPerception = proficientSkills.some((skill) => {
      const normalized = skill.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
      return normalized === "perception" || normalized === "감지";
    });
    const modifier = abilityModifier + (hasPerception ? character.proficiencyBonus : 0);
    const roll = Math.floor(Math.random() * 20) + 1;
    return {
      expression: `1d20${modifier >= 0 ? "+" : ""}${modifier}`,
      roll,
      modifier,
      total: roll + modifier,
      skill: "perception",
      ability: "wis",
    };
  }

  private async createAutoHazardTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    sessionCharacterId: string;
    characterName: string;
    hazardId: string;
    hazardName: string | null;
    hazardKind: "TRAP" | "AMBUSH" | "HAZARD";
    detectionDc: number;
    distanceFeet: number;
    detectionRadiusFeet: number;
    check: { expression: string; roll: number; modifier: number; total: number; skill: string; ability: string };
    success: boolean;
    linkedClueIds: string[];
  }): Promise<TurnLogResponseDto> {
    const lastTurn = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;
    const hazardLabel = params.hazardName?.trim() || this.getHazardKindLabel(params.hazardKind);
    const narration = params.success
      ? `${params.characterName}은(는) 발걸음을 늦추고 ${hazardLabel} 주변의 어긋난 흔적을 알아차립니다. 위험 위치가 맵에 표시됩니다.`
      : `${params.characterName}은(는) 주변을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
    const structuredAction = {
      type: "auto_hazard_detection",
      intent: "DETECT_DANGER",
      hazardId: params.hazardId,
      hazardName: params.hazardName,
      hazardKind: params.hazardKind,
      detectionDc: params.detectionDc,
      distanceFeet: params.distanceFeet,
      detectionRadiusFeet: params.detectionRadiusFeet,
      linkedClueIds: params.linkedClueIds,
    };
    const diceResult = {
      expression: params.check.expression,
      rolls: [params.check.roll],
      modifier: params.check.modifier,
      total: params.check.total,
      dc: params.detectionDc,
      ability: params.check.ability,
      skill: params.check.skill,
      outcome: params.success ? "SUCCESS" : "FAILURE",
    };
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: null,
        actorUserId: null,
        sessionCharacterId: params.sessionCharacterId,
        turnNumber,
        rawInput: "[자동 위험탐지]",
        structuredActionJson: JSON.stringify(structuredAction),
        diceResultJson: JSON.stringify(diceResult),
        stateDiffJson: null,
        outcome: params.success ? PrismaActionOutcome.SUCCESS : PrismaActionOutcome.FAILURE,
        narration,
      },
    });

    return {
      turnLogId: created.id,
      turnNumber: created.turnNumber,
      playerActionId: created.playerActionId,
      actorUserId: created.actorUserId,
      sessionCharacterId: created.sessionCharacterId,
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      rawInput: created.rawInput,
      structuredAction,
      diceResult,
      stateDiff: null,
      outcome: params.success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async applyVttHazardTriggers(params: {
    sessionId: string;
    sessionScenarioId: string;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<{ map: VttMapStateDto; triggered: boolean }> {
    const objectCells = params.map.objectCells ?? [];
    const hazardCells = objectCells.filter((cell) => cell.hazard && cell.hazard.armed !== false);
    if (!hazardCells.length) {
      return { map: params.map, triggered: false };
    }

    const movedTokens = params.map.tokens
      .map((token) => {
        const previousToken = params.previousMap.tokens.find((candidate) => candidate.id === token.id);
        if (!previousToken || !token.sessionCharacterId || token.hidden === true) {
          return null;
        }
        if (previousToken.x === token.x && previousToken.y === token.y) {
          return null;
        }
        return { token, previousToken };
      })
      .filter((entry): entry is { token: VttMapStateDto["tokens"][number]; previousToken: VttMapStateDto["tokens"][number] } =>
        Boolean(entry),
      );

    if (!movedTokens.length) {
      return { map: params.map, triggered: false };
    }

    const nextObjectCells = [...objectCells];
    let objectCellsChanged = false;
    let triggered = false;

    for (const { token, previousToken } of movedTokens) {
      const sessionCharacterId = token.sessionCharacterId;
      if (!sessionCharacterId) {
        continue;
      }

      const hazardIndex = nextObjectCells.findIndex((cell) => {
        const hazard = cell.hazard;
        return Boolean(
          hazard &&
            hazard.armed !== false &&
            this.doesTokenMovementCrossCell(params.map, previousToken, token, cell),
        );
      });
      if (hazardIndex < 0) {
        continue;
      }

      const hazardCell = nextObjectCells[hazardIndex];
      const hazard = hazardCell.hazard;
      if (!hazard) {
        continue;
      }

      const character = await this.prisma.sessionCharacter.findUnique({
        where: { id: sessionCharacterId },
        include: { character: true },
      });
      if (!character || character.sessionId !== params.sessionId || character.status !== PrismaSessionCharacterStatus.ACTIVE) {
        continue;
      }

      const damage = this.rollVttHazardDamage(hazard.kind);
      const nextHp = this.clampNumber(character.currentHp - damage.total, 0, character.character.maxHp);
      const nextStatus = nextHp > 0 ? PrismaSessionCharacterStatus.ACTIVE : PrismaSessionCharacterStatus.DEAD;
      await this.prisma.sessionCharacter.update({
        where: { id: character.id },
        data: {
          currentHp: nextHp,
          status: nextStatus,
        },
      });

      const hazardName = hazardCell.name?.trim() || this.getHazardKindLabel(hazard.kind);
      await this.createVttHazardTriggerTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        sessionCharacterId,
        characterName: character.character.name,
        hazardId: hazardCell.id,
        hazardName,
        hazardKind: hazard.kind,
        damage,
        currentHp: nextHp,
        maxHp: character.character.maxHp,
      });

      const nextHazard = {
        ...hazard,
        armed: hazard.triggerOnce === false,
        attemptedBySessionCharacterIds: [],
        detectedBySessionCharacterIds: [],
      };
      nextObjectCells[hazardIndex] = { ...hazardCell, hazard: nextHazard };
      objectCellsChanged = true;
      triggered = true;
    }

    if (!objectCellsChanged) {
      return { map: params.map, triggered };
    }

    return {
      map: {
        ...params.map,
        objectCells: nextObjectCells,
        updatedAt: new Date().toISOString(),
      },
      triggered,
    };
  }

  private rollVttHazardDamage(kind: "TRAP" | "AMBUSH" | "HAZARD"): {
    expression: string;
    rolls: number[];
    modifier: number;
    total: number;
    damageType: string;
  } {
    const damageType = kind === "HAZARD" ? "bludgeoning" : "piercing";
    const roll = Math.floor(Math.random() * 6) + 1;
    return {
      expression: "1d6",
      rolls: [roll],
      modifier: 0,
      total: roll,
      damageType,
    };
  }

  private async createVttHazardTriggerTurnLog(params: {
    sessionId: string;
    sessionScenarioId: string;
    sessionCharacterId: string;
    characterName: string;
    hazardId: string;
    hazardName: string;
    hazardKind: "TRAP" | "AMBUSH" | "HAZARD";
    damage: { expression: string; rolls: number[]; modifier: number; total: number; damageType: string };
    currentHp: number;
    maxHp: number;
  }): Promise<void> {
    const lastTurn = await this.prisma.turnLog.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    const turnNumber = (lastTurn?.turnNumber ?? 0) + 1;
    const narration = `${params.characterName}이(가) ${params.hazardName}을(를) 밟았습니다. 함정이 발동해 ${params.damage.total} 피해를 입었습니다.`;
    const structuredAction = {
      type: "vtt_hazard_trigger",
      hazardId: params.hazardId,
      hazardName: params.hazardName,
      hazardKind: params.hazardKind,
      damageType: params.damage.damageType,
      damageTotal: params.damage.total,
    };
    const diceResult = {
      expression: params.damage.expression,
      rolls: params.damage.rolls,
      modifier: params.damage.modifier,
      total: params.damage.total,
      advantageState: DiceAdvantageState.NORMAL,
      damageType: params.damage.damageType,
      outcome: "SUCCESS",
    };
    const stateDiff = {
      reason: "vtt_hazard_trigger",
      diff: {
        characters: [
          {
            id: params.sessionCharacterId,
            currentHp: params.currentHp,
            maxHp: params.maxHp,
          },
        ],
      },
    };
    const created = await this.prisma.turnLog.create({
      data: {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        playerActionId: null,
        actorUserId: null,
        sessionCharacterId: params.sessionCharacterId,
        turnNumber,
        rawInput: "[함정 발동]",
        structuredActionJson: JSON.stringify(structuredAction),
        diceResultJson: JSON.stringify(diceResult),
        stateDiffJson: JSON.stringify(stateDiff),
        outcome: PrismaActionOutcome.SUCCESS,
        narration,
      },
    });

    this.realtimeEvents.emitTurnLogCreated(params.sessionId, {
      turnLogId: created.id,
      turnNumber: created.turnNumber,
      playerActionId: created.playerActionId,
      actorUserId: created.actorUserId,
      sessionCharacterId: created.sessionCharacterId,
      actionClientCreatedAt: null,
      actionCreatedAt: null,
      rawInput: created.rawInput,
      structuredAction,
      diceResult,
      stateDiff,
      outcome: ActionOutcome.SUCCESS,
      narration: created.narration,
      createdAt: created.createdAt.toISOString(),
    });
    this.realtimeEvents.emitDiceRolled(params.sessionId, diceResult);
  }

  private doesTokenMovementCrossCell(
    map: VttMapStateDto,
    previousToken: VttMapStateDto["tokens"][number],
    token: VttMapStateDto["tokens"][number],
    cell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): boolean {
    const from = this.getTokenCenter(previousToken);
    const to = this.getTokenCenter(token);
    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distancePx / Math.max(8, map.gridSize / 2)));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      const center = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
      const tokenRect = {
        x: center.x - token.size / 2,
        y: center.y - token.size / 2,
        width: token.size,
        height: token.size,
      };
      const shapeCells = cell.shapeCells?.length ? cell.shapeCells : [cell];
      if (shapeCells.some((shapeCell) => this.rectsOverlap(tokenRect, shapeCell))) {
        return true;
      }
    }
    return false;
  }

  private async revealHazardLinkedClues(params: {
    sessionScenarioId: string;
    nodeId: string;
    clueIds: string[];
    hazardId: string;
    hazardName: string | null;
    turnLogId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const clueSnapshots = await this.getCurrentNodeClueSnapshots(tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
      });
      await Promise.all(
        params.clueIds.map((contentId) =>
          this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId,
            contentKind: "clue",
            scope: "party",
            revealedBy: "system",
            reason: "auto_hazard_detection",
            turnLogId: params.turnLogId,
            snapshot: {
              ...(clueSnapshots.get(contentId) ?? { id: contentId }),
              sourceHazardId: params.hazardId,
              sourceHazardName: params.hazardName,
            },
          }),
        ),
      );
    });
  }

  private getHazardKindLabel(kind: "TRAP" | "AMBUSH" | "HAZARD"): string {
    switch (kind) {
      case "AMBUSH":
        return "매복";
      case "HAZARD":
        return "위험 요소";
      case "TRAP":
      default:
        return "함정";
    }
  }

  private normalizeHazardKind(value: unknown): "TRAP" | "AMBUSH" | "HAZARD" {
    return value === "AMBUSH" || value === "HAZARD" ? value : "TRAP";
  }

  private async updateVttDoorAtPoint(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      mapPoint: { x: number; y: number };
    },
    updateDoor: (
      door: NonNullable<VttMapStateDto["doorCells"]>[number],
    ) => {
      door: NonNullable<VttMapStateDto["doorCells"]>[number];
      status: MainCommandStatus;
      message: string;
      checkOptions?: MainCommandCheckOptionDto[];
      checkEffect?: Record<string, unknown>;
    },
  ): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const doorCells = map.doorCells ?? [];
    const doorIndex = doorCells.findIndex((door) => this.isPointInVttCell(params.mapPoint, door));
    if (doorIndex < 0) {
      return null;
    }

    const result = updateDoor(doorCells[doorIndex]);
    if (result.door !== doorCells[doorIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          doorCells: doorCells.map((door, index) => (index === doorIndex ? result.door : door)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return {
      status: result.status,
      message: result.message,
      checkOptions: result.checkOptions,
      checkEffect: result.checkEffect,
    };
  }

  private async updateVttDoorById(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      doorId: string;
    },
    updateDoor: (
      door: NonNullable<VttMapStateDto["doorCells"]>[number],
    ) => {
      door: NonNullable<VttMapStateDto["doorCells"]>[number];
      status: MainCommandStatus;
      message: string;
    },
  ): Promise<{ status: MainCommandStatus; message: string } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return null;
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const doorCells = map.doorCells ?? [];
    const doorIndex = doorCells.findIndex((door) => door.id === params.doorId);
    if (doorIndex < 0) {
      return null;
    }

    const result = updateDoor(doorCells[doorIndex]);
    if (result.door !== doorCells[doorIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          doorCells: doorCells.map((door, index) => (index === doorIndex ? result.door : door)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return { status: result.status, message: result.message };
  }

  private async updateVttHazardById(
    params: {
      sessionId: string;
      sessionScenarioId: string;
      nodeId: string;
      hazardId: string;
    },
    updateHazard: (
      cell: NonNullable<VttMapStateDto["objectCells"]>[number],
    ) => {
      cell: NonNullable<VttMapStateDto["objectCells"]>[number];
      status: MainCommandStatus;
      message: string;
    },
  ): Promise<{ status: MainCommandStatus; message: string } | null> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state) {
      throw new NotFoundException(`Game state for session scenario ${params.sessionScenarioId} was not found.`);
    }
    if (state.currentNodeId && params.nodeId !== state.currentNodeId) {
      return null;
    }

    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const map = await this.getVttMapBaseline(params.sessionId, params.sessionScenarioId, state);
    const objectCells = map.objectCells ?? [];
    const objectIndex = objectCells.findIndex((cell) => cell.id === params.hazardId);
    if (objectIndex < 0) {
      return null;
    }

    const result = updateHazard(objectCells[objectIndex]);
    if (result.cell !== objectCells[objectIndex]) {
      const nextMap = this.normalizeVttMap(
        {
          ...map,
          objectCells: objectCells.map((cell, index) => (index === objectIndex ? result.cell : cell)),
        },
        state.currentNodeId ?? null,
      );
      await this.prisma.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: nextMap,
          }),
        },
      });

      const session = await this.getSessionEntityOrThrow(params.sessionId);
      this.realtimeEvents.emitVttMapUpdated(session.id, {
        hostUserId: session.hostUserId,
        hostMap: nextMap,
        playerMap: this.redactVttMapForPlayer(nextMap),
      });
    }

    return { status: result.status, message: result.message };
  }

  private buildVttDoorCheckEffect(
    door: NonNullable<VttMapStateDto["doorCells"]>[number],
    params: { nodeId: string; mapPoint: { x: number; y: number } },
    effect: "open" | "broken",
  ): Record<string, unknown> {
    return {
      type: "vttDoor",
      doorId: door.id,
      effect,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    };
  }

  private buildVttHazardCheckEffect(
    cell: NonNullable<VttMapStateDto["objectCells"]>[number],
    params: { nodeId: string; mapPoint: { x: number; y: number } },
    effect: "disarm",
  ): Record<string, unknown> {
    return {
      type: "vttHazard",
      hazardId: cell.id,
      effect,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    };
  }

  private findVttObjectAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): NonNullable<VttMapStateDto["objectCells"]>[number] | null {
    return (map.objectCells ?? []).find((cell) => this.isPointInVttCell(point, cell)) ?? null;
  }

  private async isVttObjectHiddenContentExhausted(
    sessionId: string,
    sessionScenarioId: string,
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Promise<boolean> {
    const hiddenContentKeys = this.getVttObjectHiddenContentKeys(objectCell);
    if (!hiddenContentKeys.length) {
      return false;
    }

    const existingReveals = await this.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        scope: "party",
        recipientKey: "party",
        OR: hiddenContentKeys.map((item) => ({
          contentId: item.contentId,
          contentKind: item.contentKind,
        })),
      },
      select: {
        contentId: true,
        contentKind: true,
      },
    });
    const existingRevealKeys = new Set(
      existingReveals.map((reveal) => `${reveal.contentKind}:${reveal.contentId}`),
    );
    const itemContentIds = hiddenContentKeys
      .filter((item) => item.contentKind === "item")
      .map((item) => item.contentId);
    if (itemContentIds.length) {
      const itemDefinitions = await this.prisma.itemDefinition.findMany({
        where: {
          OR: [{ id: { in: itemContentIds } }, { name: { in: itemContentIds } }],
        },
        select: { id: true },
      });
      const partyOwnedItemDefinitionIds = await this.getPartyInventoryItemDefinitionIds(
        this.prisma,
        sessionId,
        itemDefinitions.map((item) => item.id),
      );
      if (itemDefinitions.some((itemDefinition) => !partyOwnedItemDefinitionIds.has(itemDefinition.id))) {
        return false;
      }
    }

    return hiddenContentKeys.every((item) =>
      existingRevealKeys.has(`${item.contentKind}:${item.contentId}`),
    );
  }

  private async getPartyInventoryItemDefinitionIds(
    client: Pick<Prisma.TransactionClient, "inventoryEntry">,
    sessionId: string,
    itemDefinitionIds: string[],
  ): Promise<Set<string>> {
    if (!itemDefinitionIds.length) {
      return new Set();
    }
    const entries = await client.inventoryEntry.findMany({
      where: {
        itemDefinitionId: { in: [...new Set(itemDefinitionIds)] },
        sessionCharacter: { sessionId },
      },
      select: { itemDefinitionId: true },
    });
    return new Set(entries.map((entry) => entry.itemDefinitionId));
  }

  private getVttObjectHiddenContentKeys(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Array<{ contentId: string; contentKind: "clue" | "item" | "event" }> {
    return [
      ...(objectCell.hiddenClueIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "clue" as const,
      })),
      ...(objectCell.hiddenItemIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "item" as const,
      })),
      ...(objectCell.hiddenEventIds ?? []).map((contentId) => ({
        contentId,
        contentKind: "event" as const,
      })),
    ]
      .map((item) => ({
        contentId: item.contentId.trim(),
        contentKind: item.contentKind,
      }))
      .filter((item) => item.contentId);
  }

  private getFirstVttObjectRevealCheck(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): { contentId: string; requiresCheck: boolean; ability: string | null; skill: string | null; dc: number } | null {
    return this.getVttObjectRevealChecks(objectCell).find((check) => check.requiresCheck) ?? null;
  }

  private getVttObjectRevealChecks(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): Array<{ contentId: string; requiresCheck: boolean; ability: string | null; skill: string | null; dc: number }> {
    return (objectCell.revealChecks ?? [])
      .map((check) => {
        const contentId = typeof check.contentId === "string" ? check.contentId.trim() : "";
        if (!contentId) {
          return null;
        }
        return {
          contentId,
          requiresCheck: check.requiresCheck !== false,
          ability: typeof check.ability === "string" && check.ability.trim() ? check.ability.trim() : null,
          skill: typeof check.skill === "string" && check.skill.trim() ? check.skill.trim() : null,
          dc: this.clampNumber(Number(check.dc) || 15, 1, 40),
        };
      })
      .filter(
        (
          check,
        ): check is {
          contentId: string;
          requiresCheck: boolean;
          ability: string | null;
          skill: string | null;
          dc: number;
        } => Boolean(check),
      );
  }

  private canRevealVttObjectContentByCheck(
    contentId: string,
    revealChecks: Array<{
      contentId: string;
      requiresCheck: boolean;
      ability: string | null;
      skill: string | null;
      dc: number;
    }>,
    checkOption?: MainCommandCheckOptionDto | null,
  ): boolean {
    const checksForContent = revealChecks.filter((check) => check.contentId === contentId);
    if (!checksForContent.length) {
      return true;
    }
    if (checksForContent.some((check) => !check.requiresCheck)) {
      return true;
    }
    if (!checkOption) {
      return false;
    }

    return checksForContent.filter((check) => check.requiresCheck).some((check) => {
      const abilityMatches = !check.ability || !checkOption.ability || check.ability === checkOption.ability;
      const skillMatches = !check.skill || !checkOption.skill || check.skill === checkOption.skill;
      const dcMatches = !checkOption.dc || check.dc === checkOption.dc;
      return abilityMatches && skillMatches && dcMatches;
    });
  }

  private hasDiscoverableVttObjectContent(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): boolean {
    return Boolean(
      objectCell.hiddenClueIds?.length ||
        objectCell.hiddenItemIds?.length,
    );
  }

  private isVttObjectObserved(
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
  ): boolean {
    return Boolean(
      Array.isArray(objectCell.observedBySessionCharacterIds) &&
        objectCell.observedBySessionCharacterIds.length,
    );
  }

  private isVttObjectInPartyVision(
    map: VttMapStateDto,
    objectCell: NonNullable<VttMapStateDto["objectCells"]>[number],
    partyTokens: VttMapStateDto["tokens"],
    visionRangeFeet: number,
  ): boolean {
    return partyTokens.some((token) => {
      const tokenCenter = this.getTokenCenter(token);
      const objectCenter = this.getVttCellCenter(objectCell);
      return (
        this.calculatePointToRectDistanceFeet(map, tokenCenter, objectCell) <= visionRangeFeet &&
        !this.isVttLineOfSightBlocked(map, tokenCenter, objectCenter)
      );
    });
  }

  private getVttCellCenter(cell: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    return {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
    };
  }

  private getTokenCenter(token: VttMapStateDto["tokens"][number]): { x: number; y: number } {
    return {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
  }

  private isVttLineOfSightBlocked(
    map: VttMapStateDto,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): boolean {
    const blockers = [
      ...(map.terrainCells ?? []).filter((cell) => !cell.terrainEffectId),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
    ];
    if (!blockers.length) {
      return false;
    }

    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distancePx / Math.max(8, map.gridSize / 4)));
    for (let index = 1; index < steps; index += 1) {
      const ratio = index / steps;
      const point = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
      if (blockers.some((blocker) => this.isPointInVttCell(point, blocker))) {
        return true;
      }
    }

    return false;
  }

  private calculatePointToRectDistanceFeet(
    map: VttMapStateDto,
    point: { x: number; y: number },
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
      shapeCells?: Array<{ x: number; y: number; width: number; height: number }>;
    },
  ): number {
    const shapeCells = rect.shapeCells?.length ? rect.shapeCells : [rect];
    const distancePx = Math.min(
      ...shapeCells.map((shapeCell) => {
        const nearestX = this.clampNumber(point.x, shapeCell.x, shapeCell.x + shapeCell.width);
        const nearestY = this.clampNumber(point.y, shapeCell.y, shapeCell.y + shapeCell.height);
        return Math.hypot(point.x - nearestX, point.y - nearestY);
      }),
    );
    return Math.round((distancePx / map.gridSize) * 5);
  }

  private buildFogRevealBoxForObject(
    map: VttMapStateDto,
    objectCell: { x: number; y: number; width: number; height: number },
    revealRadiusFeet: number,
  ): { x: number; y: number; width: number; height: number } {
    const radiusPx = (revealRadiusFeet / 5) * map.gridSize;
    const centerX = objectCell.x + objectCell.width / 2;
    const centerY = objectCell.y + objectCell.height / 2;
    const left = this.clampNumber(centerX - radiusPx, 0, map.width);
    const top = this.clampNumber(centerY - radiusPx, 0, map.height);
    const right = this.clampNumber(centerX + radiusPx, 0, map.width);
    const bottom = this.clampNumber(centerY + radiusPx, 0, map.height);

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  private subtractFogBox(
    rect: VttMapStateDto["fogRects"][number],
    cut: { x: number; y: number; width: number; height: number },
  ): VttMapStateDto["fogRects"] {
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;
    const cutRight = cut.x + cut.width;
    const cutBottom = cut.y + cut.height;
    const left = Math.max(rect.x, cut.x);
    const top = Math.max(rect.y, cut.y);
    const right = Math.min(rectRight, cutRight);
    const bottom = Math.min(rectBottom, cutBottom);

    if (left >= right || top >= bottom) {
      return [rect];
    }

    return [
      { ...rect, id: `${rect.id}:top:${Date.now()}`, height: top - rect.y },
      { ...rect, id: `${rect.id}:bottom:${Date.now()}`, y: bottom, height: rectBottom - bottom },
      { ...rect, id: `${rect.id}:left:${Date.now()}`, y: top, width: left - rect.x, height: bottom - top },
      { ...rect, id: `${rect.id}:right:${Date.now()}`, x: right, y: top, width: rectRight - right, height: bottom - top },
    ].filter((piece) => piece.width > 0 && piece.height > 0);
  }

  private isPointInVttCell(
    point: { x: number; y: number },
    cell: {
      x: number;
      y: number;
      width: number;
      height: number;
      shapeCells?: Array<{ x: number; y: number; width: number; height: number }>;
    },
  ): boolean {
    const shapeCells = cell.shapeCells?.length ? cell.shapeCells : [cell];
    return shapeCells.some(
      (shapeCell) =>
        point.x >= shapeCell.x &&
        point.x <= shapeCell.x + shapeCell.width &&
        point.y >= shapeCell.y &&
        point.y <= shapeCell.y + shapeCell.height,
    );
  }

  private async getCurrentNodeClueSnapshots(
    tx: Prisma.TransactionClient,
    params: { sessionScenarioId: string; nodeId: string },
  ): Promise<Map<string, Record<string, unknown>>> {
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { cluesJson: true },
    });

    const clues = this.parseJson<Record<string, unknown>[]>(node?.cluesJson, []);
    const entries: Array<[string, Record<string, unknown>]> = [];
    clues.forEach((clue) => {
      const contentId = this.getStringProperty(clue, "id");
      if (contentId) {
        entries.push([contentId, clue]);
      }
    });
    return new Map(entries);
  }

  redactVttMapForPlayer(map: VttMapStateDto): VttMapStateDto {
    return {
      ...map,
      tokens: map.tokens
        .filter((token) => token.hidden !== true)
        .map((token) => ({
          ...token,
          hidden: false,
        })),
      startingPositions: [],
      objectCells: (map.objectCells ?? [])
        .filter((cell) => cell.visibleToPlayers !== false || this.isVttHazardDetected(cell.hazard))
        .map((cell) => ({
          ...cell,
          visibleToPlayers: cell.visibleToPlayers !== false || this.isVttHazardDetected(cell.hazard),
          hiddenClueIds: [],
          hiddenItemIds: [],
          hiddenEventIds: [],
          observedBySessionCharacterIds: this.isVttObjectObserved(cell) ? ["party"] : [],
          revealChecks: [],
          events: [],
          hazard: this.isVttHazardDetected(cell.hazard)
            ? {
                kind: this.normalizeHazardKind(cell.hazard?.kind),
                armed: cell.hazard?.armed !== false,
                triggerOnce: cell.hazard?.triggerOnce !== false,
                // GM 전용 수치는 숨기되, normalizeVttMap 의 `Number(x) || default`
                // 보정으로 0 이 기본값으로 되살아나면 ensurePlayerMapShellUnchanged
                // 비교가 깨지므로 클램프 최소값(1)을 내보낸다.
                detectionRadiusCells: 1,
                detectionDc: 1,
                linkedClueIds: [],
                attemptedBySessionCharacterIds: [],
                detectedBySessionCharacterIds: ["party"],
              }
            : null,
        })),
      doorCells: (map.doorCells ?? []).map((cell) => ({
        ...cell,
        keyItemId: null,
      })),
    };
  }

  private isVttHazardDetected(hazard: VttObjectHazardDto | null | undefined): boolean {
    return Boolean(
      hazard &&
        hazard.armed !== false &&
        Array.isArray(hazard.detectedBySessionCharacterIds) &&
        hazard.detectedBySessionCharacterIds.length
    );
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
      ? activeCombat.participants.find((participant) => participant.id === activeCombat.currentParticipantId) ?? null
      : null;
    this.logger.debug(
      `[VTT_PLAYER_UPDATE] sessionId=${sessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"} controlled=${JSON.stringify(Array.from(controlledTokenIds))} activeCombat=${activeCombat?.id ?? "none"} currentCombatParticipant=${currentCombatParticipant?.id ?? "none"} currentCombatSessionCharacter=${currentCombatParticipant?.sessionCharacterId ?? "none"}`,
    );
    if (
      activeCombat &&
      (!currentCombatParticipant?.sessionCharacterId ||
        !controlledTokenIds.has(currentCombatParticipant.sessionCharacterId))
    ) {
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

      const canMoveToken = Boolean(
        token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId),
      );
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
          activeCombat.participants.find(
            (candidate) => candidate.sessionCharacterId === token.sessionCharacterId,
          ) ??
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

  private ensurePlayerMapShellUnchanged(
    baseline: VttMapStateDto,
    requested: VttMapStateDto,
    allowFullMapShell = false,
  ): void {
    const comparableBaseline = allowFullMapShell ? baseline : this.redactVttMapForPlayer(baseline);
    const isSameStartingPositions =
      requested.startingPositions?.length === 0 ||
      JSON.stringify(comparableBaseline.startingPositions ?? []) === JSON.stringify(requested.startingPositions ?? []);
    const sameFogRects = JSON.stringify(comparableBaseline.fogRects) === JSON.stringify(requested.fogRects);
    const sameTerrainCells =
      JSON.stringify(comparableBaseline.terrainCells ?? []) === JSON.stringify(requested.terrainCells ?? []);
    const sameWallCells =
      JSON.stringify(comparableBaseline.wallCells ?? []) === JSON.stringify(requested.wallCells ?? []);
    const sameDoorCells =
      JSON.stringify(comparableBaseline.doorCells ?? []) === JSON.stringify(requested.doorCells ?? []);
    const sameObjectCells =
      JSON.stringify(comparableBaseline.objectCells ?? []) === JSON.stringify(requested.objectCells ?? []);
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

  private calculateTokenGridMovementFt(
    map: VttMapStateDto,
    fromToken: VttMapStateDto["tokens"][number],
    toToken: VttMapStateDto["tokens"][number],
  ): number {
    const fromColumn = this.getGridIndex(fromToken.x, map.gridSize, map.width);
    const fromRow = this.getGridIndex(fromToken.y, map.gridSize, map.height);
    const toColumn = this.getGridIndex(toToken.x, map.gridSize, map.width);
    const toRow = this.getGridIndex(toToken.y, map.gridSize, map.height);
    return this.getChebyshevDistance(fromColumn, fromRow, toColumn, toRow) * 5;
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
    const characterSpeedBySessionCharacterId = new Map(
      sessionCharacters.map((entry) => [entry.id, entry.character.speed]),
    );

    for (const spend of distanceByParticipant.values()) {
      const participant = activeCombat.participants.find((candidate) => candidate.id === spend.combatParticipantId);
      const movementFtTotal =
        (spend.sessionCharacterId
          ? characterSpeedBySessionCharacterId.get(spend.sessionCharacterId)
          : null) ??
        participant?.speedFt ??
        30;
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

  private ensureOnlyTokenPositionChanged(
    baseline: VttMapStateDto["tokens"][number],
    requested: VttMapStateDto["tokens"][number],
  ): void {
    const baselineStatic = { ...baseline, x: 0, y: 0 };
    const requestedStatic = { ...requested, x: 0, y: 0 };

    if (JSON.stringify(baselineStatic) !== JSON.stringify(requestedStatic)) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  ensureTokenPathIsReachable(
    map: VttMapStateDto,
    fromToken: VttMapStateDto["tokens"][number],
    toToken: VttMapStateDto["tokens"][number],
  ): void {
    if (!this.hasReachableTokenPath(map, fromToken, toToken)) {
      throw new ForbiddenException("Token movement path is blocked by the map.");
    }
  }

  private hasReachableTokenPath(
    map: VttMapStateDto,
    fromToken: VttMapStateDto["tokens"][number],
    toToken: VttMapStateDto["tokens"][number],
  ): boolean {
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
        if (
          next.column < 0 ||
          next.row < 0 ||
          next.column > maxColumn ||
          next.row > maxRow ||
          visited.has(key)
        ) {
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
      const targetDistance = this.getChebyshevDistance(
        current.column,
        current.row,
        targetColumn,
        targetRow,
      );
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
        if (
          next.column < 0 ||
          next.row < 0 ||
          next.column > maxColumn ||
          next.row > maxRow ||
          visited.has(key)
        ) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - sourceToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - sourceToken.size);
        if (
          this.isTokenPlacementBlocked(map, sourceToken, x, y) ||
          !this.canMoveBetweenGridCells(map, sourceToken, current, next)
        ) {
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

    return (
      !this.isTokenPlacementBlocked(map, token, horizontalX, horizontalY) &&
      !this.isTokenPlacementBlocked(map, token, verticalX, verticalY)
    );
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getChebyshevDistance(
    leftColumn: number,
    leftRow: number,
    rightColumn: number,
    rightRow: number,
  ): number {
    return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow));
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

  private getGridIndex(value: number, gridSize: number, maxSize: number): number {
    return Math.floor(Math.min(Math.max(value, 0), Math.max(0, maxSize - 1)) / gridSize);
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  normalizeVttMap(map: VttMapStateDto, scenarioNodeId: string | null): VttMapStateDto {
    const gridSize = this.clampNumber(map.gridSize, 16, 160);
    const width = this.clampNumber(map.width, 320, 4000);
    const height = this.clampNumber(map.height, 240, 4000);
    const tokens = map.tokens.slice(0, 80).map((token) => ({
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
            encounterGroupId:
              typeof token.encounterGroupId === "string" && token.encounterGroupId.trim()
                ? token.encounterGroupId.trim().slice(0, 80)
                : null,
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
            legendaryActions: Array.isArray(token.monster.legendaryActions)
              ? token.monster.legendaryActions.slice(0, 20)
              : [],
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
    })).map((token) => ({
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
        typeof source.createdBySessionCharacterId === "string" && source.createdBySessionCharacterId.trim()
          ? source.createdBySessionCharacterId.trim()
          : null,
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
      description:
        typeof cell.description === "string" && cell.description.trim()
          ? cell.description.trim().slice(0, 500)
          : null,
      terrainEffectId:
        typeof cell.terrainEffectId === "string" && cell.terrainEffectId.trim()
          ? cell.terrainEffectId.trim().toLowerCase().replace(/[\s-]+/g, "_").slice(0, 80)
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
        shapeByKey.set(
          `${normalized.x}:${normalized.y}:${normalized.width}:${normalized.height}`,
          normalized,
        );
      });

      const shapeCells = Array.from(shapeByKey.values()).sort((left, right) =>
        left.y === right.y ? left.x - right.x : left.y - right.y,
      );
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
    const terrainCells = (map.terrainCells ?? [])
      .slice(0, 400)
      .map((cell, index) => normalizeStructureCell(cell, "terrain", index));
    const wallCells = (map.wallCells ?? [])
      .slice(0, 400)
      .map((cell, index) => normalizeStructureCell(cell, "wall", index));
    const doorCells = (map.doorCells ?? []).slice(0, 200).map((cell, index) => ({
      ...normalizeStructureCell(cell, "door", index),
      state:
        cell.state === "open" || cell.state === "closed" || cell.state === "locked" || cell.state === "broken"
          ? cell.state
          : "closed",
      keyItemId: typeof cell.keyItemId === "string" && cell.keyItemId.trim() ? cell.keyItemId.trim() : null,
      canBreak: cell.canBreak === true,
      breakCheckDc:
        typeof cell.breakCheckDc === "number" && Number.isFinite(cell.breakCheckDc)
          ? this.clampNumber(cell.breakCheckDc, 1, 40)
          : null,
    }));
    const objectCells = (map.objectCells ?? []).slice(0, 300).map((cell, index) => {
      const baseCell = normalizeStructureCell(cell, "object", index);
      const normalizedShape = normalizeObjectShapeCells(cell, baseCell);

      return {
        ...baseCell,
        ...normalizedShape.bounds,
        shapeCells: normalizedShape.shapeCells,
        visibleToPlayers: cell.visibleToPlayers !== false,
        hiddenClueIds: Array.isArray(cell.hiddenClueIds)
          ? cell.hiddenClueIds.filter((id) => typeof id === "string").slice(0, 30)
          : [],
        hiddenItemIds: Array.isArray(cell.hiddenItemIds)
          ? cell.hiddenItemIds.filter((id) => typeof id === "string").slice(0, 30)
          : [],
        hiddenEventIds: Array.isArray(cell.hiddenEventIds)
          ? cell.hiddenEventIds.filter((id) => typeof id === "string").slice(0, 30)
          : [],
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
              id:
                typeof event.id === "string" && event.id.trim()
                  ? event.id.trim().slice(0, 120)
                  : `event:object:${index + 1}:${eventIndex + 1}`,
              name:
                typeof event.name === "string" && event.name.trim()
                  ? event.name.trim().slice(0, 80)
                  : null,
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
                kind:
                  this.normalizeHazardKind(cell.hazard.kind),
                armed: cell.hazard.armed !== false,
                triggerOnce: cell.hazard.triggerOnce !== false,
                detectionRadiusCells: this.clampNumber(
                  Number(cell.hazard.detectionRadiusCells) || 3,
                  1,
                  20,
                ),
                detectionDc: this.clampNumber(Number(cell.hazard.detectionDc) || 12, 1, 40),
                linkedClueIds: Array.isArray(cell.hazard.linkedClueIds)
                  ? cell.hazard.linkedClueIds.filter((id) => typeof id === "string").slice(0, 30)
                  : [],
                attemptedBySessionCharacterIds: Array.isArray(cell.hazard.attemptedBySessionCharacterIds)
                  ? cell.hazard.attemptedBySessionCharacterIds
                      .filter((id) => typeof id === "string")
                      .slice(0, 80)
                  : [],
                detectedBySessionCharacterIds: Array.isArray(cell.hazard.detectedBySessionCharacterIds)
                  ? cell.hazard.detectedBySessionCharacterIds
                      .filter((id) => typeof id === "string")
                      .slice(0, 80)
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
        encounterScaling:
          candidate.encounterScaling && typeof candidate.encounterScaling === "object"
            ? candidate.encounterScaling
            : null,
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

  private async getScenarioDefaultVttMapForNode(
    sessionScenarioId: string,
    nodeId: string | null | undefined,
  ): Promise<VttMapStateDto | null> {
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

  private mapPlayerScenarioNode(
    node: {
      id: string;
      nodeId?: string;
      nodeType: string;
      title: string;
      sceneText: string;
      imageUrl: string | null;
      checkOptionsJson: string;
      cluesJson: string;
      nodeMetaJson?: string | null;
    },
    revealedClueSnapshots: Map<string, Record<string, unknown>>,
  ): PlayerScenarioNodeDto {
    const clues = this.parseJson<Record<string, unknown>[]>(node.cluesJson, []);

    return {
      id: node.nodeId ?? node.id,
      nodeType: this.toScenarioNodeType(node.nodeType),
      title: node.title,
      sceneText: node.sceneText,
      imageUrl: node.imageUrl ?? null,
      checkOptions: this.mapPlayerCheckOptions(
        this.extractChecksFromCheckOptions(node.checkOptionsJson),
      ),
      publicClues: clues
        .map((clue) => {
          const clueId = this.getStringProperty(clue, "id");
          return clueId ? revealedClueSnapshots.get(clueId) ?? null : null;
        })
        .filter((clue): clue is Record<string, unknown> => Boolean(clue))
        .map((clue) => this.mapPlayerScenarioClue(clue))
        .filter((clue): clue is PlayerScenarioClueDto => Boolean(clue)),
      visibleTargets: this.mapPlayerVisibleTargets(node.nodeMetaJson ?? null),
    };
  }

  private mapPlayerVisibleTargets(nodeMetaJson: string | null): PlayerVisibleTargetDto[] {
    const nodeMeta = this.parseJson<Record<string, unknown> | null>(nodeMetaJson, null);
    if (!nodeMeta) {
      return [];
    }

    return [
      ...this.normalizePlayerVisibleTargets(nodeMeta.npcs, MainCommandTargetType.NPC),
      ...this.normalizePlayerVisibleTargets(nodeMeta.objects, MainCommandTargetType.OBJECT),
      ...this.normalizePlayerVisibleTargets(nodeMeta.items, MainCommandTargetType.OBJECT),
      ...this.normalizePlayerVisibleTargets(nodeMeta.areas, MainCommandTargetType.AREA),
    ];
  }

  private normalizePlayerVisibleTargets(
    value: unknown,
    targetType: MainCommandTargetType,
  ): PlayerVisibleTargetDto[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry): PlayerVisibleTargetDto | null => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        if (record.isVisible === false) {
          return null;
        }

        const id = this.getStringProperty(record, "id");
        const name =
          this.getStringProperty(record, "name") ?? this.getStringProperty(record, "title");
        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          targetType,
          summary:
            this.getStringProperty(record, "shortDescription") ??
            this.getStringProperty(record, "description") ??
            this.getStringProperty(record, "summary") ??
            name,
          disposition: this.getStringProperty(record, "disposition") ?? null,
        };
      })
      .filter((entry): entry is PlayerVisibleTargetDto => Boolean(entry));
  }

  private mapPlayerCheckOptions(options: Record<string, unknown>[]): PlayerCheckOptionDto[] {
    return options
      .map((option) => {
        const id = this.getStringProperty(option, "id");
        const type = this.getStringProperty(option, "type");
        const skill = this.getStringProperty(option, "skill");
        const label =
          this.getStringProperty(option, "playerLabel") ??
          this.getStringProperty(option, "label") ??
          skill ??
          id;
        if (!label) {
          return null;
        }

        return {
          ...(id ? { id } : {}),
          label,
          ...(type ? { type } : {}),
          ...(skill ? { skill } : {}),
        };
      })
      .filter((option): option is PlayerCheckOptionDto => Boolean(option));
  }

  private mapPlayerScenarioClue(clue: Record<string, unknown>): PlayerScenarioClueDto | null {
    const playerText =
      this.getStringProperty(clue, "handoutText") ?? this.getStringProperty(clue, "playerText");
    if (!playerText) {
      return null;
    }
    const title =
      this.getStringProperty(clue, "title") ??
      playerText.slice(0, 40) ??
      "단서";
    const text = playerText;

    return {
      id: this.getStringProperty(clue, "id") ?? randomUUID(),
      title,
      text,
      importance: this.getStringProperty(clue, "importance"),
    };
  }

  private getUniquePlayerClues(clues: PlayerScenarioClueDto[]): PlayerScenarioClueDto[] {
    const seen = new Set<string>();
    return clues.filter((clue) => {
      if (seen.has(clue.id)) {
        return false;
      }
      seen.add(clue.id);
      return true;
    });
  }

  private async getRevealedClueSnapshotsForUser(
    sessionScenarioId: string,
    sessionId: string,
    userId: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const characterRecipients = await this.prisma.sessionCharacter.findMany({
      where: { sessionId, userId },
      select: { id: true, characterId: true },
    });
    const recipientIds = [
      userId,
      ...characterRecipients.flatMap((character) => [character.id, character.characterId]),
    ];
    const reveals = await this.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        contentKind: "clue",
        OR: [
          { scope: "party" },
          { scope: "user", recipientId: userId },
          { scope: "character", recipientId: { in: recipientIds } },
        ],
      },
      select: { contentId: true, snapshotJson: true },
    });
    const revealed = new Map<string, Record<string, unknown>>();
    for (const reveal of reveals) {
      revealed.set(
        reveal.contentId,
        this.parseJson<Record<string, unknown>>(reveal.snapshotJson, { id: reveal.contentId }),
      );
    }
    return revealed;
  }

  private async findSessionScenarioRevealable(
    sessionScenarioId: string,
    contentId: string,
  ): Promise<Record<string, unknown>> {
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

  private async ensureSessionScenarioNodeSnapshotForScenario(
    sessionScenarioId: string,
    scenarioId: string,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.ensureSessionScenarioNodeSnapshot(tx, sessionScenarioId, scenarioId),
    );
  }

  private async ensureSessionScenarioNodeSnapshot(
    tx: Prisma.TransactionClient,
    sessionScenarioId: string,
    scenarioId: string,
  ): Promise<void> {
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

  private shouldRevealOnNodeVisit(clue: Record<string, unknown>): boolean {
    return this.getRevealPolicyMode(clue) === "AUTO_REVEAL";
  }

  private getRevealPolicyMode(clue: Record<string, unknown>): RevealPolicyMode {
    const revealPolicy = clue.revealPolicy;
    const policyMode =
      revealPolicy && typeof revealPolicy === "object"
        ? this.getStringProperty(revealPolicy as Record<string, unknown>, "mode")
        : null;
    switch (policyMode) {
      case "AUTO_REVEAL":
      case "PLAYER_ACTION":
      case "CHECK_SUCCESS":
      case "CHECK_PARTIAL":
      case "POST_COMBAT":
      case "GM_APPROVAL":
        return policyMode;
      case "on_node_visit":
        return "AUTO_REVEAL";
      case "manual":
        return "GM_APPROVAL";
      case "conditional":
        return "PLAYER_ACTION";
      default:
        return "PLAYER_ACTION";
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
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { cluesJson: true },
    });
    if (!node) {
      return [];
    }

    const clues = this.parseJson<Record<string, unknown>[]>(node.cluesJson, []);
    const revealInputs = clues.flatMap((clue) => {
      const policyMode = this.getRevealPolicyMode(clue);
      if (params.policyModes && !params.policyModes.includes(policyMode)) {
        return [];
      }
      if (!this.shouldRevealClueForPolicy(clue, policyMode, params)) {
        return [];
      }

      const contentId = this.getStringProperty(clue, "id");
      if (!contentId) {
        return [];
      }

      return [
        {
          contentId,
          reason: params.reason ?? this.getRevealReason(policyMode, params.outcome),
          snapshot: clue,
        },
      ];
    });

    const existingReveals = revealInputs.length
      ? await tx.sessionReveal.findMany({
          where: {
            sessionScenarioId: params.sessionScenarioId,
            contentKind: "clue",
            scope: "party",
            recipientKey: "party",
            contentId: { in: revealInputs.map((input) => input.contentId) },
          },
          select: { contentId: true },
        })
      : [];
    const existingIds = new Set(existingReveals.map((reveal) => reveal.contentId));
    const newRevealInputs = revealInputs.filter((input) => !existingIds.has(input.contentId));

    await Promise.all(
      newRevealInputs.map((input) =>
        this.recordSessionReveal(tx, {
          sessionScenarioId: params.sessionScenarioId,
          contentId: input.contentId,
          contentKind: "clue",
          scope: "party",
          revealedBy: params.revealedBy,
          reason: input.reason,
          turnLogId: params.turnLogId,
          snapshot: input.snapshot,
        }),
      ),
    );
    return newRevealInputs.map((input) => this.toRevealClueSummary(input.contentId, input.snapshot));
  }

  private shouldRevealClueForPolicy(
    clue: Record<string, unknown>,
    policyMode: RevealPolicyMode,
    params: {
      actionText?: string | null;
      outcome?: ActionOutcome | null;
    },
  ): boolean {
    switch (policyMode) {
      case "AUTO_REVEAL":
      case "POST_COMBAT":
        return true;
      case "PLAYER_ACTION":
        return this.matchesDiscoverySource(clue, params.actionText);
      case "CHECK_SUCCESS":
        return (
          params.outcome === ActionOutcome.SUCCESS &&
          this.matchesDiscoverySource(clue, params.actionText)
        );
      case "CHECK_PARTIAL":
        return this.matchesDiscoverySource(clue, params.actionText);
      case "GM_APPROVAL":
        return false;
    }
  }

  private getRevealReason(policyMode: RevealPolicyMode, outcome?: ActionOutcome | null): string {
    if (policyMode === "CHECK_PARTIAL" && outcome !== ActionOutcome.SUCCESS) {
      return "check_partial";
    }
    switch (policyMode) {
      case "AUTO_REVEAL":
        return "node_visit";
      case "PLAYER_ACTION":
        return "player_action";
      case "CHECK_SUCCESS":
      case "CHECK_PARTIAL":
        return "check_success";
      case "POST_COMBAT":
        return "post_combat";
      case "GM_APPROVAL":
        return "gm_approval";
    }
  }

  private matchesDiscoverySource(
    clue: Record<string, unknown>,
    actionText: string | null | undefined,
  ): boolean {
    const source = this.getStringProperty(clue, "source") ?? this.getStringProperty(clue, "discoverySource");
    if (!source || !actionText?.trim()) {
      return false;
    }

    const normalizedAction = this.normalizeDiscoveryText(actionText);
    const normalizedSource = this.normalizeDiscoveryText(source);
    if (!normalizedAction || !normalizedSource) {
      return false;
    }
    if (
      normalizedAction.includes(normalizedSource) ||
      normalizedSource.includes(normalizedAction)
    ) {
      return true;
    }

    return source
      .split(/[\s,;/|(){}\[\]"'`]+/u)
      .map((part) => this.normalizeDiscoveryText(part))
      .filter((part) => part.length >= 2)
      .some((part) => normalizedAction.includes(part));
  }

  private normalizeDiscoveryText(value: string): string {
    return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  private buildRecipientKey(scope: string, recipientId: string | null | undefined): string {
    return scope === "party" ? "party" : `${scope}:${recipientId ?? "unknown"}`;
  }

  private mapSessionReveal(reveal: {
    id: string;
    sessionScenarioId: string;
    contentId: string;
    contentKind: string;
    scope: string;
    recipientId: string | null;
    revealedAt: Date;
    revealedBy: string;
    reason: string | null;
  }): SessionRevealResponseDto {
    return {
      id: reveal.id,
      sessionScenarioId: reveal.sessionScenarioId,
      contentId: reveal.contentId,
      contentKind: reveal.contentKind,
      scope: reveal.scope,
      recipientId: reveal.recipientId,
      revealedAt: reveal.revealedAt.toISOString(),
      revealedBy: reveal.revealedBy,
      reason: reveal.reason,
    };
  }

  private getStringProperty(value: Record<string, unknown>, key: string): string | null {
    const candidate = value[key];
    return typeof candidate === "string" && candidate.trim() ? candidate : null;
  }

  private toRevealClueSummary(
    contentId: string,
    snapshot: Record<string, unknown>,
  ): { id: string; title: string; text: string | null } {
    return {
      id: contentId,
      title: this.getStringProperty(snapshot, "title") ?? contentId,
      text:
        this.getStringProperty(snapshot, "handoutText") ??
        this.getStringProperty(snapshot, "playerText") ??
        this.getStringProperty(snapshot, "text") ??
        this.getStringProperty(snapshot, "revelation"),
    };
  }

  private toScenarioNodeType(value: string): PlayerScenarioNodeDto["nodeType"] {
    switch (value) {
      case ScenarioNodeType.EXPLORATION:
        return ScenarioNodeType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return ScenarioNodeType.COMBAT;
      case ScenarioNodeType.STORY:
        return ScenarioNodeType.STORY;
      default:
        return ScenarioNodeType.STORY;
    }
  }

  private async recordNodeVisit(
    tx: Prisma.TransactionClient,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      enteredByTurnLogId?: string | null;
    },
  ): Promise<void> {
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { id: true, cluesJson: true },
    });

    if (!node) {
      throw new NotFoundException(`Session scenario node ${params.nodeId} was not found.`);
    }

    await tx.sessionNodeVisit.upsert({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      create: {
        sessionScenarioId: params.sessionScenarioId,
        sessionScenarioNodeId: node.id,
        nodeId: params.nodeId,
        enteredByTurnLogId: params.enteredByTurnLogId ?? null,
      },
      update: {
        visitCount: { increment: 1 },
        enteredByTurnLogId: params.enteredByTurnLogId ?? undefined,
      },
    });

    const clues = this.parseJson<Record<string, unknown>[]>(node.cluesJson, []);

    await Promise.all(
      clues
        .filter((clue) => this.shouldRevealOnNodeVisit(clue))
        .map((clue) => {
          const contentId = this.getStringProperty(clue, "id");
          if (!contentId) {
            return Promise.resolve();
          }
          return this.recordSessionReveal(tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId,
            contentKind: "clue",
            scope: "party",
            revealedBy: "system",
            reason: "node_visit",
            turnLogId: params.enteredByTurnLogId,
            snapshot: clue,
          });
        }),
    );
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
    const recipientId = params.scope === "party" ? null : params.recipientId ?? null;
    const recipientKey = this.buildRecipientKey(params.scope, recipientId);

    return tx.sessionReveal.upsert({
      where: {
        sessionScenarioId_contentId_contentKind_scope_recipientKey: {
          sessionScenarioId: params.sessionScenarioId,
          contentId: params.contentId,
          contentKind: params.contentKind,
          scope: params.scope,
          recipientKey,
        },
      },
      create: {
        sessionScenarioId: params.sessionScenarioId,
        contentId: params.contentId,
        contentKind: params.contentKind,
        scope: params.scope,
        recipientId,
        recipientKey,
        revealedBy: params.revealedBy,
        reason: params.reason ?? null,
        turnLogId: params.turnLogId ?? null,
        snapshotJson: params.snapshot ? JSON.stringify(params.snapshot) : null,
      },
      update: {
        reason: params.reason ?? undefined,
        turnLogId: params.turnLogId ?? undefined,
        snapshotJson: params.snapshot ? JSON.stringify(params.snapshot) : undefined,
      },
    });
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

  private async deleteSessionScenarioLinks(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    await tx.sessionScenario.deleteMany({ where: { sessionId } });
  }

  private getActiveSessionScenario<T extends { status: PrismaSessionScenarioStatus }>(sessionScenarios: T[]): T | null {
    return (
      sessionScenarios.find((candidate) => candidate.status === PrismaSessionScenarioStatus.ACTIVE) ??
      sessionScenarios[0] ??
      null
    );
  }

  private resolveVisibility(
    visibility?: SessionVisibility,
    isPrivate?: boolean,
    isPublic?: boolean,
    fallback: PrismaSessionVisibility = PrismaSessionVisibility.PUBLIC,
  ): PrismaSessionVisibility {
    if (visibility) {
      return visibility === SessionVisibility.PRIVATE
        ? PrismaSessionVisibility.PRIVATE
        : PrismaSessionVisibility.PUBLIC;
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

  private async ensureSessionPublicId<T extends { id: string; publicId: string | null }>(
    session: T,
  ): Promise<T & { publicId: string }> {
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
