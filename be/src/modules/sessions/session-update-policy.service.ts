import { ConflictException, Injectable } from "@nestjs/common";
import {
  ParticipantStatus as PrismaParticipantStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionUpdatePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCanUpdate(params: {
    sessionId: string;
    activityStatus: PrismaSessionActivityStatus;
    nextMaxParticipants?: number;
    captainUserId?: string | null;
  }): Promise<void> {
    if (
      params.activityStatus !== PrismaSessionActivityStatus.DORMANT &&
      params.activityStatus !== PrismaSessionActivityStatus.LOBBY_OPEN
    ) {
      throw new ConflictException("방 설정은 대기 중이거나 입장 가능 상태에서만 변경할 수 있습니다.");
    }

    if (params.nextMaxParticipants !== undefined) {
      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: params.sessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (params.nextMaxParticipants < participantCount) {
        throw new ConflictException("총 인원은 현재 참가 인원보다 작게 설정할 수 없습니다.");
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
        throw new ConflictException("반장은 현재 세션 구성원 중에서 선택해주세요.");
      }
    }
  }
}
