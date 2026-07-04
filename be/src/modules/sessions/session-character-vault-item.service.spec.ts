import {
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
} from "@prisma/client";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";
import { SessionCharacterVaultItemService } from "./session-character-vault-item.service";

describe("SessionCharacterVaultItemService", () => {
  const service = new SessionCharacterVaultItemService(new CampaignArchiveRuntimeService());
  const createArchiveFlags = (overrides: Record<string, unknown> = {}) => ({
    p6CampaignArchive: {
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
      finalRewardIds: [],
      characters: [],
      analytics: {},
      ...overrides,
    },
  });

  const createAssignment = (flags: Record<string, unknown> | null, overrides: Record<string, unknown> = {}) => ({
    id: "session-character-1",
    sessionId: "session-1",
    characterId: "character-1",
    status: PrismaSessionCharacterStatus.ACTIVE,
    character: {
      name: "Mira",
      className: "fighter",
      subclassName: null,
      level: 5,
    },
    session: {
      title: "Storm Vault",
      sessionScenarios: [
        {
          status: PrismaSessionScenarioStatus.ACTIVE,
          gameState: {
            flagsJson: flags ? JSON.stringify(flags) : "{}",
          },
        },
      ],
    },
    ...overrides,
  });

  it("builds vault items from completed campaign archives", () => {
    expect(service.buildMany([createAssignment(createArchiveFlags())])).toEqual([
      {
        sourceSessionCharacterId: "session-character-1",
        sourceSessionId: "session-1",
        sourceSessionTitle: "Storm Vault",
        archiveId: "campaign-archive:1",
        archivedAt: "2026-07-02T00:00:00.000Z",
        characterId: "character-1",
        name: "Mira",
        className: "fighter",
        subclassName: null,
        level: 5,
        status: PrismaSessionCharacterStatus.ACTIVE,
        transferable: true,
      },
    ]);
  });

  it("skips assignments without a campaign archive", () => {
    expect(service.buildMany([createAssignment(null)])).toEqual([]);
  });

  it("uses the first scenario as fallback when no active scenario exists", () => {
    const assignment = createAssignment(null, {
      session: {
        title: "Storm Vault",
        sessionScenarios: [
          {
            status: PrismaSessionScenarioStatus.COMPLETED,
            gameState: {
              flagsJson: JSON.stringify(createArchiveFlags({ allowCharacterTransfer: false })),
            },
          },
        ],
      },
    });

    expect(service.buildMany([assignment])).toEqual([
      expect.objectContaining({
        archiveId: "campaign-archive:1",
        transferable: false,
      }),
    ]);
  });
});
