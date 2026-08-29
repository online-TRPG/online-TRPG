import {
  getCorsAllowedOrigins,
  getRefreshCookieName,
  getRefreshCookieSameSite,
  isCorsOriginAllowed,
  isTrustedBrowserRequestOrigin,
} from "./browser-security";

describe("browser security configuration", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows only exact configured origins", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com,https://admin.example.com";

    expect(getCorsAllowedOrigins()).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
    expect(isCorsOriginAllowed("https://app.example.com")).toBe(true);
    expect(isCorsOriginAllowed("https://app.example.com.evil.test")).toBe(false);
  });

  it("fails closed when production has no origin allowlist", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ALLOWED_ORIGINS;

    expect(() => getCorsAllowedOrigins()).toThrow("CORS_ALLOWED_ORIGINS is required");
  });

  it("requires a trusted Origin or Referer for production browser credential requests", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";

    expect(isTrustedBrowserRequestOrigin("https://app.example.com", undefined)).toBe(true);
    expect(isTrustedBrowserRequestOrigin(undefined, "https://app.example.com/account")).toBe(true);
    expect(isTrustedBrowserRequestOrigin("https://evil.test", undefined)).toBe(false);
    expect(isTrustedBrowserRequestOrigin(undefined, undefined)).toBe(false);
  });

  it("uses secure production cookie naming and validates SameSite", () => {
    process.env.NODE_ENV = "production";
    process.env.REFRESH_COOKIE_SAME_SITE = "none";

    expect(getRefreshCookieName()).toBe("__Host-refreshToken");
    expect(getRefreshCookieSameSite()).toBe("none");

    process.env.REFRESH_COOKIE_SAME_SITE = "invalid";
    expect(() => getRefreshCookieSameSite()).toThrow("REFRESH_COOKIE_SAME_SITE");
  });
});
