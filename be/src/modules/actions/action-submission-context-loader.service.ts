import { Injectable } from "@nestjs/common";
import {
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { ActionScope, SubmitActionDto } from "@trpg/shared-types";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { CommandParserService } from "../rules/command-parser.service";

type SubmissionSessionCharacter = {
  id: string;
  characterId: string;
  userId: string;
  currentHp: number;
  status: PrismaSessionCharacterStatus;
  character: {
    ownerUserId: string;
  };
};

export type SubmitActionContext = {
  sessionCharacter: SubmissionSessionCharacter;
  actionScope: PrismaActionScope;
};

export type RestActionContext = {
  sessionCharacter: SubmissionSessionCharacter;
  isGmOperator: boolean;
};

@Injectable()
export class ActionSubmissionContextLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandParser: CommandParserService,
  ) {}

  async loadSubmitActionContext(params: {
    sessionId: string;
    userId: string;
    dto: SubmitActionDto;
    phase: PrismaGamePhase;
  }): Promise<SubmitActionContext> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
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
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      include: { character: true },
    });

    const validSessionCharacter = this.ensureOwnedActiveCharacter({
      sessionCharacter,
      userId: params.userId,
      characterId: params.dto.characterId,
      message: "행동을 입력할 수 없습니다.",
    });

    const actionScope = this.resolveActionScope(
      params.dto.actionScope,
      params.phase,
    );
    this.ensureCommandSyntax(params.dto.rawText);

    await this.ensureScopeAllowed({
      sessionId: params.sessionId,
      participantRole: participant.role,
      sessionCharacterId: validSessionCharacter.id,
      sessionCharacterCurrentHp: validSessionCharacter.currentHp,
      phase: params.phase,
      actionScope,
    });

    return {
      sessionCharacter: validSessionCharacter,
      actionScope,
    };
  }

  async loadRestActionContext(params: {
    sessionId: string;
    userId: string;
    characterId: string;
  }): Promise<RestActionContext> {
    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
    });

    if (!requester || requester.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const isGmOperator =
      requester.role === PrismaParticipantRole.HOST ||
      requester.role === PrismaParticipantRole.GM;

    const sessionCharacter = isGmOperator
      ? await this.prisma.sessionCharacter.findFirst({
          where: {
            sessionId: params.sessionId,
            status: PrismaSessionCharacterStatus.ACTIVE,
            OR: [
              { id: params.characterId },
              { characterId: params.characterId },
            ],
          },
          include: { character: true },
        })
      : await this.prisma.sessionCharacter.findUnique({
          where: {
            sessionId_userId: {
              sessionId: params.sessionId,
              userId: params.userId,
            },
          },
          include: { character: true },
        });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "휴식할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (!isGmOperator) {
      const validSessionCharacter = this.ensureOwnedActiveCharacter({
        sessionCharacter,
        userId: params.userId,
        characterId: params.characterId,
        message: "휴식할 캐릭터를 확인할 수 없습니다.",
      });
      return {
        sessionCharacter: validSessionCharacter,
        isGmOperator,
      };
    }

    return {
      sessionCharacter,
      isGmOperator,
    };
  }

  private ensureOwnedActiveCharacter(params: {
    sessionCharacter: SubmissionSessionCharacter | null;
    userId: string;
    characterId: string;
    message: string;
  }): SubmissionSessionCharacter {
    if (
      !params.sessionCharacter ||
      params.sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE
    ) {
      throw forbidden("ACTION_403", params.message, {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (
      ![params.sessionCharacter.id, params.sessionCharacter.characterId].includes(
        params.characterId,
      )
    ) {
      throw forbidden("ACTION_403", params.message, {
        reason: "CHARACTER_MISMATCH",
      });
    }

    if (params.sessionCharacter.character.ownerUserId !== params.userId) {
      throw forbidden("ACTION_403", params.message, {
        reason: "CHARACTER_OWNERSHIP_MISMATCH",
      });
    }

    return params.sessionCharacter;
  }

  private resolveActionScope(
    requested: SubmitActionDto["actionScope"],
    phase: PrismaGamePhase,
  ): PrismaActionScope {
    if (requested === ActionScope.PARTY_SHARED) {
      return PrismaActionScope.PARTY_SHARED;
    }
    if (requested === ActionScope.INDIVIDUAL_TURN) {
      return PrismaActionScope.INDIVIDUAL_TURN;
    }
    return phase === PrismaGamePhase.COMBAT
      ? PrismaActionScope.INDIVIDUAL_TURN
      : PrismaActionScope.PARTY_SHARED;
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
    participantRole: PrismaParticipantRole;
    sessionCharacterId: string;
    sessionCharacterCurrentHp: number;
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

    if (params.sessionCharacterCurrentHp <= 0) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_INCAPACITATED",
      });
    }
  }
}
