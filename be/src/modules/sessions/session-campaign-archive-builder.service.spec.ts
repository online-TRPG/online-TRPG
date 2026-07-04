import { SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";
import { SessionCampaignArchiveBuilderService } from "./session-campaign-archive-builder.service";

describe("SessionCampaignArchiveBuilderService", () => {
  const runtime = new CampaignArchiveRuntimeService();
  const service = new SessionCampaignArchiveBuilderService(runtime);
  const sessionCharacters = [
    {
      id: "session-character-1",
      characterId: "character-1",
      userId: "player-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      inventorySnapshotJson: "[{\"itemId\":\"potion\"}]",
      character: {
        name: "Mira",
        className: "fighter",
        subclassName: null,
        level: 5,
        inventoryJson: "[]",
      },
    },
  ];

  it("builds a campaign archive response from completion inputs", () => {
    const archive = service.buildArchive({
      session: {
        id: "session-1",
        title: "Storm Vault",
      },
      activeScenario: {
        scenarioId: "scenario-1",
        scenario: {
          title: "Storm Vault Finale",
          attribution:
            'Original\nP3_REVISION_META:{"revisionNumber":2,"changelog":"Final","publishedAt":"2026-07-01T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
        },
      },
      state: {
        version: 7,
        currentNodeId: "node-current",
      },
      flags: {
        campaignCalendar: {
          downtimeTasks: [
            { id: "downtime-complete", status: "completed" },
            { id: "downtime-active", status: "active" },
          ],
        },
      },
      dto: {
        epilogue: " The party seals the storm forever. ",
        shareScope: "public_summary",
        allowCharacterTransfer: false,
        finalNodeId: " node-final ",
        finalRewardIds: [" reward-1 ", "reward-1", "", "reward-2"],
      },
      completedByUserId: "host-1",
      sessionCharacters,
      turnLogCount: 12,
      combatCount: 3,
      nodeVisitCount: 8,
      createId: () => "fixed-id",
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(archive).toEqual(
      expect.objectContaining({
        archiveId: "campaign-archive:fixed-id",
        sessionId: "session-1",
        sessionTitle: "Storm Vault",
        scenarioId: "scenario-1",
        scenarioTitle: "Storm Vault Finale",
        completedAt: "2026-07-02T00:00:00.000Z",
        completedByUserId: "host-1",
        epilogue: "The party seals the storm forever.",
        shareScope: "public_summary",
        allowCharacterTransfer: false,
        finalNodeId: "node-final",
        finalRewardIds: ["reward-1", "reward-2"],
        characters: [
          {
            sessionCharacterId: "session-character-1",
            characterId: "character-1",
            userId: "player-1",
            name: "Mira",
            className: "fighter",
            subclassName: null,
            level: 5,
            status: PrismaSessionCharacterStatus.ACTIVE,
          },
        ],
        analytics: {
          turnLogCount: 12,
          combatCount: 3,
          completedDowntimeTaskCount: 1,
          nodeVisitCount: 8,
          sessionCharacterCount: 1,
        },
      }),
    );
    expect(archive.snapshot).toEqual(
      expect.objectContaining({
        stateVersion: 7,
        currentNodeId: "node-current",
        downtime: expect.objectContaining({
          completedTaskCount: 1,
          activeTaskCount: 1,
        }),
        combat: {
          combatCount: 3,
          turnLogCount: 12,
          nodeVisitCount: 8,
        },
      }),
    );
  });

  it("uses current node and default sharing settings when optional fields are omitted", () => {
    const archive = service.buildArchive({
      session: {
        id: "session-1",
        title: "Storm Vault",
      },
      activeScenario: {
        scenarioId: "scenario-1",
        scenario: null,
      },
      state: {
        version: 1,
        currentNodeId: "node-current",
      },
      flags: {},
      dto: {
        epilogue: "Done.",
      },
      completedByUserId: "host-1",
      sessionCharacters: [],
      turnLogCount: 0,
      combatCount: 0,
      nodeVisitCount: 0,
      createId: () => "fixed-id",
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(archive).toEqual(
      expect.objectContaining({
        scenarioTitle: null,
        shareScope: "party",
        allowCharacterTransfer: true,
        finalNodeId: "node-current",
        finalRewardIds: [],
      }),
    );
  });
});
