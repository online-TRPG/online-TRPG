import { InventoryItemRuntimeStateService } from "./inventory-item-runtime-state.service";
import { type P3ItemRuntimeFlags } from "./inventory-item-policy";

describe("InventoryItemRuntimeStateService", () => {
  const service = new InventoryItemRuntimeStateService();
  const emptyRuntime: P3ItemRuntimeFlags = {
    attunedItemEntryIdsByCharacter: {},
    chargesByItemEntryId: {},
  };

  it("adds a new attuned item entry when attunement is required", () => {
    expect(
      service.resolveAttunement({
        executableItem: { requiresAttunement: true } as never,
        itemRuntime: emptyRuntime,
        sessionCharacterId: "character-1",
        itemEntryId: "entry-1",
      }),
    ).toEqual({
      requiresNewAttunement: true,
      attunedCount: 1,
      itemRuntime: {
        attunedItemEntryIdsByCharacter: {
          "character-1": ["entry-1"],
        },
        chargesByItemEntryId: {},
      },
    });
  });

  it("keeps runtime unchanged when the item is already attuned", () => {
    const itemRuntime: P3ItemRuntimeFlags = {
      attunedItemEntryIdsByCharacter: {
        "character-1": ["entry-1"],
      },
      chargesByItemEntryId: {},
    };

    expect(
      service.resolveAttunement({
        executableItem: { requiresAttunement: true } as never,
        itemRuntime,
        sessionCharacterId: "character-1",
        itemEntryId: "entry-1",
      }),
    ).toEqual({
      requiresNewAttunement: false,
      attunedCount: 1,
      itemRuntime,
    });
  });

  it("rejects attunement when all slots are full", () => {
    try {
      service.resolveAttunement({
        executableItem: { requiresAttunement: true } as never,
        itemRuntime: {
          attunedItemEntryIdsByCharacter: {
            "character-1": ["entry-1", "entry-2", "entry-3"],
          },
          chargesByItemEntryId: {},
        },
        sessionCharacterId: "character-1",
        itemEntryId: "entry-4",
      });
      throw new Error("Expected resolveAttunement to reject full slots.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          data: expect.objectContaining({
            reason: "ATTUNEMENT_SLOTS_FULL",
          }),
        }),
      });
    }
  });

  it("spends one charge for charge-limited items", () => {
    expect(
      service.spendCharge({
        executableItem: { maxCharges: 3 } as never,
        itemRuntime: {
          attunedItemEntryIdsByCharacter: {},
          chargesByItemEntryId: { "entry-1": 2 },
        },
        itemEntryId: "entry-1",
      }),
    ).toEqual({
      attunedItemEntryIdsByCharacter: {},
      chargesByItemEntryId: { "entry-1": 1 },
    });
  });

  it("rejects charge use when no charges remain", () => {
    try {
      service.spendCharge({
        executableItem: { maxCharges: 3 } as never,
        itemRuntime: {
          attunedItemEntryIdsByCharacter: {},
          chargesByItemEntryId: { "entry-1": 0 },
        },
        itemEntryId: "entry-1",
      });
      throw new Error("Expected spendCharge to reject expended charges.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          data: expect.objectContaining({
            reason: "ITEM_CHARGES_EXPENDED",
            itemEntryId: "entry-1",
          }),
        }),
      });
    }
  });
});
