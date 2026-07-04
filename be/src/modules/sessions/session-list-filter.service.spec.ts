import {
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { ParticipantRole, SessionStatus } from "@trpg/shared-types";
import { SessionListFilterService } from "./session-list-filter.service";

describe("SessionListFilterService", () => {
  const service = new SessionListFilterService();

  it("builds public recruiting filters by default", () => {
    expect(service.buildAvailableWhere({})).toEqual({
      visibility: PrismaSessionVisibility.PUBLIC,
      status: PrismaSessionStatus.RECRUITING,
      host: {
        is: {
          deletedAt: null,
        },
      },
      ruleSetId: undefined,
      sessionScenarios: {
        some: {},
      },
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
      ruleSetId: undefined,
      sessionScenarios: {
        some: {},
      },
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
