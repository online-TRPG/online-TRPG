import { Injectable } from "@nestjs/common";

const COMPLETED_COMBAT_NODE_IDS_FLAG = "completedCombatNodeIds";

export function readCompletedCombatNodeIds(flags: unknown): string[] {
  if (!isRecord(flags)) {
    return [];
  }
  return decodeCompletedCombatNodeIds(flags[COMPLETED_COMBAT_NODE_IDS_FLAG]);
}

@Injectable()
export class SessionCompletionFlagStoreService {
  buildCombatCompletionFlags(
    flags: Record<string, unknown>,
    currentNodeId: string | null,
  ): {
    flags: Record<string, unknown>;
    completedCombatNodeIds: string[];
  } {
    const completedCombatNodeIds = readCompletedCombatNodeIds(flags);
    const nextCompletedCombatNodeIds =
      currentNodeId && !completedCombatNodeIds.includes(currentNodeId)
        ? [...completedCombatNodeIds, currentNodeId]
        : completedCombatNodeIds;

    return {
      flags: {
        ...flags,
        [COMPLETED_COMBAT_NODE_IDS_FLAG]: nextCompletedCombatNodeIds,
      },
      completedCombatNodeIds: nextCompletedCombatNodeIds,
    };
  }

  buildEndingNodeCompletionFlags(
    flags: Record<string, unknown>,
    params: {
      completedAt: Date;
      nodeId: string;
      reason: string;
    },
  ): Record<string, unknown> {
    return {
      ...flags,
      sessionCompletedAt: params.completedAt.toISOString(),
      completedNodeId: params.nodeId,
      completionReason: params.reason,
    };
  }

  buildPartyDefeatFlags(
    flags: Record<string, unknown>,
    params: {
      defeatedAt: Date;
      nodeId: string | null;
    },
  ): Record<string, unknown> {
    return {
      ...flags,
      partyDefeated: true,
      partyDefeatedAt: params.defeatedAt.toISOString(),
      defeatedCombatNodeId: params.nodeId,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeCompletedCombatNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}
