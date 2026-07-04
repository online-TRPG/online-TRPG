import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  P3_ITEM_RUNTIME_FLAGS_KEY,
  type P3ItemRuntimeFlags,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemRuntimeFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async writeP3ItemRuntimeFlags(params: {
    sessionScenarioId: string;
    flags: Record<string, unknown>;
    itemRuntime: P3ItemRuntimeFlags;
  }): Promise<void> {
    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        flagsJson: JSON.stringify({
          ...params.flags,
          [P3_ITEM_RUNTIME_FLAGS_KEY]: params.itemRuntime,
        }),
      },
    });
  }
}
