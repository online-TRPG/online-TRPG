import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RaceResponseDto } from "@trpg/shared-types";
import { RacesService } from "./races.service";

@ApiTags("races")
@Controller("races")
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  @ApiOkResponse({ type: [RaceResponseDto] })
  listRaces(): Promise<RaceResponseDto[]> {
    return this.racesService.listRaces();
  }
}
