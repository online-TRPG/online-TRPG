import { UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import {
  assertJwtConfiguration,
  createAccessToken,
  createReauthToken,
  createRefreshToken,
  getAccessTokenExpiresIn,
  verifyToken,
} from "./token.utils";

describe("token utils", () => {
  const originalEnv = { ...process.env };
  const testSecret = "test-only-secret-with-at-least-thirty-two-bytes";

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      JWT_SECRET: testSecret,
      JWT_ISSUER: "test-issuer",
      JWT_AUDIENCE: "test-audience",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("issues a ten-minute access token with bounded standard and purpose claims", () => {
    const before = Math.floor(Date.now() / 1000);
    const payload = verifyToken(createAccessToken("user-1", "user@example.com", 4), "access");

    expect(getAccessTokenExpiresIn()).toBe(600);
    expect(payload).toMatchObject({
      sub: "user-1",
      email: "user@example.com",
      type: "access",
      ver: 4,
      iss: "test-issuer",
      aud: "test-audience",
    });
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp - payload.iat).toBe(600);
    expect(payload.jti).toHaveLength(36);
  });

  it("does not allow tokens to be used for a different purpose", () => {
    const csrf = "a".repeat(43);
    expect(() => verifyToken(createRefreshToken("user-1", null, csrf), "access")).toThrow(
      UnauthorizedException,
    );
    expect(() => verifyToken(createReauthToken("user-1", "KAKAO"), "refresh")).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a token after the configured issuer changes", () => {
    const token = createAccessToken("user-1");
    process.env.JWT_ISSUER = "different-issuer";

    expect(() => verifyToken(token, "access")).toThrow(UnauthorizedException);
  });

  it("rejects tampered and unsigned tokens", () => {
    const signedToken = createAccessToken("user-1");
    const tamperedToken = `${signedToken.slice(0, signedToken.lastIndexOf("."))}.invalid`;
    const unsignedHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    );
    const unsignedPayload = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        type: "access",
        ver: 0,
        iss: "test-issuer",
        aud: "test-audience",
        iat: 1,
        exp: 4_102_444_800,
        jti: "unsigned-token-id",
      }),
    ).toString("base64url");

    expect(() => verifyToken(tamperedToken, "access")).toThrow(UnauthorizedException);
    expect(() => verifyToken(`${unsignedHeader}.${unsignedPayload}.`, "access")).toThrow(
      UnauthorizedException,
    );
  });

  it("requires the JWT media type in the protected header", () => {
    const token = jwt.sign({ type: "access", ver: 0 }, testSecret, {
      algorithm: "HS256",
      audience: "test-audience",
      expiresIn: 600,
      header: { alg: "HS256", typ: "JOSE" },
      issuer: "test-issuer",
      jwtid: "non-jwt-media-type-id",
      subject: "user-1",
    });

    expect(() => verifyToken(token, "access")).toThrow(UnauthorizedException);
  });

  it("rejects an access token immediately after its ten-minute lifetime", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-12T00:00:00.000Z"));
    const token = createAccessToken("user-1");
    jest.setSystemTime(new Date("2026-08-12T00:10:01.000Z"));

    expect(() => verifyToken(token, "access")).toThrow(UnauthorizedException);
  });

  it("fails closed for a missing or weak production secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => assertJwtConfiguration()).toThrow("JWT_SECRET must be configured");

    process.env.JWT_SECRET = "too-short";
    expect(() => assertJwtConfiguration()).toThrow("at least 32 bytes");
  });

  it("requires explicit issuer and audience values in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = testSecret;
    delete process.env.JWT_ISSUER;
    expect(() => assertJwtConfiguration()).toThrow("JWT_ISSUER");

    process.env.JWT_ISSUER = "test-issuer";
    delete process.env.JWT_AUDIENCE;
    expect(() => assertJwtConfiguration()).toThrow("JWT_AUDIENCE");
  });
});
