import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/auth/public.decorator";

@ApiTags("health")
@Controller("health")
@Public()
export class HealthController {
  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        status: "ok",
      },
    },
  })
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }
}
