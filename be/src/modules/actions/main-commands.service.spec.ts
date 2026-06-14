import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionOutcome,
  MainCommandCategory,
  MainCommandIntent,
  MainCommandStatus,
  MainCommandScreenType,
  MainCommandTargetType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { MainCommandsService } from "./main-commands.service";

type HarnessInterpreterResult = {
  parsed: {
    needsClarification: boolean;
    clarificationQuestion?: string | null;
    action: {
      type: string;
      targetId?: string | null;
      spellId?: string | null;
      ability?: string | null;
      skill?: string | null;
      approach: string;
      confidence: number;
      requiresRoll: boolean;
      suggestedDifficulty?: string | null;
    };
  };
};

const dto: SubmitMainCommandDto = {
  commandId: "command-1",
  actorId: "session-character-1",
  intent: MainCommandIntent.OBSERVE_AREA,
  category: MainCommandCategory.OBSERVATION,
  screenType: MainCommandScreenType.EXPLORATION,
  playerText: "주변을 관찰한다",
};

const defaultInterpreterResult: HarnessInterpreterResult = {
  parsed: {
    needsClarification: false,
    action: {
      type: "OUT_OF_SCOPE",
      targetId: null,
      approach: "checks the scene",
      confidence: 0.8,
      requiresRoll: false,
    },
  },
};

function createMainCommandHarness(options?: {
  screenType?: MainCommandScreenType;
  interpreterResult?: HarnessInterpreterResult;
  nodeMetaJson?: string | null;
  vttMap?: Record<string, unknown>;
  revealedEventIds?: string[];
}) {
  const screenType = options?.screenType ?? MainCommandScreenType.EXPLORATION;
  const prisma = {
    gameState: {
      update: jest.fn().mockResolvedValue({}),
    },
    sessionReveal: {
      findMany: jest.fn().mockResolvedValue(
        (options?.revealedEventIds ?? []).map((contentId) => ({ contentId })),
      ),
    },
  };
  const aiService = {
    runInterpreter: jest.fn().mockResolvedValue(options?.interpreterResult ?? defaultInterpreterResult),
    runHint: jest.fn().mockResolvedValue({ parsed: { content: "Check the strange statue." } }),
    runSummary: jest.fn().mockResolvedValue({ parsed: { content: "Recent summary." } }),
    runNpcDialogue: jest.fn().mockResolvedValue({ parsed: { dialogue: "Hello." } }),
    runCheckResult: jest.fn().mockResolvedValue({
      parsed: { narration: "판정에 성공했습니다. 의미 있는 정보를 얻습니다.", rewardInfo: "정보" },
    }),
  };
  const sessionsService = {
    getSessionEntityOrThrow: jest.fn().mockResolvedValue({
      id: "session-1",
      gmMode: PrismaGmMode.AI,
      status: PrismaSessionStatus.PLAYING,
    }),
    ensureMembership: jest.fn().mockResolvedValue(undefined),
    getGameStateEntityOrThrow: jest.fn().mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { currentNodeId: "node-1", flagsJson: "{}" },
    }),
    moveSessionCharacterTokenToMapPoint: jest.fn().mockResolvedValue({
      status: MainCommandStatus.RESOLVED,
      message: "임시은이(가) 목표 위치로 이동했습니다.",
      map: null,
    }),
    revealVttObjectContentsAtPoint: jest.fn().mockResolvedValue({
      count: 0,
      revealedClues: [],
      revealedItems: [],
    }),
    revealObservableVttObjectsInPartyVision: jest.fn().mockResolvedValue({ count: 0, objectNames: [] }),
    revealCurrentNodeCluesAfterAction: jest.fn().mockResolvedValue(0),
    revealCurrentNodeCluesAfterActionWithDetails: jest.fn().mockResolvedValue([]),
    completeSessionFromEndingNode: jest.fn().mockResolvedValue({}),
    buildSnapshot: jest.fn().mockResolvedValue({}),
    describeVttObjectAtPoint: jest.fn().mockResolvedValue(null),
    getVttMapForSessionScenario: jest.fn().mockResolvedValue(
      options?.vttMap ?? {
        id: "map-1",
        scenarioNodeId: "node-1",
        imageUrl: null,
        gridType: "square",
        gridSize: 64,
        width: 1280,
        height: 832,
        tokens: [],
        fogRects: [],
        objectCells: [],
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    ),
  };
  const turnLogsService = {
    createTurnLog: jest.fn().mockResolvedValue({ turnLogId: "turn-log-1" }),
  };
  const realtimeEvents = {
    emitTurnLogCreated: jest.fn(),
    emitSessionSnapshot: jest.fn(),
  };
  const service = new MainCommandsService(
    prisma as never,
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
    currentNodeNodeMetaJson: options?.nodeMetaJson ?? null,
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

  return { service, prisma, aiService, sessionsService, turnLogsService, submit };
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
    // 실제 서비스에서 캐릭터 이양/공유가 도입된 뒤 발생할 수 있는 시나리오를 확인한다.
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

  it("adds untriggered VTT proximity events to hint context", async () => {
    const { aiService, submit } = createMainCommandHarness({
      vttMap: {
        id: "map-1",
        scenarioNodeId: "node-1",
        imageUrl: null,
        gridType: "square",
        gridSize: 64,
        width: 1280,
        height: 832,
        tokens: [],
        fogRects: [{ id: "fog-1", x: 0, y: 0, width: 640, height: 640 }],
        objectCells: [
          {
            id: "object-secret-door",
            name: "수상한 석상",
            x: 320,
            y: 320,
            width: 64,
            height: 64,
            visibleToPlayers: true,
            events: [
              {
                id: "event-secret-room-fog",
                name: "숨겨진 공간 발견",
                type: "REVEAL_FOG_ON_PROXIMITY",
                trigger: { distanceFeet: 15, once: true },
                effect: { revealRadiusFeet: 30 },
              },
            ],
          },
        ],
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    });

    await submit({
      commandId: MainCommandIntent.ASK_HINT,
      intent: MainCommandIntent.ASK_HINT,
      playerText: "힌트",
    });

    expect(aiService.runHint).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        publicClues: expect.arrayContaining([
          expect.stringContaining("수상한 석상"),
        ]),
      }),
      { emitSystemMessage: false },
    );
  });

  it("moves the actor token when special movement succeeds without a check", async () => {
    const { sessionsService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "SPECIAL_MOVE",
            targetId: null,
            approach: "vaults across the gap",
            confidence: 0.95,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.SPECIAL_MOVE,
      intent: MainCommandIntent.SPECIAL_MOVE,
      category: MainCommandCategory.MOVEMENT,
      playerText: "뛰어서 건너편 타일로 이동한다",
      mapPoint: { x: 320, y: 192 },
    });

    expect(response.status).toBe(MainCommandStatus.RESOLVED);
    expect(sessionsService.moveSessionCharacterTokenToMapPoint).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionCharacterId: "session-character-1",
      mapPoint: { x: 320, y: 192 },
    });
  });

  it("moves the actor token when a special movement check succeeds", async () => {
    const { service, sessionsService } = createMainCommandHarness();

    const response = await service.resolveMainCommandCheck("user-1", "session-1", {
      requestId: "request-1",
      actorId: "character-1",
      outcome: ActionOutcome.SUCCESS,
      effect: {
        type: "mainCommandCheck",
        requestId: "request-1",
        nodeId: "node-1",
        sessionCharacterId: "session-character-1",
        intent: MainCommandIntent.SPECIAL_MOVE,
        screenType: MainCommandScreenType.EXPLORATION,
        playerText: "뛰어서 건너편 타일로 이동한다",
        actionSummary: "vaults across the gap",
        targetId: null,
        targetName: null,
        targetSummary: null,
        targetDisposition: null,
        itemId: null,
        itemName: null,
        mapPoint: { x: 320, y: 192 },
        checkOption: { skill: "acrobatics", dc: 15, reason: "특수 이동" },
        visibleEntityNames: [],
        publicClues: [],
        sceneText: "A gap blocks the way.",
        actionCandidate: null,
      },
    });

    expect(response.status).toBe(MainCommandStatus.RESOLVED);
    expect(sessionsService.moveSessionCharacterTokenToMapPoint).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionCharacterId: "session-character-1",
      mapPoint: { x: 320, y: 192 },
    });
  });

  it("adds newly revealed action clues to successful check narration", async () => {
    const { service, sessionsService, turnLogsService } = createMainCommandHarness();
    sessionsService.revealCurrentNodeCluesAfterActionWithDetails.mockResolvedValueOnce([
      {
        id: "clue-hidden-trap",
        title: "바닥의 가는 홈",
        text: "먼지 아래로 칼날 장치와 이어지는 얇은 홈이 드러납니다.",
      },
    ]);

    const response = await service.resolveMainCommandCheck("user-1", "session-1", {
      requestId: "request-1",
      actorId: "character-1",
      outcome: ActionOutcome.SUCCESS,
      effect: {
        type: "mainCommandCheck",
        requestId: "request-1",
        nodeId: "node-1",
        sessionCharacterId: "session-character-1",
        intent: MainCommandIntent.DETECT_DANGER,
        screenType: MainCommandScreenType.EXPLORATION,
        playerText: "주변에 함정이 있는지 살핀다",
        actionSummary: "주변의 위험을 살핀다",
        targetId: null,
        targetName: null,
        targetSummary: null,
        targetDisposition: null,
        itemId: null,
        itemName: null,
        mapPoint: null,
        checkOption: { skill: "perception", dc: 13, reason: "위험 감지" },
        visibleEntityNames: [],
        publicClues: [],
        sceneText: "바닥에는 먼지가 얇게 내려앉아 있습니다.",
        actionCandidate: {
          actorId: "character-1",
          targetId: null,
          actionSummary: "주변의 위험을 살핀다",
          declaredMethod: "주변에 함정이 있는지 살핀다",
        },
      },
    });

    expect(response.message).toContain("새 단서를 발견했습니다.");
    expect(response.message).toContain("바닥의 가는 홈");
    expect(response.message).toContain("먼지 아래로 칼날 장치");
    expect(sessionsService.revealCurrentNodeCluesAfterActionWithDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        actionText: "주변에 함정이 있는지 살핀다",
        turnLogId: null,
      }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        narration: expect.stringContaining("바닥의 가는 홈"),
      }),
    );
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
            type: "INVESTIGATE_OBJECT",
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

  it("routes commandless free input through the interpreter without claiming it was resolved", async () => {
    const { aiService, sessionsService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "INVESTIGATE_OBJECT",
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

    expect(response.status).toBe(MainCommandStatus.GM_APPROVAL_REQUIRED);
    expect(response.message).toContain("조사는 대상 확인이나 현장 판정이 필요합니다.");
    expect(response.actionCandidate?.actionSummary).toBe("check under the crate");
    expect(sessionsService.revealCurrentNodeCluesAfterAction).not.toHaveBeenCalled();
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
    expect(aiService.runInterpreter).toHaveBeenLastCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        requestIntent: MainCommandIntent.GENERAL_GM_REQUEST,
      }),
    );
  });

  it("routes interpreter MAIN_COMMAND action types to the matching main command handler", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "INVESTIGATE_OBJECT",
            approach: "flip the crate",
            confidence: 0.88,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "flip the crate",
    });

    expect(response.status).toBe(MainCommandStatus.GM_APPROVAL_REQUIRED);
    expect(response.actionCandidate?.actionSummary).toBe("flip the crate");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "INVESTIGATE_OBJECT",
      route: "MAIN_COMMAND",
      intent: MainCommandIntent.INVESTIGATE_OBJECT,
    });
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
    expect(aiService.runInterpreter).toHaveBeenLastCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        requestIntent: MainCommandIntent.GENERAL_GM_REQUEST,
      }),
    );
  });

  it("reuses the routed interpreter result for natural-language investigation checks", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "INVESTIGATE_OBJECT",
            approach: "inspect the torn ration sack",
            ability: "int",
            skill: "investigation",
            suggestedDifficulty: "easy",
            confidence: 0.88,
            requiresRoll: true,
          },
        },
      },
    });

    const response = await submit({
      playerText: "찢어진 식량 자루를 조사한다",
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(response.actionCandidate?.actionSummary).toBe("inspect the torn ration sack");
    expect(response.checkOptions?.[0]).toEqual(
      expect.objectContaining({
        ability: "int",
        skill: "investigation",
      }),
    );
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
  });

  it("defers coordinate object reveals until the required investigation check is resolved", async () => {
    const { sessionsService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "INVESTIGATE_OBJECT",
            approach: "inspect the marked ration sack",
            ability: "int",
            skill: "investigation",
            suggestedDifficulty: "easy",
            confidence: 0.88,
            requiresRoll: true,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.INVESTIGATE_OBJECT,
      intent: MainCommandIntent.INVESTIGATE_OBJECT,
      category: MainCommandCategory.OBSERVATION,
      playerText: "표식이 새겨진 식량 자루를 조사한다",
      mapPoint: { x: 896, y: 640 },
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(sessionsService.revealVttObjectContentsAtPoint).not.toHaveBeenCalled();
  });

  it("routes natural-language hint requests from the interpreter to the hint handler", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "ASK_HINT",
            approach: "ask for a hint",
            confidence: 0.94,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "힌트 주세요",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.message).toBe("Check the strange statue.");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "ASK_HINT",
      route: "MAIN_COMMAND",
      intent: MainCommandIntent.ASK_HINT,
    });
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
    expect(aiService.runHint).toHaveBeenCalledTimes(1);
  });

  it("asks the player to choose a target when the interpreter guesses one among multiple NPCs", async () => {
    const { aiService, submit } = createMainCommandHarness({
      nodeMetaJson: JSON.stringify({
        npcs: [
          { id: "npc-mila", name: "밀라 보스턴", isVisible: true },
          { id: "npc-perrin", name: "페린", isVisible: true },
        ],
      }),
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "TALK_TO_NPC",
            targetId: "npc-mila",
            approach: "talk to an NPC",
            confidence: 0.91,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "NPC에게 말을 건다",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.message).toContain("대상 선택이 필요합니다");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "TALK_TO_NPC",
      route: "MAIN_COMMAND",
      intent: MainCommandIntent.TALK_TO_NPC,
    });
    expect(aiService.runNpcDialogue).not.toHaveBeenCalled();
  });

  it("allows a natural-language NPC request when the player names one visible NPC", async () => {
    const { aiService, submit } = createMainCommandHarness({
      nodeMetaJson: JSON.stringify({
        npcs: [
          { id: "npc-mila", name: "밀라 보스턴", isVisible: true },
          { id: "npc-perrin", name: "페린", isVisible: true },
        ],
      }),
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "TALK_TO_NPC",
            targetId: "npc-mila",
            approach: "talk to Mila",
            confidence: 0.91,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "밀라에게 말을 건다",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.message).toBe("밀라 보스턴: Hello.");
    expect(aiService.runNpcDialogue).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        npcEntityId: "npc-mila",
        npcName: "밀라 보스턴",
      }),
      { emitChatMessage: false },
    );
  });

  it("returns a map-bottom control guide for MAP_CONTROL_ACTION action types", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "MAP_ATTACK",
            approach: "attack the goblin",
            confidence: 0.92,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "attack the goblin",
    });

    expect(response.status).toBe(MainCommandStatus.IMPOSSIBLE);
    expect(response.message).toContain("맵 하단");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "MAP_ATTACK",
      route: "MAP_CONTROL_ACTION",
    });
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
  });

  it("answers game meta questions without executing a play action", async () => {
    const { aiService, sessionsService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "GAME_META_QUESTION",
            approach: "ask what TRPG is",
            confidence: 0.95,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "What is a TRPG?",
    });

    expect(response.status).toBe(MainCommandStatus.MESSAGE);
    expect(response.message).toContain("TRPG");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "GAME_META_QUESTION",
      route: "GAME_META_QUESTION",
    });
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
    expect(sessionsService.revealCurrentNodeCluesAfterAction).not.toHaveBeenCalled();
  });

  it("routes clear investigation text even when the interpreter falls back to OUT_OF_SCOPE", async () => {
    const { aiService, submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: true,
          clarificationQuestion: "행동을 조금 더 구체적으로 선택해 주세요.",
          action: {
            type: "OUT_OF_SCOPE",
            approach: "빈 그릇을 조사해본다",
            confidence: 0,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "빈 그릇을 조사해본다",
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(response.message).toContain("자세히 조사하려면 판정이 필요합니다.");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: MainCommandIntent.INVESTIGATE_OBJECT,
      route: "MAIN_COMMAND",
      intent: MainCommandIntent.INVESTIGATE_OBJECT,
    });
    expect(aiService.runInterpreter).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-scope interpreter action types", async () => {
    const { submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: false,
          action: {
            type: "OUT_OF_SCOPE",
            approach: "ask about dinner",
            confidence: 0.9,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      playerText: "What should I eat today?",
    });

    expect(response.status).toBe(MainCommandStatus.IMPOSSIBLE);
    expect(response.message).toBe("처리할 수 없는 요청입니다.");
    expect(response.data?.interpreterRoute).toEqual({
      actionType: "OUT_OF_SCOPE",
      route: "OUT_OF_SCOPE",
    });
  });

  it("does not ask for clarification when an intimidation command already has a concrete sentence", async () => {
    const { submit } = createMainCommandHarness({
      nodeMetaJson: JSON.stringify({
        npcs: [{ id: "npc-guard", name: "경비병", isVisible: true }],
      }),
      interpreterResult: {
        parsed: {
          needsClarification: true,
          clarificationQuestion: "행동을 조금 더 구체적으로 선택해 주세요.",
          action: {
            type: "SOCIAL_INTIMIDATE",
            approach: "",
            confidence: 0.6,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.SOCIAL_INTIMIDATE,
      intent: MainCommandIntent.SOCIAL_INTIMIDATE,
      category: MainCommandCategory.SOCIAL,
      targetId: "npc-guard",
      targetType: MainCommandTargetType.NPC,
      playerText: "뭔가 숨기고 있는게 있는거 같은데? 사실대로 말하지 않으면 그냥 가겠어.",
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(response.message).toContain("경비병 압박에는 판정이 필요합니다.");
  });

  it("does not ask for clarification when a persuasion command already has a concrete sentence", async () => {
    const { submit } = createMainCommandHarness({
      nodeMetaJson: JSON.stringify({
        npcs: [{ id: "npc-mila", name: "밀라 보스턴", isVisible: true }],
      }),
      interpreterResult: {
        parsed: {
          needsClarification: true,
          clarificationQuestion: "행동을 조금 더 구체적으로 선택해 주세요.",
          action: {
            type: "SOCIAL_PERSUADE",
            approach: "",
            confidence: 0.6,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.SOCIAL_PERSUADE,
      intent: MainCommandIntent.SOCIAL_PERSUADE,
      category: MainCommandCategory.SOCIAL,
      targetId: "npc-mila",
      targetType: MainCommandTargetType.NPC,
      playerText: "우린 너흴 도와주러 온거야. 숨기는게 있다면 말을 해줘야 더 잘 도울 수 있어.",
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(response.message).toContain("밀라 보스턴 설득에는 판정이 필요합니다.");
  });

  it("does not ask for clarification when an investigate command already describes the action", async () => {
    const { submit } = createMainCommandHarness({
      interpreterResult: {
        parsed: {
          needsClarification: true,
          clarificationQuestion: "행동을 조금 더 구체적으로 선택해 주세요.",
          action: {
            type: "INVESTIGATE_OBJECT",
            approach: "",
            confidence: 0.6,
            requiresRoll: false,
          },
        },
      },
    });

    const response = await submit({
      commandId: MainCommandIntent.INVESTIGATE_OBJECT,
      intent: MainCommandIntent.INVESTIGATE_OBJECT,
      category: MainCommandCategory.OBSERVATION,
      playerText: "책상 아래와 서랍 안쪽에 숨겨진 흔적이 있는지 자세히 조사한다",
    });

    expect(response.status).toBe(MainCommandStatus.CHECK_REQUIRED);
    expect(response.message).toContain("자세히 조사하려면 판정이 필요합니다.");
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
    condition: "북쪽 철문을 열었다",
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
        ) => { satisfied: boolean; needsReview: boolean; reason: string; missingTerms: string[] };
      }
    ).evaluateTransitionCondition(
      { ...candidate, condition: params.condition ?? candidate.condition },
      { ...transitionDto, playerText: params.playerText ?? transitionDto.playerText },
      params.recentLogs ?? [],
      params.publicClues ?? [],
    );
  }

  it("matches a requested transition by node id before asking the interpreter", () => {
    const service = createService() as unknown as {
      matchTransitionCandidate: (
        candidates: Array<typeof candidate>,
        dto: SubmitMainCommandDto,
      ) => typeof candidate | null;
    };
    const n05 = { ...candidate, nodeId: "N05", title: "왼쪽 갈림길" };
    const n06 = { ...candidate, nodeId: "N06", title: "오른쪽 갈림길" };

    const result = service.matchTransitionCandidate(
      [n05, n06],
      { ...transitionDto, playerText: "N06 ㄱㄱ" },
    );

    expect(result?.nodeId).toBe("N06");
  });

  it("allows default transition conditions for existing seeded scenarios", () => {
    const result = evaluate(createService(), { condition: "default", playerText: "아무 입력" });

    expect(result.satisfied).toBe(true);
  });

  it("blocks a transition when the natural language condition has no evidence", () => {
    const result = evaluate(createService(), { playerText: "아무 말이나 입력한다" });

    expect(result.satisfied).toBe(false);
    expect(result.needsReview).toBe(false);
  });

  it("does not treat the player's transition request text as condition evidence", () => {
    const result = evaluate(createService(), {
      condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      playerText: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
    });

    expect(result.satisfied).toBe(false);
  });

  it("allows a transition when recent logs satisfy the natural language condition", () => {
    const result = evaluate(createService(), {
      recentLogs: ["북쪽 철문을 열었다 => 철문이 열렸다."],
    });

    expect(result.satisfied).toBe(true);
  });

  it("allows a transition when one Korean OR branch is satisfied", () => {
    const result = evaluate(createService(), {
      condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      recentLogs: ["수로 통로를 조사했다. 물길 아래로 지나갈 수 있는 틈을 확인했다."],
    });

    expect(result.satisfied).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("allows a transition when the clue branch of a Korean OR condition is satisfied", () => {
    const result = evaluate(createService(), {
      condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      publicClues: ["철창 너머의 우회로 단서: 좁은 배수구가 다음 구역으로 이어진다."],
    });

    expect(result.satisfied).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("does not expose tokenized grammar words when a Korean OR condition is incomplete", () => {
    const result = evaluate(createService(), {
      condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      recentLogs: ["수로 통로 근처에 도착했다."],
    });

    expect(result.satisfied).toBe(false);
    expect(result.reason).not.toContain("부족한 단서: 오브젝트, 조사하거나, 밝혀야, 가능");
  });

  it("does not let previous scene transition titles satisfy a condition", () => {
    const result = evaluate(createService(), {
      condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      recentLogs: [
        "/장면진행 ㄱㄱ => N02 검은 우물 조사 화면으로 이동했습니다.",
        "/장면진행 ㄱㄱ => N03 지하 수로 입구 화면으로 이동했습니다.",
      ],
    });

    expect(result.satisfied).toBe(false);
  });

  it("requires actually revealed clues instead of unrevealed node clue text", async () => {
    const service = createService() as unknown as {
      loadRevealedClueSummaries: () => Promise<string[]>;
      evaluateTransitionConditionWithRevealedClues: (
        context: { sessionScenarioId: string },
        transition: typeof candidate,
        dto: SubmitMainCommandDto,
        recentLogs: string[],
        publicClues: string[],
      ) => Promise<{ satisfied: boolean }>;
    };
    service.loadRevealedClueSummaries = async () => [];

    const result = await service.evaluateTransitionConditionWithRevealedClues(
      { sessionScenarioId: "session-scenario-1" },
      {
        ...candidate,
        condition: "수로 통로 오브젝트를 조사하거나 철창 너머의 우회로 단서를 밝혀야 이동 가능",
      },
      transitionDto,
      [],
      ["철창 너머의 우회로 단서: 좁은 배수구가 다음 구역으로 이어진다."],
    );

    expect(result.satisfied).toBe(false);
  });

  it("allows an AI transition contract for combat ended and a revealed clue", () => {
    const result = (
      createService() as unknown as {
        evaluateTransitionConditionContract: (
          contract: {
            targetNodeId: string;
            logic: "ALL" | "ANY";
            confidence: number;
            requirements: Array<{ type: string; text: string; polarity?: "MUST" | "MUST_NOT" }>;
          },
          evidence: {
            recentLogs: string[];
            revealedClues: string[];
            unrevealedClues: string[];
            flags: Record<string, unknown>;
            currentNodeId: string;
            combatResolvedForCurrentNode: boolean;
          },
        ) => { satisfied: boolean; needsReview: boolean; missingTerms: string[] };
      }
    ).evaluateTransitionConditionContract(
      {
        targetNodeId: "N05",
        logic: "ALL",
        confidence: 0.9,
        requirements: [
          { type: "COMBAT_RESOLVED", text: "전투 종료" },
          { type: "CLUE_REVEALED", text: "고블린의 조잡한 표식" },
        ],
      },
      {
        recentLogs: [],
        revealedClues: ["고블린의 조잡한 표식: 검은 안료로 그은 비뚤어진 부족 표식이다."],
        unrevealedClues: [],
        flags: { completedCombatNodeIds: ["N04"] },
        currentNodeId: "N04",
        combatResolvedForCurrentNode: true,
      },
    );

    expect(result.satisfied).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it("does not allow an empty AI transition contract to bypass a condition", () => {
    const result = (
      createService() as unknown as {
        evaluateTransitionConditionContract: (
          contract: {
            targetNodeId: string;
            logic: "ALL" | "ANY";
            confidence: number;
            requirements: Array<{ type: string; text: string; polarity?: "MUST" | "MUST_NOT" }>;
          },
          evidence: {
            recentLogs: string[];
            revealedClues: string[];
            unrevealedClues: string[];
            flags: Record<string, unknown>;
            currentNodeId: string;
            combatResolvedForCurrentNode: boolean;
          },
        ) => { satisfied: boolean; needsReview: boolean; reason: string };
      }
    ).evaluateTransitionConditionContract(
      {
        targetNodeId: "node-next",
        logic: "ALL",
        confidence: 0.9,
        requirements: [],
      },
      {
        recentLogs: [],
        revealedClues: [],
        unrevealedClues: [],
        flags: {},
        currentNodeId: "node-current",
        combatResolvedForCurrentNode: false,
      },
    );

    expect(result.satisfied).toBe(false);
    expect(result.needsReview).toBe(true);
  });

  it("allows an AI transition contract for combat ended, object investigated, and clue not revealed", () => {
    const result = (
      createService() as unknown as {
        evaluateTransitionConditionContract: (
          contract: {
            targetNodeId: string;
            logic: "ALL" | "ANY";
            confidence: number;
            requirements: Array<{ type: string; text: string; polarity?: "MUST" | "MUST_NOT" }>;
          },
          evidence: {
            recentLogs: string[];
            revealedClues: string[];
            unrevealedClues: string[];
            flags: Record<string, unknown>;
            currentNodeId: string;
            combatResolvedForCurrentNode: boolean;
          },
        ) => { satisfied: boolean; needsReview: boolean; missingTerms: string[] };
      }
    ).evaluateTransitionConditionContract(
      {
        targetNodeId: "N06",
        logic: "ALL",
        confidence: 0.9,
        requirements: [
          { type: "COMBAT_RESOLVED", text: "전투 종료" },
          { type: "ACTION_EVIDENCE", text: "깊은 통로 조사" },
          { type: "CLUE_NOT_REVEALED", text: "고블린의 조잡한 표식" },
        ],
      },
      {
        recentLogs: ["깊은 통로 오브젝트를 조사했다 => 어둠 속으로 이어지는 길을 확인했다."],
        revealedClues: [],
        unrevealedClues: ["고블린의 조잡한 표식"],
        flags: { completedCombatNodeIds: ["N04"] },
        currentNodeId: "N04",
        combatResolvedForCurrentNode: true,
      },
    );

    expect(result.satisfied).toBe(true);
    expect(result.needsReview).toBe(false);
  });
});

describe("MainCommandsService scene transition branch resolution", () => {
  const createService = () => {
    const sessionsService = {
      buildSnapshot: jest.fn().mockResolvedValue({ currentNodeId: "node-next" }),
      completeSessionFromEndingNode: jest.fn().mockResolvedValue({ session: { status: "completed" } }),
    };
    const realtimeEvents = {
      emitSessionSnapshot: jest.fn(),
    };
    const service = new MainCommandsService(
      {} as never,
      sessionsService as never,
      { runInterpreter: jest.fn() } as never,
      {} as never,
      realtimeEvents as never,
    );
    return { service, sessionsService, realtimeEvents };
  };

  const context: {
    sessionId: string;
    sessionScenarioId: string;
    sessionCharacterId: string;
    actorCharacterId: string;
    inventoryItems: unknown[];
    currentNodeId: string;
    currentNodeTitle: string;
    currentNodeSceneText: string;
    currentNodeTransitionsJson: string;
    currentNodeCluesJson: string;
    currentNodeNodeMetaJson: string | null;
    currentNodeFallbackNodeId: string | null;
    flagsJson: string | null;
  } = {
    sessionId: "session-1",
    sessionScenarioId: "session-scenario-1",
    sessionCharacterId: "session-character-1",
    actorCharacterId: "character-1",
    inventoryItems: [],
    currentNodeId: "node-current",
    currentNodeTitle: "갈림길",
    currentNodeSceneText: "두 갈래 길이 있다.",
    currentNodeTransitionsJson: "[]",
    currentNodeCluesJson: "[]",
    currentNodeNodeMetaJson: null,
    currentNodeFallbackNodeId: null,
    flagsJson: "{}",
  };

  const transitionDto: SubmitMainCommandDto = {
    ...dto,
    intent: MainCommandIntent.REQUEST_SCENE_TRANSITION,
    playerText: "/장면진행",
  };

  const leftCandidate = {
    transitionId: "transition-left",
    label: "왼쪽 길",
    condition: "왼쪽 문을 열었다",
    note: null,
    nodeId: "node-left",
    title: "왼쪽 방",
    nodeType: "exploration",
    isFallback: false,
  };

  const rightCandidate = {
    transitionId: "transition-right",
    label: "오른쪽 길",
    condition: "오른쪽 문을 열었다",
    note: null,
    nodeId: "node-right",
    title: "오른쪽 방",
    nodeType: "exploration",
    isFallback: false,
  };

  const satisfiedCondition = {
    satisfied: true,
    needsReview: false,
    reason: "장면 진행 조건을 만족했습니다.",
    matchedTerms: ["오른쪽 문"],
    missingTerms: [],
  };

  const blockedCondition = {
    satisfied: false,
    needsReview: false,
    reason: "아직 장면 이동 조건을 만족하지 못했습니다.",
    matchedTerms: [],
    missingTerms: ["왼쪽 문"],
  };

  it("completes the session when scene progression is requested on an ending node", async () => {
    const { service, sessionsService } = createService();
    const internals = service as unknown as {
      handleSceneTransition: (
        requestId: string,
        loadedContext: typeof context,
        dto: SubmitMainCommandDto,
        recentLogs: string[],
      ) => Promise<{ status: MainCommandStatus; message: string; data?: Record<string, unknown> }>;
      loadTransitionCandidates: jest.Mock;
    };
    internals.loadTransitionCandidates = jest.fn();

    const response = await internals.handleSceneTransition(
      "request-1",
      {
        ...context,
        currentNodeTitle: "에필로그",
        currentNodeNodeMetaJson: JSON.stringify({ isEndingNode: true }),
      },
      transitionDto,
      [],
    );

    expect(response.status).toBe(MainCommandStatus.RESOLVED);
    expect(response.message).toContain("세션이 완료되었습니다");
    expect(response.data?.completedNodeId).toBe("node-current");
    expect(sessionsService.completeSessionFromEndingNode).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-current",
      reason: "ending_node",
    });
    expect(internals.loadTransitionCandidates).not.toHaveBeenCalled();
  });

  it("auto-advances to the only branch whose condition is already satisfied", async () => {
    const { service } = createService();
    const internals = service as unknown as {
      handleSceneTransition: (
        requestId: string,
        loadedContext: typeof context,
        dto: SubmitMainCommandDto,
        recentLogs: string[],
      ) => Promise<{ status: MainCommandStatus; statePatch?: { currentNodeId?: string }; message: string }>;
      loadTransitionCandidates: jest.Mock;
      matchTransitionCandidate: jest.Mock;
      evaluateTransitionCandidatesWithRevealedClues: jest.Mock;
      applySceneTransition: jest.Mock;
    };
    internals.loadTransitionCandidates = jest.fn().mockResolvedValue([leftCandidate, rightCandidate]);
    internals.matchTransitionCandidate = jest.fn().mockReturnValue(null);
    internals.evaluateTransitionCandidatesWithRevealedClues = jest.fn().mockResolvedValue([
      { target: leftCandidate, conditionResult: blockedCondition },
      { target: rightCandidate, conditionResult: satisfiedCondition },
    ]);
    internals.applySceneTransition = jest.fn().mockResolvedValue(undefined);

    const response = await internals.handleSceneTransition(
      "request-1",
      context,
      transitionDto,
      [],
    );

    expect(response.status).toBe(MainCommandStatus.RESOLVED);
    expect(response.statePatch?.currentNodeId).toBe("node-right");
    expect(response.message).toContain("오른쪽 방");
    expect(internals.applySceneTransition).toHaveBeenCalledWith(context, "node-right");
  });

  it("asks for a destination when more than one branch is already satisfied", async () => {
    const { service } = createService();
    const internals = service as unknown as {
      handleSceneTransition: (
        requestId: string,
        loadedContext: typeof context,
        dto: SubmitMainCommandDto,
        recentLogs: string[],
      ) => Promise<{ status: MainCommandStatus; message: string }>;
      loadTransitionCandidates: jest.Mock;
      matchTransitionCandidate: jest.Mock;
      evaluateTransitionCandidatesWithRevealedClues: jest.Mock;
      applySceneTransition: jest.Mock;
    };
    internals.loadTransitionCandidates = jest.fn().mockResolvedValue([leftCandidate, rightCandidate]);
    internals.matchTransitionCandidate = jest.fn().mockReturnValue(null);
    internals.evaluateTransitionCandidatesWithRevealedClues = jest.fn().mockResolvedValue([
      { target: leftCandidate, conditionResult: satisfiedCondition },
      { target: rightCandidate, conditionResult: satisfiedCondition },
    ]);
    internals.applySceneTransition = jest.fn();

    const response = await internals.handleSceneTransition(
      "request-1",
      context,
      transitionDto,
      [],
    );

    expect(response.status).toBe(MainCommandStatus.GM_APPROVAL_REQUIRED);
    expect(response.message).toContain("왼쪽 방");
    expect(response.message).toContain("오른쪽 방");
    expect(internals.applySceneTransition).not.toHaveBeenCalled();
  });
});

describe("MainCommandsService check result narration", () => {
  const createService = () =>
    new MainCommandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      buildMainCommandCheckResultMessage: (
        effect: Record<string, unknown>,
        outcome: string,
      ) => string;
    };

  const baseEffect = {
    type: "mainCommandCheck",
    requestId: "request-1",
    nodeId: "node-1",
    screenType: MainCommandScreenType.STORY,
    playerText: "뭔가 숨기고 있는게 있는거 같은데? 사실대로 말하지 않으면 그냥 가겠어.",
    actionSummary: "밀라 보스턴에 대한 뭔가 숨기고 있는게 있는거 같은데? 사실대로 말하지 않으면 그냥 가겠어.",
    targetId: "npc-mila",
    targetName: "밀라 보스턴",
    itemId: null,
    itemName: null,
    mapPoint: null,
    checkOption: null,
    visibleEntityNames: ["밀라 보스턴"],
    publicClues: [],
    sceneText: "밀라는 말을 아낀다.",
    actionCandidate: null,
  };

  it("uses scene-like failure narration for intimidation checks instead of echoing raw input", () => {
    const message = createService().buildMainCommandCheckResultMessage(
      {
        ...baseEffect,
        intent: MainCommandIntent.SOCIAL_INTIMIDATE,
      },
      ActionOutcome.FAILURE,
    );

    expect(message).toContain("밀라 보스턴");
    expect(message).toContain("버티");
    expect(message).not.toContain("원하는 성과");
    expect(message).not.toContain("사실대로 말하지 않으면");
  });

  it("has success and failure narration for every intent that can require a check", () => {
    const service = createService();
    const intents = [
      MainCommandIntent.GENERAL_GM_REQUEST,
      MainCommandIntent.SOCIAL_PERSUADE,
      MainCommandIntent.SOCIAL_INTIMIDATE,
      MainCommandIntent.SOCIAL_DECEIVE,
      MainCommandIntent.READ_EMOTION,
      MainCommandIntent.INSPECT_STORY_OBJECT,
      MainCommandIntent.OBSERVE_AREA,
      MainCommandIntent.INVESTIGATE_OBJECT,
      MainCommandIntent.LISTEN,
      MainCommandIntent.DETECT_DANGER,
      MainCommandIntent.SPECIAL_MOVE,
      MainCommandIntent.INTERACT_OBJECT,
      MainCommandIntent.USE_TOOL,
      MainCommandIntent.USE_ITEM_EXPLORE,
      MainCommandIntent.COMBAT_MANEUVER,
      MainCommandIntent.ENVIRONMENT_USE,
      MainCommandIntent.IMPROVISED_ATTACK,
      MainCommandIntent.CALLED_SHOT,
      MainCommandIntent.READY_ACTION,
      MainCommandIntent.USE_ITEM_COMBAT,
      MainCommandIntent.USE_SPELL_CREATIVELY,
    ];

    for (const intent of intents) {
      const success = service.buildMainCommandCheckResultMessage(
        { ...baseEffect, intent, itemName: "밧줄" },
        ActionOutcome.SUCCESS,
      );
      const failure = service.buildMainCommandCheckResultMessage(
        { ...baseEffect, intent, itemName: "밧줄" },
        ActionOutcome.FAILURE,
      );

      expect(success).toContain("판정에 성공했습니다.");
      expect(failure).toContain("판정에 실패했습니다.");
      expect(success).not.toContain("원하는 성과");
      expect(failure).not.toContain("원하는 성과");
      expect(success).not.toContain("시도가 장면 안에서 설득력 있게 작동합니다");
      expect(failure).not.toContain("시도는 장면 안에서 충분한 성과로 이어지지 않습니다");
    }
  });

  it("does not expose internal action type labels in fallback narration", () => {
    const service = new MainCommandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      buildMainCommandCheckResultMessage: (
        effect: Record<string, unknown>,
        outcome: ActionOutcome,
      ) => string;
    };
    const effect = {
      type: "mainCommandCheck",
      requestId: "request-1",
      nodeId: "node-1",
      sessionCharacterId: "session-character-1",
      intent: MainCommandIntent.GENERAL_GM_REQUEST,
      screenType: MainCommandScreenType.EXPLORATION,
      playerText: "바닥과 그림자를 살펴 숨어 있는 위험을 찾는다",
      actionSummary: "standard",
      targetId: null,
      targetName: null,
      targetSummary: null,
      targetDisposition: null,
      itemId: null,
      itemName: null,
      mapPoint: null,
      checkOption: null,
      visibleEntityNames: [],
      publicClues: [],
      sceneText: "",
      actionCandidate: null,
    };

    const success = service.buildMainCommandCheckResultMessage(effect, ActionOutcome.SUCCESS);
    const failure = service.buildMainCommandCheckResultMessage(effect, ActionOutcome.FAILURE);

    expect(success).not.toContain("standard");
    expect(failure).not.toContain("standard");
    expect(success).toContain("판정에 성공했습니다.");
    expect(failure).toContain("판정에 실패했습니다.");
  });
});
