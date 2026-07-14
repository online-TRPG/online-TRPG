import { forwardRef, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PasswordResetEmailService } from "./password-reset-email.service";
import { ProductEventsService } from "./product-events.service";

@Module({
  imports: [forwardRef(() => SessionsModule)],
  controllers: [UsersController],
  providers: [UsersService, PasswordResetEmailService, ProductEventsService],
  exports: [UsersService],
})
export class UsersModule {}
