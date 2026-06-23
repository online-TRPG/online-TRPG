import {
  CraftingRecipe,
  EconomyRuntimeService,
  EconomyState,
} from "./economy-runtime.service";

describe("EconomyRuntimeService P4 economy MVP", () => {
  let service: EconomyRuntimeService;

  const createState = (): EconomyState => ({
    partyStash: [
      { itemDefinitionId: "magic_item.necklace_of_fireballs", quantity: 2, identified: true },
      { itemDefinitionId: "magic_item.ring_of_protection", quantity: 1, identified: false },
      { itemDefinitionId: "magic_item.wand_of_web", quantity: 1, identified: true, chargesRemaining: 2 },
      { itemDefinitionId: "equipment.방패", quantity: 1, identified: true, damaged: true },
    ],
    walletsBySessionCharacterId: {
      "sc-1": { gp: 120 },
      "sc-2": { gp: 20 },
    },
    shopStatesById: {
      "shop-storm-vault": {
        shopId: "shop-storm-vault",
        sellPriceMultiplier: 0.5,
        inventory: [
          { itemDefinitionId: "equipment.potion_of_healing", quantity: 4, priceGp: 50 },
          { itemDefinitionId: "magic_item.cloak_of_protection", quantity: 1, priceGp: 750, requiresApproval: true },
        ],
      },
    },
    craftingProgressById: {},
  });

  beforeEach(() => {
    service = new EconomyRuntimeService();
  });

  it("resolves shop purchase with server-authoritative stock, wallet, stash, and audit diff", () => {
    const result = service.purchaseFromShop({
      state: createState(),
      shopId: "shop-storm-vault",
      sessionCharacterId: "sc-1",
      itemDefinitionId: "equipment.potion_of_healing",
      quantity: 2,
    });

    expect(result).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "shop_purchase",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "equipment.potion_of_healing",
        quantity: 2,
        currencyDeltaBySessionCharacterId: {
          "sc-1": { gp: -100 },
        },
      },
      stateDiff: {
        type: "economy",
        economy: { type: "shop_purchase" },
      },
    });
    if (!result.accepted) return;
    expect(result.state.walletsBySessionCharacterId["sc-1"]).toEqual({ gp: 20 });
    expect(result.state.shopStatesById["shop-storm-vault"].inventory[0]).toMatchObject({
      itemDefinitionId: "equipment.potion_of_healing",
      quantity: 2,
    });
    expect(result.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemDefinitionId: "equipment.potion_of_healing",
          quantity: 2,
          identified: true,
        }),
      ]),
    );
  });

  it("rejects purchases that exceed wallet, stock, or buy limits", () => {
    expect(
      service.purchaseFromShop({
        state: createState(),
        shopId: "shop-storm-vault",
        sessionCharacterId: "sc-2",
        itemDefinitionId: "equipment.potion_of_healing",
        quantity: 1,
      }),
    ).toEqual(expect.objectContaining({ accepted: false, reason: "insufficient_funds" }));

    expect(
      service.purchaseFromShop({
        state: createState(),
        shopId: "shop-storm-vault",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "equipment.potion_of_healing",
        quantity: 99,
      }),
    ).toEqual(expect.objectContaining({ accepted: false, reason: "shop_stock_exceeded" }));
  });

  it("resolves sales by moving party stash quantity into shop stock and paying the seller", () => {
    const result = service.sellToShop({
      state: createState(),
      shopId: "shop-storm-vault",
      sessionCharacterId: "sc-2",
      itemDefinitionId: "magic_item.necklace_of_fireballs",
      quantity: 1,
      basePriceGp: 100,
    });

    expect(result).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "shop_sale",
        sessionCharacterId: "sc-2",
        itemDefinitionId: "magic_item.necklace_of_fireballs",
        quantity: 1,
        currencyDeltaBySessionCharacterId: {
          "sc-2": { gp: 50 },
        },
      },
    });
    if (!result.accepted) return;
    expect(result.state.walletsBySessionCharacterId["sc-2"]).toEqual({ gp: 70 });
    expect(result.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "magic_item.necklace_of_fireballs", quantity: 1 }),
      ]),
    );
    expect(result.state.shopStatesById["shop-storm-vault"].inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "magic_item.necklace_of_fireballs", quantity: 1, priceGp: 100 }),
      ]),
    );
  });

  it("grants rewards into split wallets and party stash with auditable recipients", () => {
    const result = service.grantReward({
      state: createState(),
      recipientSessionCharacterIds: ["sc-1", "sc-2"],
      reward: {
        rewardId: "reward-storm-vault-cache",
        currency: { gp: 50 },
        splitCurrency: true,
        items: [{ itemDefinitionId: "magic_item.wand_of_web", quantity: 1, identified: false }],
      },
    });

    expect(result).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "reward_granted",
        currencyDeltaBySessionCharacterId: {
          "sc-1": { gp: 25 },
          "sc-2": { gp: 25 },
        },
        metadata: {
          rewardId: "reward-storm-vault-cache",
          recipients: ["sc-1", "sc-2"],
        },
      },
    });
    if (!result.accepted) return;
    expect(result.state.walletsBySessionCharacterId["sc-1"]).toEqual({ gp: 145 });
    expect(result.state.walletsBySessionCharacterId["sc-2"]).toEqual({ gp: 45 });
    expect(result.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "magic_item.wand_of_web", quantity: 1, identified: false }),
      ]),
    );
  });

  it("starts and completes crafting using materials, tool proficiency, labor, and audit diff", () => {
    const recipe: CraftingRecipe = {
      recipeId: "recipe-storm-key",
      outputItemDefinitionId: "magic_item.immovable_rod",
      outputQuantity: 1,
      requiredMaterials: [{ itemDefinitionId: "magic_item.necklace_of_fireballs", quantity: 2 }],
      requiredToolProficiencies: ["tool:tinker"],
      laborHours: 8,
      costGp: 10,
    };

    const started = service.startCrafting({
      state: createState(),
      recipe,
      sessionCharacterId: "sc-1",
      knownToolProficiencies: ["tool:tinker"],
      craftingId: "craft-1",
    });

    expect(started).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "crafting_started",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "magic_item.immovable_rod",
        quantity: 1,
        currencyDeltaBySessionCharacterId: {
          "sc-1": { gp: -10 },
        },
      },
    });
    if (!started.accepted) return;
    expect(started.state.partyStash.find((item) => item.itemDefinitionId === "magic_item.necklace_of_fireballs")).toBeUndefined();

    const progressed = service.progressCrafting({
      state: started.state,
      craftingId: "craft-1",
      laborHours: 8,
    });

    expect(progressed).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "crafting_progressed",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "magic_item.immovable_rod",
        quantity: 1,
        metadata: {
          craftingId: "craft-1",
          completedHours: 8,
          requiredHours: 8,
          status: "completed",
        },
      },
    });
    if (!progressed.accepted) return;
    expect(progressed.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "magic_item.immovable_rod", quantity: 1, identified: true }),
      ]),
    );
  });

  it("rejects crafting without required tool proficiency or materials", () => {
    const recipe: CraftingRecipe = {
      recipeId: "recipe-impossible",
      outputItemDefinitionId: "equipment.impossible",
      outputQuantity: 1,
      requiredMaterials: [{ itemDefinitionId: "equipment.missing", quantity: 1 }],
      requiredToolProficiencies: ["tool:smith"],
      laborHours: 1,
    };

    expect(
      service.startCrafting({
        state: createState(),
        recipe,
        sessionCharacterId: "sc-1",
        knownToolProficiencies: [],
        craftingId: "craft-missing-tool",
      }),
    ).toEqual(expect.objectContaining({ accepted: false, reason: "missing_tool_proficiency" }));

    expect(
      service.startCrafting({
        state: createState(),
        recipe: { ...recipe, requiredToolProficiencies: [] },
        sessionCharacterId: "sc-1",
        knownToolProficiencies: [],
        craftingId: "craft-missing-material",
      }),
    ).toEqual(expect.objectContaining({ accepted: false, reason: "missing_required_material" }));
  });

  it("identifies and repairs magic items with wallet cost and audit state diff", () => {
    const identified = service.identifyItem({
      state: createState(),
      sessionCharacterId: "sc-1",
      itemDefinitionId: "magic_item.ring_of_protection",
      costGp: 25,
    });

    expect(identified).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "item_identified",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "magic_item.ring_of_protection",
        currencyDeltaBySessionCharacterId: {
          "sc-1": { gp: -25 },
        },
      },
    });
    if (!identified.accepted) return;
    expect(identified.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "magic_item.ring_of_protection", identified: true }),
      ]),
    );

    const repaired = service.repairItem({
      state: identified.state,
      sessionCharacterId: "sc-1",
      itemDefinitionId: "equipment.방패",
      costGp: 5,
    });

    expect(repaired).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "item_repaired",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "equipment.방패",
        currencyDeltaBySessionCharacterId: {
          "sc-1": { gp: -5 },
        },
      },
    });
    if (!repaired.accepted) return;
    expect(repaired.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemDefinitionId: "equipment.방패", damaged: false }),
      ]),
    );
    expect(repaired.state.walletsBySessionCharacterId["sc-1"]).toEqual({ gp: 90 });
  });

  it("attunes magic items and recovers charges with auditable economy events", () => {
    const attuned = service.attuneItem({
      state: createState(),
      sessionCharacterId: "sc-1",
      itemDefinitionId: "magic_item.ring_of_protection",
    });

    expect(attuned).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "item_attuned",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "magic_item.ring_of_protection",
      },
      stateDiff: {
        type: "economy",
        economy: { type: "item_attuned" },
      },
    });
    if (!attuned.accepted) return;
    expect(attuned.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemDefinitionId: "magic_item.ring_of_protection",
          attunedBySessionCharacterId: "sc-1",
        }),
      ]),
    );

    expect(
      service.attuneItem({
        state: attuned.state,
        sessionCharacterId: "sc-2",
        itemDefinitionId: "magic_item.ring_of_protection",
      }),
    ).toEqual(expect.objectContaining({ accepted: false, reason: "item_attuned_by_other_character" }));

    const recharged = service.recoverItemCharges({
      state: attuned.state,
      sessionCharacterId: "sc-1",
      itemDefinitionId: "magic_item.wand_of_web",
      chargesRecovered: 4,
      maximumCharges: 7,
    });

    expect(recharged).toMatchObject({
      accepted: true,
      auditEvent: {
        type: "item_charges_recovered",
        sessionCharacterId: "sc-1",
        itemDefinitionId: "magic_item.wand_of_web",
        metadata: {
          chargesRecovered: 4,
          chargesRemaining: 6,
          maximumCharges: 7,
        },
      },
    });
    if (!recharged.accepted) return;
    expect(recharged.state.partyStash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemDefinitionId: "magic_item.wand_of_web",
          chargesRemaining: 6,
        }),
      ]),
    );
  });
});
