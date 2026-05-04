import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  AiTraceListQueryDto,
  AiTraceListResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { AiService } from "./ai.service";

@ApiTags("ai")
@Controller("sessions/:sessionId/ai-traces")
export class AiTraceController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: AiTraceListResponseDto })
  async list(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Query() query: AiTraceListQueryDto,
  ): Promise<ApiResponse<AiTraceListResponseDto>> {
    return apiResponse(
      "AI_200",
      "AI traces fetched.",
      await this.aiService.listTraces(userId, sessionId, query),
    );
  }
}
