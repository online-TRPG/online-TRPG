import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionGmRuntimeParticipantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureJoinedGmRuntimeParticipant(userId: string, sessionId: string): Promise<void> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });

    if (
      participant?.status !== PrismaParticipantStatus.JOINED ||
      (participant.role !== PrismaParticipantRole.GM && participant.role !== PrismaParticipantRole.HOST)
    ) {
      throw new ForbiddenException("GM 권한이 필요합니다.");
    }
  }
}
