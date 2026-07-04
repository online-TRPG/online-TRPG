import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CombatReactionPromptDto, CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import { getCombatReactionPrompts } from '../utils/combatResultPresentation';

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

const SUPPORTED_REACTION_EVENT_TYPES: ReadonlySet<CombatReactionPromptDto['type']> = new Set([
  'opportunity_attack',
  'shield',
  'ready_action',
  'counterspell',
]);

function isSupportedReactionPrompt(value: unknown): value is CombatReactionPromptDto {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && SUPPORTED_REACTION_EVENT_TYPES.has(type as CombatReactionPromptDto['type']);
}

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
      const reaction = (event as CustomEvent<unknown>).detail;
      if (!isSupportedReactionPrompt(reaction)) return;
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
