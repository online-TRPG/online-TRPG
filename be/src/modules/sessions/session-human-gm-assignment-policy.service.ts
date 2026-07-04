import { ConflictException, Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionHumanGmAssignmentPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCanAssign(params: {
    sessionId: string;
    sessionGmMode: PrismaGmMode;
    sessionStatus: PrismaSessionStatus;
    gmUserId: string;
  }): Promise<void> {
    if (params.sessionGmMode !== PrismaGmMode.HUMAN) {
      throw new ConflictException("GM can only be assigned in HUMAN GM sessions.");
    }

    if (params.sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("GM can only be assigned while the session is recruiting.");
    }

    const targetParticipant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.gmUserId,
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
  }
}
