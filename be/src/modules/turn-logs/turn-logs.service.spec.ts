import { ActionOutcome, ActionQueueStatus } from "@trpg/shared-types";
import { TurnLogsService } from "./turn-logs.service";

describe("TurnLogsService", () => {
  it("maps linked player action queue status for rest approval UI state", async () => {
    const prisma = {
      turnLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "turn-log-1",
            turnNumber: 1,
            playerActionId: "approval-action-1",
            actorUserId: "player-user-1",
            sessionCharacterId: "session-character-1",
            playerAction: {
              queueStatus: "REJECTED",
              clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
              createdAt: new Date("2026-06-14T01:00:01.000Z"),
            },
            rawInput: "/rest short",
            structuredActionJson: JSON.stringify({
              type: "rest",
              restType: "short",
              approvalStatus: "gm_required",
            }),
            diceResultJson: null,
            stateDiffJson: null,
            outcome: ActionOutcome.NO_ROLL,
            narration: "휴식 요청이 GM 승인 대기 상태로 기록되었습니다.",
            createdAt: new Date("2026-06-14T01:00:02.000Z"),
          },
        ]),
      },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({ id: "session-1" }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TurnLogsService(prisma as never, sessionsService as never);

    const result = await service.listTurnLogs("gm-user-1", "session-1", {});

    expect(result.turnLogs[0]).toMatchObject({
      playerActionId: "approval-action-1",
      actionQueueStatus: ActionQueueStatus.REJECTED,
      structuredAction: {
        type: "rest",
        restType: "short",
        approvalStatus: "gm_required",
      },
    });
    expect(prisma.turnLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          playerAction: {
            select: {
              queueStatus: true,
              clientCreatedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    );
  });

  it("converts an existing action turn log to failure instead of creating a duplicate", async () => {
    const existing = {
      id: "turn-log-1",
      turnNumber: 4,
      playerActionId: "action-1",
      actorUserId: "user-1",
      sessionCharacterId: "session-character-1",
      playerAction: {
        queueStatus: "FAILED",
        clientCreatedAt: new Date("2026-06-18T01:00:00.000Z"),
        createdAt: new Date("2026-06-18T01:00:01.000Z"),
      },
      rawInput: "/item pickup object-rope equipment.rope 1 1 0",
      structuredActionJson: JSON.stringify({ type: "item_interaction", operation: "pickup" }),
      diceResultJson: null,
      stateDiffJson: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "아이템을 주웠습니다.",
      createdAt: new Date("2026-06-18T01:00:02.000Z"),
    };
    const prisma = {
      turnLog: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...existing,
          ...data,
        })),
      },
    };
    const service = new TurnLogsService(prisma as never, {} as never);

    const result = await service.markLatestPlayerActionFailed(
      "action-1",
      "VTT map state conflict",
    );

    expect(prisma.turnLog.update).toHaveBeenCalledWith({
      where: { id: "turn-log-1" },
      data: {
        outcome: ActionOutcome.FAILURE,
        narration: "행동 처리 실패: VTT map state conflict",
      },
      include: {
        playerAction: {
          select: {
            queueStatus: true,
            clientCreatedAt: true,
            createdAt: true,
          },
        },
      },
    });
    expect(result).toMatchObject({
      turnLogId: "turn-log-1",
      outcome: ActionOutcome.FAILURE,
      narration: "행동 처리 실패: VTT map state conflict",
    });
  });
});
