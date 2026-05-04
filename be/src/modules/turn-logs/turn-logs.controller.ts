import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiQuery, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { TurnLogListResponseDto } from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { badRequest } from "../../common/exceptions/domain-error";
import { TurnLogsService } from "./turn-logs.service";

@ApiTags("turn-logs")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/turn-logs")
export class TurnLogsController {
  constructor(private readonly turnLogsService: TurnLogsService) {}

  @Get()
  @ApiParam({ name: "sessionId" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "size", required: false })
  @ApiQuery({ name: "includeStateDiff", required: false })
  @ApiQuery({ name: "includeDiceResult", required: false })
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
        cursor: this.toOptionalCursor(cursor),
        size: this.toOptionalSize(size),
        includeStateDiff: includeStateDiff === "true",
        includeDiceResult: includeDiceResult === "true",
      }),
    );
  }

  private toOptionalCursor(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const cursor = Number(value);
    if (!Number.isInteger(cursor) || cursor < 1) {
      throw badRequest("LOG_400", "cursor 형식이 올바르지 않습니다.", {
        reason: "INVALID_CURSOR",
      });
    }

    return value;
  }

  private toOptionalSize(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }

    const size = Number(value);
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      throw badRequest("LOG_400", "size 형식이 올바르지 않습니다.", {
        reason: "INVALID_SIZE",
      });
    }

    return size;
  }
}
