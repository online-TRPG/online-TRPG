import { useMemo } from 'react';
import type { InventoryItemDto, SubmitMainCommandDto } from '@trpg/shared-types';
import type { MainCommandMode } from './useMainCommandSubmitHandlers';
import {
  buildMainCommandAutocompleteModel,
  buildMainCommandCategoryOptions,
  getActiveMainCommandCategory,
  getAvailableMainCommandHelperOptions,
  getMainCommandCategoryLabels,
  getMainCommandDescription,
  getMainCommandFieldConfigForSelection,
  getMainCommandFieldVisibility,
  getMainCommandPresetsForScreen,
  getMainCommandRelatedIntentOptions,
  getMainCommandSlashCommands,
  getOpenMainCommandOptions,
  getVisibleMainCommandTargetOptions,
  parseMainSlashInput,
  selectActiveMainCommandHelperOption,
  type MainCommandAutocompleteEntry,
  type MainCommandHelperGroup,
  type MainCommandPresetModel,
  type MainCommandTargetLike,
} from '../utils/mainCommandModel';

type UseMainCommandPresentationModelParams = {
  currentScreenType: SubmitMainCommandDto['screenType'] | null;
  isExplorationMainCommandContext: boolean;
  mainCommandMode: MainCommandMode;
  mainMessage: string;
  isCommandGuideOpen: boolean;
  activeMainHelperGroup: MainCommandHelperGroup | null;
  selectedMainCategory: string | null;
  openMainCommandCategory: string | null;
  visibleTargets: MainCommandTargetLike[];
  selectedCharacterInventory: InventoryItemDto[];
  selectedMainTargetId: string | null;
  selectedMainItemId: string | null;
  mainCommandAutocompleteIndex: number;
};

type MainCommandAutocompleteEntryPresentation =
  | Extract<MainCommandAutocompleteEntry, { type: 'separator' }>
  | {
      type: 'command';
      command: MainCommandPresetModel;
      slashCommand: string;
      description: string;
      autocompleteIndex: number;
      isActive: boolean;
      id: string;
      className: string;
      ariaSelected: boolean;
      dataAutocompleteActive: 'true' | undefined;
    };

export function useMainCommandPresentationModel(
  params: UseMainCommandPresentationModelParams,
) {
  const {
    currentScreenType,
    isExplorationMainCommandContext,
    mainCommandMode,
    mainMessage,
    isCommandGuideOpen,
    activeMainHelperGroup,
    selectedMainCategory,
    openMainCommandCategory,
    visibleTargets,
    selectedCharacterInventory,
    selectedMainTargetId,
    selectedMainItemId,
    mainCommandAutocompleteIndex,
  } = params;

  const mainCommandPresets = useMemo(() => {
    return getMainCommandPresetsForScreen(
      currentScreenType,
      isExplorationMainCommandContext,
    );
  }, [currentScreenType, isExplorationMainCommandContext]);
  const mainCommandCategories = useMemo(
    () => buildMainCommandCategoryOptions(mainCommandPresets),
    [mainCommandPresets],
  );
  const mainCommandCategoryLabels = useMemo(
    () => getMainCommandCategoryLabels(mainCommandCategories),
    [mainCommandCategories],
  );
  const activeMainCategory = getActiveMainCommandCategory(
    selectedMainCategory,
    mainCommandCategoryLabels,
  );
  const openMainCommandOptions = getOpenMainCommandOptions(
    mainCommandPresets,
    openMainCommandCategory,
  );
  const parsedMainSlashInput = useMemo(
    () =>
      mainCommandMode === 'GM_REQUEST'
        ? parseMainSlashInput(mainMessage, mainCommandPresets)
        : null,
    [mainCommandMode, mainCommandPresets, mainMessage],
  );
  const matchedMainSlashCommand =
    parsedMainSlashInput?.type === 'matched' ? parsedMainSlashInput : null;
  const selectedMainCommand = matchedMainSlashCommand?.preset ?? null;
  const availableMainHelperOptions = useMemo(() => {
    return getAvailableMainCommandHelperOptions({
      screenType: currentScreenType,
      visibleTargets,
      inventoryItemCount: selectedCharacterInventory.length,
    });
  }, [currentScreenType, selectedCharacterInventory.length, visibleTargets]);
  const activeMainHelperOption = selectActiveMainCommandHelperOption({
    isExplorationContext: isExplorationMainCommandContext,
    availableOptions: availableMainHelperOptions,
    selectedCommand: selectedMainCommand,
    activeHelperGroup: activeMainHelperGroup,
  });
  const selectedMainFieldConfig = getMainCommandFieldConfigForSelection(
    selectedMainCommand,
    activeMainHelperOption,
  );
  const mainCommandAutocompleteModel = useMemo(
    () =>
      buildMainCommandAutocompleteModel({
        rawText: mainMessage,
        presets: mainCommandPresets,
        isGmRequestMode: mainCommandMode === 'GM_REQUEST',
        activeHelperGroup: activeMainHelperOption?.id,
        activeIndex: mainCommandAutocompleteIndex,
      }),
    [
      activeMainHelperOption?.id,
      mainCommandAutocompleteIndex,
      mainCommandMode,
      mainCommandPresets,
      mainMessage,
    ],
  );
  const visibleTargetOptions = getVisibleMainCommandTargetOptions(
    visibleTargets,
    selectedMainFieldConfig,
  );
  const mainCommandFieldVisibility = getMainCommandFieldVisibility(
    selectedMainFieldConfig,
    isExplorationMainCommandContext,
  );
  const mainCommandModeButtonsPresentation = {
    gmRequest: {
      className: `main-command-mode-button main-command-primary-mode-button${
        mainCommandMode === 'GM_REQUEST' ? ' active' : ''
      }`,
      ariaPressed: mainCommandMode === 'GM_REQUEST',
    },
    rpAction: {
      className: `main-command-mode-button main-command-primary-mode-button${
        mainCommandMode === 'RP_ACTION' ? ' active' : ''
      }`,
      ariaPressed: mainCommandMode === 'RP_ACTION',
    },
    commandGuide: {
      className: `main-command-mode-button main-command-outline-mode-button main-command-command-mode-button${
        isCommandGuideOpen ||
        mainCommandAutocompleteModel.shouldShowAutocomplete ||
        Boolean(selectedMainCommand)
          ? ' active'
          : ''
      }`,
      ariaPressed:
        isCommandGuideOpen ||
        mainCommandAutocompleteModel.shouldShowAutocomplete ||
        Boolean(selectedMainCommand),
    },
  };
  const availableMainHelperOptionPresentations = availableMainHelperOptions.map(
    (option) => {
      const isActive = activeMainHelperOption?.id === option.id;

      return {
        ...option,
        className: `main-command-helper-button main-command-target-helper-button${
          isActive ? ' active' : ''
        }`,
        ariaPressed: isActive,
      };
    },
  );
  const mainCommandGuideOptions = mainCommandPresets.flatMap((command) => {
    const slashCommand = getMainCommandSlashCommands(command)[0];
    if (!slashCommand) return [];

    return [
      {
        command,
        slashCommand,
        description: getMainCommandDescription(command),
      },
    ];
  });
  const mainCommandAutocompleteEntryPresentations =
    mainCommandAutocompleteModel.entries.reduce<MainCommandAutocompleteEntryPresentation[]>(
      (entries, entry) => {
        if (entry.type === 'separator') {
          entries.push(entry);
          return entries;
        }

        const slashCommand = getMainCommandSlashCommands(entry.command)[0];
        if (!slashCommand) return entries;

        const autocompleteIndex =
          mainCommandAutocompleteModel.indexByIntent.get(entry.command.intent) ?? -1;
        const isActive = autocompleteIndex === mainCommandAutocompleteIndex;

        entries.push({
          type: 'command',
          command: entry.command,
          slashCommand,
          description: getMainCommandDescription(entry.command),
          autocompleteIndex,
          isActive,
          id: `main-command-autocomplete-${entry.command.intent}`,
          className: `main-command-autocomplete-option${isActive ? ' active' : ''}`,
          ariaSelected: isActive,
          dataAutocompleteActive: isActive ? 'true' : undefined,
        });
        return entries;
      },
      [],
    );
  const mainCommandText = {
    gmRequestModeLabel: 'GM 요청',
    rpActionModeLabel: 'RP 행동',
    commandGuideLabel: '명령어',
    explorationSelectionAriaLabel: '탐색 선택 대상',
    mapSelectionLabel: '맵 선택',
    itemSelectionLabel: '아이템 선택',
    commandGuideNoticeFirstLine: '💡 자유롭게 행동을 입력할 수 있지만,',
    commandGuideNoticeSecondLine:
      '`/명령어` 입력 시 보다 빠르고 정확한 응답이 옵니다!',
    autocompleteAriaLabel: '명령어 자동완성',
    targetFieldLabel: '대상',
    itemFieldLabel: '아이템',
    spellFieldLabel: '주문',
    spellPlaceholder: '주문 이름',
    relatedIntentFieldLabel: '관련 명령',
    pointFieldLabel: '좌표',
    selectPlaceholder: '선택하세요',
    relatedIntentPlaceholder: '선택 안 함',
    pointXPlaceholder: 'x',
    pointYPlaceholder: 'y',
  };

  return {
    mainCommandText,
    mainCommandPresets,
    mainCommandCategoryLabels,
    activeMainCategory,
    openMainCommandOptions,
    selectedMainCommand,
    availableMainHelperOptions,
    activeMainHelperOption,
    mainSlashToken: mainCommandAutocompleteModel.slashToken,
    shouldShowMainCommandAutocomplete:
      mainCommandAutocompleteModel.shouldShowAutocomplete,
    shouldShowCommandGuide:
      isCommandGuideOpen && !mainCommandAutocompleteModel.shouldShowAutocomplete,
    mainCommandModeButtonsPresentation,
    availableMainHelperOptionPresentations,
    mainCommandGuideOptions,
    mainCommandAutocompleteEntryPresentations,
    mainCommandAutocompleteCommandEntries:
      mainCommandAutocompleteModel.commandEntries,
    activeMainCommandAutocompleteEntry: mainCommandAutocompleteModel.activeEntry,
    activeMainCommandAutocompleteId: mainCommandAutocompleteModel.activeId,
    visibleTargetOptions,
    shouldShowMainCommandFields:
      mainCommandFieldVisibility.shouldShowCommandFields,
    shouldShowMainTargetField: mainCommandFieldVisibility.shouldShowTargetField,
    shouldShowMainItemField: mainCommandFieldVisibility.shouldShowItemField,
    shouldShowMainSpellField: mainCommandFieldVisibility.shouldShowSpellField,
    shouldShowMainRelatedIntentField:
      mainCommandFieldVisibility.shouldShowRelatedIntentField,
    shouldShowMainPointField: mainCommandFieldVisibility.shouldShowPointField,
    selectedMainTarget:
      visibleTargetOptions.find((target) => target.id === selectedMainTargetId) ?? null,
    selectedMainItem:
      selectedCharacterInventory.find((item) => item.id === selectedMainItemId) ?? null,
    relatedIntentOptions: getMainCommandRelatedIntentOptions(mainCommandPresets),
  };
}
