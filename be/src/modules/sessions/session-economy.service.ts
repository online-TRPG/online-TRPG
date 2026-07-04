import { BadRequestException, Injectable } from "@nestjs/common";
import { ApplySessionEconomyActionDto } from "@trpg/shared-types";
import {
  CurrencyWallet,
  EconomyRejection,
  EconomyResolution,
  EconomyRuntimeService,
  EconomyState,
} from "../rules/economy-runtime.service";
import { getExecutableItemDefinition } from "../rules/p3-item-manifest";

@Injectable()
export class SessionEconomyService {
  private readonly economyRuntime = new EconomyRuntimeService();

  createInitialState(): EconomyState {
    return {
      partyStash: [],
      walletsBySessionCharacterId: {},
      shopStatesById: {},
      craftingProgressById: {},
    };
  }

  prepareStateForAction(
    state: EconomyState,
    dto: ApplySessionEconomyActionDto,
  ): EconomyState {
    const next: EconomyState = {
      partyStash: state.partyStash.map((item) => ({ ...item })),
      walletsBySessionCharacterId: Object.fromEntries(
        Object.entries(state.walletsBySessionCharacterId).map(([key, wallet]) => [
          key,
          { ...wallet },
        ]),
      ),
      shopStatesById: Object.fromEntries(
        Object.entries(state.shopStatesById).map(([shopId, shop]) => [
          shopId,
          { ...shop, inventory: shop.inventory.map((item) => ({ ...item })) },
        ]),
      ),
      craftingProgressById: Object.fromEntries(
        Object.entries(state.craftingProgressById).map(([key, progress]) => [
          key,
          { ...progress },
        ]),
      ),
    };
    const sessionCharacterId = dto.sessionCharacterId?.trim();
    if (sessionCharacterId && dto.currency && dto.actionType !== "grant_reward") {
      next.walletsBySessionCharacterId[sessionCharacterId] = {
        ...(next.walletsBySessionCharacterId[sessionCharacterId] ?? {}),
        ...this.normalizeWallet(dto.currency),
      };
    }
    if (dto.actionType === "purchase" && dto.shopId && dto.itemDefinitionId && dto.priceGp !== undefined) {
      const shopId = dto.shopId.trim();
      const shop = next.shopStatesById[shopId] ?? { shopId, inventory: [] };
      const existing = shop.inventory.find(
        (item) => item.itemDefinitionId === dto.itemDefinitionId,
      );
      if (!existing) {
        shop.inventory.push({
          itemDefinitionId: dto.itemDefinitionId,
          quantity: dto.stockQuantity ?? dto.quantity ?? 1,
          priceGp: dto.priceGp,
        });
      }
      next.shopStatesById[shopId] = shop;
    }
    if (dto.actionType !== "grant_reward") {
      for (const item of dto.items ?? []) {
        const existing = next.partyStash.find(
          (candidate) => candidate.itemDefinitionId === item.itemDefinitionId,
        );
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          next.partyStash.push({ ...item });
        }
      }
    }
    return next;
  }

  resolveAction(
    state: EconomyState,
    dto: ApplySessionEconomyActionDto,
  ): EconomyResolution | EconomyRejection {
    const sessionCharacterId = dto.sessionCharacterId?.trim() || "";
    const itemDefinitionId = dto.itemDefinitionId?.trim() || "";
    const shopId = dto.shopId?.trim() || "";
    switch (dto.actionType) {
      case "purchase":
        return this.economyRuntime.purchaseFromShop({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          shopId: this.requireField(shopId, "shopId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
        });
      case "sell":
        return this.economyRuntime.sellToShop({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          shopId: this.requireField(shopId, "shopId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
          basePriceGp: dto.priceGp ?? 0,
        });
      case "grant_reward":
        return this.economyRuntime.grantReward({
          state,
          recipientSessionCharacterIds: sessionCharacterId
            ? [sessionCharacterId]
            : Object.keys(state.walletsBySessionCharacterId),
          reward: {
            rewardId: dto.rewardId?.trim() || `reward:${Date.now()}`,
            currency: dto.currency ? this.normalizeWallet(dto.currency) : undefined,
            items: dto.items?.map((item) => ({ ...item })),
            splitCurrency: dto.splitCurrency ?? false,
          },
        });
      case "distribute":
        return this.economyRuntime.distributeFromPartyStash({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          quantity: dto.quantity ?? 1,
        });
      case "start_crafting":
        return this.economyRuntime.startCrafting({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          craftingId: dto.craftingId?.trim() || `crafting:${Date.now()}`,
          knownToolProficiencies: dto.knownToolProficiencies ?? [],
          recipe: {
            recipeId: this.requireField(dto.recipeId?.trim() || "", "recipeId"),
            outputItemDefinitionId: this.requireField(
              dto.outputItemDefinitionId?.trim() || itemDefinitionId,
              "outputItemDefinitionId",
            ),
            outputQuantity: dto.outputQuantity ?? dto.quantity ?? 1,
            requiredMaterials: dto.requiredMaterials?.map((item) => ({ ...item })) ?? [],
            requiredToolProficiencies: dto.requiredToolProficiencies ?? [],
            laborHours: dto.laborHours ?? 1,
            costGp: dto.costGp,
          },
        });
      case "progress_crafting":
        return this.economyRuntime.progressCrafting({
          state,
          craftingId: this.requireField(dto.craftingId?.trim() || "", "craftingId"),
          laborHours: dto.laborHours ?? 1,
        });
      case "identify":
        return this.economyRuntime.identifyItem({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          costGp: dto.costGp,
        });
      case "repair":
        return this.economyRuntime.repairItem({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          costGp: dto.costGp,
        });
      case "attune":
        return this.economyRuntime.attuneItem({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          requiresAttunement:
            dto.requiresAttunement ??
            getExecutableItemDefinition(itemDefinitionId)?.requiresAttunement ??
            true,
        });
      case "recover_charges":
        return this.economyRuntime.recoverItemCharges({
          state,
          sessionCharacterId: this.requireField(sessionCharacterId, "sessionCharacterId"),
          itemDefinitionId: this.requireField(itemDefinitionId, "itemDefinitionId"),
          chargesRecovered: dto.chargesRecovered ?? 1,
          maximumCharges:
            dto.maximumCharges ?? getExecutableItemDefinition(itemDefinitionId)?.maxCharges ?? 1,
        });
      default:
        throw new BadRequestException("Unsupported economy action.");
    }
  }

  normalizeWallet(wallet: CurrencyWallet): CurrencyWallet {
    return Object.fromEntries(
      (["cp", "sp", "ep", "gp", "pp"] as const)
        .map((key) => [key, Math.trunc(Number(wallet[key] ?? 0))] as const)
        .filter(([, value]) => Number.isFinite(value) && value !== 0),
    );
  }

  private requireField(value: string, fieldName: string): string {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required for this economy action.`);
    }
    return value;
  }
}
