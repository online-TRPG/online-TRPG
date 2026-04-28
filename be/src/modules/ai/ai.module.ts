import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { AiClient } from "./ai.client";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [SessionsModule],
  controllers: [AiController],
  providers: [AiService, AiClient],
  exports: [AiService],
})
export class AiModule {}
