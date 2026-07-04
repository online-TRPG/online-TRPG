import { InventoryItemUseResultRuntimeService } from "./inventory-item-use-result-runtime.service";

describe("InventoryItemUseResultRuntimeService", () => {
  const inventoryItemCharacterReader = {
    getMappedSessionCharacter: jest.fn(),
  };
  const turnLogsService = {
    createTurnLog: jest.fn(),
  };
  const service = new InventoryItemUseResultRuntimeService(
    inventoryItemCharacterReader as never,
    turnLogsService as never,
  );
  const itemRuntime = {
    attunedItemEntryIdsByCharacter: {},
    chargesByItemEntryId: { "entry-1": 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryItemCharacterReader.getMappedSessionCharacter.mockImplementation(
      async (id: string) => ({
        id,
        name: id === "target-character" ? "Target" : "Hero",
      }),
    );
    turnLogsService.createTurnLog.mockResolvedValue({ id: "turn-log-1" });
  });

  it("creates general item use log and response characters", async () => {
    await expect(
      service.createUseResult({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "user-1",
        actorSessionCharacterId: "actor-character",
        targetSessionCharacterId: "target-character",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.potion",
        itemName: "Potion",
        healedHp: 5,
        effectResolution: {
          healingAmount: 5,
          tempHp: null,
          conditionsJson: null,
          diceResult: { expression: "2d4+2", total: 5 } as never,
          message: null,
        },
        executableItem: {
          consumeOnUse: true,
          actionCost: "action",
          effect: { type: "healing", dice: "2d4+2" },
          maxCharges: null,
        } as never,
        itemRuntime,
      }),
    ).resolves.toEqual({
      message: "Target이(가) Potion을(를) 사용해 HP를 5 회복했습니다.",
      responseCharacter: { id: "actor-character", name: "Hero" },
      updatedCharacters: [
        { id: "target-character", name: "Target" },
        { id: "actor-character", name: "Hero" },
      ],
      diceResults: [{ expression: "2d4+2", total: 5 }],
      turnLog: { id: "turn-log-1" },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "user-1",
        sessionCharacterId: "actor-character",
        rawInput: null,
        diceResult: { expression: "2d4+2", total: 5 },
        narration: "Target이(가) Potion을(를) 사용해 HP를 5 회복했습니다.",
      }),
    );
  });

  it("reuses target character as response when actor is the target", async () => {
    await expect(
      service.createUseResult({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "user-1",
        actorSessionCharacterId: "target-character",
        targetSessionCharacterId: "target-character",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.utility",
        itemName: "Utility",
        healedHp: null,
        effectResolution: null,
        executableItem: null,
        itemRuntime,
      }),
    ).resolves.toMatchObject({
      responseCharacter: { id: "target-character", name: "Target" },
      updatedCharacters: [
        { id: "target-character", name: "Target" },
        { id: "target-character", name: "Target" },
      ],
      diceResults: [],
    });
    expect(inventoryItemCharacterReader.getMappedSessionCharacter).toHaveBeenCalledTimes(1);
  });
});
