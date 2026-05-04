import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { ActionRuleService } from "./action-rule.service";
import { CommandParserService } from "./command-parser.service";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";
import { StateDiffService } from "./state-diff.service";

@Module({
  imports: [SessionsModule],
  controllers: [DiceController],
  providers: [ActionRuleService, CommandParserService, DiceService, StateDiffService],
  exports: [ActionRuleService, CommandParserService, DiceService, StateDiffService],
})
export class RulesModule {}
