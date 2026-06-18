import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionInputType,
  ActionOutcome,
  ActionQueueStatus,
  ActionScope,
  RestActionDto,
  SubmitActionDto,
} from "@trpg/shared-types";
import { ActionsService } from "./actions.service";

const baseDto: SubmitActionDto = {
  characterId: "session-character-1",
  rawText: "테스트 행동",
  actionScope: ActionScope.INDIVIDUAL_TURN,
  inputType: ActionInputType.TEXT,
  clientCreatedAt: "2026-05-14T01:00:00.000Z",
};

const buildSessionCharacter = (overrides: Partial<{ currentHp: number; ownerUserId: string }> = {}) => ({
  id: "session-character-1",
  userId: "user-1",
  characterId: "character-1",
  status: PrismaSessionCharacterStatus.ACTIVE,
  currentHp: overrides.currentHp ?? 10,
  character: { ownerUserId: overrides.ownerUserId ?? "user-1" },
});

describe("ActionsService.submitAction turn permission", () => {
  const createService = () => {
    const prisma = {
      sessionParticipant: { findUnique: jest.fn() },
      sessionCharacter: { findUnique: jest.fn() },
      combat: { findFirst: jest.fn() },
      playerAction: { create: jest.fn() },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn(),
      ensureMembership: jest.fn(),
      getGameStateEntityOrThrow: jest.fn(),
    };
    const actionProcessor = { processNext: jest.fn() };
    const realtimeEvents = { emitActionAccepted: jest.fn(), emitTurnLogCreated: jest.fn() };
    const commandParser = { parse: jest.fn(() => ({ type: "freeform" })) };
    const inventoryRuntime = {};
    const turnLogsService = { createTurnLog: jest.fn() };

    return {
      service: new ActionsService(
        prisma as never,
        sessionsService as never,
        actionProcessor as never,
        realtimeEvents as never,
        commandParser as never,
        inventoryRuntime as never,
        turnLogsService as never,
      ),
      prisma,
      sessionsService,
    };
  };

  const setupHappyPath = (deps: ReturnType<typeof createService>) => {
    const { prisma, sessionsService } = deps;
    sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    sessionsService.ensureMembership.mockResolvedValue(undefined);
    sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { phase: PrismaGamePhase.COMBAT, version: 1 },
    });
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.combat.findFirst.mockResolvedValue({
      id: "combat-1",
      status: "ACTIVE",
      currentParticipantId: "participant-1",
      participants: [{ id: "participant-1", sessionCharacterId: "session-character-1" }],
    });
  };

  it("blocks an incapacitated character (HP <= 0) during combat with CHARACTER_INCAPACITATED", async () => {
    const deps = createService();
    setupHappyPath(deps);
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(
      buildSessionCharacter({ currentHp: 0 }),
    );

    await expect(deps.service.submitAction("user-1", "session-1", baseDto)).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "CHARACTER_INCAPACITATED" },
      },
    });
    expect(deps.prisma.playerAction.create).not.toHaveBeenCalled();
  });

  it("blocks ownership mismatch with CHARACTER_OWNERSHIP_MISMATCH", async () => {
    const deps = createService();
    setupHappyPath(deps);
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(
      buildSessionCharacter({ ownerUserId: "another-user" }),
    );

    await expect(deps.service.submitAction("user-1", "session-1", baseDto)).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "CHARACTER_OWNERSHIP_MISMATCH" },
      },
    });
  });

  it("blocks non-current turn with NOT_YOUR_TURN", async () => {
    const deps = createService();
    setupHappyPath(deps);
    // 다른 참가자가 currentParticipant 인 상황
    deps.prisma.combat.findFirst.mockResolvedValue({
      id: "combat-1",
      status: "ACTIVE",
      currentParticipantId: "participant-2",
      participants: [
        { id: "participant-1", sessionCharacterId: "session-character-1" },
        { id: "participant-2", sessionCharacterId: "session-character-2" },
      ],
    });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacter());

    await expect(deps.service.submitAction("user-1", "session-1", baseDto)).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "NOT_YOUR_TURN" },
      },
    });
  });
});

describe("ActionsService.submitRestAction", () => {
  const createService = () => {
    const prisma = {
      sessionParticipant: { findUnique: jest.fn() },
      sessionCharacter: { findUnique: jest.fn(), findFirst: jest.fn() },
      combat: { findFirst: jest.fn() },
      playerAction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn(),
      ensureMembership: jest.fn(),
      getGameStateEntityOrThrow: jest.fn(),
    };
    const actionProcessor = { processNext: jest.fn() };
    const realtimeEvents = { emitActionAccepted: jest.fn(), emitTurnLogCreated: jest.fn() };
    const commandParser = { parse: jest.fn(() => ({ type: "rest", restType: "short" })) };
    const inventoryRuntime = {};
    const turnLogsService = { createTurnLog: jest.fn() };

    return {
      service: new ActionsService(
        prisma as never,
        sessionsService as never,
        actionProcessor as never,
        realtimeEvents as never,
        commandParser as never,
        inventoryRuntime as never,
        turnLogsService as never,
      ),
      prisma,
      sessionsService,
      actionProcessor,
      realtimeEvents,
      turnLogsService,
    };
  };

  const dto: RestActionDto = {
    characterId: "session-character-1",
    restType: "short",
  };

  it("queues a rest slash command for AI GM sessions", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.EXPLORATION, version: 7 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacter());
    deps.prisma.playerAction.create.mockResolvedValue({
      id: "action-1",
      userId: "user-1",
      rawText: "/rest short",
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });

    await expect(deps.service.submitRestAction("user-1", "session-1", dto)).resolves.toMatchObject({
      playerActionId: "action-1",
      sessionId: "session-1",
      baseStateVersion: 7,
    });
    expect(deps.prisma.playerAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          sessionCharacterId: "session-character-1",
          rawText: "/rest short",
          actionScope: PrismaActionScope.PARTY_SHARED,
          inputType: PrismaActionInputType.COMMAND,
        }),
      }),
    );
    expect(deps.actionProcessor.processNext).toHaveBeenCalledWith("session-1");
  });

  it("includes requested hit dice spending in the queued short rest command", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.EXPLORATION, version: 7 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacter());
    deps.prisma.playerAction.create.mockResolvedValue({
      id: "action-1",
      userId: "user-1",
      rawText: "/rest short 2",
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });

    await deps.service.submitRestAction("user-1", "session-1", {
      ...dto,
      hitDiceToSpend: 2,
    });

    expect(deps.prisma.playerAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawText: "/rest short 2",
        }),
      }),
    );
  });

  it("records a HUMAN GM rest approval request without processing the rest", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { phase: PrismaGamePhase.EXPLORATION, version: 11 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacter());
    deps.prisma.playerAction.create.mockResolvedValue({
      id: "approval-action-1",
      userId: "user-1",
      rawText: "/rest short",
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });
    deps.turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-1" });

    await expect(deps.service.submitRestAction("user-1", "session-1", dto)).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: ActionQueueStatus.REJECTED,
      baseStateVersion: 11,
      restApproval: {
        actionId: "approval-action-1",
        restType: "short",
        status: "gm_required",
        hitDiceToSpend: null,
      },
    });
    expect(deps.prisma.playerAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawText: "/rest short",
          queueStatus: PrismaActionQueueStatus.REJECTED,
          failureReason: "REST_REQUIRES_GM_APPROVAL",
        }),
      }),
    );
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        playerActionId: "approval-action-1",
        actorUserId: "user-1",
        sessionCharacterId: "session-character-1",
        rawInput: "/rest short",
        outcome: ActionOutcome.NO_ROLL,
        structuredAction: expect.objectContaining({
          type: "rest",
          restType: "short",
          approvalStatus: "gm_required",
        }),
      }),
    );
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("rejects rest immediately while the session is in combat", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.AI,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.COMBAT, version: 8 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacter());

    await expect(deps.service.submitRestAction("user-1", "session-1", dto)).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "REST_BLOCKED_IN_COMBAT" },
      },
    });
    expect(deps.prisma.playerAction.create).not.toHaveBeenCalled();
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("lets a HUMAN GM approve rest for a target session character", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.EXPLORATION, version: 9 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.sessionCharacter.findFirst.mockResolvedValue({
      ...buildSessionCharacter(),
      userId: "player-user-1",
    });
    deps.prisma.playerAction.create.mockResolvedValue({
      id: "action-2",
      userId: "player-user-1",
      rawText: "/rest long",
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });

    await deps.service.submitRestAction("gm-user-1", "session-1", {
      characterId: "session-character-1",
      restType: "long",
    });

    expect(deps.prisma.playerAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "player-user-1",
          sessionCharacterId: "session-character-1",
          rawText: "/rest long",
        }),
      }),
    );
  });

  it("approves a pending HUMAN GM rest request by re-queueing the original action", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.playerAction.findUnique.mockResolvedValue({
      id: "approval-action-1",
      sessionId: "session-1",
      userId: "player-user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest short 1",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      deps.service.approveRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: 11,
      restApproval: {
        actionId: "approval-action-1",
        restType: "short",
        status: "approved",
        hitDiceToSpend: 1,
      },
    });
    expect(deps.prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.PENDING,
        failureReason: null,
        processedAt: null,
      },
    });
    expect(deps.actionProcessor.processNext).toHaveBeenCalledWith("session-1");
  });

  it("rejects a duplicate HUMAN GM rest approval after another GM claimed it", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.EXPLORATION, version: 12 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.playerAction.findUnique.mockResolvedValue({
      id: "approval-action-1",
      sessionId: "session-1",
      userId: "player-user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest short 1",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      deps.service.approveRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "REST_APPROVAL_ALREADY_CLAIMED" },
      },
    });

    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
    expect(deps.realtimeEvents.emitActionAccepted).not.toHaveBeenCalled();
  });

  it("rejects approving a HUMAN GM rest request after combat starts", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      state: { phase: PrismaGamePhase.COMBAT, version: 12 },
    });
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });
    deps.prisma.playerAction.findUnique.mockResolvedValue({
      id: "approval-action-1",
      sessionId: "session-1",
      userId: "player-user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest short 1",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date("2026-06-14T01:00:00.000Z"),
    });

    await expect(
      deps.service.approveRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "REST_BLOCKED_IN_COMBAT" },
      },
    });
    expect(deps.prisma.playerAction.updateMany).not.toHaveBeenCalled();
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });
});
