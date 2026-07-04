import { useCallback, useEffect, useState } from 'react';
import type {
  AiHumanGmAssistSuggestionRequestDto,
  CreateHumanGmAiAssistSuggestionDto,
  HumanGmAiAssistSuggestionDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import {
  acceptHumanGmAiAssistSuggestion,
  createHumanGmAiAssistSuggestion,
  generateHumanGmAiAssistSuggestion,
  getHumanGmAiAssistSuggestions,
  reportHumanGmAiAssistApplicationFailure,
} from '../../../services/humanGmApi';

type UseHumanGmAssistParams = {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  stateVersion?: number | null;
  executeGmMessage: (payload: {
    content: string;
    speakerName?: string | null;
    asNpc?: boolean;
    privateNote?: string | null;
  }) => Promise<void>;
  executeGmNodeMove: (nodeId: string) => Promise<void>;
  setScenarioLoadError: (message: string | null) => void;
  onAction: (label: string) => void;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
};

export function useHumanGmAssist(params: UseHumanGmAssistParams) {
  const {
    user,
    sessionId,
    canUseHumanGmView,
    stateVersion,
    executeGmMessage,
    executeGmNodeMove,
    setScenarioLoadError,
    onAction,
    onCombatActionLog,
  } = params;
  const [gmAiAssistSuggestions, setGmAiAssistSuggestions] =
    useState<HumanGmAiAssistSuggestionDto[]>([]);
  const [isGmAiAssistPending, setGmAiAssistPending] = useState(false);

  useEffect(() => {
    if (!sessionId || !canUseHumanGmView) {
      setGmAiAssistSuggestions([]);
      return;
    }

    let ignore = false;
    getHumanGmAiAssistSuggestions(user, sessionId)
      .then((suggestions) => {
        if (!ignore) {
          setGmAiAssistSuggestions(suggestions);
        }
      })
      .catch(() => {
        if (!ignore) {
          setGmAiAssistSuggestions([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, sessionId, stateVersion, user]);

  const handleGmAiAssistCreate = useCallback(
    async (payload: CreateHumanGmAiAssistSuggestionDto) => {
      if (!sessionId || !canUseHumanGmView || isGmAiAssistPending) return;

      setGmAiAssistPending(true);
      setScenarioLoadError(null);
      try {
        const suggestion = await createHumanGmAiAssistSuggestion(user, sessionId, payload);
        setGmAiAssistSuggestions((current) => [
          suggestion,
          ...current.filter((candidate) => candidate.id !== suggestion.id),
        ]);
        onAction('GM AI 보조 제안 등록');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'AI 보조 제안 등록에 실패했습니다.';
        setScenarioLoadError(message);
        onCombatActionLog(message);
      } finally {
        setGmAiAssistPending(false);
      }
    },
    [
      canUseHumanGmView,
      isGmAiAssistPending,
      onAction,
      onCombatActionLog,
      sessionId,
      setScenarioLoadError,
      user,
    ],
  );

  const handleGmAiAssistGenerate = useCallback(
    async (payload: AiHumanGmAssistSuggestionRequestDto) => {
      if (!sessionId || !canUseHumanGmView || isGmAiAssistPending) return;

      setGmAiAssistPending(true);
      setScenarioLoadError(null);
      try {
        const suggestion = await generateHumanGmAiAssistSuggestion(user, sessionId, payload);
        setGmAiAssistSuggestions((current) => [
          suggestion,
          ...current.filter((candidate) => candidate.id !== suggestion.id),
        ]);
        onAction('GM AI 보조 제안 생성');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'AI 보조 제안 생성에 실패했습니다.';
        setScenarioLoadError(message);
        onCombatActionLog(message);
      } finally {
        setGmAiAssistPending(false);
      }
    },
    [
      canUseHumanGmView,
      isGmAiAssistPending,
      onAction,
      onCombatActionLog,
      sessionId,
      setScenarioLoadError,
      user,
    ],
  );

  const handleGmAiAssistAccept = useCallback(
    async (suggestion: HumanGmAiAssistSuggestionDto) => {
      if (!sessionId || !canUseHumanGmView || isGmAiAssistPending) return;

      let acceptanceRecorded = false;
      setGmAiAssistPending(true);
      setScenarioLoadError(null);
      try {
        await acceptHumanGmAiAssistSuggestion(user, sessionId, {
          suggestionId: suggestion.id,
          publicNarration: 'GM이 AI 보조 제안을 승인했습니다.',
        });
        acceptanceRecorded = true;
        setGmAiAssistSuggestions((current) =>
          current.map((candidate) =>
            candidate.id === suggestion.id
              ? {
                  ...candidate,
                  status: 'ACCEPTED',
                  acceptedByUserId: user.id,
                  acceptedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        );

        if (suggestion.assistType === 'scene_text') {
          await executeGmMessage({ content: suggestion.content });
        } else if (suggestion.assistType === 'npc_dialogue') {
          await executeGmMessage({
            content: suggestion.content,
            speakerName: suggestion.targetId,
            asNpc: true,
          });
        } else if (suggestion.assistType === 'node_move') {
          const nodeId = suggestion.suggestedActionId ?? suggestion.targetId;
          if (!nodeId) {
            throw new Error('승인된 장면 이동 제안에 대상 노드가 없습니다.');
          }
          await executeGmNodeMove(nodeId);
        }
        onAction('GM AI 보조 제안 승인');
      } catch (caught) {
        const cause = caught instanceof Error ? caught.message : '알 수 없는 오류';
        const message = acceptanceRecorded
          ? `AI 보조 제안 승인은 기록됐지만 적용에 실패했습니다: ${cause}`
          : `AI 보조 제안 승인에 실패했습니다: ${cause}`;
        if (acceptanceRecorded) {
          try {
            await reportHumanGmAiAssistApplicationFailure(user, sessionId, {
              suggestionId: suggestion.id,
              failedOperation: suggestion.assistType,
              failureReason: cause.slice(0, 500),
            });
          } catch (auditError) {
            console.warn('Failed to audit GM AI assist application failure.', auditError);
          }
        }
        setScenarioLoadError(message);
        onCombatActionLog(message);
      } finally {
        setGmAiAssistPending(false);
      }
    },
    [
      canUseHumanGmView,
      executeGmMessage,
      executeGmNodeMove,
      isGmAiAssistPending,
      onAction,
      onCombatActionLog,
      sessionId,
      setScenarioLoadError,
      user,
    ],
  );

  return {
    gmAiAssistSuggestions,
    isGmAiAssistPending,
    handleGmAiAssistCreate,
    handleGmAiAssistGenerate,
    handleGmAiAssistAccept,
  };
}
