import { Injectable } from "@nestjs/common";

export const PENDING_READY_ACTIONS_FLAG = "pendingReadyActions";
export const TRIGGERED_READY_ACTIONS_FLAG = "triggeredReadyActions";

export type ReadyActionCost = "action" | "bonus_action";

export type ReadyActionTriggerType =
  | "creature_enters_range"
  | "creature_leaves_range"
  | "ally_attacked"
  | "enemy_casts_spell"
  | "manual";

export type ReadyActionTrigger = {
  type: ReadyActionTriggerType;
  sourceParticipantId?: string | null;
  targetParticipantId?: string | null;
  rangeFt?: number | null;
  tags?: string[];
};

export type ReadyHeldAction = {
  type: "attack" | "cast_spell" | "move" | "interact" | "custom";
  actionId?: string | null;
  spellId?: string | null;
  targetParticipantId?: string | null;
  description?: string | null;
};

export type ReadyActionInput = {
  actorParticipantId: string;
  actorUserId: string;
  combatId: string;
  roundNo: number;
  turnNo: number;
  trigger: ReadyActionTrigger;
  heldAction: ReadyHeldAction;
  originalCost?: ReadyActionCost;
  reactionAvailable: boolean;
  expiresAtRound?: number | null;
  expiresAtTurn?: number | null;
};

export type PendingReadyAction = {
  id: string;
  type: "ready_action";
  actorParticipantId: string;
  actorUserId: string;
  combatId: string;
  roundNo: number;
  turnNo: number;
  trigger: ReadyActionTrigger;
  heldAction: ReadyHeldAction;
  originalCost: ReadyActionCost;
  consumesReaction: true;
  expiresAtRound: number;
  expiresAtTurn: number;
  createdAt: string;
};

export type ReadyActionResolution =
  | {
      accepted: true;
      pending: PendingReadyAction;
      spendOriginalAction: ReadyActionCost;
    }
  | {
      accepted: false;
      rejectedReason: "reaction_unavailable" | "invalid_trigger" | "invalid_held_action";
    };

export type ReadyTriggerEvent = {
  type: ReadyActionTriggerType;
  sourceParticipantId?: string | null;
  targetParticipantId?: string | null;
  distanceFt?: number | null;
  tags?: string[];
  roundNo: number;
  turnNo: number;
};

export type ReadyTriggerResolution = {
  pendingId: string;
  expired: boolean;
  triggered: boolean;
  reason: "expired" | "trigger_matched" | "trigger_not_matched";
  shouldPromptActor: boolean;
};

export type ReadyActionListResolution = {
  triggered: Array<{
    pending: PendingReadyAction;
    resolution: ReadyTriggerResolution;
  }>;
  expired: Array<{
    pending: PendingReadyAction;
    resolution: ReadyTriggerResolution;
  }>;
  remaining: PendingReadyAction[];
};

export type TriggeredReadyAction = {
  id: string;
  type: "triggered_ready_action";
  pending: PendingReadyAction;
  triggeredAtRound: number;
  triggeredAtTurn: number;
  triggerEvent: ReadyTriggerEvent;
  status: "pending_response";
  createdAt: string;
};

@Injectable()
export class ReadyActionService {
  createPendingReadyAction(input: ReadyActionInput): ReadyActionResolution {
    if (!input.reactionAvailable) {
      return { accepted: false, rejectedReason: "reaction_unavailable" };
    }
    if (!this.isValidTrigger(input.trigger)) {
      return { accepted: false, rejectedReason: "invalid_trigger" };
    }
    if (!this.isValidHeldAction(input.heldAction)) {
      return { accepted: false, rejectedReason: "invalid_held_action" };
    }

    const originalCost = input.originalCost ?? "action";
    return {
      accepted: true,
      spendOriginalAction: originalCost,
      pending: {
        id: `reaction:ready:${input.actorParticipantId}:${input.roundNo}:${input.turnNo}`,
        type: "ready_action",
        actorParticipantId: input.actorParticipantId,
        actorUserId: input.actorUserId,
        combatId: input.combatId,
        roundNo: input.roundNo,
        turnNo: input.turnNo,
        trigger: {
          ...input.trigger,
          tags: [...(input.trigger.tags ?? [])],
        },
        heldAction: { ...input.heldAction },
        originalCost,
        consumesReaction: true,
        expiresAtRound: input.expiresAtRound ?? input.roundNo + 1,
        expiresAtTurn: input.expiresAtTurn ?? input.turnNo,
        createdAt: new Date(0).toISOString(),
      },
    };
  }

  resolveTrigger(pending: PendingReadyAction, event: ReadyTriggerEvent): ReadyTriggerResolution {
    if (this.isExpired(pending, event)) {
      return {
        pendingId: pending.id,
        expired: true,
        triggered: false,
        reason: "expired",
        shouldPromptActor: false,
      };
    }

    const triggered = this.matchesTrigger(pending.trigger, event);
    return {
      pendingId: pending.id,
      expired: false,
      triggered,
      reason: triggered ? "trigger_matched" : "trigger_not_matched",
      shouldPromptActor: triggered,
    };
  }

  resolvePendingActions(
    pendingActions: PendingReadyAction[],
    event: ReadyTriggerEvent,
  ): ReadyActionListResolution {
    const triggered: ReadyActionListResolution["triggered"] = [];
    const expired: ReadyActionListResolution["expired"] = [];
    const remaining: PendingReadyAction[] = [];

    for (const pending of pendingActions) {
      const resolution = this.resolveTrigger(pending, event);
      if (resolution.expired) {
        expired.push({ pending, resolution });
        continue;
      }
      if (resolution.triggered) {
        triggered.push({ pending, resolution });
        continue;
      }
      remaining.push(pending);
    }

    return { triggered, expired, remaining };
  }

  createTriggeredReadyAction(
    pending: PendingReadyAction,
    event: ReadyTriggerEvent,
  ): TriggeredReadyAction {
    return {
      id: `triggered:${pending.id}:${event.roundNo}:${event.turnNo}`,
      type: "triggered_ready_action",
      pending,
      triggeredAtRound: event.roundNo,
      triggeredAtTurn: event.turnNo,
      triggerEvent: {
        ...event,
        tags: [...(event.tags ?? [])],
      },
      status: "pending_response",
      createdAt: new Date(0).toISOString(),
    };
  }

  private isExpired(pending: PendingReadyAction, event: ReadyTriggerEvent): boolean {
    return event.roundNo > pending.expiresAtRound ||
      (event.roundNo === pending.expiresAtRound && event.turnNo > pending.expiresAtTurn);
  }

  private matchesTrigger(trigger: ReadyActionTrigger, event: ReadyTriggerEvent): boolean {
    if (trigger.type !== event.type) {
      return false;
    }
    if (trigger.sourceParticipantId && trigger.sourceParticipantId !== event.sourceParticipantId) {
      return false;
    }
    if (trigger.targetParticipantId && trigger.targetParticipantId !== event.targetParticipantId) {
      return false;
    }
    if (typeof trigger.rangeFt === "number" && typeof event.distanceFt === "number" && event.distanceFt > trigger.rangeFt) {
      return false;
    }
    const triggerTags = new Set(trigger.tags ?? []);
    return triggerTags.size === 0 || (event.tags ?? []).some((tag) => triggerTags.has(tag));
  }

  private isValidTrigger(trigger: ReadyActionTrigger): boolean {
    return Boolean(trigger.type) &&
      ["creature_enters_range", "creature_leaves_range", "ally_attacked", "enemy_casts_spell", "manual"].includes(trigger.type);
  }

  private isValidHeldAction(action: ReadyHeldAction): boolean {
    if (!["attack", "cast_spell", "move", "interact", "custom"].includes(action.type)) {
      return false;
    }
    if (action.type === "cast_spell") {
      return Boolean(action.spellId);
    }
    if (action.type === "custom") {
      return Boolean(action.description?.trim());
    }
    return true;
  }
}
