import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { PlayerScenarioView, StoredUser } from '../../../types/session';
import { getPlayerScenario } from '../../../services/scenarioApi';
import { getVttMap } from '../../../services/vttMapApi';

type UsePlayScenarioMapLoaderParams = {
  user: StoredUser;
  sessionId: string | null;
  isRecruiting: boolean;
  currentNodeId?: string | null;
  stateVersion?: number;
  snapshotVttMap: VttMapStateDto | null;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  setPlayerScenario: Dispatch<SetStateAction<PlayerScenarioView | null>>;
  setMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  setMapIfChanged: (nextMap: VttMapStateDto, source: string) => void;
  setScenarioLoadError: Dispatch<SetStateAction<string | null>>;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
  resetMapSaveQueue: () => void;
  switchMapSaveSession: (sessionId: string | null) => void;
};

export function usePlayScenarioMapLoader(params: UsePlayScenarioMapLoaderParams) {
  const {
    user,
    sessionId,
    isRecruiting,
    currentNodeId,
    stateVersion,
    snapshotVttMap,
    latestConfirmedMapRef,
    setPlayerScenario,
    setMap,
    setMapIfChanged,
    setScenarioLoadError,
    setMapLoadError,
    resetMapSaveQueue,
    switchMapSaveSession,
  } = params;
  const [, setIsScenarioLoaded] = useState(false);
  const [, setIsMapLoaded] = useState(false);
  const setMapIfChangedRef = useRef(setMapIfChanged);

  useEffect(() => {
    setMapIfChangedRef.current = setMapIfChanged;
  }, [setMapIfChanged]);

  useEffect(() => {
    if (!sessionId) {
      setPlayerScenario(null);
      setMap(null);
      setScenarioLoadError(null);
      setMapLoadError(null);
      setIsScenarioLoaded(false);
      setIsMapLoaded(false);
      latestConfirmedMapRef.current = null;
      resetMapSaveQueue();
      return;
    }

    let ignore = false;
    setScenarioLoadError(null);
    setIsScenarioLoaded(false);

    getPlayerScenario(user, sessionId)
      .then((scenario) => {
        if (!ignore) {
          setPlayerScenario(scenario);
          setIsScenarioLoaded(true);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setPlayerScenario(null);
          setIsScenarioLoaded(true);
          setScenarioLoadError(
            caught instanceof Error ? caught.message : '시나리오를 불러오지 못했습니다.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    currentNodeId,
    isRecruiting,
    latestConfirmedMapRef,
    resetMapSaveQueue,
    sessionId,
    setMap,
    setMapLoadError,
    setPlayerScenario,
    setScenarioLoadError,
    stateVersion,
    user,
  ]);

  useEffect(() => {
    if (!snapshotVttMap) return;
    setMapIfChangedRef.current(snapshotVttMap, 'snapshot');
    setIsMapLoaded(true);
  }, [snapshotVttMap]);

  useEffect(() => {
    if (!sessionId || isRecruiting) {
      return;
    }

    let ignore = false;
    setMapLoadError(null);

    getVttMap(user, sessionId)
      .then((map) => {
        if (!ignore) {
          setMapIfChangedRef.current(map, 'load');
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setMapLoadError(caught instanceof Error ? caught.message : '맵을 불러오지 못했습니다.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [isRecruiting, sessionId, setMapLoadError, user]);

  useEffect(() => {
    switchMapSaveSession(sessionId);
  }, [sessionId, switchMapSaveSession]);
}
