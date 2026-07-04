import { Injectable } from "@nestjs/common";
import { ParticipantRole as PrismaParticipantRole } from "@prisma/client";

export type SessionLeaveResolutionParticipant = {
  userId: string;
  role: PrismaParticipantRole;
};

export type SessionLeaveResolution = {
  shouldDisband: boolean;
  shouldClearGmUser: boolean;
  nextHostUserId: string | null;
  nextHostRole: PrismaParticipantRole | null;
  canEmitSnapshot: boolean;
};

@Injectable()
export class SessionLeaveResolutionService {
  resolve(params: {
    leavingUserId: string;
    sessionHostUserId: string;
    sessionGmUserId?: string | null;
    remainingParticipants: SessionLeaveResolutionParticipant[];
  }): SessionLeaveResolution {
    if (!params.remainingParticipants.length) {
      return {
        shouldDisband: true,
        shouldClearGmUser: false,
        nextHostUserId: null,
        nextHostRole: null,
        canEmitSnapshot: false,
      };
    }

    const nextHost = params.sessionHostUserId === params.leavingUserId
      ? params.remainingParticipants[0]
      : null;

    return {
      shouldDisband: false,
      shouldClearGmUser: params.sessionGmUserId === params.leavingUserId,
      nextHostUserId: nextHost?.userId ?? null,
      nextHostRole: nextHost
        ? params.sessionGmUserId === nextHost.userId
          ? PrismaParticipantRole.GM
          : PrismaParticipantRole.HOST
        : null,
      canEmitSnapshot: true,
    };
  }
}
