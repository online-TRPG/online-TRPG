import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
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
  ScenarioAssetQueryDto,
  ScenarioAssetResponseDto,
  ScenarioQueryDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UpdateScenarioDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { ScenariosService } from "./scenarios.service";

@ApiTags("scenarios")
@Controller("scenarios")
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

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
  getScenario(@Param("id") id: string): Promise<ScenarioResponseDto> {
    return this.scenariosService.getScenario(id);
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
