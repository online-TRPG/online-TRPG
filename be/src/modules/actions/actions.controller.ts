import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiAcceptedResponse, ApiCreatedResponse, ApiParam, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  ActionAcceptedResponseDto,
  MainCommandResponseDto,
  RestActionDto,
  RestTargetDto,
  ResolveMainCommandCheckDto,
  SubmitActionDto,
  SubmitMainCommandDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { ActionsService } from "./actions.service";
import { MainCommandsService } from "./main-commands.service";

@ApiTags("actions")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/actions")
export class ActionsController {
  constructor(
    private readonly actionsService: ActionsService,
    private readonly mainCommandsService: MainCommandsService,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiParam({ name: "sessionId" })
  @ApiAcceptedResponse({ type: ActionAcceptedResponseDto })
  async submitAction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: SubmitActionDto,
  ): Promise<ApiResponse<ActionAcceptedResponseDto>> {
    return apiResponse(
      "ACTION_202",
      "요청이 접수되었습니다.",
      await this.actionsService.submitAction(userId, sessionId, dto),
    );
  }

  @Post("inventory/use")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: UseInventoryItemResponseDto })
  async useInventoryItem(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: UseInventoryItemDto,
  ): Promise<ApiResponse<UseInventoryItemResponseDto>> {
    return apiResponse(
      "INVENTORY_201",
      "아이템을 사용했습니다.",
      await this.actionsService.useInventoryItem(userId, sessionId, dto),
    );
  }

  @Post("rest")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: ActionAcceptedResponseDto })
  async submitRestAction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: RestActionDto,
  ): Promise<ApiResponse<ActionAcceptedResponseDto>> {
    return apiResponse(
      "ACTION_REST_201",
      "휴식을 요청했습니다.",
      await this.actionsService.submitRestAction(userId, sessionId, dto),
    );
  }

  @Post("rest/short")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: ActionAcceptedResponseDto })
  async submitShortRestAction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: RestTargetDto,
  ): Promise<ApiResponse<ActionAcceptedResponseDto>> {
    return apiResponse(
      "ACTION_REST_201",
      "짧은 휴식을 요청했습니다.",
      await this.actionsService.submitRestAction(userId, sessionId, {
        ...dto,
        restType: "short",
      }),
    );
  }

  @Post("rest/long")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: ActionAcceptedResponseDto })
  async submitLongRestAction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: RestTargetDto,
  ): Promise<ApiResponse<ActionAcceptedResponseDto>> {
    return apiResponse(
      "ACTION_REST_201",
      "긴 휴식을 요청했습니다.",
      await this.actionsService.submitRestAction(userId, sessionId, {
        characterId: dto.characterId,
        restType: "long",
      }),
    );
  }

  @Post("rest/requests/:actionId/approve")
  @ApiParam({ name: "sessionId" })
  @ApiParam({ name: "actionId" })
  @ApiCreatedResponse({ type: ActionAcceptedResponseDto })
  async approveRestAction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Param("actionId") actionId: string,
  ): Promise<ApiResponse<ActionAcceptedResponseDto>> {
    return apiResponse(
      "ACTION_REST_APPROVE_201",
      "휴식 요청을 승인했습니다.",
      await this.actionsService.approveRestAction(userId, sessionId, actionId),
    );
  }

  @Post("main-command")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: MainCommandResponseDto })
  async submitMainCommand(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: SubmitMainCommandDto,
  ): Promise<ApiResponse<MainCommandResponseDto>> {
    return apiResponse(
      "MAIN_COMMAND_201",
      "메인 명령을 처리했습니다.",
      await this.mainCommandsService.submitMainCommand(userId, sessionId, dto),
    );
  }

  @Post("main-command/check-result")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: MainCommandResponseDto })
  async resolveMainCommandCheck(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: ResolveMainCommandCheckDto,
  ): Promise<ApiResponse<MainCommandResponseDto>> {
    return apiResponse(
      "MAIN_COMMAND_CHECK_201",
      "메인 명령 판정 결과를 반영했습니다.",
      await this.mainCommandsService.resolveMainCommandCheck(userId, sessionId, dto),
    );
  }
}
