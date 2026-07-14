import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  GmMode as PrismaGmMode,
  RecruitmentStatus as PrismaRecruitmentStatus,
  SessionActivityStatus as PrismaSessionActivityStatus,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { GmMode, ParticipantRole, SessionStatus } from "@trpg/shared-types";
import { SessionListFilterService } from "./session-list-filter.service";

describe("SessionListFilterService", () => {
  const service = new SessionListFilterService();

  it("builds public recruiting filters by default", () => {
    expect(service.buildAvailableWhere({})).toEqual({
      visibility: PrismaSessionVisibility.PUBLIC,
      status: {
        notIn: [PrismaSessionStatus.COMPLETED, PrismaSessionStatus.DISBANDED],
      },
      recruitmentStatus: PrismaRecruitmentStatus.OPEN,
      activityStatus: {
        notIn: [PrismaSessionActivityStatus.COMPLETED, PrismaSessionActivityStatus.DISBANDED],
      },
      gmMode: undefined,
      host: {
        is: {
          deletedAt: null,
        },
      },
      ruleSetId: undefined,
      sessionScenarios: {
        some: {
          status: PrismaSessionScenarioStatus.ACTIVE,
        },
      },
      OR: undefined,
    });
  });

  it("builds text and GM filters without exposing private sessions", () => {
    expect(
      service.buildAvailableWhere({
        query: "용의 둥지",
        gmMode: GmMode.HUMAN,
      }),
    ).toMatchObject({
      visibility: PrismaSessionVisibility.PUBLIC,
      gmMode: PrismaGmMode.HUMAN,
      OR: expect.arrayContaining([
        { title: { contains: "용의 둥지", mode: "insensitive" } },
        { description: { contains: "용의 둥지", mode: "insensitive" } },
      ]),
    });
  });

  it("builds available session filters with status, ruleset, and active scenario", () => {
    expect(
      service.buildAvailableWhere({
        status: SessionStatus.PLAYING,
        ruleSetId: "dnd5e",
        scenarioId: "scenario-1",
      }),
    ).toMatchObject({
      status: PrismaSessionStatus.PLAYING,
      ruleSetId: "dnd5e",
      sessionScenarios: {
        some: {
          scenarioId: "scenario-1",
          status: PrismaSessionScenarioStatus.ACTIVE,
        },
      },
    });
  });

  it("builds my session filters with joined participant and optional role", () => {
    expect(
      service.buildMySessionsWhere("user-1", {
        status: SessionStatus.PAUSED,
        role: ParticipantRole.GM,
      }),
    ).toEqual({
      status: PrismaSessionStatus.PAUSED,
      activityStatus: undefined,
      gmMode: undefined,
      ruleSetId: undefined,
      sessionScenarios: {
        some: {
          status: PrismaSessionScenarioStatus.ACTIVE,
        },
      },
      OR: undefined,
      participants: {
        some: {
          userId: "user-1",
          status: PrismaParticipantStatus.JOINED,
          role: PrismaParticipantRole.GM,
        },
      },
    });
  });
});
