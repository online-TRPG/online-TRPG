import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { SessionStartPolicyService } from "./session-start-policy.service";

describe("SessionStartPolicyService", () => {
  const service = new SessionStartPolicyService();

  function createSession(overrides: Record<string, unknown> = {}) {
    return {
      status: PrismaSessionStatus.RECRUITING,
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
      gmUserId: null,
      ...overrides,
    };
  }

  const scenario = {
    title: "Storm Keep",
    startLevel: 3,
    recommendedEndLevel: 5,
  };

  it("rejects a joined player without a session character", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [
          {
            userId: "player-user",
            role: PrismaParticipantRole.PLAYER,
            isReady: false,
            sessionCharacter: null,
          },
        ],
        scenario,
      }),
    ).toThrow("SESSION_CHARACTER_ASSIGNMENT_REQUIRED");
  });

  it("rejects an AI host without a session character", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [
          {
            userId: "host-user",
            role: PrismaParticipantRole.HOST,
            isReady: true,
            sessionCharacter: null,
          },
        ],
        scenario,
      }),
    ).toThrow("SESSION_CHARACTER_ASSIGNMENT_REQUIRED");
  });

  it("allows an AI host after assigning its session character", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [
          {
            userId: "host-user",
            role: PrismaParticipantRole.HOST,
            isReady: true,
            sessionCharacter: {
              id: "session-character-host",
              status: PrismaSessionCharacterStatus.ACTIVE,
              character: { name: "마우가", level: 1 },
            },
          },
        ],
        scenario,
      }),
    ).not.toThrow();
  });

  it.each([
    PrismaSessionCharacterStatus.DEAD,
    PrismaSessionCharacterStatus.LEFT,
  ])("rejects an AI host whose session character is %s", (status) => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [
          {
            userId: "host-user",
            role: PrismaParticipantRole.HOST,
            isReady: true,
            sessionCharacter: {
              id: "session-character-host",
              status,
              character: { name: "Retired Hero", level: 3 },
            },
          },
        ],
        scenario,
      }),
    ).toThrow("SESSION_CHARACTER_ASSIGNMENT_REQUIRED");
  });

  it("leaves participant readiness to the host after character selection", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [
          {
            userId: "player-user",
            role: PrismaParticipantRole.PLAYER,
            isReady: false,
            sessionCharacter: {
              id: "session-character-player",
              status: PrismaSessionCharacterStatus.ACTIVE,
              character: { name: "Ari", level: 3 },
            },
          },
        ],
        scenario,
      }),
    ).not.toThrow();
  });

  it("allows a human GM to start without platform-enforced party composition", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession({ gmMode: PrismaGmMode.HUMAN, gmUserId: "gm-user" }) as never,
        participants: [],
        scenario,
      }),
    ).not.toThrow();
  });

  it("rejects start when an active AI host character has no visible player token", () => {
    expect(() =>
      service.ensurePlayerTokensCreated({
        session: createSession() as never,
        participants: [
          {
            userId: "host-user",
            role: PrismaParticipantRole.HOST,
            isReady: true,
            sessionCharacter: {
              id: "session-character-host",
              status: PrismaSessionCharacterStatus.ACTIVE,
              character: { name: "Ranger A", level: 1 },
            },
          },
        ],
        tokens: [],
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: "SESSION_CHARACTER_TOKEN_REQUIRED",
          missingSessionCharacterIds: ["session-character-host"],
        }),
      }),
    );
  });

  it("accepts start after every active player-controlled character gets a token", () => {
    expect(() =>
      service.ensurePlayerTokensCreated({
        session: createSession() as never,
        participants: [
          {
            userId: "host-user",
            role: PrismaParticipantRole.HOST,
            isReady: true,
            sessionCharacter: {
              id: "session-character-host",
              status: PrismaSessionCharacterStatus.ACTIVE,
              character: { name: "Ranger A", level: 1 },
            },
          },
        ],
        tokens: [
          {
            sessionCharacterId: "session-character-host",
            hidden: false,
            isHostile: false,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a session that is no longer in the startable legacy state", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession({ status: PrismaSessionStatus.PLAYING }) as never,
        participants: [],
        scenario,
      }),
    ).toThrow(ConflictException);
  });
});
