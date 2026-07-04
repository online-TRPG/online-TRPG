import { InventoryItemConsumptionRuntimeService } from "./inventory-item-consumption-runtime.service";

describe("InventoryItemConsumptionRuntimeService", () => {
  const inventoryRuntime = {
    removeItem: jest.fn(),
  };
  const inventoryItemRuntimeFlags = {
    writeP3ItemRuntimeFlags: jest.fn(),
  };
  const service = new InventoryItemConsumptionRuntimeService(
    inventoryRuntime as never,
    inventoryItemRuntimeFlags as never,
  );
  const itemRuntime = {
    attunedItemEntryIdsByCharacter: {},
    chargesByItemEntryId: { "entry-1": 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("consumes legacy non-executable items without writing runtime flags", async () => {
    await expect(
      service.persistUseCost({
        itemEntryId: "entry-1",
        executableItem: null,
        sessionScenarioId: "session-scenario-1",
        flags: { existing: true },
        itemRuntime,
      }),
    ).resolves.toEqual({ consumedQuantity: 1 });
    expect(inventoryRuntime.removeItem).toHaveBeenCalledWith({
      entryId: "entry-1",
      quantity: 1,
    });
    expect(inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags).not.toHaveBeenCalled();
  });

  it("keeps reusable charge items while writing updated runtime flags", async () => {
    await expect(
      service.persistUseCost({
        itemEntryId: "entry-1",
        executableItem: { consumeOnUse: false, maxCharges: 3 } as never,
        sessionScenarioId: "session-scenario-1",
        flags: { existing: true },
        itemRuntime,
      }),
    ).resolves.toEqual({ consumedQuantity: 0 });
    expect(inventoryRuntime.removeItem).not.toHaveBeenCalled();
    expect(inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags).toHaveBeenCalledWith({
      sessionScenarioId: "session-scenario-1",
      flags: { existing: true },
      itemRuntime,
    });
  });

  it("consumes expendable charge items and persists runtime flags", async () => {
    await expect(
      service.persistUseCost({
        itemEntryId: "entry-1",
        executableItem: { consumeOnUse: true, maxCharges: 3 } as never,
        sessionScenarioId: "session-scenario-1",
        flags: { existing: true },
        itemRuntime,
      }),
    ).resolves.toEqual({ consumedQuantity: 1 });
    expect(inventoryRuntime.removeItem).toHaveBeenCalledWith({
      entryId: "entry-1",
      quantity: 1,
    });
    expect(inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags).toHaveBeenCalledWith({
      sessionScenarioId: "session-scenario-1",
      flags: { existing: true },
      itemRuntime,
    });
  });
});
