import { Module } from "@nestjs/common";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { SessionsModule } from "../sessions/sessions.module";
import { ActionEconomyService } from "./action-economy.service";
import { ActionRuleService } from "./action-rule.service";
import { CharacterResourceService } from "./character-resource.service";
import { CommandParserService } from "./command-parser.service";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";
import { MapPositionService } from "./map-position.service";
import { RuleEngineService } from "./rule-engine.service";
import { StateDiffService } from "./state-diff.service";

@Module({
  imports: [SessionsModule, RealtimeCoreModule],
  controllers: [DiceController],
  providers: [
    ActionEconomyService,
    ActionRuleService,
    CharacterResourceService,
    CommandParserService,
    DiceService,
    MapPositionService,
    RuleEngineService,
    StateDiffService,
  ],
  exports: [
    ActionEconomyService,
    ActionRuleService,
    CharacterResourceService,
    CommandParserService,
    DiceService,
    MapPositionService,
    RuleEngineService,
    StateDiffService,
  ],
})
export class RulesModule {}
