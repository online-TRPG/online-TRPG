import { Injectable } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionAcceptedResponseDto,
  ActionInputType,
  ActionQueueStatus,
  ActionScope,
  SubmitActionDto,
} from "@trpg/shared-types";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { CommandParserService } from "../rules/command-parser.service";
import { SessionsService } from "../sessions/sessions.service";
import { ActionProcessorService } from "./action-processor.service";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly commandParser: CommandParserService,
  ) {}

  async submitAction(
    userId: string,
    sessionId: string,
    dto: SubmitActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.characterId)) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_MISMATCH",
      });
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const actionScope = this.resolveActionScope(dto.actionScope, state.phase);
    this.ensureCommandSyntax(dto.rawText);

    await this.ensureScopeAllowed({
      sessionId: session.id,
      userId,
      participantRole: participant.role,
      sessionCharacterId: sessionCharacter.id,
      phase: state.phase,
      actionScope,
    });

    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: session.id,
        userId,
        sessionCharacterId: sessionCharacter.id,
        rawText: dto.rawText.trim(),
        inputType: this.resolveInputType(dto),
        actionScope,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: state.version,
        clientCreatedAt: new Date(dto.clientCreatedAt),
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, action.id);

    // MVP에서는 별도 큐 인프라 없이 요청 직후 한 건을 처리한다.
    // DB에는 큐 상태가 남기 때문에 나중에 BullMQ 같은 작업 큐로 옮겨도 API 계약을 유지할 수 있다.
    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: state.version,
    };
  }

  private ensurePlaying(status: PrismaSessionStatus): void {
    if (status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }
  }

  private resolveActionScope(
    requested: ActionScope | undefined,
    phase: PrismaGamePhase,
  ): PrismaActionScope {
    if (requested) {
      return requested === ActionScope.INDIVIDUAL_TURN
        ? PrismaActionScope.INDIVIDUAL_TURN
        : PrismaActionScope.PARTY_SHARED;
    }

    return phase === PrismaGamePhase.COMBAT
      ? PrismaActionScope.INDIVIDUAL_TURN
      : PrismaActionScope.PARTY_SHARED;
  }

  private resolveInputType(dto: SubmitActionDto): PrismaActionInputType {
    if (dto.inputType === ActionInputType.SELECT) {
      return PrismaActionInputType.SELECT;
    }

    return dto.rawText.trim().startsWith("/")
      ? PrismaActionInputType.COMMAND
      : PrismaActionInputType.TEXT;
  }

  private ensureCommandSyntax(rawText: string): void {
    if (!rawText.trim().startsWith("/")) {
      return;
    }

    const parsed = this.commandParser.parse(rawText);
    if (parsed.type === "unknown") {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "UNKNOWN_COMMAND",
      });
    }
  }

  private async ensureScopeAllowed(params: {
    sessionId: string;
    userId: string;
    participantRole: PrismaParticipantRole;
    sessionCharacterId: string;
    phase: PrismaGamePhase;
    actionScope: PrismaActionScope;
  }): Promise<void> {
    if (params.actionScope === PrismaActionScope.PARTY_SHARED) {
      if (params.phase === PrismaGamePhase.COMBAT) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "PARTY_ACTION_BLOCKED_IN_COMBAT",
        });
      }

      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: params.sessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (participantCount > 1 && params.participantRole !== PrismaParticipantRole.HOST) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "NOT_PARTY_REPRESENTATIVE",
        });
      }

      return;
    }

    if (params.phase !== PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "INDIVIDUAL_TURN_REQUIRES_COMBAT",
      });
    }

    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: "ACTIVE",
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });

    const current = combat?.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

    if (!combat || current?.sessionCharacterId !== params.sessionCharacterId) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "NOT_YOUR_TURN",
      });
    }
  }
}
