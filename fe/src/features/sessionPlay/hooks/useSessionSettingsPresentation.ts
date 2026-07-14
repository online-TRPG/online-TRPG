import { useMemo } from 'react';
import type { SessionSnapshot } from '../../../types/session';
import {
  getGamePhaseLabel,
  getSessionStatusLabel,
  getSessionVisibilityLabel,
} from '../../../presentation/sessionLabels';

type UseSessionSettingsPresentationParams = {
  session?: SessionSnapshot['session'] | null;
  phase?: string | null;
  isHost: boolean;
};

export function useSessionSettingsPresentation({
  session,
  phase,
  isHost,
}: UseSessionSettingsPresentationParams) {
  return useMemo(() => {
    const inviteCode = session?.inviteCode ?? null;

    return {
      backToLobbyLabel: '플레이 화면 나가기',
      leaveSessionLabel: isHost ? '세션 삭제' : '세션 탈퇴',
      inviteCopyAriaLabel: '초대 링크 복사',
      inviteCodeCopyLabel: '링크 복사',
      currentSessionEyebrow: '현재 세션',
      inviteCodeEyebrow: '초대 코드',
      sessionStatusEyebrow: '세션 상태',
      visibilityEyebrow: '공개 범위',
      recruitingStatusLabel: '상태',
      recruitingPhaseLabel: '진행 단계',
      recruitingVisibilityLabel: '공개 범위',
      recruitingGmRoleLabel: '사람 GM',
      recruitingGmReadyDescription:
        '플레이어가 캐릭터를 선택하고 준비를 마치면 세션을 시작할 수 있습니다.',
      sessionTitleText: session?.title ?? '활성 세션이 없습니다',
      inviteCodeText: inviteCode ?? '------',
      inviteCodeToCopy: inviteCode,
      canCopyInviteCode: Boolean(inviteCode),
      statusText: getSessionStatusLabel(session?.status),
      phaseText: getGamePhaseLabel(phase),
      visibilityText: getSessionVisibilityLabel(session?.visibility),
    };
  }, [isHost, phase, session]);
}
