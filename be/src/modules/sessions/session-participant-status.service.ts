import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
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
          include: { character: true },
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
          include: { character: true },
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
    sessionStatus: PrismaSessionStatus;
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
          include: { character: true },
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw new ForbiddenException("You must join the session before updating ready state.");
    }

    if (params.sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Ready state can only be changed while the session is recruiting.");
    }

    if (participant.role === PrismaParticipantRole.GM) {
      return this.updateAndEmitReadyParticipant({
        sessionId: params.sessionId,
        participantId: participant.id,
        isReady: true,
        readyAt: participant.readyAt ?? new Date(),
      });
    }

    if (params.isReady && !participant.sessionCharacter) {
      throw new ConflictException("Select a character before marking yourself ready.");
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
    isReady: boolean;
    readyAt: Date | null;
  }): Promise<SessionParticipantResponseDto> {
    const updatedParticipant = await this.prisma.sessionParticipant.update({
      where: { id: params.participantId },
      data: {
        isReady: params.isReady,
        readyAt: params.readyAt,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });

    const mappedParticipant = mapParticipant(updatedParticipant);
    this.realtimeEvents.emitParticipantUpdated(params.sessionId, mappedParticipant);
    return mappedParticipant;
  }
}
