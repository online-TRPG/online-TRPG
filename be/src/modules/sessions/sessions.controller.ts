import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateSessionDto,
  GameStateResponseDto,
  JoinSessionDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { SessionsService } from "./sessions.service";

@ApiTags("sessions")
@ApiSecurity("x-user-id")
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  createSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.createSession(userId, dto);
  }

  @Post("join")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  joinSession(
    @CurrentUserId() userId: string,
    @Body() dto: JoinSessionDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.joinSession(userId, dto);
  }

  @Get(":id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionResponseDto })
  getSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.getSessionForUser(userId, sessionId);
  }

  @Get(":id/participants")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [SessionParticipantResponseDto] })
  getParticipants(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    return this.sessionsService.getParticipantsForUser(userId, sessionId);
  }

  @Get(":id/state")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: GameStateResponseDto })
  getState(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<GameStateResponseDto> {
    return this.sessionsService.getStateForUser(userId, sessionId);
  }
}
