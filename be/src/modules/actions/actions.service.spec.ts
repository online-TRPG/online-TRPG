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
    const diceService = { roll: jest.fn() };
    const conditionRuntime = {};
    const mapRuntimeService = {};
    const actionEconomy = {};

    return {
      service: new ActionsService(
        prisma as never,
        sessionsService as never,
        actionProcessor as never,
        realtimeEvents as never,
        commandParser as never,
        inventoryRuntime as never,
        turnLogsService as never,
        diceService as never,
        conditionRuntime as never,
        mapRuntimeService as never,
        actionEconomy as never,
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
    const diceService = { roll: jest.fn() };
    const conditionRuntime = {};
    const mapRuntimeService = {};
    const actionEconomy = {};

    return {
      service: new ActionsService(
        prisma as never,
        sessionsService as never,
        actionProcessor as never,
        realtimeEvents as never,
        commandParser as never,
        inventoryRuntime as never,
        turnLogsService as never,
        diceService as never,
        conditionRuntime as never,
        mapRuntimeService as never,
        actionEconomy as never,
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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
      clientCreatedAt: new Date(),
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

  it("expires a stale rest approval before a GM can approve it", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
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
      clientCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 1 });
    deps.turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-expired" });

    await expect(
      deps.service.approveRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "REST_APPROVAL_EXPIRED" },
      },
    });
    expect(deps.prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_APPROVAL_EXPIRED",
        processedAt: expect.any(Date),
      },
    });
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        playerActionId: "approval-action-1",
        actorUserId: null,
        structuredAction: expect.objectContaining({
          type: "rest_approval",
          requestActionId: "approval-action-1",
          approvalStatus: "expired",
        }),
        outcome: ActionOutcome.NO_ROLL,
      }),
    );
    expect(deps.realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { turnLogId: "turn-log-expired" },
    );
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("lets a HUMAN GM reject a pending rest request without processing it", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
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
      rawText: "/rest short 2",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date(),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 1 });
    deps.turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-rejection" });

    await expect(
      deps.service.rejectRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: ActionQueueStatus.FAILED,
      baseStateVersion: 11,
      restApproval: {
        actionId: "approval-action-1",
        restType: "short",
        status: "rejected",
        hitDiceToSpend: 2,
      },
    });
    expect(deps.prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_REJECTED_BY_GM",
        processedAt: expect.any(Date),
      },
    });
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionScenarioId: "session-scenario-1",
        playerActionId: "approval-action-1",
        actorUserId: "gm-user-1",
        sessionCharacterId: "session-character-1",
        structuredAction: {
          type: "rest_approval",
          requestActionId: "approval-action-1",
          restType: "short",
          approvalStatus: "rejected",
          hitDiceToSpend: 2,
        },
        outcome: ActionOutcome.NO_ROLL,
      }),
    );
    expect(deps.realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { turnLogId: "turn-log-rejection" },
    );
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("rejects duplicate rest rejection after another GM resolves the request", async () => {
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
      rawText: "/rest long",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date(),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      deps.service.rejectRestAction("gm-user-1", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "REST_APPROVAL_ALREADY_CLAIMED" },
      },
    });
    expect(deps.turnLogsService.createTurnLog).not.toHaveBeenCalled();
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("rejects rest rejection from a joined non-GM participant", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });

    await expect(
      deps.service.rejectRestAction("player-user-2", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "GM_PERMISSION_REQUIRED" },
      },
    });
    expect(deps.prisma.playerAction.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.playerAction.updateMany).not.toHaveBeenCalled();
  });

  it("lets the requester cancel a pending HUMAN GM rest request", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: { phase: PrismaGamePhase.EXPLORATION, version: 12 },
    });
    deps.prisma.playerAction.findUnique.mockResolvedValue({
      id: "approval-action-1",
      sessionId: "session-1",
      userId: "player-user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest long",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date(),
    });
    deps.prisma.playerAction.updateMany.mockResolvedValue({ count: 1 });
    deps.turnLogsService.createTurnLog.mockResolvedValue({ turnLogId: "turn-log-cancel" });

    await expect(
      deps.service.cancelRestAction("player-user-1", "session-1", "approval-action-1"),
    ).resolves.toMatchObject({
      playerActionId: "approval-action-1",
      sessionId: "session-1",
      queueStatus: ActionQueueStatus.FAILED,
      restApproval: {
        actionId: "approval-action-1",
        restType: "long",
        status: "cancelled",
        hitDiceToSpend: null,
      },
    });
    expect(deps.prisma.playerAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-action-1",
        userId: "player-user-1",
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_CANCELLED_BY_REQUESTER",
        processedAt: expect.any(Date),
      },
    });
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        playerActionId: "approval-action-1",
        actorUserId: "player-user-1",
        sessionCharacterId: "session-character-1",
        structuredAction: {
          type: "rest_approval",
          requestActionId: "approval-action-1",
          restType: "long",
          approvalStatus: "cancelled",
        },
        outcome: ActionOutcome.NO_ROLL,
      }),
    );
    expect(deps.realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      { turnLogId: "turn-log-cancel" },
    );
    expect(deps.actionProcessor.processNext).not.toHaveBeenCalled();
  });

  it("rejects cancelling another requester's pending rest", async () => {
    const deps = createService();
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
      gmMode: PrismaGmMode.HUMAN,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.prisma.playerAction.findUnique.mockResolvedValue({
      id: "approval-action-1",
      sessionId: "session-1",
      userId: "player-user-1",
      sessionCharacterId: "session-character-1",
      rawText: "/rest long",
      queueStatus: PrismaActionQueueStatus.REJECTED,
      failureReason: "REST_REQUIRES_GM_APPROVAL",
      baseStateVersion: 11,
      clientCreatedAt: new Date(),
    });

    await expect(
      deps.service.cancelRestAction("player-user-2", "session-1", "approval-action-1"),
    ).rejects.toMatchObject({
      response: {
        code: "ACTION_403",
        data: { reason: "REST_REQUESTER_REQUIRED" },
      },
    });
    expect(deps.prisma.playerAction.updateMany).not.toHaveBeenCalled();
    expect(deps.turnLogsService.createTurnLog).not.toHaveBeenCalled();
  });
});

describe("ActionsService.useInventoryItem P3 spell items", () => {
  const buildCharacter = () => ({
    id: "character-1",
    ownerUserId: "user-1",
    scenarioId: null,
    name: "Hero",
    ancestry: "Human",
    className: "wizard",
    subclassName: null,
    level: 8,
    bio: null,
    abilitiesJson: JSON.stringify({ str: 10, dex: 14, con: 12, int: 18, wis: 10, cha: 10 }),
    proficiencyBonus: 3,
    proficientSkillsJson: "[]",
    featuresJson: "[]",
    inventoryJson: "[]",
    maxHp: 50,
    armorClass: 14,
    speed: 30,
    spellsJson: null,
    equippedWeaponId: null,
    offhandWeaponId: null,
    avatarType: "PRESET",
    avatarPresetId: null,
    avatarUrl: null,
  });

  const buildSessionCharacterForMap = () => ({
    id: "session-character-1",
    sessionId: "session-1",
    userId: "user-1",
    characterId: "character-1",
    status: PrismaSessionCharacterStatus.ACTIVE,
    currentHp: 42,
    tempHp: 0,
    conditionsJson: "[]",
    inventorySnapshotJson: "[]",
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    character: buildCharacter(),
    inventoryEntries: [],
  });

  const buildItem = (itemDefinitionId: string, name: string) => ({
    id: "item-entry-1",
    sessionCharacterId: "session-character-1",
    itemDefinitionId,
    quantity: 1,
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    itemDefinition: {
      id: itemDefinitionId,
      name,
      itemType: "magic_item",
      propertiesJson: "[]",
      description: null,
      weightLb: null,
      volumeCuFt: null,
      damageDice: null,
      damageType: null,
      armorClassBase: null,
      armorClassBonus: null,
      armorStrengthRequirement: null,
      armorStealthDisadvantage: null,
      useEffect: null,
      packContentsJson: null,
    },
  });

  const createService = () => {
    const prisma = {
      sessionCharacter: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      inventoryEntry: { findFirst: jest.fn() },
      item: { findUnique: jest.fn() },
      gameState: { update: jest.fn() },
      combat: { findFirst: jest.fn() },
      combatParticipant: { update: jest.fn() },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn(),
      ensureMembership: jest.fn(),
      getGameStateEntityOrThrow: jest.fn(),
      getVttMapForUser: jest.fn(),
      buildSnapshot: jest.fn(),
    };
    const realtimeEvents = {
      emitActionAccepted: jest.fn(),
      emitTurnLogCreated: jest.fn(),
      emitCharacterUpdated: jest.fn(),
      emitDiceRolled: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const turnLogsService = { createTurnLog: jest.fn() };
    const diceService = { roll: jest.fn() };
    const mapRuntimeService = { saveSystemVttMap: jest.fn() };
    const actionEconomy = { spendAction: jest.fn(), spendBonusAction: jest.fn() };
    const service = new ActionsService(
      prisma as never,
      sessionsService as never,
      { processNext: jest.fn() } as never,
      realtimeEvents as never,
      { parse: jest.fn() } as never,
      { removeItem: jest.fn() } as never,
      turnLogsService as never,
      diceService as never,
      {
        parseConditionsJson: jest.fn(() => []),
        applyCondition: jest.fn((conditions, condition) => [...conditions, condition]),
        createCondition: jest.fn((condition) => condition),
      } as never,
      mapRuntimeService as never,
      actionEconomy as never,
    );
    return {
      service,
      prisma,
      sessionsService,
      realtimeEvents,
      turnLogsService,
      diceService,
      mapRuntimeService,
      actionEconomy,
    };
  };

  const setupBase = (
    deps: ReturnType<typeof createService>,
    itemDefinitionId: string,
    itemName: string,
    flags: Record<string, unknown> = {},
  ) => {
    const actor = {
      id: "participant-actor",
      combatId: "combat-1",
      entityType: "PLAYER",
      sessionCharacterId: "session-character-1",
      tokenId: "token-actor",
      nameSnapshot: "Hero",
      currentHp: 42,
      maxHp: 50,
      armorClass: 14,
      speedFt: 30,
      conditionsJson: "[]",
      initiative: 15,
      turnOrder: 1,
      isAlive: true,
      isHostile: false,
      turnEndedAt: null,
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    };
    const target = {
      ...actor,
      id: "participant-target",
      sessionCharacterId: null,
      tokenId: "token-target",
      nameSnapshot: "Target",
      currentHp: 30,
      maxHp: 30,
      isHostile: true,
      turnOrder: 2,
    };
    const farTarget = {
      ...target,
      id: "participant-far",
      tokenId: "token-far",
      nameSnapshot: "Far Target",
      currentHp: 18,
      maxHp: 18,
      turnOrder: 3,
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      status: "ACTIVE",
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: "participant-actor",
      participants: [actor, target, farTarget],
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    };
    deps.sessionsService.getSessionEntityOrThrow.mockResolvedValue({
      id: "session-1",
      status: PrismaSessionStatus.PLAYING,
    });
    deps.sessionsService.ensureMembership.mockResolvedValue(undefined);
    deps.sessionsService.getGameStateEntityOrThrow.mockResolvedValue({
      sessionScenario: { id: "session-scenario-1" },
      state: {
        sessionScenarioId: "session-scenario-1",
        flagsJson: JSON.stringify(flags),
      },
    });
    deps.sessionsService.getVttMapForUser.mockResolvedValue({
      id: "map-1",
      gridSize: 64,
      width: 1024,
      height: 768,
      tokens: [
        { id: "token-actor", sessionCharacterId: "session-character-1", x: 128, y: 128, size: 64 },
        { id: "token-target", sessionCharacterId: null, x: 256, y: 128, size: 64 },
        { id: "token-far", sessionCharacterId: null, x: 896, y: 640, size: 64 },
      ],
      terrainCells: [],
      updatedAt: "2026-06-22T00:00:00.000Z",
    });
    deps.sessionsService.buildSnapshot.mockResolvedValue({ session: { id: "session-1" } });
    deps.prisma.sessionCharacter.findUnique.mockResolvedValue(buildSessionCharacterForMap());
    deps.prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue(buildSessionCharacterForMap());
    deps.prisma.inventoryEntry.findFirst.mockResolvedValue(buildItem(itemDefinitionId, itemName));
    deps.prisma.item.findUnique.mockResolvedValue(null);
    deps.prisma.combat.findFirst.mockResolvedValue(combat);
    deps.prisma.combatParticipant.update.mockResolvedValue({});
    deps.prisma.sessionCharacter.update.mockResolvedValue({});
    deps.prisma.gameState.update.mockResolvedValue({});
    deps.turnLogsService.createTurnLog.mockImplementation((input) =>
      Promise.resolve({ id: "turn-log-1", ...input }),
    );
    return { actor, target, farTarget, combat };
  };

  it("casts Wand of Magic Missiles at a selected participant, spends a charge, and logs damage", async () => {
    const deps = createService();
    setupBase(deps, "magic_item.wand_of_magic_missiles", "Wand of Magic Missiles");
    deps.diceService.roll.mockReturnValue({
      expression: "3d4+3",
      total: 12,
      rolls: [],
    });

    await expect(
      deps.service.useInventoryItem("user-1", "session-1", {
        itemId: "item-entry-1",
        targetParticipantId: "participant-target",
      }),
    ).resolves.toMatchObject({
      consumedQuantity: 0,
      message: expect.stringContaining("12 피해"),
    });

    expect(deps.actionEconomy.spendAction).toHaveBeenCalledWith(
      expect.objectContaining({
        combatId: "combat-1",
        combatParticipantId: "participant-actor",
      }),
    );
    expect(deps.prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-target" },
      data: { currentHp: 18, isAlive: true },
    });
    expect(deps.prisma.gameState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionScenarioId: "session-scenario-1" },
        data: {
          flagsJson: JSON.stringify({
            p3ItemRuntime: {
              attunedItemEntryIdsByCharacter: {},
              chargesByItemEntryId: { "item-entry-1": 6 },
            },
          }),
        },
      }),
    );
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          type: "item_spell",
          spellId: "spell.magic_missile",
          targetParticipantIds: ["participant-target"],
          remainingCharges: 6,
        }),
        stateDiff: {
          damagedParticipants: [{ participantId: "participant-target", damage: 12 }],
        },
      }),
    );
    expect(deps.realtimeEvents.emitDiceRolled).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ total: 12 }),
    );
  });

  it("casts an attuned Wand of Fireballs at a point and damages only participants in the blast radius", async () => {
    const deps = createService();
    setupBase(
      deps,
      "magic_item.wand_of_fireballs",
      "Wand of Fireballs",
      {
        p3ItemRuntime: {
          attunedItemEntryIdsByCharacter: {
            "session-character-1": ["item-entry-1"],
          },
          chargesByItemEntryId: {
            "item-entry-1": 3,
          },
        },
      },
    );
    deps.diceService.roll.mockReturnValue({
      expression: "8d6",
      total: 28,
      rolls: [],
    });

    await deps.service.useInventoryItem("user-1", "session-1", {
      itemId: "item-entry-1",
      point: { x: 256, y: 128 },
    });

    expect(deps.prisma.combatParticipant.update).toHaveBeenCalledTimes(2);
    expect(deps.prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-actor" },
      data: { currentHp: 14, isAlive: true },
    });
    expect(deps.prisma.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-target" },
      data: { currentHp: 2, isAlive: true },
    });
    expect(deps.prisma.combatParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "participant-far" } }),
    );
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          spellId: "spell.fireball",
          point: { x: 256, y: 128 },
          targetParticipantIds: ["participant-actor", "participant-target"],
          remainingCharges: 2,
        }),
      }),
    );
  });

  it("casts an attuned Wand of Web at a point and persists a terrain cell", async () => {
    const deps = createService();
    setupBase(
      deps,
      "magic_item.wand_of_web",
      "Wand of Web",
      {
        p3ItemRuntime: {
          attunedItemEntryIdsByCharacter: {
            "session-character-1": ["item-entry-1"],
          },
          chargesByItemEntryId: {
            "item-entry-1": 2,
          },
        },
      },
    );

    await expect(
      deps.service.useInventoryItem("user-1", "session-1", {
        itemId: "item-entry-1",
        point: { x: 320, y: 256 },
      }),
    ).resolves.toMatchObject({
      message: expect.stringContaining("거미줄 영역"),
    });

    expect(deps.mapRuntimeService.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        terrainCells: expect.arrayContaining([
          expect.objectContaining({
            name: "Wand of Web",
            terrainEffectId: "terrain.difficult",
          }),
        ]),
      }),
    );
    expect(deps.turnLogsService.createTurnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAction: expect.objectContaining({
          spellId: "spell.web",
          terrainEffectId: "terrain.difficult",
          remainingCharges: 1,
        }),
        stateDiff: {
          terrainEffectId: "terrain.difficult",
          point: { x: 320, y: 256 },
          sizeFt: 20,
        },
      }),
    );
  });
});
