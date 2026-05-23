import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { SessionsModule } from "../sessions/sessions.module";
import { ActionEconomyService } from "./action-economy.service";
import { ActionRuleService } from "./action-rule.service";
import { AoeTargetingService } from "./aoe-targeting.service";
import { CharacterResourceService } from "./character-resource.service";
import { CommandParserService } from "./command-parser.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";
import { ForcedMovementService } from "./forced-movement.service";
import { InventoryRuntimeService } from "./inventory-runtime.service";
import { MapPositionService } from "./map-position.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleEngineService } from "./rule-engine.service";
import { SpellScalingService } from "./spell-scaling.service";
import { StateDiffService } from "./state-diff.service";
import { TerrainEffectService } from "./terrain-effect.service";

@Module({
  imports: [SessionsModule, RealtimeCoreModule],
  controllers: [DiceController],
  providers: [
    ActionEconomyService,
    ActionRuleService,
    AoeTargetingService,
    CharacterResourceService,
    CommandParserService,
    ConditionRuntimeService,
    DiceService,
    ForcedMovementService,
    InventoryRuntimeService,
    MapPositionService,
    RuleCatalogService,
    RuleEngineService,
    SpellScalingService,
    StateDiffService,
    TerrainEffectService,
  ],
  exports: [
    ActionEconomyService,
    ActionRuleService,
    AoeTargetingService,
    CharacterResourceService,
    CommandParserService,
    ConditionRuntimeService,
    DiceService,
    ForcedMovementService,
    InventoryRuntimeService,
    MapPositionService,
    RuleCatalogService,
    RuleEngineService,
    SpellScalingService,
    StateDiffService,
    TerrainEffectService,
  ],
})
export class RulesModule {}
