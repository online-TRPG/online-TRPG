import { ScenarioNodeType } from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

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
