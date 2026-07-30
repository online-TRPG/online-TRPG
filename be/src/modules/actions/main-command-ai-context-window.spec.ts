import { MainCommandTargetType } from "@trpg/shared-types";
import { MainCommandAiQueryService } from "./main-command-ai-query.service";
import { MainCommandInterpreterPayloadService } from "./main-command-interpreter-payload.service";
import { MainCommandNpcDialogueService } from "./main-command-npc-dialogue.service";

const context = {
  sessionId: "session-1",
  actorCharacterId: "character-1",
  currentNodeId: "node-1",
  currentNodeTitle: "현재 장면",
  currentNodeSceneText: "현재 장면 설명",
} as never;

describe("main-command AI context windows", () => {
  it("sends the latest five logs to Director", async () => {
    const aiService = {
      runHint: jest.fn().mockResolvedValue({ parsed: { content: "힌트" } }),
    };
    const hintContext = {
      loadUntriggeredVttEventHintSummaries: jest.fn().mockResolvedValue([]),
      areAllPublicCluesRevealed: jest.fn(),
    };
    const service = new MainCommandAiQueryService(aiService as never, hintContext as never);

    await service.handleHint(
      "request-1",
      "user-1",
      context,
      { playerText: "힌트" } as never,
      ["log-1", "log-2", "log-3", "log-4", "log-5", "log-6", "log-7"],
      [],
    );

    expect(aiService.runHint).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        recentLogs: ["log-3", "log-4", "log-5", "log-6", "log-7"],
      }),
      expect.objectContaining({ contextSource: "SERVER_VALIDATED" }),
    );
  });

  it("does not promote mixed recent context to trusted Summary logs", async () => {
    const aiService = {
      runSummary: jest.fn().mockResolvedValue({ parsed: { content: "요약" } }),
    };
    const service = new MainCommandAiQueryService(aiService as never, {} as never);

    await service.handleSummary(
      "request-1",
      "user-1",
      context,
      { playerText: "요약" } as never,
      ["player raw input => confirmed narration"],
    );

    expect(aiService.runSummary).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      {
        summaryType: "player_visible",
        rangeType: "RECENT",
        lastLogCount: 12,
      },
      {
        emitSystemMessage: false,
        contextSource: "SERVER_VALIDATED",
      },
    );
  });

  it("sends the latest six logs to NPC dialogue", async () => {
    const aiService = {
      runNpcDialogue: jest.fn().mockResolvedValue({ parsed: { dialogue: "대답" } }),
    };
    const sceneEntity = {
      resolveEntity: jest.fn().mockReturnValue({
        id: "npc-1",
        name: "밀라",
        summary: "침착한 안내인",
        disposition: "neutral",
        kind: MainCommandTargetType.NPC,
      }),
    };
    const service = new MainCommandNpcDialogueService(aiService as never, sceneEntity as never);

    await service.handleNpcDialogue(
      "request-1",
      "user-1",
      context,
      { playerText: "안녕" } as never,
      [{ kind: MainCommandTargetType.NPC }] as never,
      ["log-1", "log-2", "log-3", "log-4", "log-5", "log-6", "log-7"],
    );

    expect(aiService.runNpcDialogue).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        recentContext: ["log-2", "log-3", "log-4", "log-5", "log-6", "log-7"],
      }),
      expect.objectContaining({ contextSource: "SERVER_VALIDATED" }),
    );
  });

  it("bounds Interpreter targets while preserving the explicitly selected target", () => {
    const entities = Array.from({ length: 60 }, (_, index) => ({
      id: `entity-${index}`,
      name: `name-${index}-${"n".repeat(140)}`,
      summary: `summary-${index}-${"s".repeat(600)}`,
      disposition: `disposition-${index}-${"d".repeat(100)}`,
      kind: MainCommandTargetType.NPC,
    }));
    const selected = entities[59];
    const sceneEntity = {
      resolveEntity: jest.fn().mockReturnValue(selected),
    };
    const service = new MainCommandInterpreterPayloadService(sceneEntity as never);

    const payload = service.buildInterpreterPayload(
      {
        sessionId: "session-1",
        actorCharacterId: "character-1",
        currentNodeId: "node-1",
        currentNodeTitle: "현재 장면",
        currentNodeSceneText: "scene".repeat(300),
      } as never,
      {
        playerText: "대상을 조사한다",
        targetId: selected.id,
        targetType: MainCommandTargetType.NPC,
      } as never,
      entities as never,
      Array.from({ length: 8 }, (_, index) => `log-${index}-${"l".repeat(1100)}`),
    );

    expect(payload.availableTargets).toHaveLength(50);
    expect(payload.availableTargets?.[0]).toBe(selected.id);
    expect(payload.availableTargetDetails).toHaveLength(12);
    expect(payload.availableTargetDetails?.[0]?.id).toBe(selected.id);
    expect(payload.availableTargetDetails?.every((entity) => entity.name.length <= 120)).toBe(true);
    expect(payload.availableTargetDetails?.every((entity) => (entity.summary?.length ?? 0) <= 500)).toBe(true);
    expect(payload.recentLogs).toHaveLength(6);
    expect(payload.recentLogs?.every((log) => log.length <= 1000)).toBe(true);
    expect(payload.sceneSummary).toHaveLength(1000);
  });
});
