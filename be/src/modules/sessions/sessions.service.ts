import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  SessionGmMode as PrismaSessionGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ConnectionStatus,
  CreateSessionDto,
  GameStateResponseDto,
  HumanGmMessageDto,
  JoinSessionDto,
  ParticipantStatusResponseDto,
  SelectSessionCharacterDto,
  SessionDetailResponseDto,
  SessionGmMode,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionListQueryDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SessionStatus,
  UpdateParticipantReadyDto,
  UpdateSessionNodeDto,
  UpdateSessionCaptainDto,
  UpdateSessionDto,
} from "@trpg/shared-types";
import {
  mapGameState,
  mapParticipant,
  mapScenarioSummary,
  mapSession,
  mapSessionCharacter,
  mapUser,
} from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ScenariosService } from "../scenarios/scenarios.service";
import { UsersService } from "../users/users.service";

const sessionStatusToPrisma: Record<SessionStatus, PrismaSessionStatus> = {
  [SessionStatus.LOBBY]: PrismaSessionStatus.LOBBY,
  [SessionStatus.PLAYING]: PrismaSessionStatus.PLAYING,
  [SessionStatus.PAUSED]: PrismaSessionStatus.PAUSED,
  [SessionStatus.COMPLETED]: PrismaSessionStatus.COMPLETED,
};

const sessionGmModeToPrisma: Record<SessionGmMode, PrismaSessionGmMode> = {
  [SessionGmMode.AI]: PrismaSessionGmMode.AI,
  [SessionGmMode.HUMAN]: PrismaSessionGmMode.HUMAN,
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

    const inviteCode = await this.generateInviteCode();

    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() ?? "",
          ownerUserId: userId,
          captainUserId: userId,
          inviteCode,
          gmMode: dto.gmMode ? sessionGmModeToPrisma[dto.gmMode] : PrismaSessionGmMode.AI,
          maxParticipants: dto.maxParticipants ?? 4,
          isPublic: dto.isPublic ?? true,
          scenarioId: scenario.id,
          currentNodeId: scenario.startNodeId,
        },
      });

      await tx.sessionParticipant.create({
        data: {
          sessionId: createdSession.id,
          userId,
          role: PrismaParticipantRole.HOST,
          connectionStatus: PrismaConnectionStatus.ONLINE,
        },
      });

      await tx.gameState.create({
        data: {
          sessionId: createdSession.id,
          version: 1,
          currentNodeId: scenario.startNodeId,
          phase: PrismaGamePhase.EXPLORATION,
          stateJson: JSON.stringify({
            discoveredClues: [],
            flags: {},
          }),
        },
      });

      return createdSession;
    });

    return this.buildSnapshot(session.id);
  }

  async listAvailableSessions(query?: SessionListQueryDto): Promise<SessionListItemResponseDto[]> {
    const search = query?.search?.trim();
    const sessions = await this.prisma.session.findMany({
      where: {
        isPublic: query?.isPublic ?? true,
        status: query?.status ? sessionStatusToPrisma[query.status] : PrismaSessionStatus.LOBBY,
        scenarioId: query?.scenarioId,
        gmMode: query?.gmMode ? sessionGmModeToPrisma[query.gmMode] : undefined,
        title: search
          ? {
              contains: search,
            }
          : undefined,
      },
      include: {
        owner: true,
        scenario: true,
        participants: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return sessions
      .map((session) => ({
        session: mapSession(session),
        scenario: mapScenarioSummary(session.scenario),
        owner: mapUser(session.owner),
        participantCount: session.participants.length,
        availableSlots: Math.max(session.maxParticipants - session.participants.length, 0),
      }))
      .filter((session) =>
        query?.openSlotsAtLeast === undefined ? true : session.availableSlots >= query.openSlotsAtLeast,
      );
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
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException("You must join the session before leaving it.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const participants = await tx.sessionParticipant.findMany({
        where: { sessionId },
        orderBy: { joinedAt: "asc" },
      });

      if (participants.length <= 1) {
        await tx.session.delete({
          where: { id: sessionId },
        });

        return { deletedSession: true };
      }

      const remainingParticipants = participants.filter((item) => item.userId !== userId);
      const nextOwnerUserId =
        session.ownerUserId === userId ? remainingParticipants[0]?.userId ?? null : session.ownerUserId;
      const nextCaptainUserId =
        session.captainUserId === userId ? nextOwnerUserId : session.captainUserId;

      await tx.sessionParticipant.delete({
        where: { id: participant.id },
      });

      if (!nextOwnerUserId) {
        throw new ConflictException("A replacement owner could not be resolved for this session.");
      }

      await tx.session.update({
        where: { id: sessionId },
        data: {
          ownerUserId: nextOwnerUserId,
          captainUserId: nextCaptainUserId,
        },
      });

      if (session.ownerUserId === userId) {
        await tx.sessionParticipant.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: nextOwnerUserId,
            },
          },
          data: {
            role: PrismaParticipantRole.HOST,
          },
        });
      }

      return { deletedSession: false };
    });

    if (!result.deletedSession) {
      const snapshot = await this.buildSnapshot(sessionId);
      this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    }
  }

  async getSessionForUser(userId: string, sessionId: string): Promise<SessionDetailResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    if (!session.isPublic) {
      await this.ensureMembership(userId, sessionId);
    }

    return this.buildDetail(sessionId);
  }

  async getParticipantsForUser(
    userId: string,
    sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    await this.ensureMembership(userId, sessionId);
    const participants = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
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
    await this.ensureMembership(userId, sessionId);
    const participants = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
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
    await this.ensureMembership(userId, sessionId);
    const state = await this.getGameStateEntityOrThrow(sessionId);
    return mapGameState(state);
  }

  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureOwner(userId, session.ownerUserId);

    if (dto.maxParticipants !== undefined) {
      const participantCount = await this.prisma.sessionParticipant.count({
        where: { sessionId },
      });

      if (dto.maxParticipants < participantCount) {
        throw new ConflictException("maxParticipants cannot be smaller than the participant count.");
      }
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        title: dto.title?.trim() ?? session.title,
        description: dto.description?.trim() ?? session.description,
        maxParticipants: dto.maxParticipants ?? session.maxParticipants,
        isPublic: dto.isPublic ?? session.isPublic,
        gmMode: dto.gmMode ? sessionGmModeToPrisma[dto.gmMode] : session.gmMode,
        status: dto.status ? sessionStatusToPrisma[dto.status] : session.status,
      },
    });

    this.realtimeEvents.emitSessionStatusUpdated(sessionId, mapSession(updated));
    return mapSession(updated);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureOwner(userId, session.ownerUserId);

    if (session.status === PrismaSessionStatus.LOBBY) {
      await this.prisma.session.delete({
        where: { id: sessionId },
      });
      return;
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: PrismaSessionStatus.COMPLETED,
      },
    });

    this.realtimeEvents.emitSessionStatusUpdated(sessionId, mapSession(updated));
  }

  async listMySessions(userId: string): Promise<SessionListItemResponseDto[]> {
    await this.usersService.getUserEntityOrThrow(userId);
    const sessions = await this.prisma.session.findMany({
      where: {
        participants: {
          some: {
            userId,
          },
        },
      },
      include: {
        owner: true,
        scenario: true,
        participants: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return sessions.map((session) => ({
      session: mapSession(session),
      scenario: mapScenarioSummary(session.scenario),
      owner: mapUser(session.owner),
      participantCount: session.participants.length,
      availableSlots: Math.max(session.maxParticipants - session.participants.length, 0),
    }));
  }

  async selectCharacterForSession(
    userId: string,
    sessionId: string,
    dto: SelectSessionCharacterDto,
  ): Promise<SessionParticipantResponseDto> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
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

    if (!participant) {
      throw new ForbiddenException("You must join the session before selecting a character.");
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
        assignment.sessionId !== sessionId &&
        assignment.session.status !== PrismaSessionStatus.COMPLETED,
    );

    if (activeAssignment) {
      throw new ConflictException("This character is already assigned to another active session.");
    }

    const runtimeData = {
      sessionId,
      participantId: participant.id,
      characterId: character.id,
      name: character.name,
      ancestry: character.ancestry,
      className: character.className,
      level: character.level,
      abilitiesJson: character.abilitiesJson,
      proficiencyBonus: character.proficiencyBonus,
      proficientSkillsJson: character.proficientSkillsJson,
      maxHp: character.maxHp,
      currentHp: character.maxHp,
      tempHp: 0,
      armorClass: character.armorClass,
      speed: character.speed,
      inventoryJson: character.inventoryJson,
      equippedWeaponId: character.equippedWeaponId,
      conditionsJson: JSON.stringify([]),
      initiative: null,
    };

    const sessionCharacter = participant.sessionCharacter
      ? await this.prisma.sessionCharacter.update({
          where: { id: participant.sessionCharacter.id },
          data: runtimeData,
          include: { character: true },
        })
      : await this.prisma.sessionCharacter.create({
          data: runtimeData,
          include: { character: true },
        });

    const refreshedParticipant = await this.prisma.sessionParticipant.findUniqueOrThrow({
      where: {
        sessionId_userId: {
          sessionId,
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

    const resetReadyParticipant = await this.prisma.sessionParticipant.update({
      where: { id: refreshedParticipant.id },
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

    const mappedParticipant = mapParticipant(resetReadyParticipant);
    this.realtimeEvents.emitParticipantUpdated(sessionId, mappedParticipant);
    this.realtimeEvents.emitCharacterUpdated(sessionId, mapSessionCharacter(sessionCharacter));
    this.realtimeEvents.emitSessionSnapshot(sessionId, await this.buildSnapshot(sessionId));
    return mappedParticipant;
  }

  async updateParticipantReadyState(
    userId: string,
    sessionId: string,
    dto: UpdateParticipantReadyDto,
  ): Promise<SessionParticipantResponseDto> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
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

    if (!participant) {
      throw new ForbiddenException("You must join the session before updating ready state.");
    }

    const session = await this.getSessionEntityOrThrow(sessionId);
    if (session.status !== PrismaSessionStatus.LOBBY) {
      throw new ConflictException("Ready state can only be changed while the session is in lobby.");
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
    this.realtimeEvents.emitParticipantUpdated(sessionId, mappedParticipant);
    this.realtimeEvents.emitSessionSnapshot(sessionId, await this.buildSnapshot(sessionId));
    return mappedParticipant;
  }

  async updateCaptain(
    userId: string,
    sessionId: string,
    dto: UpdateSessionCaptainDto,
  ): Promise<SessionResponseDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureOwner(userId, session.ownerUserId);

    const nextCaptainUserId =
      dto.captainUserId === undefined ? session.captainUserId : dto.captainUserId;

    if (nextCaptainUserId) {
      await this.ensureMembership(nextCaptainUserId, sessionId);
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        captainUserId: nextCaptainUserId ?? null,
      },
    });

    this.realtimeEvents.emitSessionStatusUpdated(sessionId, mapSession(updated));
    return mapSession(updated);
  }

  async resumeSession(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const participant = await this.prisma.sessionParticipant
      .update({
        where: {
          sessionId_userId: {
            sessionId,
            userId,
          },
        },
        data: {
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

    this.realtimeEvents.emitParticipantUpdated(sessionId, mapParticipant(participant));
    return this.buildSnapshot(sessionId);
  }

  async getInviteInfo(userId: string, sessionId: string): Promise<SessionInviteResponseDto> {
    await this.ensureMembership(userId, sessionId);
    const session = await this.getSessionEntityOrThrow(sessionId);
    const appBaseUrl = process.env.APP_BASE_URL?.trim();

    return {
      sessionId,
      inviteCode: session.inviteCode,
      shareUrl: appBaseUrl ? `${appBaseUrl}/join/${session.inviteCode}` : null,
    };
  }

  async startSession(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.getSessionEntityOrThrow(sessionId);
    this.ensureSessionOperator(userId, session.ownerUserId, session.captainUserId);

    if (session.status !== PrismaSessionStatus.LOBBY) {
      throw new ConflictException("Only lobby sessions can be started.");
    }

    const participants = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
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

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: PrismaSessionStatus.PLAYING,
        },
      }),
      this.prisma.gameState.update({
        where: { sessionId },
        data: {
          phase: PrismaGamePhase.EXPLORATION,
        },
      }),
    ]);

    const snapshot = await this.buildSnapshot(sessionId);
    this.realtimeEvents.emitSessionStatusUpdated(sessionId, snapshot.session);
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    return snapshot;
  }

  async createHumanGmMessage(
    userId: string,
    sessionId: string,
    dto: HumanGmMessageDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const state = await this.getGameStateEntityOrThrow(sessionId);
    const stateData = this.parseState(state.stateJson);
    const nextMessages = [
      ...(Array.isArray(stateData.gmMessages) ? stateData.gmMessages : []),
      {
        id: randomUUID(),
        type: dto.asNpc ? "npc" : "gm",
        speakerName: dto.speakerName?.trim() || null,
        content: dto.content.trim(),
        createdAt: new Date().toISOString(),
        authorUserId: userId,
      },
    ].slice(-50);

    await this.prisma.gameState.update({
      where: { sessionId },
      data: {
        stateJson: JSON.stringify({
          ...stateData,
          gmMessages: nextMessages,
        }),
      },
    });

    if (session.status === PrismaSessionStatus.LOBBY) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: PrismaSessionStatus.PLAYING },
      });
    }

    const snapshot = await this.buildSnapshot(sessionId);
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    return snapshot;
  }

  async updateSessionNode(
    userId: string,
    sessionId: string,
    dto: UpdateSessionNodeDto,
  ): Promise<SessionSnapshotDto> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);
    const targetNode = await this.scenariosService.getScenarioNodeEntityById(session.scenarioId, dto.nodeId);

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: {
          currentNodeId: targetNode.id,
          status:
            session.status === PrismaSessionStatus.LOBBY
              ? PrismaSessionStatus.PLAYING
              : session.status,
        },
      }),
      this.prisma.gameState.update({
        where: { sessionId },
        data: {
          currentNodeId: targetNode.id,
          phase: PrismaGamePhase.DIALOGUE,
        },
      }),
    ]);

    const snapshot = await this.buildSnapshot(sessionId);
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    return snapshot;
  }

  async startCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.COMBAT);
    const snapshot = await this.buildSnapshot(sessionId);
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    return snapshot;
  }

  async endCombat(userId: string, sessionId: string): Promise<SessionSnapshotDto> {
    await this.transitionHumanGmCombat(userId, sessionId, PrismaGamePhase.EXPLORATION);
    const snapshot = await this.buildSnapshot(sessionId);
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
    return snapshot;
  }

  async buildSnapshot(sessionId: string): Promise<SessionSnapshotDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            user: true,
            sessionCharacter: {
              include: { character: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          include: { character: true },
          orderBy: { createdAt: "asc" },
        },
        gameState: true,
      },
    });

    if (!session || !session.gameState) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    return {
      session: mapSession(session),
      participants: session.participants.map(mapParticipant),
      sessionCharacters: session.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(session.gameState),
    };
  }

  async buildDetail(sessionId: string): Promise<SessionDetailResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        owner: true,
        scenario: true,
        participants: {
          include: {
            user: true,
            sessionCharacter: {
              include: { character: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        sessionCharacters: {
          include: { character: true },
          orderBy: { createdAt: "asc" },
        },
        gameState: true,
      },
    });

    if (!session || !session.gameState) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    const captain = session.captainUserId
      ? session.participants.find((participant) => participant.userId === session.captainUserId)?.user
      : null;

    return {
      session: mapSession(session),
      participants: session.participants.map(mapParticipant),
      sessionCharacters: session.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(session.gameState),
      scenario: mapScenarioSummary(session.scenario),
      owner: mapUser(session.owner),
      captain: captain ? mapUser(captain) : null,
    };
  }

  async ensureMembership(userId: string, sessionId: string): Promise<void> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException("You must join the session before accessing it.");
    }
  }

  async updateParticipantConnectionStatus(
    userId: string,
    sessionId: string,
    status: PrismaConnectionStatus,
  ): Promise<void> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
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

    if (!participant || participant.connectionStatus === status) {
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

    this.realtimeEvents.emitParticipantUpdated(sessionId, mapParticipant(updatedParticipant));
  }

  async getSessionEntityOrThrow(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    return session;
  }

  async getGameStateEntityOrThrow(sessionId: string) {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionId },
    });

    if (!state) {
      throw new NotFoundException(`Game state for session ${sessionId} was not found.`);
    }

    return state;
  }

  private async joinSessionEntity(
    userId: string,
    session: {
      id: string;
      status: PrismaSessionStatus;
      maxParticipants: number;
    },
  ): Promise<SessionSnapshotDto> {
    if (session.status === PrismaSessionStatus.COMPLETED) {
      throw new ConflictException("Completed sessions cannot accept new participants.");
    }

    const existingParticipant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { user: true },
    });

    if (!existingParticipant) {
      const participantCount = await this.prisma.sessionParticipant.count({
        where: { sessionId: session.id },
      });

      if (participantCount >= session.maxParticipants) {
        throw new ConflictException("This session is already full.");
      }
    }

    const participant = await this.prisma.sessionParticipant.upsert({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      update: {
        connectionStatus: PrismaConnectionStatus.ONLINE,
      },
      create: {
        sessionId: session.id,
        userId,
        role: PrismaParticipantRole.PLAYER,
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
    return this.buildSnapshot(session.id);
  }

  private ensureOwner(userId: string, ownerUserId: string): void {
    if (userId !== ownerUserId) {
      throw new ForbiddenException("Only the session owner can perform this action.");
    }
  }

  private ensureSessionOperator(
    userId: string,
    ownerUserId: string,
    captainUserId: string | null,
  ): void {
    if (userId !== ownerUserId && userId !== captainUserId) {
      throw new ForbiddenException("Only the GM or captain can perform this action.");
    }
  }

  private async getHumanGmSessionForOperator(userId: string, sessionId: string) {
    const session = await this.getSessionEntityOrThrow(sessionId);

    if (session.gmMode !== PrismaSessionGmMode.HUMAN) {
      throw new ConflictException("This endpoint is only available for HUMAN GM sessions.");
    }

    if (session.ownerUserId !== userId && session.captainUserId !== userId) {
      throw new ForbiddenException("Only the owner or captain can control a HUMAN GM session.");
    }

    return session;
  }

  private async transitionHumanGmCombat(
    userId: string,
    sessionId: string,
    phase: PrismaGamePhase,
  ): Promise<void> {
    const session = await this.getHumanGmSessionForOperator(userId, sessionId);

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status:
            session.status === PrismaSessionStatus.COMPLETED
              ? PrismaSessionStatus.COMPLETED
              : PrismaSessionStatus.PLAYING,
        },
      }),
      this.prisma.gameState.update({
        where: { sessionId },
        data: { phase },
      }),
    ]);
  }

  private parseState(value: string): Record<string, unknown> {
    return JSON.parse(value) as Record<string, unknown>;
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
}
