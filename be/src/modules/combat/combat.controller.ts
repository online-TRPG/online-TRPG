import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApplyCombatDamageDto,
  AutoMonsterTurnDto,
  AvailableActionsResponseDto,
  CastCombatSpellDto,
  CombatBasicActionDto,
  CombatActionResultDto,
  CombatMoveResultDto,
  CombatReactionResponseDto,
  CombatResponseDto,
  EquippedWeaponAttackDto,
  EndTurnDto,
  ForceMoveCombatParticipantDto,
  MoveCombatParticipantDto,
  ResolveCombatAttackDto,
  StartCombatDto,
  TurnAdvanceResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { CombatService } from "./combat.service";

class CombatReactionRequestDto implements CombatReactionResponseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reactionId!: string;
}

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

  @Post("end")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatResponseDto })
  async endCombat(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
  ): Promise<ApiResponse<CombatResponseDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.endCombat(userId, sessionId),
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

  @Post("move")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async moveParticipant(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: MoveCombatParticipantDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.moveParticipant(userId, sessionId, dto),
    );
  }

  @Post("force-move")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async forceMoveParticipant(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: ForceMoveCombatParticipantDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.forceMoveParticipant(userId, sessionId, dto),
    );
  }

  @Post("reactions/accept")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async acceptReaction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatReactionRequestDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.acceptReaction(userId, sessionId, dto),
    );
  }

  @Get("reactions/accept")
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async acceptReactionLegacyGet(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Query() dto: CombatReactionRequestDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.acceptReaction(userId, sessionId, dto),
    );
  }

  @Post("reactions/decline")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async declineReaction(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatReactionRequestDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.declineReaction(userId, sessionId, dto),
    );
  }

  @Get("reactions/decline")
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatMoveResultDto })
  async declineReactionLegacyGet(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Query() dto: CombatReactionRequestDto,
  ): Promise<ApiResponse<CombatMoveResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.declineReaction(userId, sessionId, dto),
    );
  }

  @Post("damage")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async applyDamage(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: ApplyCombatDamageDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.applyDamage(userId, sessionId, dto),
    );
  }

  @Post("attack")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async resolveAttack(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: ResolveCombatAttackDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.resolveAttack(userId, sessionId, dto),
    );
  }

  @Post("attack/equipped")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async resolveEquippedWeaponAttack(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: EquippedWeaponAttackDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.resolveEquippedWeaponAttack(userId, sessionId, dto),
    );
  }

  @Post("attack/offhand")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async resolveOffhandWeaponAttack(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: EquippedWeaponAttackDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.resolveOffhandWeaponAttack(userId, sessionId, dto),
    );
  }

  @Post("features/sneak-attack")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async resolveSneakAttack(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: EquippedWeaponAttackDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.resolveSneakAttack(userId, sessionId, dto),
    );
  }

  @Post("spells/cast")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async castSpell(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CastCombatSpellDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.castSpell(userId, sessionId, dto),
    );
  }

  @Post("features/second-wind")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async useSecondWind(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatBasicActionDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.useSecondWind(userId, sessionId, dto),
    );
  }

  @Post("dash")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async dash(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatBasicActionDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.dash(userId, sessionId, dto),
    );
  }

  @Post("dodge")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async dodge(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatBasicActionDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.dodge(userId, sessionId, dto),
    );
  }

  @Post("hide")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async hide(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CombatBasicActionDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.hide(userId, sessionId, dto),
    );
  }

  @Post("monster/act")
  @HttpCode(200)
  @ApiParam({ name: "sessionId" })
  @ApiOkResponse({ type: CombatActionResultDto })
  async autoMonsterTurn(
    @CurrentUserId() userId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AutoMonsterTurnDto,
  ): Promise<ApiResponse<CombatActionResultDto>> {
    return apiResponse(
      "COMBAT_200",
      "요청이 성공했습니다.",
      await this.combatService.autoMonsterTurn(userId, sessionId, dto),
    );
  }
}
