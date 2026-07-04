import { NotFoundException } from "@nestjs/common";
import { SessionInventoryService } from "./session-inventory.service";

describe("SessionInventoryService", () => {
  const prisma = {
    $transaction: jest.fn(),
    inventoryEntry: {
      findMany: jest.fn(),
    },
    sessionCharacter: {
      update: jest.fn(),
    },
  };
  const service = new SessionInventoryService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("replaces inventory entries with existing item definitions", async () => {
    const tx = {
      inventoryEntry: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item-1" }]),
      },
    };
    prisma.$transaction.mockImplementation(async (handler) => handler(tx));
    prisma.inventoryEntry.findMany.mockResolvedValue([]);

    await service.replaceSessionInventoryEntries("session-character-1", [
      { id: "inventory-item-1", name: "Item 1", itemDefinitionId: "item-1", quantity: 2 },
      { id: "inventory-item-2", name: "Missing Item", itemDefinitionId: "missing-item", quantity: 5 },
    ]);

    expect(tx.inventoryEntry.deleteMany).toHaveBeenCalledWith({
      where: { sessionCharacterId: "session-character-1" },
    });
    expect(tx.inventoryEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionCharacterId: "session-character-1",
          itemDefinitionId: "item-1",
          quantity: 2,
        },
      ],
    });
  });

  it("increments an existing inventory entry when granting an item", async () => {
    const tx = {
      inventoryEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: "entry-1" }),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    await service.grantSessionInventoryItem(tx as never, {
      sessionCharacterId: "session-character-1",
      itemDefinitionId: "item-1",
      quantity: 3,
    });

    expect(tx.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { quantity: { increment: 3 } },
    });
    expect(tx.inventoryEntry.create).not.toHaveBeenCalled();
  });

  it("removes a matching inventory entry quantity", async () => {
    const tx = {
      inventoryEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: "entry-1",
          itemDefinitionId: "item-1",
          quantity: 5,
          itemDefinition: {
            name: "Rope",
            itemType: "gear",
          },
        }),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    await expect(
      service.removeSessionInventoryItem(tx as never, {
        sessionCharacterId: "session-character-1",
        itemId: "item-1",
        quantity: 2,
      }),
    ).resolves.toEqual({
      itemDefinitionId: "item-1",
      itemName: "Rope",
      itemType: "gear",
      removedQuantity: 2,
    });

    expect(tx.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { quantity: { decrement: 2 } },
    });
  });

  it("throws when removing a missing inventory entry", async () => {
    const tx = {
      inventoryEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      service.removeSessionInventoryItem(tx as never, {
        sessionCharacterId: "session-character-1",
        itemId: "missing-item",
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refreshes the inventory snapshot from persisted entries", async () => {
    prisma.inventoryEntry.findMany.mockResolvedValue([
      {
        id: "entry-1",
        itemDefinitionId: "item-1",
        quantity: 2,
        containerEntryId: null,
        itemDefinition: {
          name: "Rope",
          itemType: "gear",
          weightLb: 10,
          volumeCuFt: null,
          damageDice: null,
          damageType: null,
          propertiesJson: JSON.stringify(["utility"]),
        },
      },
    ]);

    await service.refreshSessionInventorySnapshot("session-character-1");

    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: {
        inventorySnapshotJson: JSON.stringify([
          {
            id: "entry-1",
            name: "Rope",
            quantity: 2,
            itemDefinitionId: "item-1",
            itemType: "gear",
            weightLb: 10,
            volumeCuFt: undefined,
            damageDice: undefined,
            damageType: undefined,
            properties: ["utility"],
            containerId: undefined,
          },
        ]),
      },
    });
  });
});
