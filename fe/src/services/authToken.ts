import type { AuthTokenResponseDto, LoginResponseDto } from "@trpg/shared-types";
import {
  decodeAuthTokenResponse,
  decodeLoginResponse,
  isRecord,
  parseJsonWithDecoder,
} from "@trpg/shared-types/frontend";

interface JwtPayload {
  sub: string;
  type: "access";
  exp: number;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return globalThis.atob(padded);
}

export function getAccessTokenExpiresAtMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, body] = parts;
  if (!body) return null;

  try {
    const payload = parseJsonWithDecoder(decodeBase64Url(body), decodeJwtPayload, "access token payload");
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(token: string, nowMs = Date.now()): boolean {
  const expiresAtMs = getAccessTokenExpiresAtMs(token);
  // 형식이 틀린 토큰은 저장소 복원 단계에서 제거하고, 여기서는 명확히 만료된 토큰만 판정한다.
  return expiresAtMs !== null && expiresAtMs <= nowMs;
}

export function decodeValidatedAuthTokenResponse(value: unknown): AuthTokenResponseDto {
  const response = decodeAuthTokenResponse(value);
  assertUsableAccessToken(response.accessToken);
  return response;
}

export function decodeValidatedLoginResponse(value: unknown): LoginResponseDto {
  const response = decodeLoginResponse(value);
  assertUsableAccessToken(response.accessToken);
  return response;
}

export function assertUsableAccessToken(token: string, nowMs = Date.now()): void {
  const expiresAtMs = getAccessTokenExpiresAtMs(token);
  if (expiresAtMs === null) {
    throw new Error("access token claims are invalid.");
  }
  if (expiresAtMs <= nowMs) {
    throw new Error("access token is expired.");
  }
}

function decodeJwtPayload(value: unknown): JwtPayload {
  if (!isRecord(value)) {
    throw new Error("access token payload must be an object.");
  }
  const sub = value.sub;
  if (typeof sub !== "string" || !sub.trim()) {
    throw new Error("access token subject must be a non-empty string.");
  }
  if (value.type !== "access") {
    throw new Error("access token type must be access.");
  }
  const exp = value.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp) || !Number.isInteger(exp)) {
    throw new Error("access token exp must be an integer.");
  }
  return { sub, type: "access", exp };
}
