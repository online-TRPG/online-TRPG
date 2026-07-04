import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { SessionStartPolicyService } from "./session-start-policy.service";

describe("SessionStartPolicyService", () => {
  const campaignArchiveRuntime = {
    ensureCharacterMatchesScenarioLevel: jest.fn(),
  };
  const service = new SessionStartPolicyService(campaignArchiveRuntime as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createSession(overrides: Record<string, unknown> = {}) {
    return {
      status: PrismaSessionStatus.RECRUITING,
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
      gmUserId: null,
      ...overrides,
    };
  }

  function createPlayer(overrides: Record<string, unknown> = {}) {
    return {
      userId: "player-user",
      role: PrismaParticipantRole.PLAYER,
      isReady: true,
      sessionCharacter: {
        character: {
          name: "Mira",
          level: 3,
        },
      },
      ...overrides,
    };
  }

  const scenario = {
    title: "Storm Keep",
    startLevel: 3,
    recommendedEndLevel: 5,
  };

  it("accepts a ready player with a scenario-matching character", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [createPlayer() as never],
        scenario,
      }),
    ).not.toThrow();
    expect(campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel).toHaveBeenCalledWith({
      characterName: "Mira",
      characterLevel: 3,
      scenario,
    });
  });

  it("rejects non-recruiting sessions", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession({ status: PrismaSessionStatus.PLAYING }) as never,
        participants: [createPlayer() as never],
        scenario,
      }),
    ).toThrow(ConflictException);
  });

  it("requires at least one joined participant and one player", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [],
        scenario,
      }),
    ).toThrow("At least one participant is required to start the session.");

    expect(() =>
      service.ensureCanStart({
        session: createSession({ gmMode: PrismaGmMode.HUMAN, gmUserId: "gm-user" }) as never,
        participants: [
          {
            userId: "gm-user",
            role: PrismaParticipantRole.GM,
            isReady: true,
            sessionCharacter: null,
          },
        ],
        scenario,
      }),
    ).toThrow("At least one player is required to start the session.");
  });

  it("requires a joined GM participant for human GM sessions", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession({ gmMode: PrismaGmMode.HUMAN, gmUserId: "gm-user" }) as never,
        participants: [createPlayer() as never],
        scenario,
      }),
    ).toThrow("A HUMAN GM session requires a joined GM participant.");
  });

  it("requires player characters and ready state", () => {
    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [createPlayer({ sessionCharacter: null }) as never],
        scenario,
      }),
    ).toThrow("All players must select a character before the session starts.");

    expect(() =>
      service.ensureCanStart({
        session: createSession() as never,
        participants: [createPlayer({ isReady: false }) as never],
        scenario,
      }),
    ).toThrow("All players must be ready before the session starts.");
  });
});
