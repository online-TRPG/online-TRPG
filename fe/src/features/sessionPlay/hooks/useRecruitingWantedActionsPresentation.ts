type UseRecruitingWantedActionsPresentationParams = {
  busy: boolean;
  readyLocked: boolean;
  selectedCharacterId: string | null;
  wantedCarouselCharacterCount: number;
  wantedCarouselCharacterDisabled: boolean;
  isReady: boolean;
  hasSelectedCharacter: boolean;
  selectedCharacterLevelAllowed: boolean;
  canControlSession: boolean;
  allPlayersReady: boolean;
  isStatusMinimized: boolean;
  canStartSession: boolean;
};

export function useRecruitingWantedActionsPresentation({
  busy,
  readyLocked,
  selectedCharacterId,
  wantedCarouselCharacterCount,
  wantedCarouselCharacterDisabled,
  isReady,
  hasSelectedCharacter,
  selectedCharacterLevelAllowed,
  canControlSession,
  allPlayersReady,
  isStatusMinimized,
  canStartSession,
}: UseRecruitingWantedActionsPresentationParams) {
  const hasSelectedCharacterId = Boolean(selectedCharacterId);
  const carouselNavigationDisabled =
    busy || readyLocked || hasSelectedCharacterId || wantedCarouselCharacterCount <= 1;
  const characterSelectionDisabled =
    busy ||
    readyLocked ||
    (!hasSelectedCharacterId && wantedCarouselCharacterCount === 0) ||
    (!hasSelectedCharacterId && wantedCarouselCharacterDisabled);

  return {
    carouselNavigationDisabled,
    previousCharacterAriaLabel: '이전 캐릭터 보기',
    nextCharacterAriaLabel: '다음 캐릭터 보기',
    createCharacterDisabled: readyLocked,
    createCharacterLabel: '캐릭터 생성',
    characterSelectionDisabled,
    characterSelectionLabel: hasSelectedCharacterId ? '선택 해제' : '캐릭터 선택',
    readyButtonActive: isReady,
    readyButtonClassName: `ready-toggle-button recruiting-ready-button recruiting-wanted-ready${
      isReady ? ' active' : ''
    }`,
    readyButtonDisabled: busy || !hasSelectedCharacter || !selectedCharacterLevelAllowed,
    readyButtonLabel: isReady ? '준비 해제' : '준비 완료',
    nextReadyValue: !isReady,
    shouldShowStartButton: canControlSession && allPlayersReady && isStatusMinimized,
    startButtonDisabled: !canStartSession || busy,
    startButtonLabel: '세션 시작',
  };
}
