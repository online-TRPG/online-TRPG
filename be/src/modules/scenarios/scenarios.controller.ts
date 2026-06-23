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
  ScenarioAssetQueryDto,
  ScenarioAssetResponseDto,
  ScenarioCollaborationStateResponseDto,
  ScenarioQueryDto,
  ScenarioNodeImageUploadResponseDto,
  PublishScenarioDto,
  ReportScenarioDto,
  ScenarioModerationReportResponseDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UpdateScenarioDto,
  UpsertScenarioCollaboratorDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { ScenariosService } from "./scenarios.service";

@ApiTags("scenarios")
@Controller("scenarios")
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  private getOptionalUserId(request: AuthenticatedRequest): string | null {
    if (request.accessTokenAuth?.userId) {
      return request.accessTokenAuth.userId;
    }

    const fallbackUserId = request.headers["x-user-id"];
    return typeof fallbackUserId === "string" && fallbackUserId ? fallbackUserId : null;
  }

  @Get()
  @ApiOkResponse({ type: [ScenarioSummaryResponseDto] })
  listScenarios(
    @Query() query: ScenarioQueryDto,
  ): Promise<ScenarioSummaryResponseDto[]> {
    return this.scenariosService.listScenarios(query);
  }

  @Get("mine")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [ScenarioSummaryResponseDto] })
  listMyScenarios(
    @CurrentUserId() userId: string,
    @Query() query: ScenarioQueryDto,
  ): Promise<ScenarioSummaryResponseDto[]> {
    return this.scenariosService.listMyScenarios(userId, query);
  }

  @Post()
  @ApiSecurity("x-user-id")
  @ApiCreatedResponse({ type: ScenarioResponseDto })
  createScenario(
    @CurrentUserId() userId: string,
    @Body() dto: CreateScenarioDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.createScenario(userId, dto);
  }

  @Get(":id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  getScenario(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.getScenario(id, this.getOptionalUserId(request));
  }

  @Patch(":id")
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  unpublishScenarioRevision(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.unpublishScenarioRevision(userId, id);
  }

  @Get(":id/collaboration")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioCollaborationStateResponseDto })
  getScenarioCollaborationState(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.getScenarioCollaborationState(userId, id);
  }

  @Put(":id/collaborators")
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioCollaborationStateResponseDto })
  createScenarioReview(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: CreateScenarioReviewDto,
  ): Promise<ScenarioCollaborationStateResponseDto> {
    return this.scenariosService.createScenarioReview(userId, id, dto);
  }

  @Post(":id/report")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: ScenarioModerationReportResponseDto })
  reportScenario(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: ReportScenarioDto,
  ): Promise<ScenarioModerationReportResponseDto> {
    return this.scenariosService.reportScenario(userId, id, dto);
  }

  @Get(":id/assets")
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
  @ApiSecurity("x-user-id")
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
