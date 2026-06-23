import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import { EconomyRuntimeService, EconomyState } from "./economy-runtime.service";
import { ECONOMY_FLAGS_KEY, EconomyStateRuntimeService } from "./economy-state-runtime.service";

describe("EconomyStateRuntimeService P4 economy persistence", () => {
  const createEconomyState = (): EconomyState => ({
    partyStash: [],
    walletsBySessionCharacterId: {
      "sc-1": { gp: 120 },
    },
    shopStatesById: {
      "shop-storm-vault": {
        shopId: "shop-storm-vault",
        inventory: [{ itemDefinitionId: "equipment.potion_of_healing", quantity: 3, priceGp: 50 }],
      },
    },
    craftingProgressById: {},
  });

  const createPrisma = () => {
    const tx = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          version: 7,
          flagsJson: JSON.stringify({ scene: "market" }),
        }),
        update: jest.fn(),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 12 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-economy-1",
          turnNumber: 13,
          playerActionId: null,
          actorUserId: "gm-1",
          sessionCharacterId: "sc-1",
          rawInput: "/economy buy",
          structuredActionJson: JSON.stringify({
            type: "economy",
            economyAction: "shop_purchase",
          }),
          diceResultJson: null,
          stateDiffJson: JSON.stringify({
            baseVersion: 7,
            nextVersion: 8,
            reason: "economy:shop_purchase",
            diff: { economy: { auditEvent: { type: "shop_purchase" } } },
          }),
          outcome: PrismaActionOutcome.SUCCESS,
          narration: "경제 처리 완료",
          createdAt: new Date("2026-06-23T00:00:00.000Z"),
        }),
      },
      stateDiff: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return { prisma, tx };
  };

  it("stores accepted economy state in game state flags and writes auditable turn/state diffs", async () => {
    const economyRuntime = new EconomyRuntimeService();
    const resolution = economyRuntime.purchaseFromShop({
      state: createEconomyState(),
      shopId: "shop-storm-vault",
      sessionCharacterId: "sc-1",
      itemDefinitionId: "equipment.potion_of_healing",
      quantity: 2,
    });
    expect(resolution.accepted).toBe(true);
    if (!resolution.accepted) return;

    const { prisma, tx } = createPrisma();
    const service = new EconomyStateRuntimeService(prisma as never);
    const result = await service.applyResolution({
      sessionId: "session-1",
      sessionScenarioId: "ss-1",
      actorUserId: "gm-1",
      rawInput: "/economy buy",
      resolution,
    });

    const flagsJson = tx.gameState.update.mock.calls[0][0].data.flagsJson;
    expect(JSON.parse(flagsJson)).toMatchObject({
      scene: "market",
      [ECONOMY_FLAGS_KEY]: {
        walletsBySessionCharacterId: {
          "sc-1": { gp: 20 },
        },
        partyStash: [
          {
            itemDefinitionId: "equipment.potion_of_healing",
            quantity: 2,
            identified: true,
          },
        ],
      },
    });
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          sessionScenarioId: "ss-1",
          actorUserId: "gm-1",
          sessionCharacterId: "sc-1",
          turnNumber: 13,
          rawInput: "/economy buy",
          outcome: PrismaActionOutcome.SUCCESS,
        }),
      }),
    );
    expect(JSON.parse(tx.turnLog.create.mock.calls[0][0].data.stateDiffJson)).toMatchObject({
      baseVersion: 7,
      nextVersion: 8,
      reason: "economy:shop_purchase",
      diff: {
        economy: {
          auditEvent: {
            type: "shop_purchase",
            itemDefinitionId: "equipment.potion_of_healing",
          },
        },
      },
    });
    expect(tx.stateDiff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionScenarioId: "ss-1",
        turnLogId: "turn-economy-1",
        baseVersion: 7,
        nextVersion: 8,
        reason: "economy:shop_purchase",
      }),
    });
    expect(result).toMatchObject({
      economy: {
        walletsBySessionCharacterId: {
          "sc-1": { gp: 20 },
        },
      },
      stateDiff: {
        baseVersion: 7,
        nextVersion: 8,
      },
      turnLog: {
        turnLogId: "turn-economy-1",
        outcome: "SUCCESS",
      },
    });
  });

  it("reads economy state back from flags defensively", () => {
    const service = new EconomyStateRuntimeService({} as never);
    const economy = createEconomyState();

    expect(service.readEconomyStateFromFlags(JSON.stringify({ [ECONOMY_FLAGS_KEY]: economy }))).toEqual(economy);
    expect(service.readEconomyStateFromFlags("{not-json")).toBeNull();
    expect(service.readEconomyStateFromFlags(JSON.stringify({ [ECONOMY_FLAGS_KEY]: { broken: true } }))).toBeNull();
  });
});
