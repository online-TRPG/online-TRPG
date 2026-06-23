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
  it("calculates timeout and fallback rates from persisted AiTrace rows", async () => {
    const prisma = {
      aiTrace: {
        findMany: jest.fn().mockResolvedValue([
          {
            kind: AiTraceKind.INTERPRETER,
            status: AiTraceStatus.SUCCESS,
            latencyMs: 100,
            failureType: null,
            responseJson: JSON.stringify({ fallback: false }),
          },
          {
            kind: AiTraceKind.INTERPRETER,
            status: AiTraceStatus.TIMEOUT,
            latencyMs: 30000,
            failureType: "timeout",
            responseJson: null,
          },
          {
            kind: AiTraceKind.NARRATION,
            status: AiTraceStatus.ERROR,
            latencyMs: 500,
            failureType: "be_default_fallback",
            responseJson: JSON.stringify({ fallback: true }),
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
      interpreterTimeoutRate: 0.5,
      narratorTimeoutRate: 0,
      fallbackRate: 0.3333,
      interpreterTimeoutTargetMet: false,
      narratorTimeoutTargetMet: true,
      fallbackTargetMet: false,
    });
  });
});
