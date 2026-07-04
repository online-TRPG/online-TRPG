import { useMemo } from 'react';
import type { SessionSnapshot } from '../../../types/session';

type UseSessionSettingsPresentationParams = {
  session?: SessionSnapshot['session'] | null;
  phase?: string | null;
};

export function useSessionSettingsPresentation({
  session,
  phase,
}: UseSessionSettingsPresentationParams) {
  return useMemo(() => {
    const inviteCode = session?.inviteCode ?? null;

    return {
      backToLobbyLabel: '로비로 이동',
      leaveSessionLabel: '세션 영구 퇴장',
      inviteCopyAriaLabel: '초대 코드 복사',
      inviteCodeCopyLabel: '복사',
      currentSessionEyebrow: '현재 세션',
      inviteCodeEyebrow: '초대 코드',
      sessionStatusEyebrow: '세션 상태',
      visibilityEyebrow: '공개 범위',
      recruitingStatusLabel: 'Status',
      recruitingPhaseLabel: 'Phase',
      recruitingVisibilityLabel: 'Visibility',
      recruitingGmRoleLabel: 'HUMAN GM',
      recruitingGmReadyDescription:
        '플레이어가 캐릭터를 선택하고 준비를 마치면 세션을 시작할 수 있습니다.',
      sessionTitleText: session?.title ?? '활성 세션이 없습니다',
      inviteCodeText: inviteCode ?? '------',
      inviteCodeToCopy: inviteCode,
      canCopyInviteCode: Boolean(inviteCode),
      statusText: session?.status ?? 'unknown',
      phaseText: phase ?? 'unknown',
      visibilityText: session?.visibility ?? 'unknown',
    };
  }, [phase, session]);
}
