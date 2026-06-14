import { forwardRef, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [forwardRef(() => SessionsModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
