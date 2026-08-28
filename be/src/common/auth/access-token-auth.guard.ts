import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { unauthorized } from "../exceptions/domain-error";
import type { AuthenticatedRequest } from "./authenticated-request";
import { IS_PUBLIC_ROUTE } from "./public.decorator";

@Injectable()
export class AccessTokenAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const contextType = context.getType();
    if (contextType === "ws") {
      // Socket.IO authentication is performed during the handshake and again in
      // each RealtimeGateway handler so token-version revocation remains effective.
      return true;
    }
    if (contextType !== "http") {
      return false;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.accessTokenAuth) {
      throw unauthorized("AUTH_401", "인증이 필요합니다.");
    }
    return true;
  }
}
