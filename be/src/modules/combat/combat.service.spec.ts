import {
  CombatEntityType as PrismaCombatEntityType,
  CombatStatus as PrismaCombatStatus,
  GmMode as PrismaGmMode,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CombatReactionResponseDto } from "@trpg/shared-types";
import { CombatService } from "./combat.service";

const createParticipant = (
  overrides: Partial<{
    id: string;
    combatId: string;
    sessionCharacterId: string | null;
    nameSnapshot: string;
    tokenId: string | null;
    entityType: PrismaCombatEntityType;
    turnOrder: number;
    isAlive: boolean;
    isHostile: boolean;
    currentHp: number;
    maxHp: number;
    armorClass: number;
    speedFt: number;
  }> = {},
) => ({
  id: overrides.id ?? "participant-1",
  combatId: overrides.combatId ?? "combat-1",
  entityType: overrides.entityType ?? PrismaCombatEntityType.PLAYER_CHARACTER,
  sessionCharacterId:
    overrides.sessionCharacterId === undefined ? "session-character-1" : overrides.sessionCharacterId,
  nameSnapshot: overrides.nameSnapshot ?? "Hero",
  tokenId: overrides.tokenId ?? null,
  currentHp: overrides.currentHp ?? 10,
  maxHp: overrides.maxHp ?? 10,
  armorClass: overrides.armorClass ?? 14,
  speedFt: overrides.speedFt ?? 30,
  conditionsJson: "[]",
  initiative: 10,
  turnOrder: overrides.turnOrder ?? 1,
  isAlive: overrides.isAlive ?? true,
  isHostile: overrides.isHostile ?? false,
  turnEndedAt: null,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
});

describe("CombatReactionResponseDto validation", () => {
  it("allows reactionId through the global whitelist validation pipe", async () => {
    const dto = plainToInstance(CombatReactionResponseDto, {
      reactionId: "reaction:shield:1",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });
});

describe("CombatService lifecycle", () => {
  const createService = () => {
    const prisma = {
      $transaction: jest.fn(),
      combat: {
        findFirst: jest.fn(),
      },
      combatParticipant: {
        update: jest.fn(),
      },
      combatTurnState: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sessionCharacter: {
        findMany: jest.fn().mockResolvedValue([]),
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
      getVttMapForUser: jest.fn().mockResolvedValue({ tokens: [] }),
      buildSnapshot: jest.fn(),
    };
    const diceService = {
      roll: jest.fn(() => ({
        expression: "1d20",
        rolls: [10],
        modifier: 0,
        total: 10,
        advantageState: "NORMAL",
      })),
    };
    const actionRules = {
      getAvailableActions: jest.fn(),
    };
    const actionEconomy = {
      getOrCreateTurnState: jest.fn(),
      spendAction: jest.fn(),
      spendSneakAttack: jest.fn(),
    };
    const characterResources = {
      endRage: jest.fn(),
    };
    const realtimeEvents = {
      emitCombatUpdated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitTurnChanged: jest.fn(),
      emitSystemMessage: jest.fn(),
      emitDiceRolled: jest.fn(),
      emitTurnLogCreated: jest.fn(),
    };
    const turnLogsService = {
      createTurnLog: jest.fn(),
    };
    const ruleEngine = {
      applySneakAttack: jest.fn(),
    };
    const srdEngine = {
      chooseMvpMonsterAction: jest.fn(),
      getMonsterCombatStats: jest.fn(),
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
        turnLogsService as never,
        ruleEngine as never,
        srdEngine as never,
      ),
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      characterResources,
      realtimeEvents,
      turnLogsService,
      ruleEngine,
      srdEngine,
    };
  };

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
        currentHp: 10,
        conditionsJson: "[]",
        character: {
          name: "Hero",
          abilitiesJson: "{}",
          maxHp: 10,
          armorClass: 14,
          speed: 30,
          className: "Fighter",
          level: 1,
        },
      },
    ]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.startCombat("user-1", "session-1", { autoRollInitiative: false });

    expect(tx.combatTurnState.upsert).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: {
          combatId: "combat-1",
          roundNo: 1,
          turnNo: 1,
          combatParticipantId: participant.id,
        },
      },
      create: {
        combatId: "combat-1",
        combatParticipantId: participant.id,
        roundNo: 1,
        turnNo: 1,
        sessionCharacterId: "session-character-1",
      },
      update: {},
    });
  });

  it("rejects startCombat with COMBAT_409 on a node whose combat already completed", async () => {
    const { service, prisma, sessionsService } = createService();

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    prisma.combat.findFirst.mockResolvedValue(null);
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        version: 3,
        currentNodeId: "node-04",
        flagsJson: JSON.stringify({ completedCombatNodeIds: ["node-04"] }),
      },
    });

    await expect(
      service.startCombat("user-1", "session-1", { autoRollInitiative: false }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: { reason: "COMBAT_NODE_ALREADY_COMPLETED" },
      },
    });

    // 가드는 트랜잭션 이전에 막아야 한다 — 종료된 전투 노드에서 새 전투가 생성되면 안 된다.
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...combat,
          currentParticipantId: next.id,
          roundNo: 1,
          turnNo: 2,
        }),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.endTurn("user-1", "session-1", {});

    expect(tx.combat.updateMany).toHaveBeenCalledWith({
      where: { id: "combat-1", currentParticipantId: current.id },
      data: {
        currentParticipantId: next.id,
        turnNo: 2,
        roundNo: 1,
      },
    });
    expect(actionEconomy.getOrCreateTurnState).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: next.id,
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-2",
    });
  });

  it("rejects endTurn with TURN_409 when another caller already advanced the turn", async () => {
    const { service, prisma, sessionsService } = createService();
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
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: current.id,
      participants: [current, next],
    };
    // 동시 호출자 두 명 모두 NOT_YOUR_TURN 검증을 통과한 직후를 모사한다.
    // 둘 중 한 명이 먼저 update 했다면 두번째 호출자의 updateMany 는 0건이 된다.
    const tx = {
      combatParticipant: { update: jest.fn() },
      combat: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.endTurn("user-1", "session-1", {})).rejects.toMatchObject({
      response: {
        code: "TURN_409",
        data: { reason: "TURN_ALREADY_ADVANCED" },
      },
    });

    // race 패배 시 turnEndedAt 이나 fetch 가 일어나선 안 된다.
    expect(tx.combatParticipant.update).not.toHaveBeenCalled();
    expect(tx.combat.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("uses a basic attack when the current player has no equipped weapon", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService } =
      createService();
    const attacker = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Hero",
      turnOrder: 1,
    });
    const target = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      armorClass: 8,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: attacker.id,
      participants: [attacker, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-hero", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0 },
        { id: "token-monster", x: 50, y: 0, hidden: false },
      ],
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique
      .mockResolvedValueOnce({
        id: attacker.sessionCharacterId,
        userId: "user-1",
        character: { ownerUserId: "user-1" },
      })
      .mockResolvedValueOnce({
        id: attacker.sessionCharacterId,
        inventorySnapshotJson: "[]",
        inventoryEntries: [],
        character: {
          equippedWeaponId: null,
          inventoryJson: "[]",
          abilitiesJson: JSON.stringify({ str: 10, dex: 10 }),
          proficiencyBonus: 2,
        },
      });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+2",
      rolls: [12],
      modifier: 2,
      total: 14,
      advantageState: "NORMAL",
    });

    const result = await service.resolveEquippedWeaponAttack("user-1", "session-1", {
      targetParticipantId: target.id,
    });

    expect(result.message).toContain("기본 공격 처리");
    expect(result.damageTotal).toBe(1);
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "1d20+2", "NORMAL");
    expect(diceService.roll).toHaveBeenCalledTimes(1);
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 9, isAlive: true },
    });
    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedCombat),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1" });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockImplementation(async (args: {
      where?: { id?: string; sessionId_userId?: { sessionId: string; userId: string } };
      include?: unknown;
    }) => {
      if (args.where?.sessionId_userId) {
        return {
          id: "session-character-1",
          character: { ownerUserId: "user-1" },
        };
      }
      if (args.where?.id === "session-character-1" && args.include) {
        return {
          id: "session-character-1",
          character: { ownerUserId: "user-1" },
        };
      }
      if (args.where?.id === "session-character-1") {
        return {
          conditionsJson: JSON.stringify([
            "rage",
            "resistance:slashing",
            "blessed",
          ]),
        };
      }
      if (args.where?.id === "session-character-2") {
        return { conditionsJson: JSON.stringify([]) };
      }
      return null;
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
