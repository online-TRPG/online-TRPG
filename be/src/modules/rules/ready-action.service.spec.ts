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

  it("does not treat manual ready triggers as wildcards", () => {
    const created = service.createPendingReadyAction({
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      reactionAvailable: true,
      trigger: { type: "manual" },
      heldAction: { type: "custom", description: "Pull the lever." },
    });
    if (!created.accepted) {
      throw new Error("expected accepted ready action");
    }

    expect(
      service.resolveTrigger(created.pending, {
        type: "creature_enters_range",
        roundNo: 1,
        turnNo: 2,
      }),
    ).toMatchObject({
      triggered: false,
      reason: "trigger_not_matched",
      shouldPromptActor: false,
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

  it("resolves pending ready action lists into triggered, expired, and remaining buckets", () => {
    const triggered = service.createPendingReadyAction({
      actorParticipantId: "triggered",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      reactionAvailable: true,
      trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 30 },
      heldAction: { type: "attack", targetParticipantId: "monster-1" },
    });
    const expired = service.createPendingReadyAction({
      actorParticipantId: "expired",
      actorUserId: "user-2",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      reactionAvailable: true,
      trigger: { type: "enemy_casts_spell" },
      heldAction: { type: "attack" },
      expiresAtRound: 1,
      expiresAtTurn: 2,
    });
    const remaining = service.createPendingReadyAction({
      actorParticipantId: "remaining",
      actorUserId: "user-3",
      combatId: "combat-1",
      roundNo: 1,
      turnNo: 1,
      reactionAvailable: true,
      trigger: { type: "ally_attacked" },
      heldAction: { type: "attack" },
    });
    if (!triggered.accepted || !expired.accepted || !remaining.accepted) {
      throw new Error("expected accepted ready actions");
    }

    expect(
      service.resolvePendingActions(
        [triggered.pending, expired.pending, remaining.pending],
        {
          type: "creature_enters_range",
          targetParticipantId: "monster-1",
          distanceFt: 25,
          roundNo: 1,
          turnNo: 3,
        },
      ),
    ).toMatchObject({
      triggered: [{ pending: { actorParticipantId: "triggered" } }],
      expired: [{ pending: { actorParticipantId: "expired" } }],
      remaining: [{ actorParticipantId: "remaining" }],
    });
  });

  it("materializes triggered ready actions for later accept or decline handling", () => {
    const created = service.createPendingReadyAction({
      actorParticipantId: "participant-1",
      actorUserId: "user-1",
      combatId: "combat-1",
      roundNo: 2,
      turnNo: 3,
      reactionAvailable: true,
      trigger: { type: "creature_enters_range", targetParticipantId: "monster-1", rangeFt: 30 },
      heldAction: { type: "attack", targetParticipantId: "monster-1" },
    });
    if (!created.accepted) {
      throw new Error("expected accepted ready action");
    }

    expect(
      service.createTriggeredReadyAction(created.pending, {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        distanceFt: 25,
        roundNo: 2,
        turnNo: 4,
      }),
    ).toMatchObject({
      id: "triggered:reaction:ready:participant-1:2:3:2:4",
      type: "triggered_ready_action",
      status: "pending_response",
      pending: { id: "reaction:ready:participant-1:2:3" },
      triggeredAtRound: 2,
      triggeredAtTurn: 4,
      triggerEvent: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        distanceFt: 25,
      },
    });
  });
});
