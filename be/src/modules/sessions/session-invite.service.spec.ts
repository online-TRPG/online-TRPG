import { ConflictException, NotFoundException } from "@nestjs/common";
import { SessionInviteService } from "./session-invite.service";

describe("SessionInviteService", () => {
  const prisma = {
    session: {
      findUnique: jest.fn(),
    },
  };
  const service = new SessionInviteService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates an unused invite code", async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(service.generateCode()).resolves.toMatch(/^[A-Z0-9]{6}$/);
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { inviteCode: expect.stringMatching(/^[A-Z0-9]{6}$/) },
    });
  });

  it("fails when invite code allocation keeps colliding", async () => {
    prisma.session.findUnique.mockResolvedValue({ id: "existing-session" });

    await expect(service.generateCode()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(10);
  });

  it("normalizes invite code input before lookup", async () => {
    prisma.session.findUnique.mockResolvedValue({ id: "session-1", inviteCode: "ABC123" });

    await expect(service.getSessionByCode(" abc123 ")).resolves.toMatchObject({
      id: "session-1",
    });
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { inviteCode: "ABC123" },
    });
  });

  it("rejects unknown invite codes", async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(service.getSessionByCode("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("builds invite info with an optional share url", () => {
    expect(
      service.buildInviteInfo({
        sessionId: "session-1",
        inviteCode: "ABC123",
        appBaseUrl: " https://app.example.com ",
      }),
    ).toEqual({
      sessionId: "session-1",
      inviteCode: "ABC123",
      shareUrl: "https://app.example.com/join/ABC123",
    });
    expect(
      service.buildInviteInfo({
        sessionId: "session-1",
        inviteCode: "ABC123",
        appBaseUrl: " ",
      }),
    ).toEqual({
      sessionId: "session-1",
      inviteCode: "ABC123",
      shareUrl: null,
    });
  });
});
