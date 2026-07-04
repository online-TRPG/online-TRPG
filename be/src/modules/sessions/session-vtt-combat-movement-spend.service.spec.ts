import { ForbiddenException } from "@nestjs/common";
import { SessionVttCombatMovementSpendService } from "./session-vtt-combat-movement-spend.service";

describe("SessionVttCombatMovementSpendService", () => {
  const prisma = {
    sessionCharacter: {
      findMany: jest.fn(),
    },
    combatTurnState: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new SessionVttCombatMovementSpendService(prisma as never);
  const activeCombat = {
    id: "combat-1",
    participants: [
      {
        id: "participant-1",
        sessionCharacterId: "session-character-1",
        speedFt: 20,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing without active combat or movement spends", async () => {
    await service.spend(null, []);
    await service.spend(activeCombat as never, []);

    expect(prisma.sessionCharacter.findMany).not.toHaveBeenCalled();
    expect(prisma.combatTurnState.upsert).not.toHaveBeenCalled();
  });

  it("merges movement spends by participant and uses character speed", async () => {
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        character: { speed: 35 },
      },
    ]);
    prisma.combatTurnState.upsert.mockResolvedValue({ movementFtSpent: 10 });

    await service.spend(activeCombat as never, [
      {
        combatId: "combat-1",
        combatParticipantId: "participant-1",
        roundNo: 2,
        turnNo: 3,
        sessionCharacterId: "session-character-1",
        distanceFt: 5,
      },
      {
        combatId: "combat-1",
        combatParticipantId: "participant-1",
        roundNo: 2,
        turnNo: 3,
        sessionCharacterId: "session-character-1",
        distanceFt: 10,
      },
    ]);

    expect(prisma.sessionCharacter.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["session-character-1"] } },
      select: { id: true, character: { select: { speed: true } } },
    });
    expect(prisma.combatTurnState.upsert).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: {
          combatId: "combat-1",
          roundNo: 2,
          turnNo: 3,
          combatParticipantId: "participant-1",
        },
      },
      create: {
        combatId: "combat-1",
        combatParticipantId: "participant-1",
        roundNo: 2,
        turnNo: 3,
        sessionCharacterId: "session-character-1",
      },
      update: {},
    });
    expect(prisma.combatTurnState.update).toHaveBeenCalledWith({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: {
          combatId: "combat-1",
          roundNo: 2,
          turnNo: 3,
          combatParticipantId: "participant-1",
        },
      },
      data: { movementFtSpent: { increment: 15 } },
    });
  });

  it("rejects movement beyond remaining speed", async () => {
    prisma.sessionCharacter.findMany.mockResolvedValue([]);
    prisma.combatTurnState.upsert.mockResolvedValue({ movementFtSpent: 25 });

    await expect(
      service.spend(activeCombat as never, [
        {
          combatId: "combat-1",
          combatParticipantId: "participant-1",
          roundNo: 1,
          turnNo: 1,
          sessionCharacterId: null,
          distanceFt: 10,
        },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.combatTurnState.update).not.toHaveBeenCalled();
  });
});
