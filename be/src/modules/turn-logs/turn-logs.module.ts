import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { CombatPresentationService } from "../combat/combat-presentation.service";
import { TurnLogsController } from "./turn-logs.controller";
import { TurnLogsService } from "./turn-logs.service";

@Module({
  imports: [SessionsModule],
  controllers: [TurnLogsController],
  providers: [TurnLogsService, CombatPresentationService],
  exports: [TurnLogsService],
})
export class TurnLogsModule {}
