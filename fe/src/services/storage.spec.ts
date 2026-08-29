import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStoredToken, loadStoredToken, saveStoredToken } from "./storage";

describe("access token storage", () => {
  afterEach(() => {
    clearStoredToken();
    vi.unstubAllGlobals();
  });

  it("keeps access tokens in memory and removes legacy localStorage copies", () => {
    const values = new Map<string, string>([["trpg.accessToken", "legacy-token"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const token = createAccessToken(Math.floor(Date.now() / 1000) + 600);

    saveStoredToken(token);

    expect(loadStoredToken()).toBe(token);
    expect(values.has("trpg.accessToken")).toBe(false);
  });
});

function createAccessToken(exp: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", type: "access", exp })}.signature`;
}
