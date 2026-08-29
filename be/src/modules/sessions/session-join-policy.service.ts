import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  Prisma,
  SessionStatus as PrismaSessionStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
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
    activityStatus?: PrismaSessionActivityStatus;
    maxParticipants: number;
  }, db: Pick<Prisma.TransactionClient, "sessionParticipant"> = this.prisma): Promise<JoinableExistingParticipant | null> {
    if (
      params.activityStatus
        ? params.activityStatus !== PrismaSessionActivityStatus.DORMANT &&
          params.activityStatus !== PrismaSessionActivityStatus.LOBBY_OPEN
        : params.sessionStatus !== PrismaSessionStatus.RECRUITING
    ) {
      throw new UnprocessableEntityException("현재는 새 구성원이 참가할 수 없는 세션입니다.");
    }

    const existingParticipant = await db.sessionParticipant.findUnique({
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
      throw new ConflictException("이미 참가한 세션입니다.");
    }
    if (existingParticipant?.status === PrismaParticipantStatus.KICKED) {
      throw new ConflictException("세션 관리자가 다시 참가를 허용하기 전에는 이 세션에 참가할 수 없습니다.");
    }

    const participantCount = await db.sessionParticipant.count({
      where: {
        sessionId: params.sessionId,
        status: PrismaParticipantStatus.JOINED,
      },
    });

    if (participantCount >= params.maxParticipants) {
      throw new UnprocessableEntityException("세션 정원이 모두 찼습니다.");
    }

    return existingParticipant;
  }
}
