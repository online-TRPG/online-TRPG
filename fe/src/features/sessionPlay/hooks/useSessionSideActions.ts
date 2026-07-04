import { useCallback, useState } from 'react';
import type {
  ApplyCampaignCalendarActionDto,
  ApplySessionEconomyActionDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { applyHumanGmEconomyAction } from '../../../services/humanGmApi';
import { applyCampaignCalendarAction } from '../../../services/sessionApi';

type UseSessionSideActionsParams = {
  user: StoredUser;
  sessionId: string | null;
  canManageStartedSession: boolean;
  onAction: (label: string) => void;
};

function isPlayerCampaignCalendarAction(payload: ApplyCampaignCalendarActionDto): boolean {
  return payload.actionType === 'propose_schedule' || payload.actionType === 'respond_schedule';
}

export function useSessionSideActions(params: UseSessionSideActionsParams) {
  const { user, sessionId, canManageStartedSession, onAction } = params;
  const [isEconomyPending, setEconomyPending] = useState(false);
  const [economyFeedback, setEconomyFeedback] = useState<string | null>(null);
  const [isCampaignCalendarPending, setCampaignCalendarPending] = useState(false);
  const [campaignCalendarFeedback, setCampaignCalendarFeedback] = useState<string | null>(null);

  const handleEconomyAction = useCallback(
    async (payload: ApplySessionEconomyActionDto) => {
      if (!sessionId || !canManageStartedSession || isEconomyPending) return;

      setEconomyPending(true);
      setEconomyFeedback(null);
      try {
        await applyHumanGmEconomyAction(user, sessionId, payload);
        setEconomyFeedback(`${payload.actionType} 처리가 완료되었습니다.`);
        onAction(`경제 처리: ${payload.actionType}`);
      } catch (caught) {
        setEconomyFeedback(caught instanceof Error ? caught.message : '경제 처리에 실패했습니다.');
      } finally {
        setEconomyPending(false);
      }
    },
    [canManageStartedSession, isEconomyPending, onAction, sessionId, user],
  );

  const handleCampaignCalendarAction = useCallback(
    async (payload: ApplyCampaignCalendarActionDto) => {
      if (
        !sessionId ||
        isCampaignCalendarPending ||
        (!canManageStartedSession && !isPlayerCampaignCalendarAction(payload))
      ) {
        return;
      }

      setCampaignCalendarPending(true);
      setCampaignCalendarFeedback(null);
      try {
        await applyCampaignCalendarAction(user, sessionId, payload);
        setCampaignCalendarFeedback(`${payload.actionType} 처리가 완료되었습니다.`);
        onAction(`캠페인 캘린더: ${payload.actionType}`);
      } catch (caught) {
        setCampaignCalendarFeedback(
          caught instanceof Error ? caught.message : '캠페인 캘린더 처리에 실패했습니다.',
        );
      } finally {
        setCampaignCalendarPending(false);
      }
    },
    [canManageStartedSession, isCampaignCalendarPending, onAction, sessionId, user],
  );

  return {
    isEconomyPending,
    economyFeedback,
    handleEconomyAction,
    isCampaignCalendarPending,
    campaignCalendarFeedback,
    handleCampaignCalendarAction,
  };
}
