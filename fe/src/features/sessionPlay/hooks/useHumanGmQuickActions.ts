import { useCallback, useEffect, useState } from 'react';
import type { HumanGmRevealOptionDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { getHumanGmRevealOptions, revealHumanGmContent } from '../../../services/humanGmApi';

interface UseHumanGmQuickActionsParams {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  currentNodeId: string | null;
  stateVersion?: number;
  onAction: (label: string) => void;
}

export function useHumanGmQuickActions({
  user,
  sessionId,
  canUseHumanGmView,
  currentNodeId,
  stateVersion,
  onAction,
}: UseHumanGmQuickActionsParams) {
  const [revealOptions, setRevealOptions] = useState<HumanGmRevealOptionDto[]>([]);
  const [selectedRevealId, setSelectedRevealId] = useState('');
  const [isRevealPending, setRevealPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canUseHumanGmView || !sessionId || !currentNodeId) {
      setRevealOptions([]);
      setSelectedRevealId('');
      return;
    }
    try {
      const options = await getHumanGmRevealOptions(user, sessionId);
      setRevealOptions(options);
      setSelectedRevealId((current) => options.some((option) => option.contentId === current)
        ? current
        : options[0]?.contentId ?? '');
      setFeedback(null);
    } catch (error) {
      setRevealOptions([]);
      setSelectedRevealId('');
      setFeedback(error instanceof Error ? error.message : '공개할 자료를 불러오지 못했습니다.');
    }
  }, [canUseHumanGmView, currentNodeId, sessionId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, stateVersion]);

  async function revealSelected() {
    if (!sessionId || !selectedRevealId || isRevealPending) return;
    const selected = revealOptions.find((option) => option.contentId === selectedRevealId);
    setRevealPending(true);
    setFeedback(null);
    try {
      await revealHumanGmContent(user, sessionId, {
        contentId: selectedRevealId,
        contentKind: 'clue',
        scope: 'party',
        reason: selected ? `GM이 '${selected.title}' 자료를 공개했습니다.` : 'GM이 자료를 공개했습니다.',
      });
      setRevealOptions((current) => current.filter((option) => option.contentId !== selectedRevealId));
      setSelectedRevealId('');
      setFeedback(selected ? `'${selected.title}' 자료를 공개했습니다.` : '자료를 공개했습니다.');
      onAction('GM 자료 공개');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '자료를 공개하지 못했습니다.');
    } finally {
      setRevealPending(false);
    }
  }

  return {
    revealOptions,
    selectedRevealId,
    isRevealPending,
    feedback,
    setSelectedRevealId,
    revealSelected,
  };
}
