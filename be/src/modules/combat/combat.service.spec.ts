import {
  CombatEntityType as PrismaCombatEntityType,
  CombatStatus as PrismaCombatStatus,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CastCombatSpellDto,
  CombatReactionPromptDto,
  CombatReactionResponseDto,
  DiceAdvantageState,
} from "@trpg/shared-types";
import { CombatService } from "./combat.service";
import {
  PENDING_READY_ACTIONS_FLAG,
  TRIGGERED_READY_ACTIONS_FLAG,
} from "../rules/ready-action.service";
import type { CoverLevel } from "../rules/rule-engine.types";

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
    conditionsJson: string;
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
  conditionsJson: overrides.conditionsJson ?? "[]",
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

describe("CastCombatSpellDto validation", () => {
  it("allows an optional spell slot level for upcast combat spells", async () => {
    const dto = plainToInstance(CastCombatSpellDto, {
      spellId: "spell.magic_missile",
      slotLevel: 3,
      targetParticipantIds: ["monster-1"],
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
        findUniqueOrThrow: jest.fn(),
      },
      combatParticipant: {
        update: jest.fn(),
      },
      combatTurnState: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      gameState: {
        update: jest.fn(),
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
      getGameStateEntityOrThrow: jest.fn().mockResolvedValue({
        sessionScenario: { id: "session-scenario-1" },
        state: { flagsJson: "{}", currentNodeId: null },
      }),
      getVttMapForUser: jest.fn().mockResolvedValue({ tokens: [] }),
      saveSystemVttMap: jest.fn(),
      hideVttToken: jest.fn(),
      hideVttTokenForSessionCharacter: jest.fn(),
      buildSnapshot: jest.fn(),
      completeActiveCombatState: jest.fn(),
      completeSessionAfterPartyDefeat: jest.fn(),
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
      getOrCreateTurnState: jest.fn().mockResolvedValue({
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        attackActionWeaponId: null,
        attackActionWeaponIsLightMelee: false,
        sneakAttackUsed: false,
        movementFtSpent: 0,
      }),
      spendAction: jest.fn(),
      spendBonusAction: jest.fn(),
      spendReaction: jest.fn(),
      spendSneakAttack: jest.fn(),
      recordAttackAction: jest.fn(),
      grantAdditionalAction: jest.fn(),
      grantMovement: jest.fn(),
    };
    const characterResources = {
      endRage: jest.fn(),
    };
    const realtimeEvents = {
      emitCombatUpdated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitTurnChanged: jest.fn(),
      emitSystemMessage: jest.fn(),
      emitCombatReactionPrompt: jest.fn(),
      emitDiceRolled: jest.fn(),
      emitTurnLogCreated: jest.fn(),
    };
    const turnLogsService = {
      createTurnLog: jest.fn(),
    };
    const ruleEngine = {
      applySneakAttack: jest.fn(),
      resolveSavingThrow: jest.fn((_input?: { naturalD20: number; difficultyClass: number }) => ({
        hookId: "hook.save.resolve",
        accepted: true,
        produced: {
          ability: "dex",
          naturalD20: _input?.naturalD20 ?? 10,
          difficultyClass: _input?.difficultyClass ?? 14,
          total: _input?.naturalD20 ?? 10,
          success: _input ? _input.naturalD20 >= _input.difficultyClass : false,
          advantageState: "normal",
          appliedModifiers: [],
        },
        statePatch: [],
        turnLogEvents: [],
        rejectedReason: null,
      })),
      applyDamageModifiers: jest.fn((input: { baseDamage: number }) => ({
        hookId: "hook.damage.apply_modifiers",
        accepted: true,
        produced: {
          baseDamage: input.baseDamage,
          finalDamage: input.baseDamage,
          appliedModifiers: [],
        },
        statePatch: [],
        turnLogEvents: [],
        rejectedReason: null,
      })),
      resolveCoverModifiers: jest.fn((input: {
        coverLevel: CoverLevel;
        appliesToAttackRoll?: boolean;
        appliesToDexteritySave?: boolean;
      }) => {
        const coverBonus = input.coverLevel === "half" ? 2 : input.coverLevel === "three_quarters" ? 5 : 0;
        const appliedModifiers = [
          ...(input.appliesToAttackRoll !== false && coverBonus > 0
            ? [{ source: `cover:${input.coverLevel}:ac`, value: coverBonus }]
            : []),
          ...(input.appliesToDexteritySave && coverBonus > 0
            ? [{ source: `cover:${input.coverLevel}:dex_save`, value: coverBonus }]
            : []),
        ];
        return {
          hookId: "hook.combat.resolve_cover_modifiers",
          accepted: true,
          produced: {
            coverLevel: input.coverLevel,
            armorClassBonus: input.appliesToAttackRoll === false ? 0 : coverBonus,
            dexteritySaveBonus: input.appliesToDexteritySave ? coverBonus : 0,
            targetable: input.coverLevel !== "full",
            appliedModifiers,
          },
          statePatch: [],
          turnLogEvents: [],
          rejectedReason: null,
        };
      }),
    };
    const srdEngine = {
      chooseMvpMonsterAction: jest.fn(),
      getMonsterCombatStats: jest.fn(),
      getExecutableMonsterActions: jest.fn(() => []),
    };
    const monsterAbilities = {
      chooseAction: jest.fn(),
      listExecutableActions: jest.fn(() => []),
    };
    prisma.combat.findUniqueOrThrow.mockImplementation(async () => prisma.combat.findFirst());

    return {
      service: new CombatService(
        prisma as never,
        sessionsService as never,
        { saveSystemVttMap: sessionsService.saveSystemVttMap } as never,
        diceService as never,
        actionRules as never,
        actionEconomy as never,
        characterResources as never,
        realtimeEvents as never,
        turnLogsService as never,
        ruleEngine as never,
        srdEngine as never,
        monsterAbilities as never,
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
      monsterAbilities,
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

  it("clears combat-bound monster limited-use flags when combat ends", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const hero = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-1",
      isHostile: false,
      turnOrder: 1,
    });
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      isHostile: true,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 4,
      currentParticipantId: hero.id,
      participants: [hero, monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            [monster.id]: {
              "monster.cult_fanatic.ability.combat_surge": {
                usage: "1/combat",
                used: 1,
                limit: 1,
              },
              "monster.cult_fanatic.ability.dark_blessing": {
                usage: "1/day",
                used: 1,
                limit: 1,
              },
            },
          },
          unrelatedFlag: true,
        }),
        currentNodeId: null,
      },
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.combat.findUniqueOrThrow.mockResolvedValue(combat);

    await service.endCombat("host-user", "session-1");

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            [monster.id]: {
              "monster.cult_fanatic.ability.dark_blessing": {
                usage: "1/day",
                used: 1,
                limit: 1,
              },
            },
          },
          unrelatedFlag: true,
        }),
      },
    });
    expect(sessionsService.completeActiveCombatState).toHaveBeenCalledWith("session-1", "combat-1");
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalled();
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

  it("recharges expended monster actions when the monster turn starts", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, turnLogsService } = createService();
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Dragon Whelp",
      isHostile: true,
      turnOrder: 2,
    });
    const actionId = "monster.dragon_whelp.ability.fire_breath";
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

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          monsterRechargeExpended: {
            [next.id]: {
              [actionId]: {
                recharge: "5-6",
                roundNo: 1,
                turnNo: 1,
              },
            },
          },
        }),
        currentNodeId: null,
      },
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d6",
      rolls: [5],
      modifier: 0,
      total: 5,
      advantageState: "NORMAL",
    });

    const result = await service.endTurn("user-1", "session-1", {});

    expect(diceService.roll).toHaveBeenCalledWith("1d6");
    expect(result.message).toBe("몬스터 재충전 1개 성공");
    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({ monsterRechargeExpended: {} }),
      },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          monsterRecharge: expect.objectContaining({
            rechargedCount: 1,
            diceRolls: [expect.objectContaining({ expression: "1d6", total: 5 })],
          }),
        }),
        diceResult: expect.objectContaining({ expression: "1d6", total: 5 }),
      }),
    );
    expect(actionEconomy.getOrCreateTurnState).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: next.id,
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: null,
    });
  });

  it("reports monster aura and turn-start lifecycle hooks when a monster turn starts", async () => {
    const { service, prisma, sessionsService, actionEconomy, monsterAbilities, turnLogsService } = createService();
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Venom Warden",
      isHostile: true,
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
          turnNo: 2,
        }),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        {
          id: "token-monster",
          monster: { id: "monster.venom_warden" },
          x: 50,
          y: 50,
          size: 50,
          hidden: false,
        },
      ],
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    (monsterAbilities.listExecutableActions as jest.Mock).mockReturnValue([
      {
        monsterId: "monster.venom_warden",
        actionId: "monster.venom_warden.aura",
        label: "Venom Aura",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "0",
        damageType: null,
        reachFt: null,
        rangeFt: null,
        confidence: "medium",
        effectTags: ["aura:poison", "trigger:on_turn_start:poison"],
      },
    ]);
    prisma.combat.findFirst.mockResolvedValueOnce(combat).mockResolvedValue({
      ...combat,
      currentParticipantId: next.id,
      turnNo: 2,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });

    const result = await service.endTurn("user-1", "session-1", {});

    expect(result.monsterLifecycleEffects).toEqual([
      expect.objectContaining({
        actorParticipantId: next.id,
        actorName: "Venom Warden",
        actionId: "monster.venom_warden.aura",
        hook: "turn_start",
        effectTags: ["trigger:on_turn_start:poison"],
      }),
      expect.objectContaining({
        actorParticipantId: next.id,
        actorName: "Venom Warden",
        actionId: "monster.venom_warden.aura",
        hook: "aura",
        effectTags: ["aura:poison"],
      }),
    ]);
    expect(result.message).toBe("몬스터 지속 능력 확인: Venom Warden Venom Aura");
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "turn_terrain_lifecycle",
          monsterLifecycleEffects: result.monsterLifecycleEffects,
        }),
      }),
    );
  });

  it("applies persistent terrain effects but skips enter-only terrain at turn start", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, realtimeEvents } = createService();
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      tokenId: "token-1",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-2",
      sessionCharacterId: null,
      tokenId: "token-2",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Cultist",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
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
    const updatedCombat = {
      ...combat,
      currentParticipantId: next.id,
      turnNo: 2,
      participants: [current, next],
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
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 50, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 50, y: 0, width: 50, height: 50 },
        { id: "terrain.slippery:cell-2", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValueOnce(combat).mockResolvedValue(updatedCombat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      });

    const result = await service.endTurn("user-1", "session-1", {});

    expect(result.message).toBe(
      "턴 시작: 지형 피해 4 / 지형 상태 condition.poisoned",
    );
    expect(result.terrainEffects).toMatchObject({
      trigger: "on_turn_start",
      damageTotal: 4,
      damagePackets: [
        {
          sourceEffectId: "terrain.poison_cloud",
          damageType: "poison",
          total: 4,
        },
      ],
      appliedConditionTags: ["condition.poisoned"],
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: next.id },
      data: { currentHp: 16, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: next.id },
      data: {
        conditionsJson: JSON.stringify([
          {
            conditionId: "condition.poisoned",
            sourceId: "terrain.poison_cloud",
            duration: { type: "permanent" },
            saveEnds: { ability: "con", dc: 13 },
            stackPolicy: "ignore_duplicate",
            appliedAtRound: 1,
            expiresAtTurn: null,
            tags: ["trigger:on_enter", "trigger:on_turn_start", "trigger:on_exit", "save:con", "damage:poison", "condition:poisoned", "condition_ends:on_exit"],
          },
        ]),
      },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 4 }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d6", total: 4 }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("force moves a combat token without spending movement or prompting opportunity attacks", async () => {
    const { service, prisma, sessionsService, turnLogsService, realtimeEvents } = createService();
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      turnOrder: 1,
      isHostile: true,
    });
    const origin = createParticipant({
      id: "participant-origin",
      sessionCharacterId: "session-character-1",
      tokenId: "token-origin",
      nameSnapshot: "Cleric",
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: origin.id,
      participants: [target, origin],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-origin", sessionCharacterId: "session-character-1", x: 50, y: 50, size: 50, hidden: false },
        { id: "token-target", x: 100, y: 50, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.forceMoveParticipant("host-user", "session-1", {
      participantId: "participant-target",
      mode: "push",
      origin: { x: 50, y: 50 },
      distanceFt: 10,
    });

    expect(result.map.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "token-target", x: 200, y: 50 }),
      ]),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "forced_movement",
          targetParticipantId: "participant-target",
          mode: "push",
          distanceMovedFt: 10,
          movementCostFt: 0,
          provokesOpportunityAttack: false,
          path: [
            { x: 2, y: 1 },
            { x: 3, y: 1 },
            { x: 4, y: 1 },
          ],
        }),
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith("session-1", {
      turnLogId: "turn-log-1",
    });
    expect(result.pendingReaction).toBeNull();
  });

  it("triggers ready actions when forced movement moves a creature into range", async () => {
    const { service, prisma, sessionsService, turnLogsService, realtimeEvents } = createService();
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      turnOrder: 1,
      isHostile: true,
    });
    const origin = createParticipant({
      id: "participant-origin",
      sessionCharacterId: "session-character-1",
      tokenId: "token-origin",
      nameSnapshot: "Cleric",
      turnOrder: 2,
    });
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      tokenId: "token-reactor",
      nameSnapshot: "Archer",
      turnOrder: 3,
      isHostile: false,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: origin.id,
      participants: [target, origin, reactor],
    };
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "creature_enters_range", targetParticipantId: target.id, rangeFt: 5 },
      heldAction: { type: "attack", targetParticipantId: target.id },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-origin", sessionCharacterId: "session-character-1", x: 50, y: 50, size: 50, hidden: false },
        { id: "token-target", x: 100, y: 50, size: 50, hidden: false },
        {
          id: "token-reactor",
          sessionCharacterId: "session-character-reactor",
          x: 250,
          y: 50,
          size: 50,
          hidden: false,
        },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.forceMoveParticipant("host-user", "session-1", {
      participantId: "participant-target",
      mode: "push",
      origin: { x: 50, y: 50 },
      distanceFt: 10,
    });

    expect(result.pendingReaction).toEqual(
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        reactorName: "Archer",
        moverParticipantId: target.id,
        moverName: "Skeleton",
      }),
    );
    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    ]);
    expect(result.message).toContain("준비행동 1개가 발동 대기 중입니다.");
    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(updateCall.where).toEqual({ sessionScenarioId: "session-scenario-1" });
    const updatedFlags = JSON.parse(updateCall.data.flagsJson);
    expect(updatedFlags[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(updatedFlags[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingReadyAction,
        status: "pending_response",
      }),
    ]);
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "reactor-user",
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    );
  });

  it("does not prompt opportunity attacks when the mover has disengaged", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents } = createService();
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      tokenId: "token-reactor",
      nameSnapshot: "Fighter",
      isHostile: false,
      turnOrder: 1,
    });
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      tokenId: "token-mover",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      conditionsJson: JSON.stringify(["combat:disengage"]),
      turnOrder: 2,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [reactor, mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-reactor", sessionCharacterId: "session-character-reactor", x: 50, y: 50, size: 50, hidden: false },
        { id: "token-mover", x: 100, y: 50, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-reactor",
      userId: "reactor-user",
      character: { ownerUserId: "reactor-user" },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0, reactionUsed: false });

    const result = await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 200, y: 50 },
    });

    expect(result.pendingReaction).toBeNull();
    expect(realtimeEvents.emitCombatReactionPrompt).not.toHaveBeenCalled();
    expect(actionEconomy.getOrCreateTurnState).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: mover.id,
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: null,
    });
    expect(actionEconomy.getOrCreateTurnState).not.toHaveBeenCalledWith(
      expect.objectContaining({
        combatParticipantId: reactor.id,
      }),
    );
  });

  it("charges extra movement when entering difficult terrain", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: "session-character-1",
      tokenId: "token-mover",
      nameSnapshot: "Scout",
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.difficult:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: { ownerUserId: "user-1", speed: 30 },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });

    const result = await service.moveParticipant("user-1", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(result.movementDistanceFt).toBe(5);
    expect(result.movementCostFt).toBe(10);
    expect(prisma.combatTurnState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { movementFtSpent: { increment: 10 } },
      }),
    );
  });

  it("charges extra movement when terrain effect is stored in the terrainEffectId field", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: "session-character-1",
      tokenId: "token-mover",
      nameSnapshot: "Scout",
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        {
          id: "terrain-cell-1",
          terrainEffectId: "terrain.difficult",
          x: 50,
          y: 0,
          width: 50,
          height: 50,
        },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: { ownerUserId: "user-1", speed: 30 },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });

    const result = await service.moveParticipant("user-1", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(result.movementDistanceFt).toBe(5);
    expect(result.movementCostFt).toBe(10);
  });

  it("applies terrain effects when normal movement enters hazardous terrain", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, realtimeEvents } = createService();
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      tokenId: "token-mover",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Scout",
      currentHp: 20,
      maxHp: 20,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      });

    const result = await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(result.message).toBe(
      "Scout 이동: 5ft / 지형 피해 4 / 지형 상태 condition.poisoned",
    );
    expect(result.terrainEffects).toEqual({
      trigger: "on_enter",
      damageTotal: 4,
      damagePackets: [
        {
          sourceEffectId: "terrain.poison_cloud",
          damageType: "poison",
          expression: "1d6",
          total: 4,
        },
      ],
      appliedConditionTags: ["condition.poisoned"],
      removedConditionTags: [],
      concentrationMaintained: null,
    });
    expect(result.movementDistanceFt).toBe(5);
    expect(result.movementCostFt).toBe(5);
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: { currentHp: 16, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: {
        conditionsJson: JSON.stringify([
          {
            conditionId: "condition.poisoned",
            sourceId: "terrain.poison_cloud",
            duration: { type: "permanent" },
            saveEnds: { ability: "con", dc: 13 },
            stackPolicy: "ignore_duplicate",
            appliedAtRound: 1,
            expiresAtTurn: null,
            tags: ["trigger:on_enter", "trigger:on_turn_start", "trigger:on_exit", "save:con", "damage:poison", "condition:poisoned", "condition_ends:on_exit"],
          },
        ]),
      },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 4 }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d6", total: 4 }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("skips poison cloud damage and condition when the terrain saving throw succeeds", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, realtimeEvents } = createService();
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: "session-character-mover",
      tokenId: "token-mover",
      nameSnapshot: "Scout",
      currentHp: 20,
      maxHp: 20,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", sessionCharacterId: "session-character-mover", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-mover",
      userId: "user-1",
      conditionsJson: "[]",
      character: {
        ownerUserId: "user-1",
        abilitiesJson: JSON.stringify({ con: 14 }),
        proficiencyBonus: 2,
      },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+2",
      rolls: [13],
      modifier: 2,
      total: 15,
      advantageState: "NORMAL",
    });

    const result = await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(diceService.roll).toHaveBeenCalledWith("1d20+2");
    expect(diceService.roll).not.toHaveBeenCalledWith("1d6");
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith({
      where: { id: mover.id },
      data: { currentHp: expect.any(Number), isAlive: expect.any(Boolean) },
    });
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith({
      where: { id: mover.id },
      data: expect.objectContaining({ conditionsJson: expect.any(String) }),
    });
    expect(result.message).toBe("Scout 이동: 5ft");
    expect(result.pendingReaction).toBeNull();
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+2", total: 15 }),
    );
  });

  it("removes only poison-cloud conditions when movement exits that terrain", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const poisonCloudCondition = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: { ability: "con", dc: 13 },
      stackPolicy: "ignore_duplicate",
      appliedAtRound: 1,
      expiresAtTurn: null,
      tags: [
        "trigger:on_enter",
        "trigger:on_turn_start",
        "trigger:on_exit",
        "save:con",
        "damage:poison",
        "condition:poisoned",
        "condition_ends:on_exit",
      ],
    };
    const unrelatedPoison = {
      conditionId: "condition.poisoned",
      sourceId: "monster.sting",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: 1,
      expiresAtTurn: null,
      tags: [],
    };
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      tokenId: "token-mover",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Scout",
      conditionsJson: JSON.stringify([poisonCloudCondition, unrelatedPoison]),
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [{ id: "token-mover", x: 50, y: 0, size: 50, hidden: false }],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });

    const result = await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 100, y: 0 },
    });

    expect(result.message).toContain("지형 이탈 해제 condition.poisoned");
    expect(result.terrainEffects).toMatchObject({
      trigger: "on_exit",
      removedConditionTags: ["condition.poisoned"],
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: { conditionsJson: JSON.stringify([unrelatedPoison]) },
    });
    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
  });

  it("resolves concentration checks when terrain movement deals damage", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, realtimeEvents } = createService();
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: 1,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "monster.sting",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      tokenId: "token-mover",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Scout",
      currentHp: 20,
      maxHp: 20,
      speedFt: 30,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });

    await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(diceService.roll).toHaveBeenNthCalledWith(1, "1d20+0");
    expect(diceService.roll).toHaveBeenNthCalledWith(2, "1d6");
    expect(diceService.roll).toHaveBeenNthCalledWith(3, "1d20+0");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: { currentHp: 16, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: { conditionsJson: JSON.stringify([unrelated]) },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 4 }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d6", total: 4 }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 5 }),
    );
  });

  it("applies entered terrain effects after forced movement", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents, turnLogsService } = createService();
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      turnOrder: 1,
      isHostile: true,
    });
    const origin = createParticipant({
      id: "participant-origin",
      sessionCharacterId: "session-character-1",
      tokenId: "token-origin",
      nameSnapshot: "Cleric",
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: origin.id,
      participants: [target, origin],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-origin", sessionCharacterId: "session-character-1", x: 50, y: 50, size: 50, hidden: false },
        { id: "token-target", x: 100, y: 50, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.poison_cloud:cell-1", x: 150, y: 50, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: "NORMAL",
      });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.forceMoveParticipant("host-user", "session-1", {
      participantId: "participant-target",
      mode: "push",
      origin: { x: 50, y: 50 },
      distanceFt: 10,
    });

    expect(result.message).toContain("지형 피해 4");
    expect(result.terrainEffects).toMatchObject({
      trigger: "on_enter",
      damageTotal: 4,
      damagePackets: [
        {
          sourceEffectId: "terrain.poison_cloud",
          damageType: "poison",
          total: 4,
        },
      ],
      appliedConditionTags: ["condition.poisoned"],
    });
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "1d20+0");
    expect(diceService.roll).toHaveBeenNthCalledWith(2, "1d6");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-target" },
      data: { currentHp: 16, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-target" },
      data: {
        conditionsJson: JSON.stringify([
          {
            conditionId: "condition.poisoned",
            sourceId: "terrain.poison_cloud",
            duration: { type: "permanent" },
            saveEnds: { ability: "con", dc: 13 },
            stackPolicy: "ignore_duplicate",
            appliedAtRound: 1,
            expiresAtTurn: null,
            tags: ["trigger:on_enter", "trigger:on_turn_start", "trigger:on_exit", "save:con", "damage:poison", "condition:poisoned", "condition_ends:on_exit"],
          },
        ]),
      },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "forced_movement",
          enteredHazards: [
            { point: { x: 3, y: 1 }, terrainEffectId: "terrain.poison_cloud" },
          ],
          terrainEffectApplication: expect.objectContaining({
            saveRolls: [
              {
                expression: "1d20+0",
                rolls: [4],
                modifier: 0,
                total: 4,
                advantageState: "NORMAL",
              },
            ],
            damageRoll: {
              expression: "1d6",
              rolls: [4],
              modifier: 0,
              total: 4,
              advantageState: "NORMAL",
            },
            appliedConditionTags: ["condition.poisoned"],
            concentrationCheck: null,
          }),
        }),
        diceResult: {
          expression: "1d6",
          rolls: [4],
          modifier: 0,
          total: 4,
          advantageState: "NORMAL",
        },
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith("session-1", {
      expression: "1d6",
      rolls: [4],
      modifier: 0,
      total: 4,
      advantageState: "NORMAL",
    });
  });

  it("applies structured condition turn-end lifecycle without rewriting legacy string conditions", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const currentConditions = JSON.stringify([
      "combat:hidden",
      {
        conditionId: "condition.burning",
        sourceId: "terrain.fire",
        duration: { type: "rounds", remaining: 2 },
        tags: ["damage_over_time:fire"],
      },
      {
        conditionId: "condition.stunned",
        sourceId: "spell.stunning_strike",
        duration: { type: "rounds", remaining: 1 },
      },
    ]);
    const current = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      turnOrder: 1,
      conditionsJson: currentConditions,
    });
    const next = createParticipant({
      id: "participant-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      turnOrder: 2,
      conditionsJson: JSON.stringify([
        "combat:dodge",
        {
          conditionId: "condition.poisoned",
          sourceId: "trap-1",
          duration: { type: "permanent" },
        },
      ]),
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
      combatParticipant: { update: jest.fn() },
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
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique
      .mockResolvedValueOnce({
        id: "session-character-1",
        character: { ownerUserId: "user-1" },
      })
      .mockResolvedValueOnce({ conditionsJson: currentConditions });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.endTurn("user-1", "session-1", {});

    const updateCall = prisma.combatParticipant.update.mock.calls.find(
      ([call]) => call.where.id === "participant-1" && call.data.conditionsJson,
    )?.[0];
    if (!updateCall) {
      throw new Error("Expected participant condition update.");
    }
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { conditionsJson: updateCall.data.conditionsJson },
    });
    expect(JSON.parse(updateCall.data.conditionsJson)).toEqual([
      "combat:hidden",
      expect.objectContaining({
        conditionId: "condition.burning",
        sourceId: "terrain.fire",
        duration: { type: "rounds", remaining: 1 },
        tags: ["damage_over_time:fire"],
      }),
    ]);
    const nextUpdateCall = prisma.combatParticipant.update.mock.calls.find(
      ([call]) => call.where.id === "participant-2" && call.data.conditionsJson,
    )?.[0];
    if (!nextUpdateCall) {
      throw new Error("Expected next participant dodge removal update.");
    }
    expect(JSON.parse(nextUpdateCall.data.conditionsJson)).toEqual([
      expect.objectContaining({
        conditionId: "condition.poisoned",
        sourceId: "trap-1",
        duration: { type: "permanent" },
      }),
    ]);
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("applies terrain burning damage through the common finalizer at turn end", async () => {
    const {
      service,
      prisma,
      sessionsService,
      actionEconomy,
      diceService,
      realtimeEvents,
      turnLogsService,
    } = createService();
    const burning = {
      conditionId: "condition.burning",
      sourceId: "terrain.burning",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: 1,
      expiresAtTurn: null,
      tags: [
        "trigger:on_enter",
        "trigger:on_turn_start",
        "trigger:on_turn_end",
        "damage:fire",
        "damage_over_time:fire:1d6",
        "condition:burning",
      ],
    };
    const current = createParticipant({
      id: "participant-burning",
      sessionCharacterId: null,
      tokenId: "token-burning",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Burning Cultist",
      currentHp: 20,
      maxHp: 20,
      turnOrder: 1,
      isHostile: true,
      conditionsJson: JSON.stringify([burning]),
    });
    const next = createParticipant({
      id: "participant-next",
      sessionCharacterId: "session-character-next",
      nameSnapshot: "Hero",
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
    const updatedCombat = {
      ...combat,
      currentParticipantId: next.id,
      turnNo: 2,
      participants: [current, next],
    };
    const tx = {
      combatParticipant: { update: jest.fn() },
      combat: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedCombat),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    actionEconomy.getOrCreateTurnState.mockResolvedValue({});
    turnLogsService.createTurnLog.mockResolvedValue({
      turnLogId: "turn-log-terrain-lifecycle",
    });
    diceService.roll.mockReturnValueOnce({
      expression: "1d6",
      rolls: [4],
      modifier: 0,
      total: 4,
      advantageState: "NORMAL",
    });

    const result = await service.endTurn("host-user", "session-1", { force: true });

    expect(result.message).toContain("턴 종료: 지형 피해 4");
    expect(result.turnEndTerrainEffects).toMatchObject({
      trigger: "on_turn_end",
      damageTotal: 4,
      damagePackets: [
        {
          sourceEffectId: "terrain.burning",
          damageType: "fire",
          expression: "1d6",
          total: 4,
        },
      ],
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: { currentHp: 16, isAlive: true },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d6", total: 4 }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "turn_terrain_lifecycle",
          turnEndTerrainEffects: expect.objectContaining({
            trigger: "on_turn_end",
            damageTotal: 4,
          }),
        }),
        narration: expect.stringContaining("턴 종료: 지형 피해 4"),
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { turnLogId: "turn-log-terrain-lifecycle" },
    );
  });

  it("removes expired pending ready actions when a turn ends", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
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
    const expiredReadyAction = {
      id: "reaction:ready:participant-1:1:1",
      type: "ready_action",
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "creature_enters_range" },
      heldAction: { type: "attack" },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 1,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const remainingReadyAction = {
      ...expiredReadyAction,
      id: "reaction:ready:participant-2:1:1",
      actorParticipantId: "participant-2",
      actorUserId: "user-2",
      expiresAtRound: 2,
      expiresAtTurn: 1,
    };
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
      combatParticipant: { update: jest.fn() },
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
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [expiredReadyAction, remainingReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.endTurn("user-1", "session-1", {});

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [remainingReadyAction],
        }),
      },
    });
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("triggers turn-end and turn-start ready actions before continuing the next turn", async () => {
    const { service, prisma, sessionsService, realtimeEvents, turnLogsService } = createService();
    const current = createParticipant({
      id: "participant-current",
      sessionCharacterId: "session-character-current",
      nameSnapshot: "Fighter",
      turnOrder: 1,
    });
    const next = createParticipant({
      id: "participant-next",
      sessionCharacterId: "session-character-next",
      nameSnapshot: "Wizard",
      turnOrder: 2,
    });
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      nameSnapshot: "Rogue",
      turnOrder: 3,
    });
    const turnEndReactor = createParticipant({
      id: "participant-turn-end-reactor",
      sessionCharacterId: "session-character-turn-end-reactor",
      nameSnapshot: "Ranger",
      turnOrder: 4,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "turn_start", targetParticipantId: next.id },
      heldAction: { type: "custom", description: "Release the rope." },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const pendingTurnEndReadyAction = {
      ...pendingReadyAction,
      id: "reaction:ready:participant-turn-end-reactor:1:1",
      actorParticipantId: turnEndReactor.id,
      actorUserId: "turn-end-reactor-user",
      trigger: { type: "turn_end", targetParticipantId: current.id },
      heldAction: { type: "custom", description: "Close the gate." },
      expiresAtRound: 1,
      expiresAtTurn: 1,
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: current.id,
      participants: [current, next, reactor, turnEndReactor],
    };
    const updatedCombat = {
      ...combat,
      currentParticipantId: next.id,
      turnNo: 2,
    };
    const tx = {
      combatParticipant: { update: jest.fn() },
      combat: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedCombat),
      },
    };
    let flagsJson = JSON.stringify({
      [PENDING_READY_ACTIONS_FLAG]: [pendingTurnEndReadyAction, pendingReadyAction],
    });

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockImplementation(async () => ({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson, currentNodeId: null },
    }));
    sessionsService.getVttMapForUser.mockResolvedValue({ tokens: [] });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.gameState.update.mockImplementation(async ({ data }) => {
      flagsJson = data.flagsJson;
      return {};
    });
    prisma.combat.findFirst.mockResolvedValueOnce(combat).mockResolvedValue(updatedCombat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: current.sessionCharacterId,
      character: { ownerUserId: "user-1" },
    });
    prisma.sessionCharacterResource.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-ready-start" });

    const result = await service.endTurn("user-1", "session-1", {});

    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: turnEndReactor.id,
        moverParticipantId: current.id,
      }),
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: next.id,
      }),
    ]);
    expect(result.message).toContain("준비행동 2개가 발동 대기 중입니다.");
    const updatedFlags = JSON.parse(flagsJson);
    expect(updatedFlags[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(updatedFlags[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingTurnEndReadyAction,
        triggerEvent: expect.objectContaining({
          type: "turn_end",
          targetParticipantId: current.id,
          roundNo: 1,
          turnNo: 1,
        }),
      }),
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingReadyAction,
        triggerEvent: expect.objectContaining({
          type: "turn_start",
          targetParticipantId: next.id,
        }),
      }),
    ]);
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "turn-end-reactor-user",
      expect.objectContaining({
        reactorParticipantId: turnEndReactor.id,
        moverParticipantId: current.id,
      }),
    );
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "reactor-user",
      expect.objectContaining({
        reactorParticipantId: reactor.id,
        moverParticipantId: next.id,
      }),
    );
  });

  it("moves triggered ready actions from pending state into triggered state on movement", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      isHostile: false,
    });
    const mover = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      isHostile: true,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-1:1:1",
      type: "ready_action",
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 30 },
      heldAction: { type: "attack", targetParticipantId: "monster-1" },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };

    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });

    const triggeredResult = await (service as unknown as {
      resolveReadyActionsForMovement(params: unknown): Promise<{
        count: number;
        prompts: CombatReactionPromptDto[];
      }>;
    }).resolveReadyActionsForMovement({
      sessionId: "session-1",
      combat: {
        id: "combat-1",
        sessionId: "session-1",
        status: PrismaCombatStatus.ACTIVE,
        roundNo: 1,
        turnNo: 2,
        currentParticipantId: mover.id,
        participants: [reactor, mover],
      },
      mover,
      map: {
        id: "map-1",
        gridType: "square",
        gridSize: 50,
        width: 500,
        height: 500,
        tokens: [
          { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
          { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
        ],
        fogRects: [],
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
      nextMoverToken: { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
    });

    expect(triggeredResult.count).toBe(1);
    expect(triggeredResult.prompts).toEqual([
      expect.objectContaining({
        id: "triggered:reaction:ready:participant-1:1:1:1:2",
        type: "ready_action",
        reactorParticipantId: "participant-1",
        moverParticipantId: "monster-1",
        message: "Hero의 준비행동 조건이 충족되었습니다. 실행할까요?",
      }),
    ]);
    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(updateCall.where).toEqual({ sessionScenarioId: "session-scenario-1" });
    const updatedFlags = JSON.parse(updateCall.data.flagsJson);
    expect(updatedFlags[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(updatedFlags[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingReadyAction,
        status: "pending_response",
      }),
    ]);
    expect(realtimeEvents.emitSystemMessage).toHaveBeenCalledWith(
      "session-1",
      "READY_ACTION_TRIGGERED",
      "준비행동 1개가 발동 대기 중입니다.",
    );
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "user-1",
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: "participant-1",
        moverParticipantId: "monster-1",
        message: "Hero의 준비행동 조건이 충족되었습니다. 실행할까요?",
      }),
    );
  });

  it("removes incapacitated ready actors without emitting movement prompts", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const reactor = createParticipant({
      id: "participant-reactor",
      tokenId: "token-reactor",
      sessionCharacterId: "session-character-reactor",
      conditionsJson: JSON.stringify(["condition:stunned"]),
    });
    const mover = createParticipant({
      id: "participant-mover",
      tokenId: "token-mover",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      isHostile: true,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "creature_enters_range", targetParticipantId: mover.id, rangeFt: 30 },
      heldAction: { type: "attack", targetParticipantId: mover.id },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };

    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });

    const result = await (service as unknown as {
      resolveReadyActionsForMovement(params: unknown): Promise<{
        count: number;
        prompts: CombatReactionPromptDto[];
      }>;
    }).resolveReadyActionsForMovement({
      sessionId: "session-1",
      combat: {
        id: "combat-1",
        sessionId: "session-1",
        status: PrismaCombatStatus.ACTIVE,
        roundNo: 1,
        turnNo: 2,
        currentParticipantId: mover.id,
        participants: [reactor, mover],
      },
      mover,
      map: {
        id: "map-1",
        gridType: "square",
        gridSize: 50,
        width: 500,
        height: 500,
        tokens: [
          { id: "token-reactor", sessionCharacterId: reactor.sessionCharacterId, x: 0, y: 0, size: 50, hidden: false },
          { id: "token-mover", x: 100, y: 0, size: 50, hidden: false },
        ],
        fogRects: [],
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
      nextMoverToken: { id: "token-mover", x: 100, y: 0, size: 50, hidden: false },
    });

    expect(result).toEqual({ count: 0, prompts: [] });
    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(JSON.parse(updateCall.data.flagsJson)[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(realtimeEvents.emitCombatReactionPrompt).not.toHaveBeenCalled();
    expect(realtimeEvents.emitSystemMessage).not.toHaveBeenCalled();
  });

  it("declines triggered ready actions and removes them from triggered state", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Hero",
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-1:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-1:1:1",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "creature_enters_range" },
        heldAction: { type: "attack" },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: { type: "creature_enters_range", roundNo: 1, turnNo: 2 },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "monster-1",
      participants: [reactor],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);

    const result = await service.declineReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(JSON.parse(updateCall.data.flagsJson)[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([]);
    expect(result.message).toBe("Hero이(가) 준비행동을 취소했습니다.");
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("accepts triggered custom ready actions and spends the actor reaction", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents, turnLogsService } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Hero",
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-1:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-1:1:1",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "manual" },
        heldAction: { type: "custom", description: "Pull the lever." },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: { type: "manual", roundNo: 1, turnNo: 2 },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "monster-1",
      participants: [reactor],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.acceptReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    expect(actionEconomy.spendReaction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-1",
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({ type: "ready_action_execute" }),
        narration: "Pull the lever.",
      }),
    );
    expect(result.message).toBe("Pull the lever.");
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith("session-1", {
      turnLogId: "turn-log-1",
    });
  });

  it("cancels an already triggered ready action when the actor becomes incapacitated", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents, turnLogsService } = createService();
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      nameSnapshot: "Hero",
      conditionsJson: JSON.stringify(["condition:stunned"]),
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-reactor:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-reactor:1:1",
        type: "ready_action",
        actorParticipantId: reactor.id,
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "turn_start" },
        heldAction: { type: "custom", description: "Pull the lever." },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: { type: "turn_start", roundNo: 1, turnNo: 2 },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "participant-monster",
      participants: [reactor],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({ tokens: [] });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);

    const result = await service.acceptReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    expect(result.message).toBe("Hero은(는) 행동할 수 없어 준비행동이 취소되었습니다.");
    expect(actionEconomy.spendReaction).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("accepts triggered move ready actions through the combat movement path", async () => {
    const { service, prisma, sessionsService, actionEconomy, turnLogsService, realtimeEvents } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Scout",
    });
    const mover = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      isHostile: true,
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-1:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-1:1:1",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 30 },
        heldAction: { type: "move", targetPoint: { x: 100, y: 0 } },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        roundNo: 1,
        turnNo: 2,
      },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "monster-1",
      participants: [reactor, mover],
    };
    const map = {
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 150, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findMany.mockResolvedValue([]);
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.acceptReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    expect(actionEconomy.spendReaction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-1",
    });
    expect(sessionsService.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        tokens: expect.arrayContaining([
          expect.objectContaining({ id: "token-1", x: 100, y: 0 }),
        ]),
      }),
    );
    expect(prisma.combatTurnState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { movementFtSpent: { increment: 10 } },
      }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "ready_action_execute",
          movementDistanceFt: 10,
          movementCostFt: 10,
        }),
      }),
    );
    expect(result.message).toBe("Scout 이동: 10ft");
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith("session-1", {
      turnLogId: "turn-log-1",
    });
  });

  it("accepts triggered Fire Bolt ready actions through the reaction attack path", async () => {
    const { service, prisma, sessionsService } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      isHostile: true,
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-1:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-1:1:1",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 120 },
        heldAction: {
          type: "cast_spell",
          spellId: "spell.fire_bolt",
          targetParticipantId: "monster-1",
        },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        roundNo: 1,
        turnNo: 2,
      },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "monster-1",
      participants: [reactor, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      character: {
        className: "Wizard",
        spellsJson: JSON.stringify({ cantrips: ["spell.fire_bolt"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 2,
        level: 5,
      },
    });
    const resolveAttack = jest.spyOn(service, "resolveAttack").mockResolvedValue({
      combat: { id: "combat-1" },
      message: "Wizard 준비 주문 Fire Bolt 명중",
      attackTotal: 17,
      damageTotal: 8,
    } as never);

    const result = await service.acceptReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    expect(resolveAttack).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        attackerParticipantId: "participant-1",
        targetParticipantId: "monster-1",
        attackBonus: 5,
        damageDice: "2d10",
      }),
      expect.objectContaining({
        actionCost: "reaction",
        reactionUserId: "user-1",
      }),
    );
    expect(result.message).toBe("Wizard 준비 주문 Fire Bolt 명중");
  });

  it("accepts triggered Magic Missile ready actions with reaction and spell slot costs", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } = createService();
    const reactor = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
    });
    const triggeredReadyAction = {
      id: "triggered:reaction:ready:participant-1:1:1:1:2",
      type: "triggered_ready_action",
      pending: {
        id: "reaction:ready:participant-1:1:1",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 120 },
        heldAction: {
          type: "cast_spell",
          spellId: "spell.magic_missile",
          targetParticipantId: "monster-1",
        },
        originalCost: "action",
        consumesReaction: true,
        expiresAtRound: 2,
        expiresAtTurn: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      triggeredAtRound: 1,
      triggeredAtTurn: 2,
      triggerEvent: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        roundNo: 1,
        turnNo: 2,
      },
      status: "pending_response",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: "monster-1",
      participants: [reactor, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [triggeredReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.magic_missile"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 2,
        level: 5,
      },
    });
    diceService.roll
      .mockReturnValueOnce({
        expression: "3d4+3",
        rolls: [2, 3, 4],
        modifier: 3,
        total: 12,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.acceptReaction("user-1", "session-1", {
      reactionId: triggeredReadyAction.id,
    });

    expect(actionEconomy.spendReaction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 2,
      sessionCharacterId: "session-character-1",
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "monster-1" },
      data: { currentHp: 8, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "monster-1" },
      data: { conditionsJson: JSON.stringify([unrelated]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "ready_action_execute",
          spellId: "spell.magic_missile",
          damageTotal: 12,
          concentrationCheck: expect.objectContaining({
            concentrationMaintained: false,
            removedConditions: expect.arrayContaining([
              expect.objectContaining({ conditionId: concentration.conditionId }),
              expect.objectContaining({ conditionId: linked.conditionId }),
            ]),
          }),
        }),
        diceResult: expect.objectContaining({ total: 12 }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith("session-1", expect.objectContaining({ total: 12 }));
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith("session-1", expect.objectContaining({ total: 5 }));
    expect(result.message).toBe("Wizard 준비 주문 Magic Missile: Skeleton 12 역장 피해");
  });

  it("casts Chill Touch as a catalog-backed ranged cantrip attack", async () => {
    const { service, prisma, sessionsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ cantrips: ["spell.chill_touch"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    const resolveAttack = jest.spyOn(service, "resolveAttack").mockResolvedValue({
      combat: { id: "combat-1" },
      message: "Chill Touch 명중",
      attackTotal: 18,
      damageTotal: 9,
    } as never);

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.chill_touch",
      targetParticipantIds: ["monster-1"],
    });

    expect(resolveAttack).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        attackerParticipantId: "participant-1",
        targetParticipantId: "monster-1",
        attackBonus: 6,
        damageDice: "2d8",
        damageBonus: 0,
      }),
      expect.objectContaining({ messagePrefix: "Chill Touch", spellId: "spell.chill_touch" }),
    );
    expect(result.message).toBe("Chill Touch 명중");
  });

  it("casts Ray of Frost with a one-round movement speed penalty", async () => {
    const { service, prisma, sessionsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    sessionsService.getSessionEntityOrThrow.mockResolvedValue({ id: "session-1", hostUserId: "host-user" });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ cantrips: ["spell.ray_of_frost"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    const resolveAttack = jest.spyOn(service, "resolveAttack").mockResolvedValue({
      combat: { id: "combat-1" },
      message: "Ray of Frost 명중",
      attackTotal: 18,
      damageTotal: 9,
    } as never);

    await service.castSpell("user-1", "session-1", {
      spellId: "spell.ray_of_frost",
      targetParticipantIds: ["monster-1"],
    });

    expect(resolveAttack).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      expect.objectContaining({
        targetParticipantId: "monster-1",
        damageDice: "2d8",
      }),
      expect.objectContaining({
        messagePrefix: "Ray of Frost",
        onHitCondition: expect.objectContaining({
          conditionId: "condition.spell.ray_of_frost",
          duration: { type: "rounds", remaining: 1 },
          tags: ["movement_speed_penalty:10"],
        }),
      }),
    );
  });

  it("resolves each upcast Scorching Ray as a separate spell attack", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Ogre",
      currentHp: 40,
      maxHp: 40,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "3": 1 },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.scorching_ray"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    const resolveAttack = jest.spyOn(service, "resolveAttack").mockResolvedValue({
      combat: {
        combatId: "combat-1",
        status: "ACTIVE",
      },
      message: "Scorching Ray 명중",
      attackTotal: 18,
      damageTotal: 7,
      turnLogId: "ray-log",
    } as never);

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.scorching_ray",
      slotLevel: 3,
      targetParticipantIds: ["monster-1"],
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledTimes(1);
    expect(resolveAttack).toHaveBeenCalledTimes(4);
    expect(resolveAttack).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "session-1",
      expect.objectContaining({
        targetParticipantId: "monster-1",
        damageDice: "2d6",
      }),
      expect.objectContaining({
        actionCost: "none",
        spellId: "spell.scorching_ray",
        auditMetadata: {
          baseSpellLevel: 2,
          slotLevel: 3,
          rayIndex: 1,
          rayCount: 4,
        },
        shieldContinuation: expect.objectContaining({
          type: "scorching_ray",
          remainingTargetParticipantIds: [
            "monster-1",
            "monster-1",
            "monster-1",
          ],
        }),
      }),
    );
    expect(result.damageTotal).toBe(28);
  });

  it("upcasts combat Magic Missile with the requested spell slot level", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const gameState = {
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "3": 2 },
          },
        }),
        currentNodeId: null,
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue(gameState);
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.magic_missile"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    diceService.roll
      .mockReturnValueOnce({ expression: "1d4+1", rolls: [1], modifier: 1, total: 2, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d4+1", rolls: [2], modifier: 1, total: 3, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d4+1", rolls: [3], modifier: 1, total: 4, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d4+1", rolls: [4], modifier: 1, total: 5, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d4+1", rolls: [1], modifier: 1, total: 2, advantageState: "NORMAL" });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.magic_missile",
      slotLevel: 3,
      targetParticipantIds: ["monster-1"],
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: "session-character-1",
    });
    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "3": 1 },
          },
        }),
      },
    });
    expect(diceService.roll).toHaveBeenCalledTimes(5);
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "1d4+1");
    expect(diceService.roll).toHaveBeenNthCalledWith(5, "1d4+1");
    expect(prisma.combatParticipant.update).toHaveBeenLastCalledWith({
      where: { id: "monster-1" },
      data: { currentHp: 4, isAlive: true },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "spell_cast",
          spellId: "spell.magic_missile",
          baseSpellLevel: 1,
          slotLevel: 3,
          spellScaling: expect.objectContaining({
            targetCount: 5,
            slotLevelsAboveBase: 2,
          }),
        }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledTimes(5);
    expect(result.message).toBe("Magic Missile: Skeleton 2, Skeleton 3, Skeleton 4, Skeleton 5, Skeleton 2 역장 피해");
    expect(result.damageTotal).toBe(16);
  });

  it("rejects Magic Missile before spending resources when the target has full cover", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "1": 2 },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 200,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      wallCells: [{ x: 50, y: 0, width: 50, height: 50 }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.magic_missile"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });

    await expect(
      service.castSpell("user-1", "session-1", {
        spellId: "spell.magic_missile",
        slotLevel: 1,
        targetParticipantIds: ["monster-1"],
      }),
    ).rejects.toMatchObject({
      data: { reason: "TARGET_HAS_FULL_COVER" },
    });

    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(prisma.gameState.update).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(prisma.combatParticipant.update).not.toHaveBeenCalled();
  });

  it("casts Cure Wounds as a catalog-backed touch healing spell", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Cleric",
    });
    const ally = createParticipant({
      id: "participant-2",
      tokenId: "token-2",
      sessionCharacterId: "session-character-2",
      nameSnapshot: "Fighter",
      currentHp: 4,
      maxHp: 18,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, ally],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", sessionCharacterId: "session-character-2", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "2": 1 },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique
      .mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === "session-character-1" ? {
        id: "session-character-1",
        userId: "user-1",
        character: {
          ownerUserId: "user-1",
          className: "Cleric",
          spellsJson: JSON.stringify({
            spells: ["spell.cure_wounds"],
            preparedSpells: ["spell.cure_wounds"],
          }),
          abilitiesJson: JSON.stringify({ wis: 16 }),
          proficiencyBonus: 3,
          level: 3,
        },
      } : where.id === "session-character-2" ? {
        id: "session-character-2",
        currentHp: 4,
        tempHp: 0,
        conditionsJson: "[]",
        character: {
          maxHp: 18,
          featuresJson: "[]",
        },
      } : null));
    diceService.roll.mockReturnValueOnce({
      expression: "2d8+3",
      rolls: [6, 5],
      modifier: 3,
      total: 14,
      advantageState: "NORMAL",
    });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.cure_wounds",
      slotLevel: 2,
      targetParticipantIds: ["participant-2"],
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: "session-character-1",
    });
    expect(diceService.roll).toHaveBeenCalledWith("2d8+3");
    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "2": 0 },
          },
        }),
      },
    });
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-2" },
      data: { currentHp: 18 },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-2" },
      data: { currentHp: 18, isAlive: true },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "spell_cast",
          spellId: "spell.cure_wounds",
          baseSpellLevel: 1,
          slotLevel: 2,
          spellScaling: expect.objectContaining({
            damageDice: "2d8",
            slotLevelsAboveBase: 1,
          }),
          targetParticipantIds: ["participant-2"],
        }),
        diceResult: expect.objectContaining({ expression: "2d8+3", total: 14 }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith("session-1", expect.objectContaining({ total: 14 }));
    expect(result.message).toBe("Cure Wounds: Fighter 14 회복");
    expect(result.damageTotal).toBe(14);
  });

  it("excludes full-cover targets from combat Sleep before assigning the HP pool", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const visibleTarget = createParticipant({
      id: "monster-visible",
      tokenId: "token-visible",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      currentHp: 8,
      maxHp: 8,
      isHostile: true,
    });
    const fullCoverTarget = createParticipant({
      id: "monster-covered",
      tokenId: "token-covered",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Kobold",
      currentHp: 5,
      maxHp: 5,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, visibleTarget, fullCoverTarget],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 100, size: 50, hidden: false },
        { id: "token-visible", x: 0, y: 50, size: 50, hidden: false },
        { id: "token-covered", x: 100, y: 0, size: 50, hidden: false },
      ],
      wallCells: [{ x: 50, y: 0, width: 50, height: 50 }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "1": 1 },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.sleep"], preparedSpells: ["spell.sleep"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    diceService.roll.mockReturnValueOnce({
      expression: "5d8",
      rolls: [8],
      modifier: 0,
      total: 8,
      advantageState: "NORMAL",
    });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.sleep",
      slotLevel: 1,
      point: { x: 0, y: 0 },
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: "session-character-1",
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "monster-visible" },
      data: expect.objectContaining({
        conditionsJson: expect.stringContaining("combat:sleep"),
      }),
    });
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "monster-covered" },
      }),
    );
    expect(result.message).toBe("Sleep: 8 HP 분량으로 Goblin 수면");
  });

  it("exposes combat spell slot resources by spell level for the active caster", async () => {
    const { service, prisma, sessionsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "1": 3, "3": 1 },
          },
        }),
        currentNodeId: null,
      },
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        currentHp: 24,
        conditionsJson: "[]",
        character: {
          className: "Wizard",
          level: 5,
          maxHp: 24,
          armorClass: 12,
          speed: 30,
        },
      },
    ]);

    const result = await service.getCombat("user-1", "session-1");

    const resources = result.participants[0]?.actionResources as {
      spellSlots?: Record<string, { total: number; remaining: number }>;
    };
    expect(resources.spellSlots).toMatchObject({
      "1": { total: 4, remaining: 3 },
      "2": { total: 3, remaining: 3 },
      "3": { total: 2, remaining: 1 },
    });
  });

  it("projects pending triggered ready prompts in combat snapshots", async () => {
    const { service, prisma, sessionsService } = createService();
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      nameSnapshot: "Archer",
      tokenId: "token-reactor",
      isHostile: false,
    });
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Skeleton",
      tokenId: "token-mover",
      isHostile: true,
      turnOrder: 2,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "creature_enters_range", targetParticipantId: mover.id, rangeFt: 30 },
      heldAction: { type: "attack", targetParticipantId: mover.id },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 2,
      currentParticipantId: mover.id,
      participants: [reactor, mover],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [TRIGGERED_READY_ACTIONS_FLAG]: [
            {
              id: "triggered:reaction:ready:participant-reactor:1:1:1:2",
              type: "triggered_ready_action",
              pending: pendingReadyAction,
              triggeredAtRound: 1,
              triggeredAtTurn: 2,
              triggerEvent: {
                type: "creature_enters_range",
                targetParticipantId: mover.id,
                distanceFt: 20,
                roundNo: 1,
                turnNo: 2,
                tags: ["enemy"],
              },
              status: "pending_response",
              createdAt: "1970-01-01T00:00:01.000Z",
            },
          ],
        }),
        currentNodeId: null,
      },
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    const mappedSessionCharacter = {
      id: "session-character-reactor",
      currentHp: 10,
      conditionsJson: "[]",
      character: {
        className: "Fighter",
        level: 3,
        maxHp: 10,
        armorClass: 14,
        speed: 30,
      },
    };
    prisma.sessionCharacter.findMany
      .mockResolvedValueOnce([mappedSessionCharacter])
      .mockResolvedValue([
        {
          ...mappedSessionCharacter,
          conditionsJson: JSON.stringify(["condition:stunned"]),
        },
      ]);

    const result = await service.getCombat("user-1", "session-1");

    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        id: "triggered:reaction:ready:participant-reactor:1:1:1:2",
        type: "ready_action",
        reactorParticipantId: reactor.id,
        reactorName: "Archer",
        moverParticipantId: mover.id,
        moverName: "Skeleton",
      }),
    ]);

    const incapacitatedResult = await service.getCombat("user-1", "session-1");
    expect(incapacitatedResult.pendingReactions).toEqual([]);
  });

  it("projects structured concentration from the authoritative session character conditions", async () => {
    const { service, prisma, sessionsService } = createService();
    const caster = createParticipant({
      id: "participant-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
      conditionsJson: JSON.stringify(["condition.poisoned"]),
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: caster.id,
      participants: [caster],
    };
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "until_turn", round: 12, turn: 3 },
      stackPolicy: "replace",
      appliedAtRound: 2,
      expiresAtTurn: { round: 12, turn: 3 },
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
      hostUserId: "host-user",
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        currentHp: 24,
        conditionsJson: JSON.stringify([concentration]),
        character: {
          className: "Wizard",
          level: 5,
          maxHp: 24,
          armorClass: 12,
          speed: 30,
        },
      },
    ]);

    const result = await service.getCombat("user-1", "session-1");

    expect(result.participants[0]).toMatchObject({
      sessionEntityId: "participant-1",
      conditions: expect.arrayContaining([
        "condition.concentration",
        "concentration",
        "concentration:spell:spell.hold_person",
      ]),
      concentration: {
        spellId: "spell.hold_person",
        targetIds: ["target-1"],
        effectIds: ["effect-hold-1"],
        startedAtRound: 2,
        endsAtRound: 12,
        endsAtTurn: 3,
      },
    });
  });

  it("projects null concentration for participants without valid concentration state", async () => {
    const { service, prisma, sessionsService } = createService();
    const participant = createParticipant({
      id: "participant-1",
      sessionCharacterId: null,
      conditionsJson: "not-json",
    });

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
      hostUserId: "host-user",
    });
    prisma.combat.findFirst.mockResolvedValue({
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: participant.id,
      participants: [participant],
    });

    const result = await service.getCombat("user-1", "session-1");

    expect(result.participants[0]).toMatchObject({
      conditions: [],
      concentration: null,
    });
  });

  it("casts combat Fireball through AoE targeting, saves, scaling, and slot cost", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService, ruleEngine } =
      createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const targetA = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Ogre",
      currentHp: 40,
      maxHp: 40,
      isHostile: true,
    });
    const targetB = createParticipant({
      id: "monster-2",
      tokenId: "token-3",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, targetA, targetB],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 600,
      height: 400,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 250, y: 0, size: 50, hidden: false },
        { id: "token-3", x: 300, y: 0, size: 50, hidden: false },
      ],
      objectCells: [{ x: 200, y: 0, width: 50, height: 50 }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const gameState = {
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "4": 1 },
          },
        }),
        currentNodeId: null,
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue(gameState);
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.fireball"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 7,
      },
    });
    diceService.roll
      .mockReturnValueOnce({ expression: "9d6", rolls: [28], modifier: 0, total: 28, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d20", rolls: [10], modifier: 0, total: 10, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d20", rolls: [18], modifier: 0, total: 18, advantageState: "NORMAL" });
    ruleEngine.resolveSavingThrow.mockImplementation((input?: { naturalD20: number; difficultyClass: number }) => ({
      hookId: "hook.save.resolve",
      accepted: true,
      produced: {
        ability: "dex",
        naturalD20: input?.naturalD20 ?? 10,
        difficultyClass: input?.difficultyClass ?? 14,
        total: input?.naturalD20 ?? 10,
        success: input ? input.naturalD20 >= input.difficultyClass : false,
        advantageState: "normal",
        appliedModifiers: [],
      },
      statePatch: [],
      turnLogEvents: [],
      rejectedReason: null,
    }));
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.fireball",
      slotLevel: 4,
      point: { x: 150, y: 0 },
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: "participant-1",
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: "session-character-1",
    });
    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-1": { "4": 0 },
          },
        }),
      },
    });
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "9d6");
    expect(ruleEngine.resolveSavingThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        ability: "dex",
        bonusModifiers: [{ source: "cover:half:dex_save", value: 2 }],
      }),
    );
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "monster-1" },
      data: { currentHp: 12, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "monster-2" },
      data: { currentHp: 6, isAlive: true },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "spell_cast",
          spellId: "spell.fireball",
          baseSpellLevel: 3,
          slotLevel: 4,
          spellScaling: expect.objectContaining({
            damageDice: "9d6",
            slotLevelsAboveBase: 1,
          }),
          aoe: expect.objectContaining({
            shape: "sphere",
            sizeFt: 20,
            saveAbility: "dex",
            damageType: "fire",
          }),
        }),
        diceResult: expect.objectContaining({ expression: "9d6", total: 28 }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledTimes(3);
    expect(result.message).toBe("Fireball: Ogre 28, Goblin 14 화염 피해");
    expect(result.damageTotal).toBe(42);
  });

  it("casts upscaled Burning Hands through directional cone targeting", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService, ruleEngine } =
      createService();
    const caster = createParticipant({
      id: "participant-caster",
      tokenId: "token-caster",
      sessionCharacterId: "session-character-caster",
      nameSnapshot: "Wizard",
    });
    const targetA = createParticipant({
      id: "monster-a",
      tokenId: "token-a",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Cultist",
      currentHp: 30,
      maxHp: 30,
      isHostile: true,
    });
    const targetB = createParticipant({
      id: "monster-b",
      tokenId: "token-b",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const outsideTarget = createParticipant({
      id: "monster-outside",
      tokenId: "token-outside",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Scout",
      currentHp: 20,
      maxHp: 20,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, targetA, targetB, outsideTarget],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 400,
      height: 300,
      tokens: [
        { id: "token-caster", sessionCharacterId: caster.sessionCharacterId, x: 50, y: 100, size: 50, hidden: false },
        { id: "token-a", x: 100, y: 100, size: 50, hidden: false },
        { id: "token-b", x: 150, y: 150, size: 50, hidden: false },
        { id: "token-outside", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          spellSlotsBySessionCharacterId: {
            "session-character-caster": { "2": 1 },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-caster",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.burning_hands"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    diceService.roll
      .mockReturnValueOnce({ expression: "4d6", rolls: [18], modifier: 0, total: 18, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d20", rolls: [8], modifier: 0, total: 8, advantageState: "NORMAL" })
      .mockReturnValueOnce({ expression: "1d20", rolls: [17], modifier: 0, total: 17, advantageState: "NORMAL" });
    ruleEngine.resolveSavingThrow.mockImplementation((input?: { naturalD20: number; difficultyClass: number }) => ({
      hookId: "hook.save.resolve",
      accepted: true,
      produced: {
        ability: "dex",
        naturalD20: input?.naturalD20 ?? 10,
        difficultyClass: input?.difficultyClass ?? 14,
        total: input?.naturalD20 ?? 10,
        success: input ? input.naturalD20 >= input.difficultyClass : false,
        advantageState: "normal",
        appliedModifiers: [],
      },
      statePatch: [],
      turnLogEvents: [],
      rejectedReason: null,
    }));
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-burning-hands" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.burning_hands",
      slotLevel: 2,
      point: { x: 150, y: 100 },
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: combat.id,
      combatParticipantId: caster.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: caster.sessionCharacterId,
    });
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "4d6");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: targetA.id },
      data: { currentHp: 12, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: targetB.id },
      data: { currentHp: 11, isAlive: true },
    });
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: outsideTarget.id } }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          spellId: "spell.burning_hands",
          baseSpellLevel: 1,
          slotLevel: 2,
          spellScaling: expect.objectContaining({
            damageDice: "4d6",
            slotLevelsAboveBase: 1,
          }),
          aoe: expect.objectContaining({
            shape: "cone",
            sizeFt: 15,
            saveAbility: "dex",
            damageType: "fire",
            direction: "east",
          }),
        }),
      }),
    );
    expect(result.message).toBe("Burning Hands: Cultist 18, Goblin 9 화염 피해");
    expect(result.damageTotal).toBe(27);
  });

  it("rejects a prepared caster spell when it is known but not prepared", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService } =
      createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Ogre",
      currentHp: 40,
      maxHp: 40,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({
          cantrips: ["spell.fire_bolt"],
          spells: ["spell.magic_missile", "spell.fireball"],
          preparedSpells: ["spell.magic_missile"],
        }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 7,
      },
    });

    await expect(
      service.castSpell("user-1", "session-1", {
        spellId: "spell.fireball",
        point: { x: 250, y: 0 },
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: { reason: "SPELL_NOT_PREPARED", spellId: "spell.fireball" },
      },
    });
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
  });

  it("rejects an unlearned wizard cantrip even when prepared spells are not initialized", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService } =
      createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const target = createParticipant({
      id: "monster-1",
      tokenId: "token-2",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Ogre",
      currentHp: 40,
      maxHp: 40,
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, target],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-2", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ cantrips: ["spell.light"], spells: ["spell.magic_missile"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });

    await expect(
      service.castSpell("user-1", "session-1", {
        spellId: "spell.fire_bolt",
        targetParticipantIds: ["monster-1"],
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: { reason: "SPELL_NOT_KNOWN", spellId: "spell.fire_bolt" },
      },
    });
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
  });

  it("triggers ready actions when an enemy casts a spell", async () => {
    const { service, prisma, sessionsService, actionEconomy, turnLogsService, realtimeEvents } = createService();
    const caster = createParticipant({
      id: "participant-caster",
      tokenId: "token-caster",
      sessionCharacterId: "session-character-caster",
      nameSnapshot: "Wizard",
      isHostile: false,
    });
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: null,
      tokenId: "token-reactor",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Cultist",
      isHostile: true,
      turnOrder: 2,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "host-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "enemy_casts_spell" },
      heldAction: { type: "custom", description: "Counter the ritual." },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster, reactor],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-caster", sessionCharacterId: "session-character-caster", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-reactor", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-caster",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ cantrips: ["spell.light"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.castSpell("user-1", "session-1", {
      spellId: "spell.light",
      point: { x: 50, y: 0 },
    });

    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: caster.id,
      }),
    ]);
    expect(result.message).toContain("준비행동 1개가 발동 대기 중입니다.");
    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(updateCall.where).toEqual({ sessionScenarioId: "session-scenario-1" });
    const updatedFlags = JSON.parse(updateCall.data.flagsJson);
    expect(updatedFlags[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(updatedFlags[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingReadyAction,
        status: "pending_response",
      }),
    ]);
    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: combat.id,
      combatParticipantId: caster.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: caster.sessionCharacterId,
    });
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "host-user",
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: caster.id,
      }),
    );
  });

  it("reports condition-only terrain effects when normal movement enters slippery terrain", async () => {
    const { service, prisma, sessionsService, actionEconomy, diceService, realtimeEvents } = createService();
    const mover = createParticipant({
      id: "participant-mover",
      sessionCharacterId: null,
      tokenId: "token-mover",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Scout",
      currentHp: 20,
      maxHp: 20,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: mover.id,
      participants: [mover],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 300,
      height: 300,
      tokens: [
        { id: "token-mover", x: 0, y: 0, size: 50, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.slippery:cell-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    sessionsService.saveSystemVttMap.mockImplementation(async (_sessionId, nextMap) => nextMap);
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ movementFtSpent: 0 });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+0",
      rolls: [5],
      modifier: 0,
      total: 5,
      advantageState: "NORMAL",
    });

    const result = await service.moveParticipant("host-user", "session-1", {
      participantId: mover.id,
      to: { x: 50, y: 0 },
    });

    expect(result.message).toBe("Scout 이동: 5ft / 지형 상태 condition.prone");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: mover.id },
      data: {
        conditionsJson: JSON.stringify([
          {
            conditionId: "condition.prone",
            sourceId: "terrain.slippery",
            duration: { type: "permanent" },
            saveEnds: { ability: "dex", dc: 10 },
            stackPolicy: "ignore_duplicate",
            appliedAtRound: 1,
            expiresAtTurn: null,
            tags: ["trigger:on_enter", "save:dex", "condition:prone"],
          },
        ]),
      },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 5 }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });

  it("does not spend a Fireball spell slot when the AoE has no targets", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy } = createService();
    const caster = createParticipant({
      id: "participant-1",
      tokenId: "token-1",
      sessionCharacterId: "session-character-1",
      nameSnapshot: "Wizard",
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: caster.id,
      participants: [caster],
    };
    const map = {
      id: "map-1",
      gridType: "square" as const,
      gridSize: 50,
      width: 600,
      height: 400,
      tokens: [
        { id: "token-1", sessionCharacterId: "session-character-1", x: 0, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getVttMapForUser.mockResolvedValue(map);
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      userId: "user-1",
      character: {
        ownerUserId: "user-1",
        className: "Wizard",
        spellsJson: JSON.stringify({ spells: ["spell.fireball"] }),
        abilitiesJson: JSON.stringify({ int: 16 }),
        proficiencyBonus: 3,
        level: 5,
      },
    });

    await expect(
      service.castSpell("user-1", "session-1", {
        spellId: "spell.fireball",
        slotLevel: 3,
        point: { x: 500, y: 300 },
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: { reason: "SPELL_TARGET_REQUIRED" },
      },
    });

    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(prisma.gameState.update).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
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
      state: { flagsJson: "{}", currentNodeId: null },
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

  it("applies object cover as an AC bonus on ranged attacks", async () => {
    const { service, prisma, sessionsService, diceService, turnLogsService } = createService();
    const attacker = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Archer",
      turnOrder: 1,
    });
    const target = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Bandit",
      isHostile: true,
      armorClass: 15,
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
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-hero", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0, hidden: false },
        { id: "token-monster", x: 100, y: 0, hidden: false },
      ],
      objectCells: [
        { id: "crate-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+6",
      rolls: [10],
      modifier: 6,
      total: 16,
      advantageState: "NORMAL",
    });

    const result = await service.resolveAttack("user-1", "session-1", {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: 6,
      damageDice: "1d8",
      damageBonus: 0,
    });

    expect(result.damageTotal).toBeNull();
    expect(result.message).toContain("16 vs AC 17");
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: target.id } }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          baseTargetArmorClass: 15,
          targetArmorClass: 17,
          cover: expect.objectContaining({
            coverLevel: "half",
            armorClassBonus: 2,
          }),
          hit: false,
        }),
      }),
    );
  });

  it("triggers ready actions when an ally is attacked", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService, realtimeEvents } = createService();
    const attacker = createParticipant({
      id: "participant-attacker",
      sessionCharacterId: "session-character-attacker",
      tokenId: "token-attacker",
      nameSnapshot: "Bandit",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: "session-character-target",
      tokenId: "token-target",
      nameSnapshot: "Cleric",
      isHostile: false,
      armorClass: 20,
    });
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      tokenId: "token-reactor",
      nameSnapshot: "Archer",
      isHostile: false,
      turnOrder: 3,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "ally_attacked", targetParticipantId: target.id },
      heldAction: { type: "attack", targetParticipantId: attacker.id },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: attacker.id,
      participants: [attacker, target, reactor],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-attacker", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0, hidden: false },
        { id: "token-target", sessionCharacterId: target.sessionCharacterId, x: 50, y: 0, hidden: false },
        { id: "token-reactor", sessionCharacterId: reactor.sessionCharacterId, x: 100, y: 0, hidden: false },
      ],
      fogRects: [],
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+3",
      rolls: [6],
      modifier: 3,
      total: 9,
      advantageState: "NORMAL",
    });

    const result = await service.resolveAttack("host-user", "session-1", {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: 3,
      damageDice: "1d6",
      damageBonus: 0,
    });

    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    ]);
    expect(result.message).toContain("준비행동 1개가 발동 대기 중입니다.");
    const updateCall = prisma.gameState.update.mock.calls[0]?.[0];
    expect(updateCall.where).toEqual({ sessionScenarioId: "session-scenario-1" });
    const updatedFlags = JSON.parse(updateCall.data.flagsJson);
    expect(updatedFlags[PENDING_READY_ACTIONS_FLAG]).toEqual([]);
    expect(updatedFlags[TRIGGERED_READY_ACTIONS_FLAG]).toEqual([
      expect.objectContaining({
        type: "triggered_ready_action",
        pending: pendingReadyAction,
        status: "pending_response",
      }),
    ]);
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "reactor-user",
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    );
    expect(actionEconomy.spendAction).toHaveBeenCalled();
  });

  it("applies disadvantage when the target stands in heavily obscured terrain", async () => {
    const { service, prisma, sessionsService, diceService, turnLogsService } = createService();
    const attacker = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Archer",
      turnOrder: 1,
    });
    const target = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Bandit",
      isHostile: true,
      armorClass: 15,
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
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-hero", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0, hidden: false },
        { id: "token-monster", x: 100, y: 0, hidden: false },
      ],
      terrainCells: [
        { id: "terrain.obscurement:cell-1", x: 100, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+6",
      rolls: [19, 5],
      modifier: 6,
      total: 11,
      advantageState: "DISADVANTAGE",
    });

    await service.resolveAttack("user-1", "session-1", {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: 6,
      damageDice: "1d8",
      damageBonus: 0,
    });

    expect(diceService.roll).toHaveBeenCalledWith("1d20+6", DiceAdvantageState.DISADVANTAGE);
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          advantageState: DiceAdvantageState.DISADVANTAGE,
          hit: false,
        }),
      }),
    );
  });

  it("resolves concentration checks when attacks deal damage", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents, turnLogsService } = createService();
    const attacker = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Archer",
      turnOrder: 1,
    });
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const target = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Acolyte",
      isHostile: true,
      currentHp: 20,
      maxHp: 20,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
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
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-hero", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0, hidden: false },
        { id: "token-monster", x: 50, y: 0, hidden: false },
      ],
      fogRects: [],
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+6",
        rolls: [14],
        modifier: 6,
        total: 20,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d8+2",
        rolls: [8],
        modifier: 2,
        total: 10,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });

    await service.resolveAttack("user-1", "session-1", {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: 6,
      damageDice: "1d8",
      damageBonus: 2,
    });

    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 10, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { conditionsJson: JSON.stringify([unrelated]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          damageTotal: 10,
          concentrationCheck: expect.objectContaining({
            concentrationMaintained: false,
            removedConditions: expect.arrayContaining([
              expect.objectContaining({ conditionId: concentration.conditionId }),
              expect.objectContaining({ conditionId: linked.conditionId }),
            ]),
            concentrationState: expect.objectContaining({
              spellId: "spell.hold_person",
              targetIds: ["target-1"],
              effectIds: ["effect-hold-1"],
            }),
          }),
        }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 5 }),
    );
  });

  it("resolves concentration checks when host applies direct combat damage", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents } = createService();
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Acolyte",
      currentHp: 20,
      maxHp: 20,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: target.id,
      participants: [target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+0",
      rolls: [5],
      modifier: 0,
      total: 5,
      advantageState: "NORMAL",
    });

    const result = await service.applyDamage("host-user", "session-1", {
      targetParticipantId: target.id,
      amount: 10,
    });

    expect(result.message).toBe("Acolyte 피해 10");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 10, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { conditionsJson: JSON.stringify([unrelated]) },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 5 }),
    );
    expect(diceService.roll).toHaveBeenCalledTimes(1);
  });

  it("does not mutate hit points or resolve concentration for zero direct damage", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents } = createService();
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Acolyte",
      currentHp: 20,
      maxHp: 20,
      conditionsJson: JSON.stringify([
        {
          conditionId: "condition.concentration",
          sourceId: "spell.hold_person",
          duration: { type: "permanent" },
          saveEnds: null,
          stackPolicy: "replace",
          appliedAtRound: null,
          expiresAtTurn: null,
          tags: ["concentration"],
        },
      ]),
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: target.id,
      participants: [target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);

    const result = await service.applyDamage("host-user", "session-1", {
      targetParticipantId: target.id,
      amount: 0,
    });

    expect(result.message).toBe("Acolyte 피해 0");
    expect(prisma.combatParticipant.update).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(realtimeEvents.emitDiceRolled).not.toHaveBeenCalled();
  });

  it("heals directly without resolving concentration", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents } = createService();
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Acolyte",
      currentHp: 10,
      maxHp: 20,
      conditionsJson: JSON.stringify([
        {
          conditionId: "condition.concentration",
          sourceId: "spell.hold_person",
          duration: { type: "permanent" },
          saveEnds: null,
          stackPolicy: "replace",
          appliedAtRound: null,
          expiresAtTurn: null,
          tags: ["concentration"],
        },
      ]),
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: target.id,
      participants: [target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);

    const result = await service.applyDamage("host-user", "session-1", {
      targetParticipantId: target.id,
      amount: 5,
      healing: true,
    });

    expect(result.message).toBe("Acolyte 회복 5");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 15, isAlive: true },
    });
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(realtimeEvents.emitDiceRolled).not.toHaveBeenCalled();
  });

  it("resolves concentration checks when a declined Shield reaction still hits", async () => {
    const { service, prisma, sessionsService, diceService, realtimeEvents, turnLogsService } = createService();
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const attacker = createParticipant({
      id: "participant-attacker",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Bandit",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Acolyte",
      currentHp: 20,
      maxHp: 20,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
    });
    const reactor = createParticipant({
      id: "participant-reactor",
      sessionCharacterId: "session-character-reactor",
      nameSnapshot: "Mage Hunter",
      isHostile: false,
      turnOrder: 3,
    });
    const pendingReadyAction = {
      id: "reaction:ready:participant-reactor:1:1",
      type: "ready_action",
      actorParticipantId: reactor.id,
      actorUserId: "reactor-user",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      trigger: { type: "enemy_casts_spell" },
      heldAction: { type: "custom", description: "Disrupt the caster." },
      originalCost: "action",
      consumesReaction: true,
      expiresAtRound: 2,
      expiresAtTurn: 1,
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    const pending = {
      id: "reaction:shield:test",
      type: "shield",
      sessionId: "session-1",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      reactorParticipantId: target.id,
      reactorUserId: "host-user",
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackTotal: 18,
      targetArmorClass: 13,
      damageDice: "1d8",
      damageBonus: 2,
      spellId: "spell.fire_bolt",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: attacker.id,
      participants: [attacker, target, reactor],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          pendingCombatReaction: pending,
          [PENDING_READY_ACTIONS_FLAG]: [pendingReadyAction],
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({ tokens: [] });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d8+2",
        rolls: [8],
        modifier: 2,
        total: 10,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });

    const result = await service.declineReaction("host-user", "session-1", {
      reactionId: pending.id,
    });

    expect(result.message).toBe("Bandit 공격 명중: Acolyte에게 10 피해 / 준비행동 1개가 발동 대기 중입니다.");
    expect(result.pendingReactions).toEqual([
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    ]);
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 10, isAlive: true },
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { conditionsJson: JSON.stringify([unrelated]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          shieldAccepted: false,
          concentrationCheck: expect.objectContaining({
            concentrationMaintained: false,
            removedConditions: expect.arrayContaining([
              expect.objectContaining({ conditionId: concentration.conditionId }),
              expect.objectContaining({ conditionId: linked.conditionId }),
            ]),
          }),
        }),
      }),
    );
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 5 }),
    );
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "reactor-user",
      expect.objectContaining({
        type: "ready_action",
        reactorParticipantId: reactor.id,
        moverParticipantId: target.id,
      }),
    );
  });

  it("spends attack action once and waits for Shield before damage or logs", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const attacker = createParticipant({
      id: "participant-attacker",
      sessionCharacterId: null,
      tokenId: "token-attacker",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Bandit",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: "session-character-target",
      tokenId: "token-target",
      nameSnapshot: "Wizard",
      isHostile: false,
      armorClass: 13,
      currentHp: 20,
      maxHp: 20,
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
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-attacker", x: 0, y: 0, hidden: false },
        { id: "token-target", sessionCharacterId: "session-character-target", x: 50, y: 0, hidden: false },
      ],
      fogRects: [],
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-target",
      userId: "target-user",
      currentHp: 20,
      character: {
        ownerUserId: "target-user",
        className: "Wizard",
        level: 1,
        maxHp: 20,
        spellsJson: JSON.stringify({ spells: ["spell.shield"] }),
      },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ reactionUsed: false });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+6",
      rolls: [10],
      modifier: 6,
      total: 16,
      advantageState: "NORMAL",
    });

    const result = await service.resolveAttack("host-user", "session-1", {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: 6,
      damageDice: "1d8",
      damageBonus: 2,
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledTimes(1);
    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: attacker.id,
      roundNo: 1,
      turnNo: 1,
      sessionCharacterId: null,
    });
    expect(diceService.roll).toHaveBeenCalledTimes(1);
    expect(diceService.roll).toHaveBeenCalledWith("1d20+6", "NORMAL");
    expect(prisma.gameState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionScenarioId: "session-scenario-1" },
        data: expect.objectContaining({
          flagsJson: expect.stringContaining("pendingCombatReaction"),
        }),
      }),
    );
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "target-user",
      expect.objectContaining({
        type: "shield",
        reactorParticipantId: target.id,
        moverParticipantId: attacker.id,
      }),
    );
    expect(prisma.combatParticipant.update).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitCombatUpdated).not.toHaveBeenCalled();
    expect(result.message).toContain("Shield 반응을 기다리는 중입니다.");
    expect(result.attackTotal).toBe(16);
    expect(result.damageTotal).toBeNull();
    expect(result.pendingReaction).toMatchObject({
      type: "shield",
      reactorParticipantId: target.id,
      reactorName: "Wizard",
      moverParticipantId: attacker.id,
      moverName: "Bandit",
    });
  });

  it("rejects attacks when a wall gives the target full cover", async () => {
    const { service, prisma, sessionsService, diceService } = createService();
    const attacker = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Archer",
    });
    const target = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Bandit",
      isHostile: true,
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
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      width: 200,
      height: 200,
      gridSize: 50,
      tokens: [
        { id: "token-hero", sessionCharacterId: attacker.sessionCharacterId, x: 0, y: 0, hidden: false },
        { id: "token-monster", x: 100, y: 0, hidden: false },
      ],
      wallCells: [
        { id: "wall-1", x: 50, y: 0, width: 50, height: 50 },
      ],
      fogRects: [],
    });
    prisma.combat.findFirst.mockResolvedValue(combat);

    await expect(
      service.resolveAttack("user-1", "session-1", {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: 6,
        damageDice: "1d8",
        damageBonus: 0,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: { reason: "TARGET_HAS_FULL_COVER" },
      },
    });
    expect(diceService.roll).not.toHaveBeenCalled();
  });

  it("maps executable monster action options for combat participants", async () => {
    const { service, prisma, sessionsService, monsterAbilities, srdEngine } = createService();
    const hero = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Hero",
      isHostile: false,
      turnOrder: 1,
    });
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: monster.id,
      participants: [hero, monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-hero", sessionCharacterId: "session-character-hero", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-monster", x: 50, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    (monsterAbilities.listExecutableActions as jest.Mock).mockReturnValueOnce([
      {
        monsterId: "monster.goblin",
        actionId: "monster.goblin.ability.multiattack",
        label: "Multiattack",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "",
        damageType: null,
        reachFt: null,
        rangeFt: null,
        confidence: "medium",
        costType: "action",
        specialType: "multiattack",
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: ["multiattack:catalog.scimitar:1", "multiattack:catalog.shortbow:2"],
      },
      {
        monsterId: "monster.goblin",
        actionId: "monster.goblin.ability.nimble_escape",
        label: "Nimble Escape",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "",
        damageType: null,
        reachFt: null,
        rangeFt: null,
        confidence: "medium",
        costType: "bonus_action",
        specialType: "mobility",
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: ["disengage", "hide"],
        childActions: [],
      },
      {
        monsterId: "monster.goblin",
        actionId: "catalog.scimitar",
        label: "Scimitar",
        attackKind: "melee",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "slashing",
        reachFt: 5,
        rangeFt: null,
        confidence: "high",
        costType: "action",
      },
    ]);
    (srdEngine.getExecutableMonsterActions as jest.Mock).mockReturnValueOnce([
      {
        monsterId: "monster.goblin",
        actionId: "catalog.scimitar",
        label: "Duplicate Scimitar",
        attackKind: "melee",
        attackBonus: 99,
        damageDice: "9d9",
        damageType: "slashing",
        reachFt: 5,
        rangeFt: null,
        confidence: "low",
      },
      {
        monsterId: "monster.goblin",
        actionId: "catalog.shortbow",
        label: "Shortbow",
        attackKind: "ranged",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: null,
        rangeFt: { normal: 80, long: 320 },
        confidence: "high",
      },
    ]);

    const result = await service.getCombat("host-user", "session-1");

    expect(result.participants.find((participant) => participant.sessionEntityId === hero.id)?.monsterActions).toEqual([]);
    expect(result.participants.find((participant) => participant.sessionEntityId === monster.id)?.monsterActions).toEqual([
      {
        actionId: "monster.goblin.ability.multiattack",
        label: "Multiattack",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "",
        damageType: null,
        rangeFt: 0,
        longRangeFt: null,
        confidence: "medium",
        costType: "action",
        targetKind: "single_target",
        resolutionKind: "special",
        specialType: "multiattack",
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: ["multiattack:catalog.scimitar:1", "multiattack:catalog.shortbow:2"],
        childActions: [
          { actionId: "catalog.scimitar", count: 1 },
          { actionId: "catalog.shortbow", count: 2 },
        ],
      },
      {
        actionId: "monster.goblin.ability.nimble_escape",
        label: "Nimble Escape",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "",
        damageType: null,
        rangeFt: 0,
        longRangeFt: null,
        confidence: "medium",
        costType: "bonus_action",
        targetKind: "self",
        resolutionKind: "special",
        specialType: "mobility",
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: ["disengage", "hide"],
        childActions: [],
      },
      {
        actionId: "catalog.scimitar",
        label: "Scimitar",
        attackKind: "melee",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "slashing",
        rangeFt: 5,
        longRangeFt: null,
        confidence: "high",
        costType: "action",
        targetKind: "single_target",
        resolutionKind: "attack",
        specialType: null,
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: [],
        childActions: [],
      },
      {
        actionId: "catalog.shortbow",
        label: "Shortbow",
        attackKind: "ranged",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        rangeFt: 80,
        longRangeFt: 320,
        confidence: "high",
        costType: "action",
        targetKind: "single_target",
        resolutionKind: "attack",
        specialType: null,
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: [],
        childActions: [],
      },
      expect.objectContaining({
        actionId: "fallback.scimitar",
        label: "Scimitar",
        longRangeFt: null,
        confidence: "medium",
        costType: "action",
      }),
    ]);
  });

  it("executes a monster multiattack as one action with multiple catalog attacks", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, monsterAbilities, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Brown Bear",
      isHostile: true,
      speedFt: 40,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 40,
      maxHp: 40,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const multiattack = {
      monsterId: "monster.brown_bear",
      actionId: "monster.brown_bear.ability.multiattack",
      label: "Multiattack",
      attackKind: "special",
      attackBonus: 0,
      damageDice: "",
      damageType: null,
      reachFt: null,
      rangeFt: null,
      confidence: "medium" as const,
      costType: "action",
      specialType: "multiattack",
      usage: null,
      recharge: null,
      save: null,
      conditionRiders: [],
      effectTags: ["multiattack:action.bite:1", "multiattack:action.claws:1"],
    };
    const bite = {
      monsterId: "monster.brown_bear",
      actionId: "action.bite",
      label: "Bite",
      attackKind: "melee_weapon",
      attackBonus: 5,
      damageDice: "1d8+4",
      damageType: "piercing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high" as const,
      costType: "action",
    };
    const claws = {
      monsterId: "monster.brown_bear",
      actionId: "action.claws",
      label: "Claws",
      attackKind: "melee_weapon",
      attackBonus: 5,
      damageDice: "2d6+4",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high" as const,
      costType: "action",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.brown_bear" } },
        { id: "token-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(multiattack);
    (monsterAbilities.listExecutableActions as jest.Mock).mockReturnValue([multiattack, bite, claws]);
    turnLogsService.createTurnLog
      .mockResolvedValueOnce({ turnLogId: "turn-log-bite" })
      .mockResolvedValueOnce({ turnLogId: "turn-log-claws" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+5",
        rolls: [13],
        modifier: 5,
        total: 18,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d8+4",
        rolls: [4],
        modifier: 4,
        total: 8,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+5",
        rolls: [12],
        modifier: 5,
        total: 17,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "2d6+4",
        rolls: [3, 4],
        modifier: 4,
        total: 11,
        advantageState: "NORMAL",
      });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: multiattack.actionId,
      targetParticipantId: target.id,
      autoEndTurn: false,
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledTimes(1);
    expect(diceService.roll).toHaveBeenCalledWith("1d20+5", expect.any(String));
    expect(diceService.roll).toHaveBeenCalledWith("1d8+4");
    expect(diceService.roll).toHaveBeenCalledWith("2d6+4");
    expect(turnLogsService.createTurnLog).toHaveBeenCalledTimes(2);
    expect(result.message).toContain("Brown Bear Multiattack");
    expect(result.message).toContain("Bite");
    expect(result.message).toContain("Claws");
  });

  it("resumes remaining monster multiattack children after a pending Shield reaction resolves", async () => {
    const { service, prisma, sessionsService, diceService, turnLogsService, realtimeEvents } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Brown Bear",
      isHostile: true,
      speedFt: 40,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 40,
      maxHp: 40,
      turnOrder: 2,
    });
    const claws = {
      monsterId: "monster.brown_bear",
      actionId: "action.claws",
      label: "Claws",
      attackKind: "melee_weapon",
      attackBonus: 5,
      damageDice: "2d6+4",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high" as const,
      costType: "action",
    };
    const pending = {
      id: "reaction:shield:multiattack",
      type: "shield" as const,
      sessionId: "session-1",
      combatId: "combat-1",
      roundNo: 2,
      turnNo: 3,
      reactorParticipantId: target.id,
      reactorUserId: "host-user",
      attackerParticipantId: monster.id,
      targetParticipantId: target.id,
      attackTotal: 18,
      targetArmorClass: 12,
      damageDice: "1d8+4",
      damageBonus: 0,
      createdAt: "2026-05-25T00:00:00.000Z",
      continuation: {
        type: "monster_multiattack" as const,
        userId: "host-user",
        actorParticipantId: monster.id,
        targetParticipantId: target.id,
        targetTokenId: "token-target",
        autoEndTurn: false,
        parentAction: {
          monsterId: "monster.brown_bear",
          actionId: "monster.brown_bear.ability.multiattack",
          label: "Multiattack",
          attackKind: "special",
          attackBonus: 0,
          damageDice: "",
          damageType: null,
          reachFt: null,
          rangeFt: null,
          confidence: "medium" as const,
          costType: "action",
          specialType: "multiattack",
          effectTags: ["multiattack:action.bite:1", "multiattack:action.claws:1"],
        },
        remainingActions: [claws],
      },
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({ pendingCombatReaction: pending }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.brown_bear" } },
        { id: "token-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog
      .mockResolvedValueOnce({ turnLogId: "turn-log-shield" })
      .mockResolvedValueOnce({ turnLogId: "turn-log-claws" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d8+4",
        rolls: [4],
        modifier: 4,
        total: 8,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+5",
        rolls: [13],
        modifier: 5,
        total: 18,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "2d6+4",
        rolls: [3, 4],
        modifier: 4,
        total: 11,
        advantageState: "NORMAL",
      });

    const result = await service.declineReaction("host-user", "session-1", {
      reactionId: pending.id,
    });

    expect(result.pendingReaction).toBeNull();
    expect(result.message).toContain("Brown Bear 공격 명중: Hero에게 8 피해");
    expect(result.message).toContain("Multiattack");
    expect(result.message).toContain("Claws");
    expect(turnLogsService.createTurnLog).toHaveBeenCalledTimes(2);
    expect(turnLogsService.createTurnLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          metadata: expect.objectContaining({
            source: "monster_action",
            monsterAction: expect.objectContaining({
              actionId: "action.claws",
            }),
          }),
        }),
      }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalled();
  });

  it("marks expended monster actions as unavailable in combat options", async () => {
    const { service, prisma, sessionsService, monsterAbilities } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Dragon Whelp",
      isHostile: true,
      turnOrder: 1,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          monsterRechargeExpended: {
            [monster.id]: {
              "monster.dragon_whelp.ability.fire_breath": {
                recharge: "5-6",
                roundNo: 1,
                turnNo: 1,
              },
            },
          },
          monsterLimitedUseExpended: {
            [monster.id]: {
              "monster.dragon_whelp.ability.dark_blessing": {
                usage: "1/day",
                used: 1,
                limit: 1,
                roundNo: 1,
                turnNo: 1,
              },
            },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.dragon_whelp" } },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.combat.findFirst.mockResolvedValue(combat);
    (monsterAbilities.listExecutableActions as jest.Mock).mockReturnValue([
      {
        monsterId: "monster.dragon_whelp",
        actionId: "monster.dragon_whelp.ability.fire_breath",
        label: "Fire Breath",
        attackKind: "ranged",
        attackBonus: 7,
        damageDice: "2d6",
        damageType: "fire",
        reachFt: null,
        rangeFt: { normal: 30, long: null },
        confidence: "high",
        costType: "action",
        usage: null,
        recharge: "5-6",
        save: null,
        conditionRiders: [],
        effectTags: [],
      },
      {
        monsterId: "monster.dragon_whelp",
        actionId: "monster.dragon_whelp.ability.dark_blessing",
        label: "Dark Blessing",
        attackKind: "ranged",
        attackBonus: 6,
        damageDice: "2d6",
        damageType: "necrotic",
        reachFt: null,
        rangeFt: { normal: 30, long: null },
        confidence: "high",
        costType: "action",
        usage: "1/day",
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: [],
      },
    ]);

    const result = await service.getCombat("host-user", "session-1");
    const actions = result.participants[0].monsterActions;

    expect(actions).toEqual([
      expect.objectContaining({
        actionId: "monster.dragon_whelp.ability.fire_breath",
        available: false,
        unavailableReason: "MONSTER_RECHARGE_ACTION_EXPENDED",
      }),
      expect.objectContaining({
        actionId: "monster.dragon_whelp.ability.dark_blessing",
        available: false,
        unavailableReason: "MONSTER_LIMITED_USE_ACTION_EXPENDED",
      }),
      expect.any(Object),
    ]);
  });

  it("lets a human GM dash the current monster through the shared actor action path", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const hero = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Hero",
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, hero],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false },
        { id: "token-hero", sessionCharacterId: "session-character-hero", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "dash",
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(actionEconomy.grantMovement).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
      amountFt: 30,
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "host-user",
        sessionCharacterId: null,
        structuredAction: { type: "combat_dash", movementBonusFt: 30 },
      }),
    );
    expect(result.message).toBe("Goblin은(는) 전력으로 움직일 준비를 마쳤습니다. 이번 턴 이동 가능 거리가 30ft 증가합니다.");
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ currentEntityId: monster.id }),
    );
  });

  it("lets a human GM dodge the current monster through the shared actor action path", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [{ id: "token-monster", x: 0, y: 0, size: 50, hidden: false }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    await service.resolveActorAction("host-user", "session-1", {
      actionType: "dodge",
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: monster.id },
      data: { conditionsJson: JSON.stringify(["combat:dodge"]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCharacterId: null,
        structuredAction: { type: "combat_dodge", condition: "combat:dodge" },
      }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ currentEntityId: monster.id }),
    );
  });

  it("rejects a human GM monster basic action when the current action is already spent", async () => {
    const { service, prisma, sessionsService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    actionEconomy.spendAction.mockRejectedValueOnce({
      response: {
        code: "ACTION_400",
        data: { reason: "ACTION_ALREADY_USED" },
      },
    });

    await expect(
      service.resolveActorAction("host-user", "session-1", {
        actionType: "dash",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "ACTION_ALREADY_USED" },
      },
    });
    expect(actionEconomy.grantMovement).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitCombatUpdated).not.toHaveBeenCalled();
  });

  it("lets a human GM choose a monster actionId through the shared actor action path", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      monsterAbilities,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.goblin",
      actionId: "catalog.shortbow",
      label: "Shortbow",
      attackKind: "ranged",
      attackBonus: 7,
      damageDice: "2d6+3",
      damageType: "piercing",
      reachFt: null,
      rangeFt: { normal: 80, long: 320 },
      confidence: "high",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+7",
        rolls: [12],
        modifier: 7,
        total: 19,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "2d6+3",
        rolls: [5],
        modifier: 3,
        total: 8,
        advantageState: "NORMAL",
      });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "catalog.shortbow",
      targetParticipantId: target.id,
    });

    expect(monsterAbilities.chooseAction).toHaveBeenCalledWith("monster.goblin", "catalog.shortbow");
    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(diceService.roll).toHaveBeenNthCalledWith(1, "1d20+7", "NORMAL");
    expect(diceService.roll).toHaveBeenNthCalledWith(2, "2d6+3");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 12, isAlive: true },
    });
    expect(result.message).toContain("Goblin Shortbow: Goblin 공격 명중: Hero에게 8 피해");
    expect(result.damageTotal).toBe(8);
  });

  it("records a monster recharge action as expended when it is used", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      monsterAbilities,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Dragon Whelp",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.dragon_whelp",
      actionId: "monster.dragon_whelp.ability.fire_breath",
      label: "Fire Breath",
      attackKind: "ranged",
      attackBonus: 7,
      damageDice: "2d6",
      damageType: "fire",
      reachFt: null,
      rangeFt: { normal: 30, long: null },
      confidence: "high" as const,
      costType: "action",
      recharge: "5-6",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.dragon_whelp" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+7",
        rolls: [12],
        modifier: 7,
        total: 19,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "2d6",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });

    await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: selectedAction.actionId,
      targetParticipantId: target.id,
    });

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          monsterRechargeExpended: {
            [monster.id]: {
              [selectedAction.actionId]: {
                recharge: "5-6",
                roundNo: 2,
                turnNo: 3,
              },
            },
          },
        }),
      },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          metadata: expect.objectContaining({
            source: "monster_action",
            monsterAction: expect.objectContaining({
              monsterId: "monster.dragon_whelp",
              actionId: selectedAction.actionId,
              label: "Fire Breath",
              recharge: "5-6",
            }),
            resourceChecks: {
              rechargeChecked: true,
              limitedUseLimit: null,
            },
          }),
        }),
      }),
    );
  });

  it("rejects a monster recharge action that is still expended", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      monsterAbilities,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Dragon Whelp",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.dragon_whelp",
      actionId: "monster.dragon_whelp.ability.fire_breath",
      label: "Fire Breath",
      attackKind: "ranged",
      attackBonus: 7,
      damageDice: "2d6",
      damageType: "fire",
      reachFt: null,
      rangeFt: { normal: 30, long: null },
      confidence: "high" as const,
      costType: "action",
      recharge: "5-6",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          monsterRechargeExpended: {
            [monster.id]: {
              [selectedAction.actionId]: {
                recharge: "5-6",
                roundNo: 1,
                turnNo: 1,
              },
            },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.dragon_whelp" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);

    await expect(
      service.resolveActorAction("host-user", "session-1", {
        actionType: "attack",
        actionId: selectedAction.actionId,
        targetParticipantId: target.id,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        data: expect.objectContaining({
          reason: "MONSTER_RECHARGE_ACTION_EXPENDED",
        }),
      }),
    });

    expect(diceService.roll).not.toHaveBeenCalled();
    expect(prisma.gameState.update).not.toHaveBeenCalled();
  });

  it("records a monster limited-use action as expended when it is used", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      monsterAbilities,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Cult Fanatic",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.cult_fanatic",
      actionId: "monster.cult_fanatic.ability.dark_blessing",
      label: "Dark Blessing",
      attackKind: "ranged",
      attackBonus: 6,
      damageDice: "2d6",
      damageType: "necrotic",
      reachFt: null,
      rangeFt: { normal: 30, long: null },
      confidence: "high" as const,
      costType: "action",
      usage: "1/day",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.cult_fanatic" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+6",
        rolls: [12],
        modifier: 6,
        total: 18,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "2d6",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: "NORMAL",
      });

    await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: selectedAction.actionId,
      targetParticipantId: target.id,
    });

    expect(prisma.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            [monster.id]: {
              [selectedAction.actionId]: {
                usage: "1/day",
                used: 1,
                limit: 1,
                roundNo: 2,
                turnNo: 3,
              },
            },
          },
        }),
      },
    });
  });

  it("rejects a monster limited-use action that has no uses remaining", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      monsterAbilities,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Cult Fanatic",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.cult_fanatic",
      actionId: "monster.cult_fanatic.ability.dark_blessing",
      label: "Dark Blessing",
      attackKind: "ranged",
      attackBonus: 6,
      damageDice: "2d6",
      damageType: "necrotic",
      reachFt: null,
      rangeFt: { normal: 30, long: null },
      confidence: "high" as const,
      costType: "action",
      usage: "1/day",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        flagsJson: JSON.stringify({
          monsterLimitedUseExpended: {
            [monster.id]: {
              [selectedAction.actionId]: {
                usage: "1/day",
                used: 1,
                limit: 1,
                roundNo: 1,
                turnNo: 1,
              },
            },
          },
        }),
        currentNodeId: null,
      },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.cult_fanatic" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);

    await expect(
      service.resolveActorAction("host-user", "session-1", {
        actionType: "attack",
        actionId: selectedAction.actionId,
        targetParticipantId: target.id,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        data: expect.objectContaining({
          reason: "MONSTER_LIMITED_USE_ACTION_EXPENDED",
        }),
      }),
    });

    expect(diceService.roll).not.toHaveBeenCalled();
    expect(prisma.gameState.update).not.toHaveBeenCalled();
  });

  it("applies a monster attack condition rider when the target fails its saving throw", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      monsterAbilities,
      turnLogsService,
      ruleEngine,
      realtimeEvents,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Spider",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: "session-character-target",
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.giant_spider",
      actionId: "monster.giant_spider.ability.bite",
      label: "Bite",
      attackKind: "melee",
      attackBonus: 5,
      damageDice: "1d8+3",
      damageType: "piercing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high" as const,
      costType: "action",
      save: { ability: "con", dcSource: "fixed", fixedDc: 11 },
      conditionRiders: ["condition.poisoned"],
      effectTags: [],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.giant_spider" } },
        { id: "token-target", sessionCharacterId: "session-character-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-target",
      conditionsJson: "[]",
      character: {
        abilitiesJson: JSON.stringify({ con: 10 }),
        proficiencyBonus: 2,
      },
    });
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+5",
        rolls: [12],
        modifier: 5,
        total: 17,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d8+3",
        rolls: [4],
        modifier: 3,
        total: 7,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d20+0",
        rolls: [8],
        modifier: 0,
        total: 8,
        advantageState: "NORMAL",
      });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "monster.giant_spider.ability.bite",
      targetParticipantId: target.id,
    });

    expect(ruleEngine.resolveSavingThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        ability: "con",
        naturalD20: 8,
        difficultyClass: 11,
        abilityModifier: 0,
        proficiencyBonus: 2,
        proficient: false,
      }),
    );
    expect(diceService.roll).toHaveBeenNthCalledWith(3, "1d20+0");
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: {
        conditionsJson: expect.stringContaining("condition.poisoned"),
      },
    });
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-target" },
      data: {
        conditionsJson: expect.stringContaining("condition.poisoned"),
      },
    });
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 8 }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({
        participants: expect.arrayContaining([
          expect.objectContaining({
            sessionEntityId: target.id,
            conditions: expect.arrayContaining(["condition.poisoned"]),
          }),
        ]),
      }),
    );
    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
    expect(result.message).toContain("condition.poisoned 적용");
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "attack",
          metadata: expect.objectContaining({
            source: "monster_action",
            monsterAction: expect.objectContaining({
              actionId: "monster.giant_spider.ability.bite",
              conditionRiders: ["condition.poisoned"],
              save: { ability: "con", dcSource: "fixed", fixedDc: 11 },
            }),
          }),
        }),
      }),
    );
    expect(result.combat.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionEntityId: target.id,
          conditions: expect.arrayContaining(["condition.poisoned"]),
        }),
      ]),
    );
  });

  it("executes Nimble Escape as a monster special mobility action using the bonus action", async () => {
    const {
      service,
      prisma,
      sessionsService,
      actionEconomy,
      monsterAbilities,
      realtimeEvents,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: "session-character-target",
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const nimbleEscape = {
      monsterId: "monster.goblin",
      actionId: "monster.goblin.ability.nimble_escape",
      label: "Nimble Escape",
      attackKind: "special",
      attackBonus: 0,
      damageDice: "",
      damageType: null,
      reachFt: null,
      rangeFt: null,
      confidence: "medium",
      costType: "bonus_action",
      specialType: "mobility",
      effectTags: ["disengage", "hide"],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", sessionCharacterId: "session-character-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce(nimbleEscape);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "monster.goblin.ability.nimble_escape",
    });

    expect(monsterAbilities.chooseAction).toHaveBeenCalledWith(
      "monster.goblin",
      "monster.goblin.ability.nimble_escape",
    );
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(actionEconomy.spendBonusAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: monster.id },
      data: { conditionsJson: JSON.stringify(["combat:disengage"]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "host-user",
        sessionCharacterId: null,
        structuredAction: expect.objectContaining({
          type: "monster_special",
          actionId: "monster.goblin.ability.nimble_escape",
          specialType: "mobility",
          condition: "combat:disengage",
          effectTags: ["disengage", "hide"],
        }),
      }),
    );
    expect(result.message).toBe("Goblin은(는) Nimble Escape로 교전에서 빠져나갈 틈을 만들었습니다.");
    expect(result.attackTotal).toBeNull();
    expect(result.damageTotal).toBeNull();
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ currentEntityId: monster.id }),
    );
  });

  it("waits for Shield when a human GM monster attack uses the shared actor action path", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      monsterAbilities,
      realtimeEvents,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: "session-character-target",
      tokenId: "token-target",
      entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
      nameSnapshot: "Wizard",
      isHostile: false,
      armorClass: 13,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };
    const selectedAction = {
      monsterId: "monster.goblin",
      actionId: "catalog.scimitar",
      label: "Scimitar",
      attackKind: "melee",
      attackBonus: 6,
      damageDice: "1d6+2",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high",
      costType: "action",
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", sessionCharacterId: "session-character-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-target",
      userId: "target-user",
      currentHp: 20,
      character: {
        ownerUserId: "target-user",
        className: "Wizard",
        level: 1,
        maxHp: 20,
        spellsJson: JSON.stringify({ spells: ["spell.shield"] }),
      },
    });
    actionEconomy.getOrCreateTurnState.mockResolvedValue({ reactionUsed: false, movementFtSpent: 0 });
    monsterAbilities.chooseAction.mockReturnValueOnce(selectedAction);
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+6",
      rolls: [10],
      modifier: 6,
      total: 16,
      advantageState: "NORMAL",
    });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "catalog.scimitar",
      targetParticipantId: target.id,
    });

    expect(monsterAbilities.chooseAction).toHaveBeenCalledWith("monster.goblin", "catalog.scimitar");
    expect(actionEconomy.spendAction).toHaveBeenCalledTimes(1);
    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(diceService.roll).toHaveBeenCalledTimes(1);
    expect(diceService.roll).toHaveBeenCalledWith("1d20+6", "NORMAL");
    expect(prisma.gameState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionScenarioId: "session-scenario-1" },
        data: expect.objectContaining({
          flagsJson: expect.stringContaining("pendingCombatReaction"),
        }),
      }),
    );
    expect(realtimeEvents.emitCombatReactionPrompt).toHaveBeenCalledWith(
      "session-1",
      "target-user",
      expect.objectContaining({
        type: "shield",
        reactorParticipantId: target.id,
        moverParticipantId: monster.id,
      }),
    );
    expect(prisma.combatParticipant.update).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitCombatUpdated).not.toHaveBeenCalled();
    expect(result.message).toContain("Shield 반응을 기다리는 중입니다.");
    expect(result.attackTotal).toBe(16);
    expect(result.damageTotal).toBeNull();
    expect(result.pendingReaction).toMatchObject({
      type: "shield",
      reactorParticipantId: target.id,
      reactorName: "Wizard",
      moverParticipantId: monster.id,
      moverName: "Goblin",
    });
  });

  it("rejects a human GM monster attack before damage or logs when the current action is already spent", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      monsterAbilities,
      realtimeEvents,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce({
      monsterId: "monster.goblin",
      actionId: "catalog.scimitar",
      label: "Scimitar",
      attackKind: "melee",
      attackBonus: 4,
      damageDice: "1d6+2",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high",
    });
    actionEconomy.spendAction.mockRejectedValueOnce({
      response: {
        code: "ACTION_400",
        data: { reason: "ACTION_ALREADY_USED" },
      },
    });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+4",
        rolls: [12],
        modifier: 4,
        total: 16,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6+2",
        rolls: [4],
        modifier: 2,
        total: 6,
        advantageState: "NORMAL",
      });

    await expect(
      service.resolveActorAction("host-user", "session-1", {
        actionType: "attack",
        actionId: "catalog.scimitar",
        targetParticipantId: target.id,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "ACTION_ALREADY_USED" },
      },
    });
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: target.id },
      }),
    );
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitCombatUpdated).not.toHaveBeenCalled();
    expect(realtimeEvents.emitTurnLogCreated).not.toHaveBeenCalled();
  });

  it("rejects direct human GM attacks from a monster whose turn is not current", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const currentHero = createParticipant({
      id: "participant-hero",
      sessionCharacterId: "session-character-hero",
      tokenId: "token-hero",
      nameSnapshot: "Hero",
      isHostile: false,
      turnOrder: 1,
    });
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: currentHero.id,
      participants: [currentHero, monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);

    await expect(
      service.resolveAttack("host-user", "session-1", {
        attackerParticipantId: monster.id,
        targetParticipantId: currentHero.id,
        attackBonus: 4,
        damageDice: "1d6+2",
        damageBonus: 0,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: {
          reason: "NOT_CURRENT_COMBATANT",
          currentParticipantId: currentHero.id,
          attackerParticipantId: monster.id,
        },
      },
    });
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
    expect(turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(realtimeEvents.emitCombatUpdated).not.toHaveBeenCalled();
  });

  it("lets a human GM hide the current monster through the shared actor action path", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, realtimeEvents, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [{ id: "token-monster", x: 0, y: 0, size: 50, hidden: false }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+0",
      rolls: [15],
      modifier: 0,
      total: 15,
      advantageState: "NORMAL",
    });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "hide",
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: monster.id },
      data: { conditionsJson: JSON.stringify(["combat:hidden"]) },
    });
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCharacterId: null,
        structuredAction: expect.objectContaining({
          type: "combat_hide",
          dc: 12,
          success: true,
          condition: "combat:hidden",
        }),
      }),
    );
    expect(result.attackTotal).toBe(15);
    expect(realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ expression: "1d20+0", total: 15 }),
    );
  });

  it("does not add hidden when a human GM monster hide check fails", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      speedFt: 30,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 200,
      height: 200,
      tokens: [{ id: "token-monster", x: 0, y: 0, size: 50, hidden: false }],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+0",
      rolls: [5],
      modifier: 0,
      total: 5,
      advantageState: "NORMAL",
    });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "hide",
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: monster.id },
        data: expect.objectContaining({ conditionsJson: expect.any(String) }),
      }),
    );
    expect(turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "FAILURE",
        structuredAction: expect.objectContaining({
          type: "combat_hide",
          dc: 12,
          success: false,
          condition: null,
        }),
      }),
    );
    expect(result.attackTotal).toBe(5);
  });

  it("rejects a human GM monster action when the selected target is out of range", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, monsterAbilities } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      nameSnapshot: "Hero",
      isHostile: false,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", x: 100, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce({
      monsterId: "monster.goblin",
      actionId: "catalog.scimitar",
      label: "Scimitar",
      attackKind: "melee",
      attackBonus: 4,
      damageDice: "1d6+2",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high",
    });

    await expect(
      service.resolveActorAction("host-user", "session-1", {
        actionType: "attack",
        actionId: "catalog.scimitar",
        targetParticipantId: target.id,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "COMBAT_409",
        data: {
          reason: "TARGET_OUT_OF_MONSTER_ACTION_RANGE",
          distanceFt: 10,
          rangeFt: 5,
        },
      },
    });
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
    expect(diceService.roll).not.toHaveBeenCalled();
  });

  it("lets a human GM monster ranged action attack at long range with disadvantage", async () => {
    const { service, prisma, sessionsService, diceService, actionEconomy, monsterAbilities, turnLogsService } =
      createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 15,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 2,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, target],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 1400,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-target", x: 1000, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst.mockResolvedValue(combat);
    monsterAbilities.chooseAction.mockReturnValueOnce({
      monsterId: "monster.goblin",
      actionId: "catalog.shortbow",
      label: "Shortbow",
      attackKind: "ranged",
      attackBonus: 4,
      damageDice: "1d6+2",
      damageType: "piercing",
      reachFt: null,
      rangeFt: { normal: 80, long: 320 },
      confidence: "high",
    });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll.mockReturnValueOnce({
      expression: "1d20+4",
      rolls: [17, 9],
      modifier: 4,
      total: 13,
      advantageState: "DISADVANTAGE",
    });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "catalog.shortbow",
      targetParticipantId: target.id,
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(diceService.roll).toHaveBeenCalledWith("1d20+4", DiceAdvantageState.DISADVANTAGE);
    expect(prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: target.id } }),
    );
    expect(result.message).toContain("Goblin Shortbow: Goblin 공격 빗나감");
    expect(result.attackTotal).toBe(13);
    expect(result.damageTotal).toBeNull();
  });

  it("auto ends a human GM monster turn without auto-running the next monster", async () => {
    const {
      service,
      prisma,
      sessionsService,
      diceService,
      actionEconomy,
      monsterAbilities,
      realtimeEvents,
      turnLogsService,
    } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
      turnOrder: 1,
    });
    const nextMonster = createParticipant({
      id: "participant-next-monster",
      sessionCharacterId: null,
      tokenId: "token-next-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Orc",
      isHostile: true,
      turnOrder: 2,
    });
    const target = createParticipant({
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      nameSnapshot: "Hero",
      isHostile: false,
      armorClass: 12,
      currentHp: 20,
      maxHp: 20,
      turnOrder: 3,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster, nextMonster, target],
    };
    const updatedCombat = {
      ...combat,
      turnNo: 4,
      currentParticipantId: nextMonster.id,
      participants: [monster, nextMonster, target],
    };
    const tx = {
      combatParticipant: { update: jest.fn() },
      combat: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedCombat),
      },
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { flagsJson: "{}", currentNodeId: null },
    });
    sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridType: "square",
      gridSize: 50,
      width: 500,
      height: 500,
      tokens: [
        { id: "token-monster", x: 0, y: 0, size: 50, hidden: false, monster: { id: "monster.goblin" } },
        { id: "token-next-monster", x: 100, y: 0, size: 50, hidden: false, monster: { id: "monster.orc" } },
        { id: "token-target", x: 50, y: 0, size: 50, hidden: false },
      ],
      fogRects: [],
      updatedAt: "2026-05-25T00:00:00.000Z",
    });
    sessionsService.buildSnapshot.mockResolvedValue({ sessionId: "session-1" });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.HOST });
    prisma.combat.findFirst
      .mockResolvedValueOnce(combat)
      .mockResolvedValueOnce(combat)
      .mockResolvedValueOnce(combat)
      .mockResolvedValueOnce(combat)
      .mockResolvedValue(updatedCombat);
    prisma.combat.findUniqueOrThrow.mockResolvedValue(updatedCombat);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    monsterAbilities.chooseAction.mockReturnValueOnce({
      monsterId: "monster.goblin",
      actionId: "catalog.scimitar",
      label: "Scimitar",
      attackKind: "melee",
      attackBonus: 4,
      damageDice: "1d6+2",
      damageType: "slashing",
      reachFt: 5,
      rangeFt: null,
      confidence: "high",
    });
    turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });
    diceService.roll
      .mockReturnValueOnce({
        expression: "1d20+4",
        rolls: [12],
        modifier: 4,
        total: 16,
        advantageState: "NORMAL",
      })
      .mockReturnValueOnce({
        expression: "1d6+2",
        rolls: [4],
        modifier: 2,
        total: 6,
        advantageState: "NORMAL",
      });

    const result = await service.resolveActorAction("host-user", "session-1", {
      actionType: "attack",
      actionId: "catalog.scimitar",
      targetParticipantId: target.id,
      autoEndTurn: true,
    });

    expect(actionEconomy.spendAction).toHaveBeenCalledWith({
      combatId: "combat-1",
      combatParticipantId: monster.id,
      roundNo: 2,
      turnNo: 3,
      sessionCharacterId: null,
    });
    expect(tx.combat.updateMany).toHaveBeenCalledWith({
      where: {
        id: combat.id,
        currentParticipantId: monster.id,
      },
      data: {
        currentParticipantId: nextMonster.id,
        turnNo: 4,
        roundNo: 2,
      },
    });
    expect(realtimeEvents.emitTurnChanged).toHaveBeenCalledWith("session-1", {
      combatId: "combat-1",
      endedEntityId: monster.id,
      nextEntityId: nextMonster.id,
      roundNo: 2,
      turnNo: 4,
    });
    expect(monsterAbilities.chooseAction).toHaveBeenCalledTimes(1);
    expect(diceService.roll).toHaveBeenCalledTimes(2);
    expect(result.message).toContain("/ 턴 종료");
    expect(result.combat.currentEntityId).toBe(nextMonster.id);
  });

  it("rejects non-GM users controlling the current monster through the shared actor action path", async () => {
    const { service, prisma, sessionsService, actionEconomy } = createService();
    const monster = createParticipant({
      id: "participant-monster",
      sessionCharacterId: null,
      tokenId: "token-monster",
      entityType: PrismaCombatEntityType.MONSTER,
      nameSnapshot: "Goblin",
      isHostile: true,
    });
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: PrismaCombatStatus.ACTIVE,
      roundNo: 2,
      turnNo: 3,
      currentParticipantId: monster.id,
      participants: [monster],
    };

    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({ role: PrismaParticipantRole.PLAYER });
    prisma.combat.findFirst.mockResolvedValue(combat);

    await expect(
      service.resolveActorAction("player-user", "session-1", {
        actionType: "dash",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "GM_403",
        data: { reason: "GM_OR_HOST_REQUIRED" },
      },
    });
    expect(actionEconomy.spendAction).not.toHaveBeenCalled();
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
      data: { conditionsJson: JSON.stringify(["condition.blessed"]) },
    });
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", {
      sessionId: "session-1",
    });
  });
});
