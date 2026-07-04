import { useCallback, useEffect, useState } from 'react';

type UseSessionStartTransitionParams = {
  isRecruiting: boolean;
  isHumanGmSession: boolean;
  isGmUser: boolean;
  isHost: boolean;
  readyParticipantCount: number;
  participantCount: number;
  onStartSession: () => void;
};

export function useSessionStartTransition(params: UseSessionStartTransitionParams) {
  const {
    isRecruiting,
    isHumanGmSession,
    isGmUser,
    isHost,
    readyParticipantCount,
    participantCount,
    onStartSession,
  } = params;
  const [isGameStarting, setIsGameStarting] = useState(false);
  const [isStartTransitionPending, setIsStartTransitionPending] = useState(false);

  useEffect(() => {
    if (isRecruiting) {
      setIsGameStarting(false);
      setIsStartTransitionPending(false);
      return;
    }

    if (!isStartTransitionPending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsGameStarting(false);
      setIsStartTransitionPending(false);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isRecruiting, isStartTransitionPending]);

  const handleStartSession = useCallback(() => {
    setIsStartTransitionPending(true);
    setIsGameStarting(true);
    onStartSession();
  }, [onStartSession]);

  const startOverlayPresentation = {
    closeAriaLabel: '세션 시작 오버레이 닫기',
    eyebrow: '✦ Session status ✦',
    title: '세션 시작',
    readyBadgeText: `${readyParticipantCount}/${participantCount} READY`,
    subtitle: '모든 플레이어가 준비를 완료했습니다.',
    description: isHumanGmSession
      ? isGmUser
        ? '지금 게임을 시작하시겠습니까?'
        : '인간 GM이 세션을 시작할 때까지 기다려주세요.'
      : isHost
        ? '지금 게임을 시작하시겠습니까?'
        : '호스트가 세션을 시작할 때까지 기다려주세요.',
    cancelLabel: '취소',
    startLabel: '게임 시작',
  };
  const gameStartingPresentation = {
    title: '게임 화면으로 이동하는 중입니다',
    description: '정보를 불러오는 중입니다.',
  };

  return {
    isGameStarting,
    handleStartSession,
    startOverlayPresentation,
    gameStartingPresentation,
  };
}
