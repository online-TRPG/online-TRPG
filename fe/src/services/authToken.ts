interface JwtPayload {
  exp?: number;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return globalThis.atob(padded);
}

export function getAccessTokenExpiresAtMs(token: string): number | null {
  const [, body] = token.split(".");
  if (!body) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(body)) as JwtPayload;
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(token: string, nowMs = Date.now()): boolean {
  const expiresAtMs = getAccessTokenExpiresAtMs(token);
  // exp가 없는 비정상 토큰은 서버 401 처리에 맡기고, 명확히 만료된 토큰만 즉시 정리한다.
  return expiresAtMs !== null && expiresAtMs <= nowMs;
}
