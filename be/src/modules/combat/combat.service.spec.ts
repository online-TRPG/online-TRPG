import {
  CombatEntityType as PrismaCombatEntityType,
  CombatStatus as PrismaCombatStatus,
  GmMode as PrismaGmMode,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  CombatEntityType as SharedCombatEntityType,
  CombatStatus as SharedCombatStatus,
} from "@trpg/shared-types";
import { CombatService } from "./combat.service";

const createParticipant = (
  overrides: Partial<{
    id: string;
    combatId: string;
    sessionCharacterId: string;
    nameSnapshot: string;
    turnOrder: number;
    isAlive: boolean;
    entityType: PrismaCombatEntityType;
    currentHpSnapshot: number;
    maxHpSnapshot: number;
    armorClassSnapshot: number;
    isHostile: boolean;
  }> = {},
) => ({
  id: overrides.id ?? "participant-1",
  combatId: overrides.combatId ?? "combat-1",
  entityType: overrides.entityType ?? PrismaCombatEntityType.PLAYER_CHARACTER,
  sessionCharacterId: overrides.sessionCharacterId ?? "session-character-1",
  nameSnapshot: overrides.nameSnapshot ?? "Hero",
  initiative: 10,
  turnOrder: overrides.turnOrder ?? 1,
  isAlive: overrides.isAlive ?? true,
  isHostile: overrides.isHostile ?? false,
  currentHpSnapshot: overrides.currentHpSnapshot ?? 18,
  maxHpSnapshot: overrides.maxHpSnapshot ?? 20,
  armorClassSnapshot: overrides.armorClassSnapshot ?? 16,
  turnEndedAt: null,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
});

describe("CombatService lifecycle", () => {
  const createService = () => {
    const prisma = {
      $transaction: jest.fn(),
      combat: {
        findFirst: jest.fn(),
      },
      sessionCharacter: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sessionParticipant: {
        findUnique: jest.fn(),
      },
      sessionCharacterResource: {
        findMany: jest.fn(),
      },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn(),
      ensureMembership: jest.fn(),
      getGameStateEntityOrThrow: jest.fn(),
      buildSnapshot: jest.fn(),
    };
    const diceService = {
      roll: jest.fn(() => ({ total: 10 })),
    };
    const actionRules = {
      getAvailableActions: jest.fn(),
    };
    const actionEconomy = {
      getOrCreateTurnState: jest.fn(),
    };
    const characterResources = {
      endRage: jest.fn(),
    };
    const realtimeEvents = {
      emitCombatUpdated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitTurnChanged: jest.fn(),
    };

    return {
      service: new CombatService(
        prisma as never,
        sessionsService as never,
        diceService as never,
        actionRules as never,
        actionEconomy as never,
        characterResources as never,
        realtimeEvents as never,
      ),
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      characterResources,
      realtimeEvents,
    };
  };

  it("starts combat with hostile participants that can be tracked as HP/AC targets", async () => {
    const { service, prisma, sessionsService } = createService();
    const participantCreates: Array<{ data: Record<string, unknown> }> = [];
    const tx = {
      combat: {
        create: jest.fn().mockResolvedValue({ id: "combat-1" }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockImplementation(() => ({
          id: "combat-1",
          sessionId: "session-1",
          status: PrismaCombatStatus.ACTIVE,
          roundNo: 1,
          turnNo: 1,
          currentParticipantId: "participant-1",
          participants: participantCreates.map((create, index) => ({
            id: `participant-${index + 1}`,
            combatId: "combat-1",
            turnEndedAt: null,
            createdAt: new Date("2026-05-06T00:00:00.000Z"),
            updatedAt: new Date("2026-05-06T00:00:00.000Z"),
            ...create.data,
          })),
        })),
      },
      combatParticipant: {
        create: jest.fn().mockImplementation(({ data }) => {
          participantCreates.push({ data });
          return { id: `participant-${participantCreates.length}`, ...data };
        }),
      },
      combatTurnState: {
        upsert: jest.fn(),
      },
      gameState: {
        update: jest.fn(),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { version: 3 },
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(null);
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        currentHp: 18,
        tempHp: 0,
        conditionsJson: "[]",
        character: {
          name: "Fighter",
          maxHp: 20,
          armorClass: 16,
        },
      },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.startCombat("user-1", "session-1", {
      autoRollInitiative: false,
      hostileParticipants: [
        {
          name: "Goblin",
          entityType: SharedCombatEntityType.MONSTER,
          maxHp: 7,
          armorClass: 13,
        },
      ],
    });

    expect(result.status).toBe(SharedCombatStatus.ACTIVE);
    expect(result.participants).toEqual([
      expect.objectContaining({
        entityType: SharedCombatEntityType.PLAYER_CHARACTER,
        name: "Fighter",
        currentHp: 18,
        maxHp: 20,
        armorClass: 16,
        isHostile: false,
      }),
      expect.objectContaining({
        entityType: SharedCombatEntityType.MONSTER,
        name: "Goblin",
        currentHp: 7,
        maxHp: 7,
        armorClass: 13,
        isHostile: true,
      }),
    ]);
  });

  it("creates the first CombatTurnState when combat starts", async () => {
    const { service, prisma, sessionsService } = createService();
    const participant = createParticipant();
    const tx = {
      combat: {
        create: jest.fn().mockResolvedValue({ id: "combat-1" }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "combat-1",
          sessionId: "session-1",
          status: PrismaCombatStatus.ACTIVE,
          roundNo: 1,
          turnNo: 1,
          currentParticipantId: participant.id,
          participants: [participant],
        }),
      },
      combatParticipant: {
        create: jest.fn().mockResolvedValue(participant),
      },
      combatTurnState: {
        upsert: jest.fn(),
      },
      gameState: {
        update: jest.fn(),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { version: 3 },
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(null);
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        character: { name: "Hero" },
      },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.startCombat("user-1", "session-1", { autoRollInitiative: false });

    expect(tx.combatTurnState.upsert).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_sessionCharacterId: {
          combatId: "combat-1",
          roundNo: 1,
          turnNo: 1,
          sessionCharacterId: "session-character-1",
        },
      },
      create: {
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        sessionCharacterId: "session-character-1",
      },
      update: {},
    });
  });

  it("creates the next turn state when a turn ends", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-2",
      sessionCharacterId: "session-character-2",
      nameSnapshot: "Rogue",
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: current.id,
      participants: [current, next],
    };
    const tx = {
      combatParticipant: {
        update: jest.fn(),
      },
      combat: {
        update: jest.fn().mockResolvedValue({
          ...combat,
          currentParticipantId: next.id,
          roundNo: 1,
          turnNo: 2,
        }),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({ id: "session-character-1" });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.endTurn("user-1", "session-1", {});

    expect(actionEconomy.getOrCreateTurnState).toHaveBeenCalledWith({
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-2",
    });
  });

  it("ends expired Rage and clears condition tags after turn advance", async () => {
    const { service, prisma, sessionsService, characterResources, realtimeEvents } =
      createService();
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-2",
      sessionCharacterId: "session-character-2",
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 10,
      turnNo: 20,
      currentParticipantId: current.id,
      participants: [current, next],
    };
    const updatedCombat = {
      ...combat,
      roundNo: 10,
      turnNo: 21,
      currentParticipantId: next.id,
    };
    const tx = {
      combatParticipant: {
        update: jest.fn(),
      },
      combat: {
        update: jest.fn().mockResolvedValue(updatedCombat),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1" });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique
      .mockResolvedValueOnce({ id: "session-character-1" })
      .mockResolvedValueOnce({
        conditionsJson: JSON.stringify(["rage", "resistance:slashing", "blessed"]),
      });
    prisma.sessionCharacter.update.mockResolvedValue({});
    prisma.sessionCharacterResource.findMany.mockResolvedValue([
      {
        sessionCharacterId: "session-character-1",
        rageActive: true,
        rageEndsAtRound: 10,
        rageEndsAtTurn: 21,
      },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.endTurn("user-1", "session-1", {});

    expect(characterResources.endRage).toHaveBeenCalledWith("session-character-1");
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { conditionsJson: JSON.stringify(["blessed"]) },
    });
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });
});
