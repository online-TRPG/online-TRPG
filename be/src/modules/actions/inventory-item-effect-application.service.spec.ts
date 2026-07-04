import { InventoryItemEffectApplicationService } from "./inventory-item-effect-application.service";

describe("InventoryItemEffectApplicationService", () => {
  const prisma = {
    sessionCharacter: {
      update: jest.fn(),
    },
  };
  const service = new InventoryItemEffectApplicationService(prisma as never);
  const targetSessionCharacter = {
    id: "session-character-1",
    currentHp: 5,
    character: { maxHp: 10 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("applies bounded healing and returns healed HP", async () => {
    await expect(
      service.applyCharacterEffect({
        targetSessionCharacter,
        itemDefinition: {
          id: "item.potion",
          name: "Potion",
          itemType: "consumable",
          propertiesJson: null,
          useEffect: null,
        },
        effectResolution: {
          healingAmount: 8,
          tempHp: null,
          conditionsJson: null,
          diceResult: null,
          message: null,
        },
      }),
    ).resolves.toEqual({ healedHp: 5 });
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { currentHp: { increment: 5 } },
    });
  });

  it("applies temporary HP and conditions without healing", async () => {
    await service.applyCharacterEffect({
      targetSessionCharacter,
      itemDefinition: {
        id: "item.utility",
        name: "Utility",
        itemType: "gear",
        propertiesJson: null,
        useEffect: null,
      },
      effectResolution: {
        healingAmount: null,
        tempHp: 4,
        conditionsJson: "[{\"id\":\"condition.item\"}]",
        diceResult: null,
        message: "아이템 효과가 적용되었습니다.",
      },
    });

    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: {
        tempHp: 4,
        conditionsJson: "[{\"id\":\"condition.item\"}]",
      },
    });
  });

  it("uses legacy healing fallback for healing-like item definitions", async () => {
    await expect(
      service.applyCharacterEffect({
        targetSessionCharacter,
        itemDefinition: {
          id: "legacy.healing_potion",
          name: "Healing Potion",
          itemType: "consumable",
          propertiesJson: null,
          useEffect: "사용하면 HP를 회복합니다.",
        },
        effectResolution: null,
      }),
    ).resolves.toEqual({ healedHp: 5 });
  });

  it("skips updates when there is no applicable effect", async () => {
    await service.applyCharacterEffect({
      targetSessionCharacter,
      itemDefinition: {
        id: "item.rope",
        name: "Rope",
        itemType: "gear",
        propertiesJson: null,
        useEffect: null,
      },
      effectResolution: null,
    });

    expect(prisma.sessionCharacter.update).not.toHaveBeenCalled();
  });
});
