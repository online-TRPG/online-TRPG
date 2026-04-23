import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
  JoinSessionDto,
  ParticipantStatusResponseDto,
  SelectSessionCharacterDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
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
  listSessions(): Promise<SessionListItemResponseDto[]> {
    return this.sessionsService.listAvailableSessions();
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
}
