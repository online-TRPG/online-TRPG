import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  RulebookDocumentResponseDto,
  RulebookIndexResponseDto,
} from "@trpg/shared-types";
import { RulebookService } from "./rulebook.service";

@ApiTags("rulebook")
@Controller("rules")
export class RulebookController {
  constructor(private readonly rulebookService: RulebookService) {}

  @Get("rulebooks/:ruleSetId")
  @ApiParam({ name: "ruleSetId" })
  @ApiOkResponse({ type: RulebookIndexResponseDto })
  getRulebookIndex(@Param("ruleSetId") ruleSetId: string): RulebookIndexResponseDto {
    return this.rulebookService.getRulebookIndex(ruleSetId);
  }

  @Get("rulebooks/:ruleSetId/documents/:documentSlug")
  @ApiParam({ name: "ruleSetId" })
  @ApiParam({ name: "documentSlug" })
  @ApiOkResponse({ type: RulebookDocumentResponseDto })
  getRulebookDocument(
    @Param("ruleSetId") ruleSetId: string,
    @Param("documentSlug") documentSlug: string,
  ): RulebookDocumentResponseDto {
    return this.rulebookService.getRulebookDocument(ruleSetId, documentSlug);
  }
}
