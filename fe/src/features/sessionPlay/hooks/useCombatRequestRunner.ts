import { useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { isRecord } from '@trpg/shared-types/frontend';
import type { CombatReactionPromptDto, CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { getCombat } from '../../../services/combatApi';
import {
  formatCombatActionResultMessage,
  getCombatReactionPrompts,
  isCombatActionResultDto,
  isCombatResponseDto,
  logCombatRequestSucceeded,
} from '../utils/combatResultPresentation';

type CombatReactionResult = {
  combat: CombatResponseDto;
  map: VttMapStateDto;
};

type UseCombatRequestRunnerParams = {
  user: StoredUser;
  sessionId: string | null;
  isCombatBusy: boolean;
  setCombatBusy: Dispatch<SetStateAction<boolean>>;
  setCombatError: Dispatch<SetStateAction<string | null>>;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setVttMapIfChanged: (nextMap: VttMapStateDto, source: string) => void;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
  isCombatReactionForCurrentUser: (
    reaction: CombatReactionPromptDto,
    nextCombat?: CombatResponseDto | null,
  ) => boolean;
  claimCombatReactionHandling: (reactionId: string) => boolean;
  submitCombatReactionPrompt: (reaction: CombatReactionPromptDto) => Promise<CombatReactionResult>;
  applyCombatReactionResult: (result: CombatReactionResult, mapSource?: string) => void;
};

export function useCombatRequestRunner(params: UseCombatRequestRunnerParams) {
  const {
    user,
    sessionId,
    isCombatBusy,
    setCombatBusy,
    setCombatError,
    setCombat,
    setVttMapIfChanged,
    latestConfirmedMapRef,
    onCombatActionLog,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
  } = params;

  return useCallback(
    async (request: () => Promise<CombatResponseDto | { combat: CombatResponseDto } | unknown>) => {
      if (!sessionId || isCombatBusy) return;

      setCombatBusy(true);
      setCombatError(null);
      try {
        const result = await request();
        let nextCombat: CombatResponseDto | null = null;
        if (isRecord(result) && 'combat' in result) {
          const maybeCombat = result.combat;
          nextCombat = isCombatResponseDto(maybeCombat)
            ? maybeCombat
            : await getCombat(user, sessionId);
        } else if (isCombatResponseDto(result)) {
          nextCombat = result;
        } else {
          nextCombat = await getCombat(user, sessionId);
        }
        setCombat(nextCombat);
        logCombatRequestSucceeded(sessionId, nextCombat);
        const isActionResult = isCombatActionResultDto(result);
        if (isActionResult) {
          if (result.map) {
            setVttMapIfChanged(result.map, 'combat-action');
            latestConfirmedMapRef.current = result.map;
          }
          onCombatActionLog(formatCombatActionResultMessage(result), result.turnLogId);
          const promptToHandle = getCombatReactionPrompts(result).find(
            (prompt) =>
              isCombatReactionForCurrentUser(prompt, nextCombat) &&
              claimCombatReactionHandling(prompt.id),
          );
          if (promptToHandle) {
            const reactionResult = await submitCombatReactionPrompt(promptToHandle);
            applyCombatReactionResult(reactionResult, 'combat-action-reaction');
          }
        }
        if (!isActionResult) {
          const promptToHandle = getCombatReactionPrompts(result).find(
            (prompt) =>
              isCombatReactionForCurrentUser(prompt, nextCombat) &&
              claimCombatReactionHandling(prompt.id),
          );
          if (promptToHandle) {
            const reactionResult = await submitCombatReactionPrompt(promptToHandle);
            applyCombatReactionResult(reactionResult, 'combat-turn-reaction');
          }
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '전투 처리에 실패했습니다.';
        console.error('[COMBAT_REQUEST_FAILED]', { sessionId, message, error: caught });
        if (message.includes('COMBAT_409') || message.includes('ACTIVE_COMBAT_EXISTS')) {
          try {
            const nextCombat = await getCombat(user, sessionId);
            setCombat(nextCombat);
            logCombatRequestSucceeded(sessionId, nextCombat);
            setCombatError(null);
            return;
          } catch {
            // 아래 공통 오류 표시 흐름으로 넘깁니다.
          }
        }
        setCombatError(message);
      } finally {
        setCombatBusy(false);
      }
    },
    [
      applyCombatReactionResult,
      claimCombatReactionHandling,
      isCombatBusy,
      isCombatReactionForCurrentUser,
      latestConfirmedMapRef,
      onCombatActionLog,
      sessionId,
      setCombat,
      setCombatBusy,
      setCombatError,
      setVttMapIfChanged,
      submitCombatReactionPrompt,
      user,
    ],
  );
}
