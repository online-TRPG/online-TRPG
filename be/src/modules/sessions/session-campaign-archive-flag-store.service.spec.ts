import type { CampaignArchiveResponseDto } from "@trpg/shared-types";
import { SessionCampaignArchiveFlagStoreService } from "./session-campaign-archive-flag-store.service";

describe("SessionCampaignArchiveFlagStoreService", () => {
  const service = new SessionCampaignArchiveFlagStoreService();

  const archive: CampaignArchiveResponseDto = {
    archiveId: "campaign-archive:fixed",
    sessionId: "session-1",
    sessionTitle: "Storm Vault",
    scenarioId: "scenario-1",
    scenarioTitle: "Storm Vault Finale",
    completedAt: "2026-07-02T00:00:00.000Z",
    completedByUserId: "host-1",
    epilogue: "The party seals the storm.",
    shareScope: "party",
    allowCharacterTransfer: true,
    finalNodeId: "node-final",
    finalRewardIds: ["reward-1"],
    characters: [],
    analytics: {
      turnLogCount: 12,
      combatCount: 2,
      completedDowntimeTaskCount: 1,
      nodeVisitCount: 5,
      sessionCharacterCount: 3,
    },
    snapshot: {
      stateVersion: 7,
      currentNodeId: "node-final",
      downtime: {
        activeTaskCount: 0,
        pausedTaskCount: 0,
        completedTaskCount: 1,
        taskIds: ["downtime-1"],
      },
      economy: {
        hasEconomyState: true,
        partyStashItemCount: 1,
        walletCount: 1,
        shopCount: 1,
        craftingProgressCount: 0,
        downtimeCompletionCount: 1,
      },
      inventory: {
        totalItemCount: 0,
        characterInventoryCounts: {},
      },
      combat: {
        combatCount: 2,
        turnLogCount: 12,
        nodeVisitCount: 5,
      },
      publicRevisionLineage: null,
    },
  };

  it("preserves existing flags and stores campaign archive completion markers", () => {
    const flags = {
      existing: true,
      campaignCalendar: { day: 3 },
    };

    const completionFlags = service.buildCompletionFlags(flags, archive);

    expect(completionFlags).toEqual({
      ...flags,
      sessionCompletedAt: "2026-07-02T00:00:00.000Z",
      completedNodeId: "node-final",
      completionReason: "p6_long_campaign_archive",
      p6CampaignArchive: archive,
    });
  });

  it("stores a null completed node when the archive has no final node", () => {
    const completionFlags = service.buildCompletionFlags({}, { ...archive, finalNodeId: null });

    expect(completionFlags.completedNodeId).toBeNull();
    expect(completionFlags.sessionCompletedAt).toBe(archive.completedAt);
    expect(completionFlags.p6CampaignArchive).toEqual({ ...archive, finalNodeId: null });
  });
});
