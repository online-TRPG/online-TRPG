import {
  BadRequestException,
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
  CreateSessionDto,
  CreateHumanGmAiAssistSuggestionDto,
  CreateVttMapPingDto,
  GameStateResponseDto,
  GrantHumanGmInventoryItemDto,
  HumanGmMessageDto,
  HumanGmAiAssistSuggestionDto,
  HumanGmNodeMoveOptionDto,
  HumanGmPrivateNoteDto,
  JoinSessionDto,
  MoveSessionTokenDto,
  ParticipantStatusResponseDto,
  PlayerScenarioViewDto,
  ReportHumanGmAiAssistApplicationFailureDto,
  RevealSessionContentDto,
  RemoveHumanGmInventoryItemDto,
  SelectSessionCharacterDto,
  SetHumanGmDifficultyClassDto,
  SessionRevealResponseDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SessionStatus,
  UpdateHumanGmDto,
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

@ApiTags("sessions")
@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly mapRuntimeService: MapRuntimeService,
  ) {}

  @Get()
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionListItemResponseDto] })
  async listSessions(
    @CurrentUserId() userId: string,
    @Query("status") status?: string,
    @Query("scenarioId") scenarioId?: string,
    @Query("ruleSetId") ruleSetId?: string,
    @Query("page") page = "0",
    @Query("size") size = "10",
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const currentPage = this.toPageNumber(page);
    const pageSize = this.toPageSize(size);
    const result = await this.sessionsService.listAvailableSessions({
      status: this.toSessionStatus(status),
      scenarioId,
      ruleSetId,
      requesterUserId: userId,
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

  @Patch(":id/gm")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: SessionSnapshotDto })
  async updateHumanGm(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
    @Body() dto: UpdateHumanGmDto,
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_200",
      "Human GM updated.",
      await this.sessionsService.updateHumanGm(userId, sessionId, dto),
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
  ): Promise<ApiResponse<SessionSnapshotDto>> {
    return apiResponse(
      "SESSION_201",
      "Session joined.",
      await this.sessionsService.joinSessionById(userId, sessionId),
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

  private toSessionStatus(value: string | undefined): SessionStatus | undefined {
    if (!value) {
      return undefined;
    }

    const match = Object.values(SessionStatus).find((status) => status === value.toLowerCase());
    if (!match) {
      throw new BadRequestException("Invalid session status.");
    }

    return match;
  }

  private toPageNumber(value: string): number {
    const page = Number(value);
    if (!Number.isInteger(page) || page < 0) {
      throw new BadRequestException("Invalid page value.");
    }
    return page;
  }

  private toPageSize(value: string): number {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      throw new BadRequestException("Invalid size value.");
    }
    return size;
  }
}
