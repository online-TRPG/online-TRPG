import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import {
  createVttMapPing,
  moveSessionToken,
  runVttMapInteraction,
} from '../../../services/vttMapApi';
import { logMapMovePerf } from '../utils/vttMapRender';
import {
  applyOptimisticTokenMove,
  type PendingOptimisticTokenMove,
} from '../utils/vttMapState';

type UseSessionVttMapRequestsParams = {
  user: StoredUser;
  sessionId: string | null;
  clientMapVersion?: number;
  actorSessionCharacterId: string | null;
  currentMap: VttMapStateDto | null;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  pendingOptimisticTokenMoveRef: MutableRefObject<PendingOptimisticTokenMove | null>;
  setMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  setMapIfChanged: (nextMap: VttMapStateDto, source: string) => void;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
};

export function useSessionVttMapRequests(params: UseSessionVttMapRequestsParams) {
  const {
    user,
    sessionId,
    clientMapVersion,
    actorSessionCharacterId,
    currentMap,
    latestConfirmedMapRef,
    pendingOptimisticTokenMoveRef,
    setMap,
    setMapIfChanged,
    setMapLoadError,
  } = params;

  const handleSessionTokenMoveRequest = useCallback(
    async (
      token: VttMapStateDto['tokens'][number],
      to: { x: number; y: number },
      path: Array<{ x: number; y: number }>,
      movementMode: 'normal' | 'jump' = 'normal',
    ): Promise<VttMapStateDto | null> => {
      if (!sessionId) return null;
      const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
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
        const savedMap = await moveSessionToken(user, sessionId, {
          tokenId: token.id,
          sessionCharacterId: token.sessionCharacterId ?? null,
          to,
          path,
          movementMode,
          clientMapVersion,
        });
        setMapIfChanged(savedMap, 'session-move');
        pendingOptimisticTokenMoveRef.current = null;
        logMapMovePerf('session move request', requestStartedAt, `token=${token.id}`);
        setMapLoadError(null);
        return savedMap;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '토큰 이동에 실패했습니다.';
        setMapLoadError(message);
        const pendingMove = pendingOptimisticTokenMoveRef.current;
        if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
          setMap((latestMap) =>
            latestMap?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : latestMap,
          );
          pendingOptimisticTokenMoveRef.current = null;
        }
        return null;
      }
    },
    [
      clientMapVersion,
      currentMap,
      latestConfirmedMapRef,
      pendingOptimisticTokenMoveRef,
      sessionId,
      setMap,
      setMapIfChanged,
      setMapLoadError,
      user,
    ],
  );

  const handleMapPingRequest = useCallback(
    async (point: { x: number; y: number }, label = '!'): Promise<VttMapStateDto | null> => {
      if (!sessionId) return null;
      try {
        const savedMap = await createVttMapPing(user, sessionId, {
          x: point.x,
          y: point.y,
          label,
          clientMapVersion,
        });
        setMapIfChanged(savedMap, 'map-ping');
        setMapLoadError(null);
        return savedMap;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '핑을 찍지 못했습니다.';
        setMapLoadError(message);
        return null;
      }
    },
    [clientMapVersion, sessionId, setMapIfChanged, setMapLoadError, user],
  );

  const handleMapInteractionRequest = useCallback(
    async (interaction: VttMapInteractionDto): Promise<VttMapInteractionResponseDto | null> => {
      if (!sessionId) return null;
      try {
        const response = await runVttMapInteraction(user, sessionId, {
          ...interaction,
          actorSessionCharacterId: interaction.actorSessionCharacterId ?? actorSessionCharacterId,
          clientMapVersion,
        });
        if (response.map) {
          setMapIfChanged(response.map, 'map-interaction');
        }
        setMapLoadError(null);
        return response;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '맵 상호작용에 실패했습니다.';
        setMapLoadError(message);
        return null;
      }
    },
    [actorSessionCharacterId, clientMapVersion, sessionId, setMapIfChanged, setMapLoadError, user],
  );

  return {
    handleSessionTokenMoveRequest,
    handleMapPingRequest,
    handleMapInteractionRequest,
  };
}
