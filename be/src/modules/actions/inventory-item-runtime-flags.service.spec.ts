import {
  P3_ITEM_RUNTIME_FLAGS_KEY,
  type P3ItemRuntimeFlags,
} from "./inventory-item-policy";
import { InventoryItemRuntimeFlagsService } from "./inventory-item-runtime-flags.service";

describe("InventoryItemRuntimeFlagsService", () => {
  const prisma = {
    gameState: {
      update: jest.fn(),
    },
  };
  const service = new InventoryItemRuntimeFlagsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("merges P3 item runtime flags into game state flags JSON", async () => {
    const itemRuntime: P3ItemRuntimeFlags = {
      attunedItemEntryIdsByCharacter: {
        "session-character-1": ["entry-1"],
      },
      chargesByItemEntryId: {
        "entry-2": 3,
      },
    };

    await service.writeP3ItemRuntimeFlags({
      sessionScenarioId: "session-scenario-1",
      flags: { existing: true },
      itemRuntime,
    });

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          existing: true,
          [P3_ITEM_RUNTIME_FLAGS_KEY]: itemRuntime,
        }),
      },
    });
  });
});
