import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CombatReactionPromptDto, CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { moveCombatParticipant } from '../../../services/combatApi';
import {
  formatCombatMoveResultMessage,
  getCombatReactionPrompts,
} from '../utils/combatResultPresentation';
import { logMapMovePerf } from '../utils/vttMapRender';
import {
  applyOptimisticTokenMove,
  type PendingOptimisticTokenMove,
} from '../utils/vttMapState';

type CombatMoveResult = {
  combat: CombatResponseDto;
  map: VttMapStateDto;
};

type UseCombatTokenMoveRequestParams = {
  user: StoredUser;
  sessionId: string | null;
  combat: CombatResponseDto | null;
  isCombatBusy: boolean;
  currentMap: VttMapStateDto | null;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  pendingOptimisticTokenMoveRef: MutableRefObject<PendingOptimisticTokenMove | null>;
  setMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  setMapIfChanged: (nextMap: VttMapStateDto, source: string) => void;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setCombatBusy: Dispatch<SetStateAction<boolean>>;
  setCombatError: Dispatch<SetStateAction<string | null>>;
  isCombatReactionForCurrentUser: (
    reaction: CombatReactionPromptDto,
    nextCombat?: CombatResponseDto | null,
  ) => boolean;
  claimCombatReactionHandling: (reactionId: string) => boolean;
  submitCombatReactionPrompt: (reaction: CombatReactionPromptDto) => Promise<CombatMoveResult>;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
};

export function useCombatTokenMoveRequest(params: UseCombatTokenMoveRequestParams) {
  const {
    user,
    sessionId,
    combat,
    isCombatBusy,
    currentMap,
    latestConfirmedMapRef,
    pendingOptimisticTokenMoveRef,
    setMap,
    setMapIfChanged,
    setMapLoadError,
    setCombat,
    setCombatBusy,
    setCombatError,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    onCombatActionLog,
  } = params;

  return useCallback(
    async (
      token: VttMapStateDto['tokens'][number],
      to: { x: number; y: number },
      path: Array<{ x: number; y: number }>,
      movementMode: 'normal' | 'jump' = 'normal',
    ): Promise<VttMapStateDto | null> => {
      if (!sessionId || !combat || isCombatBusy) return null;
      const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
      const participant = combat.participants.find(
        (candidate) =>
          candidate.tokenId === token.id ||
          (candidate.sessionCharacterId && candidate.sessionCharacterId === token.sessionCharacterId),
      );
      if (!participant) {
        setMapLoadError('이동할 전투 참여자를 찾을 수 없습니다.');
        return null;
      }

      setCombatBusy(true);
      setCombatError(null);
      setMapLoadError(null);
      const previousMap = currentMap ?? latestConfirmedMapRef.current;
      const optimisticUpdatedAt = new Date().toISOString();
      const optimisticMap = applyOptimisticTokenMove(previousMap, token.id, to, optimisticUpdatedAt);
      if (optimisticMap) {
        pendingOptimisticTokenMoveRef.current = {
          tokenId: token.id,
          optimisticUpdatedAt,
          previousMap: previousMap as VttMapStateDto,
        };
        setMap(optimisticMap);
      }

      try {
        let result = await moveCombatParticipant(user, sessionId, {
          participantId: participant.sessionEntityId,
          to,
          path,
          movementMode,
        });

        const pendingPrompts = getCombatReactionPrompts(result);
        if (pendingPrompts.length) {
          const promptToHandle = pendingPrompts.find(
            (prompt) =>
              isCombatReactionForCurrentUser(prompt, result.combat) &&
              claimCombatReactionHandling(prompt.id),
          );
          if (!promptToHandle) {
            if (pendingPrompts.every((prompt) => prompt.type === 'ready_action')) {
              setCombat(result.combat);
              setMapIfChanged(result.map, 'combat-move-ready-pending');
              pendingOptimisticTokenMoveRef.current = null;
              logMapMovePerf('combat move request', requestStartedAt, `token=${token.id}`);
              onCombatActionLog(formatCombatMoveResultMessage(result));
              return result.map;
            }

            const pendingMove = pendingOptimisticTokenMoveRef.current;
            if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
              setMap((latestMap) =>
                latestMap?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : latestMap,
              );
              pendingOptimisticTokenMoveRef.current = null;
            }
            return null;
          }

          const reactionResult = await submitCombatReactionPrompt(promptToHandle);
          setCombat(reactionResult.combat);
          setMapIfChanged(reactionResult.map, 'combat-move-reaction');
          pendingOptimisticTokenMoveRef.current = null;
          logMapMovePerf('combat move request', requestStartedAt, `token=${token.id}`);
          onCombatActionLog(formatCombatMoveResultMessage(reactionResult));
          return reactionResult.map;
        }

        setCombat(result.combat);
        setMapIfChanged(result.map, 'combat-move');
        pendingOptimisticTokenMoveRef.current = null;
        logMapMovePerf('combat move request', requestStartedAt, `token=${token.id}`);
        onCombatActionLog(formatCombatMoveResultMessage(result));
        return result.map;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '전투 이동에 실패했습니다.';
        setCombatError(message);
        setMapLoadError(message);
        const pendingMove = pendingOptimisticTokenMoveRef.current;
        if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
          setMap((latestMap) =>
            latestMap?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : latestMap,
          );
          pendingOptimisticTokenMoveRef.current = null;
        }
        return null;
      } finally {
        setCombatBusy(false);
      }
    },
    [
      claimCombatReactionHandling,
      combat,
      currentMap,
      isCombatBusy,
      isCombatReactionForCurrentUser,
      latestConfirmedMapRef,
      onCombatActionLog,
      pendingOptimisticTokenMoveRef,
      sessionId,
      setCombat,
      setCombatBusy,
      setCombatError,
      setMap,
      setMapIfChanged,
      setMapLoadError,
      submitCombatReactionPrompt,
      user,
    ],
  );
}
