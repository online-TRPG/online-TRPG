import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiAcceptedResponse, ApiParam, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { ActionAcceptedResponseDto, SubmitActionDto } from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { ActionsService } from "./actions.service";

@ApiTags("actions")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/actions")
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

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
}
