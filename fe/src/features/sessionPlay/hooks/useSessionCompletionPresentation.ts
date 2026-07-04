type UseSessionCompletionPresentationParams = {
  isPartyDefeated: boolean;
};

export function useSessionCompletionPresentation({
  isPartyDefeated,
}: UseSessionCompletionPresentationParams) {
  return {
    eyebrow: 'GAME OVER',
    title: '게임이 종료되었습니다',
    description: isPartyDefeated
      ? '파티가 전멸해 세션 진행이 완료 상태로 전환되었습니다.'
      : '세션 진행이 완료 상태로 전환되었습니다.',
  };
}
