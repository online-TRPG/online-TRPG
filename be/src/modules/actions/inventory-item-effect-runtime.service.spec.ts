import { InventoryItemEffectRuntimeService } from "./inventory-item-effect-runtime.service";

describe("InventoryItemEffectRuntimeService", () => {
  const diceService = {
    roll: jest.fn((dice: string) => ({ formula: dice, total: 7, rolls: [] })),
  };
  const conditionRuntime = {
    parseConditionsJson: jest.fn(() => [{ id: "existing" }]),
    createCondition: jest.fn((condition: unknown) => condition),
    applyCondition: jest.fn((conditions: unknown[], condition: unknown) => [
      ...conditions,
      condition,
    ]),
  };
  const service = new InventoryItemEffectRuntimeService(
    diceService as never,
    conditionRuntime as never,
  );
  const sessionCharacter = {
    id: "session-character-1",
    currentHp: 5,
    tempHp: 3,
    conditionsJson: "[]",
    character: { maxHp: 12 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves healing effects by rolling dice", () => {
    const result = service.resolveExecutableItemEffect(
      {
        id: "item.healing",
        interaction: "use",
        effect: { type: "healing", dice: "2d4+2" },
      } as never,
      sessionCharacter,
    );

    expect(diceService.roll).toHaveBeenCalledWith("2d4+2");
    expect(result).toMatchObject({
      healingAmount: 7,
      tempHp: null,
      conditionsJson: null,
      message: null,
    });
  });

  it("resolves temporary hp effects without lowering existing temp hp", () => {
    expect(
      service.resolveExecutableItemEffect(
        {
          id: "item.temp_hp",
          interaction: "use",
          effect: { type: "temporary_hp", amount: 2 },
        } as never,
        sessionCharacter,
      ),
    ).toMatchObject({
      healingAmount: null,
      tempHp: 3,
      message: "임시 HP 2을 얻었습니다.",
    });
  });

  it("applies condition-like item effects through condition runtime", () => {
    const result = service.resolveExecutableItemEffect(
      {
        id: "item.fly",
        interaction: "use",
        effect: { type: "spell", spellId: "spell.fly", slotLevel: 3 },
      } as never,
      sessionCharacter,
    );

    expect(conditionRuntime.createCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionId: "condition.item.item.fly",
        sourceId: "item.fly",
        duration: { type: "rounds", remaining: 10 },
        stackPolicy: "replace",
        tags: ["item_spell:spell.fly", "item_spell_slot_level:3"],
      }),
    );
    expect(result.conditionsJson).toContain("condition.item.item.fly");
    expect(result.message).toBe("spell.fly 효과가 발동했습니다.");
  });

  it("resolves terrain effects as messages", () => {
    expect(
      service.resolveExecutableItemEffect(
        {
          id: "item.terrain",
          interaction: "use",
          effect: { type: "terrain", terrainEffectId: "terrain.difficult", sizeFt: 20 },
        } as never,
        sessionCharacter,
      ),
    ).toMatchObject({
      conditionsJson: null,
      message: "20ft 범위에 terrain.difficult 지형을 배치했습니다.",
    });
  });
});
