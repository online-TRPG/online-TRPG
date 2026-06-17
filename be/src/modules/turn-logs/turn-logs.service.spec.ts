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
});
