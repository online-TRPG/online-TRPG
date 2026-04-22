import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
} from "@prisma/client";
import {
  CreateSessionDto,
  GameStateResponseDto,
  JoinSessionDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
} from "@trpg/shared-types";
import { mapGameState, mapParticipant, mapSession, mapCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { UsersService } from "../users/users.service";
import { ScenariosService } from "../scenarios/scenarios.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

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
    // 세션은 특정 시나리오의 시작 지점에서 출발해야 하므로
    // 여기서 사용할 시나리오를 먼저 확정한다.
    // 사용자가 scenarioId를 주지 않으면 기본 시나리오를 사용한다.
    const scenario = dto.scenarioId
      ? await this.scenariosService.getScenarioEntityById(dto.scenarioId)
      : await this.scenariosService.getDefaultScenarioEntity();

    const inviteCode = await this.generateInviteCode();

    const session = await this.prisma.$transaction(async (tx) => {
      // 세션, 참가자, 현재 게임 상태는 항상 같이 생겨야 한다.
      // 중간에 하나만 저장되면 조회 결과가 어긋날 수 있어서 트랜잭션으로 묶는다.
      const createdSession = await tx.session.create({
        data: {
          title: dto.title.trim(),
          ownerUserId: userId,
          inviteCode,
          scenarioId: scenario.id,
          currentNodeId: scenario.startNodeId,
        },
      });

      // 세션을 만든 사람도 별도 participant 행으로 저장한다.
      // 이렇게 해야 방장도 일반 참가자와 같은 방식으로 세션 접근 권한을 검사할 수 있다.
      await tx.sessionParticipant.create({
        data: {
          sessionId: createdSession.id,
          userId,
          role: PrismaParticipantRole.HOST,
          connectionStatus: PrismaConnectionStatus.ONLINE,
        },
      });

      // game_state는 "이 세션이 지금 어디까지 진행됐는가"를 저장하는 기준 데이터다.
      // 아직 전투, 판정, 로그 엔진이 모두 붙어 있지 않아도
      // 현재 노드, 버전, 간단한 상태 JSON만 있으면 세션 조회와 실시간 스냅샷을 일관되게 만들 수 있다.
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

  async joinSession(userId: string, dto: JoinSessionDto): Promise<SessionSnapshotDto> {
    await this.usersService.getUserEntityOrThrow(userId);

    const session = await this.prisma.session.findUnique({
      where: { inviteCode: dto.inviteCode.trim().toUpperCase() },
    });

    if (!session) {
      throw new NotFoundException("Session with this invite code was not found.");
    }

    // join 요청은 네트워크 재시도나 새로고침 때문에 여러 번 들어올 수 있다.
    // sessionId + userId 조합으로 upsert하면
    // 같은 사용자가 다시 참가를 눌러도 participant가 중복 생성되지 않는다.
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
      },
    });

    // 새 참가자가 들어오면 같은 세션을 보고 있는 다른 클라이언트도
    // 참가자 목록을 바로 갱신할 수 있도록 이벤트를 내보낸다.
    this.realtimeEvents.emitParticipantUpdated(session.id, mapParticipant(participant));

    return this.buildSnapshot(session.id);
  }

  async getSessionForUser(userId: string, sessionId: string): Promise<SessionResponseDto> {
    await this.ensureMembership(userId, sessionId);
    const session = await this.getSessionEntityOrThrow(sessionId);
    return mapSession(session);
  }

  async getParticipantsForUser(
    userId: string,
    sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    await this.ensureMembership(userId, sessionId);
    const participants = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return participants.map(mapParticipant);
  }

  async getStateForUser(userId: string, sessionId: string): Promise<GameStateResponseDto> {
    await this.ensureMembership(userId, sessionId);
    const state = await this.getGameStateEntityOrThrow(sessionId);
    return mapGameState(state);
  }

  async buildSnapshot(sessionId: string): Promise<SessionSnapshotDto> {
    // 세션 화면을 그리는 데 필요한 데이터를 한 번에 모아 만든다.
    // REST에서 상세 조회를 할 때도, WebSocket에 처음 들어왔을 때도
    // 같은 구조의 snapshot을 쓰면 프론트엔드가 데이터를 다루기 쉬워진다.
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        },
        characters: {
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
      characters: session.characters.map(mapCharacter),
      state: mapGameState(session.gameState),
    };
  }

  async ensureMembership(userId: string, sessionId: string): Promise<void> {
    // 세션 참가자만 세션 정보, 참가자 목록, 상태, 캐릭터 목록을 볼 수 있게 막는다.
    // 권한 규칙을 서비스 메서드마다 따로 쓰지 않도록 공통 검사로 분리했다.
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

  async assertCharacterOwnership(userId: string, characterId: string): Promise<void> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} was not found.`);
    }

    if (character.ownerUserId !== userId) {
      throw new ForbiddenException("You do not own this character.");
    }
  }

  async ensureNoCharacterForUser(userId: string, sessionId: string): Promise<void> {
    const existing = await this.prisma.character.findUnique({
      where: {
        sessionId_ownerUserId: {
          sessionId,
          ownerUserId: userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException("A character already exists for this user in the session.");
    }
  }

  private async generateInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      // 초대 코드는 사용자가 직접 복사하거나 입력할 수 있어야 하므로 짧게 만든다.
      // 이미 같은 코드가 있으면 충돌을 피하기 위해 새 코드를 다시 생성한다.
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
