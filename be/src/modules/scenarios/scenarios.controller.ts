import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateScenarioDto,
  CreateScenarioReviewDto,
  AppealScenarioModerationDto,
  ApplyScenarioModerationActionDto,
  ForkScenarioDto,
  ScenarioAssetQueryDto,
  ScenarioAssetResponseDto,
  ScenarioCollaborationStateResponseDto,
  ScenarioModerationActionResponseDto,
  ScenarioModerationQueueItemDto,
  ScenarioQueryDto,
  ScenarioNodeImageUploadResponseDto,
  PublishScenarioDto,
  ReportScenarioDto,
  ScenarioModerationReportResponseDto,
  ScenarioModerationAppealResponseDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UpdateScenarioDto,
  UpsertScenarioCollaboratorDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { Public } from "../../common/auth/public.decorator";
import { ScenariosService } from "./scenarios.service";

@ApiTags("scenarios")
@Controller("scenarios")
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  private getOptionalUserId(request: AuthenticatedRequest): string | null {
    return request.accessTokenAuth?.userId ?? null;
  }

  @Get()
  @Public()
  @ApiOkResponse({ type: [ScenarioSummaryResponseDto] })
  listScenarios(
    @Query() query: ScenarioQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioSummaryResponseDto[]> {
    return this.scenariosService.listScenarios(query, this.getOptionalUserId(request));
  }

  @Get("mine")
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: [ScenarioSummaryResponseDto] })
  listMyScenarios(
    @CurrentUserId() userId: string,
    @Query() query: ScenarioQueryDto,
  ): Promise<ScenarioSummaryResponseDto[]> {
    return this.scenariosService.listMyScenarios(userId, query);
  }

  @Post()
  @ApiSecurity("bearer")
  @ApiCreatedResponse({ type: ScenarioResponseDto })
  createScenario(
    @CurrentUserId() userId: string,
    @Body() dto: CreateScenarioDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.createScenario(userId, dto);
  }

  @Get("moderation/queue")
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: [ScenarioModerationQueueItemDto] })
  listScenarioModerationQueue(
    @CurrentUserId() userId: string,
  ): Promise<ScenarioModerationQueueItemDto[]> {
    return this.scenariosService.listScenarioModerationQueue(userId);
  }

  @Get(":id")
  @Public()
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  getScenario(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.getScenario(id, this.getOptionalUserId(request));
  }

  @Patch(":id")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  updateScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateScenarioDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.updateScenario(userId, id, dto);
  }

  @Post(":id/publish")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioResponseDto })
  publishScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: PublishScenarioDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.publishScenario(userId, id, dto);
  }

  @Post(":id/unpublish")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  unpublishScenarioRevision(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.unpublishScenarioRevision(userId, id);
  }

  @Get(":id/collaboration")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioCollaborationStateResponseDto })
  getScenarioCollaborationState(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.getScenarioCollaborationState(userId, id);
  }

  @Put(":id/collaborators")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioCollaborationStateResponseDto })
  upsertScenarioCollaborator(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: UpsertScenarioCollaboratorDto,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.upsertScenarioCollaborator(userId, id, dto);
  }

  @Delete(":id/collaborators/:collaboratorUserId")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiParam({ name: "collaboratorUserId" })
  @ApiOkResponse({ type: ScenarioCollaborationStateResponseDto })
  removeScenarioCollaborator(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Param("collaboratorUserId") collaboratorUserId: string,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.removeScenarioCollaborator(userId, id, collaboratorUserId);
  }

  @Post(":id/reviews")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioCollaborationStateResponseDto })
  createScenarioReview(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: CreateScenarioReviewDto,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.createScenarioReview(userId, id, dto);
  }

  @Post(":id/fork")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioResponseDto })
  forkScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: ForkScenarioDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.forkScenario(userId, id, dto);
  }

  @Post(":id/report")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioModerationReportResponseDto })
  reportScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: ReportScenarioDto,
  ): Promise<ScenarioModerationReportResponseDto> {
    return this.scenariosService.reportScenario(userId, id, dto);
  }

  @Post(":id/moderation-appeals")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioModerationAppealResponseDto })
  appealScenarioModeration(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: AppealScenarioModerationDto,
  ): Promise<ScenarioModerationAppealResponseDto> {
    return this.scenariosService.appealScenarioModeration(userId, id, dto);
  }

  @Post(":id/moderation/actions")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioModerationActionResponseDto })
  applyScenarioModerationAction(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: ApplyScenarioModerationActionDto,
  ): Promise<ScenarioModerationActionResponseDto> {
    return this.scenariosService.applyScenarioModerationAction(userId, id, dto);
  }

  @Get(":id/assets")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [ScenarioAssetResponseDto] })
  listScenarioAssets(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Query() query: ScenarioAssetQueryDto,
  ): Promise<ScenarioAssetResponseDto[]> {
    return this.scenariosService.listScenarioAssets(userId, id, query);
  }

  @Post(":id/assets")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioAssetResponseDto })
  uploadScenarioAsset(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: UploadScenarioAssetDto,
  ): Promise<ScenarioAssetResponseDto> {
    return this.scenariosService.uploadScenarioAsset(userId, id, dto);
  }

  @Delete(":id/assets/:assetId")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiParam({ name: "assetId" })
  @ApiNoContentResponse()
  @HttpCode(204)
  deleteScenarioAsset(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
  ): Promise<void> {
    return this.scenariosService.deleteScenarioAsset(userId, id, assetId);
  }

  @Post(":id/nodes/:nodeId/image")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiParam({ name: "nodeId" })
  @ApiOkResponse({ type: ScenarioNodeImageUploadResponseDto })
  uploadScenarioNodeImage(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() dto: UploadScenarioNodeImageDto,
  ): Promise<ScenarioNodeImageUploadResponseDto> {
    return this.scenariosService.uploadScenarioNodeImage(userId, id, nodeId, dto);
  }

  @Delete(":id")
  @ApiSecurity("bearer")
  @ApiParam({ name: "id" })
  @ApiNoContentResponse()
  @HttpCode(204)
  deleteScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
  ): Promise<void> {
    return this.scenariosService.deleteScenario(userId, id);
  }
}
