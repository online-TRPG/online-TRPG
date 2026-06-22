import { StateDiffService } from "./state-diff.service";

describe("StateDiffService", () => {
  it("persists combat participant condition patches", async () => {
    const tx = {
      sessionCharacter: { update: jest.fn() },
      combatParticipant: { update: jest.fn() },
      gameState: { update: jest.fn() },
      stateDiff: { create: jest.fn() },
    };
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          sessionScenarioId: "session-scenario-1",
          version: 7,
        }),
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
    };
    const service = new StateDiffService(prisma as never);

    const result = await service.applyCharacterChanges({
      sessionScenarioId: "session-scenario-1",
      baseVersion: 7,
      turnLogId: "turn-log-1",
      reason: "condition",
      changes: [{ combatParticipantId: "participant-1", conditions: ["stunned"] }],
    });

    expect(tx.sessionCharacter.update).not.toHaveBeenCalled();
    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: {
        currentHp: undefined,
        conditionsJson: JSON.stringify(["stunned"]),
        isAlive: undefined,
      },
    });
    expect(result).toMatchObject({
      baseVersion: 7,
      nextVersion: 8,
      diff: {
        characters: [{ combatParticipantId: "participant-1", conditions: ["stunned"] }],
      },
    });
  });
});
