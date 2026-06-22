import { Injectable } from "@nestjs/common";

export type GmOverrideKind =
  | "scene_text"
  | "npc_dialogue"
  | "node_move"
  | "combat_start"
  | "combat_end"
  | "monster_control"
  | "set_dc"
  | "adjust_hp"
  | "set_condition"
  | "adjust_item"
  | "reveal_handout"
  | "ai_assist_accept";

export type GmOverrideInput = {
  kind: GmOverrideKind;
  sessionId: string;
  sessionScenarioId: string;
  gmUserId: string;
  publicNarration: string;
  privateNote?: string | null;
  targetId?: string | null;
  statePatch?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type GmOverrideResolution = {
  accepted: true;
  turnLog: {
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    rawInput: string;
    structuredAction: {
      type: "gm_override";
      kind: GmOverrideKind;
      targetId: string | null;
      public: true;
      hasPrivateNote: boolean;
      metadata: Record<string, unknown>;
    };
    outcome: "SUCCESS";
    narration: string;
  };
  stateDiff: {
    reason: string;
    diff: Record<string, unknown>;
  } | null;
  audit: {
    actorUserId: string;
    kind: GmOverrideKind;
    targetId: string | null;
    publicNarration: string;
    privateNote: string | null;
  };
} | {
  accepted: false;
  rejectedReason: "missing_public_narration" | "missing_target" | "missing_state_patch";
};

const TARGET_REQUIRED_KINDS = new Set<GmOverrideKind>([
  "node_move",
  "monster_control",
  "set_dc",
  "adjust_hp",
  "set_condition",
  "adjust_item",
  "reveal_handout",
]);

const STATE_PATCH_REQUIRED_KINDS = new Set<GmOverrideKind>([
  "node_move",
  "combat_start",
  "combat_end",
  "monster_control",
  "set_dc",
  "adjust_hp",
  "set_condition",
  "adjust_item",
  "reveal_handout",
]);

@Injectable()
export class GmOverrideService {
  resolveOverride(input: GmOverrideInput): GmOverrideResolution {
    const publicNarration = input.publicNarration.trim();
    if (!publicNarration) {
      return { accepted: false, rejectedReason: "missing_public_narration" };
    }

    const targetId = input.targetId?.trim() || null;
    if (TARGET_REQUIRED_KINDS.has(input.kind) && !targetId) {
      return { accepted: false, rejectedReason: "missing_target" };
    }

    const statePatch = input.statePatch ?? null;
    if (STATE_PATCH_REQUIRED_KINDS.has(input.kind) && !statePatch) {
      return { accepted: false, rejectedReason: "missing_state_patch" };
    }

    const metadata = { ...(input.metadata ?? {}) };

    return {
      accepted: true,
      turnLog: {
        sessionId: input.sessionId,
        sessionScenarioId: input.sessionScenarioId,
        actorUserId: input.gmUserId,
        rawInput: `gm:${input.kind}`,
        structuredAction: {
          type: "gm_override",
          kind: input.kind,
          targetId,
          public: true,
          hasPrivateNote: Boolean(input.privateNote?.trim()),
          metadata,
        },
        outcome: "SUCCESS",
        narration: publicNarration,
      },
      stateDiff: statePatch
        ? {
            reason: `gm_override:${input.kind}`,
            diff: statePatch,
          }
        : null,
      audit: {
        actorUserId: input.gmUserId,
        kind: input.kind,
        targetId,
        publicNarration,
        privateNote: input.privateNote?.trim() || null,
      },
    };
  }
}
