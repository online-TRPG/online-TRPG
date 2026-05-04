import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { DiceRollRequestDto, DiceRollResponseDto } from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { DiceService } from "./dice.service";

@ApiTags("dice")
@ApiSecurity("x-user-id")
@Controller("sessions/:sessionId/dice-rolls")
export class DiceController {
  constructor(private readonly diceService: DiceService) {}

  @Post()
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: DiceRollResponseDto })
  async rollDice(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: DiceRollRequestDto,
  ): Promise<ApiResponse<DiceRollResponseDto>> {
    return apiResponse(
      "DICE_200",
      "요청이 성공했습니다.",
      await this.diceService.rollAndPersist(userId, sessionId, dto),
    );
  }
}
