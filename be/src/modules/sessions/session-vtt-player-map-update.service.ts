import { ForbiddenException, Injectable } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { ActiveCombatForVttMovementSpend, VttCombatMovementSpend } from "./session-vtt-combat-movement-spend.service";
import { SessionVttMovementPolicyService } from "./session-vtt-movement-policy.service";

@Injectable()
export class SessionVttPlayerMapUpdateService {
  constructor(private readonly movementPolicy: SessionVttMovementPolicyService) {}

  apply(params: {
    baseline: VttMapStateDto;
    comparableBaseline: VttMapStateDto;
    requestedMap: VttMapStateDto;
    controlledTokenIds: Set<string>;
    activeCombat: ActiveCombatForVttMovementSpend | null;
    currentCombatParticipant: ActiveCombatForVttMovementSpend["participants"][number] | null;
  }): { map: VttMapStateDto; movementSpends: VttCombatMovementSpend[] } {
    this.movementPolicy.ensurePlayerMapShellUnchanged({
      baseline: params.baseline,
      comparableBaseline: params.comparableBaseline,
      requested: params.requestedMap,
    });

    const movementSpends: VttCombatMovementSpend[] = [];
    const requestedById = new Map(params.requestedMap.tokens.map((token) => [token.id, token]));
    const nextTokens = params.baseline.tokens.map((token) => {
      const requestedToken = requestedById.get(token.id);
      if (!requestedToken) {
        if (token.hidden === true) {
          return token;
        }
        throw new ForbiddenException("Players cannot remove map tokens.");
      }

      const canMoveToken = Boolean(token.sessionCharacterId && params.controlledTokenIds.has(token.sessionCharacterId));
      if (!canMoveToken) {
        return token;
      }

      this.movementPolicy.ensureOnlyTokenPositionChanged(token, requestedToken);
      this.movementPolicy.ensureTokenPathIsReachable(params.baseline, token, requestedToken);
      if (params.activeCombat && params.currentCombatParticipant) {
        const participant =
          params.activeCombat.participants.find((candidate) => candidate.tokenId === token.id) ??
          params.activeCombat.participants.find((candidate) => candidate.sessionCharacterId === token.sessionCharacterId) ??
          null;
        if (!participant || participant.id !== params.currentCombatParticipant.id) {
          throw new ForbiddenException("Only the current combat actor can move this token.");
        }
        const distanceFt = this.movementPolicy.calculateTokenGridMovementFt(params.baseline, token, requestedToken);
        if (distanceFt > 0) {
          movementSpends.push({
            combatId: params.activeCombat.id,
            combatParticipantId: participant.id,
            roundNo: params.activeCombat.roundNo,
            turnNo: params.activeCombat.turnNo,
            sessionCharacterId: participant.sessionCharacterId,
            distanceFt,
          });
        }
      }
      return {
        ...token,
        x: requestedToken.x,
        y: requestedToken.y,
      };
    });

    if (params.requestedMap.tokens.some((token) => !params.baseline.tokens.some((base) => base.id === token.id))) {
      throw new ForbiddenException("Players cannot add map tokens.");
    }

    return {
      map: {
        ...params.baseline,
        tokens: nextTokens,
        pings: params.requestedMap.pings ?? params.baseline.pings,
        updatedAt: new Date().toISOString(),
      },
      movementSpends,
    };
  }
}
