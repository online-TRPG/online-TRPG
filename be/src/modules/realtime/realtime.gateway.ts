import {
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  ChatSendMessageDto,
  SessionJoinMessageDto,
  VTT_MAP_DELTA_V2_CAPABILITY,
} from "@trpg/shared-types";
import { ConnectionStatus as PrismaConnectionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import { verifyToken } from "../../common/auth/token.utils";
import { isCorsOriginAllowed } from "../../common/security/browser-security";
import { FixedWindowRateLimiter } from "../../common/security/fixed-window-rate-limiter";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { RealtimeEventsService } from "./realtime-events.service";

@WebSocketGateway({
  namespace: "/ws",
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      try {
        callback(null, isCorsOriginAllowed(origin));
      } catch (error) {
        callback(error instanceof Error ? error : new Error("Origin is not allowed."), false);
      }
    },
    credentials: true,
  },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly sessionMembershipBySocket = new Map<
    string,
    {
      sessionId: string;
      userId: string;
    }
  >();
  private readonly socketIdsByUser = new Map<string, Set<string>>();
  private readonly rateLimiter = new FixedWindowRateLimiter();

  constructor(
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeEvents.bindServer(server);
    server.use((client, next) => {
      const connectionDecision = this.rateLimiter.consume(
        `ws-connect:${client.handshake.address || "unknown"}`,
        20,
        60_000,
      );
      if (!connectionDecision.allowed) {
        next(new Error(`Rate limit exceeded. Retry after ${connectionDecision.retryAfterSeconds}s.`));
        return;
      }
      void this.authenticateClient(client)
        .then(() => next())
        .catch(() => next(new Error("Authentication required.")));
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.removeTrackedSocket(client);
    const membership = this.sessionMembershipBySocket.get(client.id);
    if (!membership) {
      return;
    }

    this.sessionMembershipBySocket.delete(client.id);

    const hasRemainingSocket = [...this.sessionMembershipBySocket.values()].some(
      (entry) =>
        entry.sessionId === membership.sessionId && entry.userId === membership.userId,
    );

    if (hasRemainingSocket) {
      return;
    }

    await this.sessionsService.updateParticipantConnectionStatus(
      membership.userId,
      membership.sessionId,
      PrismaConnectionStatus.OFFLINE,
    );
  }

  @SubscribeMessage("session.join")
  async handleSessionJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SessionJoinMessageDto,
  ): Promise<void> {
    const userId = await this.authenticateClient(client);
    this.enforceSocketRateLimit(`ws-join:${userId}`, 30, 60_000);
    await this.sessionsService.ensureActivePlayAccess(userId, dto.sessionId);
    await this.sessionsService.updateParticipantConnectionStatus(
      userId,
      dto.sessionId,
      PrismaConnectionStatus.ONLINE,
    );
    // 같은 세션 참가자끼리만 이벤트를 받도록 세션별 room에 입장시킨다.
    await client.join(this.realtimeEvents.getRoomName(dto.sessionId));
    await client.join(this.realtimeEvents.getUserRoomName(dto.sessionId, userId));
    if (dto.capabilities?.includes(VTT_MAP_DELTA_V2_CAPABILITY)) {
      await client.join(this.realtimeEvents.getVttDeltaRoomName(dto.sessionId));
      await client.join(this.realtimeEvents.getUserVttDeltaRoomName(dto.sessionId, userId));
    }
    this.sessionMembershipBySocket.set(client.id, {
      sessionId: dto.sessionId,
      userId,
    });

    // 방에 들어온 직후에는 전체 상태를 한 번 통째로 내려준다.
    // 그래야 중간에 새로 접속한 클라이언트도 현재 세션 상태를 바로 복원할 수 있고,
    // 그 다음부터는 변경 이벤트만 받아도 화면을 최신 상태로 유지할 수 있다.
    const snapshot = await this.sessionsService.buildSnapshot(dto.sessionId);
    client.emit("session.snapshot", {
      sessionId: dto.sessionId,
      snapshot,
    });
  }

  private async authenticateClient(client: Socket): Promise<string> {
    const existingAuth = this.readAuthenticatedClient(client);
    if (existingAuth) {
      try {
        const user = await this.usersService.getUserEntityOrThrow(existingAuth.userId);
        if (user.tokenVersion !== existingAuth.tokenVersion) {
          throw new WsException("Authentication required.");
        }
        await this.trackAuthenticatedSocket(client, user.id);
        return user.id;
      } catch {
        throw new WsException("Authentication required.");
      }
    }

    const accessToken = client.handshake.auth?.accessToken;
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      throw new WsException("Authentication required.");
    }

    try {
      const payload = verifyToken(accessToken, "access");
      const user = await this.usersService.getUserEntityOrThrow(payload.sub);
      if (user.tokenVersion !== payload.ver) {
        throw new WsException("Authentication required.");
      }
      client.data.accessTokenAuth = { userId: user.id, tokenVersion: payload.ver };
      await this.trackAuthenticatedSocket(client, user.id);
      return user.id;
    } catch {
      throw new WsException("Authentication required.");
    }
  }

  private readAuthenticatedClient(
    client: Socket,
  ): { userId: string; tokenVersion: number } | null {
    const auth = client.data?.accessTokenAuth;
    if (!auth || typeof auth !== "object") {
      return null;
    }
    const { userId, tokenVersion } = auth as {
      userId?: unknown;
      tokenVersion?: unknown;
    };
    return typeof userId === "string" && userId && Number.isInteger(tokenVersion)
      ? { userId, tokenVersion: tokenVersion as number }
      : null;
  }

  @SubscribeMessage("session.resync")
  async handleSessionResync(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SessionJoinMessageDto,
  ): Promise<void> {
    const userId = await this.authenticateClient(client);
    this.enforceSocketRateLimit(`ws-resync:${userId}`, 30, 60_000);
    const membership = this.sessionMembershipBySocket.get(client.id);
    if (!membership || membership.sessionId !== dto.sessionId) {
      throw new WsException("You must join the session before requesting a resync.");
    }

    await this.sessionsService.ensureActivePlayAccess(membership.userId, dto.sessionId);
    const snapshot = await this.sessionsService.buildSnapshot(dto.sessionId);
    client.emit("session.snapshot", {
      sessionId: dto.sessionId,
      snapshot,
    });
  }

  @SubscribeMessage("chat.send")
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChatSendMessageDto,
  ): Promise<void> {
    const userId = await this.authenticateClient(client);
    this.enforceSocketRateLimit(`ws-chat:${userId}`, 20, 10_000);
    const membership = this.sessionMembershipBySocket.get(client.id);
    if (!membership || membership.sessionId !== dto.sessionId) {
      throw new WsException("You must join the session before chatting.");
    }

    const content = dto.content.trim();
    if (!content) {
      throw new WsException("content is required.");
    }
    if (content.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new WsException(`content must be shorter than or equal to ${CHAT_MESSAGE_MAX_LENGTH} characters.`);
    }
    const scope = dto.scope === "MAIN" ? "MAIN" : "CHAT";

    // Main RP/Chat 메시지는 현재 접속 중인 참가자끼리만 쓰는 휘발성 창구라서 DB에 저장하지 않는다.
    // 클라이언트가 보낸 sender를 믿지 않고, join 때 확인한 membership 기준으로만 발신자를 정한다.
    await this.sessionsService.ensureActivePlayAccess(membership.userId, dto.sessionId);
    const sender = await this.usersService.getUserEntityOrThrow(membership.userId);

    this.realtimeEvents.emitChatMessage(dto.sessionId, {
      id: randomUUID(),
      sessionId: dto.sessionId,
      senderUserId: membership.userId,
      senderDisplayName: sender.displayName,
      content,
      scope,
      createdAt: new Date().toISOString(),
    });
  }

  private enforceSocketRateLimit(key: string, limit: number, windowMs: number): void {
    const decision = this.rateLimiter.consume(key, limit, windowMs);
    if (!decision.allowed) {
      throw new WsException(
        `Rate limit exceeded. Retry after ${decision.retryAfterSeconds}s.`,
      );
    }
  }

  private async trackAuthenticatedSocket(client: Socket, userId: string): Promise<void> {
    const socketIds = this.socketIdsByUser.get(userId) ?? new Set<string>();
    socketIds.add(client.id);
    if (socketIds.size > 5) {
      socketIds.delete(client.id);
      throw new WsException("Concurrent socket limit exceeded.");
    }
    this.socketIdsByUser.set(userId, socketIds);
    await client.join(this.realtimeEvents.getAuthenticatedUserRoomName(userId));
  }

  private removeTrackedSocket(client: Socket): void {
    const auth = this.readAuthenticatedClient(client);
    if (!auth) {
      return;
    }
    const socketIds = this.socketIdsByUser.get(auth.userId);
    socketIds?.delete(client.id);
    if (socketIds?.size === 0) {
      this.socketIdsByUser.delete(auth.userId);
    }
  }
}
