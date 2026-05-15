import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  MainCommandCategory,
  MainCommandIntent,
  MainCommandStatus,
  MainCommandScreenType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { MainCommandsService } from "./main-commands.service";

const dto: SubmitMainCommandDto = {
  commandId: "command-1",
  actorId: "session-character-1",
  intent: MainCommandIntent.OBSERVE_AREA,
  category: MainCommandCategory.OBSERVATION,
  screenType: MainCommandScreenType.EXPLORATION,
  playerText: "주변을 관찰한다",
};

const defaultInterpreterResult = {
  parsed: {
    needsClarification: false,
    action: {
      type: "freeform",
      approach: "checks the scene",
      confidence: 0.8,
      requiresRoll: false,
    },
  },
};

function createMainCommandHarness(options?: {
  screenType?: MainCommandScreenType;
  interpreterResult?: typeof defaultInterpreterResult;
}) {
  const screenType = options?.screenType ?? MainCommandScreenType.EXPLORATION;
  const aiService = {
    runInterpreter: jest.fn().mockResolvedValue(options?.interpreterResult ?? defaultInterpreterResult),
    runHint: jest.fn().mockResolvedValue({ parsed: { content: "Check the strange statue." } }),
    runSummary: jest.fn().mockResolvedValue({ parsed: { content: "Recent summary." } }),
  };
  const sessionsService = {
    revealVttObjectContentsAtPoint: jest.fn().mockResolvedValue(0),
    revealCurrentNodeCluesAfterAction: jest.fn().mockResolvedValue(0),
    buildSnapshot: jest.fn().mockResolvedValue({}),
    describeVttObjectAtPoint: jest.fn().mockResolvedValue(null),
  };
  const turnLogsService = {
    createTurnLog: jest.fn().mockResolvedValue({ turnLogId: "turn-log-1" }),
  };
  const realtimeEvents = {
    emitTurnLogCreated: jest.fn(),
    emitSessionSnapshot: jest.fn(),
  };
  const service = new MainCommandsService(
    {} as never,
    sessionsService as never,
    aiService as never,
    turnLogsService as never,
    realtimeEvents as never,
  );
  const internals = service as unknown as {
    loadContext: jest.Mock;
    loadRecentLogLines: jest.Mock;
  };
  internals.loadContext = jest.fn().mockResolvedValue({
    sessionId: "session-1",
    sessionScenarioId: "session-scenario-1",
    sessionCharacterId: "session-character-1",
    actorCharacterId: "character-1",
    inventoryItems: [],
    currentNodeId: "node-1",
    currentNodeTitle: "Scene",
    currentNodeSceneText: "A quiet room.",
    currentNodeTransitionsJson: "[]",
    currentNodeCluesJson: "[]",
    currentNodeNodeMetaJson: null,
    currentNodeFallbackNodeId: null,
  });
  internals.loadRecentLogLines = jest.fn().mockResolvedValue([]);

  const submit = (overrides: Partial<SubmitMainCommandDto>) =>
    service.submitMainCommand("user-1", "session-1", {
      ...dto,
      commandId: overrides.intent ?? MainCommandIntent.GENERAL_GM_REQUEST,
      intent: MainCommandIntent.GENERAL_GM_REQUEST,
      category: MainCommandCategory.SUPPORT,
      screenType,
      playerText: "free input",
      ...overrides,
    });

  return { service, aiService, sessionsService, turnLogsService, submit };
}

describe("MainCommandsService.submitMainCommand permission", () => {
  const createService = () => {
    const prisma = {
      sessionParticipant: { findUnique: jest.fn() },
      sessionCharacter: { findUnique: jest.fn() },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-1",
        status: PrismaSessionStatus.PLAYING,
        gmMode: PrismaGmMode.AI,
      }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiService = {};
    const turnLogsService = {};
    const realtimeEvents = {};

    return {
      service: new MainCommandsService(
        prisma as never,
        sessionsService as never,
        aiService as never,
        turnLogsService as never,
        realtimeEvents as never,
      ),
      prisma,
    };
  };

  it("rejects ownership mismatch with MAIN_COMMAND_403 CHARACTER_OWNERSHIP_MISMATCH", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    // sessionId+userId 복합키로 본인 sessionCharacter 를 조회하지만 character.ownerUserId 는 다른 유저
    // (실제로는 캐릭터 이양/공유가 도입된 뒤 발생할 시나리오)
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "another-user" },
      inventoryEntries: [],
    });

    await expect(service.submitMainCommand("user-1", "session-1", dto)).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "CHARACTER_OWNERSHIP_MISMATCH" },
      },
    });
  });

  it("rejects actor mismatch before reaching ownership check", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "user-1" },
      inventoryEntries: [],
    });

    await expect(
      service.submitMainCommand("user-1", "session-1", { ...dto, actorId: "other-character" }),
    ).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "ACTOR_MISMATCH" },
      },
    });
  });
});

describe("MainCommandsService.submitMainCommand RP action", () => {
  it("records RP actions without AI parsing or clue reveal", async () => {
    const aiService = {
      runInterpreter: jest.fn(),
    };
    const sessionsService = {
      revealVttObjectContentsAtPoint: jest.fn(),
      revealCurrentNodeCluesAfterAction: jest.fn(),
      buildSnapshot: jest.fn(),
    };
    const turnLogsService = {
      createTurnLog: jest.fn().mockResolvedValue({ turnLogId: "turn-log-1" }),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new MainCommandsService(
      {} as never,
      sessionsService as never,
      aiService as never,
      turnLogsService as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      loadContext: jest.Mock;
      loadRecentLogLines: jest.Mock;
    };
    serviceInternals.loadContext = jest.fn().mockResolvedValue({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      sessionCharacterId: "session-character-1",
      actorCharacterId: "character-1",
      inventoryItems: [],
      currentNodeId: "node-1",
      currentNodeTitle: "Scene",
      currentNodeSceneText: "A quiet room.",
      currentNodeTransitionsJson: "[]",
      currentNodeCluesJson: "[]",
      currentNodeNodeMetaJson: null,
      currentNodeFallbackNodeId: null,
    });
    serviceInternals.loadRecentLogLines = jest.fn().mockResolvedValue([]);

    const response = await service.submitMainCommand("user-1", "session-1", {
      ...dto,
      commandId: MainCommandIntent.DECLARE_RP_ACTION,
      intent: MainCommandIntent.DECLARE_RP_ACTION,
      category: MainCommandCategory.RP_ACTION,
      screenType: MainCommandScreenType.STORY,
      playerText: "nods silently",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(aiService.runInterpreter).not.toHaveBeenCalled();
    expect(sessionsService.revealCurrentNodeCluesAfterAction).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        rawInput: "nods silently",
        structuredAction: expect.objectContaining({
          intent: MainCommandIntent.DECLARE_RP_ACTION,
          actionCandidate: expect.objectContaining({
            actionSummary: "nods silently",
          }),
        }),
      }),
    );
  });
});

describe("MainCommandsService.submitMainCommand input routing", () => {
  it("handles a parsed slash command through the explicit intent handler", async () => {
    const { aiService, sessionsService, submit } = createMainCommandHarness();

    const response = await submit({
      commandId: MainCommandIntent.ASK_HINT,
      intent: MainCommandIntent.ASK_HINT,
      playerText: "Where should I look next?",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.message).toBe("Check the strange statue.");
    expect(aiService.runHint).toHaveBeenCalledTimes(1);
    expect(aiService.runInterpreter).not.toHaveBeenCalled();
    expect(sessionsService.revealCurrentNodeCluesAfterAction).not.toHaveBeenCalled();
  });

  it("persists the original slash input for main command logs", async () => {
    const { aiService, turnLogsService, submit } = createMainCommandHarness();

    const response = await submit({
      commandId: MainCommandIntent.ASK_SUMMARY,
      intent: MainCommandIntent.ASK_SUMMARY,
      category: MainCommandCategory.SUPPORT,
      playerText: "요약",
      rawInputText: "/요약",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(aiService.runSummary).toHaveBeenCalledTimes(1);
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        rawInput: "/요약",
        structuredAction: expect.objectContaining({
          intent: MainCommandIntent.ASK_SUMMARY,
        }),
      }),
    );
  });

  it("keeps the natural language body after a slash-style investigate command", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "investigate",
            approach: "flip the crate",
            confidence: 0.82,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.INVESTIGATE_OBJECT,
      intent: MainCommandIntent.INVESTIGATE_OBJECT,
      category: MainCommandCategory.OBSERVATION,
      playerText: "상자를 뒤집어본다",
    });

    expect(response.status).toBe(MainCommandStatus.GM_APPROVAL_REQUIRED);
    expect(response.actionCandidate?.actionSummary).toBe("flip the crate");
    expect(aiService.runInterpreter).toHaveBeenCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        rawText: "상자를 뒤집어본다",
        requestIntent: MainCommandIntent.INVESTIGATE_OBJECT,
      }),
    );
  });

  it("routes commandless free input through the interpreter", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "search",
            approach: "check under the crate",
            confidence: 0.91,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "상자 밑을 살펴본다",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.actionCandidate?.actionSummary).toBe("check under the crate");
    expect(aiService.runInterpreter).toHaveBeenCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        rawText: "상자 밑을 살펴본다",
        requestIntent: MainCommandIntent.GENERAL_GM_REQUEST,
      }),
    );
  });

});

describe("MainCommandsService transition condition evaluation", () => {
  const createService = () =>
    new MainCommandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const transitionDto: SubmitMainCommandDto = {
    ...dto,
    intent: MainCommandIntent.REQUEST_SCENE_TRANSITION,
    playerText: "다음 장면으로 이동한다",
  };

  const candidate = {
    transitionId: "transition-1",
    label: "북쪽 철문",
    condition: "북쪽 철문을 열었을 때",
    note: null,
    nodeId: "node-next",
    title: "북쪽 통로",
    nodeType: "exploration",
    isFallback: false,
  };

  function evaluate(
    service: MainCommandsService,
    params: {
      condition?: string | null;
      playerText?: string;
      recentLogs?: string[];
      publicClues?: string[];
    },
  ) {
    return (
      service as unknown as {
        evaluateTransitionCondition: (
          transition: typeof candidate,
          dto: SubmitMainCommandDto,
          recentLogs: string[],
          publicClues: string[],
        ) => { satisfied: boolean; needsReview: boolean; missingTerms: string[] };
      }
    ).evaluateTransitionCondition(
      { ...candidate, condition: params.condition ?? candidate.condition },
      { ...transitionDto, playerText: params.playerText ?? transitionDto.playerText },
      params.recentLogs ?? [],
      params.publicClues ?? [],
    );
  }

  it("allows default transition conditions for existing seeded scenarios", () => {
    const result = evaluate(createService(), { condition: "default", playerText: "아무 입력" });

    expect(result.satisfied).toBe(true);
  });

  it("blocks a transition when the natural language condition has no evidence", () => {
    const result = evaluate(createService(), { playerText: "아무 말이나 입력한다" });

    expect(result.satisfied).toBe(false);
    expect(result.needsReview).toBe(false);
  });

  it("allows a transition when recent logs satisfy the natural language condition", () => {
    const result = evaluate(createService(), {
      recentLogs: ["카엘: 북쪽 철문을 열었다 => 철문이 천천히 열립니다."],
    });

    expect(result.satisfied).toBe(true);
  });
});
