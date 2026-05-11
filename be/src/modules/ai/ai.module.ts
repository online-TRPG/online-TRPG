import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnLogsModule } from "../turn-logs/turn-logs.module";
import { AiTraceController } from "./ai-trace.controller";
import { AiClient } from "./ai.client";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [SessionsModule, TurnLogsModule],
  controllers: [AiController, AiTraceController],
  providers: [AiService, AiClient],
  exports: [AiService],
})
export class AiModule {}
