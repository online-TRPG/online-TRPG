import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { AuthProvider } from "@prisma/client";
import { createHash } from "crypto";
import { OAuthTransactionService } from "./oauth-transaction.service";

function createService() {
  const prisma = {
    oAuthTransaction: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return { prisma, service: new OAuthTransactionService(prisma as never) };
}

describe("OAuthTransactionService", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRedirectUris = process.env.OAUTH_REDIRECT_URIS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OAUTH_REDIRECT_URIS = originalRedirectUris;
    jest.restoreAllMocks();
  });

  it("stores a hash of state and creates an S256 PKCE challenge", async () => {
    process.env.NODE_ENV = "production";
    process.env.OAUTH_REDIRECT_URIS = "https://app.example.com/oauth/callback";
    const { prisma, service } = createService();

    const result = await service.begin({
      provider: "KAKAO",
      intent: "login",
      redirectUri: "https://app.example.com/oauth/callback",
    });

    const created = prisma.oAuthTransaction.create.mock.calls[0][0].data;
    expect(created.stateHash).toBe(createHash("sha256").update(result.state).digest("hex"));
    expect(created.stateHash).not.toBe(result.state);
    expect(result.codeChallenge).toBe(
      createHash("sha256").update(created.codeVerifier).digest("base64url"),
    );
  });

  it("fails closed in production when the redirect allowlist is absent", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.OAUTH_REDIRECT_URIS;
    const { service } = createService();

    await expect(service.begin({
      provider: "DISCORD",
      intent: "login",
      redirectUri: "https://app.example.com/oauth/callback",
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects redirect URI prefix and userinfo bypasses", async () => {
    process.env.OAUTH_REDIRECT_URIS = "https://app.example.com/oauth/callback";
    const { service } = createService();

    await expect(service.begin({
      provider: "KAKAO",
      intent: "login",
      redirectUri: "https://app.example.com/oauth/callback.evil.example",
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.begin({
      provider: "KAKAO",
      intent: "login",
      redirectUri: "https://app.example.com@evil.example/oauth/callback",
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("consumes a matching transaction exactly once", async () => {
    process.env.OAUTH_REDIRECT_URIS = "https://app.example.com/oauth/callback";
    const { prisma, service } = createService();
    const state = "one-time-state";
    prisma.oAuthTransaction.findUnique
      .mockResolvedValueOnce({
        id: "oauth-1",
        stateHash: createHash("sha256").update(state).digest("hex"),
        provider: AuthProvider.KAKAO,
        intent: "reauth",
        redirectUri: "https://app.example.com/oauth/callback",
        codeVerifier: "verifier",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce(null);
    prisma.oAuthTransaction.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.consume({
      provider: "KAKAO",
      intent: "reauth",
      state,
      redirectUri: "https://app.example.com/oauth/callback",
      userId: "user-1",
    })).resolves.toEqual({ redirectUri: "https://app.example.com/oauth/callback", codeVerifier: "verifier" });
    await expect(service.consume({
      provider: "KAKAO",
      intent: "reauth",
      state,
      redirectUri: "https://app.example.com/oauth/callback",
      userId: "user-1",
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
