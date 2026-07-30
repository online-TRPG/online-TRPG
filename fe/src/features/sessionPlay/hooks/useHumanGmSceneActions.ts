import { useCallback, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { PlayerScenarioView, SessionSnapshot, StoredUser } from '../../../types/session';
import { createHumanGmMessage, updateHumanGmSessionNode } from '../../../services/humanGmApi';
import { getVttMap } from '../../../services/vttMapApi';
import type { BattleMapSelection } from '../components/SessionBattleMap';
import {
  createPlayerScenarioLoadKey,
  type PlayerScenarioLoadKey,
} from '../utils/sessionNodeTransition';
import { readVttMapFromSessionFlags } from '../utils/sessionStateFlags';

type GmMessagePayload = {
  content: string;
  speakerName?: string | null;
  asNpc?: boolean;
  privateNote?: string | null;
};

type UseHumanGmSceneActionsParams = {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  playerScenarioLoadKeyRef: MutableRefObject<PlayerScenarioLoadKey | null>;
  nodeTransitionTargetIdRef: MutableRefObject<string | null>;
  onApplySnapshot: (snapshot: SessionSnapshot) => void;
  setVttMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  setPlayerScenario: Dispatch<SetStateAction<PlayerScenarioView | null>>;
  setCombat: Dispatch<SetStateAction<CombatResponseDto | null>>;
  setCombatChecked: Dispatch<SetStateAction<boolean>>;
  setCombatError: Dispatch<SetStateAction<string | null>>;
  setMapLoadError: Dispatch<SetStateAction<string | null>>;
  setScenarioLoadError: Dispatch<SetStateAction<string | null>>;
  setSelectedExplorationMapSelection: Dispatch<SetStateAction<BattleMapSelection | null>>;
  onAction: (label: string) => void;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
};

function extractSnapshotMap(snapshot: SessionSnapshot): VttMapStateDto | null {
  return readVttMapFromSessionFlags(snapshot.state.flags);
}

export function useHumanGmSceneActions(params: UseHumanGmSceneActionsParams) {
  const {
    user,
    sessionId,
    canUseHumanGmView,
    latestConfirmedMapRef,
    playerScenarioLoadKeyRef,
    nodeTransitionTargetIdRef,
    onApplySnapshot,
    setVttMap,
    setPlayerScenario,
    setCombat,
    setCombatChecked,
    setCombatError,
    setMapLoadError,
    setScenarioLoadError,
    setSelectedExplorationMapSelection,
    onAction,
    onCombatActionLog,
  } = params;
  const [isGmMessagePending, setGmMessagePending] = useState(false);
  const [isGmNodeMovePending, setGmNodeMovePending] = useState(false);

  const applySnapshotMap = useCallback(
    (snapshot: SessionSnapshot): boolean => {
      const nextMap = extractSnapshotMap(snapshot);
      if (!nextMap) return false;
      latestConfirmedMapRef.current = nextMap;
      setVttMap(nextMap);
      return true;
    },
    [latestConfirmedMapRef, setVttMap],
  );

  const executeGmMessage = useCallback(
    async (payload: GmMessagePayload) => {
      if (!sessionId || !canUseHumanGmView) {
        throw new Error('HUMAN GM 메시지를 실행할 수 없는 세션 상태입니다.');
      }

      const nextSnapshot = await createHumanGmMessage(user, sessionId, {
        content: payload.content,
        speakerName: payload.speakerName?.trim() || undefined,
        asNpc: payload.asNpc,
        privateNote: payload.privateNote?.trim() || null,
      });
      applySnapshotMap(nextSnapshot);
      onAction(payload.asNpc ? 'GM NPC 대사' : 'GM 장면 묘사');
    },
    [applySnapshotMap, canUseHumanGmView, onAction, sessionId, user],
  );

  const handleGmMessage = useCallback(
    async (payload: GmMessagePayload) => {
      if (!sessionId || !canUseHumanGmView || isGmMessagePending) return;

      setGmMessagePending(true);
      setScenarioLoadError(null);
      try {
        await executeGmMessage(payload);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'GM 메시지 전송에 실패했습니다.';
        setScenarioLoadError(message);
        onCombatActionLog(message);
      } finally {
        setGmMessagePending(false);
      }
    },
    [
      canUseHumanGmView,
      executeGmMessage,
      isGmMessagePending,
      onCombatActionLog,
      sessionId,
      setScenarioLoadError,
    ],
  );

  const executeGmNodeMove = useCallback(
    async (nodeId: string) => {
      if (!sessionId || !canUseHumanGmView) {
        throw new Error('HUMAN GM 노드 이동을 실행할 수 없는 세션 상태입니다.');
      }

      nodeTransitionTargetIdRef.current = nodeId;
      try {
        const transition = await updateHumanGmSessionNode(user, sessionId, nodeId);
        const nextSnapshot = transition.snapshot;
        playerScenarioLoadKeyRef.current = createPlayerScenarioLoadKey(
          sessionId,
          nextSnapshot.state.currentNodeId,
          nextSnapshot.state.version,
        );
        onApplySnapshot(nextSnapshot);
        const didApplyMap = applySnapshotMap(nextSnapshot);
        setPlayerScenario(transition.playerScenario);
        setCombat(null);
        setCombatChecked(false);
        setCombatError(null);
        setSelectedExplorationMapSelection(null);
        if (!didApplyMap) {
          const savedMap = await getVttMap(user, sessionId);
          latestConfirmedMapRef.current = savedMap;
          setVttMap(savedMap);
        }
        onAction('GM 노드 이동');
      } finally {
        if (nodeTransitionTargetIdRef.current === nodeId) {
          nodeTransitionTargetIdRef.current = null;
        }
      }
    },
    [
      applySnapshotMap,
      canUseHumanGmView,
      latestConfirmedMapRef,
      nodeTransitionTargetIdRef,
      onAction,
      onApplySnapshot,
      playerScenarioLoadKeyRef,
      sessionId,
      setCombat,
      setCombatChecked,
      setCombatError,
      setPlayerScenario,
      setSelectedExplorationMapSelection,
      setVttMap,
      user,
    ],
  );

  const handleGmNodeMove = useCallback(
    async (nodeId: string) => {
      if (!sessionId || !canUseHumanGmView || isGmNodeMovePending) return;
      setGmNodeMovePending(true);
      setMapLoadError(null);
      setScenarioLoadError(null);
      try {
        await executeGmNodeMove(nodeId);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '노드 이동에 실패했습니다.';
        setScenarioLoadError(message);
        onCombatActionLog(message);
      } finally {
        setGmNodeMovePending(false);
      }
    },
    [
      canUseHumanGmView,
      executeGmNodeMove,
      isGmNodeMovePending,
      onCombatActionLog,
      sessionId,
      setMapLoadError,
      setScenarioLoadError,
    ],
  );

  return {
    executeGmMessage,
    handleGmMessage,
    isGmMessagePending,
    executeGmNodeMove,
    handleGmNodeMove,
    isGmNodeMovePending,
  };
}
