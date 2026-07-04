import { useCallback, useRef, useState } from 'react';
import type { CombatReactionPromptDto } from '@trpg/shared-types';

type PendingCombatReactionPrompt = {
  reaction: CombatReactionPromptDto;
};

export function useCombatReactionDecision() {
  const [pendingCombatReaction, setPendingCombatReaction] =
    useState<PendingCombatReactionPrompt | null>(null);
  const pendingCombatReactionResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const pendingCombatReactionDecisionRef = useRef<{ id: string; promise: Promise<boolean> } | null>(null);
  const claimedCombatReactionIdsRef = useRef<Set<string>>(new Set());

  const requestCombatReactionDecision = useCallback((reaction: CombatReactionPromptDto) => {
    if (pendingCombatReactionDecisionRef.current?.id === reaction.id) {
      return pendingCombatReactionDecisionRef.current.promise;
    }
    pendingCombatReactionResolverRef.current?.(false);
    const promise = new Promise<boolean>((resolve) => {
      pendingCombatReactionResolverRef.current = resolve;
      setPendingCombatReaction({ reaction });
    });
    pendingCombatReactionDecisionRef.current = { id: reaction.id, promise };
    return promise;
  }, []);

  const resolvePendingCombatReaction = useCallback((accepted: boolean) => {
    const resolver = pendingCombatReactionResolverRef.current;
    pendingCombatReactionResolverRef.current = null;
    pendingCombatReactionDecisionRef.current = null;
    setPendingCombatReaction(null);
    resolver?.(accepted);
  }, []);

  const claimCombatReactionHandling = useCallback((reactionId: string) => {
    if (claimedCombatReactionIdsRef.current.has(reactionId)) {
      return false;
    }
    claimedCombatReactionIdsRef.current.add(reactionId);
    return true;
  }, []);

  const submitCombatReactionDecision = useCallback(
    async <T>(reaction: CombatReactionPromptDto, submit: (accepted: boolean) => Promise<T>): Promise<T> => {
      const accepted = await requestCombatReactionDecision(reaction);
      return submit(accepted);
    },
    [requestCombatReactionDecision],
  );

  return {
    pendingCombatReaction,
    requestCombatReactionDecision,
    submitCombatReactionDecision,
    resolvePendingCombatReaction,
    claimCombatReactionHandling,
  };
}
