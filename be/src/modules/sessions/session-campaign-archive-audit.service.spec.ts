import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import type { CampaignArchiveResponseDto } from "@trpg/shared-types";
import { SessionCampaignArchiveAuditService } from "./session-campaign-archive-audit.service";

describe("SessionCampaignArchiveAuditService", () => {
  const service = new SessionCampaignArchiveAuditService();
  const archive: CampaignArchiveResponseDto = {
    archiveId: "campaign-archive:1",
    sessionId: "session-1",
    sessionTitle: "Storm Vault",
    scenarioId: "scenario-1",
    scenarioTitle: "Storm Vault Finale",
    completedAt: "2026-07-02T00:00:00.000Z",
    completedByUserId: "host-1",
    epilogue: "The party seals the storm forever.",
    shareScope: "party",
    allowCharacterTransfer: true,
    finalNodeId: "node-final",
    finalRewardIds: ["reward-1"],
    characters: [
      {
        sessionCharacterId: "session-character-1",
        characterId: "character-1",
        userId: "player-1",
        name: "Mira",
        className: "fighter",
        subclassName: null,
        level: 5,
        status: "ACTIVE",
      },
    ],
    analytics: {
      turnLogCount: 12,
      combatCount: 3,
      completedDowntimeTaskCount: 1,
      nodeVisitCount: 8,
      sessionCharacterCount: 1,
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
        totalItemCount: 2,
        characterInventoryCounts: { "session-character-1": 2 },
      },
      combat: {
        combatCount: 3,
        turnLogCount: 12,
        nodeVisitCount: 8,
      },
      publicRevisionLineage: [],
    },
  };

  const createTx = (latestTurnNumber: number | null = 12) => ({
    turnLog: {
      findFirst: jest.fn().mockResolvedValue(latestTurnNumber === null ? null : { turnNumber: latestTurnNumber }),
      create: jest.fn().mockResolvedValue({ id: "turn-log-archive" }),
    },
    stateDiff: {
      create: jest.fn().mockResolvedValue({}),
    },
  });

  it("creates campaign completion audit turn log and state diff rows", async () => {
    const tx = createTx();

    await service.createCompletionAuditLog(tx as never, {
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      actorUserId: "host-1",
      archive,
      baseVersion: 7,
      nextVersion: 8,
    });

    expect(tx.turnLog.findFirst).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    expect(tx.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "host-1",
        turnNumber: 13,
        rawInput: "/campaign complete",
        outcome: PrismaActionOutcome.SUCCESS,
        narration: "The party seals the storm forever.",
      }),
    });

    const turnLogPayload = tx.turnLog.create.mock.calls[0][0] as {
      data: { structuredActionJson: string; stateDiffJson: string };
    };
    expect(JSON.parse(turnLogPayload.data.structuredActionJson)).toEqual({
      type: "p6_campaign_archive",
      archiveId: "campaign-archive:1",
      shareScope: "party",
      allowCharacterTransfer: true,
    });
    expect(JSON.parse(turnLogPayload.data.stateDiffJson)).toEqual({
      baseVersion: 7,
      nextVersion: 8,
      reason: "p6_campaign_archive",
      diff: {
        sessionCompletedAt: "2026-07-02T00:00:00.000Z",
        p6CampaignArchive: {
          archiveId: "campaign-archive:1",
          characterCount: 1,
          analytics: archive.analytics,
        },
      },
    });
    expect(tx.stateDiff.create).toHaveBeenCalledWith({
      data: {
        sessionScenarioId: "session-scenario-1",
        turnLogId: "turn-log-archive",
        baseVersion: 7,
        nextVersion: 8,
        reason: "p6_campaign_archive",
        diffJson: JSON.stringify({
          p6CampaignArchive: {
            archiveId: "campaign-archive:1",
            completedAt: "2026-07-02T00:00:00.000Z",
            characterCount: 1,
          },
        }),
      },
    });
  });

  it("starts turn numbering at one when no prior turn log exists", async () => {
    const tx = createTx(null);

    await service.createCompletionAuditLog(tx as never, {
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      actorUserId: "host-1",
      archive,
      baseVersion: 1,
      nextVersion: 2,
    });

    expect(tx.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        turnNumber: 1,
      }),
    });
  });
});
