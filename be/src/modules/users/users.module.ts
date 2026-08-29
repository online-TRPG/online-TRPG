import { forwardRef, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PasswordResetEmailService } from "./password-reset-email.service";
import { ProductEventsService } from "./product-events.service";
import { OAuthTransactionService } from "./oauth-transaction.service";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";

@Module({
  imports: [RealtimeCoreModule, forwardRef(() => SessionsModule)],
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordResetEmailService,
    ProductEventsService,
    OAuthTransactionService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
