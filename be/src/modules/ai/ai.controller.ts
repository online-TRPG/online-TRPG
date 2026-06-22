import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  AiHintRequestDto,
  AiHintResponseDto,
  AiHumanGmAssistSuggestionRequestDto,
  AiNarrationRequestDto,
  AiNarrationResponseDto,
  AiNpcDialogueRequestDto,
  AiNpcDialogueResponseDto,
  AiSummaryRequestDto,
  AiSummaryResponseDto,
  HumanGmAiAssistSuggestionDto,
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

  @Post("hint")
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: AiHintResponseDto })
  async runHint(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiHintRequestDto,
  ): Promise<ApiResponse<AiHintResponseDto>> {
    return apiResponse(
      "AI_201",
      "AI hint generated.",
      await this.aiService.runHint(userId, sessionId, dto),
    );
  }

  @Post("gm-assist-suggestion")
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: HumanGmAiAssistSuggestionDto })
  async generateHumanGmAssistSuggestion(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiHumanGmAssistSuggestionRequestDto,
  ): Promise<ApiResponse<HumanGmAiAssistSuggestionDto>> {
    return apiResponse(
      "AI_201",
      "AI GM assist suggestion generated.",
      await this.aiService.generateHumanGmAssistSuggestion(userId, sessionId, dto),
    );
  }

  @Post("summary")
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: AiSummaryResponseDto })
  async runSummary(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiSummaryRequestDto,
  ): Promise<ApiResponse<AiSummaryResponseDto>> {
    return apiResponse(
      "AI_201",
      "AI summary generated.",
      await this.aiService.runSummary(userId, sessionId, dto),
    );
  }

  @Post("npc-dialogue")
  @ApiSecurity("bearer")
  @ApiSecurity("x-user-id")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: AiNpcDialogueResponseDto })
  async runNpcDialogue(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AiNpcDialogueRequestDto,
  ): Promise<ApiResponse<AiNpcDialogueResponseDto>> {
    return apiResponse(
      "AI_201",
      "AI NPC dialogue generated.",
      await this.aiService.runNpcDialogue(userId, sessionId, dto),
    );
  }
}
