import { SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import { InventoryItemContextLoaderService } from "./inventory-item-context-loader.service";

describe("InventoryItemContextLoaderService", () => {
  const actor = {
    id: "actor-character",
    status: PrismaSessionCharacterStatus.ACTIVE,
    character: { id: "character-1" },
  };
  const target = {
    id: "target-character",
    status: PrismaSessionCharacterStatus.ACTIVE,
    character: { id: "character-2" },
  };
  const item = {
    id: "entry-1",
    itemDefinitionId: "magic_item.wand_of_magic_missiles",
    quantity: 1,
    itemDefinition: {
      id: "magic_item.wand_of_magic_missiles",
      name: "Wand of Magic Missiles",
      itemType: "magic_item",
      propertiesJson: "[]",
    },
  };
  const prisma = {
    sessionCharacter: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    inventoryEntry: {
      findFirst: jest.fn(),
    },
  };
  const service = new InventoryItemContextLoaderService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sessionCharacter.findUnique.mockResolvedValue(actor);
    prisma.sessionCharacter.findFirst.mockResolvedValue(target);
    prisma.inventoryEntry.findFirst.mockResolvedValue(item);
  });

  it("loads actor, target, inventory item, and executable item", async () => {
    await expect(
      service.loadUseContext({
        sessionId: "session-1",
        userId: "user-1",
        itemId: "entry-1",
        targetSessionCharacterId: "target-character",
      }),
    ).resolves.toMatchObject({
      sessionCharacter: actor,
      targetSessionCharacter: target,
      item,
      executableItem: expect.objectContaining({
        id: "magic_item.wand_of_magic_missiles",
      }),
    });
  });

  it("rejects when the actor character is not active", async () => {
    prisma.sessionCharacter.findUnique.mockResolvedValue(null);

    await expect(
      service.loadUseContext({
        sessionId: "session-1",
        userId: "user-1",
        itemId: "entry-1",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "CHARACTER_NOT_SELECTED",
        }),
      },
    });
  });

  it("rejects missing target characters", async () => {
    prisma.sessionCharacter.findFirst.mockResolvedValue(null);

    await expect(
      service.loadUseContext({
        sessionId: "session-1",
        userId: "user-1",
        itemId: "entry-1",
        targetSessionCharacterId: "target-character",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_TARGET_NOT_FOUND",
        }),
      },
    });
  });

  it("rejects missing inventory items", async () => {
    prisma.inventoryEntry.findFirst.mockResolvedValue(null);

    await expect(
      service.loadUseContext({
        sessionId: "session-1",
        userId: "user-1",
        itemId: "missing-entry",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "INVENTORY_ITEM_NOT_FOUND",
        }),
      },
    });
  });

  it("rejects inventory items that are not backend usable", async () => {
    prisma.inventoryEntry.findFirst.mockResolvedValue({
      ...item,
      itemDefinitionId: "equipment.rope",
      itemDefinition: {
        id: "equipment.rope",
        name: "Rope",
        itemType: "gear",
        propertiesJson: "[]",
      },
    });

    await expect(
      service.loadUseContext({
        sessionId: "session-1",
        userId: "user-1",
        itemId: "entry-1",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_NOT_QUICK_USABLE",
        }),
      },
    });
  });
});
