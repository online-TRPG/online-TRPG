import { HttpException } from "@nestjs/common";
import type { Response } from "express";
import { EventEmitter } from "events";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { SecurityRateLimitMiddleware } from "./security-rate-limit.middleware";

describe("SecurityRateLimitMiddleware", () => {
  it("returns 429 with Retry-After before excess login work", () => {
    const middleware = new SecurityRateLimitMiddleware();
    const request = {
      method: "POST",
      originalUrl: "/api/v1/users/login",
      ip: "203.0.113.10",
      socket: {},
    } as AuthenticatedRequest;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    for (let index = 0; index < 10; index += 1) {
      middleware.use(request, response, next);
    }

    expect(() => middleware.use(request, response, next)).toThrow(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(next).toHaveBeenCalledTimes(10);
  });

  it("limits the same login account across changing IP addresses", () => {
    const middleware = new SecurityRateLimitMiddleware();
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();
    for (let index = 0; index < 10; index += 1) {
      middleware.use({
        method: "POST",
        originalUrl: "/api/v1/users/login",
        ip: `203.0.113.${index + 1}`,
        socket: {},
        body: { email: "TARGET@example.com" },
      } as AuthenticatedRequest, response, next);
    }

    expect(() => middleware.use({
      method: "POST",
      originalUrl: "/api/v1/users/login",
      ip: "198.51.100.20",
      socket: {},
      body: { email: "target@example.com" },
    } as AuthenticatedRequest, response, next)).toThrow(HttpException);
  });

  it("rejects excess concurrent AI work before the handler runs", () => {
    const originalLimit = process.env.AI_CONCURRENT_REQUEST_LIMIT;
    process.env.AI_CONCURRENT_REQUEST_LIMIT = "2";
    try {
      const middleware = new SecurityRateLimitMiddleware();
      const request = {
        method: "POST",
        originalUrl: "/api/v1/sessions/session-1/ai/narration",
        ip: "203.0.113.10",
        socket: {},
        accessTokenAuth: { userId: "user-1" },
      } as AuthenticatedRequest;
      const responses = [new EventEmitter(), new EventEmitter(), new EventEmitter()].map((emitter) => {
        Object.assign(emitter, { setHeader: jest.fn() });
        return emitter as unknown as Response;
      });
      const next = jest.fn();

      middleware.use(request, responses[0], next);
      middleware.use(request, responses[1], next);
      expect(() => middleware.use(request, responses[2], next)).toThrow(HttpException);
      expect(next).toHaveBeenCalledTimes(2);
      responses[0].emit("finish");
      expect(() => middleware.use(request, responses[2], next)).not.toThrow();
    } finally {
      process.env.AI_CONCURRENT_REQUEST_LIMIT = originalLimit;
    }
  });
});
