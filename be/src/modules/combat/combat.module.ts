import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnLogsModule } from "../turn-logs/turn-logs.module";
import { CombatActionService } from "./combat-action.service";
import { CombatController } from "./combat.controller";
import { CombatConditionService } from "./combat-condition.service";
import { CombatCoverService } from "./combat-cover.service";
import { CombatMapperService } from "./combat-mapper.service";
import { CombatMovementService } from "./combat-movement.service";
import { CombatMonsterActionService } from "./combat-monster-action.service";
import { CombatMonsterResourceService } from "./combat-monster-resource.service";
import { CombatReactionService } from "./combat-reaction.service";
import { CombatSpellService } from "./combat-spell.service";
import { CombatStatsService } from "./combat-stats.service";
import { CombatTargetingService } from "./combat-targeting.service";
import { CombatTerrainService } from "./combat-terrain.service";
import { CombatTurnService } from "./combat-turn.service";
import { CombatService } from "./combat.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";

@Module({
  imports: [SessionsModule, RulesModule, RealtimeCoreModule, TurnLogsModule],
  controllers: [CombatController],
  providers: [
    CombatService,
    CombatActionService,
    CombatConditionService,
    CombatCoverService,
    CombatMapperService,
    CombatMovementService,
    CombatMonsterActionService,
    CombatMonsterResourceService,
    CombatReactionService,
    CombatSpellService,
    CombatStatsService,
    CombatTargetingService,
    CombatTerrainService,
    CombatTurnService,
    SrdEngineLoaderService,
  ],
})
export class CombatModule {}
