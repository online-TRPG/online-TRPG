import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  ActionQueueStatus as PrismaActionQueueStatus,
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  RecruitmentStatus as PrismaRecruitmentStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
  SessionApplicationStatus as PrismaSessionApplicationStatus,
  SessionAttendanceStatus as PrismaSessionAttendanceStatus,
  SessionJoinPolicy as PrismaSessionJoinPolicy,
  SessionJoinTiming as PrismaSessionJoinTiming,
  SessionPlayStatus as PrismaSessionPlayStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  AcquireActivePlayDto,
  ActivePlayResponseDto,
  CreateSessionApplicationDto,
  CreateSessionPlayDto,
  ResolveSessionApplicationDto,
  SessionApplicationResponseDto,
  SessionApplicationStatus,
  SessionAttendanceStatus,
  SessionJoinTiming,
  SessionPlayResponseDto,
  SessionPlayStatus,
  SessionPlayTransitionDto,
  SessionScheduleProximityWarningDto,
  SessionScheduleVersionAcknowledgementDto,
  UpdateSessionPlayAttendanceDto,
  UpdateSessionPlayDto,
} from "@trpg/shared-types";
import { mapUser } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

export const SESSION_START_PROXIMITY_WARNING_HOURS = 6;
const PROXIMITY_MS = SESSION_START_PROXIMITY_WARNING_HOURS * 60 * 60 * 1000;
const ACTIVE_PLAY_STALE_MS = 90_000;

@Injectable()
export class SessionPlayService implements OnModuleInit, OnModuleDestroy {
  private scheduler: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  onModuleInit(): void {
    this.scheduler = setInterval(() => {
      void Promise.all([
        this.openDueLobbies(),
        this.cleanupStaleActivePlays(),
      ]).catch(() => undefined);
    }, 60_000);
    this.scheduler.unref?.();
  }

  onModuleDestroy(): void {
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = null;
  }

  async openDueLobbies(): Promise<number> {
    const due = await this.prisma.sessionPlay.findMany({
      where: {
        status: PrismaSessionPlayStatus.SCHEDULED,
        lobbyOpensAt: { lte: new Date() },
        session: { activityStatus: PrismaSessionActivityStatus.DORMANT },
      },
      select: { id: true, sessionId: true, stateVersion: true },
      take: 100,
    });
    let opened = 0;
    for (const play of due) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${play.sessionId}))`;
        const sessionChanged = await tx.session.updateMany({
          where: { id: play.sessionId, activityStatus: PrismaSessionActivityStatus.DORMANT },
          data: { currentPlayId: play.id, activityStatus: PrismaSessionActivityStatus.LOBBY_OPEN, status: PrismaSessionStatus.RECRUITING },
        });
        if (sessionChanged.count !== 1) return false;
        const result = await tx.sessionPlay.updateMany({
          where: { id: play.id, status: PrismaSessionPlayStatus.SCHEDULED, stateVersion: play.stateVersion },
          data: { status: PrismaSessionPlayStatus.LOBBY_OPEN, stateVersion: { increment: 1 } },
        });
        if (result.count !== 1) throw new ConflictException("플레이 일정 상태가 이미 변경되었습니다.");
        return true;
      });
      if (changed) {
        opened += 1;
        const updatedPlay = await this.getPlay(play.sessionId, play.id);
        this.realtimeEvents.emitSessionPlayUpdated(play.sessionId, this.mapPlay(updatedPlay, null, []));
      }
    }
    return opened;
  }

  async cleanupStaleActivePlays(): Promise<number> {
    const stale = await this.prisma.userActivePlay.findMany({
      where: { heartbeatAt: { lt: new Date(Date.now() - ACTIVE_PLAY_STALE_MS) } },
    });
    let released = 0;
    for (const active of stale) {
      if (this.realtimeEvents.hasUserConnection(active.sessionId, active.userId)) continue;
      const removed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.userActivePlay.deleteMany({
          where: { userId: active.userId, playId: active.playId, heartbeatAt: active.heartbeatAt },
        });
        if (result.count !== 1) return false;
        await tx.sessionParticipant.updateMany({
          where: { sessionId: active.sessionId, userId: active.userId, status: PrismaParticipantStatus.JOINED },
          data: { connectionStatus: PrismaConnectionStatus.OFFLINE },
        });
        return true;
      });
      if (removed) released += 1;
    }
    return released;
  }

  async listPlays(userId: string, sessionId: string): Promise<SessionPlayResponseDto[]> {
    const session = await this.getSession(sessionId);
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      select: { id: true, status: true },
    });
    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("세션 구성원만 플레이 일정을 볼 수 있습니다.");
    }
    const plays = await this.prisma.sessionPlay.findMany({
      where: {
        sessionId: session.id,
        status: { notIn: [PrismaSessionPlayStatus.CANCELLED] },
      },
      include: {
        attendances: { where: { participantId: participant.id } },
      },
      orderBy: [{ scheduledStartAt: "asc" }, { sequence: "asc" }],
    });
    return Promise.all(plays.map(async (play) => this.mapPlay(
      play,
      play.attendances[0] ?? null,
      await this.findProximityWarnings(userId, play),
    )));
  }

  async createPlay(userId: string, sessionId: string, dto: CreateSessionPlayDto): Promise<SessionPlayResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const scheduledStartAt = dto.scheduledStartAt ? this.parseFutureDate(dto.scheduledStartAt) : null;
    const openLobbyNow = dto.openLobbyNow === true;
    if (!scheduledStartAt && !openLobbyNow) {
      throw new UnprocessableEntityException("시작 날짜와 시간을 정하거나 지금 대기실을 열어주세요.");
    }
    const play = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      const currentSession = await tx.session.findUniqueOrThrow({ where: { id: session.id } });
      if (
        currentSession.activityStatus === PrismaSessionActivityStatus.LOBBY_OPEN ||
        currentSession.activityStatus === PrismaSessionActivityStatus.PLAYING
      ) {
        throw new ConflictException("현재 열린 플레이를 먼저 닫아주세요.");
      }
      const existingSchedule = await tx.sessionPlay.findFirst({
        where: { sessionId: session.id, status: PrismaSessionPlayStatus.SCHEDULED },
        select: { id: true },
      });
      if (existingSchedule) {
        throw new ConflictException("이미 저장한 다음 플레이 일정을 먼저 변경하거나 취소해주세요.");
      }
      const latest = await tx.sessionPlay.findFirst({
        where: { sessionId: session.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const created = await tx.sessionPlay.create({
        data: {
          sessionId: session.id,
          sequence: (latest?.sequence ?? 0) + 1,
          status: openLobbyNow ? PrismaSessionPlayStatus.LOBBY_OPEN : PrismaSessionPlayStatus.SCHEDULED,
          scheduledStartAt,
          lobbyOpensAt: openLobbyNow ? new Date() : scheduledStartAt,
          timeZone: dto.timeZone?.trim() || "Asia/Seoul",
          createdByUserId: userId,
        },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          nextSessionAt: scheduledStartAt,
          ...(openLobbyNow ? {
            currentPlayId: created.id,
            activityStatus: PrismaSessionActivityStatus.LOBBY_OPEN,
            status: PrismaSessionStatus.RECRUITING,
          } : {}),
        },
      });
      return created;
    });
    const response = this.mapPlay(play, null, []);
    this.realtimeEvents.emitSessionPlayUpdated(session.id, response);
    return response;
  }

  async updatePlay(
    userId: string,
    sessionId: string,
    playId: string,
    dto: UpdateSessionPlayDto,
  ): Promise<SessionPlayResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const scheduledStartAt = this.parseFutureDate(dto.scheduledStartAt);
    const result = await this.prisma.sessionPlay.updateMany({
      where: {
        id: playId,
        sessionId: session.id,
        status: PrismaSessionPlayStatus.SCHEDULED,
        scheduleVersion: dto.expectedScheduleVersion,
      },
      data: {
        scheduledStartAt,
        lobbyOpensAt: scheduledStartAt,
        timeZone: dto.timeZone?.trim() || "Asia/Seoul",
        scheduleVersion: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new ConflictException("일정이 이미 변경되었습니다. 새로고침 후 다시 시도해주세요.");
    await this.refreshNextSessionAt(session.id);
    const response = this.mapPlay(await this.getPlay(session.id, playId), null, []);
    this.realtimeEvents.emitSessionPlayUpdated(session.id, response);
    return response;
  }

  async cancelPlay(
    userId: string,
    sessionId: string,
    playId: string,
    dto: SessionPlayTransitionDto,
  ): Promise<SessionPlayResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sessionPlay.updateMany({
        where: {
          id: playId,
          sessionId: session.id,
          status: PrismaSessionPlayStatus.SCHEDULED,
          stateVersion: dto.expectedStateVersion,
        },
        data: { status: PrismaSessionPlayStatus.CANCELLED, stateVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException("이미 변경된 플레이 일정입니다.");
      if (session.currentPlayId === playId) {
        await tx.session.update({
          where: { id: session.id },
          data: { currentPlayId: null, activityStatus: PrismaSessionActivityStatus.DORMANT, status: PrismaSessionStatus.PAUSED },
        });
      }
      return tx.sessionPlay.findUniqueOrThrow({ where: { id: playId } });
    });
    await this.refreshNextSessionAt(session.id);
    const response = this.mapPlay(result, null, []);
    this.realtimeEvents.emitSessionPlayUpdated(session.id, response);
    return response;
  }

  async openLobby(
    userId: string,
    sessionId: string,
    playId: string,
    dto: SessionPlayTransitionDto,
  ): Promise<SessionPlayResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const play = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      const currentSession = await tx.session.findUniqueOrThrow({ where: { id: session.id } });
      if (currentSession.activityStatus === PrismaSessionActivityStatus.PLAYING) {
        throw new ConflictException("진행 중인 플레이를 저장하고 닫은 뒤 대기실을 열어주세요.");
      }
      if (
        currentSession.activityStatus === PrismaSessionActivityStatus.LOBBY_OPEN &&
        currentSession.currentPlayId !== playId
      ) {
        throw new ConflictException("다른 플레이의 대기실이 이미 열려 있습니다.");
      }
      const updated = await tx.sessionPlay.updateMany({
        where: {
          id: playId,
          sessionId: session.id,
          status: { in: [PrismaSessionPlayStatus.SCHEDULED, PrismaSessionPlayStatus.LOBBY_OPEN] },
          stateVersion: dto.expectedStateVersion,
        },
        data: {
          status: PrismaSessionPlayStatus.LOBBY_OPEN,
          lobbyOpensAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException("대기실 상태가 이미 변경되었습니다.");
      await tx.session.update({
        where: { id: session.id },
        data: {
          currentPlayId: playId,
          activityStatus: PrismaSessionActivityStatus.LOBBY_OPEN,
          status: PrismaSessionStatus.RECRUITING,
        },
      });
      await tx.sessionPlayAttendance.updateMany({ where: { playId }, data: { isReady: false, readyAt: null } });
      await tx.sessionParticipant.updateMany({
        where: { sessionId: session.id, status: PrismaParticipantStatus.JOINED },
        data: { isReady: false, readyAt: null },
      });
      return tx.sessionPlay.findUniqueOrThrow({ where: { id: playId } });
    });
    const response = this.mapPlay(play, null, []);
    this.realtimeEvents.emitSessionPlayUpdated(session.id, response);
    return response;
  }

  async finishPlay(
    userId: string,
    sessionId: string,
    playId: string,
    dto: SessionPlayTransitionDto,
  ): Promise<SessionPlayResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const play = await this.getPlay(session.id, playId);
    if (play.status === PrismaSessionPlayStatus.FINISHED) {
      return this.mapPlay(play, null, []);
    }
    if (
      (play.status !== PrismaSessionPlayStatus.LOBBY_OPEN &&
        play.status !== PrismaSessionPlayStatus.PLAYING) ||
      play.stateVersion !== dto.expectedStateVersion
    ) {
      throw new ConflictException("열려 있는 플레이 상태가 이미 변경되었습니다.");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      const lockedPlay = await tx.sessionPlay.findUniqueOrThrow({ where: { id: playId } });
      if (lockedPlay.status === PrismaSessionPlayStatus.FINISHED) {
        return { play: lockedPlay, activeUsers: [] };
      }
      const activeUsers = await tx.userActivePlay.findMany({ where: { playId }, select: { userId: true } });
      const recentLogs = lockedPlay.startedAt ? await tx.turnLog.findMany({
          where: {
            sessionId: session.id,
            narration: { not: null },
            createdAt: { gte: lockedPlay.startedAt },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { narration: true },
        }) : [];
      const summary = recentLogs.reverse().flatMap((log) => log.narration ? [log.narration] : []).join(" ").slice(0, 2000) || null;
      const changed = await tx.sessionPlay.updateMany({
        where: {
          id: playId,
          stateVersion: dto.expectedStateVersion,
          status: { in: [PrismaSessionPlayStatus.LOBBY_OPEN, PrismaSessionPlayStatus.PLAYING] },
        },
        data: { status: PrismaSessionPlayStatus.FINISHED, endedAt: new Date(), stateVersion: { increment: 1 }, summary },
      });
      if (changed.count !== 1) throw new ConflictException("플레이 종료 상태가 이미 변경되었습니다.");
      await tx.playerAction.updateMany({
        where: { sessionId: session.id, queueStatus: { in: [PrismaActionQueueStatus.PENDING, PrismaActionQueueStatus.PROCESSING] } },
        data: { queueStatus: PrismaActionQueueStatus.FAILED, failureReason: "PLAY_FINISHED" },
      });
      await tx.sessionPlayAttendance.updateMany({ where: { playId }, data: { isReady: false, readyAt: null } });
      await tx.sessionParticipant.updateMany({
        where: { sessionId: session.id, status: PrismaParticipantStatus.JOINED },
        data: { isReady: false, readyAt: null, connectionStatus: PrismaConnectionStatus.OFFLINE },
      });
      await tx.userActivePlay.deleteMany({ where: { playId } });
      await tx.session.update({
        where: { id: session.id },
        data: { currentPlayId: null, activityStatus: PrismaSessionActivityStatus.DORMANT, status: PrismaSessionStatus.PAUSED },
      });
      return {
        play: await tx.sessionPlay.findUniqueOrThrow({ where: { id: playId } }),
        activeUsers,
      };
    });
    for (const active of result.activeUsers) {
      this.realtimeEvents.emitActivePlayChanged(session.id, active.userId, null);
      this.realtimeEvents.evictUserFromSession(session.id, active.userId);
    }
    await this.refreshNextSessionAt(session.id);
    const response = this.mapPlay(result.play, null, []);
    this.realtimeEvents.emitSessionPlayUpdated(session.id, response);
    return response;
  }

  async updateAttendance(
    userId: string,
    sessionId: string,
    playId: string,
    dto: UpdateSessionPlayAttendanceDto,
  ): Promise<SessionPlayResponseDto> {
    const session = await this.getSession(sessionId);
    const participant = await this.getJoinedParticipant(session.id, userId);
    const play = await this.getPlay(session.id, playId);
    const warnings = dto.attendance === SessionAttendanceStatus.ATTENDING
      ? await this.findProximityWarnings(userId, play)
      : [];
    await this.assertAndRecordAcknowledgements(userId, play, warnings, dto.acknowledgedScheduleVersions ?? []);
    const attendance = await this.prisma.sessionPlayAttendance.upsert({
      where: { playId_participantId: { playId, participantId: participant.id } },
      create: { playId, participantId: participant.id, attendance: dto.attendance as PrismaSessionAttendanceStatus },
      update: { attendance: dto.attendance as PrismaSessionAttendanceStatus },
    });
    const response = this.mapPlay(play, attendance, warnings);
    this.realtimeEvents.emitSessionAttendanceUpdated(session.id, {
      ...response,
      viewerAttendance: null,
      proximityWarnings: [],
    });
    return response;
  }

  async acquireActivePlay(
    userId: string,
    sessionId: string,
    playId: string,
    dto: AcquireActivePlayDto,
  ): Promise<ActivePlayResponseDto> {
    const session = await this.getSession(sessionId);
    const participant = await this.getJoinedParticipant(session.id, userId);
    const play = await this.getPlay(session.id, playId);
    if (
      play.status !== PrismaSessionPlayStatus.LOBBY_OPEN &&
      play.status !== PrismaSessionPlayStatus.PLAYING
    ) {
      throw new UnprocessableEntityException("현재 입장할 수 없는 플레이입니다.");
    }
    const now = new Date();
    const acquisition = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`active-play:${userId}`}))`;
      const existing = await tx.userActivePlay.findUnique({ where: { userId } });
      if (existing && existing.playId !== playId && !dto.confirmSwitch) {
        const previousSession = await tx.session.findUnique({
          where: { id: existing.sessionId },
          select: { title: true },
        });
        throw new ConflictException({
          code: "SESSION_ACTIVE_PLAY_CONFLICT",
          message: `현재 "${previousSession?.title ?? "다른 세션"}"에 입장해 있습니다. 이동하면 현재 플레이에서 나가고 "${session.title}"에 입장합니다.`,
          activeSessionId: existing.sessionId,
          activePlayId: existing.playId,
        });
      }
      if (existing && existing.sessionId !== session.id) {
        await tx.sessionParticipant.updateMany({
          where: { sessionId: existing.sessionId, userId, status: PrismaParticipantStatus.JOINED },
          data: { connectionStatus: PrismaConnectionStatus.OFFLINE },
        });
      }
      const acquired = await tx.userActivePlay.upsert({
        where: { userId },
        create: { userId, playId, sessionId: session.id, acquiredAt: now, heartbeatAt: now },
        update: { playId, sessionId: session.id, acquiredAt: now, heartbeatAt: now },
      });
      await tx.sessionPlayAttendance.upsert({
        where: { playId_participantId: { playId, participantId: participant.id } },
        create: { playId, participantId: participant.id, attendance: PrismaSessionAttendanceStatus.TENTATIVE, enteredLobbyAt: now },
        update: { enteredLobbyAt: now },
      });
      await tx.sessionParticipant.update({
        where: { id: participant.id },
        data: { connectionStatus: PrismaConnectionStatus.ONLINE },
      });
      return {
        acquired,
        previousActive: existing ? { sessionId: existing.sessionId, playId: existing.playId } : null,
      };
    });
    if (acquisition.previousActive && acquisition.previousActive.playId !== playId) {
      this.realtimeEvents.emitActivePlayChanged(acquisition.previousActive.sessionId, userId, null);
      this.realtimeEvents.evictUserFromSession(acquisition.previousActive.sessionId, userId);
    }
    const response = this.mapActive(acquisition.acquired);
    this.realtimeEvents.emitActivePlayChanged(session.id, userId, response);
    return response;
  }

  async releaseActivePlay(userId: string): Promise<void> {
    const existing = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`active-play:${userId}`}))`;
      const current = await tx.userActivePlay.findUnique({ where: { userId } });
      if (!current) return null;
      await tx.userActivePlay.delete({ where: { userId } });
      await tx.sessionParticipant.updateMany({
        where: { sessionId: current.sessionId, userId, status: PrismaParticipantStatus.JOINED },
        data: { connectionStatus: PrismaConnectionStatus.OFFLINE },
      });
      return current;
    });
    if (!existing) return;
    this.realtimeEvents.emitActivePlayChanged(existing.sessionId, userId, null);
    this.realtimeEvents.evictUserFromSession(existing.sessionId, userId);
  }

  async heartbeat(userId: string, playId: string): Promise<ActivePlayResponseDto> {
    const result = await this.prisma.userActivePlay.updateMany({
      where: { userId, playId },
      data: { heartbeatAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException("현재 실시간 참여 정보를 찾을 수 없습니다.");
    return this.mapActive(await this.prisma.userActivePlay.findUniqueOrThrow({ where: { userId } }));
  }

  async createApplication(
    userId: string,
    sessionId: string,
    dto: CreateSessionApplicationDto,
  ): Promise<SessionApplicationResponseDto> {
    const session = await this.getSession(sessionId);
    if (session.recruitmentStatus !== PrismaRecruitmentStatus.OPEN) {
      throw new UnprocessableEntityException("현재 참가 신청을 받지 않는 세션입니다.");
    }
    if (session.joinPolicy !== PrismaSessionJoinPolicy.APPROVAL_REQUIRED) {
      throw new UnprocessableEntityException("참가 신청 승인을 사용하는 세션이 아닙니다.");
    }
    const membership = await this.prisma.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      select: { status: true },
    });
    if (membership?.status === PrismaParticipantStatus.KICKED) throw new ForbiddenException("이 세션에 참가 신청할 수 없습니다.");
    if (membership?.status === PrismaParticipantStatus.JOINED) throw new ConflictException("이미 세션 구성원입니다.");

    const targetPlay = await this.findNextRelevantPlay(session.id);
    if (targetPlay) {
      const warnings = await this.findProximityWarnings(userId, targetPlay);
      await this.assertAndRecordAcknowledgements(
        userId,
        targetPlay,
        warnings,
        dto.acknowledgedScheduleVersions ?? [],
      );
    }

    const application = await this.prisma.sessionApplication.upsert({
      where: { sessionId_applicantUserId: { sessionId: session.id, applicantUserId: userId } },
      create: { sessionId: session.id, applicantUserId: userId, note: dto.note?.trim() || null },
      update: { status: PrismaSessionApplicationStatus.PENDING, note: dto.note?.trim() || null, resolvedAt: null, resolvedByUserId: null, joinTiming: null },
      include: { applicant: true },
    });
    return this.mapApplication(application);
  }

  async getApplicationProximityWarnings(
    userId: string,
    sessionId: string,
  ): Promise<SessionScheduleProximityWarningDto[]> {
    const session = await this.getSession(sessionId);
    if (session.recruitmentStatus !== PrismaRecruitmentStatus.OPEN) return [];
    return this.getJoinProximityWarnings(userId, session.id);
  }

  async getJoinProximityWarnings(
    userId: string,
    sessionId: string,
  ): Promise<SessionScheduleProximityWarningDto[]> {
    const session = await this.getSession(sessionId);
    const targetPlay = await this.findNextRelevantPlay(session.id);
    return targetPlay ? this.findProximityWarnings(userId, targetPlay) : [];
  }

  async validateJoinProximity(
    userId: string,
    sessionId: string,
    acknowledgedScheduleVersions: SessionScheduleVersionAcknowledgementDto[] = [],
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    const targetPlay = await this.findNextRelevantPlay(session.id);
    if (!targetPlay) return;
    const warnings = await this.findProximityWarnings(userId, targetPlay);
    await this.assertAndRecordAcknowledgements(
      userId,
      targetPlay,
      warnings,
      acknowledgedScheduleVersions,
    );
  }

  async listApplications(userId: string, sessionId: string): Promise<SessionApplicationResponseDto[]> {
    const session = await this.getHostSession(userId, sessionId);
    const applications = await this.prisma.sessionApplication.findMany({
      where: { sessionId: session.id },
      include: { applicant: true },
      orderBy: { createdAt: "asc" },
    });
    return applications.map((application) => this.mapApplication(application));
  }

  async resolveApplication(
    userId: string,
    sessionId: string,
    applicationId: string,
    dto: ResolveSessionApplicationDto,
  ): Promise<SessionApplicationResponseDto> {
    const session = await this.getHostSession(userId, sessionId);
    const application = await this.prisma.sessionApplication.findFirst({
      where: { id: applicationId, sessionId: session.id, status: PrismaSessionApplicationStatus.PENDING },
      include: { applicant: true },
    });
    if (!application) throw new NotFoundException("대기 중인 참가 신청을 찾을 수 없습니다.");
    const approved = dto.status === SessionApplicationStatus.APPROVED;
    if (
      approved &&
      dto.joinTiming === SessionJoinTiming.CURRENT_PLAY &&
      (!session.currentPlayId || (
        session.activityStatus !== PrismaSessionActivityStatus.LOBBY_OPEN &&
        session.activityStatus !== PrismaSessionActivityStatus.PLAYING
      ))
    ) {
      throw new ConflictException("현재 열려 있는 플레이가 없습니다. 다음 플레이부터 승인해주세요.");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
      if (approved) {
        const participantCount = await tx.sessionParticipant.count({
          where: { sessionId: session.id, status: PrismaParticipantStatus.JOINED },
        });
        if (participantCount >= session.maxParticipants) {
          throw new ConflictException("세션 정원이 모두 찼습니다.");
        }
        const existing = await tx.sessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId: session.id, userId: application.applicantUserId } },
        });
        if (existing?.status === PrismaParticipantStatus.KICKED) throw new ForbiddenException("내보낸 참가자는 먼저 복구해야 합니다.");
        const participant = await tx.sessionParticipant.upsert({
          where: { sessionId_userId: { sessionId: session.id, userId: application.applicantUserId } },
          create: { sessionId: session.id, userId: application.applicantUserId, role: PrismaParticipantRole.PLAYER, status: PrismaParticipantStatus.JOINED, connectionStatus: PrismaConnectionStatus.OFFLINE },
          update: { role: PrismaParticipantRole.PLAYER, status: PrismaParticipantStatus.JOINED, leftAt: null, connectionStatus: PrismaConnectionStatus.OFFLINE },
        });
        if (dto.joinTiming === SessionJoinTiming.CURRENT_PLAY && session.currentPlayId) {
          await tx.sessionPlayAttendance.upsert({
            where: { playId_participantId: { playId: session.currentPlayId, participantId: participant.id } },
            create: { playId: session.currentPlayId, participantId: participant.id, attendance: PrismaSessionAttendanceStatus.TENTATIVE },
            update: {},
          });
        }
      }
      return tx.sessionApplication.update({
        where: { id: application.id },
        data: {
          status: approved ? PrismaSessionApplicationStatus.APPROVED : PrismaSessionApplicationStatus.REJECTED,
          joinTiming: approved ? (dto.joinTiming ?? SessionJoinTiming.NEXT_PLAY) as PrismaSessionJoinTiming : null,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
        },
        include: { applicant: true },
      });
    });
    return this.mapApplication(updated);
  }

  private async findProximityWarnings(
    userId: string,
    target: { id: string; scheduledStartAt: Date | null; scheduleVersion: number },
  ): Promise<SessionScheduleProximityWarningDto[]> {
    if (!target.scheduledStartAt) return [];
    const [attendances, applications] = await Promise.all([
      this.prisma.sessionPlayAttendance.findMany({
      where: {
        participant: { userId, status: PrismaParticipantStatus.JOINED },
        attendance: PrismaSessionAttendanceStatus.ATTENDING,
        playId: { not: target.id },
        play: {
          status: { in: [PrismaSessionPlayStatus.SCHEDULED, PrismaSessionPlayStatus.LOBBY_OPEN, PrismaSessionPlayStatus.PLAYING] },
          scheduledStartAt: { not: null },
        },
      },
      include: { play: { include: { session: { select: { title: true } } } } },
      }),
      this.prisma.sessionApplication.findMany({
        where: {
          applicantUserId: userId,
          status: { in: [PrismaSessionApplicationStatus.PENDING, PrismaSessionApplicationStatus.APPROVED] },
        },
        include: {
          session: {
            include: {
              plays: {
                where: {
                  status: { in: [PrismaSessionPlayStatus.SCHEDULED, PrismaSessionPlayStatus.LOBBY_OPEN, PrismaSessionPlayStatus.PLAYING] },
                  scheduledStartAt: { not: null },
                },
                orderBy: { scheduledStartAt: "asc" },
                take: 1,
              },
            },
          },
        },
      }),
    ]);
    const comparedPlays = new Map<string, { id: string; scheduledStartAt: Date; scheduleVersion: number; sessionTitle: string }>();
    for (const { play } of attendances) {
      if (play.scheduledStartAt) comparedPlays.set(play.id, {
        id: play.id,
        scheduledStartAt: play.scheduledStartAt,
        scheduleVersion: play.scheduleVersion,
        sessionTitle: play.session.title,
      });
    }
    for (const application of applications) {
      const play = application.session.plays[0];
      if (play?.scheduledStartAt && play.id !== target.id) comparedPlays.set(play.id, {
        id: play.id,
        scheduledStartAt: play.scheduledStartAt,
        scheduleVersion: play.scheduleVersion,
        sessionTitle: application.session.title,
      });
    }
    const candidates = [...comparedPlays.values()].flatMap((play) => {
      if (!play.scheduledStartAt) return [];
      const differenceMs = Math.abs(play.scheduledStartAt.getTime() - target.scheduledStartAt!.getTime());
      return differenceMs <= PROXIMITY_MS
        ? [{
            comparedPlayId: play.id,
            sessionTitle: play.sessionTitle,
            scheduledStartAt: play.scheduledStartAt.toISOString(),
            differenceMinutes: Math.round(differenceMs / 60000),
            scheduleVersion: play.scheduleVersion,
            targetScheduleVersion: target.scheduleVersion,
          }]
        : [];
    });
    if (!candidates.length) return [];
    const acknowledgements = await this.prisma.sessionScheduleProximityAcknowledgement.findMany({
      where: {
        userId,
        playId: target.id,
        comparedPlayId: { in: candidates.map((warning) => warning.comparedPlayId) },
      },
    });
    const acknowledgedVersions = new Map(acknowledgements.map((acknowledgement) => [
      acknowledgement.comparedPlayId,
      `${acknowledgement.playScheduleVersion}:${acknowledgement.comparedScheduleVersion}`,
    ]));
    return candidates.filter((warning) =>
      acknowledgedVersions.get(warning.comparedPlayId) !== `${target.scheduleVersion}:${warning.scheduleVersion}`,
    );
  }

  private async findNextRelevantPlay(sessionId: string) {
    return this.prisma.sessionPlay.findFirst({
      where: {
        sessionId,
        status: { in: [PrismaSessionPlayStatus.SCHEDULED, PrismaSessionPlayStatus.LOBBY_OPEN, PrismaSessionPlayStatus.PLAYING] },
        scheduledStartAt: { not: null },
      },
      orderBy: { scheduledStartAt: "asc" },
    });
  }

  private async assertAndRecordAcknowledgements(
    userId: string,
    play: { id: string; scheduleVersion: number },
    warnings: SessionScheduleProximityWarningDto[],
    acknowledgedVersions: SessionScheduleVersionAcknowledgementDto[],
  ): Promise<void> {
    const acknowledged = new Map(acknowledgedVersions.map((entry) => [
      entry.comparedPlayId,
      `${entry.playScheduleVersion}:${entry.comparedScheduleVersion}`,
    ]));
    if (warnings.some((warning) =>
      acknowledged.get(warning.comparedPlayId) !== `${play.scheduleVersion}:${warning.scheduleVersion}`,
    )) {
      throw new ConflictException({
        code: "SESSION_SCHEDULE_PROXIMITY_CONFIRMATION_REQUIRED",
        message: "시작 시간이 가까운 플레이 일정을 확인해주세요.",
        warnings,
      });
    }
    if (!warnings.length) return;
    await this.prisma.$transaction(warnings.flatMap((warning) => [
      this.prisma.sessionScheduleProximityAcknowledgement.upsert({
        where: { userId_playId_comparedPlayId: { userId, playId: play.id, comparedPlayId: warning.comparedPlayId } },
        create: {
          userId,
          playId: play.id,
          comparedPlayId: warning.comparedPlayId,
          playScheduleVersion: play.scheduleVersion,
          comparedScheduleVersion: warning.scheduleVersion,
        },
        update: {
          playScheduleVersion: play.scheduleVersion,
          comparedScheduleVersion: warning.scheduleVersion,
          acknowledgedAt: new Date(),
        },
      }),
      this.prisma.sessionScheduleProximityAcknowledgement.upsert({
        where: { userId_playId_comparedPlayId: { userId, playId: warning.comparedPlayId, comparedPlayId: play.id } },
        create: {
          userId,
          playId: warning.comparedPlayId,
          comparedPlayId: play.id,
          playScheduleVersion: warning.scheduleVersion,
          comparedScheduleVersion: play.scheduleVersion,
        },
        update: {
          playScheduleVersion: warning.scheduleVersion,
          comparedScheduleVersion: play.scheduleVersion,
          acknowledgedAt: new Date(),
        },
      }),
    ]));
  }

  private mapPlay(
    play: {
      id: string; sessionId: string; sequence: number; status: PrismaSessionPlayStatus;
      scheduledStartAt: Date | null; lobbyOpensAt: Date | null; startedAt: Date | null; endedAt: Date | null;
      timeZone: string; scheduleVersion: number; stateVersion: number; summary: string | null;
    },
    attendance: { attendance: PrismaSessionAttendanceStatus; isReady: boolean; readyAt: Date | null; enteredLobbyAt: Date | null } | null,
    warnings: SessionScheduleProximityWarningDto[],
  ): SessionPlayResponseDto {
    return {
      id: play.id,
      sessionId: play.sessionId,
      sequence: play.sequence,
      status: play.status as SessionPlayStatus,
      scheduledStartAt: play.scheduledStartAt?.toISOString() ?? null,
      lobbyOpensAt: play.lobbyOpensAt?.toISOString() ?? null,
      startedAt: play.startedAt?.toISOString() ?? null,
      endedAt: play.endedAt?.toISOString() ?? null,
      timeZone: play.timeZone,
      scheduleVersion: play.scheduleVersion,
      stateVersion: play.stateVersion,
      summary: play.summary,
      viewerAttendance: attendance ? {
        attendance: attendance.attendance as SessionAttendanceStatus,
        isReady: attendance.isReady,
        readyAt: attendance.readyAt?.toISOString() ?? null,
        enteredLobbyAt: attendance.enteredLobbyAt?.toISOString() ?? null,
      } : null,
      proximityWarnings: warnings,
    };
  }

  private mapApplication(application: {
    id: string; sessionId: string; status: PrismaSessionApplicationStatus; note: string | null;
    joinTiming: PrismaSessionJoinTiming | null; createdAt: Date; resolvedAt: Date | null;
    applicant: Parameters<typeof mapUser>[0];
  }): SessionApplicationResponseDto {
    return {
      id: application.id,
      sessionId: application.sessionId,
      applicant: mapUser(application.applicant),
      status: application.status as SessionApplicationStatus,
      note: application.note,
      joinTiming: application.joinTiming as SessionJoinTiming | null,
      createdAt: application.createdAt.toISOString(),
      resolvedAt: application.resolvedAt?.toISOString() ?? null,
    };
  }

  private mapActive(active: { sessionId: string; playId: string; acquiredAt: Date; heartbeatAt: Date }): ActivePlayResponseDto {
    return {
      sessionId: active.sessionId,
      playId: active.playId,
      acquiredAt: active.acquiredAt.toISOString(),
      heartbeatAt: active.heartbeatAt.toISOString(),
    };
  }

  private async getSession(sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { OR: [{ id: sessionId }, { publicId: sessionId }] },
    });
    if (!session) throw new NotFoundException("세션을 찾을 수 없습니다.");
    return session;
  }

  private async getHostSession(userId: string, sessionId: string) {
    const session = await this.getSession(sessionId);
    if (session.hostUserId !== userId) throw new ForbiddenException("세션 관리자만 실행할 수 있습니다.");
    return session;
  }

  private async getPlay(sessionId: string, playId: string) {
    const play = await this.prisma.sessionPlay.findFirst({ where: { id: playId, sessionId } });
    if (!play) throw new NotFoundException("플레이 일정을 찾을 수 없습니다.");
    return play;
  }

  private async getJoinedParticipant(sessionId: string, userId: string) {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("세션 구성원만 실행할 수 있습니다.");
    }
    return participant;
  }

  private parseFutureDate(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new UnprocessableEntityException("시작 날짜와 시간이 올바르지 않습니다.");
    if (date.getTime() <= Date.now()) throw new UnprocessableEntityException("시작 날짜와 시간은 현재 이후로 정해주세요.");
    return date;
  }

  private async refreshNextSessionAt(sessionId: string): Promise<void> {
    const next = await this.prisma.sessionPlay.findFirst({
      where: {
        sessionId,
        status: PrismaSessionPlayStatus.SCHEDULED,
        scheduledStartAt: { gte: new Date() },
      },
      orderBy: { scheduledStartAt: "asc" },
      select: { scheduledStartAt: true },
    });
    await this.prisma.session.update({ where: { id: sessionId }, data: { nextSessionAt: next?.scheduledStartAt ?? null } });
  }
}
