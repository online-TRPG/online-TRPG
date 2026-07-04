import { InventoryItemResultPublisherService } from "./inventory-item-result-publisher.service";

describe("InventoryItemResultPublisherService", () => {
  const realtimeEvents = {
    emitCharacterUpdated: jest.fn(),
    emitDiceRolled: jest.fn(),
    emitTurnLogCreated: jest.fn(),
    emitSessionSnapshot: jest.fn(),
  };
  const sessionsService = {
    buildSnapshot: jest.fn(() => ({ session: { id: "session-1" } })),
  };
  const service = new InventoryItemResultPublisherService(
    realtimeEvents as never,
    sessionsService as never,
  );
  const character = {
    id: "session-character-1",
    name: "Asha",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emits item result events and returns the response payload", async () => {
    const turnLog = { id: "turn-log-1" };
    const diceResult = { total: 7 };

    await expect(
      service.publishUseResult({
        sessionId: "session-1",
        itemId: "entry-1",
        itemName: "Potion",
        consumedQuantity: 1,
        healedHp: 5,
        message: "Asha이(가) Potion을 사용했습니다.",
        responseCharacter: character as never,
        updatedCharacters: [character as never, character as never],
        diceResults: [diceResult as never],
        turnLog: turnLog as never,
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      itemId: "entry-1",
      itemName: "Potion",
      consumedQuantity: 1,
      healedHp: 5,
      message: "Asha이(가) Potion을 사용했습니다.",
      character,
    });

    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalledTimes(1);
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalledWith(
      "session-1",
      character,
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      diceResult,
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      turnLog,
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith(
      "session-1",
      { session: { id: "session-1" } },
    );
  });
});
