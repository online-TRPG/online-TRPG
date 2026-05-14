import {
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { ActionInputType, ActionScope, SubmitActionDto } from "@trpg/shared-types";
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
    const realtimeEvents = { emitActionAccepted: jest.fn() };
    const commandParser = { parse: jest.fn(() => ({ type: "freeform" })) };
    const inventoryRuntime = {};

    return {
      service: new ActionsService(
        prisma as never,
        sessionsService as never,
        actionProcessor as never,
        realtimeEvents as never,
        commandParser as never,
        inventoryRuntime as never,
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
