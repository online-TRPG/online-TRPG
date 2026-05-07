import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  MVP_CHARACTER_LEVEL,
  MVP_CLASSES,
  MVP_MAGIC_ITEMS,
  MVP_RACES,
  MVP_SPELLS,
  MvpContentResponseDto,
} from "@trpg/shared-types";
import { ApiResponse, apiResponse } from "../../common/api-response";

@ApiTags("rules")
@Controller("rules")
export class RulesContentController {
  @Get("mvp-content")
  @ApiOkResponse({ type: MvpContentResponseDto })
  getMvpContent(): ApiResponse<MvpContentResponseDto> {
    return apiResponse("RULES_200", "MVP rules content loaded.", {
      characterLevel: MVP_CHARACTER_LEVEL,
      races: [...MVP_RACES],
      classes: [...MVP_CLASSES],
      spells: [...MVP_SPELLS],
      magicItems: [...MVP_MAGIC_ITEMS],
    });
  }
}
