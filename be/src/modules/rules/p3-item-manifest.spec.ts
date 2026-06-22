import {
  getExecutableItemDefinition,
  P3_EXECUTABLE_ITEM_DEFINITIONS,
  P3_EXECUTABLE_ITEM_IDS,
} from "./p3-item-manifest";

describe("P3 executable item manifest", () => {
  it("contains exactly 20 equipment, 15 consumables, and 15 magic items", () => {
    expect(P3_EXECUTABLE_ITEM_DEFINITIONS).toHaveLength(50);
    expect(
      P3_EXECUTABLE_ITEM_DEFINITIONS.filter(
        (item) => item.category === "equipment",
      ),
    ).toHaveLength(20);
    expect(
      P3_EXECUTABLE_ITEM_DEFINITIONS.filter(
        (item) => item.category === "consumable",
      ),
    ).toHaveLength(15);
    expect(
      P3_EXECUTABLE_ITEM_DEFINITIONS.filter(
        (item) => item.category === "magic_item",
      ),
    ).toHaveLength(15);
    expect(new Set(P3_EXECUTABLE_ITEM_IDS).size).toBe(50);
  });

  it("describes attunement, charges, spell items, and throwable consumables", () => {
    expect(
      getExecutableItemDefinition("magic_item.wand_of_fireballs"),
    ).toMatchObject({
      requiresAttunement: true,
      maxCharges: 7,
      rechargeDice: "1d6+1",
      effect: {
        type: "spell",
        spellId: "spell.fireball",
        slotLevel: 3,
      },
    });
    expect(
      getExecutableItemDefinition("equipment.acid__vial"),
    ).toMatchObject({
      interaction: "throw",
      consumeOnUse: true,
      effect: {
        type: "thrown",
        damageDice: "2d6",
        damageType: "acid",
      },
    });
  });
});
