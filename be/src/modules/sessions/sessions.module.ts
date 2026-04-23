import { forwardRef, Module } from "@nestjs/common";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { UsersModule } from "../users/users.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [forwardRef(() => UsersModule), ScenariosModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
