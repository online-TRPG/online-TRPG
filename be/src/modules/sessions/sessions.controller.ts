import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApplyHumanGmCombatConditionDto,
  AdjustHumanGmCombatHpDto,
  AcceptHumanGmAiAssistSuggestionDto,
  ApplyCampaignCalendarActionDto,
  ApplySessionEconomyActionDto,
  CampaignArchiveResponseDto,
  CharacterTransferResponseDto,
  CharacterVaultItemDto,
  CompleteCampaignDto,
  CreateSessionDto,
  CreateSessionPlayDto,
  UpdateSessionPlayDto,
  SessionPlayTransitionDto,
  UpdateSessionPlayAttendanceDto,
  AcquireActivePlayDto,
  CreateSessionApplicationDto,
  ResolveSessionApplicationDto,
  SessionPlayResponseDto,
  ActivePlayResponseDto,
  SessionApplicationResponseDto,
  SessionScheduleProximityWarningDto,
  CreateHumanGmAiAssistSuggestionDto,
  CreateVttMapPingDto,
  GameStateResponseDto,
  GrantHumanGmInventoryItemDto,
  HumanGmMessageDto,
  HumanGmAiAssistSuggestionDto,
  HumanGmNodeMoveOptionDto,
  HumanGmPrivateNoteDto,
  HumanGmRevealOptionDto,
  JoinSessionDto,
  JoinSessionByIdDto,
  MoveSessionTokenDto,
  PaginatedResponse,
  ParticipantStatusResponseDto,
  PlayerScenarioViewDto,
  RequestCharacterTransferDto,
  ReportHumanGmAiAssistApplicationFailureDto,
  RevealSessionContentDto,
  RemoveHumanGmInventoryItemDto,
  SelectSessionCharacterDto,
  SetHumanGmDifficultyClassDto,
  SessionRevealResponseDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionInvitePreviewResponseDto,
  SessionListItemResponseDto,
  SessionListQueryDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  UpdateParticipantReadyDto,
  UpdateSessionDto,
  UpdateSessionNodeDto,
  UpdateVttMapDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { MapRuntimeService } from "./map-runtime.service";
import { SessionsService } from "./sessions.service";
import { SessionPlayService } from "./session-play.service";

@ApiTags("sessions")
@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly mapRuntimeService: MapRuntimeService,
    private readonly sessionPlayService: SessionPlayService,
  ) {}

  @Get(":id/plays")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionPlayResponseDto] })
  async listPlays(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionPlayResponseDto[]>> {
    return apiResponse("SESSION_200", "플레이 일정을 조회했습니다.", await this.sessionPlayService.listPlays(userId, sessionId));
  }

  @Post(":id/plays")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionPlayResponseDto })
  async createPlay(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: CreateSessionPlayDto,
  ): Promise<ApiResponse<SessionPlayResponseDto>> {
    return apiResponse(
      "SESSION_201",
      dto.openLobbyNow ? "대기실을 열었습니다." : "다음 플레이 일정을 만들었습니다.",
      await this.sessionPlayService.createPlay(userId, sessionId, dto),
    );
  }

  @Patch(":id/plays/:playId")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionPlayResponseDto })
  async updatePlay(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Param("playId") playId: string,
    @Body() dto: UpdateSessionPlayDto,
  ): Promise<ApiResponse<SessionPlayResponseDto>> {
    return apiResponse("SESSION_200", "플레이 일정을 변경했습니다.", await this.sessionPlayService.updatePlay(userId, sessionId, playId, dto));
  }

  @Post(":id/plays/:playId/cancel")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionPlayResponseDto })
  async cancelPlay(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: SessionPlayTransitionDto) {
    return apiResponse("SESSION_200", "플레이 일정을 취소했습니다.", await this.sessionPlayService.cancelPlay(userId, sessionId, playId, dto));
  }

  @Post(":id/plays/:playId/open-lobby")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionPlayResponseDto })
  async openPlayLobby(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: SessionPlayTransitionDto) {
    return apiResponse("SESSION_200", "대기실을 열었습니다.", await this.sessionPlayService.openLobby(userId, sessionId, playId, dto));
  }

  @Post(":id/plays/:playId/start")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionSnapshotDto })
  async startPlay(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: SessionPlayTransitionDto) {
    return apiResponse("SESSION_200", "플레이를 시작했습니다.", await this.sessionsService.startSession(userId, sessionId, { playId, expectedStateVersion: dto.expectedStateVersion }));
  }

  @Post(":id/plays/:playId/finish")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionPlayResponseDto })
  async finishPlay(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: SessionPlayTransitionDto) {
    return apiResponse("SESSION_200", "플레이를 닫고 대기 중으로 전환했습니다.", await this.sessionPlayService.finishPlay(userId, sessionId, playId, dto));
  }

  @Patch(":id/plays/:playId/attendance/me")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionPlayResponseDto })
  async updatePlayAttendance(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: UpdateSessionPlayAttendanceDto) {
    return apiResponse("SESSION_200", "참석 응답을 저장했습니다.", await this.sessionPlayService.updateAttendance(userId, sessionId, playId, dto));
  }

  @Post(":id/plays/:playId/enter")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: ActivePlayResponseDto })
  async enterPlay(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("playId") playId: string, @Body() dto: AcquireActivePlayDto) {
    return apiResponse("SESSION_200", "실시간 플레이에 입장했습니다.", await this.sessionPlayService.acquireActivePlay(userId, sessionId, playId, dto));
  }

  @Delete("active-play/me")
  @HttpCode(204)
  @ApiSecurity("x-user-id")
  async leaveActivePlay(@CurrentUserId() userId: string): Promise<void> {
    await this.sessionPlayService.releaseActivePlay(userId);
  }

  @Post("active-play/:playId/heartbeat")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: ActivePlayResponseDto })
  async heartbeatActivePlay(@CurrentUserId() userId: string, @Param("playId") playId: string) {
    return apiResponse("SESSION_200", "실시간 참여 상태를 갱신했습니다.", await this.sessionPlayService.heartbeat(userId, playId));
  }

  @Post(":id/applications")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionApplicationResponseDto })
  async createApplication(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Body() dto: CreateSessionApplicationDto) {
    return apiResponse("SESSION_201", "참가 신청을 보냈습니다.", await this.sessionPlayService.createApplication(userId, sessionId, dto));
  }

  @Get(":id/application-proximity-warnings")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionScheduleProximityWarningDto] })
  async getApplicationProximityWarnings(@CurrentUserId() userId: string, @Param("id") sessionId: string) {
    return apiResponse(
      "SESSION_200",
      "시작 시간이 가까운 일정을 조회했습니다.",
      await this.sessionPlayService.getApplicationProximityWarnings(userId, sessionId),
    );
  }

  @Get(":id/applications")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionApplicationResponseDto] })
  async listApplications(@CurrentUserId() userId: string, @Param("id") sessionId: string) {
    return apiResponse("SESSION_200", "참가 신청을 조회했습니다.", await this.sessionPlayService.listApplications(userId, sessionId));
  }

  @Patch(":id/applications/:applicationId")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionApplicationResponseDto })
  async resolveApplication(@CurrentUserId() userId: string, @Param("id") sessionId: string, @Param("applicationId") applicationId: string, @Body() dto: ResolveSessionApplicationDto) {
    return apiResponse("SESSION_200", "참가 신청을 처리했습니다.", await this.sessionPlayService.resolveApplication(userId, sessionId, applicationId, dto));
  }

  @Get()
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionListItemResponseDto] })
  async listSessions(
    @CurrentUserId() userId: string,
    @Query() query: SessionListQueryDto,
  ): Promise<ApiResponse<PaginatedResponse<SessionListItemResponseDto>>> {
    const currentPage = query.page ?? 0;
    const pageSize = query.size ?? 10;
    const result = await this.sessionsService.listAvailableSessions({
      query: query.query,
      status: query.status,
      activityStatus: query.activityStatus,
      gmMode: query.gmMode,
      scenarioId: query.scenarioId,
      ruleSetId: query.ruleSetId,
      requesterUserId: userId,
      sort: query.sort,
      page: currentPage,
      size: pageSize,
    });

    return apiResponse("SESSION_200", "Sessions fetched.", {
      content: result.items,
      page: currentPage,
      size: pageSize,
      totalElements: result.totalElements,
      totalPages: Math.ceil(result.totalElements / pageSize),
    });
  }

  @Post()
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async createSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Session created.",
      await this.sessionsService.createSession(userId, dto),
    );
  }

  @Post("join")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async joinSessionLegacy(
    @CurrentUserId() userId: string,
    @Body() dto: JoinSessionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Session joined.",
      await this.sessionsService.joinSessionByInvite(userId, dto),
    );
  }

  @Post("join-by-invite")
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async joinSessionByInvite(
    @CurrentUserId() userId: string,
    @Body() dto: JoinSessionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Session joined.",
      await this.sessionsService.joinSessionByInvite(userId, dto),
    );
  }

  @Get("invites/:inviteCode/preview")
  @ApiParam({ name: "inviteCode" })
  @ApiOkResponse({ type: SessionInvitePreviewResponseDto })
  async getInvitePreview(
    @Param("inviteCode") inviteCode: string,
  ): Promise<ApiResponse<SessionInvitePreviewResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Invite preview fetched.",
      await this.sessionsService.getInvitePreview(inviteCode),
    );
  }

  @Get("invites/:inviteCode/proximity-warnings")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionScheduleProximityWarningDto] })
  async getInviteProximityWarnings(
    @CurrentUserId() userId: string,
    @Param("inviteCode") inviteCode: string,
  ) {
    return apiResponse(
      "SESSION_200",
      "시작 시간이 가까운 일정을 조회했습니다.",
      await this.sessionsService.getInviteProximityWarnings(userId, inviteCode),
    );
  }

  @Get("characters/vault")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [CharacterVaultItemDto] })
  async listCharacterVault(
    @CurrentUserId() userId: string,
  ): Promise<ApiResponse<CharacterVaultItemDto[]>> {
    return apiResponse(
      "SESSION_200",
      "Character vault fetched.",
      await this.sessionsService.listCharacterVault(userId),
    );
  }

  @Get(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionDetailResponseDto })
  async getSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionDetailResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Session fetched.",
      await this.sessionsService.getSessionForUser(userId, sessionId),
    );
  }

  @Patch(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionResponseDto })
  async updateSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<ApiResponse<SessionResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Session updated.",
      await this.sessionsService.updateSession(userId, sessionId, dto),
    );
  }

  @Post(":id/complete-campaign")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: CampaignArchiveResponseDto })
  async completeLongCampaign(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: CompleteCampaignDto,
  ): Promise<ApiResponse<CampaignArchiveResponseDto>> {
    return apiResponse(
      "SESSION_201",
      "Campaign archived.",
      await this.sessionsService.completeLongCampaign(userId, sessionId, dto),
    );
  }

  @Get(":id/campaign-archive")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: CampaignArchiveResponseDto })
  async getCampaignArchive(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<CampaignArchiveResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Campaign archive fetched.",
      await this.sessionsService.getCampaignArchive(userId, sessionId),
    );
  }

  @Post(":id/character-transfers")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: CharacterTransferResponseDto })
  async requestCharacterTransfer(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: RequestCharacterTransferDto,
  ): Promise<ApiResponse<CharacterTransferResponseDto>> {
    return apiResponse(
      "SESSION_201",
      "Character transfer requested.",
      await this.sessionsService.requestCharacterTransfer(userId, sessionId, dto),
    );
  }

  @Post(":id/character-transfers/:requestId/approve")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiParam({ name: "requestId" })
  @ApiOkResponse({ type: CharacterTransferResponseDto })
  async approveCharacterTransfer(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Param("requestId") requestId: string,
  ): Promise<ApiResponse<CharacterTransferResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Character transfer approved.",
      await this.sessionsService.approveCharacterTransfer(userId, sessionId, requestId),
    );
  }

  @Post(":id/character-transfers/:requestId/reject")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiParam({ name: "requestId" })
  @ApiOkResponse({ type: CharacterTransferResponseDto })
  async rejectCharacterTransfer(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Param("requestId") requestId: string,
  ): Promise<ApiResponse<CharacterTransferResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Character transfer rejected.",
      await this.sessionsService.rejectCharacterTransfer(userId, sessionId, requestId),
    );
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

  @Post(":id/join")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async joinSessionById(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: JoinSessionByIdDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Session joined.",
      await this.sessionsService.joinSessionById(userId, sessionId, dto),
    );
  }

  @Delete(":id")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiNoContentResponse()
  @HttpCode(200)
  async deleteSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<null>> {
    await this.sessionsService.deleteSession(userId, sessionId);
    return apiResponse("SESSION_200", "Session deleted.", null);
  }

  @Get(":id/participants")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [SessionParticipantResponseDto] })
  async getParticipants(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionParticipantResponseDto[]>> {
    return apiResponse(
      "SESSION_200",
      "Participants fetched.",
      await this.sessionsService.getParticipantsForUser(userId, sessionId),
    );
  }

  @Delete(":id/participants/:participantPublicId")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  async removeParticipant(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Param("participantPublicId") participantPublicId: string,
  ): Promise<ApiResponse<SessionParticipantResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "참가자를 세션에서 내보냈습니다.",
      await this.sessionsService.removeParticipant(userId, sessionId, participantPublicId),
    );
  }

  @Post(":id/participants/:participantPublicId/restore")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  async restoreParticipant(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Param("participantPublicId") participantPublicId: string,
  ): Promise<ApiResponse<SessionParticipantResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "참가자가 다시 초대받을 수 있도록 복구했습니다.",
      await this.sessionsService.restoreParticipant(userId, sessionId, participantPublicId),
    );
  }

  @Get(":id/participants/status")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [ParticipantStatusResponseDto] })
  async getParticipantStatuses(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<{ participants: ParticipantStatusResponseDto[] }>> {
    return apiResponse("SESSION_200", "Participant statuses fetched.", {
      participants: await this.sessionsService.getParticipantStatusesForUser(userId, sessionId),
    });
  }

  @Get(":id/participants/removed")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionParticipantResponseDto] })
  async getRemovedParticipants(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionParticipantResponseDto[]>> {
    return apiResponse(
      "SESSION_200",
      "내보낸 참가자 목록을 조회했습니다.",
      await this.sessionsService.getRemovedParticipantsForHost(userId, sessionId),
    );
  }

  @Get(":id/state")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: GameStateResponseDto })
  async getState(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<GameStateResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Game state fetched.",
      await this.sessionsService.getStateForUser(userId, sessionId),
    );
  }

  @Get(":id/map")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: VttMapStateDto })
  async getVttMap(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<VttMapStateDto>> {
    return apiResponse(
      "SESSION_200",
      "VTT map fetched.",
      await this.sessionsService.getVttMapForUser(userId, sessionId),
    );
  }

  @Patch(":id/map")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOperation({
    summary: "Legacy whole-map update endpoint.",
    deprecated: true,
  })
  @ApiOkResponse({ type: VttMapStateDto })
  async updateVttMap(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateVttMapDto,
  ): Promise<ApiResponse<VttMapStateDto>> {
    return apiResponse(
      "SESSION_200",
      "VTT map updated.",
      await this.sessionsService.updateVttMap(userId, sessionId, dto),
    );
  }

  @Put(":id/gm/map")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: VttMapStateDto })
  async updateGmVttMap(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateVttMapDto,
  ): Promise<ApiResponse<VttMapStateDto>> {
    return apiResponse(
      "SESSION_200",
      "GM VTT map updated.",
      await this.mapRuntimeService.updateGmVttMap(userId, sessionId, dto),
    );
  }

  @Post(":id/map/tokens/move")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: VttMapStateDto })
  async moveSessionToken(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: MoveSessionTokenDto,
  ): Promise<ApiResponse<VttMapStateDto>> {
    return apiResponse(
      "SESSION_200",
      "VTT token moved.",
      await this.mapRuntimeService.moveSessionToken(userId, sessionId, dto),
    );
  }

  @Post(":id/map/pings")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: VttMapStateDto })
  async createVttMapPing(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: CreateVttMapPingDto,
  ): Promise<ApiResponse<VttMapStateDto>> {
    return apiResponse(
      "SESSION_200",
      "VTT map ping created.",
      await this.mapRuntimeService.createVttMapPing(userId, sessionId, dto),
    );
  }

  @Post(":id/map/interactions")
  @HttpCode(200)
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: VttMapInteractionResponseDto })
  async runVttMapInteraction(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: VttMapInteractionDto,
  ): Promise<ApiResponse<VttMapInteractionResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "VTT map interaction handled.",
      await this.mapRuntimeService.runVttMapInteraction(userId, sessionId, dto),
    );
  }

  @Get(":id/player-scenario")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: PlayerScenarioViewDto })
  async getPlayerScenario(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<PlayerScenarioViewDto>> {
    return apiResponse(
      "SESSION_200",
      "Player scenario fetched.",
      await this.sessionsService.getPlayerScenarioForUser(userId, sessionId),
    );
  }

  @Post(":id/character-selection")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionParticipantResponseDto })
  @HttpCode(200)
  async selectCharacter(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: SelectSessionCharacterDto,
  ): Promise<ApiResponse<SessionParticipantResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Character selected.",
      await this.sessionsService.selectCharacterForSession(userId, sessionId, dto),
    );
  }

  @Patch(":id/participants/me/ready")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  async updateReadyState(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateParticipantReadyDto,
  ): Promise<ApiResponse<SessionParticipantResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Ready state updated.",
      await this.sessionsService.updateParticipantReadyState(userId, sessionId, dto),
    );
  }

  @Post(":id/resume")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async resumeSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Session resumed.",
      await this.sessionsService.resumeSession(userId, sessionId),
    );
  }

  @Post(":id/start")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async startSession(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Session started.",
      await this.sessionsService.startSession(userId, sessionId),
    );
  }

  @Get(":id/invite")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionInviteResponseDto })
  async getInvite(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionInviteResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Invite fetched.",
      await this.sessionsService.getInviteInfo(userId, sessionId),
    );
  }

  @Post(":id/gm/messages")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async createHumanGmMessage(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: HumanGmMessageDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM message created.",
      await this.sessionsService.createHumanGmMessage(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/reveals")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionRevealResponseDto })
  async revealSessionContent(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: RevealSessionContentDto,
  ): Promise<ApiResponse<SessionRevealResponseDto>> {
    return apiResponse(
      "SESSION_200",
      "Session content revealed.",
      await this.sessionsService.revealSessionContent(userId, sessionId, dto),
    );
  }

  @Get(":id/gm/reveal-options")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [HumanGmRevealOptionDto] })
  async listHumanGmRevealOptions(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<HumanGmRevealOptionDto[]>> {
    return apiResponse(
      "SESSION_200",
      "Human GM reveal options fetched.",
      await this.sessionsService.listHumanGmRevealOptions(userId, sessionId),
    );
  }

  @Post(":id/gm/inventory/grant")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async grantHumanGmInventoryItem(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: GrantHumanGmInventoryItemDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM inventory item granted.",
      await this.sessionsService.grantHumanGmInventoryItem(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/inventory/remove")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async removeHumanGmInventoryItem(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: RemoveHumanGmInventoryItemDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM inventory item removed.",
      await this.sessionsService.removeHumanGmInventoryItem(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/economy")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async applyHumanGmEconomyAction(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: ApplySessionEconomyActionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM economy action applied.",
      await this.sessionsService.applyHumanGmEconomyAction(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/campaign-calendar")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async applyGmCampaignCalendarAction(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: ApplyCampaignCalendarActionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Campaign calendar action applied.",
      await this.sessionsService.applyCampaignCalendarAction(userId, sessionId, dto),
    );
  }

  @Post(":id/campaign-calendar")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async applyCampaignCalendarAction(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: ApplyCampaignCalendarActionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Campaign calendar action applied.",
      await this.sessionsService.applyCampaignCalendarAction(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/dc")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async setHumanGmDifficultyClass(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: SetHumanGmDifficultyClassDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM difficulty class overridden.",
      await this.sessionsService.setHumanGmDifficultyClass(userId, sessionId, dto),
    );
  }

  @Get(":id/gm/private-notes")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [HumanGmPrivateNoteDto] })
  async listHumanGmPrivateNotes(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<HumanGmPrivateNoteDto[]>> {
    return apiResponse(
      "SESSION_200",
      "GM private notes listed.",
      await this.sessionsService.listHumanGmPrivateNotes(userId, sessionId),
    );
  }

  @Post(":id/gm/ai-assist/suggestions")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: HumanGmAiAssistSuggestionDto })
  async createHumanGmAiAssistSuggestion(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: CreateHumanGmAiAssistSuggestionDto,
  ): Promise<ApiResponse<HumanGmAiAssistSuggestionDto>> {
    return apiResponse(
      "SESSION_200",
      "GM AI assist suggestion created.",
      await this.sessionsService.createHumanGmAiAssistSuggestion(userId, sessionId, dto),
    );
  }

  @Get(":id/gm/ai-assist/suggestions")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [HumanGmAiAssistSuggestionDto] })
  async listHumanGmAiAssistSuggestions(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<HumanGmAiAssistSuggestionDto[]>> {
    return apiResponse(
      "SESSION_200",
      "GM AI assist suggestions listed.",
      await this.sessionsService.listHumanGmAiAssistSuggestions(userId, sessionId),
    );
  }

  @Post(":id/gm/ai-assist/accept")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async acceptHumanGmAiAssistSuggestion(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: AcceptHumanGmAiAssistSuggestionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM AI assist suggestion accepted.",
      await this.sessionsService.acceptHumanGmAiAssistSuggestion(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/ai-assist/apply-failure")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async reportHumanGmAiAssistApplicationFailure(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: ReportHumanGmAiAssistApplicationFailureDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM AI assist application failure recorded.",
      await this.sessionsService.reportHumanGmAiAssistApplicationFailure(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/combat/conditions")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async applyHumanGmCombatCondition(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: ApplyHumanGmCombatConditionDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM combat condition applied.",
      await this.sessionsService.applyHumanGmCombatCondition(userId, sessionId, dto),
    );
  }

  @Post(":id/gm/combat/hp")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async adjustHumanGmCombatHp(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: AdjustHumanGmCombatHpDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "GM combat hit points adjusted.",
      await this.sessionsService.adjustHumanGmCombatHp(userId, sessionId, dto),
    );
  }

  @Patch(":id/gm/node")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionSnapshotDto })
  async updateSessionNode(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateSessionNodeDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Session node updated.",
      await this.sessionsService.updateSessionNode(userId, sessionId, dto),
    );
  }

  @Get(":id/gm/node-options")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [HumanGmNodeMoveOptionDto] })
  async listHumanGmNodeMoveOptions(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<HumanGmNodeMoveOptionDto[]>> {
    return apiResponse(
      "SESSION_200",
      "Human GM node move options fetched.",
      await this.sessionsService.listHumanGmNodeMoveOptions(userId, sessionId),
    );
  }

  @Post(":id/gm/combat/start")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async startCombat(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Combat started.",
      await this.sessionsService.startCombat(userId, sessionId),
    );
  }

  @Post(":id/gm/combat/end")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: SessionSnapshotDto })
  async endCombat(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Combat ended.",
      await this.sessionsService.endCombat(userId, sessionId),
    );
  }

}
