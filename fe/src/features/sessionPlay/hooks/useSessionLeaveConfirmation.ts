import { useCallback, useState } from 'react';

type UseSessionLeaveConfirmationParams = {
  onLeaveSession: () => void;
};

export function useSessionLeaveConfirmation(params: UseSessionLeaveConfirmationParams) {
  const { onLeaveSession } = params;
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
    closeAriaLabel: '세션 영구 퇴장 확인창 닫기',
    title: '정말 퇴장하시겠습니까?',
    description: '재입장이 불가능합니다.',
    cancelLabel: '취소',
    confirmLabel: '퇴장',
  };

  return {
    isLeaveConfirmOpen,
    requestLeaveSession,
    cancelLeaveSession,
    confirmLeaveSession,
    leaveConfirmPresentation,
  };
}
