import { useCallback, useState } from 'react';

type UseSessionLeaveConfirmationParams = {
  onLeaveSession: () => void;
  isHost: boolean;
};

export function useSessionLeaveConfirmation(params: UseSessionLeaveConfirmationParams) {
  const { onLeaveSession, isHost } = params;
  const [isLeaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const requestLeaveSession = useCallback(() => {
    setLeaveConfirmOpen(true);
  }, []);

  const cancelLeaveSession = useCallback(() => {
    setLeaveConfirmOpen(false);
  }, []);

  const confirmLeaveSession = useCallback(() => {
    setLeaveConfirmOpen(false);
    onLeaveSession();
  }, [onLeaveSession]);

  const leaveConfirmPresentation = {
    closeAriaLabel: isHost ? '세션 삭제 확인창 닫기' : '세션 탈퇴 확인창 닫기',
    title: isHost ? '세션을 삭제하시겠습니까?' : '세션에서 탈퇴하시겠습니까?',
    description: isHost
      ? '세션이 종료되고 모든 참가자의 소속, 진행 일정, 캐릭터 연결과 준비 상태가 정리됩니다. 플레이 화면만 나가려면 취소 후 “플레이 화면 나가기”를 사용하세요.'
      : '세션 소속이 끝나고 이 세션에서 사용하던 캐릭터 연결과 준비 상태가 정리됩니다. 플레이 화면만 나가려면 취소 후 “플레이 화면 나가기”를 사용하세요.',
    cancelLabel: '취소',
    confirmLabel: isHost ? '세션 삭제' : '세션 탈퇴',
  };

  return {
    isLeaveConfirmOpen,
    requestLeaveSession,
    cancelLeaveSession,
    confirmLeaveSession,
    leaveConfirmPresentation,
  };
}
