import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  AvailableActionsResponseDto,
  CombatResponseDto,
  EndTurnDto,
  StartCombatDto,
  TurnAdvanceResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { CombatService } from "./combat.service";

@ApiTags("combat")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/combat")
export class CombatController {
  constructor(private readonly combatService: CombatService) {}

  @Post("start")
  @ApiParam({ name: "sessionId" })
  @ApiCreatedResponse({ type: CombatResponseDto })
  async startCombat(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: StartCombatDto,
  ): Promise<ApiResponse<CombatResponseDto>> {
    return apiResponse(
      "COMBAT_201",
      "생성이 완료되었습니다.",
      await this.combatService.startCombat(userId, sessionId, dto),
    );
  }

  @Get()
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatResponseDto })
  async getCombat(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
  ): Promise<ApiResponse<CombatResponseDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.getCombat(userId, sessionId),
    );
  }

  @Get("character")
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: AvailableActionsResponseDto })
  async getAvailableActions(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
  ): Promise<ApiResponse<AvailableActionsResponseDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.getAvailableActions(userId, sessionId),
    );
  }

  @Post("turn/end")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: TurnAdvanceResponseDto })
  async endTurn(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: EndTurnDto,
  ): Promise<ApiResponse<TurnAdvanceResponseDto>> {
    return apiResponse(
      "TURN_200",
      "요청이 성공했습니다.",
      await this.combatService.endTurn(userId, sessionId, dto),
    );
  }
}
