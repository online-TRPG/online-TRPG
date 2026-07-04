import { useMemo } from 'react';
import type { MainCommandMode } from './useMainCommandSubmitHandlers';
import type { SessionTab } from './useSessionTabs';

type UseSessionMessageInputPresentationParams = {
  activeTab: SessionTab;
  mainCommandMode: MainCommandMode;
  selectedMainCommandLabel?: string | null;
  shouldShowMainCommandAutocomplete: boolean;
  mainCommandAutocompleteCommandCount: number;
  activeMainCommandAutocompleteId?: string | null;
};

export function useSessionMessageInputPresentation({
  activeTab,
  mainCommandMode,
  selectedMainCommandLabel,
  shouldShowMainCommandAutocomplete,
  mainCommandAutocompleteCommandCount,
  activeMainCommandAutocompleteId,
}: UseSessionMessageInputPresentationParams) {
  return useMemo(() => {
    const isMainTab = activeTab === 'Main';
    const inputPlaceholder = isMainTab
      ? mainCommandMode === 'RP_ACTION'
        ? '캐릭터 대사나 분위기 묘사를 입력하세요...'
        : selectedMainCommandLabel
          ? `${selectedMainCommandLabel} 내용을 입력하세요...`
          : '행동을 선언하거나 상황을 입력하세요...'
      : '채팅을 입력하세요...';
    const shouldExposeAutocomplete =
      isMainTab && shouldShowMainCommandAutocomplete;

    return {
      inputPlaceholder,
      inputRole: isMainTab ? ('combobox' as const) : undefined,
      ariaAutocomplete: isMainTab ? ('list' as const) : undefined,
      ariaExpanded: shouldExposeAutocomplete
        ? mainCommandAutocompleteCommandCount > 0
        : undefined,
      ariaActivedescendant: shouldExposeAutocomplete
        ? activeMainCommandAutocompleteId ?? undefined
        : undefined,
      submitLabel: '전송',
    };
  }, [
    activeMainCommandAutocompleteId,
    activeTab,
    mainCommandAutocompleteCommandCount,
    mainCommandMode,
    selectedMainCommandLabel,
    shouldShowMainCommandAutocomplete,
  ]);
}
