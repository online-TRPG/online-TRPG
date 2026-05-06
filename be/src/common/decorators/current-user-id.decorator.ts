import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { verifyToken } from "../auth/token.utils";
import { unauthorized } from "../exceptions/domain-error";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.accessTokenAuth?.userId) {
      return request.accessTokenAuth.userId;
    }

    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      try {
        return verifyToken(authorization.slice("Bearer ".length).trim(), "access").sub;
      } catch {
        // 미들웨어가 적용되지 않은 테스트/특수 실행 환경에서도 같은 AUTH_401 응답을 유지한다.
        throw unauthorized("AUTH_401", "인증이 필요합니다.");
      }
    }

    const fallbackUserId = request.headers["x-user-id"];
    if (typeof fallbackUserId === "string" && fallbackUserId) {
      return fallbackUserId;
    }

    throw unauthorized("AUTH_401", "인증이 필요합니다.");
  },
);
