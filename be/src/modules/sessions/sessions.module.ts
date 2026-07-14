import { forwardRef, Module } from "@nestjs/common";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { UsersModule } from "../users/users.module";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";
import { HumanGmRuntimeService } from "./human-gm-runtime.service";
import { MapRuntimeService } from "./map-runtime.service";
import { SessionsController } from "./sessions.controller";
import { SessionAccessPolicyService } from "./session-access-policy.service";
import { SessionCampaignArchiveAuditService } from "./session-campaign-archive-audit.service";
import { SessionCampaignArchiveBuilderService } from "./session-campaign-archive-builder.service";
import { SessionCampaignArchiveFlagStoreService } from "./session-campaign-archive-flag-store.service";
import { SessionCampaignCalendarActionPolicyService } from "./session-campaign-calendar-action-policy.service";
import { SessionCharacterTransferClonePayloadService } from "./session-character-transfer-clone-payload.service";
import { SessionCharacterTransferRequestStoreService } from "./session-character-transfer-request-store.service";
import { SessionCharacterVaultItemService } from "./session-character-vault-item.service";
import { SessionCharacterSelectionService } from "./session-character-selection.service";
import { SessionCompletionFlagStoreService } from "./session-completion-flag-store.service";
import { SessionDeletePolicyService } from "./session-delete-policy.service";
import { SessionEconomyService } from "./session-economy.service";
import { SessionGmRuntimeParticipantAccessService } from "./session-gm-runtime-participant-access.service";
import { SessionHumanGmAiAssistFailureAuditService } from "./session-human-gm-ai-assist-failure-audit.service";
import { SessionHumanGmAiAssistSuggestionStoreService } from "./session-human-gm-ai-assist-suggestion-store.service";
import { SessionHumanGmMessageStoreService } from "./session-human-gm-message-store.service";
import { SessionHumanGmPrivateNoteStoreService } from "./session-human-gm-private-note-store.service";
import { SessionInventoryService } from "./session-inventory.service";
import { SessionInviteService } from "./session-invite.service";
import { SessionJoinPolicyService } from "./session-join-policy.service";
import { SessionLeaveResolutionService } from "./session-leave-resolution.service";
import { SessionListFilterService } from "./session-list-filter.service";
import { SessionListItemService } from "./session-list-item.service";
import { SessionParticipantStatusService } from "./session-participant-status.service";
import { SessionPlayService } from "./session-play.service";
import { SessionPublicIdService } from "./session-public-id.service";
import { SessionRevealService } from "./session-reveal.service";
import { SessionScenarioNodeSnapshotService } from "./session-scenario-node-snapshot.service";
import { SessionScenarioRevisionSnapshotService } from "./session-scenario-revision-snapshot.service";
import { SessionScenarioLinkService } from "./session-scenario-link.service";
import { SessionSettingsService } from "./session-settings.service";
import { SessionSnapshotService } from "./session-snapshot.service";
import { SessionStartNodeService } from "./session-start-node.service";
import { SessionStartPolicyService } from "./session-start-policy.service";
import { SessionUpdatePolicyService } from "./session-update-policy.service";
import { SessionVttDefaultMapReaderService } from "./session-vtt-default-map-reader.service";
import { SessionVttInteractionPointService } from "./session-vtt-interaction-point.service";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";
import { SessionVttMapPersistenceService } from "./session-vtt-map-persistence.service";
import { SessionVttMovementFramePublisherService } from "./session-vtt-movement-frame-publisher.service";
import { SessionVttCombatMovementSpendService } from "./session-vtt-combat-movement-spend.service";
import { SessionVttMovementPolicyService } from "./session-vtt-movement-policy.service";
import { SessionVttObjectRuntimeService } from "./session-vtt-object-runtime.service";
import { SessionVttPlayerMapUpdateService } from "./session-vtt-player-map-update.service";
import { SessionsService } from "./sessions.service";
import { VttMapDoorRuntimeService } from "./vtt-map-door-runtime.service";
import { VttMapHazardRuntimeService } from "./vtt-map-hazard-runtime.service";
import { VttMapInteractionRuntimeService } from "./vtt-map-interaction-runtime.service";
import { VttMapObjectRuntimeService } from "./vtt-map-object-runtime.service";

@Module({
  imports: [forwardRef(() => UsersModule), ScenariosModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    CampaignArchiveRuntimeService,
    HumanGmRuntimeService,
    SessionAccessPolicyService,
    SessionCampaignArchiveAuditService,
    SessionCampaignArchiveBuilderService,
    SessionCampaignArchiveFlagStoreService,
    SessionCampaignCalendarActionPolicyService,
    SessionCharacterTransferClonePayloadService,
    SessionCharacterTransferRequestStoreService,
    SessionCharacterVaultItemService,
    SessionCharacterSelectionService,
    SessionCompletionFlagStoreService,
    SessionDeletePolicyService,
    SessionEconomyService,
    SessionGmRuntimeParticipantAccessService,
    SessionHumanGmAiAssistFailureAuditService,
    SessionHumanGmAiAssistSuggestionStoreService,
    SessionHumanGmMessageStoreService,
    SessionHumanGmPrivateNoteStoreService,
    SessionInventoryService,
    SessionInviteService,
    SessionJoinPolicyService,
    SessionLeaveResolutionService,
    SessionListFilterService,
    SessionListItemService,
    SessionParticipantStatusService,
    SessionPlayService,
    SessionPublicIdService,
    SessionRevealService,
    SessionScenarioLinkService,
    SessionScenarioNodeSnapshotService,
    SessionScenarioRevisionSnapshotService,
    SessionSettingsService,
    SessionSnapshotService,
    SessionStartNodeService,
    SessionStartPolicyService,
    SessionUpdatePolicyService,
    SessionVttDefaultMapReaderService,
    SessionVttInteractionPointService,
    SessionVttMapBootstrapService,
    SessionVttMapNormalizationService,
    SessionVttMapPersistenceService,
    SessionVttMovementFramePublisherService,
    SessionVttCombatMovementSpendService,
    SessionVttMovementPolicyService,
    SessionVttPlayerMapUpdateService,
    SessionVttObjectRuntimeService,
    MapRuntimeService,
    VttMapInteractionRuntimeService,
    VttMapDoorRuntimeService,
    VttMapHazardRuntimeService,
    VttMapObjectRuntimeService,
  ],
  exports: [
    SessionsService,
    MapRuntimeService,
    VttMapInteractionRuntimeService,
    VttMapDoorRuntimeService,
    VttMapHazardRuntimeService,
    VttMapObjectRuntimeService,
  ],
})
export class SessionsModule {}
