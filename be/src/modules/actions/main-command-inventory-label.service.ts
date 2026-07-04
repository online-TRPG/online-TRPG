import { Injectable } from "@nestjs/common";
import type { LoadedContext } from "./main-commands.service";

@Injectable()
export class MainCommandInventoryLabelService {
  resolveOwnedItemName(context: LoadedContext, itemId?: string | null): string {
    if (!itemId) {
      return "도구";
    }

    const normalized = itemId.trim().toLowerCase();
    const matched = context.inventoryItems.find((item) =>
      [item.id, item.itemDefinitionId, item.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .includes(normalized),
    );

    return matched?.name ?? itemId;
  }
}
