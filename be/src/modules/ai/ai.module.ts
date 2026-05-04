import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { AiTraceController } from "./ai-trace.controller";
import { AiClient } from "./ai.client";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [SessionsModule],
  controllers: [AiController, AiTraceController],
  providers: [AiService, AiClient],
  exports: [AiService],
})
export class AiModule {}
