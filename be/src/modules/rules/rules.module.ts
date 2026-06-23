import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { SessionsModule } from "../sessions/sessions.module";
import { ActionEconomyService } from "./action-economy.service";
import { ActionRuleService } from "./action-rule.service";
import { ActionSpellRuleService } from "./action-spell-rule.service";
import { AoeDamageService } from "./aoe-damage.service";
import { AoeTargetingService } from "./aoe-targeting.service";
import { CharacterResourceService } from "./character-resource.service";
import { CommandParserService } from "./command-parser.service";
import { ConcentrationRuntimeService } from "./concentration-runtime.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { CoverPositionService } from "./cover-position.service";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";
import { EconomyStateRuntimeService } from "./economy-state-runtime.service";
import { EconomyRuntimeService } from "./economy-runtime.service";
import { ForcedMovementService } from "./forced-movement.service";
import { GmOverrideService } from "./gm-override.service";
import { ItemInteractionService } from "./item-interaction.service";
import { InventoryRuntimeService } from "./inventory-runtime.service";
import { LevelUpService } from "./level-up.service";
import { MapPositionService } from "./map-position.service";
import { MonsterAbilityService } from "./monster-ability.service";
import { ReadyActionService } from "./ready-action.service";
import { RestResolutionService } from "./rest-resolution.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleEngineService } from "./rule-engine.service";
import { SpellScalingService } from "./spell-scaling.service";
import { SpellSlotService } from "./spell-slot.service";
import { StateDiffService } from "./state-diff.service";
import { TerrainEffectService } from "./terrain-effect.service";

@Module({
  imports: [SessionsModule, RealtimeCoreModule],
  controllers: [DiceController],
  providers: [
    ActionEconomyService,
    ActionRuleService,
    ActionSpellRuleService,
    AoeDamageService,
    AoeTargetingService,
    CharacterResourceService,
    CommandParserService,
    ConcentrationRuntimeService,
    ConditionRuntimeService,
    CoverPositionService,
    DiceService,
    EconomyStateRuntimeService,
    EconomyRuntimeService,
    ForcedMovementService,
    GmOverrideService,
    ItemInteractionService,
    InventoryRuntimeService,
    LevelUpService,
    MapPositionService,
    MonsterAbilityService,
    ReadyActionService,
    RestResolutionService,
    RuleCatalogService,
    RuleEngineService,
    SpellScalingService,
    SpellSlotService,
    StateDiffService,
    TerrainEffectService,
  ],
  exports: [
    ActionEconomyService,
    ActionRuleService,
    ActionSpellRuleService,
    AoeDamageService,
    AoeTargetingService,
    CharacterResourceService,
    CommandParserService,
    ConcentrationRuntimeService,
    ConditionRuntimeService,
    CoverPositionService,
    DiceService,
    EconomyStateRuntimeService,
    EconomyRuntimeService,
    ForcedMovementService,
    GmOverrideService,
    ItemInteractionService,
    InventoryRuntimeService,
    LevelUpService,
    MapPositionService,
    MonsterAbilityService,
    ReadyActionService,
    RestResolutionService,
    RuleCatalogService,
    RuleEngineService,
    SpellScalingService,
    SpellSlotService,
    StateDiffService,
    TerrainEffectService,
  ],
})
export class RulesModule {}
