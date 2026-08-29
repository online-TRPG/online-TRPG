import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { unauthorized } from "../exceptions/domain-error";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.accessTokenAuth?.userId) {
      return request.accessTokenAuth.userId;
    }

    throw unauthorized("AUTH_401", "인증이 필요합니다.");
  },
);
