import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  ScenarioQueryDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
} from "@trpg/shared-types";
import { ScenariosService } from "./scenarios.service";

@ApiTags("scenarios")
@Controller("scenarios")
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  @ApiOkResponse({ type: [ScenarioSummaryResponseDto] })
  listScenarios(
    @Query() query: ScenarioQueryDto,
  ): Promise<ScenarioSummaryResponseDto[]> {
    return this.scenariosService.listScenarios(query);
  }

  @Get(":id")
  @ApiParam({ name: "id" })
  @ApiOkResponse({ type: ScenarioResponseDto })
  getScenario(@Param("id") id: string): Promise<ScenarioResponseDto> {
    return this.scenariosService.getScenario(id);
  }
}
