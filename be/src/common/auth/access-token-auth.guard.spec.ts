import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AccessTokenAuthGuard } from "./access-token-auth.guard";
import type { AuthenticatedRequest } from "./authenticated-request";

describe("AccessTokenAuthGuard", () => {
  it("defers WebSocket authentication to the realtime gateway", () => {
    const reflector = createReflector(false);
    const context = createExecutionContext("ws");

    expect(new AccessTokenAuthGuard(reflector).canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
    expect(context.switchToHttp).not.toHaveBeenCalled();
  });

  it("fails closed for unsupported execution contexts", () => {
    const context = createExecutionContext("rpc");

    expect(new AccessTokenAuthGuard(createReflector(false)).canActivate(context)).toBe(false);
    expect(context.switchToHttp).not.toHaveBeenCalled();
  });

  it("allows explicitly public HTTP routes", () => {
    const context = createExecutionContext("http");

    expect(new AccessTokenAuthGuard(createReflector(true)).canActivate(context)).toBe(true);
  });

  it("allows protected HTTP routes with a verified principal", () => {
    const request = {
      accessTokenAuth: { userId: "user-1", email: "user@example.com" },
    } as AuthenticatedRequest;
    const context = createExecutionContext("http", request);

    expect(new AccessTokenAuthGuard(createReflector(false)).canActivate(context)).toBe(true);
  });

  it("rejects protected HTTP routes without a verified principal", () => {
    const context = createExecutionContext("http", {} as AuthenticatedRequest);

    expect(() => new AccessTokenAuthGuard(createReflector(false)).canActivate(context)).toThrow(
      "인증이 필요합니다.",
    );
  });
});

function createReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

function createExecutionContext(
  type: "http" | "ws" | "rpc",
  request?: AuthenticatedRequest,
): ExecutionContext {
  const context = {
    getType: jest.fn().mockReturnValue(type),
    getHandler: jest.fn().mockReturnValue(() => undefined),
    getClass: jest.fn().mockReturnValue(class TestController {}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => request,
    }),
  };
  return context as unknown as ExecutionContext;
}
