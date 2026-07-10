import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CombatReactionPromptDto, CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import { decodeCombatReactionPrompt } from '@trpg/shared-types/frontend';
import {
  getCombatReactionPrompts,
} from '../utils/combatResultPresentation';

type CombatReactionResult = {
  combat: CombatResponseDto;
  map: VttMapStateDto;
};

type UseCombatReactionAutoHandlerParams = {
  sessionId: string | null;
  combat: CombatResponseDto | null;
  isCombatReactionForCurrentUser: (
    reaction: CombatReactionPromptDto,
    nextCombat?: CombatResponseDto | null,
  ) => boolean;
  claimCombatReactionHandling: (reactionId: string) => boolean;
  submitCombatReactionPrompt: (reaction: CombatReactionPromptDto) => Promise<CombatReactionResult>;
  applyCombatReactionResult: (result: CombatReactionResult, mapSource?: string | null) => void;
  setCombatError: Dispatch<SetStateAction<string | null>>;
};

export function useCombatReactionAutoHandler(params: UseCombatReactionAutoHandlerParams) {
  const {
    sessionId,
    combat,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
    setCombatError,
  } = params;

  useEffect(() => {
    function handleReactionPrompt(event: Event) {
      if (!sessionId) return;
      if (!(event instanceof CustomEvent)) return;
      let reaction: CombatReactionPromptDto;
      try {
        reaction = decodeCombatReactionPrompt(event.detail);
      } catch {
        return;
      }
      if (!isCombatReactionForCurrentUser(reaction)) return;
      if (!claimCombatReactionHandling(reaction.id)) return;
      void submitCombatReactionPrompt(reaction)
        .then((result) => applyCombatReactionResult(result))
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : '반응 처리에 실패했습니다.';
          setCombatError(message);
        });
    }

    window.addEventListener('trpg:combat-reaction-prompt', handleReactionPrompt);
    return () => window.removeEventListener('trpg:combat-reaction-prompt', handleReactionPrompt);
  }, [
    applyCombatReactionResult,
    claimCombatReactionHandling,
    isCombatReactionForCurrentUser,
    sessionId,
    setCombatError,
    submitCombatReactionPrompt,
  ]);

  useEffect(() => {
    if (!sessionId || !combat) return;
    const reaction = getCombatReactionPrompts(combat).find(
      (candidate) =>
        isCombatReactionForCurrentUser(candidate, combat) &&
        claimCombatReactionHandling(candidate.id),
    );
    if (!reaction) return;

    void submitCombatReactionPrompt(reaction)
      .then((result) => applyCombatReactionResult(result))
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : '반응 처리에 실패했습니다.';
        setCombatError(message);
      });
  }, [
    applyCombatReactionResult,
    claimCombatReactionHandling,
    combat,
    isCombatReactionForCurrentUser,
    sessionId,
    setCombatError,
    submitCombatReactionPrompt,
  ]);
}
