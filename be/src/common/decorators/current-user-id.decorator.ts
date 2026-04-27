import { UnauthorizedException, createParamDecorator, ExecutionContext } from "@nestjs/common";
import { verifyToken } from "../auth/token.utils";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      return verifyToken(authorization.slice("Bearer ".length).trim(), "access").sub;
    }

    const fallbackUserId = request.headers["x-user-id"];
    if (fallbackUserId) {
      return fallbackUserId;
    }

    throw new UnauthorizedException("인증이 필요합니다.");
  },
);
