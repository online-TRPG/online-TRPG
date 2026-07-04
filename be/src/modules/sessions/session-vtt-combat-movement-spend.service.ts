import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export type ActiveCombatForVttMovementSpend = Prisma.CombatGetPayload<{
  include: { participants: true };
}>;

export type VttCombatMovementSpend = {
  combatId: string;
  combatParticipantId: string;
  roundNo: number;
  turnNo: number;
  sessionCharacterId: string | null;
  distanceFt: number;
};

@Injectable()
export class SessionVttCombatMovementSpendService {
  constructor(private readonly prisma: PrismaService) {}

  async spend(activeCombat: ActiveCombatForVttMovementSpend | null, movementSpends: VttCombatMovementSpend[]): Promise<void> {
    if (!activeCombat || movementSpends.length === 0) {
      return;
    }

    const distanceByParticipant = this.mergeDistanceByParticipant(movementSpends);
    const characterSpeedBySessionCharacterId = await this.loadCharacterSpeedBySessionCharacterId(
      Array.from(distanceByParticipant.values()),
    );

    for (const spend of distanceByParticipant.values()) {
      const participant = activeCombat.participants.find((candidate) => candidate.id === spend.combatParticipantId);
      const movementFtTotal =
        (spend.sessionCharacterId ? characterSpeedBySessionCharacterId.get(spend.sessionCharacterId) : null) ?? participant?.speedFt ?? 30;
      const turnState = await this.prisma.combatTurnState.upsert({
        where: {
          combatId_roundNo_turnNo_combatParticipantId: {
            combatId: spend.combatId,
            roundNo: spend.roundNo,
            turnNo: spend.turnNo,
            combatParticipantId: spend.combatParticipantId,
          },
        },
        create: {
          combatId: spend.combatId,
          combatParticipantId: spend.combatParticipantId,
          roundNo: spend.roundNo,
          turnNo: spend.turnNo,
          sessionCharacterId: spend.sessionCharacterId,
        },
        update: {},
      });
      if (turnState.movementFtSpent + spend.distanceFt > movementFtTotal) {
        throw new ForbiddenException("Not enough movement remaining for this combat turn.");
      }

      await this.prisma.combatTurnState.update({
        where: {
          combatId_roundNo_turnNo_combatParticipantId: {
            combatId: spend.combatId,
            roundNo: spend.roundNo,
            turnNo: spend.turnNo,
            combatParticipantId: spend.combatParticipantId,
          },
        },
        data: { movementFtSpent: { increment: spend.distanceFt } },
      });
    }
  }

  private mergeDistanceByParticipant(movementSpends: VttCombatMovementSpend[]): Map<string, VttCombatMovementSpend> {
    const distanceByParticipant = new Map<string, VttCombatMovementSpend>();
    for (const spend of movementSpends) {
      const current = distanceByParticipant.get(spend.combatParticipantId);
      distanceByParticipant.set(spend.combatParticipantId, {
        ...spend,
        distanceFt: (current?.distanceFt ?? 0) + spend.distanceFt,
      });
    }
    return distanceByParticipant;
  }

  private async loadCharacterSpeedBySessionCharacterId(movementSpends: VttCombatMovementSpend[]): Promise<Map<string, number>> {
    const sessionCharacterIds = Array.from(
      new Set(
        movementSpends
          .map((spend) => spend.sessionCharacterId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const sessionCharacters = sessionCharacterIds.length
      ? await this.prisma.sessionCharacter.findMany({
          where: { id: { in: sessionCharacterIds } },
          select: { id: true, character: { select: { speed: true } } },
        })
      : [];

    return new Map(sessionCharacters.map((entry) => [entry.id, entry.character.speed]));
  }
}
