import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnLogsModule } from "../turn-logs/turn-logs.module";
import { ActionProcessorService } from "./action-processor.service";
import { ActionsController } from "./actions.controller";
import { ActionsService } from "./actions.service";

@Module({
  imports: [SessionsModule, RulesModule, TurnLogsModule, RealtimeCoreModule],
  controllers: [ActionsController],
  providers: [ActionsService, ActionProcessorService],
})
export class ActionsModule {}
