import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
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
