import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
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
  GameStateResponseDto,
  GmMode,
  HumanGmMessageDto,
  InventoryItemDto,
  JoinSessionDto,
  MainCommandTargetType,
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
  UpdateParticipantReadyDto,
  UpdateSessionDto,
  UpdateSessionNodeDto,
  UpdateVttMapDto,
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
  [PrismaParticipantRole.PLAYER]: ParticipantRole.PLAYER,
  [PrismaParticipantRole.SPECTATOR]: ParticipantRole.SPECTATOR,
};

const participantRoleToPrisma: Record<ParticipantRole, PrismaParticipantRole> = {
  [ParticipantRole.HOST]: PrismaParticipantRole.HOST,
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

function isSessionListItem(
  item: SessionListItemResponseDto | null,
): item is SessionListItemResponseDto {
  return item !== null;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly scenariosService: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async createSession(userId: string, dto: CreateSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);

    const scenario = dto.scenarioId
      ? await this.scenariosService.getScenarioEntityById(dto.scenarioId)
      : await this.scenariosService.getDefaultScenarioEntity();

    const startNodeId = this.resolveScenarioStartNodeId(scenario.nodes, scenario.startNodeId);
    if (!startNodeId) {
      throw new UnprocessableEntityException("The selected scenario does not have a start node.");
    }

    const inviteCode = await this.generateInviteCode();
    const visibility = this.resolveVisibility(dto.visibility, dto.isPrivate, dto.isPublic);

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
          gmMode: gmModeToPrisma[dto.gmMode],
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
          role: PrismaParticipantRole.HOST,
          status: PrismaParticipantStatus.JOINED,
          connectionStatus: PrismaConnectionStatus.ONLINE,
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
        await tx.session.update({
          where: { id: resolvedSessionId },
          data: { status: PrismaSessionStatus.DISBANDED },
        });
        return;
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
          data: { role: PrismaParticipantRole.HOST },
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

    if (existingMap) {
      return session.hostUserId === userId ? existingMap : this.redactVttMapForPlayer(existingMap);
    }

    const scenarioMap = await this.getScenarioDefaultVttMapForNode(
      sessionScenario.id,
      state.currentNodeId,
    );
    if (scenarioMap) {
      const normalizedMap = this.normalizeVttMap(scenarioMap, state.currentNodeId ?? null);
      const map = await this.applyScenarioStartingPositions(resolvedSessionId, normalizedMap);
      return session.hostUserId === userId ? map : this.redactVttMapForPlayer(map);
    }

    const map = await this.buildDefaultVttMap(resolvedSessionId, state.currentNodeId ?? null);
    return session.hostUserId === userId ? map : this.redactVttMapForPlayer(map);
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
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const requestedMap = this.normalizeVttMap(dto.map, state.currentNodeId ?? null);
    const map =
      session.hostUserId === userId
        ? requestedMap
        : await this.applyPlayerVttMapUpdate(
            userId,
            resolvedSessionId,
            sessionScenario.id,
            state,
            requestedMap,
          );

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
    return session.hostUserId === userId ? map : playerMap;
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

    const reveal = await this.prisma.$transaction((tx) =>
      this.recordSessionReveal(tx, {
        sessionScenarioId: activeScenario.id,
        contentId: dto.contentId,
        contentKind,
        scope,
        recipientId,
        revealedBy: "human_gm",
        reason: dto.reason?.trim() || "manual_gm_reveal",
        snapshot: content,
      }),
    );

    const snapshot = await this.buildSnapshot(resolvedSessionId);
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

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    this.ensureHost(userId, session.hostUserId);

    if (session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be deleted.");
    }

    await this.prisma.$transaction([
      this.prisma.sessionCharacter.deleteMany({ where: { sessionId: resolvedSessionId } }),
      this.prisma.sessionParticipant.updateMany({
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
      }),
      this.prisma.session.update({
        where: { id: resolvedSessionId },
        data: { status: PrismaSessionStatus.DISBANDED },
      }),
    ]);
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
    this.ensureHost(userId, session.hostUserId);

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

    const participantWithoutCharacter = participants.find((participant) => !participant.sessionCharacter);
    if (participantWithoutCharacter) {
      throw new ConflictException("All participants must select a character before the session starts.");
    }

    const participantNotReady = participants.find((participant) => !participant.isReady);
    if (participantNotReady) {
      throw new ConflictException("All participants must be ready before the session starts.");
    }

    const activeScenario = await this.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const state = activeScenario.gameState;

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
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
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
    const flags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
    const targetDefaultMap = this.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);

    await this.prisma.$transaction(async (tx) => {
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
          phase: PrismaGamePhase.DIALOGUE,
          flagsJson: JSON.stringify({
            ...flags,
            ...(targetDefaultMap
              ? { vttMap: this.normalizeVttMap(targetDefaultMap, targetNode.nodeId) }
              : {}),
          }),
        },
      });
      await this.recordNodeVisit(tx, {
        sessionScenarioId: activeScenario.id,
        nodeId: targetNode.nodeId,
      });
    });

    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async startCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.COMBAT);
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const snapshot = await this.buildSnapshot(resolvedSessionId);
    this.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return snapshot;
  }

  async endCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.EXPLORATION);
    const resolvedSessionId = (await this.getSessionEntityOrThrow(sessionId)).id;
    const snapshot = await this.buildSnapshot(resolvedSessionId);
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

    this.ensureHost(userId, session.hostUserId);
    return session;
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

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
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

  private async refreshSessionInventorySnapshot(sessionCharacterId: string): Promise<void> {
    const entries = await this.prisma.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });
    if (!entries.length) {
      return;
    }

    await this.prisma.sessionCharacter.update({
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

    const playerTokens = sessionCharacters.slice(0, 12).map((sessionCharacter, index) => {
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

  private async getVttMapBaseline(
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
  ): Promise<VttMapStateDto> {
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const existingMap = this.toVttMapOrNull(flags.vttMap);
    if (existingMap) {
      return existingMap;
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

  private redactVttMapForPlayer(map: VttMapStateDto): VttMapStateDto {
    return {
      ...map,
      tokens: map.tokens
        .filter((token) => token.hidden !== true)
        .map((token) => ({
          ...token,
          hidden: false,
        })),
      startingPositions: [],
    };
  }

  private async applyPlayerVttMapUpdate(
    userId: string,
    sessionId: string,
    sessionScenarioId: string,
    state: { currentNodeId: string | null; flagsJson: string | null },
    requestedMap: VttMapStateDto,
  ): Promise<VttMapStateDto> {
    const baseline = await this.getVttMapBaseline(sessionId, sessionScenarioId, state);
    const controlledTokenIds = await this.getControlledSessionCharacterIds(userId, sessionId);

    this.ensurePlayerMapShellUnchanged(baseline, requestedMap);

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
        this.ensureTokenUnchanged(token, requestedToken);
        return token;
      }

      this.ensureOnlyTokenPositionChanged(token, requestedToken);
      return {
        ...token,
        x: requestedToken.x,
        y: requestedToken.y,
      };
    });

    if (requestedMap.tokens.some((token) => !baseline.tokens.some((base) => base.id === token.id))) {
      throw new ForbiddenException("Players cannot add map tokens.");
    }

    return {
      ...baseline,
      tokens: nextTokens,
      updatedAt: new Date().toISOString(),
    };
  }

  private async getControlledSessionCharacterIds(userId: string, sessionId: string): Promise<Set<string>> {
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

  private ensurePlayerMapShellUnchanged(baseline: VttMapStateDto, requested: VttMapStateDto): void {
    const sameShell =
      baseline.id === requested.id &&
      baseline.scenarioNodeId === requested.scenarioNodeId &&
      baseline.imageUrl === requested.imageUrl &&
      baseline.gridType === requested.gridType &&
      baseline.gridSize === requested.gridSize &&
      baseline.width === requested.width &&
      baseline.height === requested.height &&
      JSON.stringify(baseline.startingPositions ?? []) === JSON.stringify(requested.startingPositions ?? []) &&
      JSON.stringify(baseline.fogRects) === JSON.stringify(requested.fogRects);

    if (!sameShell) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  private ensureTokenUnchanged(
    baseline: VttMapStateDto["tokens"][number],
    requested: VttMapStateDto["tokens"][number],
  ): void {
    if (JSON.stringify(baseline) !== JSON.stringify(requested)) {
      throw new ForbiddenException("Players can only move their own tokens.");
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

  private normalizeVttMap(map: VttMapStateDto, scenarioNodeId: string | null): VttMapStateDto {
    const gridSize = this.clampNumber(map.gridSize, 16, 160);
    const width = this.clampNumber(map.width, 320, 4000);
    const height = this.clampNumber(map.height, 240, 4000);
    const tokens = map.tokens.slice(0, 80).map((token) => ({
      id: token.id,
      npcId: token.npcId ?? null,
      sessionCharacterId: token.sessionCharacterId ?? null,
      name: token.name.slice(0, 80),
      imageUrl: token.imageUrl ?? null,
      x: this.clampNumber(token.x, 0, width),
      y: this.clampNumber(token.y, 0, height),
      size: this.clampNumber(token.size, 24, 160),
      hidden: token.hidden === true,
      isHostile: token.isHostile === true,
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

    return {
      id: map.id || randomUUID(),
      scenarioNodeId: map.scenarioNodeId ?? scenarioNodeId,
      imageUrl: map.imageUrl ?? null,
      gridType: map.gridType === "hex" ? "hex" : "square",
      gridSize,
      width,
      height,
      tokens,
      fogRects,
      startingPositions,
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
        fogRects: candidate.fogRects,
        startingPositions: Array.isArray(candidate.startingPositions) ? candidate.startingPositions : [],
        updatedAt: candidate.updatedAt ?? new Date().toISOString(),
      },
      candidate.scenarioNodeId ?? null,
    );
  }

  private clampNumber(value: number, min: number, max: number): number {
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
      .map((entry) => {
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
  ): Promise<number> {
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
      return 0;
    }

    const clues = this.parseJson<Record<string, unknown>[]>(node.cluesJson, []);
    const reveals = clues.flatMap((clue) => {
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
        this.recordSessionReveal(tx, {
          sessionScenarioId: params.sessionScenarioId,
          contentId,
          contentKind: "clue",
          scope: "party",
          revealedBy: params.revealedBy,
          reason: params.reason ?? this.getRevealReason(policyMode, params.outcome),
          turnLogId: params.turnLogId,
          snapshot: clue,
        }),
      ];
    });

    await Promise.all(reveals);
    return reveals.length;
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
