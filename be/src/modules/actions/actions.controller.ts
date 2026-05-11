import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiAcceptedResponse, ApiCreatedResponse, ApiParam, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  ActionAcceptedResponseDto,
  MainCommandResponseDto,
  SubmitActionDto,
  SubmitMainCommandDto,
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
}
