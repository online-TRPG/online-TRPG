import {
  addAttunedItemEntry,
  buildFireballItemSpellLogModel,
  buildInventoryItemUseLogModel,
  buildItemConditionEffectMetadata,
  buildItemSearchKey,
  buildItemAttunementLogModel,
  buildMagicMissileItemSpellLogModel,
  buildPointItemTerrainCell,
  buildTokenItemTerrainCell,
  buildTerrainItemEffectMessage,
  buildWebItemSpellLogModel,
  findParticipantMapToken,
  findParticipantsInItemRadius,
  findSessionCharacterMapToken,
  getAttunedItemEntryIds,
  isBackendUsableInventoryItem,
  isPackLikeInventoryItem,
  parseP3ItemRuntimeFlags,
  resolveItemChargeUsage,
  resolveMapDistanceFt,
  resolveFallbackHealingAmount,
  resolveTemporaryHpEffect,
} from "./inventory-item-policy";

describe("inventory item policy", () => {
  it("normalizes p3 item runtime flags", () => {
    expect(
      parseP3ItemRuntimeFlags({
        attunedItemEntryIdsByCharacter: {
          characterA: ["entry-1", 7, "entry-2"],
        },
        chargesByItemEntryId: {
          "entry-1": 2,
          "entry-2": -1,
          "entry-3": 1.5,
          "entry-4": "3",
        },
      }),
    ).toEqual({
      attunedItemEntryIdsByCharacter: {
        characterA: ["entry-1", "entry-2"],
      },
      chargesByItemEntryId: {
        "entry-1": 2,
      },
    });

    expect(parseP3ItemRuntimeFlags(null)).toEqual({
      attunedItemEntryIdsByCharacter: {},
      chargesByItemEntryId: {},
    });
  });

  it("reads and adds attuned item entries immutably", () => {
    const itemRuntime = {
      attunedItemEntryIdsByCharacter: {
        characterA: ["entry-1"],
      },
      chargesByItemEntryId: {},
    };

    expect(getAttunedItemEntryIds(itemRuntime, "characterA")).toEqual(["entry-1"]);
    expect(getAttunedItemEntryIds(itemRuntime, "missing")).toEqual([]);
    expect(
      addAttunedItemEntry({
        itemRuntime,
        sessionCharacterId: "characterA",
        itemEntryId: "entry-2",
      }),
    ).toEqual({
      attunedItemEntryIdsByCharacter: {
        characterA: ["entry-1", "entry-2"],
      },
      chargesByItemEntryId: {},
    });
    expect(itemRuntime.attunedItemEntryIdsByCharacter.characterA).toEqual(["entry-1"]);
  });

  it("resolves charge usage immutably", () => {
    expect(
      resolveItemChargeUsage({
        itemRuntime: {
          attunedItemEntryIdsByCharacter: {},
          chargesByItemEntryId: {},
        },
        itemEntryId: "entry-1",
        maxCharges: 3,
      }),
    ).toEqual({
      remainingChargesBeforeUse: 3,
      remainingChargesAfterUse: 2,
      itemRuntime: {
        attunedItemEntryIdsByCharacter: {},
        chargesByItemEntryId: { "entry-1": 2 },
      },
    });

    expect(
      resolveItemChargeUsage({
        itemRuntime: {
          attunedItemEntryIdsByCharacter: {},
          chargesByItemEntryId: { "entry-1": 0 },
        },
        itemEntryId: "entry-1",
        maxCharges: 3,
      }),
    ).toMatchObject({
      remainingChargesBeforeUse: 0,
      remainingChargesAfterUse: 0,
    });
  });

  it("builds a searchable item key from properties", () => {
    expect(
      buildItemSearchKey({
        id: "item.healing_potion",
        name: "치유 물약",
        itemType: "consumable",
        propertiesJson: '["Potion", 3, "Healing"]',
      }),
    ).toBe("item.healing_potion 치유 물약 consumable potion healing");
  });

  it("classifies quick usable and pack-like fallback items", () => {
    const pack = {
      id: "equipment.explorers_pack",
      name: "탐험가의 꾸러미",
      itemType: "gear",
      propertiesJson: null,
    };

    expect(isPackLikeInventoryItem(pack)).toBe(true);
    expect(isBackendUsableInventoryItem(pack, null)).toBe(true);
    expect(
      isBackendUsableInventoryItem(
        {
          id: "item.wand",
          name: "Wand",
          itemType: "arcane",
          propertiesJson: null,
        },
        { interaction: "use" },
      ),
    ).toBe(true);
  });

  it("resolves legacy healing fallback amount", () => {
    expect(
      resolveFallbackHealingAmount({
        id: "item.healing_potion",
        name: "Potion of Healing",
        itemType: "consumable",
        propertiesJson: null,
      }),
    ).toBe(7);
    expect(
      resolveFallbackHealingAmount({
        id: "item.rope",
        name: "Rope",
        itemType: "gear",
        propertiesJson: null,
      }),
    ).toBeNull();
  });

  it("calculates grid distance in 5-foot squares", () => {
    expect(resolveMapDistanceFt(70, { x: 0, y: 0 }, { x: 140, y: 70 })).toBe(
      10,
    );
    expect(resolveMapDistanceFt(70, { x: 35, y: 35 }, { x: 35, y: 35 })).toBe(
      0,
    );
  });

  it("finds participant and session character map tokens", () => {
    const tokens = [
      { id: "token-1", sessionCharacterId: "character-1", x: 0, y: 0 },
      { id: "token-2", sessionCharacterId: "character-2", x: 70, y: 0 },
    ];

    expect(
      findParticipantMapToken(tokens, {
        id: "participant-1",
        tokenId: "token-2",
        sessionCharacterId: null,
      }),
    ).toEqual(tokens[1]);
    expect(findSessionCharacterMapToken(tokens, "character-1")).toEqual(
      tokens[0],
    );
    expect(findSessionCharacterMapToken(tokens, "missing")).toBeNull();
  });

  it("filters alive participants inside an item radius", () => {
    const participants = [
      {
        id: "near",
        tokenId: "near-token",
        sessionCharacterId: null,
        currentHp: 8,
        isAlive: true,
      },
      {
        id: "far",
        tokenId: "far-token",
        sessionCharacterId: null,
        currentHp: 8,
        isAlive: true,
      },
      {
        id: "down",
        tokenId: "down-token",
        sessionCharacterId: null,
        currentHp: 0,
        isAlive: true,
      },
    ];

    expect(
      findParticipantsInItemRadius({
        map: {
          gridSize: 70,
          tokens: [
            { id: "near-token", x: 70, y: 70 },
            { id: "far-token", x: 420, y: 0 },
            { id: "down-token", x: 70, y: 0 },
          ],
        },
        combatParticipants: participants,
        point: { x: 0, y: 0 },
        radiusFt: 10,
      }).map((participant) => participant.id),
    ).toEqual(["near"]);
  });

  it("builds magic missile item spell log model", () => {
    expect(
      buildMagicMissileItemSpellLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.wand_magic_missile",
        spellId: "spell.magic_missile",
        remainingCharges: 2,
        actorName: "Asha",
        itemName: "Wand",
        targetId: "target-1",
        targetName: "Goblin",
        damage: 9,
      }),
    ).toEqual({
      message: "Asha이(가) Wand으로 Goblin에게 마법 미사일을 발사해 9 피해를 줬습니다.",
      structuredAction: {
        type: "item_spell",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.wand_magic_missile",
        spellId: "spell.magic_missile",
        targetParticipantIds: ["target-1"],
        remainingCharges: 2,
      },
      stateDiff: {
        damagedParticipants: [{ participantId: "target-1", damage: 9 }],
      },
    });
  });

  it("builds item attunement log model", () => {
    expect(
      buildItemAttunementLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.ring_protection",
        itemName: "Ring",
        characterName: "Asha",
        attunedCount: 2,
      }),
    ).toEqual({
      message: "Asha이(가) Ring에 조율했습니다. 다시 사용하면 효과가 발동합니다.",
      structuredAction: {
        type: "item_attunement",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.ring_protection",
        attunedCount: 2,
      },
    });
  });

  it("builds inventory item use log model", () => {
    expect(
      buildInventoryItemUseLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.healing_potion",
        itemName: "Potion",
        characterName: "Asha",
        healedHp: 7,
        effectMessage: null,
        consumeOnUse: true,
        actionCost: "action",
        effect: null,
        remainingCharges: null,
      }),
    ).toEqual({
      message: "Asha이(가) Potion을(를) 사용해 HP를 7 회복했습니다.",
      structuredAction: {
        type: "item_use",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.healing_potion",
        consumeOnUse: true,
        actionCost: "action",
        effect: null,
        remainingCharges: null,
      },
    });

    expect(
      buildInventoryItemUseLogModel({
        itemEntryId: "entry-2",
        itemDefinitionId: "item.web_wand",
        itemName: "Wand",
        characterName: "Asha",
        healedHp: null,
        effectMessage: "아이템 효과가 적용되었습니다.",
        consumeOnUse: false,
        actionCost: "bonus_action",
        effect: { type: "utility" },
        remainingCharges: 1,
      }).message,
    ).toBe("Asha이(가) Wand을(를) 사용했습니다. 아이템 효과가 적용되었습니다.");
  });

  it("builds fireball item spell log model", () => {
    expect(
      buildFireballItemSpellLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.staff_fire",
        spellId: "spell.fireball",
        remainingCharges: 1,
        actorName: "Asha",
        itemName: "Staff",
        point: { x: 140, y: 70 },
        targetIds: ["target-1", "target-2"],
        damage: 28,
      }),
    ).toEqual({
      message: "Asha이(가) Staff으로 화염구를 폭발시켜 2명에게 28 화염 피해를 줬습니다.",
      structuredAction: {
        type: "item_spell",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.staff_fire",
        spellId: "spell.fireball",
        point: { x: 140, y: 70 },
        targetParticipantIds: ["target-1", "target-2"],
        remainingCharges: 1,
      },
      stateDiff: {
        damagedParticipants: [
          { participantId: "target-1", damage: 28 },
          { participantId: "target-2", damage: 28 },
        ],
      },
    });

    expect(
      buildFireballItemSpellLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.staff_fire",
        spellId: "spell.fireball",
        remainingCharges: null,
        actorName: "Asha",
        itemName: "Staff",
        point: { x: 0, y: 0 },
        targetIds: [],
        damage: 28,
      }).message,
    ).toBe("Asha이(가) Staff으로 화염구를 폭발시켰지만 범위 안의 대상은 없었습니다.");
  });

  it("builds web item spell log model", () => {
    expect(
      buildWebItemSpellLogModel({
        itemEntryId: "entry-1",
        itemDefinitionId: "item.web_wand",
        spellId: "spell.web",
        remainingCharges: null,
        actorName: "Asha",
        itemName: "Wand",
        point: { x: 140, y: 70 },
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      }),
    ).toEqual({
      message: "Asha이(가) Wand으로 선택한 지점에 거미줄 영역을 펼쳤습니다.",
      structuredAction: {
        type: "item_spell",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.web_wand",
        spellId: "spell.web",
        point: { x: 140, y: 70 },
        terrainEffectId: "terrain.difficult",
        remainingCharges: null,
      },
      stateDiff: {
        terrainEffectId: "terrain.difficult",
        point: { x: 140, y: 70 },
        sizeFt: 20,
      },
    });
  });

  it("builds point-centered item terrain cells", () => {
    expect(
      buildPointItemTerrainCell({
        map: { gridSize: 70, width: 700, height: 700 },
        point: { x: 100, y: 100 },
        itemEntryId: "entry-1",
        itemName: "Wand",
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
        nowMs: 123,
      }),
    ).toEqual({
      id: "item-spell-terrain:entry-1:123",
      x: 0,
      y: 0,
      width: 280,
      height: 280,
      name: "Wand",
      description: "Wand으로 생성된 주문 지형 효과",
      terrainEffectId: "terrain.difficult",
    });
  });

  it("builds token-centered item terrain cells", () => {
    expect(
      buildTokenItemTerrainCell({
        map: { gridSize: 70, width: 700, height: 700 },
        token: { x: 650, y: 650, size: 70 },
        itemEntryId: "entry-1",
        itemName: "Trap Kit",
        terrainEffectId: "terrain.grease",
        sizeFt: 10,
        nowMs: 456,
      }),
    ).toEqual({
      id: "item-terrain:entry-1:456",
      x: 560,
      y: 560,
      width: 140,
      height: 140,
      name: "Trap Kit",
      description: "Trap Kit으로 생성된 지형 효과",
      terrainEffectId: "terrain.grease",
    });
  });

  it("resolves temporary hp item effects", () => {
    expect(resolveTemporaryHpEffect({ currentTempHp: 3, amount: 8 })).toEqual({
      tempHp: 8,
      message: "임시 HP 8을 얻었습니다.",
    });
    expect(resolveTemporaryHpEffect({ currentTempHp: 10, amount: 8 })).toEqual({
      tempHp: 10,
      message: "임시 HP 8을 얻었습니다.",
    });
  });

  it("builds condition-like item effect metadata", () => {
    expect(
      buildItemConditionEffectMetadata({
        type: "condition",
        tags: ["invisible"],
        durationRounds: 3,
      }),
    ).toEqual({
      tags: ["invisible"],
      durationRounds: 3,
      message: "아이템 효과가 적용되었습니다.",
    });

    expect(
      buildItemConditionEffectMetadata({
        type: "tool",
        checkTag: "thieves_tools",
      }),
    ).toEqual({
      tags: ["thieves_tools"],
      durationRounds: 10,
      message: "아이템 효과가 적용되었습니다.",
    });

    expect(
      buildItemConditionEffectMetadata({
        type: "spell",
        spellId: "spell.fly",
        slotLevel: 3,
      }),
    ).toEqual({
      tags: ["item_spell:spell.fly", "item_spell_slot_level:3"],
      durationRounds: 10,
      message: "spell.fly 효과가 발동했습니다.",
    });
  });

  it("builds terrain item effect messages", () => {
    expect(
      buildTerrainItemEffectMessage({
        type: "terrain",
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      }),
    ).toBe("20ft 범위에 terrain.difficult 지형을 배치했습니다.");
  });
});
