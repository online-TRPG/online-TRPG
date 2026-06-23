import { Injectable } from "@nestjs/common";

export type CurrencyWallet = {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
};

export type EconomyInventoryItem = {
  itemDefinitionId: string;
  quantity: number;
  identified?: boolean;
  damaged?: boolean;
  attunedBySessionCharacterId?: string | null;
  chargesRemaining?: number | null;
};

export type ShopInventoryItem = {
  itemDefinitionId: string;
  quantity: number;
  priceGp: number;
  buyLimit?: number | null;
  requiresApproval?: boolean;
};

export type ShopState = {
  shopId: string;
  inventory: ShopInventoryItem[];
  sellPriceMultiplier?: number;
};

export type EconomyState = {
  partyStash: EconomyInventoryItem[];
  walletsBySessionCharacterId: Record<string, CurrencyWallet>;
  shopStatesById: Record<string, ShopState>;
  craftingProgressById: Record<string, CraftingProgress>;
};

export type RewardTable = {
  rewardId: string;
  currency?: CurrencyWallet;
  items?: EconomyInventoryItem[];
  splitCurrency?: boolean;
};

export type CraftingRecipe = {
  recipeId: string;
  outputItemDefinitionId: string;
  outputQuantity: number;
  requiredMaterials: EconomyInventoryItem[];
  requiredToolProficiencies?: string[];
  laborHours: number;
  costGp?: number;
};

export type CraftingProgress = {
  craftingId: string;
  recipeId: string;
  sessionCharacterId: string;
  outputItemDefinitionId: string;
  outputQuantity: number;
  completedHours: number;
  requiredHours: number;
  status: "in_progress" | "completed";
};

export type EconomyAuditEvent = {
  type:
    | "shop_purchase"
    | "shop_sale"
    | "reward_granted"
    | "party_stash_distributed"
    | "crafting_started"
    | "crafting_progressed"
    | "item_identified"
    | "item_repaired"
    | "item_attuned"
    | "item_charges_recovered";
  sessionCharacterId?: string | null;
  itemDefinitionId?: string | null;
  quantity?: number | null;
  currencyDeltaBySessionCharacterId?: Record<string, CurrencyWallet>;
  metadata?: Record<string, unknown>;
};

export type EconomyResolution = {
  accepted: true;
  state: EconomyState;
  auditEvent: EconomyAuditEvent;
  stateDiff: {
    type: "economy";
    economy: EconomyAuditEvent;
  };
};

export type EconomyRejection = {
  accepted: false;
  reason:
    | "invalid_quantity"
    | "insufficient_funds"
    | "shop_not_found"
    | "shop_item_not_found"
    | "shop_stock_exceeded"
    | "shop_buy_limit_exceeded"
    | "missing_inventory_item"
    | "insufficient_inventory_quantity"
    | "missing_required_material"
    | "missing_tool_proficiency"
    | "invalid_labor_hours"
    | "crafting_progress_not_found"
    | "crafting_already_completed"
    | "item_already_identified"
    | "item_not_damaged"
    | "item_already_attuned"
    | "item_attuned_by_other_character"
    | "item_not_attunable"
    | "invalid_charge_recovery";
  details?: Record<string, unknown>;
};

type EconomyResult = EconomyResolution | EconomyRejection;

const CURRENCY_TO_CP = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
} as const;

@Injectable()
export class EconomyRuntimeService {
  purchaseFromShop(params: {
    state: EconomyState;
    shopId: string;
    sessionCharacterId: string;
    itemDefinitionId: string;
    quantity: number;
  }): EconomyResult {
    const quantity = this.normalizeQuantity(params.quantity);
    if (quantity === null) return { accepted: false, reason: "invalid_quantity" };

    const state = this.cloneState(params.state);
    const shop = state.shopStatesById[params.shopId];
    if (!shop) return { accepted: false, reason: "shop_not_found" };

    const shopItem = shop.inventory.find((item) => item.itemDefinitionId === params.itemDefinitionId);
    if (!shopItem) return { accepted: false, reason: "shop_item_not_found" };
    if (shopItem.quantity < quantity) {
      return {
        accepted: false,
        reason: "shop_stock_exceeded",
        details: { availableQuantity: shopItem.quantity },
      };
    }
    if (shopItem.buyLimit !== null && shopItem.buyLimit !== undefined && quantity > shopItem.buyLimit) {
      return {
        accepted: false,
        reason: "shop_buy_limit_exceeded",
        details: { buyLimit: shopItem.buyLimit },
      };
    }

    const totalPrice = Math.max(0, shopItem.priceGp * quantity);
    const wallet = state.walletsBySessionCharacterId[params.sessionCharacterId] ?? {};
    if (this.walletToCopper(wallet) < this.gpToCopper(totalPrice)) {
      return {
        accepted: false,
        reason: "insufficient_funds",
        details: { requiredGp: totalPrice },
      };
    }

    state.walletsBySessionCharacterId[params.sessionCharacterId] = this.subtractGp(wallet, totalPrice);
    shopItem.quantity -= quantity;
    this.addItem(state.partyStash, {
      itemDefinitionId: params.itemDefinitionId,
      quantity,
      identified: !shopItem.requiresApproval,
    });

    return this.accept(state, {
      type: "shop_purchase",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity,
      currencyDeltaBySessionCharacterId: {
        [params.sessionCharacterId]: this.negativeWallet({ gp: totalPrice }),
      },
      metadata: { shopId: params.shopId, unitPriceGp: shopItem.priceGp },
    });
  }

  sellToShop(params: {
    state: EconomyState;
    shopId: string;
    sessionCharacterId: string;
    itemDefinitionId: string;
    quantity: number;
    basePriceGp: number;
  }): EconomyResult {
    const quantity = this.normalizeQuantity(params.quantity);
    if (quantity === null) return { accepted: false, reason: "invalid_quantity" };

    const state = this.cloneState(params.state);
    const shop = state.shopStatesById[params.shopId];
    if (!shop) return { accepted: false, reason: "shop_not_found" };

    const removed = this.removeItem(state.partyStash, params.itemDefinitionId, quantity);
    if (!removed) return { accepted: false, reason: "insufficient_inventory_quantity" };

    const multiplier = shop.sellPriceMultiplier ?? 0.5;
    const payoutGp = Math.max(0, params.basePriceGp * quantity * multiplier);
    state.walletsBySessionCharacterId[params.sessionCharacterId] = this.addGp(
      state.walletsBySessionCharacterId[params.sessionCharacterId] ?? {},
      payoutGp,
    );
    this.addShopStock(shop, params.itemDefinitionId, quantity, params.basePriceGp);

    return this.accept(state, {
      type: "shop_sale",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity,
      currencyDeltaBySessionCharacterId: {
        [params.sessionCharacterId]: { gp: payoutGp },
      },
      metadata: { shopId: params.shopId, basePriceGp: params.basePriceGp, sellPriceMultiplier: multiplier },
    });
  }

  grantReward(params: {
    state: EconomyState;
    reward: RewardTable;
    recipientSessionCharacterIds: string[];
  }): EconomyResult {
    const state = this.cloneState(params.state);
    const recipients = params.recipientSessionCharacterIds.filter(Boolean);
    const currencyDeltaBySessionCharacterId: Record<string, CurrencyWallet> = {};

    if (params.reward.currency && recipients.length > 0) {
      if (params.reward.splitCurrency) {
        const split = this.splitWallet(params.reward.currency, recipients.length);
        for (const recipient of recipients) {
          state.walletsBySessionCharacterId[recipient] = this.addWallet(
            state.walletsBySessionCharacterId[recipient] ?? {},
            split,
          );
          currencyDeltaBySessionCharacterId[recipient] = split;
        }
      } else {
        for (const recipient of recipients) {
          state.walletsBySessionCharacterId[recipient] = this.addWallet(
            state.walletsBySessionCharacterId[recipient] ?? {},
            params.reward.currency,
          );
          currencyDeltaBySessionCharacterId[recipient] = params.reward.currency;
        }
      }
    }

    for (const item of params.reward.items ?? []) {
      this.addItem(state.partyStash, item);
    }

    return this.accept(state, {
      type: "reward_granted",
      quantity: params.reward.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      currencyDeltaBySessionCharacterId,
      metadata: {
        rewardId: params.reward.rewardId,
        recipients,
        itemIds: params.reward.items?.map((item) => item.itemDefinitionId) ?? [],
      },
    });
  }

  distributeFromPartyStash(params: {
    state: EconomyState;
    sessionCharacterId: string;
    itemDefinitionId: string;
    quantity: number;
  }): EconomyResult {
    const quantity = this.normalizeQuantity(params.quantity);
    if (quantity === null) return { accepted: false, reason: "invalid_quantity" };

    const state = this.cloneState(params.state);
    const removed = this.removeItem(state.partyStash, params.itemDefinitionId, quantity);
    if (!removed) return { accepted: false, reason: "insufficient_inventory_quantity" };

    return this.accept(state, {
      type: "party_stash_distributed",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity,
    });
  }

  startCrafting(params: {
    state: EconomyState;
    recipe: CraftingRecipe;
    sessionCharacterId: string;
    knownToolProficiencies: string[];
    craftingId: string;
  }): EconomyResult {
    const state = this.cloneState(params.state);
    for (const requiredTool of params.recipe.requiredToolProficiencies ?? []) {
      if (!params.knownToolProficiencies.includes(requiredTool)) {
        return { accepted: false, reason: "missing_tool_proficiency", details: { requiredTool } };
      }
    }

    for (const material of params.recipe.requiredMaterials) {
      const removed = this.removeItem(state.partyStash, material.itemDefinitionId, material.quantity);
      if (!removed) {
        return {
          accepted: false,
          reason: "missing_required_material",
          details: { itemDefinitionId: material.itemDefinitionId, quantity: material.quantity },
        };
      }
    }

    if (params.recipe.costGp && params.recipe.costGp > 0) {
      const wallet = state.walletsBySessionCharacterId[params.sessionCharacterId] ?? {};
      if (this.walletToCopper(wallet) < this.gpToCopper(params.recipe.costGp)) {
        return { accepted: false, reason: "insufficient_funds", details: { requiredGp: params.recipe.costGp } };
      }
      state.walletsBySessionCharacterId[params.sessionCharacterId] = this.subtractGp(wallet, params.recipe.costGp);
    }

    state.craftingProgressById[params.craftingId] = {
      craftingId: params.craftingId,
      recipeId: params.recipe.recipeId,
      sessionCharacterId: params.sessionCharacterId,
      outputItemDefinitionId: params.recipe.outputItemDefinitionId,
      outputQuantity: params.recipe.outputQuantity,
      completedHours: 0,
      requiredHours: params.recipe.laborHours,
      status: "in_progress",
    };

    return this.accept(state, {
      type: "crafting_started",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.recipe.outputItemDefinitionId,
      quantity: params.recipe.outputQuantity,
      currencyDeltaBySessionCharacterId: params.recipe.costGp
        ? { [params.sessionCharacterId]: this.negativeWallet({ gp: params.recipe.costGp }) }
        : {},
      metadata: { craftingId: params.craftingId, recipeId: params.recipe.recipeId },
    });
  }

  progressCrafting(params: {
    state: EconomyState;
    craftingId: string;
    laborHours: number;
  }): EconomyResult {
    if (!Number.isFinite(params.laborHours) || params.laborHours <= 0) {
      return { accepted: false, reason: "invalid_labor_hours" };
    }

    const state = this.cloneState(params.state);
    const progress = state.craftingProgressById[params.craftingId];
    if (!progress) return { accepted: false, reason: "crafting_progress_not_found" };
    if (progress.status === "completed") return { accepted: false, reason: "crafting_already_completed" };

    progress.completedHours = Math.min(progress.requiredHours, progress.completedHours + params.laborHours);
    if (progress.completedHours >= progress.requiredHours) {
      progress.status = "completed";
      this.addItem(state.partyStash, {
        itemDefinitionId: progress.outputItemDefinitionId,
        quantity: progress.outputQuantity,
        identified: true,
      });
    }

    return this.accept(state, {
      type: "crafting_progressed",
      sessionCharacterId: progress.sessionCharacterId,
      itemDefinitionId: progress.outputItemDefinitionId,
      quantity: progress.status === "completed" ? progress.outputQuantity : 0,
      metadata: {
        craftingId: params.craftingId,
        completedHours: progress.completedHours,
        requiredHours: progress.requiredHours,
        status: progress.status,
      },
    });
  }

  identifyItem(params: {
    state: EconomyState;
    sessionCharacterId: string;
    itemDefinitionId: string;
    costGp?: number;
  }): EconomyResult {
    const state = this.cloneState(params.state);
    const item = state.partyStash.find((candidate) => candidate.itemDefinitionId === params.itemDefinitionId);
    if (!item) return { accepted: false, reason: "missing_inventory_item" };
    if (item.identified) return { accepted: false, reason: "item_already_identified" };

    const costGp = params.costGp ?? 0;
    if (costGp > 0) {
      const wallet = state.walletsBySessionCharacterId[params.sessionCharacterId] ?? {};
      if (this.walletToCopper(wallet) < this.gpToCopper(costGp)) {
        return { accepted: false, reason: "insufficient_funds", details: { requiredGp: costGp } };
      }
      state.walletsBySessionCharacterId[params.sessionCharacterId] = this.subtractGp(wallet, costGp);
    }
    item.identified = true;

    return this.accept(state, {
      type: "item_identified",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity: item.quantity,
      currencyDeltaBySessionCharacterId: costGp
        ? { [params.sessionCharacterId]: this.negativeWallet({ gp: costGp }) }
        : {},
    });
  }

  repairItem(params: {
    state: EconomyState;
    sessionCharacterId: string;
    itemDefinitionId: string;
    costGp?: number;
  }): EconomyResult {
    const state = this.cloneState(params.state);
    const item = state.partyStash.find((candidate) => candidate.itemDefinitionId === params.itemDefinitionId);
    if (!item) return { accepted: false, reason: "missing_inventory_item" };
    if (!item.damaged) return { accepted: false, reason: "item_not_damaged" };

    const costGp = params.costGp ?? 0;
    if (costGp > 0) {
      const wallet = state.walletsBySessionCharacterId[params.sessionCharacterId] ?? {};
      if (this.walletToCopper(wallet) < this.gpToCopper(costGp)) {
        return { accepted: false, reason: "insufficient_funds", details: { requiredGp: costGp } };
      }
      state.walletsBySessionCharacterId[params.sessionCharacterId] = this.subtractGp(wallet, costGp);
    }
    item.damaged = false;

    return this.accept(state, {
      type: "item_repaired",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity: item.quantity,
      currencyDeltaBySessionCharacterId: costGp
        ? { [params.sessionCharacterId]: this.negativeWallet({ gp: costGp }) }
        : {},
    });
  }

  attuneItem(params: {
    state: EconomyState;
    sessionCharacterId: string;
    itemDefinitionId: string;
    requiresAttunement?: boolean;
  }): EconomyResult {
    if (params.requiresAttunement === false) {
      return { accepted: false, reason: "item_not_attunable" };
    }

    const state = this.cloneState(params.state);
    const item = state.partyStash.find((candidate) => candidate.itemDefinitionId === params.itemDefinitionId);
    if (!item) return { accepted: false, reason: "missing_inventory_item" };
    if (item.attunedBySessionCharacterId === params.sessionCharacterId) {
      return { accepted: false, reason: "item_already_attuned" };
    }
    if (item.attunedBySessionCharacterId) {
      return {
        accepted: false,
        reason: "item_attuned_by_other_character",
        details: { attunedBySessionCharacterId: item.attunedBySessionCharacterId },
      };
    }

    item.attunedBySessionCharacterId = params.sessionCharacterId;

    return this.accept(state, {
      type: "item_attuned",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity: item.quantity,
    });
  }

  recoverItemCharges(params: {
    state: EconomyState;
    sessionCharacterId: string;
    itemDefinitionId: string;
    chargesRecovered: number;
    maximumCharges: number;
  }): EconomyResult {
    if (
      !Number.isInteger(params.chargesRecovered) ||
      params.chargesRecovered <= 0 ||
      !Number.isInteger(params.maximumCharges) ||
      params.maximumCharges <= 0
    ) {
      return { accepted: false, reason: "invalid_charge_recovery" };
    }

    const state = this.cloneState(params.state);
    const item = state.partyStash.find((candidate) => candidate.itemDefinitionId === params.itemDefinitionId);
    if (!item) return { accepted: false, reason: "missing_inventory_item" };

    const currentCharges = Math.max(0, item.chargesRemaining ?? 0);
    item.chargesRemaining = Math.min(params.maximumCharges, currentCharges + params.chargesRecovered);

    return this.accept(state, {
      type: "item_charges_recovered",
      sessionCharacterId: params.sessionCharacterId,
      itemDefinitionId: params.itemDefinitionId,
      quantity: item.quantity,
      metadata: {
        chargesRecovered: params.chargesRecovered,
        chargesRemaining: item.chargesRemaining,
        maximumCharges: params.maximumCharges,
      },
    });
  }

  private accept(state: EconomyState, auditEvent: EconomyAuditEvent): EconomyResolution {
    return {
      accepted: true,
      state,
      auditEvent,
      stateDiff: {
        type: "economy",
        economy: auditEvent,
      },
    };
  }

  private cloneState(state: EconomyState): EconomyState {
    return {
      partyStash: state.partyStash.map((item) => ({ ...item })),
      walletsBySessionCharacterId: Object.fromEntries(
        Object.entries(state.walletsBySessionCharacterId).map(([key, wallet]) => [key, { ...wallet }]),
      ),
      shopStatesById: Object.fromEntries(
        Object.entries(state.shopStatesById).map(([key, shop]) => [
          key,
          {
            ...shop,
            inventory: shop.inventory.map((item) => ({ ...item })),
          },
        ]),
      ),
      craftingProgressById: Object.fromEntries(
        Object.entries(state.craftingProgressById).map(([key, progress]) => [key, { ...progress }]),
      ),
    };
  }

  private normalizeQuantity(quantity: number): number | null {
    return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
  }

  private addItem(inventory: EconomyInventoryItem[], item: EconomyInventoryItem): void {
    const existing = inventory.find(
      (candidate) =>
        candidate.itemDefinitionId === item.itemDefinitionId &&
        candidate.identified === item.identified &&
        candidate.damaged === item.damaged &&
        (candidate.attunedBySessionCharacterId ?? null) === (item.attunedBySessionCharacterId ?? null),
    );
    if (existing) {
      existing.quantity += item.quantity;
      return;
    }
    inventory.push({ ...item });
  }

  private removeItem(inventory: EconomyInventoryItem[], itemDefinitionId: string, quantity: number): boolean {
    const item = inventory.find((candidate) => candidate.itemDefinitionId === itemDefinitionId);
    if (!item || item.quantity < quantity) return false;
    item.quantity -= quantity;
    if (item.quantity === 0) {
      inventory.splice(inventory.indexOf(item), 1);
    }
    return true;
  }

  private addShopStock(shop: ShopState, itemDefinitionId: string, quantity: number, priceGp: number): void {
    const existing = shop.inventory.find((item) => item.itemDefinitionId === itemDefinitionId);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    shop.inventory.push({ itemDefinitionId, quantity, priceGp });
  }

  private walletToCopper(wallet: CurrencyWallet): number {
    return (
      Math.trunc(wallet.cp ?? 0) * CURRENCY_TO_CP.cp +
      Math.trunc(wallet.sp ?? 0) * CURRENCY_TO_CP.sp +
      Math.trunc(wallet.ep ?? 0) * CURRENCY_TO_CP.ep +
      Math.trunc(wallet.gp ?? 0) * CURRENCY_TO_CP.gp +
      Math.trunc(wallet.pp ?? 0) * CURRENCY_TO_CP.pp
    );
  }

  private gpToCopper(gp: number): number {
    return Math.round(gp * CURRENCY_TO_CP.gp);
  }

  private copperToWallet(copper: number): CurrencyWallet {
    const sign = copper < 0 ? -1 : 1;
    let remaining = Math.abs(copper);
    const gp = Math.floor(remaining / CURRENCY_TO_CP.gp);
    remaining -= gp * CURRENCY_TO_CP.gp;
    const sp = Math.floor(remaining / CURRENCY_TO_CP.sp);
    remaining -= sp * CURRENCY_TO_CP.sp;
    const cp = remaining;
    return {
      ...(gp ? { gp: gp * sign } : {}),
      ...(sp ? { sp: sp * sign } : {}),
      ...(cp ? { cp: cp * sign } : {}),
    };
  }

  private addWallet(left: CurrencyWallet, right: CurrencyWallet): CurrencyWallet {
    return this.copperToWallet(this.walletToCopper(left) + this.walletToCopper(right));
  }

  private addGp(wallet: CurrencyWallet, gp: number): CurrencyWallet {
    return this.addWallet(wallet, { gp });
  }

  private subtractGp(wallet: CurrencyWallet, gp: number): CurrencyWallet {
    return this.copperToWallet(this.walletToCopper(wallet) - this.gpToCopper(gp));
  }

  private negativeWallet(wallet: CurrencyWallet): CurrencyWallet {
    return this.copperToWallet(-this.walletToCopper(wallet));
  }

  private splitWallet(wallet: CurrencyWallet, count: number): CurrencyWallet {
    if (count <= 0) return {};
    return this.copperToWallet(Math.floor(this.walletToCopper(wallet) / count));
  }
}
