import { BadRequestException } from "@nestjs/common";
import { ApplySessionEconomyActionDto } from "@trpg/shared-types";
import { EconomyState } from "../rules/economy-runtime.service";
import { SessionEconomyService } from "./session-economy.service";

describe("SessionEconomyService", () => {
  const service = new SessionEconomyService();

  const baseState = (): EconomyState => ({
    partyStash: [],
    walletsBySessionCharacterId: {},
    shopStatesById: {},
    craftingProgressById: {},
  });

  it("creates an empty economy state", () => {
    expect(service.createInitialState()).toEqual({
      partyStash: [],
      walletsBySessionCharacterId: {},
      shopStatesById: {},
      craftingProgressById: {},
    });
  });

  it("normalizes wallets to finite non-zero integer currency values", () => {
    expect(
      service.normalizeWallet({
        cp: 1.8,
        sp: 0,
        gp: Number.NaN,
        pp: 2,
      }),
    ).toEqual({
      cp: 1,
      pp: 2,
    });
  });

  it("prepares purchase state without mutating the source state", () => {
    const source = baseState();
    const dto: ApplySessionEconomyActionDto = {
      actionType: "purchase",
      sessionCharacterId: "session-character-1",
      shopId: "shop-1",
      itemDefinitionId: "item-1",
      quantity: 1,
      stockQuantity: 2,
      priceGp: 5,
      currency: { gp: 10 },
      items: [{ itemDefinitionId: "stash-item-1", quantity: 1 }],
    };

    const prepared = service.prepareStateForAction(source, dto);

    expect(source).toEqual(baseState());
    expect(prepared.walletsBySessionCharacterId["session-character-1"]).toEqual({
      gp: 10,
    });
    expect(prepared.shopStatesById["shop-1"]).toEqual({
      shopId: "shop-1",
      inventory: [{ itemDefinitionId: "item-1", quantity: 2, priceGp: 5 }],
    });
    expect(prepared.partyStash).toEqual([
      { itemDefinitionId: "stash-item-1", quantity: 1 },
    ]);
  });

  it("resolves a purchase action through the economy runtime", () => {
    const state = service.prepareStateForAction(baseState(), {
      actionType: "purchase",
      sessionCharacterId: "session-character-1",
      shopId: "shop-1",
      itemDefinitionId: "item-1",
      priceGp: 5,
      currency: { gp: 10 },
      stockQuantity: 1,
    });

    const result = service.resolveAction(state, {
      actionType: "purchase",
      sessionCharacterId: "session-character-1",
      shopId: "shop-1",
      itemDefinitionId: "item-1",
      quantity: 1,
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.auditEvent).toMatchObject({
        type: "shop_purchase",
        sessionCharacterId: "session-character-1",
        itemDefinitionId: "item-1",
        quantity: 1,
      });
    }
  });

  it("requires fields needed by the selected economy action", () => {
    expect(() =>
      service.resolveAction(baseState(), {
        actionType: "purchase",
        sessionCharacterId: "session-character-1",
        itemDefinitionId: "item-1",
      }),
    ).toThrow(BadRequestException);
  });
});
