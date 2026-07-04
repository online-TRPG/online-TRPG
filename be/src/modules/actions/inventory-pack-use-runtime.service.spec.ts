import { InventoryPackUseRuntimeService } from "./inventory-pack-use-runtime.service";

describe("InventoryPackUseRuntimeService", () => {
  const prisma = {
    item: {
      findUnique: jest.fn(),
    },
  };
  const inventoryItemCharacterReader = {
    getMappedSessionCharacter: jest.fn(),
  };
  const inventoryPackRuntime = {
    unpackInventoryPack: jest.fn(),
  };
  const service = new InventoryPackUseRuntimeService(
    prisma as never,
    inventoryItemCharacterReader as never,
    inventoryPackRuntime as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.item.findUnique.mockResolvedValue({ key: "explorers-pack" });
    inventoryItemCharacterReader.getMappedSessionCharacter.mockResolvedValue({
      id: "session-character-1",
      name: "Hero",
    });
  });

  it("unpacks SRD packs and returns response data", async () => {
    await expect(
      service.tryUsePack({
        sessionCharacterId: "session-character-1",
        itemEntryId: "entry-1",
        itemDefinition: {
          id: "equipment.explorers_pack",
          name: "탐험가 꾸러미",
          itemType: "pack",
          propertiesJson: null,
        },
      }),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Hero이(가) 탐험가 꾸러미을(를) 풀어"),
      responseCharacter: {
        id: "session-character-1",
        name: "Hero",
      },
    });
    expect(inventoryPackRuntime.unpackInventoryPack).toHaveBeenCalledWith({
      sessionCharacterId: "session-character-1",
      packEntryId: "entry-1",
      pack: expect.objectContaining({
        id: "equipment.explorers_pack",
      }),
    });
  });

  it("returns null for non-pack items", async () => {
    prisma.item.findUnique.mockResolvedValue({ key: "rope" });

    await expect(
      service.tryUsePack({
        sessionCharacterId: "session-character-1",
        itemEntryId: "entry-1",
        itemDefinition: {
          id: "equipment.rope_hempen_50_feet",
          name: "Rope",
          itemType: "gear",
          propertiesJson: null,
        },
      }),
    ).resolves.toBeNull();
    expect(inventoryPackRuntime.unpackInventoryPack).not.toHaveBeenCalled();
  });

  it("rejects pack-like items when contents cannot be resolved", async () => {
    prisma.item.findUnique.mockResolvedValue({ key: "unknown-pack" });

    await expect(
      service.tryUsePack({
        sessionCharacterId: "session-character-1",
        itemEntryId: "entry-1",
        itemDefinition: {
          id: "item.custom_pack",
          name: "수상한 꾸러미",
          itemType: "pack",
          propertiesJson: null,
        },
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "PACK_CONTENTS_NOT_FOUND",
        }),
      },
    });
  });
});
