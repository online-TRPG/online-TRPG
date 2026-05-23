import { ReadyActionService } from "./ready-action.service";

describe("ReadyActionService", () => {
  const service = new ReadyActionService();

  it("creates a pending ready action that consumes the original action and later reaction", () => {
    expect(
      service.createPendingReadyAction({
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 2,
        turnNo: 3,
        reactionAvailable: true,
        trigger: {
          type: "creature_enters_range",
          targetParticipantId: "monster-1",
          rangeFt: 30,
          tags: ["enemy"],
        },
        heldAction: {
          type: "attack",
          targetParticipantId: "monster-1",
        },
      }),
    ).toMatchObject({
      accepted: true,
      spendOriginalAction: "action",
      pending: {
        id: "reaction:ready:participant-1:2:3",
        type: "ready_action",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 2,
        turnNo: 3,
        consumesReaction: true,
        expiresAtRound: 3,
        expiresAtTurn: 3,
      },
    });
  });

  it("rejects ready actions when no reaction is available", () => {
    expect(
      service.createPendingReadyAction({
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        reactionAvailable: false,
        trigger: { type: "manual" },
        heldAction: { type: "attack" },
      }),
    ).toEqual({ accepted: false, rejectedReason: "reaction_unavailable" });
  });

  it("rejects invalid held spell actions", () => {
    expect(
      service.createPendingReadyAction({
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        roundNo: 1,
        turnNo: 1,
        reactionAvailable: true,
        trigger: { type: "enemy_casts_spell" },
        heldAction: { type: "cast_spell" },
      }),
    ).toEqual({ accepted: false, rejectedReason: "invalid_held_action" });
  });

  it("matches a trigger and asks the actor to execute or cancel", () => {
    const created = service.createPendingReadyAction({
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 2,
      turnNo: 3,
      reactionAvailable: true,
      trigger: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        rangeFt: 30,
      },
      heldAction: { type: "attack" },
    });
    if (!created.accepted) {
      throw new Error("expected accepted ready action");
    }

    expect(
      service.resolveTrigger(created.pending, {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        distanceFt: 25,
        roundNo: 2,
        turnNo: 4,
      }),
    ).toEqual({
      pendingId: "reaction:ready:participant-1:2:3",
      expired: false,
      triggered: true,
      reason: "trigger_matched",
      shouldPromptActor: true,
    });
  });

  it("expires pending ready actions after their expiry turn", () => {
    const created = service.createPendingReadyAction({
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 2,
      turnNo: 3,
      reactionAvailable: true,
      trigger: { type: "manual" },
      heldAction: { type: "custom", description: "Pull the lever." },
    });
    if (!created.accepted) {
      throw new Error("expected accepted ready action");
    }

    expect(
      service.resolveTrigger(created.pending, {
        type: "manual",
        roundNo: 3,
        turnNo: 4,
      }),
    ).toMatchObject({
      expired: true,
      triggered: false,
      reason: "expired",
      shouldPromptActor: false,
    });
  });
});
