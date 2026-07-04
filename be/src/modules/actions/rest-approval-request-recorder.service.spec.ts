import { RestApprovalRequestRecorderService } from "./rest-approval-request-recorder.service";

describe("RestApprovalRequestRecorderService", () => {
  const prisma = {
    playerAction: {
      create: jest.fn(),
    },
  };
  const realtimeEvents = {
    emitActionAccepted: jest.fn(),
    emitTurnLogCreated: jest.fn(),
  };
  const turnLogsService = {
    createTurnLog: jest.fn(),
  };
  const service = new RestApprovalRequestRecorderService(
    prisma as never,
    realtimeEvents as never,
    turnLogsService as never,
  );
  const clientCreatedAt = new Date("2026-06-22T00:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(clientCreatedAt);
    prisma.playerAction.create.mockResolvedValue({
      id: "action-1",
      userId: "user-1",
      rawText: "/rest short 2",
      clientCreatedAt,
    });
    turnLogsService.createTurnLog.mockResolvedValue({ id: "turn-log-1" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("records a HUMAN GM rest approval request and emits accepted/log events", async () => {
    await expect(
      service.recordHumanGmRequest({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        stateVersion: 7,
        sessionCharacterId: "session-character-1",
        userId: "user-1",
        restType: "short",
        hitDiceToSpend: 2,
        rawText: "/rest short 2",
      }),
    ).resolves.toMatchObject({
      playerActionId: "action-1",
      sessionId: "session-1",
      queueStatus: "REJECTED",
      baseStateVersion: 7,
      restApproval: {
        actionId: "action-1",
        restType: "short",
        status: "gm_required",
        hitDiceToSpend: 2,
      },
    });
    expect(prisma.playerAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          userId: "user-1",
          rawText: "/rest short 2",
          queueStatus: "REJECTED",
          failureReason: "REST_REQUIRES_GM_APPROVAL",
          baseStateVersion: 7,
          clientCreatedAt,
        }),
      }),
    );
    expect(realtimeEvents.emitActionAccepted).toHaveBeenCalledWith("session-1", {
      playerActionId: "action-1",
      actorUserId: "user-1",
      rawText: "/rest short 2",
      clientCreatedAt: clientCreatedAt.toISOString(),
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        playerActionId: "action-1",
        actorUserId: "user-1",
        sessionCharacterId: "session-character-1",
        rawInput: "/rest short 2",
        narration: "휴식 요청이 GM 승인 대기 상태로 기록되었습니다.",
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { id: "turn-log-1" },
    );
  });
});
