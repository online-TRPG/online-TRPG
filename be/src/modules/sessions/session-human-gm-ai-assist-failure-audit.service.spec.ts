import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import type { HumanGmAiAssistSuggestionDto } from "@trpg/shared-types";
import { SessionHumanGmAiAssistFailureAuditService } from "./session-human-gm-ai-assist-failure-audit.service";

describe("SessionHumanGmAiAssistFailureAuditService", () => {
  const now = new Date("2026-07-02T00:00:00.000Z");
  const suggestion: HumanGmAiAssistSuggestionDto = {
    id: "ai-assist:1",
    assistType: "node_move",
    content: "Move to the next room.",
    suggestedActionId: "node-next",
    targetId: "node-2",
    status: "ACCEPTED",
    createdByUserId: "gm-1",
    acceptedByUserId: "gm-1",
    createdAt: now.toISOString(),
    acceptedAt: now.toISOString(),
  };

  const createService = (latestTurnNumber: number | null = 6) => {
    const prisma = {
      turnLog: {
        findFirst: jest.fn().mockResolvedValue(latestTurnNumber === null ? null : { turnNumber: latestTurnNumber }),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "turn-log-1",
          turnNumber: data.turnNumber,
          playerActionId: null,
          actorUserId: data.actorUserId,
          sessionCharacterId: null,
          rawInput: data.rawInput,
          structuredActionJson: data.structuredActionJson,
          outcome: data.outcome,
          narration: data.narration,
          createdAt: now,
        })),
      },
    };
    return {
      prisma,
      service: new SessionHumanGmAiAssistFailureAuditService(prisma as never),
    };
  };

  it("creates a failure audit turn log for an accepted AI assist suggestion", async () => {
    const { prisma, service } = createService();

    const result = await service.createFailureTurnLog({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      gmUserId: "gm-1",
      suggestion,
      failedOperation: " node_move ",
      failureReason: " Node does not exist. ",
    });

    expect(prisma.turnLog.findFirst).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
      orderBy: { turnNumber: "desc" },
      select: { turnNumber: true },
    });
    expect(prisma.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "gm-1",
        turnNumber: 7,
        rawInput: "gm:ai_assist_apply_failure",
        stateDiffJson: null,
        outcome: PrismaActionOutcome.FAILURE,
        narration: "GM AI assist 제안 승인 후 적용에 실패했습니다.",
      }),
    });
    const createPayload = prisma.turnLog.create.mock.calls[0][0] as {
      data: { structuredActionJson: string };
    };
    expect(JSON.parse(createPayload.data.structuredActionJson)).toEqual({
      type: "gm_override",
      kind: "ai_assist_apply_failure",
      targetId: "node-2",
      public: true,
      hasPrivateNote: false,
      metadata: {
        assistType: "node_move",
        suggestionId: "ai-assist:1",
        suggestedActionId: "node-next",
        targetId: "node-2",
        failedOperation: "node_move",
        failureReason: "Node does not exist.",
      },
    });
    expect(result.turnLog).toEqual(
      expect.objectContaining({
        turnLogId: "turn-log-1",
        turnNumber: 7,
        rawInput: "gm:ai_assist_apply_failure",
        stateDiff: null,
        outcome: PrismaActionOutcome.FAILURE,
      }),
    );
    expect(result.stateDiff).toBeNull();
  });

  it("falls back when failure reason and failed operation are blank", async () => {
    const { prisma, service } = createService(null);

    await service.createFailureTurnLog({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      gmUserId: "gm-1",
      suggestion,
      failedOperation: " ",
      failureReason: " ",
    });

    const createPayload = prisma.turnLog.create.mock.calls[0][0] as {
      data: { turnNumber: number; structuredActionJson: string };
    };
    expect(createPayload.data.turnNumber).toBe(1);
    expect(JSON.parse(createPayload.data.structuredActionJson).metadata).toEqual(
      expect.objectContaining({
        failedOperation: null,
        failureReason: "Unknown AI assist application failure.",
      }),
    );
  });
});
