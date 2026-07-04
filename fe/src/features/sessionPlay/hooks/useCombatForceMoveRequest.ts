import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CombatReactionPromptDto, CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { forceMoveCombatParticipant } from '../../../services/combatApi';
import {
  formatCombatMoveResultMessage,
  getCombatReactionPrompts,
} from '../utils/combatResultPresentation';

type CombatMoveResult = {
  combat: CombatResponseDto;
  map: VttMapStateDto;
};

type UseCombatForceMoveRequestParams = {
  user: StoredUser;
  sessionId: string | null;
  combat: CombatResponseDto | null;
  isCombatBusy: boolean;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setCombatBusy: Dispatch<SetStateAction<boolean>>;
  setCombatError: Dispatch<SetStateAction<string | null>>;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
  setMapIfChanged: (nextMap: VttMapStateDto, source: string) => void;
  isCombatReactionForCurrentUser: (
    reaction: CombatReactionPromptDto,
    nextCombat?: CombatResponseDto | null,
  ) => boolean;
  claimCombatReactionHandling: (reactionId: string) => boolean;
  submitCombatReactionPrompt: (reaction: CombatReactionPromptDto) => Promise<CombatMoveResult>;
  applyCombatReactionResult: (result: CombatMoveResult, mapSource?: string | null) => void;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
};

export function useCombatForceMoveRequest(params: UseCombatForceMoveRequestParams) {
  const {
    user,
    sessionId,
    combat,
    isCombatBusy,
    setCombat,
    setCombatBusy,
    setCombatError,
    setMapLoadError,
    setMapIfChanged,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
    onCombatActionLog,
  } = params;

  return useCallback(
    async (
      participantId: string,
      mode: 'push' | 'pull' | 'slide',
      origin: { x: number; y: number },
      distanceFt: number,
    ) => {
      if (!sessionId || !combat || isCombatBusy) return;

      setCombatBusy(true);
      setCombatError(null);
      setMapLoadError(null);

      try {
        let result = await forceMoveCombatParticipant(user, sessionId, {
          participantId,
          mode,
          origin,
          distanceFt,
        });
        setCombat(result.combat);
        setMapIfChanged(result.map, 'combat-force-move');
        onCombatActionLog(formatCombatMoveResultMessage(result));
        const promptToHandle = getCombatReactionPrompts(result).find(
          (prompt) =>
            isCombatReactionForCurrentUser(prompt, result.combat) &&
            claimCombatReactionHandling(prompt.id),
        );
        if (promptToHandle) {
          const reactionResult = await submitCombatReactionPrompt(promptToHandle);
          applyCombatReactionResult(reactionResult, 'combat-force-move-reaction');
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '강제 이동 처리에 실패했습니다.';
        setCombatError(message);
        setMapLoadError(message);
      } finally {
        setCombatBusy(false);
      }
    },
    [
      applyCombatReactionResult,
      claimCombatReactionHandling,
      combat,
      isCombatBusy,
      isCombatReactionForCurrentUser,
      onCombatActionLog,
      sessionId,
      setCombat,
      setCombatBusy,
      setCombatError,
      setMapIfChanged,
      setMapLoadError,
      submitCombatReactionPrompt,
      user,
    ],
  );
}
