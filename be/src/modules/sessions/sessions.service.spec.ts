import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ApplyHumanGmCombatConditionDto,
  HumanGmMessageDto,
  RevealSessionContentDto,
  ScenarioNodeType,
} from "@trpg/shared-types";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SessionsService } from "./sessions.service";

describe("HumanGmMessageDto validation", () => {
  it("keeps private GM notes through whitelist validation", async () => {
    const dto = plainToInstance(HumanGmMessageDto, {
      content: "The innkeeper lowers their voice.",
      privateNote: "The guard heard this.",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors).toEqual([]);
    expect(dto.privateNote).toBe("The guard heard this.");
  });
});

describe("RevealSessionContentDto validation", () => {
  it("rejects unsupported HUMAN GM reveal content kinds before audit logging", async () => {
    const dto = plainToInstance(RevealSessionContentDto, {
      contentId: "clue-1",
      contentKind: "unsupported",
      scope: "party",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors.some((error) => error.property === "contentKind")).toBe(true);
  });
});

describe("ApplyHumanGmCombatConditionDto validation", () => {
  it("rejects unsupported HUMAN GM condition operations", async () => {
    const dto = plainToInstance(ApplyHumanGmCombatConditionDto, {
      targetId: "token-1",
      conditionId: "condition.stunned",
      operation: "toggle",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors.some((error) => error.property === "operation")).toBe(true);
  });
});

describe("SessionsService HUMAN GM messages", () => {
  it("records the created GM message id in override metadata and state diff", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      gameState: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ version: 4 }),
      },
      session: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 2 }),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "turn-log-1",
          turnNumber: data.turnNumber,
          playerActionId: null,
          actorUserId: data.actorUserId,
          sessionCharacterId: null,
          rawInput: data.rawInput,
          structuredActionJson: data.structuredActionJson,
          stateDiffJson: data.stateDiffJson,
          outcome: data.outcome,
          narration: data.narration,
          createdAt: now,
        })),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getGameStateEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest.fn().mockResolvedValue({
      id: "session-1",
      status: "PLAYING",
    });
    serviceInternals.getGameStateEntityOrThrow = jest.fn().mockResolvedValue({
      sessionScenario: { id: "session-scenario-1", scenarioId: "scenario-1" },
      state: { version: 4, currentNodeId: "node-1", flagsJson: "{}" },
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await service.createHumanGmMessage("gm-user", "session-1", {
      content: "The hall falls silent.",
      privateNote: "The scout is listening.",
    });

    const flagsUpdate = tx.gameState.update.mock.calls[0]?.[0] as { data: { flagsJson: string } };
    const createdMessage = JSON.parse(flagsUpdate.data.flagsJson).gmMessages[0] as { id: string };
    const turnLogCreate = tx.turnLog.create.mock.calls[0]?.[0] as {
      data: { structuredActionJson: string; stateDiffJson: string };
    };
    const structuredAction = JSON.parse(turnLogCreate.data.structuredActionJson);
    const stateDiff = JSON.parse(turnLogCreate.data.stateDiffJson);

    expect(createdMessage.id).toEqual(expect.any(String));
    expect(structuredAction).toEqual(
      expect.objectContaining({
        type: "gm_override",
        kind: "scene_text",
        hasPrivateNote: true,
        metadata: expect.objectContaining({
          gmMessageId: createdMessage.id,
          messageType: "gm",
        }),
      }),
    );
    expect(stateDiff.diff).toEqual(
      expect.objectContaining({
        gmMessageCreated: true,
        gmMessageId: createdMessage.id,
      }),
    );
    expect(structuredAction.metadata).not.toHaveProperty("privateNote");
  });
});

describe("SessionsService HUMAN GM reveal", () => {
  it("rejects unsupported reveal content kinds before writing audit data", async () => {
    const prisma = {
      $transaction: jest.fn(() => {
        throw new Error("transaction should not run");
      }),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      ensureSessionScenarioNodeSnapshotForScenario: jest.Mock;
      findSessionScenarioRevealable: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.ensureSessionScenarioNodeSnapshotForScenario = jest.fn().mockResolvedValue(undefined);
    serviceInternals.findSessionScenarioRevealable = jest.fn().mockResolvedValue({
      id: "clue-1",
      title: "Clue",
    });

    await expect(
      service.revealSessionContent("gm-user", "session-1", {
        contentId: "clue-1",
        contentKind: "unsupported",
        scope: "party",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(serviceInternals.findSessionScenarioRevealable).not.toHaveBeenCalled();
  });

  it("links a HUMAN GM handout reveal to the generated override turn log", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const createdReveal = {
      id: "reveal-1",
      sessionScenarioId: "session-scenario-1",
      contentId: "clue-1",
      contentKind: "clue",
      scope: "party",
      recipientId: null,
      revealedAt: now,
      revealedBy: "human_gm",
      reason: "Reveal the inscription.",
      snapshotJson: JSON.stringify({ id: "clue-1", title: "Inscription" }),
      turnLogId: null,
    };
    const tx = {
      sessionReveal: {
        upsert: jest.fn().mockResolvedValue(createdReveal),
        update: jest.fn().mockResolvedValue({ ...createdReveal, turnLogId: "turn-log-1" }),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 7 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-1",
          turnNumber: 8,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:reveal_handout",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "reveal_handout",
            targetId: "clue-1",
            public: true,
            hasPrivateNote: false,
            metadata: { reason: "Reveal the inscription." },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 3,
            nextVersion: 4,
            reason: "gm_override:reveal_handout",
            diff: { revealId: "reveal-1" },
          }),
          outcome: "SUCCESS",
          narration: "Reveal the inscription.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      ensureSessionScenarioNodeSnapshotForScenario: jest.Mock;
      findSessionScenarioRevealable: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.ensureSessionScenarioNodeSnapshotForScenario = jest.fn().mockResolvedValue(undefined);
    serviceInternals.findSessionScenarioRevealable = jest.fn().mockResolvedValue({
      id: "clue-1",
      title: "Inscription",
      handoutText: "The mark means danger.",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await expect(
      service.revealSessionContent("gm-user", "session-1", {
        contentId: "clue-1",
        contentKind: "clue",
        scope: "party",
        reason: "Reveal the inscription.",
      }),
    ).resolves.toMatchObject({
      id: "reveal-1",
      contentId: "clue-1",
      revealedBy: "human_gm",
    });

    expect(tx.sessionReveal.update).toHaveBeenCalledWith({
      where: { id: "reveal-1" },
      data: { turnLogId: "turn-log-1" },
    });
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ turnLogId: "turn-log-1" }),
    );
  });
});

describe("SessionsService HUMAN GM combat conditions", () => {
  it("updates a combat participant condition and writes a GM override log", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      combatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 4 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-1",
          turnNumber: 5,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:set_condition",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "set_condition",
            targetId: "participant-goblin",
            public: true,
            hasPrivateNote: false,
            metadata: {
              operation: "add",
              conditionId: "condition.stunned",
              tokenId: "token-goblin",
              targetName: "Smoke Goblin",
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 2,
            nextVersion: 3,
            reason: "gm_override:set_condition",
            diff: {
              combatParticipants: [
                {
                  combatParticipantId: "participant-goblin",
                  tokenId: "token-goblin",
                  conditions: ["condition.stunned"],
                },
              ],
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Smoke Goblin에게 기절 상태를 적용했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 2 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue({
          id: "combat-1",
          sessionId: "session-1",
          status: "ACTIVE",
          participants: [
            {
              id: "participant-goblin",
              tokenId: "token-goblin",
              nameSnapshot: "Smoke Goblin",
              conditionsJson: "[]",
            },
          ],
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await expect(
      service.applyHumanGmCombatCondition("gm-user", "session-1", {
        targetId: "token-goblin",
        conditionId: "condition.stunned",
        operation: "add",
      }),
    ).resolves.toMatchObject({ session: { id: "session-1" } });

    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-goblin" },
      data: { conditionsJson: JSON.stringify(["condition.stunned"]) },
    });
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:set_condition",
          narration: "GM이 Smoke Goblin에게 기절 상태를 적용했습니다.",
        }),
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ turnLogId: "turn-log-1" }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        combatId: "combat-1",
        participants: [
          expect.objectContaining({
            sessionEntityId: "participant-goblin",
            tokenId: "token-goblin",
            conditions: ["condition.stunned"],
          }),
        ],
      }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });

  it("removes a combat participant condition through the GM override path", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      combatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 5 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-remove",
          turnNumber: 6,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:set_condition",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "set_condition",
            targetId: "participant-goblin",
            public: true,
            hasPrivateNote: false,
            metadata: {
              operation: "remove",
              conditionId: "condition.stunned",
              tokenId: "token-goblin",
              targetName: "Smoke Goblin",
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 3,
            nextVersion: 4,
            reason: "gm_override:set_condition",
            diff: {
              combatParticipants: [
                {
                  combatParticipantId: "participant-goblin",
                  tokenId: "token-goblin",
                  conditions: ["condition.poisoned"],
                },
              ],
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Smoke Goblin에게서 기절 상태를 제거했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue({
          id: "combat-1",
          sessionId: "session-1",
          status: "ACTIVE",
          roundNo: 1,
          turnNo: 1,
          currentParticipantId: "participant-goblin",
          participants: [
            {
              id: "participant-goblin",
              entityType: "MONSTER",
              sessionCharacterId: null,
              tokenId: "token-goblin",
              nameSnapshot: "Smoke Goblin",
              currentHp: 7,
              maxHp: 7,
              armorClass: 15,
              initiative: 12,
              turnOrder: 1,
              isAlive: true,
              isHostile: true,
              conditionsJson: JSON.stringify(["condition.stunned", "condition.poisoned"]),
            },
          ],
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await service.applyHumanGmCombatCondition("gm-user", "session-1", {
      targetId: "participant-goblin",
      conditionId: "condition.stunned",
      operation: "remove",
    });

    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-goblin" },
      data: { conditionsJson: JSON.stringify(["condition.poisoned"]) },
    });
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        participants: [
          expect.objectContaining({
            sessionEntityId: "participant-goblin",
            conditions: ["condition.poisoned"],
          }),
        ],
      }),
    );
  });
});

describe("SessionsService session listing", () => {
  const now = new Date("2026-05-08T00:00:00.000Z");

  function createPublicSessionFixture() {
    const host = {
      id: "host-user",
      publicId: "12345678",
      displayName: "테스트 호스트",
      email: null,
      passwordHash: null,
      authProvider: "GUEST",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return {
      id: "session-1",
      publicId: "87654321",
      title: "테스트 공개 세션",
      description: "",
      hostUserId: host.id,
      inviteCode: "ABC123",
      status: "RECRUITING",
      visibility: "PUBLIC",
      maxParticipants: 4,
      ruleSetId: "dnd5e",
      gmMode: "AI",
      nextSessionAt: null,
      createdAt: now,
      updatedAt: now,
      host,
      participants: [
        {
          id: "participant-1",
          sessionId: "session-1",
          userId: "requester-user",
          role: "PLAYER",
          status: "JOINED",
          connectionStatus: "ONLINE",
          isReady: false,
          readyAt: null,
          joinedAt: now,
          leftAt: null,
        },
      ],
      sessionScenarios: [
        {
          id: "session-scenario-1",
          sessionId: "session-1",
          scenarioId: "scenario-1",
          sequence: 1,
          status: "ACTIVE",
          startedAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          scenario: {
            id: "scenario-1",
            title: "테스트 시나리오",
            description: "테스트용 시나리오입니다.",
            createdByUserId: null,
            sourceType: "SYSTEM",
            baseScenarioId: null,
            thumbnailUrl: null,
            ruleSetId: "dnd5e",
            difficulty: "easy",
            license: "ORIGINAL",
            attribution: "test",
            startNodeId: "node-start",
            createdAt: now,
            updatedAt: now,
          },
          gameState: {
            sessionScenarioId: "session-scenario-1",
            version: 1,
            currentNodeId: "node-start",
            phase: "LOBBY",
            flagsJson: "{}",
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    };
  }

  function createServiceWithSession(session: ReturnType<typeof createPublicSessionFixture>) {
    const prisma = {
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
      session: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([session]),
        update: jest.fn(),
      },
    };
    const usersService = {
      getUserEntityOrThrow: jest.fn().mockRejectedValue(new Error("host를 다시 조회하면 안 됩니다.")),
    };

    return {
      service: new SessionsService(prisma as never, usersService as never, {} as never, {} as never),
      prisma,
      usersService,
    };
  }

  it("excludes public sessions whose host was deleted before building the list", async () => {
    const session = createPublicSessionFixture();
    const { service, prisma, usersService } = createServiceWithSession(session);

    const result = await service.listAvailableSessions({ requesterUserId: "requester-user" });

    // 운영 DB에 soft delete된 host 세션이 남아도, 공개 목록 쿼리 단계에서 제외해야 전체 목록 404를 막을 수 있다.
    expect(prisma.session.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        visibility: "PUBLIC",
        status: "RECRUITING",
        host: {
          is: {
            deletedAt: null,
          },
        },
      }),
    });
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          host: {
            is: {
              deletedAt: null,
            },
          },
        }),
        include: expect.objectContaining({
          host: true,
        }),
      }),
    );
    expect(usersService.getUserEntityOrThrow).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      session: { id: "session-1" },
      host: { id: "host-user" },
      participantCount: 1,
      role: "PLAYER",
    });
  });
});

describe("SessionsService player scenario mapping", () => {
  const service = Object.create(SessionsService.prototype) as {
    mapPlayerScenarioNode: (
      node: {
        id: string;
        nodeType: string;
        title: string;
        sceneText: string;
        imageUrl: string | null;
        checkOptionsJson: string;
        cluesJson: string;
        nodeMetaJson?: string | null;
      },
      revealedClueSnapshots: Map<string, Record<string, unknown>>,
    ) => {
      checkOptions: Array<Record<string, unknown>>;
      nodeType: ScenarioNodeType;
    };
  };

  it("projects check options to player-safe fields", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Locked Door",
        sceneText: "A locked door bars the way.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "pick_lock",
            type: "skill_check",
            skill: "sleight_of_hand",
            label: "Pick the lock",
            dc: 17,
            note: "Only reveal the trap after a failed roll.",
            hiddenTarget: "trap_trigger",
            revealTrigger: "failure",
          },
          {
            dc: 20,
            note: "GM-only option without a player label",
          },
        ]),
        cluesJson: JSON.stringify([]),
        nodeMetaJson: null,
      },
      new Map(),
    );

    expect(node.checkOptions).toEqual([
      {
        id: "pick_lock",
        type: "skill_check",
        skill: "sleight_of_hand",
        label: "Pick the lock",
      },
    ]);
  });

  it("prefers explicit player labels over GM labels", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Library",
        sceneText: "Dusty shelves surround you.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "inspect_shelf",
            skill: "investigation",
            label: "GM label",
            playerLabel: "Search the shelves",
          },
        ]),
        cluesJson: JSON.stringify([]),
        nodeMetaJson: null,
      },
      new Map(),
    );

    expect(node.checkOptions[0]).toMatchObject({ label: "Search the shelves" });
  });
});

describe("SessionsService VTT map structures", () => {
  const service = Object.create(SessionsService.prototype) as {
    redactVttMapForPlayer: (map: Record<string, unknown>) => Record<string, unknown>;
    normalizeVttMap: (map: Record<string, unknown>, scenarioNodeId: string | null) => Record<string, unknown>;
    ensurePlayerMapShellUnchanged: (
      baseline: Record<string, unknown>,
      requested: Record<string, unknown>,
      allowFullMapShell?: boolean,
    ) => void;
    applyPlayerVttMapUpdate: (
      userId: string,
      sessionId: string,
      sessionScenarioId: string,
      state: { currentNodeId: string | null; flagsJson: string | null },
      requestedMap: Record<string, unknown>,
      allowFullMapShell?: boolean,
    ) => Promise<Record<string, unknown>>;
    getVttMapBaseline: jest.Mock;
    getControlledSessionCharacterIds: jest.Mock;
    spendCombatMovement: jest.Mock;
    prisma: {
      combat: {
        findFirst: jest.Mock;
      };
    };
    logger: {
      debug: jest.Mock;
      warn: jest.Mock;
    };
    ensureTokenPathIsReachable: (
      map: Record<string, unknown>,
      fromToken: Record<string, unknown>,
      toToken: Record<string, unknown>,
    ) => void;
    rectsOverlap: (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) => boolean;
    getGridLineCells: (
      fromToken: Record<string, unknown>,
      toToken: Record<string, unknown>,
      map: Record<string, unknown>,
    ) => Array<{ x: number; y: number }>;
    getGridIndex: (value: number, gridSize: number, maxSize: number) => number;
  };

  it("redacts player-hidden structure details from VTT maps", () => {
    const redacted = service.redactVttMapForPlayer({
      id: "map-1",
      width: 192,
      height: 64,
      gridSize: 64,
      tokens: [
        { id: "visible-token", name: "Visible", x: 0, y: 0, size: 64, hidden: false },
        { id: "hidden-token", name: "Hidden", x: 64, y: 0, size: 64, hidden: true },
      ],
      startingPositions: [{ id: "start-1", label: "P1", x: 0, y: 0 }],
      doorCells: [
        {
          id: "door-1",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
          state: "locked",
          keyItemId: "silver-key",
        },
      ],
      objectCells: [
        {
          id: "object-visible",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item-1"],
          hiddenEventIds: ["event-1"],
        },
        {
          id: "object-hidden",
          x: 128,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          hiddenClueIds: ["clue-2"],
        },
      ],
    });

    expect(redacted.tokens).toEqual([
      expect.objectContaining({ id: "visible-token", hidden: false }),
    ]);
    expect(redacted.startingPositions).toEqual([]);
    expect(redacted.doorCells).toEqual([
      expect.objectContaining({ id: "door-1", keyItemId: null }),
    ]);
    expect(redacted.objectCells).toEqual([
      expect.objectContaining({
        id: "object-visible",
        hiddenClueIds: [],
        hiddenItemIds: [],
        hiddenEventIds: [],
      }),
    ]);
  });

  it("preserves no-check clue reveal settings while normalizing object cells", () => {
    const normalized = service.normalizeVttMap(
      {
        id: "map-1",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        objectCells: [
          {
            id: "object-1",
            x: 0,
            y: 0,
            width: 64,
            height: 64,
            hiddenClueIds: ["clue-1"],
            revealChecks: [
              {
                contentId: "clue-1",
                requiresCheck: false,
                ability: "int",
                skill: "investigation",
                dc: 15,
              },
            ],
          },
        ],
      },
      "node-1",
    );

    expect(normalized.objectCells).toEqual([
      expect.objectContaining({
        id: "object-1",
        revealChecks: [
          expect.objectContaining({
            contentId: "clue-1",
            requiresCheck: false,
          }),
        ],
      }),
    ]);
  });

  it("preserves terrain effect ids while normalizing terrain cells", () => {
    const normalized = service.normalizeVttMap(
      {
        id: "map-1",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        terrainCells: [
          {
            id: "terrain-cell-1",
            terrainEffectId: "terrain.poison_cloud",
            x: 64,
            y: 0,
            width: 64,
            height: 64,
          },
        ],
      },
      "node-1",
    );

    expect(normalized.terrainCells).toEqual([
      expect.objectContaining({
        id: "terrain-cell-1",
        terrainEffectId: "terrain.poison_cloud",
      }),
    ]);
  });

  it("lets non-host players move tokens on maps with a detected hazard", () => {
    // Regression: a detected trap made the player-redacted hazard carry
    // detectionRadiusCells/detectionDc of 0. When the non-host client echoed
    // that map back, normalizeVttMap's `Number(x) || default` revived those
    // zeros as defaults, so ensurePlayerMapShellUnchanged saw a mismatched
    // shell and rejected every move with ForbiddenException.
    const baseline = service.normalizeVttMap(
      {
        id: "map-1",
        scenarioNodeId: "node-2",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        objectCells: [
          {
            id: "trap-1",
            x: 128,
            y: 64,
            width: 64,
            height: 64,
            visibleToPlayers: false,
            hazard: {
              kind: "TRAP",
              armed: true,
              detectionRadiusCells: 3,
              detectionDc: 14,
              detectedBySessionCharacterIds: ["session-character-1"],
            },
          },
        ],
      },
      "node-2",
    );

    // The non-host client receives the redacted player map and echoes it
    // back through normalizeVttMap when it submits a token move.
    const playerMap = service.redactVttMapForPlayer(baseline);
    const echoedByClient = service.normalizeVttMap(playerMap, "node-2");

    expect(() =>
      service.ensurePlayerMapShellUnchanged(baseline, echoedByClient, false),
    ).not.toThrow();
  });

  it("keeps stale uncontrolled token positions from blocking another player move", async () => {
    const baseline = service.normalizeVttMap(
      {
        id: "map-1",
        scenarioNodeId: "node-2",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [
          {
            id: "token-a",
            sessionCharacterId: "session-character-a",
            name: "A",
            x: 64,
            y: 0,
            size: 64,
          },
          {
            id: "token-b",
            sessionCharacterId: "session-character-b",
            name: "B",
            x: 0,
            y: 64,
            size: 64,
          },
        ],
        fogRects: [],
      },
      "node-2",
    );
    const requested = service.normalizeVttMap(
      {
        ...baseline,
        tokens: [
          {
            ...(baseline.tokens as Array<Record<string, unknown>>)[0],
            x: 0,
            y: 0,
          },
          {
            ...(baseline.tokens as Array<Record<string, unknown>>)[1],
            x: 64,
            y: 64,
          },
        ],
      },
      "node-2",
    );
    service.getVttMapBaseline = jest.fn().mockResolvedValue(baseline);
    service.getControlledSessionCharacterIds = jest
      .fn()
      .mockResolvedValue(new Set(["session-character-b"]));
    service.spendCombatMovement = jest.fn().mockResolvedValue(undefined);
    service.prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service.logger = {
      debug: jest.fn(),
      warn: jest.fn(),
    };

    const result = await service.applyPlayerVttMapUpdate(
      "user-b",
      "session-1",
      "session-scenario-1",
      { currentNodeId: "node-2", flagsJson: "{}" },
      requested,
      false,
    );

    expect(result.tokens).toEqual([
      expect.objectContaining({ id: "token-a", x: 64, y: 0 }),
      expect.objectContaining({ id: "token-b", x: 64, y: 64 }),
    ]);
  });

  it("adds newly revealed hidden object items to the investigating character inventory", async () => {
    const tx = {
      sessionScenarioNode: {
        findUnique: jest.fn().mockResolvedValue({ cluesJson: "[]" }),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope", name: "Rope", description: "50 feet of hempen rope." }]),
      },
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      revealVttObjectContentsAtPoint: SessionsService["revealVttObjectContentsAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
      refreshSessionInventorySnapshot: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: [],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    runtimeService.refreshSessionInventorySnapshot = jest.fn().mockResolvedValue(undefined);

    const result = await runtimeService.revealVttObjectContentsAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
      sessionCharacterId: "session-character-1",
    });

    expect(tx.inventoryEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionCharacterId: "session-character-1",
          itemDefinitionId: "item.rope",
          quantity: 1,
        },
      ],
    });
    expect(runtimeService.refreshSessionInventorySnapshot).toHaveBeenCalledWith("session-character-1");
    expect(result.revealedItems).toEqual([
      { id: "item.rope", name: "Rope", quantity: 1, description: "50 feet of hempen rope." },
    ]);
  });

  it("grants hidden object items when a previous reveal exists without party inventory", async () => {
    const tx = {
      sessionScenarioNode: {
        findUnique: jest.fn().mockResolvedValue({ cluesJson: "[]" }),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope", name: "Rope", description: "50 feet of hempen rope." }]),
      },
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([{ contentId: "item.rope", contentKind: "item" }]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      revealVttObjectContentsAtPoint: SessionsService["revealVttObjectContentsAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
      refreshSessionInventorySnapshot: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: [],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    runtimeService.refreshSessionInventorySnapshot = jest.fn().mockResolvedValue(undefined);

    const result = await runtimeService.revealVttObjectContentsAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
      sessionCharacterId: "session-character-1",
    });

    expect(tx.sessionReveal.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionCharacterId: "session-character-1",
          itemDefinitionId: "item.rope",
          quantity: 1,
        },
      ],
    });
    expect(result.count).toBe(1);
    expect(result.revealedItems).toEqual([
      { id: "item.rope", name: "Rope", quantity: 1, description: "50 feet of hempen rope." },
    ]);
  });

  it("does not require another investigation check after an object's hidden contents are exhausted", async () => {
    const prisma = {
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([
          { contentId: "clue-1", contentKind: "clue" },
          { contentId: "item.rope", contentKind: "item" },
        ]),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope" }]),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([{ itemDefinitionId: "item.rope" }]),
      },
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      describeVttObjectAtPoint: SessionsService["describeVttObjectAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          name: "낡은 책상",
          description: "먼지가 쌓인 책상입니다.",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
          revealChecks: [
            {
              contentId: "clue-1",
              requiresCheck: true,
              ability: "int",
              skill: "investigation",
              dc: 15,
            },
          ],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });

    const result = await runtimeService.describeVttObjectAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
    });

    expect(result).toEqual({ message: "여기에는 더 숨겨진 것이 없습니다." });
    expect(result?.checkOptions).toBeUndefined();
    expect(prisma.sessionReveal.findMany).toHaveBeenCalledWith({
      where: {
        sessionScenarioId: "session-scenario-1",
        scope: "party",
        recipientKey: "party",
        OR: [
          { contentId: "clue-1", contentKind: "clue" },
          { contentId: "item.rope", contentKind: "item" },
        ],
      },
      select: {
        contentId: true,
        contentKind: true,
      },
    });
  });

  it("blocks player token paths through terrain, walls, and closed doors", () => {
    const map = {
      width: 256,
      height: 64,
      gridSize: 64,
      terrainCells: [{ id: "rock", x: 64, y: 0, width: 64, height: 64 }],
      wallCells: [{ id: "wall", x: 128, y: 0, width: 64, height: 64 }],
      doorCells: [{ id: "door", x: 192, y: 0, width: 64, height: 64, state: "closed" }],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 192 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).toThrow(
      ForbiddenException,
    );
  });

  it("allows player token paths through terrain effect cells", () => {
    const map = {
      width: 192,
      height: 64,
      gridSize: 64,
      terrainCells: [
        {
          id: "terrain-cell-1",
          terrainEffectId: "terrain.difficult",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
        },
      ],
      wallCells: [],
      doorCells: [],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 128 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("allows player token paths through open and broken doors", () => {
    const map = {
      width: 256,
      height: 64,
      gridSize: 64,
      terrainCells: [],
      wallCells: [],
      doorCells: [
        { id: "open-door", x: 64, y: 0, width: 64, height: 64, state: "open" },
        { id: "broken-door", x: 128, y: 0, width: 64, height: 64, state: "broken" },
      ],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 192 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("lets a player token path past another token blocking the way", () => {
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const map = {
      width: 192,
      height: 64,
      gridSize: 64,
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      // An ally token parked in the only corridor must not block the path.
      tokens: [fromToken, { id: "ally", x: 64, y: 0, size: 64, hidden: false }],
    };
    const toToken = { ...fromToken, x: 128 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("lets a player token move diagonally between blocked orthogonal cells", () => {
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const map = {
      width: 128,
      height: 128,
      gridSize: 64,
      terrainCells: [],
      // Both orthogonal neighbours are walled, leaving only the diagonal step.
      wallCells: [
        { id: "wall-right", x: 64, y: 0, width: 64, height: 64 },
        { id: "wall-down", x: 0, y: 64, width: 64, height: 64 },
      ],
      doorCells: [],
      tokens: [fromToken],
    };
    const toToken = { ...fromToken, x: 64, y: 64 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });
});

describe("SessionsService legacy VTT map updates", () => {
  it("redacts GM-only map data for the host in AI GM sessions", async () => {
    const prisma = {
      gameState: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const gmMap = {
      id: "map-1",
      scenarioNodeId: "node-exploration",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 640,
      tokens: [
        { id: "visible-token", name: "Visible", x: 0, y: 0, size: 64, hidden: false },
        { id: "hidden-token", name: "Hidden", x: 64, y: 0, size: 64, hidden: true },
      ],
      fogRects: [],
      objectCells: [
        {
          id: "visible-object",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item-1"],
          hiddenEventIds: ["event-1"],
        },
        {
          id: "hidden-object",
          x: 128,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          hiddenClueIds: ["clue-2"],
        },
      ],
      updatedAt: "2026-05-22T00:00:00.000Z",
    };

    jest.spyOn(service, "getSessionEntityOrThrow").mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "AI",
      gmUserId: null,
    } as never);
    jest.spyOn(service, "ensureMembership").mockResolvedValue(undefined);
    jest.spyOn(service, "getGameStateEntityOrThrow").mockResolvedValue({
      state: {
        currentNodeId: "node-exploration",
        flagsJson: JSON.stringify({ vttMap: gmMap }),
      },
      sessionScenario: { id: "session-scenario-1" },
    } as never);
    (
      service as unknown as {
        applyScenarioStartingPositions: jest.Mock;
      }
    ).applyScenarioStartingPositions = jest.fn().mockResolvedValue(gmMap);

    const result = await service.getVttMapForUser("host-user", "session-1");

    expect(result.tokens).toEqual([
      expect.objectContaining({ id: "visible-token", hidden: false }),
    ]);
    expect(result.objectCells).toEqual([
      expect.objectContaining({
        id: "visible-object",
        hiddenClueIds: [],
        hiddenItemIds: [],
        hiddenEventIds: [],
      }),
    ]);
  });

  it("ignores non-host whole-map writes and returns the canonical player map", async () => {
    const service = new SessionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const canonicalPlayerMap = {
      id: "canonical-map",
      scenarioNodeId: "node-exploration",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 640,
      tokens: [],
      fogRects: [],
      objectCells: [],
      updatedAt: "2026-05-22T00:00:00.000Z",
    };

    jest.spyOn(service, "getSessionEntityOrThrow").mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    } as never);
    jest.spyOn(service, "ensureMembership").mockResolvedValue(undefined);
    jest.spyOn(service, "getGameStateEntityOrThrow").mockResolvedValue({
      state: {
        currentNodeId: "node-exploration",
        flagsJson: "{}",
      },
      sessionScenario: { id: "session-scenario-1" },
    } as never);
    jest.spyOn(service, "getVttMapForUser").mockResolvedValue(canonicalPlayerMap as never);

    await expect(
      service.updateVttMap("player-user", "session-1", {
        map: {
          ...canonicalPlayerMap,
          id: "stale-client-map",
          tokens: [{ id: "someone-else", x: 0, y: 0, size: 64 }],
        } as never,
      }),
    ).resolves.toBe(canonicalPlayerMap);
  });
});
