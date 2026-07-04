import { SessionCompletionFlagStoreService } from "./session-completion-flag-store.service";

describe("SessionCompletionFlagStoreService", () => {
  const service = new SessionCompletionFlagStoreService();

  it("normalizes completed combat node ids and appends the current node once", () => {
    const result = service.buildCombatCompletionFlags(
      {
        existing: true,
        completedCombatNodeIds: ["node-1", 7, "node-1"],
      },
      "node-2",
    );

    expect(result.completedCombatNodeIds).toEqual(["node-1", "node-1", "node-2"]);
    expect(result.flags).toEqual({
      existing: true,
      completedCombatNodeIds: ["node-1", "node-1", "node-2"],
    });
  });

  it("does not append a completed combat node when the current node is missing or already recorded", () => {
    expect(service.buildCombatCompletionFlags({ completedCombatNodeIds: ["node-1"] }, "node-1")).toEqual({
      flags: { completedCombatNodeIds: ["node-1"] },
      completedCombatNodeIds: ["node-1"],
    });
    expect(service.buildCombatCompletionFlags({ existing: true }, null)).toEqual({
      flags: { existing: true, completedCombatNodeIds: [] },
      completedCombatNodeIds: [],
    });
  });

  it("preserves existing flags and stores ending node completion markers", () => {
    const completedAt = new Date("2026-07-02T00:00:00.000Z");
    const flags = {
      existing: true,
      completedNodeId: "old-node",
    };

    const completionFlags = service.buildEndingNodeCompletionFlags(flags, {
      completedAt,
      nodeId: "node-final",
      reason: "ending_node",
    });

    expect(completionFlags).toEqual({
      existing: true,
      sessionCompletedAt: "2026-07-02T00:00:00.000Z",
      completedNodeId: "node-final",
      completionReason: "ending_node",
    });
  });

  it("preserves existing flags and stores party defeat markers", () => {
    const defeatedAt = new Date("2026-07-02T01:00:00.000Z");
    const flags = {
      existing: true,
      partyDefeated: false,
    };

    const defeatFlags = service.buildPartyDefeatFlags(flags, {
      defeatedAt,
      nodeId: "combat-node",
    });

    expect(defeatFlags).toEqual({
      existing: true,
      partyDefeated: true,
      partyDefeatedAt: "2026-07-02T01:00:00.000Z",
      defeatedCombatNodeId: "combat-node",
    });
  });

  it("stores a null defeated combat node when no current node exists", () => {
    const defeatedAt = new Date("2026-07-02T01:00:00.000Z");

    const defeatFlags = service.buildPartyDefeatFlags({}, {
      defeatedAt,
      nodeId: null,
    });

    expect(defeatFlags.defeatedCombatNodeId).toBeNull();
  });
});
