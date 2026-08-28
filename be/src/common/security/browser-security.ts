const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export type RefreshCookieSameSite = "strict" | "lax" | "none";

export function getCorsAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return [...new Set(configured.map(normalizeConfiguredOrigin))];
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CORS_ALLOWED_ORIGINS is required in production.");
  }

  return [...LOCAL_DEVELOPMENT_ORIGINS];
}

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  return getCorsAllowedOrigins().includes(normalizeRequestOrigin(origin));
}

export function isTrustedBrowserRequestOrigin(
  origin: string | undefined,
  referer: string | undefined,
): boolean {
  const requestOrigin = origin ?? readRefererOrigin(referer);
  if (!requestOrigin) {
    return process.env.NODE_ENV !== "production" || process.env.TRPG_E2E === "1";
  }

  try {
    return isCorsOriginAllowed(requestOrigin);
  } catch {
    return false;
  }
}

export function getRefreshCookieSameSite(): RefreshCookieSameSite {
  const configured = process.env.REFRESH_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (!configured) {
    return "strict";
  }
  if (configured === "strict" || configured === "lax" || configured === "none") {
    return configured;
  }
  throw new Error("REFRESH_COOKIE_SAME_SITE must be strict, lax, or none.");
}

export function getRefreshCookieName(): "__Host-refreshToken" | "refreshToken" {
  return process.env.NODE_ENV === "production" ? "__Host-refreshToken" : "refreshToken";
}

function normalizeConfiguredOrigin(value: string): string {
  const url = parseHttpOrigin(value, "CORS_ALLOWED_ORIGINS");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`CORS_ALLOWED_ORIGINS must contain origins only: ${value}`);
  }
  return url.origin;
}

function normalizeRequestOrigin(value: string): string {
  return parseHttpOrigin(value, "Origin").origin;
}

function readRefererOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return parseHttpOrigin(value, "Referer").origin;
  } catch {
    return undefined;
  }
}

function parseHttpOrigin(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} contains an invalid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must use http or https.`);
  }
  return url;
}
