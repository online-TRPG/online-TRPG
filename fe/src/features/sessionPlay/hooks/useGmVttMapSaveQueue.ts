import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { isActiveCombatStatus } from '@trpg/shared-types/frontend';
import type { CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { getCombat } from '../../../services/combatApi';
import { updateGmVttMap, updateVttMap } from '../../../services/vttMapApi';
import {
  claimNextVttMapSave,
  completeVttMapSave,
  createVttMapSaveQueueState,
  isVttMapSaveActiveForSession,
  queueVttMapSave,
  shouldFlushQueuedVttMapSave,
  switchVttMapSaveSession,
  type VttMapSaveQueueState,
} from '../utils/vttMapSaveQueue';

type UseGmVttMapSaveQueueParams = {
  user: StoredUser;
  canUseHumanGmView: boolean;
  combat: CombatResponseDto | null;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  setMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
};

export function useGmVttMapSaveQueue(params: UseGmVttMapSaveQueueParams) {
  const {
    user,
    canUseHumanGmView,
    combat,
    latestConfirmedMapRef,
    setMap,
    setCombat,
    setMapLoadError,
  } = params;
  const mapSaveRef = useRef<VttMapSaveQueueState>(createVttMapSaveQueueState());
  const flushPendingMapSaveRef = useRef<(sessionId: string) => Promise<void>>(async () => {});

  const resetMapSaveQueue = useCallback(() => {
    mapSaveRef.current = createVttMapSaveQueueState();
  }, []);

  const switchMapSaveSession = useCallback((sessionId: string | null) => {
    switchVttMapSaveSession(mapSaveRef.current, sessionId);
  }, []);

  const flushPendingMapSave = useCallback(
    async (sessionId: string) => {
      const saveState = mapSaveRef.current;
      const mapToSave = claimNextVttMapSave(saveState);
      if (!mapToSave) {
        return;
      }

      try {
        const savedMap = canUseHumanGmView
          ? await updateGmVttMap(user, sessionId, mapToSave)
          : await updateVttMap(user, sessionId, mapToSave);
        if (isVttMapSaveActiveForSession(mapSaveRef.current, sessionId)) {
          latestConfirmedMapRef.current = savedMap;
          setMapLoadError(null);
          setMap((current) => (current === mapToSave ? savedMap : current));
          if (combat?.sessionId === sessionId && isActiveCombatStatus(combat.status)) {
            const refreshedCombat = await getCombat(user, sessionId);
            setCombat(refreshedCombat);
          }
        }
      } catch (caught) {
        if (isVttMapSaveActiveForSession(mapSaveRef.current, sessionId)) {
          const fallbackMap = latestConfirmedMapRef.current;
          setMap((current) => (current === mapToSave && fallbackMap ? fallbackMap : current));
          setMapLoadError(caught instanceof Error ? caught.message : 'Map save failed.');
        }
      } finally {
        completeVttMapSave(saveState);
        if (shouldFlushQueuedVttMapSave(saveState, sessionId)) {
          void flushPendingMapSaveRef.current(sessionId);
        }
      }
    },
    [canUseHumanGmView, combat, latestConfirmedMapRef, setCombat, setMap, setMapLoadError, user],
  );

  useEffect(() => {
    flushPendingMapSaveRef.current = flushPendingMapSave;
  }, [flushPendingMapSave]);

  const handleQueuedMapChange = useCallback(
    (sessionId: string | null, nextMap: VttMapStateDto) => {
      if (!sessionId) return;
      if (!canUseHumanGmView) {
        setMap(nextMap);
        setMapLoadError(null);
        return;
      }

      queueVttMapSave(mapSaveRef.current, {
        sessionId,
        map: nextMap,
      });
      setMap(nextMap);
      setMapLoadError(null);
      void flushPendingMapSave(sessionId);
    },
    [canUseHumanGmView, flushPendingMapSave, setMap, setMapLoadError],
  );

  return {
    resetMapSaveQueue,
    switchMapSaveSession,
    handleQueuedMapChange,
  };
}
