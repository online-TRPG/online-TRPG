import { AiTraceKind, AiTraceStatus } from "@prisma/client";
import { AiService } from "./ai.service";

describe("AiService HUMAN GM assist suggestions", () => {
  it("stores provider-generated GM assist output as a pending HUMAN GM suggestion", async () => {
    const prisma = {
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
        provider: "test-provider",
        model: "test-model",
        latencyMs: 12,
        promptVersion: "director.test",
        rawOutput: "{}",
        finishReason: "stop",
        providerRequestId: "provider-1",
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
        logPaths: null,
        parsed: {
          hintLevel: "NORMAL",
          content: "문 너머의 공기가 무겁게 가라앉아 있습니다.",
          sourceScope: "scene",
          spoilerLevel: "none",
          suggestions: ["천천히 문을 열며 기척을 살핀다."],
          safetyNotes: [],
        },
      }),
    };
    const service = new AiService(
      prisma as never,
      sessionsService as never,
      aiClient as never,
      {} as never,
      {} as never,
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
  });
});

describe("AiService quality metrics", () => {
  it("calculates timeout and fallback rates from database aggregates", async () => {
    const prisma = {
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
    });
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
    );
    return { service, prisma };
  }

  it("marks an AI template fallback as fallbackUsed", async () => {
    const { service, prisma } = createFallbackService(jest.fn().mockResolvedValue({
      provider: "fixture",
      model: "fixture",
      latencyMs: 5,
      trace: { failureType: "template_fallback" },
      parsed: { content: "fallback", suggestions: [], safetyNotes: [] },
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
          status: AiTraceStatus.SUCCESS,
          failureType: "ai_template_fallback",
          fallbackUsed: true,
        }),
      }),
    );
  });

  it("marks a BE default fallback as fallbackUsed", async () => {
    const { service, prisma } = createFallbackService(
      jest.fn().mockRejectedValue(new Error("provider unavailable")),
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
        }),
      }),
    );
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
