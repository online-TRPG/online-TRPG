import { InventoryPackRuntimeService } from "./inventory-pack-runtime.service";

describe("InventoryPackRuntimeService", () => {
  const pack = {
    id: "equipment.pack",
    contents: [{ itemId: "equipment.dagger", quantity: 2 }],
  };
  const tx = {
    inventoryEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    itemDefinition: {
      upsert: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((handler: (transaction: typeof tx) => unknown) =>
      handler(tx),
    ),
  };
  const inventoryRuntime = {
    syncSessionInventorySnapshot: jest.fn(),
  };
  const service = new InventoryPackRuntimeService(
    prisma as never,
    inventoryRuntime as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.inventoryEntry.findUnique.mockResolvedValue({
      id: "pack-entry-1",
      sessionCharacterId: "session-character-1",
      quantity: 1,
      itemDefinition: {},
    });
  });

  it("creates pack contents and removes the consumed pack entry", async () => {
    await service.unpackInventoryPack({
      sessionCharacterId: "session-character-1",
      packEntryId: "pack-entry-1",
      pack: pack as never,
    });

    expect(tx.itemDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "equipment.dagger" },
      }),
    );
    expect(tx.inventoryEntry.create).toHaveBeenCalledWith({
      data: {
        sessionCharacterId: "session-character-1",
        itemDefinitionId: "equipment.dagger",
        quantity: 2,
      },
    });
    expect(tx.inventoryEntry.delete).toHaveBeenCalledWith({
      where: { id: "pack-entry-1" },
    });
    expect(inventoryRuntime.syncSessionInventorySnapshot).toHaveBeenCalledWith(
      "session-character-1",
    );
  });

  it("decrements a stackable pack entry when more than one remains", async () => {
    tx.inventoryEntry.findUnique.mockResolvedValue({
      id: "pack-entry-1",
      sessionCharacterId: "session-character-1",
      quantity: 2,
      itemDefinition: {},
    });

    await service.unpackInventoryPack({
      sessionCharacterId: "session-character-1",
      packEntryId: "pack-entry-1",
      pack: pack as never,
    });

    expect(tx.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "pack-entry-1" },
      data: { quantity: { decrement: 1 } },
    });
    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
  });

  it("rejects missing or foreign pack entries", async () => {
    tx.inventoryEntry.findUnique.mockResolvedValue({
      id: "pack-entry-1",
      sessionCharacterId: "other-character",
      quantity: 1,
      itemDefinition: {},
    });

    await expect(
      service.unpackInventoryPack({
        sessionCharacterId: "session-character-1",
        packEntryId: "pack-entry-1",
        pack: pack as never,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "INVENTORY_PACK_NOT_FOUND",
        }),
      },
    });
  });

  it("rejects unknown pack content definitions", async () => {
    await expect(
      service.unpackInventoryPack({
        sessionCharacterId: "session-character-1",
        packEntryId: "pack-entry-1",
        pack: {
          id: "equipment.pack",
          contents: [{ itemId: "equipment.unknown", quantity: 1 }],
        } as never,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "PACK_CONTENT_DEFINITION_NOT_FOUND",
          itemId: "equipment.unknown",
        }),
      },
    });
  });
});
