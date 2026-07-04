import { ForbiddenException, Injectable } from "@nestjs/common";
import { GmMode as PrismaGmMode } from "@prisma/client";

type SessionAccessSource = {
  hostUserId: string;
  gmMode: PrismaGmMode;
  gmUserId?: string | null;
};

@Injectable()
export class SessionAccessPolicyService {
  ensureHost(userId: string, hostUserId: string): void {
    if (userId !== hostUserId) {
      throw new ForbiddenException("Only the session host can perform this action.");
    }
  }

  ensureGmRuntimeOperator(userId: string, session: SessionAccessSource): void {
    if (!this.canUseGmRuntimeControls(userId, session)) {
      throw new ForbiddenException("GM 권한이 필요합니다.");
    }
  }

  canUseGmRuntimeControls(userId: string, session: SessionAccessSource): boolean {
    if (session.gmMode === PrismaGmMode.HUMAN) {
      return (session.gmUserId ?? session.hostUserId) === userId;
    }
    return session.hostUserId === userId;
  }

  canSeeGmOnlyRuntimeData(userId: string, session: SessionAccessSource): boolean {
    return session.gmMode === PrismaGmMode.HUMAN && (session.gmUserId ?? session.hostUserId) === userId;
  }
}
