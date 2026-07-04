import { InventoryItemAttunementRuntimeService } from "./inventory-item-attunement-runtime.service";

describe("InventoryItemAttunementRuntimeService", () => {
  const inventoryItemCharacterReader = {
    getMappedSessionCharacter: jest.fn(),
  };
  const inventoryItemRuntimeFlags = {
    writeP3ItemRuntimeFlags: jest.fn(),
  };
  const turnLogsService = {
    createTurnLog: jest.fn(),
  };
  const service = new InventoryItemAttunementRuntimeService(
    inventoryItemCharacterReader as never,
    inventoryItemRuntimeFlags as never,
    turnLogsService as never,
  );
  const itemRuntime = {
    attunedItemEntryIdsByCharacter: {
      "session-character-1": ["entry-1"],
    },
    chargesByItemEntryId: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryItemCharacterReader.getMappedSessionCharacter.mockResolvedValue({
      id: "session-character-1",
      name: "Hero",
    });
    turnLogsService.createTurnLog.mockResolvedValue({ id: "turn-log-1" });
  });

  it("persists attunement runtime flags and creates an attunement log", async () => {
    await expect(
      service.attuneItem({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "user-1",
        sessionCharacterId: "session-character-1",
        itemEntryId: "entry-1",
        itemDefinitionId: "item.magic-ring",
        itemName: "Magic Ring",
        attunedCount: 1,
        flags: { existing: true },
        itemRuntime,
      }),
    ).resolves.toEqual({
      message: "Hero이(가) Magic Ring에 조율했습니다. 다시 사용하면 효과가 발동합니다.",
      responseCharacter: {
        id: "session-character-1",
        name: "Hero",
      },
      turnLog: { id: "turn-log-1" },
    });
    expect(inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags).toHaveBeenCalledWith({
      sessionScenarioId: "session-scenario-1",
      flags: { existing: true },
      itemRuntime,
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        actorUserId: "user-1",
        sessionCharacterId: "session-character-1",
        rawInput: null,
        narration: "Hero이(가) Magic Ring에 조율했습니다. 다시 사용하면 효과가 발동합니다.",
      }),
    );
  });
});
