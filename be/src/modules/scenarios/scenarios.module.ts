import { Module } from "@nestjs/common";
import { ScenarioCollaborationPolicyService } from "./scenario-collaboration-policy.service";
import { ScenariosController } from "./scenarios.controller";
import { ScenariosService } from "./scenarios.service";

@Module({
  controllers: [ScenariosController],
  providers: [ScenarioCollaborationPolicyService, ScenariosService],
  exports: [ScenarioCollaborationPolicyService, ScenariosService],
})
export class ScenariosModule {}
