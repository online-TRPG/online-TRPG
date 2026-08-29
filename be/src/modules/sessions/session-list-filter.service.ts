import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  Prisma,
  RecruitmentStatus as PrismaRecruitmentStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { GmMode, ParticipantRole, SessionActivityStatus, SessionStatus } from "@trpg/shared-types";

type SessionListFilterParams = {
  query?: string;
  status?: SessionStatus;
  activityStatus?: SessionActivityStatus;
  gmMode?: GmMode;
  scenarioId?: string;
  ruleSetId?: string;
  role?: ParticipantRole;
};

const gmModeToPrisma: Record<GmMode, PrismaGmMode> = {
  [GmMode.AI]: PrismaGmMode.AI,
  [GmMode.HUMAN]: PrismaGmMode.HUMAN,
};

const sessionStatusToPrisma: Record<SessionStatus, PrismaSessionStatus> = {
  [SessionStatus.RECRUITING]: PrismaSessionStatus.RECRUITING,
  [SessionStatus.PLAYING]: PrismaSessionStatus.PLAYING,
  [SessionStatus.PAUSED]: PrismaSessionStatus.PAUSED,
  [SessionStatus.COMPLETED]: PrismaSessionStatus.COMPLETED,
  [SessionStatus.DISBANDED]: PrismaSessionStatus.DISBANDED,
};

const sessionActivityStatusToPrisma: Record<SessionActivityStatus, PrismaSessionActivityStatus> = {
  [SessionActivityStatus.DORMANT]: PrismaSessionActivityStatus.DORMANT,
  [SessionActivityStatus.LOBBY_OPEN]: PrismaSessionActivityStatus.LOBBY_OPEN,
  [SessionActivityStatus.PLAYING]: PrismaSessionActivityStatus.PLAYING,
  [SessionActivityStatus.COMPLETED]: PrismaSessionActivityStatus.COMPLETED,
  [SessionActivityStatus.DISBANDED]: PrismaSessionActivityStatus.DISBANDED,
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
    const query = params.query?.trim();
    return {
      visibility: PrismaSessionVisibility.PUBLIC,
      status: params.status
        ? sessionStatusToPrisma[params.status]
        : { notIn: [PrismaSessionStatus.COMPLETED, PrismaSessionStatus.DISBANDED] },
      recruitmentStatus: PrismaRecruitmentStatus.OPEN,
      activityStatus: params.activityStatus
        ? sessionActivityStatusToPrisma[params.activityStatus]
        : { notIn: [PrismaSessionActivityStatus.COMPLETED, PrismaSessionActivityStatus.DISBANDED] },
      gmMode: params.gmMode ? gmModeToPrisma[params.gmMode] : undefined,
      host: {
        is: {
          deletedAt: null,
        },
      },
      ruleSetId: params.ruleSetId,
      sessionScenarios: this.buildScenarioFilter(params.scenarioId),
      OR: this.buildTextSearch(query),
    };
  }

  buildMySessionsWhere(userId: string, params: SessionListFilterParams): Prisma.SessionWhereInput {
    const query = params.query?.trim();
    return {
      status: params.status ? sessionStatusToPrisma[params.status] : undefined,
      activityStatus: params.activityStatus ? sessionActivityStatusToPrisma[params.activityStatus] : undefined,
      gmMode: params.gmMode ? gmModeToPrisma[params.gmMode] : undefined,
      ruleSetId: params.ruleSetId,
      sessionScenarios: this.buildScenarioFilter(params.scenarioId),
      OR: this.buildTextSearch(query),
      participants: {
        some: {
          userId,
          status: PrismaParticipantStatus.JOINED,
          role: params.role ? participantRoleToPrisma[params.role] : undefined,
        },
      },
    };
  }

  private buildTextSearch(query?: string): Prisma.SessionWhereInput[] | undefined {
    if (!query) {
      return undefined;
    }

    return [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      {
        sessionScenarios: {
          some: {
            status: PrismaSessionScenarioStatus.ACTIVE,
            scenario: {
              title: { contains: query, mode: "insensitive" },
            },
          },
        },
      },
    ];
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
          some: {
            status: PrismaSessionScenarioStatus.ACTIVE,
          },
        };
  }
}
