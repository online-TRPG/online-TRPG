import { Injectable } from "@nestjs/common";
import { CombatStatus } from "@trpg/shared-types";

@Injectable()
export class CombatReactionContinuationService {
  shouldAutoEndTurnAfterContinuation(params: {
    autoEndTurn: boolean;
    combatStatus: CombatStatus;
    hasPendingCombatReaction?: boolean;
  }): boolean {
    return (
      params.autoEndTurn &&
      params.combatStatus === CombatStatus.ACTIVE &&
      !params.hasPendingCombatReaction
    );
  }

  getAutoEndTurnMessageSuffix(params: {
    autoEndTurn: boolean;
    combatStatus: CombatStatus;
    hasPendingCombatReaction?: boolean;
  }): string {
    return this.shouldAutoEndTurnAfterContinuation(params) ? " / 턴 종료" : "";
  }
}
