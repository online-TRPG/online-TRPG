import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateSessionDto,
  GameStateResponseDto,
  HumanGmMessageDto,
  JoinSessionDto,
  ParticipantStatusResponseDto,
  SelectSessionCharacterDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionListQueryDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  UpdateParticipantReadyDto,
  UpdateSessionNodeDto,
  UpdateSessionCaptainDto,
  UpdateSessionDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { SessionsService } from "./sessions.service";

@ApiTags("sessions")
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOkResponse({ type: [SessionListItemResponseDto] })
  listSessions(@Query() query: SessionListQueryDto): Promise<SessionListItemResponseDto[]> {
    return this.sessionsService.listAvailableSessions(query);
  }

  @Post()
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  createSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.createSession(userId, dto);
  }

  @Post("join")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  joinSessionLegacy(
    @CurrentUserId() userId: string,
    @Body() dto: JoinSessionDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.joinSessionByInvite(userId, dto);
  }

  @Post("join-by-invite")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  joinSessionByInvite(
    @CurrentUserId() userId: string,
    @Body() dto: JoinSessionDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.joinSessionByInvite(userId, dto);
  }

  @Get(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionDetailResponseDto })
  getSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionDetailResponseDto> {
    return this.sessionsService.getSessionForUser(userId, sessionId);
  }

  @Patch(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionResponseDto })
  updateSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.updateSession(userId, sessionId, dto);
  }

  @Delete(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiNoContentResponse()
  @HttpCode(204)
  async deleteSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<void> {
    await this.sessionsService.deleteSession(userId, sessionId);
  }

  @Post(":id/join")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  joinSessionById(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.joinSessionById(userId, sessionId);
  }

  @Delete(":id/leave")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiNoContentResponse()
  @HttpCode(204)
  async leaveSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<void> {
    await this.sessionsService.leaveSession(userId, sessionId);
  }

  @Get(":id/participants")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [SessionParticipantResponseDto] })
  getParticipants(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    return this.sessionsService.getParticipantsForUser(userId, sessionId);
  }

  @Get(":id/participants/status")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [ParticipantStatusResponseDto] })
  getParticipantStatuses(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ParticipantStatusResponseDto[]> {
    return this.sessionsService.getParticipantStatusesForUser(userId, sessionId);
  }

  @Get(":id/state")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: GameStateResponseDto })
  getState(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<GameStateResponseDto> {
    return this.sessionsService.getStateForUser(userId, sessionId);
  }

  @Post(":id/character-selection")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionParticipantResponseDto })
  selectCharacter(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: SelectSessionCharacterDto,
  ): Promise<SessionParticipantResponseDto> {
    return this.sessionsService.selectCharacterForSession(userId, sessionId, dto);
  }

  @Patch(":id/participants/me/ready")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  updateReadyState(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateParticipantReadyDto,
  ): Promise<SessionParticipantResponseDto> {
    return this.sessionsService.updateParticipantReadyState(userId, sessionId, dto);
  }

  @Patch(":id/captain")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionResponseDto })
  updateCaptain(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateSessionCaptainDto,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.updateCaptain(userId, sessionId, dto);
  }

  @Post(":id/resume")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  resumeSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.resumeSession(userId, sessionId);
  }

  @Post(":id/start")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  startSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.startSession(userId, sessionId);
  }

  @Get(":id/invite")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionInviteResponseDto })
  getInvite(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionInviteResponseDto> {
    return this.sessionsService.getInviteInfo(userId, sessionId);
  }

  @Post(":id/gm/messages")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  createHumanGmMessage(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: HumanGmMessageDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.createHumanGmMessage(userId, sessionId, dto);
  }

  @Patch(":id/gm/node")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionSnapshotDto })
  updateSessionNode(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateSessionNodeDto,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.updateSessionNode(userId, sessionId, dto);
  }

  @Post(":id/gm/combat/start")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  startCombat(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.startCombat(userId, sessionId);
  }

  @Post(":id/gm/combat/end")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  endCombat(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionSnapshotDto> {
    return this.sessionsService.endCombat(userId, sessionId);
  }
}
