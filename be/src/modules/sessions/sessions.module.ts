import { Module } from "@nestjs/common";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { UsersModule } from "../users/users.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [UsersModule, ScenariosModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
