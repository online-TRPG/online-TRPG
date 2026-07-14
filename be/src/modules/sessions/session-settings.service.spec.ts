import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionVisibility as PrismaSessionVisibility,
} from "@prisma/client";
import { GmMode, SessionVisibility } from "@trpg/shared-types";
import { SessionSettingsService } from "./session-settings.service";

describe("SessionSettingsService", () => {
  const service = new SessionSettingsService();

  it("resolves explicit visibility before legacy boolean flags", () => {
    expect(
      service.resolveVisibility({
        visibility: SessionVisibility.PRIVATE,
        isPublic: true,
      }),
    ).toBe(PrismaSessionVisibility.PRIVATE);
    expect(
      service.resolveVisibility({
        visibility: SessionVisibility.PUBLIC,
        isPrivate: true,
      }),
    ).toBe(PrismaSessionVisibility.PUBLIC);
  });

  it("resolves legacy private/public flags when explicit visibility is absent", () => {
    expect(service.resolveVisibility({ isPrivate: true })).toBe(PrismaSessionVisibility.PRIVATE);
    expect(service.resolveVisibility({ isPrivate: false })).toBe(PrismaSessionVisibility.PUBLIC);
    expect(service.resolveVisibility({ isPublic: true })).toBe(PrismaSessionVisibility.PUBLIC);
    expect(service.resolveVisibility({ isPublic: false })).toBe(PrismaSessionVisibility.PRIVATE);
  });

  it("uses fallback or public visibility when no input is provided", () => {
    expect(
      service.resolveVisibility({
        fallback: PrismaSessionVisibility.PRIVATE,
      }),
    ).toBe(PrismaSessionVisibility.PRIVATE);
    expect(service.resolveVisibility({})).toBe(PrismaSessionVisibility.PUBLIC);
  });

  it("maps API GM mode to Prisma GM mode", () => {
    expect(service.resolveGmMode(GmMode.AI)).toBe(PrismaGmMode.AI);
    expect(service.resolveGmMode(GmMode.HUMAN)).toBe(PrismaGmMode.HUMAN);
  });

  it("derives the session manager role and GM user from GM mode", () => {
    expect(service.resolveManagerParticipantRole(PrismaGmMode.HUMAN)).toBe(PrismaParticipantRole.GM);
    expect(service.resolveGmUserId(PrismaGmMode.HUMAN, "manager-user")).toBe("manager-user");

    expect(service.resolveManagerParticipantRole(PrismaGmMode.AI)).toBe(PrismaParticipantRole.HOST);
    expect(service.resolveGmUserId(PrismaGmMode.AI, "manager-user")).toBeNull();
  });
});
