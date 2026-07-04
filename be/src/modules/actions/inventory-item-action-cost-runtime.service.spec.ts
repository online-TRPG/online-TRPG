import { InventoryItemActionCostRuntimeService } from "./inventory-item-action-cost-runtime.service";

describe("InventoryItemActionCostRuntimeService", () => {
  const combat = {
    id: "combat-1",
    roundNo: 2,
    turnNo: 3,
    currentParticipantId: "actor-1",
    participants: [
      {
        id: "actor-1",
        sessionCharacterId: "session-character-1",
      },
    ],
  };
  const prisma = {
    combat: {
      findFirst: jest.fn(),
    },
  };
  const actionEconomy = {
    spendAction: jest.fn(),
    spendBonusAction: jest.fn(),
  };
  const service = new InventoryItemActionCostRuntimeService(
    prisma as never,
    actionEconomy as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.combat.findFirst.mockResolvedValue(combat);
  });

  it("does nothing when there is no active combat", async () => {
    prisma.combat.findFirst.mockResolvedValue(null);

    await service.spendActionCost({
      sessionId: "session-1",
      sessionCharacterId: "session-character-1",
      actionCost: "action",
    });

    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(actionEconomy.spendBonusAction).not.toHaveBeenCalled();
  });

  it("spends an action for the current combat participant", async () => {
    await service.spendActionCost({
      sessionId: "session-1",
      sessionCharacterId: "session-character-1",
      actionCost: "action",
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "actor-1",
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: "session-character-1",
    });
  });

  it("spends a bonus action for the current combat participant", async () => {
    await service.spendActionCost({
      sessionId: "session-1",
      sessionCharacterId: "session-character-1",
      actionCost: "bonus_action",
    });

    expect(actionEconomy.spendBonusAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "actor-1",
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: "session-character-1",
    });
  });

  it("rejects item use when the actor is not the current participant", async () => {
    prisma.combat.findFirst.mockResolvedValue({
      ...combat,
      currentParticipantId: "other-participant",
    });

    await expect(
      service.spendActionCost({
        sessionId: "session-1",
        sessionCharacterId: "session-character-1",
        actionCost: "action",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_USE_REQUIRES_CURRENT_TURN",
        }),
      },
    });
  });
});
