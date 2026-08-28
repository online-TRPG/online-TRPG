export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type WindowState = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly maxWindows = 10_000) {
    if (!Number.isSafeInteger(maxWindows) || maxWindows <= 0) {
      throw new Error("maxWindows must be a positive safe integer.");
    }
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitDecision {
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      if (current) {
        this.windows.delete(key);
      }
      this.prune(now);
      if (this.windows.size >= this.maxWindows) {
        return { allowed: false, retryAfterSeconds: 1 };
      }
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    if (this.windows.size < this.maxWindows) {
      return;
    }
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
