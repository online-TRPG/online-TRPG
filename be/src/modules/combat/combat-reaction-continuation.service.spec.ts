import { CombatStatus } from "@trpg/shared-types";
import { CombatReactionContinuationService } from "./combat-reaction-continuation.service";

describe("CombatReactionContinuationService", () => {
  it("allows auto turn end only when the continuation permits it and no reaction is pending", () => {
    const service = new CombatReactionContinuationService();

    expect(
      service.shouldAutoEndTurnAfterContinuation({
        autoEndTurn: true,
        combatStatus: CombatStatus.ACTIVE,
        hasPendingCombatReaction: false,
      }),
    ).toBe(true);

    expect(
      service.shouldAutoEndTurnAfterContinuation({
        autoEndTurn: false,
        combatStatus: CombatStatus.ACTIVE,
        hasPendingCombatReaction: false,
      }),
    ).toBe(false);

    expect(
      service.shouldAutoEndTurnAfterContinuation({
        autoEndTurn: true,
        combatStatus: CombatStatus.ENDED,
        hasPendingCombatReaction: false,
      }),
    ).toBe(false);

    expect(
      service.shouldAutoEndTurnAfterContinuation({
        autoEndTurn: true,
        combatStatus: CombatStatus.ACTIVE,
        hasPendingCombatReaction: true,
      }),
    ).toBe(false);
  });

  it("formats the turn-end suffix from the same policy", () => {
    const service = new CombatReactionContinuationService();

    expect(
      service.getAutoEndTurnMessageSuffix({
        autoEndTurn: true,
        combatStatus: CombatStatus.ACTIVE,
        hasPendingCombatReaction: false,
      }),
    ).toBe(" / 턴 종료");

    expect(
      service.getAutoEndTurnMessageSuffix({
        autoEndTurn: true,
        combatStatus: CombatStatus.ACTIVE,
        hasPendingCombatReaction: true,
      }),
    ).toBe("");
  });
});
