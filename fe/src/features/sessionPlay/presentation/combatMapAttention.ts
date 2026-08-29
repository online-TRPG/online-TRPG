import type {
  CombatReactionPromptDto,
  CombatResponseDto,
} from '@trpg/shared-types';
import type { CombatMapAttentionState } from './combatEffectTypes';

type CombatMapAttentionInput = {
  combat: CombatResponseDto | null;
  pendingReaction: CombatReactionPromptDto | null;
  visibleTokenIds: ReadonlySet<string>;
};

export function projectCombatMapAttention({
  combat,
  pendingReaction,
  visibleTokenIds,
}: CombatMapAttentionInput): CombatMapAttentionState {
  if (!combat) {
    return { activeTokenId: null, reactingTokenIds: [], concentrationCasters: [] };
  }

  const tokenIdByParticipantId = new Map(
    combat.participants.flatMap((participant) =>
      participant.tokenId
        ? [[participant.sessionEntityId, participant.tokenId] as const]
        : [],
    ),
  );
  const visibleTokenId = (participantId: string | null) => {
    if (!participantId) return null;
    const tokenId = tokenIdByParticipantId.get(participantId) ?? null;
    return tokenId && visibleTokenIds.has(tokenId) ? tokenId : null;
  };

  const activeTokenId = visibleTokenId(combat.currentEntityId);
  const reactingTokenId = pendingReaction
    ? visibleTokenId(pendingReaction.reactorParticipantId)
    : null;
  const concentrationCasters = combat.participants.flatMap((participant) => {
    const casterTokenId = participant.tokenId;
    if (!participant.concentration || !casterTokenId || !visibleTokenIds.has(casterTokenId)) {
      return [];
    }
    const visibleTargetTokenIds = participant.concentration.targetIds.flatMap((targetId) => {
      const tokenId = visibleTokenId(targetId);
      return tokenId && tokenId !== casterTokenId ? [tokenId] : [];
    });
    return [{ tokenId: casterTokenId, visibleTargetTokenIds }];
  });

  return {
    activeTokenId,
    reactingTokenIds: reactingTokenId ? [reactingTokenId] : [],
    concentrationCasters,
  };
}
