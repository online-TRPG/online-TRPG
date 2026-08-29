import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RaceResponseDto } from "@trpg/shared-types";
import { RacesService } from "./races.service";
import { Public } from "../../common/auth/public.decorator";

@ApiTags("races")
@Controller("races")
@Public()
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  @ApiOkResponse({ type: [RaceResponseDto] })
  listRaces(): Promise<RaceResponseDto[]> {
    return this.racesService.listRaces();
  }
}
