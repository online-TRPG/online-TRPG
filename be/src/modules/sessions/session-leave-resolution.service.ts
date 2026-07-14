import { Injectable } from "@nestjs/common";
export type SessionLeaveResolutionParticipant = {
  userId: string;
};

export type SessionLeaveResolution = {
  shouldDisband: boolean;
  canEmitSnapshot: boolean;
};

@Injectable()
export class SessionLeaveResolutionService {
  resolve(params: {
    leavingUserId: string;
    sessionHostUserId: string;
    remainingParticipants: SessionLeaveResolutionParticipant[];
  }): SessionLeaveResolution {
    if (
      params.leavingUserId === params.sessionHostUserId ||
      !params.remainingParticipants.length
    ) {
      return {
        shouldDisband: true,
        canEmitSnapshot: false,
      };
    }

    return {
      shouldDisband: false,
      canEmitSnapshot: true,
    };
  }
}
