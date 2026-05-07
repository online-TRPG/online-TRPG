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
import { ChatSendMessageDto, SessionJoinMessageDto } from "@trpg/shared-types";
import { ConnectionStatus as PrismaConnectionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { RealtimeEventsService } from "./realtime-events.service";

@WebSocketGateway({
  namespace: "/ws",
  cors: {
    origin: "*",
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

  constructor(
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeEvents.bindServer(server);
  }

  async handleDisconnect(client: Socket): Promise<void> {
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
    // REST 요청과 같은 방식으로 WebSocket 연결도 사용자 ID를 기준으로 구분한다.
    // 브라우저 WebSocket은 커스텀 헤더가 빠질 수 있어서, auth.userId도 함께 허용한다.
    const userIdHeader = client.handshake.headers["x-user-id"];
    const userIdFromHeader = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    const userIdFromAuth =
      typeof client.handshake.auth?.userId === "string"
        ? client.handshake.auth.userId
        : undefined;
    const userId = userIdFromHeader ?? userIdFromAuth;

    if (!userId) {
      throw new WsException("x-user-id header is required.");
    }

    await this.usersService.getUserEntityOrThrow(userId);
    await this.sessionsService.ensureMembership(userId, dto.sessionId);
    await this.sessionsService.updateParticipantConnectionStatus(
      userId,
      dto.sessionId,
      PrismaConnectionStatus.ONLINE,
    );
    // 같은 세션 참가자끼리만 이벤트를 받도록 세션별 room에 입장시킨다.
    await client.join(this.realtimeEvents.getRoomName(dto.sessionId));
    await client.join(this.realtimeEvents.getUserRoomName(dto.sessionId, userId));
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

  @SubscribeMessage("chat.send")
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChatSendMessageDto,
  ): Promise<void> {
    const membership = this.sessionMembershipBySocket.get(client.id);
    if (!membership || membership.sessionId !== dto.sessionId) {
      throw new WsException("You must join the session before chatting.");
    }

    const content = dto.content.trim();
    if (!content) {
      throw new WsException("content is required.");
    }
    if (content.length > 1000) {
      throw new WsException("content must be shorter than or equal to 1000 characters.");
    }

    // Chat 탭은 현재 접속 중인 참가자끼리만 쓰는 휘발성 창구라서 DB에 저장하지 않는다.
    // 클라이언트가 보낸 sender를 믿지 않고, join 때 확인한 membership 기준으로만 발신자를 정한다.
    await this.sessionsService.ensureMembership(membership.userId, dto.sessionId);
    const sender = await this.usersService.getUserEntityOrThrow(membership.userId);

    this.realtimeEvents.emitChatMessage(dto.sessionId, {
      id: randomUUID(),
      sessionId: dto.sessionId,
      senderUserId: membership.userId,
      senderDisplayName: sender.displayName,
      content,
      createdAt: new Date().toISOString(),
    });
  }
}
