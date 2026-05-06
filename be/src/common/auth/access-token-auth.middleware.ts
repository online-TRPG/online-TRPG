import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import { PrismaService } from "../../database/prisma.service";
import { unauthorized } from "../exceptions/domain-error";
import { verifyToken } from "./token.utils";
import type { AuthenticatedRequest } from "./authenticated-request";

const bearerPrefix = "Bearer ";

function authRequiredError() {
  return unauthorized("AUTH_401", "인증이 필요합니다.");
}

function unavailableAccountError() {
  return unauthorized("AUTH_401", "이용할 수 없는 계정입니다.");
}

@Injectable()
export class AccessTokenAuthMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(request: AuthenticatedRequest, _response: Response, next: NextFunction): Promise<void> {
    const authorization = request.headers.authorization;

    if (!authorization) {
      next();
      return;
    }

    if (!authorization.startsWith(bearerPrefix)) {
      throw authRequiredError();
    }

    const accessToken = authorization.slice(bearerPrefix.length).trim();
    if (!accessToken) {
      throw authRequiredError();
    }

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(accessToken, "access");
    } catch {
      // 토큰 파싱 실패, 타입 불일치, 만료는 모두 인증 실패로 규격화해서 내려준다.
      throw authRequiredError();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      throw unavailableAccountError();
    }

    // 미들웨어에서 검증 결과를 요청에 저장하면 데코레이터와 컨트롤러가 JWT 파싱을 반복하지 않아도 된다.
    request.accessTokenAuth = {
      userId: user.id,
      email: user.email ?? payload.email ?? null,
    };

    next();
  }
}
