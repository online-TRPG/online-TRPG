import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { UsersModule } from "../users/users.module";
import { RealtimeCoreModule } from "./realtime-core.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [RealtimeCoreModule, SessionsModule, UsersModule],
  providers: [RealtimeGateway],
  exports: [RealtimeCoreModule],
})
export class RealtimeModule {}
