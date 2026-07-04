import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  Prisma,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { ParticipantRole, SessionStatus } from "@trpg/shared-types";

type SessionListFilterParams = {
  status?: SessionStatus;
  scenarioId?: string;
  ruleSetId?: string;
  role?: ParticipantRole;
};

const sessionStatusToPrisma: Record<SessionStatus, PrismaSessionStatus> = {
  [SessionStatus.RECRUITING]: PrismaSessionStatus.RECRUITING,
  [SessionStatus.PLAYING]: PrismaSessionStatus.PLAYING,
  [SessionStatus.PAUSED]: PrismaSessionStatus.PAUSED,
  [SessionStatus.COMPLETED]: PrismaSessionStatus.COMPLETED,
  [SessionStatus.DISBANDED]: PrismaSessionStatus.DISBANDED,
};

const participantRoleToPrisma: Record<ParticipantRole, PrismaParticipantRole> = {
  [ParticipantRole.HOST]: PrismaParticipantRole.HOST,
  [ParticipantRole.GM]: PrismaParticipantRole.GM,
  [ParticipantRole.PLAYER]: PrismaParticipantRole.PLAYER,
  [ParticipantRole.SPECTATOR]: PrismaParticipantRole.SPECTATOR,
};

@Injectable()
export class SessionListFilterService {
  buildAvailableWhere(params: SessionListFilterParams): Prisma.SessionWhereInput {
    return {
      visibility: PrismaSessionVisibility.PUBLIC,
      status: params.status ? sessionStatusToPrisma[params.status] : PrismaSessionStatus.RECRUITING,
      host: {
        is: {
          deletedAt: null,
        },
      },
      ruleSetId: params.ruleSetId,
      sessionScenarios: this.buildScenarioFilter(params.scenarioId),
    };
  }

  buildMySessionsWhere(userId: string, params: SessionListFilterParams): Prisma.SessionWhereInput {
    return {
      status: params.status ? sessionStatusToPrisma[params.status] : undefined,
      ruleSetId: params.ruleSetId,
      sessionScenarios: this.buildScenarioFilter(params.scenarioId),
      participants: {
        some: {
          userId,
          status: PrismaParticipantStatus.JOINED,
          role: params.role ? participantRoleToPrisma[params.role] : undefined,
        },
      },
    };
  }

  private buildScenarioFilter(scenarioId?: string): Prisma.SessionScenarioListRelationFilter {
    return scenarioId
      ? {
          some: {
            scenarioId,
            status: PrismaSessionScenarioStatus.ACTIVE,
          },
        }
      : {
          some: {},
        };
  }
}
