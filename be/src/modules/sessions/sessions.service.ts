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
  CreateSessionDto,
  GameStateResponseDto,
  GmMode,
  HumanGmMessageDto,
  JoinSessionDto,
  ParticipantRole,
  ParticipantStatusResponseDto,
  SelectSessionCharacterDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SessionStatus,
  SessionVisibility,
  UpdateParticipantReadyDto,
  UpdateSessionDto,
  UpdateSessionNodeDto,
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

    if (!scenario.startNodeId) {
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
          currentNodeId: scenario.startNodeId,
          phase: PrismaGamePhase.LOBBY,
          flagsJson: JSON.stringify({}),
          discoveredCluesJson: JSON.stringify([]),
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
      ruleSetId: params.ruleSetId,
      sessionScenarios: params.scenarioId
        ? {
            some: {
              scenarioId: params.scenarioId,
              status: PrismaSessionScenarioStatus.ACTIVE,
            },
          }
        : undefined,
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

    const items = await Promise.all(
      sessions.map(async (session) => {
        const ensuredSession = await this.ensureSessionPublicId(session);
        const ensuredHost = await this.usersService.getUserEntityOrThrow(session.hostUserId);
        const activeScenario = this.getActiveSessionScenario(ensuredSession.sessionScenarios);
        if (!activeScenario) {
          throw new NotFoundException(`Session ${ensuredSession.id} does not have an active scenario.`);
        }

        return {
          session: mapSession(ensuredSession),
          scenario: mapScenarioSummary(activeScenario.scenario),
          host: mapUser(ensuredHost),
          owner: mapUser(ensuredHost),
          participantCount: ensuredSession.participants.length,
          availableSlots: Math.max(
            ensuredSession.maxParticipants - ensuredSession.participants.length,
            0,
          ),
          role: this.getParticipantRoleForUser(ensuredSession.participants, params.requesterUserId),
        };
      }),
    );

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
    const { state } = await this.getGameStateEntityOrThrow(resolvedSessionId);
    return mapGameState(state, resolvedSessionId);
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

    const updated = await this.prisma.session.update({
      where: { id: resolvedSessionId },
      data: {
        title: dto.title?.trim() ?? session.title,
        description: dto.description?.trim() ?? session.description,
        maxParticipants: nextMaxParticipants ?? session.maxParticipants,
        visibility: this.resolveVisibility(dto.visibility, dto.isPrivate, dto.isPublic, session.visibility),
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
        : undefined,
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

    const items = await Promise.all(
      sessions.map(async (session) => {
        const ensuredSession = await this.ensureSessionPublicId(session);
        const ensuredHost = await this.usersService.getUserEntityOrThrow(session.hostUserId);
        const activeScenario = this.getActiveSessionScenario(ensuredSession.sessionScenarios);
        if (!activeScenario) {
          throw new NotFoundException(`Session ${ensuredSession.id} does not have an active scenario.`);
        }

        return {
          session: mapSession(ensuredSession),
          scenario: mapScenarioSummary(activeScenario.scenario),
          host: mapUser(ensuredHost),
          owner: mapUser(ensuredHost),
          participantCount: ensuredSession.participants.length,
          availableSlots: Math.max(
            ensuredSession.maxParticipants - ensuredSession.participants.length,
            0,
          ),
          role: this.getParticipantRoleForUser(ensuredSession.participants, userId),
        };
      }),
    );

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
      throw new ConflictException("This character is already assigned to another active session.");
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
    this.realtimeEvents.emitCharacterUpdated(resolvedSessionId, mapSessionCharacter(sessionCharacter));
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

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: resolvedSessionId },
        data: {
          status: PrismaSessionStatus.PLAYING,
        },
      }),
      this.prisma.sessionScenario.update({
        where: { id: activeScenario.id },
        data: {
          startedAt: activeScenario.startedAt ?? new Date(),
        },
      }),
      this.prisma.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          phase: PrismaGamePhase.EXPLORATION,
        },
      }),
    ]);

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

    await this.prisma.$transaction([
      this.prisma.gameState.update({
        where: { sessionScenarioId: sessionScenario.id },
        data: {
          flagsJson: JSON.stringify({
            ...flags,
            gmMessages: gmMessages.slice(-50),
          }),
        },
      }),
      this.prisma.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.RECRUITING
              ? PrismaSessionStatus.PLAYING
              : session.status,
        },
      }),
    ]);

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
    const targetNode = await this.scenariosService.getScenarioNodeEntityById(
      activeScenario.scenarioId,
      dto.nodeId,
    );

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.RECRUITING
              ? PrismaSessionStatus.PLAYING
              : session.status,
        },
      }),
      this.prisma.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: {
          currentNodeId: targetNode.id,
          phase: PrismaGamePhase.DIALOGUE,
        },
      }),
    ]);

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
              include: { character: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          where: {
            status: PrismaSessionCharacterStatus.ACTIVE,
          },
          include: { character: true },
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
              include: { character: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          where: {
            status: PrismaSessionCharacterStatus.ACTIVE,
          },
          include: { character: true },
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

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: resolvedSessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.COMPLETED
              ? PrismaSessionStatus.COMPLETED
              : PrismaSessionStatus.PLAYING,
        },
      }),
      this.prisma.gameState.update({
        where: { sessionScenarioId: activeScenario.id },
        data: { phase },
      }),
    ]);
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
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
