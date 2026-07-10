import {
  isCompletedSessionStatus,
  isHumanGmMode,
  isRecruitingSessionStatus,
} from '@trpg/shared-types/frontend';
import type { SessionSnapshot } from '../../../types/session';

type SessionLike = SessionSnapshot['session'] | null;

type UseSessionPermissionProjectionParams = {
  session: SessionLike;
  userId: string;
};

export function useSessionPermissionProjection(
  params: UseSessionPermissionProjectionParams,
) {
  const { session, userId } = params;

  const isHumanGmSession = isHumanGmMode(session?.gmMode);
  const gmUserId = isHumanGmSession ? (session?.gmUserId ?? session?.hostUserId ?? null) : null;
  const isGmUser = Boolean(gmUserId && gmUserId === userId);
  const isHost = session?.hostUserId === userId;
  const isRecruiting = isRecruitingSessionStatus(session?.status);
  const isSessionCompleted = isCompletedSessionStatus(session?.status);
  const canControlSession = isHumanGmSession ? isGmUser : isHost;
  const canUseHumanGmView = Boolean(!isRecruiting && isHumanGmSession && isGmUser);
  const canManageStartedSession = Boolean(!isRecruiting && canControlSession);
  const canUseCampaignCalendarPanel = Boolean(session && !isRecruiting && !isSessionCompleted);

  return {
    isHumanGmSession,
    gmUserId,
    isGmUser,
    isHost,
    isRecruiting,
    isSessionCompleted,
    canControlSession,
    canUseHumanGmView,
    canManageStartedSession,
    canUseCampaignCalendarPanel,
  };
}
