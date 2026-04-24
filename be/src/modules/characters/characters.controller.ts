import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import {
  CharacterResponseDto,
  CreateCharacterDto,
  UpdateCharacterDto,
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

  @Get("sessions/:id/characters")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: [CharacterResponseDto] })
  listCharacters(
    @CurrentUserId() userId: string,
    @Param("id") sessionId: string,
  ): Promise<CharacterResponseDto[]> {
    return this.charactersService.listCharacters(userId, sessionId);
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
}
