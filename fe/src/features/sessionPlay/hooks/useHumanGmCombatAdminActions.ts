import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { SessionSnapshot, StoredUser } from '../../../types/session';
import { getCombat } from '../../../services/combatApi';
import {
  adjustHumanGmCombatHp,
  applyHumanGmCombatCondition,
} from '../../../services/humanGmApi';
import { readVttMapFromSessionFlags } from '../utils/sessionStateFlags';

type UseHumanGmCombatAdminActionsParams = {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  isCombatBusy: boolean;
  setCombatBusy: Dispatch<SetStateAction<boolean>>;
  setCombatError: Dispatch<SetStateAction<string | null>>;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setVttMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  onSendAction: (rawText: string) => Promise<void> | void;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
};

function extractSnapshotMap(snapshot: SessionSnapshot): VttMapStateDto | null {
  return readVttMapFromSessionFlags(snapshot.state.flags);
}

export function useHumanGmCombatAdminActions(params: UseHumanGmCombatAdminActionsParams) {
  const {
    user,
    sessionId,
    canUseHumanGmView,
    isCombatBusy,
    setCombatBusy,
    setCombatError,
    setCombat,
    setVttMap,
    latestConfirmedMapRef,
    onSendAction,
    onCombatActionLog,
  } = params;

  const refreshCombatAfterAdminAction = useCallback(
    async (snapshot: SessionSnapshot) => {
      if (!sessionId) return;
      const nextMap = extractSnapshotMap(snapshot);
      if (nextMap) {
        latestConfirmedMapRef.current = nextMap;
        setVttMap(nextMap);
      }
      const refreshedCombat = await getCombat(user, sessionId);
      setCombat(refreshedCombat);
    },
    [latestConfirmedMapRef, sessionId, setCombat, setVttMap, user],
  );

  const handleApplyCombatCondition = useCallback(
    async (
      targetTokenOrParticipantId: string,
      conditionId: string,
      operation: 'add' | 'remove',
    ) => {
      if (!sessionId || isCombatBusy) return;
      if (!canUseHumanGmView) {
        await onSendAction(`/condition ${operation} ${targetTokenOrParticipantId} ${conditionId}`);
        return;
      }

      setCombatBusy(true);
      setCombatError(null);
      try {
        const nextSnapshot = await applyHumanGmCombatCondition(user, sessionId, {
          targetId: targetTokenOrParticipantId,
          conditionId,
          operation,
        });
        await refreshCombatAfterAdminAction(nextSnapshot);
        onCombatActionLog('GM 상태 조정 완료');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'GM 상태 조정에 실패했습니다.';
        setCombatError(message);
        onCombatActionLog(message);
      } finally {
        setCombatBusy(false);
      }
    },
    [
      canUseHumanGmView,
      isCombatBusy,
      onCombatActionLog,
      onSendAction,
      refreshCombatAfterAdminAction,
      sessionId,
      setCombatBusy,
      setCombatError,
      user,
    ],
  );

  const handleAdjustCombatHp = useCallback(
    async (targetTokenOrParticipantId: string, currentHp: number) => {
      if (!sessionId || !canUseHumanGmView || isCombatBusy) return;

      setCombatBusy(true);
      setCombatError(null);
      try {
        const nextSnapshot = await adjustHumanGmCombatHp(user, sessionId, {
          targetId: targetTokenOrParticipantId,
          currentHp,
        });
        await refreshCombatAfterAdminAction(nextSnapshot);
        onCombatActionLog('GM HP 조정 완료');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'GM HP 조정에 실패했습니다.';
        setCombatError(message);
        onCombatActionLog(message);
      } finally {
        setCombatBusy(false);
      }
    },
    [
      canUseHumanGmView,
      isCombatBusy,
      onCombatActionLog,
      refreshCombatAfterAdminAction,
      sessionId,
      setCombatBusy,
      setCombatError,
      user,
    ],
  );

  return {
    handleApplyCombatCondition,
    handleAdjustCombatHp,
  };
}
