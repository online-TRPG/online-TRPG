import {
  buildSrdPackAddedSummary,
  getSrdEquipmentName,
  toItemDefinitionData,
  type SrdEquipmentRecord,
} from "./srd-equipment-policy";

describe("srd equipment policy", () => {
  it("uses Korean name before English name with fallback", () => {
    expect(getSrdEquipmentName({ id: "item-1", name: { ko: "검", en: "Sword" } }, "fallback")).toBe(
      "검",
    );
    expect(getSrdEquipmentName({ id: "item-2", name: { en: "Sword" } }, "fallback")).toBe(
      "Sword",
    );
    expect(getSrdEquipmentName(null, "fallback")).toBe("fallback");
  });

  it("maps weapon records to item definition data", () => {
    const record: SrdEquipmentRecord = {
      id: "equipment.longsword",
      name: { en: "Longsword", ko: "롱소드" },
      category: { kind: "weapon", equipmentCategory: "martial" },
      economy: { weight: { lb: 3 } },
      weapon: {
        rangeRaw: "5 ft.",
        damage: { dice: "1d8" },
        damageType: "slashing",
        properties: [{ id: "versatile" }],
      },
    };

    expect(toItemDefinitionData(record)).toEqual({
      name: "롱소드",
      itemType: "weapon",
      weightLb: 3,
      description: "롱소드 무기입니다. 명중 시 1d8 slashing 피해를 줍니다. 사거리 5 ft..",
      damageDice: "1d8",
      damageType: "slashing",
      armorClassBase: null,
      armorClassBonus: null,
      armorStrengthRequirement: null,
      armorStealthDisadvantage: null,
      useEffect: null,
      packContentsJson: null,
      propertiesJson: JSON.stringify(["srd-engine", "martial", "versatile"]),
    });
  });

  it("maps armor and healing potion records", () => {
    expect(
      toItemDefinitionData({
        id: "equipment.chain_mail",
        name: { en: "Chain Mail" },
        category: { kind: "armor", equipmentCategory: "heavy" },
        armor: {
          armorClass: { raw: "16", base: 16 },
          strengthRequirement: { minimum: 13 },
          stealthDisadvantage: true,
        },
      }),
    ).toMatchObject({
      name: "Chain Mail",
      itemType: "armor",
      description: "Chain Mail 방어구입니다. 장착하면 AC 16를 적용합니다.",
      armorClassBase: 16,
      armorStrengthRequirement: 13,
      armorStealthDisadvantage: true,
    });

    expect(
      toItemDefinitionData({
        id: "equipment.potion_of_healing",
        name: { ko: "치유 물약" },
        category: { kind: "consumable", equipmentCategory: "potion" },
      }),
    ).toMatchObject({
      name: "치유 물약",
      itemType: "consumable",
      useEffect: "사용하면 HP를 평균 7점 회복합니다.",
    });
  });

  it("builds pack contents and added summary with fallback names", () => {
    const pack: SrdEquipmentRecord = {
      id: "equipment.custom_pack",
      name: { en: "Custom Pack" },
      category: { kind: "pack", equipmentCategory: "gear" },
      contents: [
        { itemId: "equipment.rope", quantity: 1 },
        { itemId: "equipment.torch", quantity: 5 },
      ],
    };

    expect(JSON.parse(toItemDefinitionData(pack).packContentsJson ?? "[]")).toEqual([
      { itemId: "equipment.rope", name: "equipment.rope", quantity: 1 },
      { itemId: "equipment.torch", name: "횃불", quantity: 5 },
    ]);
    expect(buildSrdPackAddedSummary(pack)).toBe("equipment.rope x1, 횃불 x5");
  });
});
