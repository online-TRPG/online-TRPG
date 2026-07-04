import { ConflictException, Injectable } from "@nestjs/common";
import {
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionUpdatePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCanUpdate(params: {
    sessionId: string;
    sessionStatus: PrismaSessionStatus;
    nextMaxParticipants?: number;
    captainUserId?: string | null;
  }): Promise<void> {
    if (params.sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be updated.");
    }

    if (params.nextMaxParticipants !== undefined) {
      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: params.sessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (params.nextMaxParticipants < participantCount) {
        throw new ConflictException("maxParticipants cannot be smaller than the participant count.");
      }
    }

    if (params.captainUserId !== undefined && params.captainUserId !== null) {
      const captainMember = await this.prisma.sessionParticipant.findFirst({
        where: {
          sessionId: params.sessionId,
          userId: params.captainUserId,
          status: PrismaParticipantStatus.JOINED,
        },
        select: { id: true },
      });
      if (!captainMember) {
        throw new ConflictException("captainUserId must be a JOINED participant of the session.");
      }
    }
  }
}
