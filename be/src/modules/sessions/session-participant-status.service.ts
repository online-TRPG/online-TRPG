import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
} from "@prisma/client";
import {
  ConnectionStatus,
  ParticipantStatusResponseDto,
  SessionParticipantResponseDto,
} from "@trpg/shared-types";
import { mapParticipant } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";

@Injectable()
export class SessionParticipantStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService,
  ) {}

  async listJoinedParticipants(
    sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId,
        status: PrismaParticipantStatus.JOINED,
      },
      include: {
        user: true,
        sessionCharacter: {
          select: {
            id: true,
            characterId: true,
            character: {
              select: {
                name: true,
                level: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return participants.map(mapParticipant);
  }

  async listConnectionStatuses(
    sessionId: string,
  ): Promise<ParticipantStatusResponseDto[]> {
    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        sessionId,
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

  async updateConnectionStatus(params: {
    sessionId: string;
    userId: string;
    status: PrismaConnectionStatus;
  }): Promise<void> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      select: {
        id: true,
        status: true,
        connectionStatus: true,
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      return;
    }

    if (participant.connectionStatus === params.status) {
      return;
    }

    const updatedParticipant = await this.prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        connectionStatus: params.status,
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

    this.realtimeEvents.emitParticipantUpdated(
      params.sessionId,
      mapParticipant(updatedParticipant),
    );
  }

  async updateReadyState(params: {
    sessionId: string;
    userId: string;
    activityStatus: PrismaSessionActivityStatus;
    currentPlayId: string | null;
    isReady: boolean;
    getScenarioForReadyValidation: () => Promise<{
      scenario: {
        title?: string | null;
        startLevel?: number | null;
        recommendedEndLevel?: number | null;
      };
    }>;
  }): Promise<SessionParticipantResponseDto> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      include: {
        user: true,
        sessionCharacter: {
          select: {
            id: true,
            characterId: true,
            character: {
              select: {
                name: true,
                level: true,
              },
            },
          },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("세션 구성원만 준비 상태를 변경할 수 있습니다.");
    }

    if (params.activityStatus !== PrismaSessionActivityStatus.LOBBY_OPEN || !params.currentPlayId) {
      throw new ConflictException("준비 완료는 입장 가능한 대기실에서만 변경할 수 있습니다.");
    }
    const activePlay = await this.prisma.userActivePlay.findUnique({ where: { userId: params.userId } });
    if (!activePlay || activePlay.playId !== params.currentPlayId || activePlay.sessionId !== params.sessionId) {
      throw new ConflictException("대기실에 입장한 뒤 준비 상태를 변경해주세요.");
    }

    if (participant.role === PrismaParticipantRole.GM) {
      return this.updateAndEmitReadyParticipant({
        sessionId: params.sessionId,
        participantId: participant.id,
        playId: params.currentPlayId,
        isReady: true,
        readyAt: participant.readyAt ?? new Date(),
      });
    }

    if (params.isReady && !participant.sessionCharacter) {
      throw new ConflictException("준비 완료 전에 사용할 캐릭터를 선택해주세요.");
    }

    if (params.isReady && participant.sessionCharacter) {
      const activeScenario = await params.getScenarioForReadyValidation();
      this.campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel({
        characterName: participant.sessionCharacter.character.name,
        characterLevel: participant.sessionCharacter.character.level,
        scenario: activeScenario.scenario,
      });
    }

    return this.updateAndEmitReadyParticipant({
      sessionId: params.sessionId,
      participantId: participant.id,
      playId: params.currentPlayId,
      isReady: params.isReady,
      readyAt: params.isReady ? new Date() : null,
    });
  }

  async clearReadyState(params: {
    sessionId: string;
    participantId: string;
  }): Promise<SessionParticipantResponseDto> {
    return this.updateAndEmitReadyParticipant({
      sessionId: params.sessionId,
      participantId: params.participantId,
      isReady: false,
      readyAt: null,
    });
  }

  private async updateAndEmitReadyParticipant(params: {
    sessionId: string;
    participantId: string;
    playId?: string;
    isReady: boolean;
    readyAt: Date | null;
  }): Promise<SessionParticipantResponseDto> {
    const updatedParticipant = await this.prisma.$transaction(async (tx) => {
      if (params.playId) {
        await tx.sessionPlayAttendance.upsert({
          where: { playId_participantId: { playId: params.playId, participantId: params.participantId } },
          create: {
            playId: params.playId,
            participantId: params.participantId,
            isReady: params.isReady,
            readyAt: params.readyAt,
          },
          update: { isReady: params.isReady, readyAt: params.readyAt },
        });
      }
      return tx.sessionParticipant.update({
        where: { id: params.participantId },
        data: {
          isReady: params.isReady,
          readyAt: params.readyAt,
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
    });

    const mappedParticipant = mapParticipant(updatedParticipant);
    this.realtimeEvents.emitParticipantUpdated(params.sessionId, mappedParticipant);
    return mappedParticipant;
  }
}
