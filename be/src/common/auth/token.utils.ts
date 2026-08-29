import { UnauthorizedException } from "@nestjs/common";
import { isNumber, isRecord, isString } from "@trpg/shared-types";
import { randomBytes, randomUUID } from "crypto";
import jwt, { type Jwt } from "jsonwebtoken";

export type TokenType = "access" | "refresh" | "reauth";

export type TokenPayload = {
  sub: string;
  email?: string | null;
  type: TokenType;
  provider?: "KAKAO" | "DISCORD";
  csrf?: string;
  ver: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
};

type TokenHeader = {
  alg: "HS256";
  typ: "JWT";
};

const accessTokenTtlSeconds = 60 * 10;
const refreshTokenTtlSeconds = 60 * 60 * 24 * 14;
const reauthTokenTtlSeconds = 60 * 5;
const minimumJwtSecretBytes = 32;
const jwtClockSkewSeconds = 60;
const defaultIssuer = "online-trpg-api";
const defaultAudience = "online-trpg-client";
let ephemeralDevelopmentSecret: string | undefined;

function tokenError(message = "토큰이 유효하지 않습니다."): UnauthorizedException {
  return new UnauthorizedException(message);
}

function getJwtIssuer(): string {
  return process.env.JWT_ISSUER?.trim() || defaultIssuer;
}

function getJwtAudience(): string {
  return process.env.JWT_AUDIENCE?.trim() || defaultAudience;
}

export function assertJwtConfiguration(): void {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  const configuredIssuer = process.env.JWT_ISSUER?.trim();
  const configuredAudience = process.env.JWT_AUDIENCE?.trim();
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be configured in production.");
    }
    return;
  }
  if (Buffer.byteLength(configuredSecret, "utf8") < minimumJwtSecretBytes) {
    throw new Error(`JWT_SECRET must be at least ${minimumJwtSecretBytes} bytes.`);
  }
  if (process.env.NODE_ENV === "production" && !configuredIssuer) {
    throw new Error("JWT_ISSUER must be configured in production.");
  }
  if (process.env.NODE_ENV === "production" && !configuredAudience) {
    throw new Error("JWT_AUDIENCE must be configured in production.");
  }
}

function getJwtSecret(): string {
  assertJwtConfiguration();
  const configuredSecret = process.env.JWT_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }
  ephemeralDevelopmentSecret ??= randomBytes(minimumJwtSecretBytes).toString("base64url");
  return ephemeralDevelopmentSecret;
}

function createToken(
  payload: Omit<TokenPayload, "iss" | "aud" | "iat" | "exp" | "jti">,
  ttlSeconds: number,
): string {
  const { sub, ...privateClaims } = payload;
  return jwt.sign(privateClaims, getJwtSecret(), {
    algorithm: "HS256",
    audience: getJwtAudience(),
    expiresIn: ttlSeconds,
    header: { alg: "HS256", typ: "JWT" },
    issuer: getJwtIssuer(),
    jwtid: randomUUID(),
    subject: sub,
  });
}

export function createAccessToken(
  userId: string,
  email?: string | null,
  tokenVersion = 0,
): string {
  return createToken(
    {
      sub: userId,
      email,
      type: "access",
      ver: tokenVersion,
    },
    accessTokenTtlSeconds,
  );
}

export function createRefreshToken(
  userId: string,
  email: string | null | undefined,
  csrfToken: string,
  tokenVersion = 0,
): string {
  return createToken(
    {
      sub: userId,
      email,
      type: "refresh",
      csrf: csrfToken,
      ver: tokenVersion,
    },
    refreshTokenTtlSeconds,
  );
}

export function createReauthToken(
  userId: string,
  provider: "KAKAO" | "DISCORD",
  tokenVersion = 0,
): string {
  return createToken(
    {
      sub: userId,
      type: "reauth",
      provider,
      ver: tokenVersion,
    },
    reauthTokenTtlSeconds,
  );
}

export function verifyToken(token: string, expectedType: TokenType): TokenPayload {
  let verified: Jwt;
  try {
    verified = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      audience: getJwtAudience(),
      complete: true,
      issuer: getJwtIssuer(),
    });
    decodeTokenHeader(verified.header);
  } catch {
    throw tokenError();
  }

  let payload: TokenPayload;
  try {
    payload = decodeTokenPayload(verified.payload);
  } catch {
    throw tokenError();
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.type !== expectedType) {
    throw tokenError("토큰 용도가 올바르지 않습니다.");
  }
  if (payload.iss !== getJwtIssuer() || payload.aud !== getJwtAudience()) {
    throw tokenError();
  }
  if (payload.iat > now + jwtClockSkewSeconds || payload.exp <= payload.iat || payload.exp <= now) {
    throw tokenError("토큰이 만료되었거나 발급 시간이 올바르지 않습니다.");
  }

  return payload;
}

export function getReauthTokenExpiresIn(): number {
  return reauthTokenTtlSeconds;
}

export function getAccessTokenExpiresIn(): number {
  return accessTokenTtlSeconds;
}

export function getRefreshTokenExpiresAt(): Date {
  return new Date(Date.now() + refreshTokenTtlSeconds * 1000);
}

export function getRefreshTokenExpiresInMs(): number {
  return refreshTokenTtlSeconds * 1000;
}

export function generateOpaqueState(): string {
  return randomBytes(16).toString("hex");
}

function decodeTokenHeader(value: unknown): TokenHeader {
  if (!isRecord(value) || value.alg !== "HS256" || value.typ !== "JWT") {
    throw tokenError();
  }
  return { alg: "HS256", typ: "JWT" };
}

function decodeTokenPayload(value: unknown): TokenPayload {
  if (!isRecord(value)) {
    throw tokenError();
  }
  if (!isString(value.sub) || !value.sub.trim()) {
    throw tokenError();
  }
  if (value.email !== undefined && value.email !== null && !isString(value.email)) {
    throw tokenError();
  }
  if (value.type !== "access" && value.type !== "refresh" && value.type !== "reauth") {
    throw tokenError();
  }
  if (
    value.provider !== undefined &&
    value.provider !== "KAKAO" &&
    value.provider !== "DISCORD"
  ) {
    throw tokenError();
  }
  if (value.csrf !== undefined && (!isString(value.csrf) || value.csrf.length < 32)) {
    throw tokenError();
  }
  if (value.type === "refresh" && !isString(value.csrf)) {
    throw tokenError();
  }
  if (value.type !== "refresh" && value.csrf !== undefined) {
    throw tokenError();
  }
  if (value.type === "reauth" && value.provider === undefined) {
    throw tokenError();
  }
  if (value.type !== "reauth" && value.provider !== undefined) {
    throw tokenError();
  }
  if (!isNumber(value.ver) || !Number.isInteger(value.ver) || value.ver < 0) {
    throw tokenError();
  }
  if (!isString(value.iss) || !value.iss || !isString(value.aud) || !value.aud) {
    throw tokenError();
  }
  if (
    !isNumber(value.iat) ||
    !Number.isInteger(value.iat) ||
    !isNumber(value.exp) ||
    !Number.isInteger(value.exp)
  ) {
    throw tokenError();
  }
  if (!isString(value.jti) || value.jti.length < 16) {
    throw tokenError();
  }
  return {
    sub: value.sub,
    email: value.email,
    type: value.type,
    provider: value.provider,
    csrf: value.csrf,
    ver: value.ver,
    iss: value.iss,
    aud: value.aud,
    iat: value.iat,
    exp: value.exp,
    jti: value.jti,
  };
}
