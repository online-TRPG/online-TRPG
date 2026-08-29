import { ScenarioNodeType } from "@trpg/shared-types";
import type { PrismaService } from "../../database/prisma.service";
import { MainCommandProgressEvidenceService } from "./main-command-progress-evidence.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import type { TransitionCandidate } from "./main-command-transition-evaluator.service";

const context: LoadedContext = {
  sessionId: "session-1",
  sessionScenarioId: "session-scenario-1",
  sessionCharacterId: "session-character-1",
  actorCharacterId: "character-1",
  inventoryItems: [],
  currentNodeId: "node-current",
  currentNodeTitle: "현재 장면",
  currentNodeSceneText: "현재 장면 설명",
  currentNodeTransitionsJson: "[]",
  currentNodeCluesJson: JSON.stringify([
    { id: "clue-current", title: "현재 단서", handoutText: "현재 장면의 단서" },
  ]),
  currentNodeNodeMetaJson: null,
  currentNodeFallbackNodeId: null,
  flagsJson: JSON.stringify({ completedCombatNodeIds: ["node-current"] }),
};

function createCandidate(overrides: Partial<TransitionCandidate>): TransitionCandidate {
  return {
    transitionId: "transition-1",
    label: "다음 장면",
    condition: null,
    conditionRule: null,
    note: null,
    nodeId: "node-next",
    title: "다음 장면",
    nodeType: ScenarioNodeType.STORY,
    isFallback: false,
    ...overrides,
  };
}

function createService() {
  const sessionRevealFindMany = jest.fn();
  const sessionNodeVisitFindMany = jest.fn();
  const turnLogFindMany = jest.fn();
  const prisma = {
    sessionReveal: { findMany: sessionRevealFindMany },
    sessionNodeVisit: { findMany: sessionNodeVisitFindMany },
    turnLog: { findMany: turnLogFindMany },
  } as unknown as PrismaService;
  const service = new MainCommandProgressEvidenceService(
    prisma,
    new MainCommandTransitionEvaluatorService(),
  );

  return {
    service,
    sessionRevealFindMany,
    sessionNodeVisitFindMany,
    turnLogFindMany,
  };
}

describe("MainCommandProgressEvidenceService", () => {
  it("returns recent log lines chronologically and caps each line at its latest 1000 characters", async () => {
    const harness = createService();
    harness.turnLogFindMany.mockResolvedValue([
      { rawInput: "new-input", narration: "N".repeat(1200) },
      { rawInput: "old-input", narration: "old-narration" },
    ]);

    const lines = await harness.service.loadRecentLogLines("session-1");

    expect(harness.turnLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { turnNumber: "desc" },
        take: 12,
      }),
    );
    expect(lines[0]).toBe("old-input => old-narration");
    expect(lines[1]).toHaveLength(1000);
    expect(lines[1]).toBe("N".repeat(1000));
  });

  it("queries only IDs required by structured transition conditions", async () => {
    const harness = createService();
    harness.sessionRevealFindMany.mockResolvedValue([
      {
        contentId: "clue-required",
        snapshotJson: JSON.stringify({ title: "필수 단서", handoutText: "확인한 단서" }),
      },
    ]);
    harness.sessionNodeVisitFindMany.mockResolvedValue([{ nodeId: "node-required" }]);
    const candidate = createCandidate({
      conditionRule: {
        logic: "ALL",
        requirements: [
          { type: "CLUE_REVEALED", targetId: "clue-required" },
          { type: "NODE_VISITED", targetId: "node-required" },
          { type: "FLAG_SET", flagKey: "gateOpen" },
        ],
      },
    });

    const evidence = await harness.service.buildTransitionEvidence(context, [], [candidate]);

    expect(harness.sessionRevealFindMany).toHaveBeenCalledTimes(1);
    expect(harness.sessionRevealFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contentId: { in: ["clue-required"] } }),
      }),
    );
    expect(harness.sessionNodeVisitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nodeId: { in: ["node-required"] } }),
      }),
    );
    expect(evidence.revealedClueIds).toEqual(["clue-required"]);
    expect(evidence.visitedNodeIds).toEqual(["node-required"]);
    expect(evidence.unrevealedClues).toEqual([]);
  });

  it("caps natural-language clue evidence at the latest 50 reveals", async () => {
    const harness = createService();
    harness.sessionRevealFindMany.mockResolvedValue([]);
    const candidate = createCandidate({
      condition: "현재 단서를 확인하면 이동 가능",
    });

    await harness.service.buildTransitionEvidence(context, ["현재 단서를 확인했다."], [candidate]);

    expect(harness.sessionRevealFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { revealedAt: "desc" },
        take: 50,
      }),
    );
    expect(harness.sessionNodeVisitFindMany).not.toHaveBeenCalled();
  });

  it("skips reveal and visit queries for automatic transitions", async () => {
    const harness = createService();
    const candidate = createCandidate({ condition: "default" });

    const evidence = await harness.service.buildTransitionEvidence(context, [], [candidate]);

    expect(harness.sessionRevealFindMany).not.toHaveBeenCalled();
    expect(harness.sessionNodeVisitFindMany).not.toHaveBeenCalled();
    expect(evidence.revealedClueIds).toEqual([]);
    expect(evidence.visitedNodeIds).toEqual([]);
  });
});
