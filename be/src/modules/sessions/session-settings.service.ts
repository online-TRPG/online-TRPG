import { Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { GmMode, SessionVisibility } from "@trpg/shared-types";

@Injectable()
export class SessionSettingsService {
  resolveVisibility(params: {
    visibility?: SessionVisibility;
    isPrivate?: boolean;
    isPublic?: boolean;
    fallback?: PrismaSessionVisibility;
  }): PrismaSessionVisibility {
    if (params.visibility) {
      return params.visibility === SessionVisibility.PRIVATE
        ? PrismaSessionVisibility.PRIVATE
        : PrismaSessionVisibility.PUBLIC;
    }

    if (params.isPrivate !== undefined) {
      return params.isPrivate ? PrismaSessionVisibility.PRIVATE : PrismaSessionVisibility.PUBLIC;
    }

    if (params.isPublic !== undefined) {
      return params.isPublic ? PrismaSessionVisibility.PUBLIC : PrismaSessionVisibility.PRIVATE;
    }

    return params.fallback ?? PrismaSessionVisibility.PUBLIC;
  }

  resolveGmMode(gmMode: GmMode): PrismaGmMode {
    return gmMode === GmMode.HUMAN ? PrismaGmMode.HUMAN : PrismaGmMode.AI;
  }

  resolveManagerParticipantRole(gmMode: PrismaGmMode): PrismaParticipantRole {
    return gmMode === PrismaGmMode.HUMAN
      ? PrismaParticipantRole.GM
      : PrismaParticipantRole.HOST;
  }

  resolveGmUserId(gmMode: PrismaGmMode, managerUserId: string): string | null {
    return gmMode === PrismaGmMode.HUMAN ? managerUserId : null;
  }
}
