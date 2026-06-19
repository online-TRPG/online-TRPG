import { forwardRef, Module } from "@nestjs/common";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { UsersModule } from "../users/users.module";
import { HumanGmRuntimeService } from "./human-gm-runtime.service";
import { MapRuntimeService } from "./map-runtime.service";
import { SessionsController } from "./sessions.controller";
import { SessionRevealService } from "./session-reveal.service";
import { SessionSnapshotService } from "./session-snapshot.service";
import { SessionVttObjectRuntimeService } from "./session-vtt-object-runtime.service";
import { SessionsService } from "./sessions.service";
import { VttMapDoorRuntimeService } from "./vtt-map-door-runtime.service";
import { VttMapHazardRuntimeService } from "./vtt-map-hazard-runtime.service";
import { VttMapInteractionRuntimeService } from "./vtt-map-interaction-runtime.service";
import { VttMapObjectRuntimeService } from "./vtt-map-object-runtime.service";

@Module({
  imports: [forwardRef(() => UsersModule), ScenariosModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    HumanGmRuntimeService,
    SessionRevealService,
    SessionSnapshotService,
    SessionVttObjectRuntimeService,
    MapRuntimeService,
    VttMapInteractionRuntimeService,
    VttMapDoorRuntimeService,
    VttMapHazardRuntimeService,
    VttMapObjectRuntimeService,
  ],
  exports: [
    SessionsService,
    MapRuntimeService,
    VttMapInteractionRuntimeService,
    VttMapDoorRuntimeService,
    VttMapHazardRuntimeService,
    VttMapObjectRuntimeService,
  ],
})
export class SessionsModule {}
