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
import { SessionJoinMessageDto } from "@trpg/shared-types";
import { ConnectionStatus as PrismaConnectionStatus } from "@prisma/client";
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
    // REST 요청과 같은 방식으로 WebSocket 연결도 x-user-id 헤더를 기준으로 사용자를 구분한다.
    // HTTP API와 WS API의 사용자 식별 규칙을 맞춰두면 테스트와 디버깅이 쉬워진다.
    const userIdHeader = client.handshake.headers["x-user-id"];
    const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;

    if (!userId) {
      throw new WsException("x-user-id header is required.");
    }

    await this.usersService.getUserEntityOrThrow(userId);
    await this.sessionsService.ensureMembership(userId, dto.sessionId);
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
}
