import { FixedWindowRateLimiter } from "./fixed-window-rate-limiter";

describe("FixedWindowRateLimiter", () => {
  it("rejects requests over the limit and allows them after the window resets", () => {
    const limiter = new FixedWindowRateLimiter();

    expect(limiter.consume("login:ip:1", 2, 1_000, 100).allowed).toBe(true);
    expect(limiter.consume("login:ip:1", 2, 1_000, 200).allowed).toBe(true);
    expect(limiter.consume("login:ip:1", 2, 1_000, 300)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("login:ip:1", 2, 1_000, 1_101).allowed).toBe(true);
  });

  it("fails closed for new identities when the active-window capacity is full", () => {
    const limiter = new FixedWindowRateLimiter(2);

    expect(limiter.consume("ip:1", 1, 1_000, 100).allowed).toBe(true);
    expect(limiter.consume("ip:2", 1, 1_000, 100).allowed).toBe(true);
    expect(limiter.consume("ip:3", 1, 1_000, 100)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("ip:3", 1, 1_000, 1_101).allowed).toBe(true);
  });
});
