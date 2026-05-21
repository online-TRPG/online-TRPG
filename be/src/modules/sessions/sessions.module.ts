import { forwardRef, Module } from "@nestjs/common";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { UsersModule } from "../users/users.module";
import { MapRuntimeService } from "./map-runtime.service";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { VttMapInteractionRuntimeService } from "./vtt-map-interaction-runtime.service";

@Module({
  imports: [forwardRef(() => UsersModule), ScenariosModule],
  controllers: [SessionsController],
  providers: [SessionsService, MapRuntimeService, VttMapInteractionRuntimeService],
  exports: [SessionsService, MapRuntimeService, VttMapInteractionRuntimeService],
})
export class SessionsModule {}
