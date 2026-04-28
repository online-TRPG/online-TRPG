import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  AiNarrationRequestDto,
  AiNarrationResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { AiService } from "./ai.service";

@ApiTags("ai")
@Controller("sessions/:sessionId/ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("narration")
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: AiNarrationResponseDto })
  async runNarration(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiNarrationRequestDto,
  ): Promise<ApiResponse<AiNarrationResponseDto>> {
    return apiResponse(
      "AI_201",
      "AI narration generated.",
      await this.aiService.runNarration(userId, sessionId, dto),
    );
  }
}
