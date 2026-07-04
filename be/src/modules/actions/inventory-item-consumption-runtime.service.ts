import { Injectable } from "@nestjs/common";
import { InventoryRuntimeService } from "../rules/inventory-runtime.service";
import { type ExecutableItemDefinition } from "../rules/p3-item-manifest";
import { type P3ItemRuntimeFlags } from "./inventory-item-policy";
import { InventoryItemRuntimeFlagsService } from "./inventory-item-runtime-flags.service";

@Injectable()
export class InventoryItemConsumptionRuntimeService {
  constructor(
    private readonly inventoryRuntime: InventoryRuntimeService,
    private readonly inventoryItemRuntimeFlags: InventoryItemRuntimeFlagsService,
  ) {}

  async persistUseCost(params: {
    itemEntryId: string;
    executableItem: Pick<
      ExecutableItemDefinition,
      "consumeOnUse" | "maxCharges"
    > | null;
    sessionScenarioId: string;
    flags: Record<string, unknown>;
    itemRuntime: P3ItemRuntimeFlags;
  }): Promise<{ consumedQuantity: number }> {
    const shouldConsume =
      !params.executableItem || params.executableItem.consumeOnUse;
    if (shouldConsume) {
      await this.inventoryRuntime.removeItem({
        entryId: params.itemEntryId,
        quantity: 1,
      });
    }
    if (params.executableItem?.maxCharges) {
      await this.inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags({
        sessionScenarioId: params.sessionScenarioId,
        flags: params.flags,
        itemRuntime: params.itemRuntime,
      });
    }

    return { consumedQuantity: shouldConsume ? 1 : 0 };
  }
}
