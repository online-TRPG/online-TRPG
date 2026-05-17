import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnLogsModule } from "../turn-logs/turn-logs.module";
import { CombatController } from "./combat.controller";
import { CombatService } from "./combat.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";

@Module({
  imports: [SessionsModule, RulesModule, RealtimeCoreModule, TurnLogsModule],
  controllers: [CombatController],
  providers: [CombatService, SrdEngineLoaderService],
})
export class CombatModule {}
