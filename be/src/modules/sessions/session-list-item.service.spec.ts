import {
  AuthProvider as PrismaAuthProvider,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioSourceType as PrismaScenarioSourceType,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
  UserRole as PrismaUserRole,
} from "@prisma/client";
import { ParticipantRole } from "@trpg/shared-types";
import { SessionListItemService } from "./session-list-item.service";

describe("SessionListItemService", () => {
  const now = new Date("2026-07-02T00:00:00.000Z");
  const service = new SessionListItemService();

  function createSession(overrides: Record<string, unknown> = {}) {
    return {
      id: "session-1",
      publicId: "12345678",
      title: "Storm Keep",
      description: "A public table",
      hostUserId: "host-user",
      captainUserId: null,
      gmUserId: null,
      gmMode: PrismaGmMode.AI,
      inviteCode: "ABC123",
      status: PrismaSessionStatus.RECRUITING,
      visibility: PrismaSessionVisibility.PUBLIC,
      maxParticipants: 4,
      ruleSetId: "dnd5e",
      nextSessionAt: null,
      createdAt: now,
      updatedAt: now,
      host: {
        id: "host-user",
        publicId: "host-public",
        email: "host@example.com",
        passwordHash: null,
        displayName: "Host",
        authProvider: PrismaAuthProvider.LOCAL,
        role: PrismaUserRole.USER,
        profileImageUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      participants: [
        {
          id: "participant-host",
          sessionId: "session-1",
          userId: "host-user",
          role: PrismaParticipantRole.HOST,
          status: PrismaParticipantStatus.JOINED,
          connectionStatus: "ONLINE",
          isReady: true,
          readyAt: now,
          joinedAt: now,
          leftAt: null,
        },
        {
          id: "participant-player",
          sessionId: "session-1",
          userId: "player-user",
          role: PrismaParticipantRole.PLAYER,
          status: PrismaParticipantStatus.JOINED,
          connectionStatus: "ONLINE",
          isReady: false,
          readyAt: null,
          joinedAt: now,
          leftAt: null,
        },
      ],
      sessionScenarios: [
        {
          id: "session-scenario-planned",
          sessionId: "session-1",
          scenarioId: "scenario-planned",
          sequence: 1,
          status: PrismaSessionScenarioStatus.PLANNED,
          startedAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          gameState: null,
          scenario: createScenario("scenario-planned", "Planned Arc", 1),
        },
        {
          id: "session-scenario-active",
          sessionId: "session-1",
          scenarioId: "scenario-active",
          sequence: 2,
          status: PrismaSessionScenarioStatus.ACTIVE,
          startedAt: now,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          gameState: {
            sessionScenarioId: "session-scenario-active",
            version: 3,
            currentNodeId: "node-1",
            phase: PrismaGamePhase.EXPLORATION,
            flagsJson: "{}",
            createdAt: now,
            updatedAt: now,
          },
          scenario: createScenario("scenario-active", "Active Arc", 3),
        },
      ],
      ...overrides,
    };
  }

  function createScenario(id: string, title: string, startLevel: number) {
    return {
      id,
      title,
      description: null,
      thumbnailUrl: null,
      ruleSetId: "dnd5e",
      difficulty: null,
      startLevel,
      recommendedEndLevel: null,
      license: PrismaScenarioLicense.CC_BY_4_0,
      sourceType: PrismaScenarioSourceType.USER,
      attribution: null,
      startNodeId: "node-1",
      baseScenarioId: null,
      createdByUserId: "host-user",
      createdAt: now,
      updatedAt: now,
    };
  }

  it("builds a list item from the active scenario and joined participants", () => {
    const result = service.build(createSession() as never, "player-user");

    expect(result).toMatchObject({
      session: {
        id: "session-1",
        publicId: "12345678",
        scenarioId: "scenario-active",
        currentNodeId: "node-1",
      },
      scenario: {
        id: "scenario-active",
        title: "Active Arc",
        startLevel: 3,
      },
      host: {
        id: "host-user",
        displayName: "Host",
      },
      owner: {
        id: "host-user",
      },
      participantCount: 2,
      availableSlots: 2,
      role: ParticipantRole.PLAYER,
    });
  });

  it("falls back to the first scenario and omits role for anonymous viewers", () => {
    const result = service.build(
      createSession({
        sessionScenarios: [
          {
            id: "session-scenario-planned",
            sessionId: "session-1",
            scenarioId: "scenario-planned",
            sequence: 1,
            status: PrismaSessionScenarioStatus.PLANNED,
            startedAt: null,
            endedAt: null,
            createdAt: now,
            updatedAt: now,
            gameState: null,
            scenario: createScenario("scenario-planned", "Planned Arc", 1),
          },
        ],
      }) as never,
    );

    expect(result).toMatchObject({
      session: {
        scenarioId: "scenario-planned",
      },
      scenario: {
        id: "scenario-planned",
      },
    });
    expect(result?.role).toBeUndefined();
  });

  it("drops sessions that do not have a scenario for card assembly", () => {
    const result = service.buildMany([
      createSession({ id: "session-without-scenario", sessionScenarios: [] }) as never,
      createSession() as never,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].session.id).toBe("session-1");
  });
});
