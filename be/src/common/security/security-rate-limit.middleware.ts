import { HttpException, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import { createHash } from "crypto";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { FixedWindowRateLimiter } from "./fixed-window-rate-limiter";

type HttpRateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
  matches: (method: string, path: string) => boolean;
  identity: "ip" | "user";
};

const minute = 60_000;
const hour = 60 * minute;

const policies: HttpRateLimitPolicy[] = [
  {
    name: "login",
    limit: 10,
    windowMs: minute,
    matches: (method, path) => method === "POST" && path.endsWith("/users/login"),
    identity: "ip",
  },
  {
    name: "guest",
    limit: 5,
    windowMs: minute,
    matches: (method, path) => method === "POST" && path.endsWith("/users/guest"),
    identity: "ip",
  },
  {
    name: "register",
    limit: 5,
    windowMs: hour,
    matches: (method, path) => method === "POST" && path.endsWith("/users/register"),
    identity: "ip",
  },
  {
    name: "password-reset-request",
    limit: 5,
    windowMs: hour,
    matches: (method, path) =>
      method === "POST" && path.endsWith("/users/password-reset/request"),
    identity: "ip",
  },
  {
    name: "password-reset-confirm",
    limit: 10,
    windowMs: hour,
    matches: (method, path) =>
      method === "POST" && path.endsWith("/users/password-reset/confirm"),
    identity: "ip",
  },
  {
    name: "email-check",
    limit: 30,
    windowMs: minute,
    matches: (method, path) => method === "GET" && path.endsWith("/users/email-check"),
    identity: "ip",
  },
  {
    name: "refresh",
    limit: 30,
    windowMs: minute,
    matches: (method, path) => method === "POST" && path.endsWith("/users/reissue"),
    identity: "ip",
  },
  {
    name: "oauth-start",
    limit: 30,
    windowMs: minute,
    matches: (method, path) => method === "GET" && /\/users\/oauth\/(kakao|discord)\/url$/.test(path),
    identity: "ip",
  },
  {
    name: "oauth-login",
    limit: 10,
    windowMs: minute,
    matches: (method, path) => method === "POST" && /\/users\/oauth\/(kakao|discord)\/login$/.test(path),
    identity: "ip",
  },
  {
    name: "image-upload",
    limit: 10,
    windowMs: minute,
    matches: (method, path) =>
      method === "POST" &&
      (path.endsWith("/characters/avatar-assets") ||
        /\/scenarios\/[^/]+\/(assets|nodes\/[^/]+\/image)$/.test(path)),
    identity: "user",
  },
  {
    name: "ai",
    limit: 20,
    windowMs: minute,
    matches: (method, path) =>
      method === "POST" && (path.includes("/ai/") || path.includes("/ai-assist/")),
    identity: "user",
  },
];

@Injectable()
export class SecurityRateLimitMiddleware implements NestMiddleware {
  private readonly limiter = new FixedWindowRateLimiter();
  private readonly activeAiRequests = new Map<string, number>();

  use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const path = request.originalUrl.split("?", 1)[0];
    const policy = policies.find((candidate) => candidate.matches(request.method, path));
    if (!policy) {
      next();
      return;
    }

    const identity =
      policy.identity === "user" && request.accessTokenAuth?.userId
        ? `user:${request.accessTokenAuth.userId}`
        : `ip:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const decision = this.limiter.consume(
      `${policy.name}:${identity}`,
      policy.limit,
      policy.windowMs,
    );
    if (!decision.allowed) {
      this.reject(response, decision.retryAfterSeconds);
    }

    if (policy.name === "login") {
      const accountKey = this.readLoginAccountKey(request);
      if (accountKey) {
        const accountDecision = this.limiter.consume(`login-account:${accountKey}`, 10, minute);
        if (!accountDecision.allowed) {
          this.reject(response, accountDecision.retryAfterSeconds);
        }
      }
    }

    if (policy.name === "ai") {
      const dailyLimit = this.readPositiveInteger(process.env.AI_DAILY_REQUEST_LIMIT, 200);
      const dailyDecision = this.limiter.consume(`ai-daily:${identity}`, dailyLimit, 24 * hour);
      if (!dailyDecision.allowed) {
        this.reject(response, dailyDecision.retryAfterSeconds);
      }
      const concurrencyLimit = this.readPositiveInteger(process.env.AI_CONCURRENT_REQUEST_LIMIT, 2);
      const active = this.activeAiRequests.get(identity) ?? 0;
      if (active >= concurrencyLimit) {
        this.reject(response, 1);
      }
      this.activeAiRequests.set(identity, active + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const remaining = (this.activeAiRequests.get(identity) ?? 1) - 1;
        if (remaining <= 0) this.activeAiRequests.delete(identity);
        else this.activeAiRequests.set(identity, remaining);
      };
      response.once("finish", release);
      response.once("close", release);
    }

    next();
  }

  private reject(response: Response, retryAfterSeconds: number): never {
    response.setHeader("Retry-After", String(retryAfterSeconds));
    throw new HttpException(
      {
        code: "RATE_LIMIT_429",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        data: { retryAfterSeconds },
      },
      429,
    );
  }

  private readLoginAccountKey(request: AuthenticatedRequest): string | null {
    const body = request.body as { email?: unknown } | undefined;
    if (typeof body?.email !== "string") return null;
    const normalized = body.email.trim().toLowerCase();
    if (!normalized || normalized.length > 254) return null;
    return createHash("sha256").update(normalized).digest("hex");
  }

  private readPositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value ?? fallback);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
