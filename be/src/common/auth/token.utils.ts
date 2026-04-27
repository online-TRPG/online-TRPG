import { UnauthorizedException } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";

type TokenPayload = {
  sub: string;
  email?: string | null;
  type: "access" | "refresh";
  exp: number;
};

const accessTokenTtlSeconds = 60 * 60;
const refreshTokenTtlSeconds = 60 * 60 * 24 * 14;

function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || "dev-only-jwt-secret-change-me";
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string): string {
  return createHmac("sha256", getJwtSecret()).update(input).digest("base64url");
}

function createToken(payload: TokenPayload): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

export function createAccessToken(userId: string, email?: string | null): string {
  return createToken({
    sub: userId,
    email,
    type: "access",
    exp: Math.floor(Date.now() / 1000) + accessTokenTtlSeconds,
  });
}

export function createRefreshToken(userId: string, email?: string | null): string {
  return createToken({
    sub: userId,
    email,
    type: "refresh",
    exp: Math.floor(Date.now() / 1000) + refreshTokenTtlSeconds,
  });
}

export function verifyToken(token: string, expectedType: "access" | "refresh"): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new UnauthorizedException("토큰 형식이 올바르지 않습니다.");
  }

  const [header, body, signature] = parts;
  const expectedSignature = sign(`${header}.${body}`);
  if (signature !== expectedSignature) {
    throw new UnauthorizedException("토큰이 유효하지 않습니다.");
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    throw new UnauthorizedException("토큰이 유효하지 않습니다.");
  }
  if (payload.type !== expectedType) {
    throw new UnauthorizedException("토큰 타입이 올바르지 않습니다.");
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedException("토큰이 만료되었습니다.");
  }

  return payload;
}

export function getAccessTokenExpiresIn(): number {
  return accessTokenTtlSeconds;
}

export function getRefreshTokenExpiresAt(): Date {
  return new Date(Date.now() + refreshTokenTtlSeconds * 1000);
}

export function generateOpaqueState(): string {
  return randomBytes(16).toString("hex");
}
