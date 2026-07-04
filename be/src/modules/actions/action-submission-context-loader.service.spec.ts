import {
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { ActionScope, ActionInputType, SubmitActionDto } from "@trpg/shared-types";
import { ActionSubmissionContextLoaderService } from "./action-submission-context-loader.service";

describe("ActionSubmissionContextLoaderService", () => {
  const prisma = {
    sessionParticipant: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    sessionCharacter: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    combat: {
      findFirst: jest.fn(),
    },
  };
  const commandParser = {
    parse: jest.fn(() => ({ type: "freeform" })),
  };
  const service = new ActionSubmissionContextLoaderService(
    prisma as never,
    commandParser as never,
  );

  const dto: SubmitActionDto = {
    characterId: "session-character-1",
    rawText: "행동합니다",
    actionScope: ActionScope.PARTY_SHARED,
    inputType: ActionInputType.TEXT,
    clientCreatedAt: "2026-05-14T01:00:00.000Z",
  };

  const activeCharacter = {
    id: "session-character-1",
    characterId: "character-1",
    userId: "user-1",
    status: PrismaSessionCharacterStatus.ACTIVE,
    currentHp: 10,
    character: {
      ownerUserId: "user-1",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads a party shared submit action context", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.HOST,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionParticipant.count.mockResolvedValue(2);
    prisma.sessionCharacter.findUnique.mockResolvedValue(activeCharacter);

    await expect(
      service.loadSubmitActionContext({
        sessionId: "session-1",
        userId: "user-1",
        dto,
        phase: PrismaGamePhase.EXPLORATION,
      }),
    ).resolves.toEqual({
      sessionCharacter: activeCharacter,
      actionScope: PrismaActionScope.PARTY_SHARED,
    });
  });

  it("rejects non-host party actions when multiple participants joined", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionParticipant.count.mockResolvedValue(2);
    prisma.sessionCharacter.findUnique.mockResolvedValue(activeCharacter);

    await expect(
      service.loadSubmitActionContext({
        sessionId: "session-1",
        userId: "user-1",
        dto,
        phase: PrismaGamePhase.EXPLORATION,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({ reason: "NOT_PARTY_REPRESENTATIVE" }),
      },
    });
  });

  it("requires current combat turn for individual actions", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue(activeCharacter);
    prisma.combat.findFirst.mockResolvedValue({
      currentParticipantId: "combat-participant-2",
      participants: [
        {
          id: "combat-participant-1",
          sessionCharacterId: activeCharacter.id,
        },
        {
          id: "combat-participant-2",
          sessionCharacterId: "other-session-character",
        },
      ],
    });

    await expect(
      service.loadSubmitActionContext({
        sessionId: "session-1",
        userId: "user-1",
        dto: {
          ...dto,
          actionScope: ActionScope.INDIVIDUAL_TURN,
        },
        phase: PrismaGamePhase.COMBAT,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({ reason: "NOT_YOUR_TURN" }),
      },
    });
  });

  it("loads a GM-selected rest character without ownership checks", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findFirst.mockResolvedValue({
      ...activeCharacter,
      character: {
        ownerUserId: "player-user-1",
      },
    });

    await expect(
      service.loadRestActionContext({
        sessionId: "session-1",
        userId: "gm-user-1",
        characterId: activeCharacter.id,
      }),
    ).resolves.toEqual({
      sessionCharacter: {
        ...activeCharacter,
        character: {
          ownerUserId: "player-user-1",
        },
      },
      isGmOperator: true,
    });
  });

  it("rejects rest requests for another player's character", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue(activeCharacter);

    await expect(
      service.loadRestActionContext({
        sessionId: "session-1",
        userId: "user-1",
        characterId: "other-character",
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({ reason: "CHARACTER_MISMATCH" }),
      },
    });
  });
});
