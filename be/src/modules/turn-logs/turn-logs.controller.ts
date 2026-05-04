import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { TurnLogListResponseDto } from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { TurnLogsService } from "./turn-logs.service";

@ApiTags("turn-logs")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/turn-logs")
export class TurnLogsController {
  constructor(private readonly turnLogsService: TurnLogsService) {}

  @Get()
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: TurnLogListResponseDto })
  async listTurnLogs(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Query("cursor") cursor?: string,
    @Query("size") size?: string,
    @Query("includeStateDiff") includeStateDiff?: string,
    @Query("includeDiceResult") includeDiceResult?: string,
  ): Promise<ApiResponse<TurnLogListResponseDto>> {
    return apiResponse(
      "LOG_200",
      "요청이 성공했습니다.",
      await this.turnLogsService.listTurnLogs(userId, sessionId, {
        cursor,
        size: size ? Number(size) : undefined,
        includeStateDiff: includeStateDiff === "true",
        includeDiceResult: includeDiceResult === "true",
      }),
    );
  }
}
