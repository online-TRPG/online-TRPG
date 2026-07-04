import { Injectable } from "@nestjs/common";

@Injectable()
export class SessionCompletionFlagStoreService {
  buildCombatCompletionFlags(
    flags: Record<string, unknown>,
    currentNodeId: string | null,
  ): {
    flags: Record<string, unknown>;
    completedCombatNodeIds: string[];
  } {
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === "string")
      : [];
    const nextCompletedCombatNodeIds =
      currentNodeId && !completedCombatNodeIds.includes(currentNodeId)
        ? [...completedCombatNodeIds, currentNodeId]
        : completedCombatNodeIds;

    return {
      flags: {
        ...flags,
        completedCombatNodeIds: nextCompletedCombatNodeIds,
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
