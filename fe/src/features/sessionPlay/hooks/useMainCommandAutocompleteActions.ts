import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SubmitMainCommandDto } from '@trpg/shared-types';
import {
  getMainCommandHelperGroupForSelection,
  getMainCommandSlashCommands,
  getNextMainCommandAutocompleteIndex,
  type MainCommandAutocompleteEntry,
  type MainCommandAutocompleteNavigationKey,
  type MainCommandHelperGroup,
  type MainCommandPresetModel,
} from '../utils/mainCommandModel';
import type { MainCommandMode } from './useMainCommandSubmitHandlers';
import type { SessionTab } from './useSessionTabs';

type UseMainCommandAutocompleteActionsParams = {
  activeTab: SessionTab;
  mainCommandMode: MainCommandMode;
  shouldShowMainCommandAutocomplete: boolean;
  commandEntries: Extract<MainCommandAutocompleteEntry, { type: 'command' }>[];
  activeEntry: Extract<MainCommandAutocompleteEntry, { type: 'command' }> | null;
  activeHelperGroup?: MainCommandHelperGroup | null;
  setMainCommandMode: (mode: MainCommandMode) => void;
  setMainMessage: (message: string) => void;
  setSelectedMainIntent: (intent: SubmitMainCommandDto['intent'] | null) => void;
  setActiveMainHelperGroup: (group: MainCommandHelperGroup | null) => void;
  setCommandGuideOpen: (isOpen: boolean) => void;
  setMainCommandError: (error: string | null) => void;
  setMainCommandAutocompleteIndex: (
    updater: (currentIndex: number) => number,
  ) => void;
};

function isMainCommandAutocompleteNavigationKey(
  key: string,
): key is MainCommandAutocompleteNavigationKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function useMainCommandAutocompleteActions(
  params: UseMainCommandAutocompleteActionsParams,
) {
  const {
    activeTab,
    mainCommandMode,
    shouldShowMainCommandAutocomplete,
    commandEntries,
    activeEntry,
    activeHelperGroup,
    setMainCommandMode,
    setMainMessage,
    setSelectedMainIntent,
    setActiveMainHelperGroup,
    setCommandGuideOpen,
    setMainCommandError,
    setMainCommandAutocompleteIndex,
  } = params;

  function applyMainCommandAutocomplete(command: MainCommandPresetModel) {
    const slashCommand = getMainCommandSlashCommands(command)[0];
    if (!slashCommand) return;

    setMainCommandMode('GM_REQUEST');
    setMainMessage(`${slashCommand} `);
    setSelectedMainIntent(command.intent);
    setActiveMainHelperGroup(
      getMainCommandHelperGroupForSelection(command, activeHelperGroup ?? undefined),
    );
    setCommandGuideOpen(false);
    setMainCommandError(null);
  }

  function handleSidebarInputKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    if (
      activeTab !== 'Main' ||
      mainCommandMode !== 'GM_REQUEST' ||
      !shouldShowMainCommandAutocomplete ||
      !commandEntries.length
    ) {
      return;
    }

    if (isMainCommandAutocompleteNavigationKey(event.key)) {
      event.preventDefault();
      const navigationKey = event.key;
      setMainCommandAutocompleteIndex((current) =>
        getNextMainCommandAutocompleteIndex(current, commandEntries.length, navigationKey),
      );
      return;
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      const selectedEntry = activeEntry ?? commandEntries[0];
      if (selectedEntry) {
        applyMainCommandAutocomplete(selectedEntry.command);
      }
    }
  }

  return {
    applyMainCommandAutocomplete,
    handleSidebarInputKeyDown,
  };
}
