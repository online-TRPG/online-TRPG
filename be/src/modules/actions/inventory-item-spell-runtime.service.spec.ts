import { InventoryItemSpellRuntimeService } from "./inventory-item-spell-runtime.service";

describe("InventoryItemSpellRuntimeService", () => {
  const targetParticipant = {
    id: "target-1",
    tokenId: "target-token",
    sessionCharacterId: "target-character",
    currentHp: 10,
    isAlive: true,
    nameSnapshot: "Goblin",
  };
  const actorParticipant = {
    id: "actor-1",
    tokenId: "actor-token",
    sessionCharacterId: "actor-character",
    currentHp: 20,
    isAlive: true,
    nameSnapshot: "Asha",
  };
  const combat = {
    id: "combat-1",
    participants: [actorParticipant, targetParticipant],
  };
  const map = {
    gridSize: 70,
    width: 700,
    height: 700,
    tokens: [
      { id: "actor-token", sessionCharacterId: "actor-character", x: 0, y: 0, size: 70 },
      { id: "target-token", sessionCharacterId: "target-character", x: 70, y: 0, size: 70 },
    ],
    terrainCells: [],
  };
  const prisma = {
    combat: {
      findFirst: jest.fn(() => combat),
    },
    combatParticipant: {
      update: jest.fn(),
    },
    sessionCharacter: {
      update: jest.fn(),
    },
  };
  const sessionsService = {
    getAuthoritativeVttMap: jest.fn(() => map),
  };
  const mapRuntimeService = {
    saveSystemVttMap: jest.fn(),
  };
  const turnLogsService = {
    createTurnLog: jest.fn((payload: unknown) => ({ id: "turn-log-1", payload })),
  };
  const diceService = {
    roll: jest.fn((formula: string) => ({ formula, total: formula === "8d6" ? 28 : 9, rolls: [] })),
  };
  const service = new InventoryItemSpellRuntimeService(
    prisma as never,
    sessionsService as never,
    mapRuntimeService as never,
    turnLogsService as never,
    diceService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    targetParticipant.currentHp = 10;
    targetParticipant.isAlive = true;
  });

  it("resolves magic missile item spell damage and turn log", async () => {
    const result = await service.resolveExecutableItemSpellEffect({
      userId: "user-1",
      sessionId: "session-1",
      sessionScenarioId: "scenario-1",
      actorUserId: "user-1",
      actorSessionCharacterId: "actor-character",
      itemEntryId: "entry-1",
      itemDefinitionId: "item.wand_magic_missile",
      itemName: "Wand",
      executableItem: { rangeFt: 120 } as never,
      spellEffect: { type: "spell", spellId: "spell.magic_missile", slotLevel: 1 },
      targetParticipantId: "target-1",
      point: null,
      remainingCharges: 2,
    });

    expect(diceService.roll).toHaveBeenCalledWith("3d4+3");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { currentHp: 1, isAlive: true },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        narration: "Asha이(가) Wand으로 Goblin에게 마법 미사일을 발사해 9 피해를 줬습니다.",
      }),
    );
    expect(result.diceResults).toHaveLength(1);
  });

  it("resolves web item spell terrain placement and turn log", async () => {
    const result = await service.resolveExecutableItemSpellEffect({
      userId: "user-1",
      sessionId: "session-1",
      sessionScenarioId: "scenario-1",
      actorUserId: "user-1",
      actorSessionCharacterId: "actor-character",
      itemEntryId: "entry-1",
      itemDefinitionId: "item.web_wand",
      itemName: "Wand",
      executableItem: { rangeFt: 120 } as never,
      spellEffect: { type: "spell", spellId: "spell.web", slotLevel: 2 },
      targetParticipantId: null,
      point: { x: 140, y: 70 },
      remainingCharges: null,
    });

    expect(mapRuntimeService.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        terrainCells: [
          expect.objectContaining({
            id: expect.stringContaining("item-spell-terrain:entry-1:"),
            terrainEffectId: "terrain.difficult",
          }),
        ],
      }),
    );
    expect(result.message).toBe("Asha이(가) Wand으로 선택한 지점에 거미줄 영역을 펼쳤습니다.");
    expect(result.diceResults).toEqual([]);
  });
});
