import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";
import { ExecutableItemDefinition } from "../rules/p3-item-manifest";
import {
  addAttunedItemEntry,
  getAttunedItemEntryIds,
  resolveItemChargeUsage,
  type P3ItemRuntimeFlags,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemRuntimeStateService {
  resolveAttunement(params: {
    executableItem: ExecutableItemDefinition | null;
    itemRuntime: P3ItemRuntimeFlags;
    sessionCharacterId: string;
    itemEntryId: string;
  }): {
    requiresNewAttunement: boolean;
    attunedCount: number;
    itemRuntime: P3ItemRuntimeFlags;
  } {
    const attunedEntryIds = getAttunedItemEntryIds(
      params.itemRuntime,
      params.sessionCharacterId,
    );
    if (
      !params.executableItem?.requiresAttunement ||
      attunedEntryIds.includes(params.itemEntryId)
    ) {
      return {
        requiresNewAttunement: false,
        attunedCount: attunedEntryIds.length,
        itemRuntime: params.itemRuntime,
      };
    }
    if (attunedEntryIds.length >= 3) {
      throw badRequest("INVENTORY_400", "조율 슬롯이 가득 찼습니다.", {
        reason: "ATTUNEMENT_SLOTS_FULL",
        maximum: 3,
      });
    }

    return {
      requiresNewAttunement: true,
      attunedCount: attunedEntryIds.length + 1,
      itemRuntime: addAttunedItemEntry({
        itemRuntime: params.itemRuntime,
        sessionCharacterId: params.sessionCharacterId,
        itemEntryId: params.itemEntryId,
      }),
    };
  }

  spendCharge(params: {
    executableItem: ExecutableItemDefinition | null;
    itemRuntime: P3ItemRuntimeFlags;
    itemEntryId: string;
  }): P3ItemRuntimeFlags {
    if (!params.executableItem?.maxCharges) {
      return params.itemRuntime;
    }
    const chargeUsage = resolveItemChargeUsage({
      itemRuntime: params.itemRuntime,
      itemEntryId: params.itemEntryId,
      maxCharges: params.executableItem.maxCharges,
    });
    if (chargeUsage.remainingChargesBeforeUse < 1) {
      throw badRequest("INVENTORY_400", "아이템 충전이 남아 있지 않습니다.", {
        reason: "ITEM_CHARGES_EXPENDED",
        itemEntryId: params.itemEntryId,
      });
    }
    return chargeUsage.itemRuntime;
  }
}
