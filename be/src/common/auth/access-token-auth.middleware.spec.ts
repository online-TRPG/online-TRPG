import { UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { AccessTokenAuthMiddleware } from "./access-token-auth.middleware";
import type { AuthenticatedRequest } from "./authenticated-request";
import { createAccessToken } from "./token.utils";

describe("AccessTokenAuthMiddleware", () => {
  function createMiddleware() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    return {
      middleware: new AccessTokenAuthMiddleware(prisma as never),
      prisma,
    };
  }

  it("Authorization 헤더가 없으면 기존 게스트/x-user-id 흐름을 위해 통과시킨다.", async () => {
    const { middleware, prisma } = createMiddleware();
    const request = { headers: {} } as AuthenticatedRequest;
    const next = jest.fn();

    await middleware.use(request, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(request.accessTokenAuth).toBeUndefined();
  });

  it("유효한 Bearer access token을 검증해 DB 사용자 상태를 확인하고 요청 객체에 사용자 id를 저장한다.", async () => {
    const { middleware, prisma } = createMiddleware();
    const token = createAccessToken("user-1", "user@example.com");
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as AuthenticatedRequest;
    const next = jest.fn();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      deletedAt: null,
    });

    await middleware.use(request, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });
    expect(request.accessTokenAuth).toEqual({
      userId: "user-1",
      email: "user@example.com",
    });
  });

  it("탈퇴한 사용자 토큰은 AUTH_401 응답으로 차단한다.", async () => {
    const { middleware, prisma } = createMiddleware();
    const token = createAccessToken("user-1", "user@example.com");
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as AuthenticatedRequest;
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      deletedAt: new Date(),
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(UnauthorizedException);

    try {
      await middleware.use(request, {} as Response, jest.fn());
    } catch (error) {
      expect((error as UnauthorizedException).getResponse()).toEqual({
        code: "AUTH_401",
        message: "이용할 수 없는 계정입니다.",
        data: null,
      });
    }
  });

  it("잘못된 Bearer access token은 AUTH_401 응답으로 변환한다.", async () => {
    const { middleware } = createMiddleware();
    const request = {
      headers: {
        authorization: "Bearer invalid-token",
      },
    } as AuthenticatedRequest;

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(UnauthorizedException);

    try {
      await middleware.use(request, {} as Response, jest.fn());
    } catch (error) {
      expect((error as UnauthorizedException).getResponse()).toEqual({
        code: "AUTH_401",
        message: "인증이 필요합니다.",
        data: null,
      });
    }
  });
});
