import { ActionEconomyService } from "./action-economy.service";

const key = {
  combatId: "combat-1",
  roundNo: 1,
  turnNo: 2,
  sessionCharacterId: "session-character-1",
};

const createTurnState = (overrides: Record<string, unknown> = {}) => ({
  id: "turn-state-1",
  ...key,
  actionUsed: false,
  bonusActionUsed: false,
  reactionUsed: false,
  additionalActionGranted: false,
  sneakAttackUsed: false,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
  ...overrides,
});

describe("ActionEconomyService", () => {
  const createService = () => {
    const prisma = {
      combatTurnState: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      service: new ActionEconomyService(prisma as never),
      prisma,
    };
  };

  it("gets or creates the current combat turn state", async () => {
    const { service, prisma } = createService();
    const turnState = createTurnState();
    prisma.combatTurnState.upsert.mockResolvedValue(turnState);

    await expect(service.getOrCreateTurnState(key)).resolves.toBe(turnState);
    expect(prisma.combatTurnState.upsert).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_sessionCharacterId: key,
      },
      create: key,
      update: {},
    });
  });

  it("spends a normal action when it is still available", async () => {
    const { service, prisma } = createService();
    prisma.combatTurnState.upsert.mockResolvedValue(createTurnState());
    prisma.combatTurnState.update.mockResolvedValue(createTurnState({ actionUsed: true }));

    await expect(service.spendAction(key)).resolves.toMatchObject({ actionUsed: true });
    expect(prisma.combatTurnState.update).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_sessionCharacterId: key,
      },
      data: { actionUsed: true },
    });
  });

  it("spends an additional action granted by Action Surge after the normal action was used", async () => {
    const { service, prisma } = createService();
    prisma.combatTurnState.upsert.mockResolvedValue(
      createTurnState({ actionUsed: true, additionalActionGranted: true }),
    );
    prisma.combatTurnState.update.mockResolvedValue(
      createTurnState({ actionUsed: true, additionalActionGranted: false }),
    );

    await expect(service.spendAction(key)).resolves.toMatchObject({
      actionUsed: true,
      additionalActionGranted: false,
    });
    expect(prisma.combatTurnState.update).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_sessionCharacterId: key,
      },
      data: { additionalActionGranted: false },
    });
  });

  it("rejects action spending when no normal or additional action remains", async () => {
    const { service, prisma } = createService();
    prisma.combatTurnState.upsert.mockResolvedValue(createTurnState({ actionUsed: true }));

    await expect(service.spendAction(key)).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "ACTION_ALREADY_USED" },
      },
    });
  });

  it("spends a bonus action once per turn", async () => {
    const { service, prisma } = createService();
    prisma.combatTurnState.upsert.mockResolvedValue(createTurnState());
    prisma.combatTurnState.update.mockResolvedValue(createTurnState({ bonusActionUsed: true }));

    await expect(service.spendBonusAction(key)).resolves.toMatchObject({
      bonusActionUsed: true,
    });
  });

  it("rejects duplicate sneak attack in the same turn", async () => {
    const { service, prisma } = createService();
    prisma.combatTurnState.upsert.mockResolvedValue(createTurnState({ sneakAttackUsed: true }));

    await expect(service.spendSneakAttack(key)).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "SNEAK_ATTACK_ALREADY_USED" },
      },
    });
  });
});
