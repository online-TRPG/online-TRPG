import { GatewayTimeoutException } from "@nestjs/common";
import { AiTraceKind, AiTraceStatus } from "@prisma/client";
import { AiNarrationRequestDto } from "@trpg/shared-types";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AiService } from "./ai.service";

describe("AiNarrationRequestDto structured trust boundary", () => {
  it.each(["action", "scene"] as const)(
    "rejects a request missing required %s before the AI service boundary",
    async (missingField) => {
      const payload: Record<string, unknown> = {
        action: {
          type: "INTERACT_OBJECT",
          actorCharacterId: "character-1",
          approach: "석문을 연다",
          confidence: 1,
          requiresRoll: false,
        },
        scene: {
          summary: "석문 앞",
          tone: "tense",
        },
      };
      delete payload[missingField];
      const dto = plainToInstance(AiNarrationRequestDto, payload);

      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      expect(errors.some((error) => error.property === missingField)).toBe(true);
    },
  );
});

describe("AiService Narrator product projection", () => {
  it("does not forward legacy summaries or duplicate scene tone with structured facts", async () => {
    const prisma = {
      aiTrace: { create: jest.fn().mockResolvedValue({ id: "trace-narrator" }) },
    };
    const aiClient = {
      runNarrator: jest.fn().mockResolvedValue({
        trace: {
          role: "narrator",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "narrator.test",
          latencyMs: 1,
          attempts: 1,
        },
        parsed: {
          narration: "석문이 열렸다",
        },
      }),
    };
    const service = new AiService(
      prisma as never,
      { ensureMembership: jest.fn().mockResolvedValue(undefined) } as never,
      aiClient as never,
      { emitChatMessage: jest.fn() } as never,
      {} as never,
      { ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const response = await service.runNarration("gm-1", "session-1", {
      rawInput: "문을 연다",
      action: {
        type: "INTERACT_OBJECT",
        actorCharacterId: "character-1",
        targetId: "stone-door",
        approach: "석문을 연다",
        confidence: 1,
        requiresRoll: false,
      },
      scene: { summary: "열린 석문 앞", tone: "tense" },
      actionSummary: "legacy action",
      diceSummary: "legacy dice",
      sceneTone: "tense",
    } as never);

    expect(aiClient.runNarrator).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ type: "INTERACT_OBJECT" }),
        scene: expect.objectContaining({ tone: "tense" }),
      }),
    );
    const request = aiClient.runNarrator.mock.calls[0][0];
    expect(request).not.toHaveProperty("rawInput");
    expect(request).not.toHaveProperty("actionSummary");
    expect(request).not.toHaveProperty("diceSummary");
    expect(request).not.toHaveProperty("sceneTone");
    expect(response.parsed).toEqual({
      narration: "석문이 열렸다",
      visibleSummary: "석문이 열렸다",
    });
  });
});

describe("AiService HUMAN GM assist suggestions", () => {
  it("stores provider-generated GM assist output as a pending HUMAN GM suggestion", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      aiTrace: {
        create: jest.fn().mockResolvedValue({ id: "trace-1" }),
      },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
      getPublicClueSummariesForUser: jest.fn().mockResolvedValue(["공개 단서"]),
      createHumanGmAiAssistSuggestion: jest.fn().mockResolvedValue({
        id: "ai-assist:provider",
        assistType: "scene_text",
        content: "문 너머의 공기가 무겁게 가라앉아 있습니다.",
        suggestedActionId: null,
        targetId: "node-1",
        status: "PENDING",
      }),
    };
    const aiClient = {
      runDirector: jest.fn().mockResolvedValue({
        trace: {
          role: "director",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "director.test",
          latencyMs: 12,
          attempts: 1,
          failureType: null,
          finishReason: "stop",
          providerRequestId: "provider-1",
        },
        parsed: {
          content: "문 너머의 공기가 무겁게 가라앉아 있습니다.",
          suggestions: ["천천히 문을 열며 기척을 살핀다."],
        },
      }),
    };
    const gmRuntimeParticipantAccess = {
      ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      {} as never,
      gmRuntimeParticipantAccess as never,
    );

    await expect(
      service.generateHumanGmAssistSuggestion("gm-user", "session-1", {
        assistType: "scene_text",
        prompt: "이 장면을 더 긴장감 있게 묘사해줘.",
        sceneSummary: "낡은 문 앞에 파티가 서 있다.",
        recentLogs: ["플레이어가 문을 조사했다."],
        targetId: "node-1",
        suggestedActionId: null,
      }),
    ).resolves.toMatchObject({
      id: "ai-assist:provider",
      status: "PENDING",
    });

    expect(aiClient.runDirector).toHaveBeenCalledWith(
      expect.objectContaining({
        hintLevel: "NORMAL",
        sceneSummary: "낡은 문 앞에 파티가 서 있다.",
        recentLogs: ["플레이어가 문을 조사했다."],
        sessionId: "session-1",
      }),
    );
    const directorRequest = (aiClient.runDirector as jest.Mock).mock.calls[0][0] as {
      question: string;
    };
    expect(directorRequest.question).not.toContain("node-1");
    expect(directorRequest.question.length).toBeLessThanOrEqual(500);
    expect(prisma.aiTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: AiTraceKind.HINT,
          status: AiTraceStatus.SUCCESS,
          fallbackUsed: false,
        }),
      }),
    );
    expect(sessionsService.createHumanGmAiAssistSuggestion).toHaveBeenCalledWith(
      "gm-user",
      "session-1",
      expect.objectContaining({
        assistType: "scene_text",
        content: expect.stringContaining("문 너머의 공기가 무겁게 가라앉아 있습니다."),
        targetId: "node-1",
        suggestedActionId: null,
      }),
    );
    expect(gmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant).toHaveBeenCalledWith(
      "gm-user",
      "session-1",
    );
  });

  it("bounds internal Director context before crossing the AI contract", async () => {
    const prisma = {
      aiTrace: { create: jest.fn().mockResolvedValue({ id: "trace-1" }) },
    };
    const publicClues = Array.from({ length: 12 }, (_, index) => `clue-${index}-${"c".repeat(600)}`);
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
      getPublicClueSummariesForUser: jest.fn().mockResolvedValue(publicClues),
    };
    const aiClient = {
      runDirector: jest.fn().mockResolvedValue({
        trace: {
          role: "director",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "director.test",
          latencyMs: 1,
          attempts: 1,
        },
        parsed: {
          content: "bounded",
          suggestions: [],
        },
      }),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await service.runHint(
      "user-1",
      "session-1",
      {
        question: "q".repeat(600),
        sceneSummary: "s".repeat(1400),
        recentLogs: Array.from({ length: 8 }, (_, index) => `log-${index}-${"l".repeat(1100)}`),
        triedApproaches: Array.from({ length: 12 }, (_, index) => `try-${index}-${"t".repeat(600)}`),
      },
      { emitSystemMessage: false, contextSource: "SERVER_VALIDATED" },
    );

    const request = (aiClient.runDirector as jest.Mock).mock.calls[0][0] as {
      question: string;
      sceneSummary: string;
      recentLogs: string[];
      publicClues: string[];
      triedApproaches: string[];
    };
    expect(request.question).toHaveLength(500);
    expect(request.sceneSummary).toHaveLength(1200);
    expect(request.recentLogs).toHaveLength(5);
    expect(request.recentLogs.every((value) => value.length <= 1000)).toBe(true);
    expect(request.publicClues).toHaveLength(10);
    expect(request.publicClues.every((value) => value.length <= 500)).toBe(true);
    expect(request.triedApproaches).toHaveLength(10);
    expect(request.triedApproaches.every((value) => value.length <= 500)).toBe(true);
    expect(response.parsed).toEqual({
      hintLevel: "NORMAL",
      content: "bounded",
      sourceScope: "mixed",
      spoilerLevel: "low",
      suggestions: [],
      safetyNotes: [],
    });
  });
});

describe("AiService Check Result projection", () => {
  it("bounds optional context and keeps only the reward allowlist", async () => {
    const prisma = {
      aiTrace: { create: jest.fn().mockResolvedValue({ id: "trace-check" }) },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiClient = {
      runCheckResult: jest.fn().mockResolvedValue({
        trace: {
          role: "check_result",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "check_result.test",
          latencyMs: 1,
          attempts: 1,
        },
        parsed: {
          narration: "판정 결과",
        },
      }),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.runCheckResult("session-1", "user-1", {
      outcome: "SUCCESS",
      intent: "i".repeat(100),
      actionSummary: "a".repeat(1200),
      targetName: "n".repeat(150),
      targetSummary: "t".repeat(800),
      targetDisposition: "d".repeat(120),
      sceneSummary: "s".repeat(1400),
      allowedRewardFacts: Array.from({ length: 12 }, (_, index) => `fact-${index}-${"f".repeat(750)}`),
      visibleEntities: Array.from({ length: 15 }, (_, index) => `entity-${index}-${"e".repeat(1100)}`),
      outputMode: "NPC_REPLY",
    });

    const request = (aiClient.runCheckResult as jest.Mock).mock.calls[0][0] as Record<string, unknown> & {
      intent: string;
      actionSummary: string;
      targetName: string;
      targetSummary: string;
      targetDisposition: string;
      sceneSummary: string;
      allowedRewardFacts: string[];
      visibleEntities: string[];
    };
    expect(request.intent).toHaveLength(80);
    expect(request.actionSummary).toHaveLength(1000);
    expect(request.targetName).toHaveLength(120);
    expect(request.targetSummary).toHaveLength(700);
    expect(request.targetDisposition).toHaveLength(100);
    expect(request.sceneSummary).toHaveLength(1200);
    expect(request.allowedRewardFacts).toHaveLength(10);
    expect(request.allowedRewardFacts.every((value) => value.length <= 700)).toBe(true);
    expect(request.visibleEntities).toHaveLength(12);
    expect(request.visibleEntities.every((value) => value.length <= 1000)).toBe(true);
    expect(request).not.toHaveProperty("playerText");
    expect(request).not.toHaveProperty("publicClues");
  });

  it("falls back to an exact backend fact when an AI response adds an unapproved claim", async () => {
    const prisma = {
      aiTrace: { create: jest.fn().mockResolvedValue({ id: "trace-check" }) },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiClient = {
      runCheckResult: jest.fn().mockResolvedValue({
        trace: {
          role: "check_result",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "check_result.test",
          latencyMs: 1,
          attempts: 1,
        },
        parsed: {
          narration: "북문은 비어 있다. 지하실에는 숨겨진 열쇠도 있다.",
        },
      }),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await service.runCheckResult("session-1", "user-1", {
      outcome: "SUCCESS",
      intent: "SOCIAL_PERSUADE",
      targetName: "경비병",
      allowedRewardFacts: ["북문은 비어 있다."],
      outputMode: "NPC_REPLY",
    });

    expect(response.parsed.narration).toBe("북문은 비어 있다.");
    expect(response.fallback).toBe(true);
    expect(response.trace.failureType).toBe("be_default_fallback");
  });
});

describe("AiService Summarizer trust boundary", () => {
  function createSummaryHarness(confirmedLogs: string[] = ["서버 확정 내레이션"]) {
    const prisma = {
      aiTrace: { create: jest.fn().mockResolvedValue({ id: "trace-summary" }) },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiClient = {
      runSummarizer: jest.fn().mockResolvedValue({
        trace: {
          role: "summarizer",
          provider: "test-provider",
          model: "test-model",
          promptVersion: "summarizer.test",
          latencyMs: 1,
          attempts: 1,
        },
        parsed: {
          content: "확정 로그 요약",
        },
      }),
    };
    const turnLogsService = {
      listConfirmedPublicNarrations: jest.fn().mockResolvedValue(confirmedLogs),
    };
    const gmRuntimeParticipantAccess = {
      ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      turnLogsService as never,
      gmRuntimeParticipantAccess as never,
    );
    return { service, aiClient, turnLogsService, gmRuntimeParticipantAccess };
  }

  it("ignores deprecated client logs and sends only server-confirmed public narration", async () => {
    const { service, aiClient, turnLogsService, gmRuntimeParticipantAccess } = createSummaryHarness([
      "첫 번째 확정 로그",
      "두 번째 확정 로그",
    ]);

    const response = await service.runSummary("user-1", "session-1", {
      summaryType: "player_visible",
      rangeType: "RECENT",
      lastLogCount: 2,
      logs: ["클라이언트가 주입한 미확정 로그"],
    });

    expect(turnLogsService.listConfirmedPublicNarrations).toHaveBeenCalledWith(
      "session-1",
      2,
    );
    expect(gmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant).toHaveBeenCalledWith(
      "user-1",
      "session-1",
    );
    expect(aiClient.runSummarizer).toHaveBeenCalledWith(
      expect.objectContaining({
        logs: ["첫 번째 확정 로그", "두 번째 확정 로그"],
      }),
    );
    expect(aiClient.runSummarizer.mock.calls[0][0].logs).not.toContain(
      "클라이언트가 주입한 미확정 로그",
    );
    expect(response.parsed).toEqual({
      summaryType: "player_visible",
      coveredTurnRange: "RECENT",
      content: "확정 로그 요약",
      keyFacts: [],
      safetyNotes: [],
    });
  });

  it("uses bounded server-owned logs supplied by an internal command path", async () => {
    const { service, aiClient, turnLogsService, gmRuntimeParticipantAccess } = createSummaryHarness();
    const trustedLogs = Array.from(
      { length: 55 },
      (_, index) => `trusted-${index}-${"x".repeat(2100)}`,
    );

    await service.runSummary(
      "user-1",
      "session-1",
      {
        summaryType: "player_visible",
        rangeType: "RECENT",
        lastLogCount: 50,
        logs: ["deprecated compatibility value"],
      },
      {
        emitSystemMessage: false,
        trustedLogs,
        contextSource: "SERVER_VALIDATED",
      },
    );

    expect(turnLogsService.listConfirmedPublicNarrations).not.toHaveBeenCalled();
    expect(gmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant).not.toHaveBeenCalled();
    const request = aiClient.runSummarizer.mock.calls[0][0] as { logs: string[] };
    expect(request.logs).toHaveLength(50);
    expect(request.logs.every((log) => log.length <= 2000)).toBe(true);
  });

  it("sends exactly the latest 12 logs from a 50-log RECENT range", async () => {
    const { service, aiClient } = createSummaryHarness();
    const trustedLogs = Array.from({ length: 50 }, (_, index) => `trusted-${index}`);

    await service.runSummary(
      "user-1",
      "session-1",
      {
        summaryType: "player_visible",
        rangeType: "RECENT",
        lastLogCount: 12,
        logs: ["deprecated compatibility value"],
      },
      {
        emitSystemMessage: false,
        trustedLogs,
        contextSource: "SERVER_VALIDATED",
      },
    );

    expect(aiClient.runSummarizer).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLogCount: 12,
        logs: trustedLogs.slice(-12),
      }),
    );
  });

  it("keeps FULL truthful and rejects more than 50 confirmed logs before provider invocation", async () => {
    const { service, aiClient, turnLogsService } = createSummaryHarness(
      Array.from({ length: 51 }, (_, index) => `confirmed-${index}`),
    );

    await expect(
      service.runSummary("user-1", "session-1", {
        summaryType: "player_visible",
        rangeType: "FULL",
        lastLogCount: 3,
        logs: ["deprecated compatibility value"],
      }),
    ).rejects.toThrow("FULL summaries are limited to 50 confirmed logs");
    expect(turnLogsService.listConfirmedPublicNarrations).toHaveBeenCalledWith(
      "session-1",
      51,
    );
    expect(aiClient.runSummarizer).not.toHaveBeenCalled();
  });

  it("uses every confirmed log for a bounded FULL request", async () => {
    const { service, aiClient } = createSummaryHarness(["one", "two", "three"]);

    await service.runSummary("user-1", "session-1", {
      summaryType: "player_visible",
      rangeType: "FULL",
      lastLogCount: 1,
      logs: ["deprecated compatibility value"],
    });

    expect(aiClient.runSummarizer).toHaveBeenCalledWith(
      expect.objectContaining({
        rangeType: "FULL",
        lastLogCount: 3,
        logs: ["one", "two", "three"],
      }),
    );
  });

  it.each([
    [{ includeHiddenContext: true }, "Hidden summary context"],
    [{ rangeType: "SINCE_NODE" as const }, "SINCE_NODE summaries"],
  ])("rejects an unsupported untrusted range before provider invocation", async (override, message) => {
    const { service, aiClient } = createSummaryHarness();

    await expect(
      service.runSummary("user-1", "session-1", {
        summaryType: "player_visible",
        rangeType: "RECENT",
        logs: ["deprecated compatibility value"],
        ...override,
      }),
    ).rejects.toThrow(message);
    expect(aiClient.runSummarizer).not.toHaveBeenCalled();
  });
});

describe("AiService quality metrics", () => {
  it("calculates timeout and fallback rates from database aggregates", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
          {
            kind: AiTraceKind.INTERPRETER,
            promptVersion: "interpreter.extract.v1.md",
            model: "test-model",
          traceCount: 2,
          tokenSampleCount: 0,
          promptTokenSampleCount: 2,
          outputTokenSampleCount: 1,
          totalTokenSampleCount: 0,
          schemaSampleCount: 2,
          promptTokenP50: 100,
          promptTokenP95: 140,
          outputTokenP50: 20,
          outputTokenP95: 25,
          totalTokenP50: null,
          totalTokenP95: null,
          providerLatencyP50Ms: 800,
          providerLatencyP95Ms: 1200,
          schemaRetryRate: 0.5,
        },
      ]),
      aiTrace: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 3 },
          _avg: { latencyMs: 10200 },
        }),
        groupBy: jest.fn().mockResolvedValue([
          {
            kind: AiTraceKind.INTERPRETER,
            status: AiTraceStatus.SUCCESS,
            fallbackUsed: false,
            _count: { _all: 1 },
          },
          {
            kind: AiTraceKind.INTERPRETER,
            status: AiTraceStatus.TIMEOUT,
            fallbackUsed: false,
            _count: { _all: 1 },
          },
          {
            kind: AiTraceKind.NARRATION,
            status: AiTraceStatus.ERROR,
            fallbackUsed: true,
            _count: { _all: 1 },
          },
        ]),
      },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      { ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getQualityMetrics("user-1", "session-1")).resolves.toMatchObject({
      totalTraces: 3,
      averageLatencyMs: 10200,
      interpreterTimeoutRate: 0.5,
      narratorTimeoutRate: 0,
      fallbackRate: 0.3333,
      interpreterTimeoutTargetMet: false,
      narratorTimeoutTargetMet: true,
      fallbackTargetMet: false,
      roleUsage: [
        expect.objectContaining({
          kind: AiTraceKind.INTERPRETER,
          promptVersion: "interpreter.extract.v1.md",
          model: "test-model",
          promptTokenP50: 100,
          outputTokenP95: 25,
          totalTokenP95: null,
          tokenSampleCount: 0,
          promptTokenSampleCount: 2,
          outputTokenSampleCount: 1,
          totalTokenSampleCount: 0,
          schemaSampleCount: 2,
          schemaRetryRate: 0.5,
        }),
      ],
    });
    const usageQuery = prisma.$queryRaw.mock.calls[0]?.[0] as
      | { strings?: readonly string[] }
      | undefined;
    const usageSql = usageQuery?.strings?.join("?") ?? "";
    expect(usageSql).toContain(
      'COUNT("promptTokenCount")::int AS "promptTokenSampleCount"',
    );
    expect(usageSql).toContain(
      'COUNT("outputTokenCount")::int AS "outputTokenSampleCount"',
    );
    expect(usageSql).toContain(
      'COUNT("totalTokenCount")::int AS "totalTokenSampleCount"',
    );
    expect(usageSql).toContain(
      'COUNT("totalTokenCount")::int AS "tokenSampleCount"',
    );
    expect(usageSql).toContain(
      'WHEN "schemaValidationRetries" IS NULL THEN NULL',
    );
    expect(usageSql).not.toContain("COALESCE");
    expect(prisma.aiTrace.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: "session-1" } }),
    );
    expect(prisma.aiTrace.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["kind", "status", "fallbackUsed"],
        where: { sessionId: "session-1" },
      }),
    );
  });

  it("does not claim operational targets are met without trace samples", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      aiTrace: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _avg: { latencyMs: null },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AiService(
      prisma as never,
      {
        ensureMembership: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(
      service.getQualityMetrics("user-1", "session-1"),
    ).resolves.toMatchObject({
      totalTraces: 0,
      averageLatencyMs: 0,
      interpreterTimeoutRate: 0,
      narratorTimeoutRate: 0,
      fallbackRate: 0,
      interpreterTimeoutTargetMet: false,
      narratorTimeoutTargetMet: false,
      fallbackTargetMet: false,
      roleUsage: [],
    });
  });
});

describe("AiService fallback trace persistence", () => {
  function createFallbackService(runDirector: jest.Mock) {
    const prisma = {
      aiTrace: {
        create: jest.fn().mockResolvedValue({ id: "trace-fallback" }),
      },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
      getPublicClueSummariesForUser: jest.fn().mockResolvedValue([]),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      { runDirector } as never,
      {} as never,
      {} as never,
      { ensureJoinedGmRuntimeParticipant: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, prisma };
  }

  it("marks an AI template fallback as fallbackUsed", async () => {
    const { service, prisma } = createFallbackService(jest.fn().mockResolvedValue({
      trace: {
        role: "director",
        provider: "fixture",
        model: "fixture",
        promptVersion: "fixture-v1",
        latencyMs: 5,
        attempts: 1,
        failureType: "template_fallback",
        finishReason: null,
        providerRequestId: null,
      },
      parsed: { content: "fallback", suggestions: [] },
      fallback: true,
      fallbackReason: "template",
    }));

    await service.runHint(
      "user-1",
      "session-1",
      { question: "hint", sceneSummary: "scene" },
      { emitSystemMessage: false },
    );

    expect(prisma.aiTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiTraceStatus.ERROR,
          failureType: "template_fallback",
          fallbackUsed: true,
        }),
      }),
    );
  });

  it("marks a BE default fallback as fallbackUsed", async () => {
    const { service, prisma } = createFallbackService(
      jest.fn().mockRejectedValue(new Error(`provider unavailable\n${"x".repeat(1200)}`)),
    );

    await service.runHint(
      "user-1",
      "session-1",
      { question: "hint", sceneSummary: "scene" },
      { emitSystemMessage: false },
    );

    expect(prisma.aiTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiTraceStatus.ERROR,
          failureType: "be_default_fallback",
          fallbackUsed: true,
          errorMessage: expect.not.stringContaining("\n"),
        }),
      }),
    );
    const persisted = prisma.aiTrace.create.mock.calls[0][0].data;
    expect(persisted.errorMessage).toHaveLength(1000);
  });

  it("uses timeout consistently in the fallback response and persisted trace", async () => {
    const { service, prisma } = createFallbackService(
      jest.fn().mockRejectedValue(new GatewayTimeoutException("timeout")),
    );

    const response = await service.runHint(
      "user-1",
      "session-1",
      { question: "hint", sceneSummary: "scene" },
      { emitSystemMessage: false },
    );

    expect(response).toMatchObject({
      fallback: true,
      fallbackReason: "timeout",
    });
    expect(prisma.aiTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiTraceStatus.TIMEOUT,
          failureType: "timeout",
          fallbackUsed: true,
        }),
      }),
    );
  });

  it("returns safe BE fallbacks when interpreter and actor endpoints are unreachable", async () => {
    const prisma = {
      aiTrace: {
        create: jest.fn().mockResolvedValue({ id: "trace-fallback" }),
      },
    };
    const aiClient = {
      runInterpreter: jest.fn().mockRejectedValue(new Error("AI server unavailable")),
      runActor: jest.fn().mockRejectedValue(new Error("AI server unavailable")),
    };
    const service = new AiService(
      prisma as never,
      {} as never,
      aiClient as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const interpreter = await service.runInterpreter("session-1", "user-1", {
      rawText: "문을 조사한다",
      actorCharacterId: "character-1",
    });
    const actor = await service.runActor("session-1", "user-1", {
      npcEntityId: "npc-1",
      npcSummary: "경계 중인 고블린",
      sceneSummary: "좁은 복도",
      allowedActions: [{ id: "wait", label: "대기", actionType: "WAIT" }],
    });

    expect(interpreter).toMatchObject({
      fallback: true,
      trace: { attempts: 0, attemptLatenciesMs: [] },
      parsed: {
        action: { type: "OUT_OF_SCOPE", actorCharacterId: "character-1", confidence: 0 },
        needsClarification: true,
      },
    });
    expect(actor).toMatchObject({
      fallback: true,
      trace: { attempts: 0, attemptLatenciesMs: [] },
      parsed: { selectedActionId: "wait" },
    });
  });
});

describe("AiService trace pagination", () => {
  it("uses a validated stable cursor and caps each page", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `trace-${index + 1}`,
      sessionId: "session-1",
      userId: "user-1",
      kind: AiTraceKind.NARRATION,
      status: AiTraceStatus.SUCCESS,
      latencyMs: 10 + index,
      provider: "fixture",
      model: "fixture",
      failureType: null,
      errorMessage: null,
      createdAt: new Date(`2026-07-10T00:00:0${3 - index}.000Z`),
    }));
    const prisma = {
      aiTrace: {
        findFirst: jest.fn().mockResolvedValue({ id: "trace-cursor" }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listTraces("user-1", "session-1", {
        kind: AiTraceKind.NARRATION as never,
        size: 2,
        cursor: "trace-cursor",
      }),
    ).resolves.toMatchObject({
      size: 2,
      nextCursor: "trace-2",
      items: [{ id: "trace-1" }, { id: "trace-2" }],
    });
    expect(prisma.aiTrace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        cursor: { id: "trace-cursor" },
        skip: 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });
});
