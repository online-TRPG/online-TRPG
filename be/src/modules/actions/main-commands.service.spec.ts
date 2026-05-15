import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  MainCommandCategory,
  MainCommandIntent,
  MainCommandScreenType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { MainCommandsService } from "./main-commands.service";

const dto: SubmitMainCommandDto = {
  commandId: "command-1",
  actorId: "session-character-1",
  intent: MainCommandIntent.OBSERVE_AREA,
  category: MainCommandCategory.OBSERVATION,
  screenType: MainCommandScreenType.EXPLORATION,
  playerText: "주변을 관찰한다",
};

describe("MainCommandsService.submitMainCommand permission", () => {
  const createService = () => {
    const prisma = {
      sessionParticipant: { findUnique: jest.fn() },
      sessionCharacter: { findUnique: jest.fn() },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-1",
        status: PrismaSessionStatus.PLAYING,
        gmMode: PrismaGmMode.AI,
      }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiService = {};
    const turnLogsService = {};
    const realtimeEvents = {};

    return {
      service: new MainCommandsService(
        prisma as never,
        sessionsService as never,
        aiService as never,
        turnLogsService as never,
        realtimeEvents as never,
      ),
      prisma,
    };
  };

  it("rejects ownership mismatch with MAIN_COMMAND_403 CHARACTER_OWNERSHIP_MISMATCH", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    // sessionId+userId 복합키로 본인 sessionCharacter 를 조회하지만 character.ownerUserId 는 다른 유저
    // (실제로는 캐릭터 이양/공유가 도입된 뒤 발생할 시나리오)
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "another-user" },
      inventoryEntries: [],
    });

    await expect(service.submitMainCommand("user-1", "session-1", dto)).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "CHARACTER_OWNERSHIP_MISMATCH" },
      },
    });
  });

  it("rejects actor mismatch before reaching ownership check", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "user-1" },
      inventoryEntries: [],
    });

    await expect(
      service.submitMainCommand("user-1", "session-1", { ...dto, actorId: "other-character" }),
    ).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "ACTOR_MISMATCH" },
      },
    });
  });
});

describe("MainCommandsService transition condition evaluation", () => {
  const createService = () =>
    new MainCommandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const transitionDto: SubmitMainCommandDto = {
    ...dto,
    intent: MainCommandIntent.REQUEST_SCENE_TRANSITION,
    playerText: "다음 장면으로 이동한다",
  };

  const candidate = {
    transitionId: "transition-1",
    label: "북쪽 철문",
    condition: "북쪽 철문을 열었을 때",
    note: null,
    nodeId: "node-next",
    title: "북쪽 통로",
    nodeType: "exploration",
    isFallback: false,
  };

  function evaluate(
    service: MainCommandsService,
    params: {
      condition?: string | null;
      playerText?: string;
      recentLogs?: string[];
      publicClues?: string[];
    },
  ) {
    return (
      service as unknown as {
        evaluateTransitionCondition: (
          candidate: typeof candidate,
          dto: SubmitMainCommandDto,
          recentLogs: string[],
          publicClues: string[],
        ) => { satisfied: boolean; needsReview: boolean; missingTerms: string[] };
      }
    ).evaluateTransitionCondition(
      { ...candidate, condition: params.condition ?? candidate.condition },
      { ...transitionDto, playerText: params.playerText ?? transitionDto.playerText },
      params.recentLogs ?? [],
      params.publicClues ?? [],
    );
  }

  it("allows default transition conditions for existing seeded scenarios", () => {
    const result = evaluate(createService(), { condition: "default", playerText: "아무 입력" });

    expect(result.satisfied).toBe(true);
  });

  it("blocks a transition when the natural language condition has no evidence", () => {
    const result = evaluate(createService(), { playerText: "아무 말이나 입력한다" });

    expect(result.satisfied).toBe(false);
    expect(result.needsReview).toBe(false);
  });

  it("allows a transition when recent logs satisfy the natural language condition", () => {
    const result = evaluate(createService(), {
      recentLogs: ["카엘: 북쪽 철문을 열었다 => 철문이 천천히 열립니다."],
    });

    expect(result.satisfied).toBe(true);
  });
});
