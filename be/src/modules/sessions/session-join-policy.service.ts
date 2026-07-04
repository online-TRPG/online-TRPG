import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export type JoinableExistingParticipant = {
  id: string;
  role: PrismaParticipantRole;
  status: PrismaParticipantStatus;
};

@Injectable()
export class SessionJoinPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCanJoin(params: {
    sessionId: string;
    userId: string;
    sessionStatus: PrismaSessionStatus;
    maxParticipants: number;
  }): Promise<JoinableExistingParticipant | null> {
    if (params.sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new UnprocessableEntityException("Only recruiting sessions can be joined.");
    }

    const existingParticipant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (existingParticipant?.status === PrismaParticipantStatus.JOINED) {
      throw new ConflictException("You already joined this session.");
    }

    const participantCount = await this.prisma.sessionParticipant.count({
      where: {
        sessionId: params.sessionId,
        status: PrismaParticipantStatus.JOINED,
      },
    });

    if (participantCount >= params.maxParticipants) {
      throw new UnprocessableEntityException("This session is already full.");
    }

    return existingParticipant;
  }
}
