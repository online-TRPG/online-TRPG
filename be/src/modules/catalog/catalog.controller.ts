import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  RuleCatalogReferenceDto,
} from "@trpg/shared-types";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("items")
  @ApiOkResponse({ type: [ItemResponseDto] })
  listItems(): Promise<ItemResponseDto[]> {
    return this.catalogService.listItems();
  }

  @Get("classes")
  @ApiOkResponse({ type: [ClassDefinitionResponseDto] })
  listClasses(): Promise<ClassDefinitionResponseDto[]> {
    return this.catalogService.listClasses();
  }

  @Get("rule-catalog")
  @ApiOkResponse({ type: [RuleCatalogReferenceDto] })
  listRuleCatalog(): RuleCatalogReferenceDto[] {
    return this.catalogService.listRuleCatalog();
  }
}
