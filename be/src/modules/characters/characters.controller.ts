import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  CharacterInventoryResponseDto,
  CharacterResponseDto,
  CreateCharacterDto,
  SessionCharacterResponseDto,
  UpdateCharacterDto,
  UpdateCharacterEquipmentDto,
} from "@trpg/shared-types";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { CharactersService } from "./characters.service";

@ApiTags("characters")
@ApiSecurity("x-user-id")
@Controller()
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Post("characters")
  @ApiCreatedResponse({ type: CharacterResponseDto })
  createCharacter(
    @CurrentUserId() userId: string,
    @Body() dto: CreateCharacterDto,
  ): Promise<CharacterResponseDto> {
    return this.charactersService.createCharacter(userId, dto);
  }

  @Get("users/me/characters")
  @ApiOkResponse({ type: [CharacterResponseDto] })
  listMyCharacters(@CurrentUserId() userId: string): Promise<CharacterResponseDto[]> {
    return this.charactersService.listMyCharacters(userId);
  }

  @Get("characters/:id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: CharacterResponseDto })
  getCharacter(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
  ): Promise<CharacterResponseDto> {
    return this.charactersService.getCharacter(userId, characterId);
  }

  @Patch("characters/:id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: CharacterResponseDto })
  updateCharacter(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
    @Body() dto: UpdateCharacterDto,
  ): Promise<CharacterResponseDto> {
    return this.charactersService.updateCharacter(userId, characterId, dto);
  }

  @Delete("characters/:id")
  @ApiParam({ name: "id" })
  @ApiNoContentResponse()
  @HttpCode(204)
  async deleteCharacter(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
  ): Promise<void> {
    await this.charactersService.deleteCharacter(userId, characterId);
  }

  @Post("characters/:id/clone")
  @ApiParam({ name: "id" })
  @ApiCreatedResponse({ type: CharacterResponseDto })
  cloneCharacter(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
  ): Promise<CharacterResponseDto> {
    return this.charactersService.cloneCharacter(userId, characterId);
  }

  @Get("characters/:id/inventory")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: CharacterInventoryResponseDto })
  getInventory(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
  ): Promise<CharacterInventoryResponseDto> {
    return this.charactersService.getCharacterInventory(userId, characterId);
  }

  @Patch("characters/:id/equipment")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: CharacterResponseDto })
  updateEquipment(
    @CurrentUserId() userId: string,
    @Param("id") characterId: string,
    @Body() dto: UpdateCharacterEquipmentDto,
  ): Promise<CharacterResponseDto> {
    return this.charactersService.updateCharacterEquipment(userId, characterId, dto);
  }

  @Get("sessions/:id/characters")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [SessionCharacterResponseDto] })
  listSessionCharacters(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<SessionCharacterResponseDto[]> {
    return this.charactersService.listSessionCharacters(userId, sessionId);
  }
}
