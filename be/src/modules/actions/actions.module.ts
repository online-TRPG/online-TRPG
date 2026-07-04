import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { RealtimeCoreModule } from "../realtime/realtime-core.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { TurnLogsModule } from "../turn-logs/turn-logs.module";
import { ActionProcessorService } from "./action-processor.service";
import { ActionQueueSubmissionService } from "./action-queue-submission.service";
import { ActionSubmissionContextLoaderService } from "./action-submission-context-loader.service";
import { ActionsController } from "./actions.controller";
import { ActionsService } from "./actions.service";
import { InventoryItemActionCostRuntimeService } from "./inventory-item-action-cost-runtime.service";
import { InventoryItemAttunementRuntimeService } from "./inventory-item-attunement-runtime.service";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";
import { InventoryItemConsumptionRuntimeService } from "./inventory-item-consumption-runtime.service";
import { InventoryItemContextLoaderService } from "./inventory-item-context-loader.service";
import { InventoryItemEffectApplicationService } from "./inventory-item-effect-application.service";
import { InventoryItemEffectRuntimeService } from "./inventory-item-effect-runtime.service";
import { InventoryItemMapRuntimeService } from "./inventory-item-map-runtime.service";
import { InventoryItemResultPublisherService } from "./inventory-item-result-publisher.service";
import { InventoryItemRuntimeFlagsService } from "./inventory-item-runtime-flags.service";
import { InventoryItemRuntimeStateService } from "./inventory-item-runtime-state.service";
import { InventoryItemSpellRuntimeService } from "./inventory-item-spell-runtime.service";
import { InventoryItemUseResultRuntimeService } from "./inventory-item-use-result-runtime.service";
import { InventoryPackRuntimeService } from "./inventory-pack-runtime.service";
import { InventoryPackUseRuntimeService } from "./inventory-pack-use-runtime.service";
import { MainCommandAiQueryService } from "./main-command-ai-query.service";
import { MainCommandApprovalPolicyService } from "./main-command-approval-policy.service";
import { MainCommandCheckBuilderService } from "./main-command-check-builder.service";
import { MainCommandCheckEffectAttachmentService } from "./main-command-check-effect-attachment.service";
import { MainCommandCheckEffectParserService } from "./main-command-check-effect-parser.service";
import { MainCommandCheckMovementService } from "./main-command-check-movement.service";
import { MainCommandCheckRevealService } from "./main-command-check-reveal.service";
import { MainCommandCheckRevealSyncService } from "./main-command-check-reveal-sync.service";
import { MainCommandCheckResultLogService } from "./main-command-check-result-log.service";
import { MainCommandCheckResultNarrationService } from "./main-command-check-result-narration.service";
import { MainCommandCheckResolutionService } from "./main-command-check-resolution.service";
import { MainCommandContextLoaderService } from "./main-command-context-loader.service";
import { MainCommandEndingNodeService } from "./main-command-ending-node.service";
import { MainCommandHintContextService } from "./main-command-hint-context.service";
import { MainCommandInterpreterPayloadService } from "./main-command-interpreter-payload.service";
import { MainCommandInterpreterRouteResponseService } from "./main-command-interpreter-route-response.service";
import { MainCommandInterpreterRouterService } from "./main-command-interpreter-router.service";
import { MainCommandInventoryLabelService } from "./main-command-inventory-label.service";
import { MainCommandIntentHandlersService } from "./main-command-intent-handlers.service";
import { MainCommandNpcDialogueService } from "./main-command-npc-dialogue.service";
import { MainCommandPersistenceService } from "./main-command-persistence.service";
import { MainCommandPostActionRevealService } from "./main-command-post-action-reveal.service";
import { MainCommandProgressEvidenceService } from "./main-command-progress-evidence.service";
import { MainCommandRuleFragmentService } from "./main-command-rule-fragment.service";
import { MainCommandRuleQueryService } from "./main-command-rule-query.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import { MainCommandSceneInfoService } from "./main-command-scene-info.service";
import { MainCommandSceneTransitionResponseService } from "./main-command-scene-transition-response.service";
import { MainCommandSceneTransitionResolutionService } from "./main-command-scene-transition-resolution.service";
import { MainCommandSceneTransitionStateService } from "./main-command-scene-transition-state.service";
import { MainCommandTransitionCandidateService } from "./main-command-transition-candidate.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import { MainCommandValidatorService } from "./main-command-validator.service";
import { MainCommandVttCheckResultService } from "./main-command-vtt-check-result.service";
import { MainCommandsService } from "./main-commands.service";
import { RestApprovalGuardService } from "./rest-approval-guard.service";
import { RestApprovalRequestRecorderService } from "./rest-approval-request-recorder.service";
import { RestApprovalResolutionService } from "./rest-approval-resolution.service";

@Module({
  imports: [SessionsModule, RulesModule, TurnLogsModule, RealtimeCoreModule, AiModule],
  controllers: [ActionsController],
  providers: [
    ActionsService,
    ActionProcessorService,
    ActionQueueSubmissionService,
    ActionSubmissionContextLoaderService,
    InventoryItemActionCostRuntimeService,
    InventoryItemAttunementRuntimeService,
    InventoryItemCharacterReaderService,
    InventoryItemConsumptionRuntimeService,
    InventoryItemContextLoaderService,
    InventoryItemEffectApplicationService,
    InventoryItemEffectRuntimeService,
    InventoryItemMapRuntimeService,
    InventoryItemResultPublisherService,
    InventoryItemRuntimeFlagsService,
    InventoryItemRuntimeStateService,
    InventoryItemSpellRuntimeService,
    InventoryItemUseResultRuntimeService,
    InventoryPackRuntimeService,
    InventoryPackUseRuntimeService,
    MainCommandAiQueryService,
    MainCommandApprovalPolicyService,
    MainCommandsService,
    MainCommandCheckBuilderService,
    MainCommandCheckEffectAttachmentService,
    MainCommandCheckEffectParserService,
    MainCommandCheckMovementService,
    MainCommandCheckRevealService,
    MainCommandCheckRevealSyncService,
    MainCommandCheckResultLogService,
    MainCommandCheckResultNarrationService,
    MainCommandCheckResolutionService,
    MainCommandContextLoaderService,
    MainCommandEndingNodeService,
    MainCommandHintContextService,
    MainCommandInterpreterPayloadService,
    MainCommandInterpreterRouteResponseService,
    MainCommandInterpreterRouterService,
    MainCommandInventoryLabelService,
    MainCommandIntentHandlersService,
    MainCommandNpcDialogueService,
    MainCommandPersistenceService,
    MainCommandPostActionRevealService,
    MainCommandProgressEvidenceService,
    MainCommandRuleFragmentService,
    MainCommandRuleQueryService,
    MainCommandSceneEntityService,
    MainCommandSceneInfoService,
    MainCommandSceneTransitionResponseService,
    MainCommandSceneTransitionResolutionService,
    MainCommandSceneTransitionStateService,
    MainCommandTransitionCandidateService,
    MainCommandTransitionEvaluatorService,
    MainCommandValidatorService,
    MainCommandVttCheckResultService,
    RestApprovalGuardService,
    RestApprovalRequestRecorderService,
    RestApprovalResolutionService,
  ],
})
export class ActionsModule {}
