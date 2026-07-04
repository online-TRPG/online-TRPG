import type { FormEvent } from 'react';
import type {
  MainCommandResponseDto,
  SubmitMainCommandDto,
} from '@trpg/shared-types';
import type { ExplorationMainCommandRequest } from '../components/ExplorationNodeSurface';
import {
  buildExplorationMainCommandRequestModel,
  buildGeneralGmPreset,
  buildMainCommandSubmitPolicy,
  getExplorationMainCommandPresetByIntent,
  getMainCommandFieldConfigForSelection,
  getMainCommandHelperGroup,
  isImmediateExplorationMainCommandIntent,
  MainCommandScreenTypeValues,
  parseMainSlashInput,
  type ExplorationMainCommandRequestModel,
  type MainCommandHelperGroup,
  type MainCommandHelperOption,
  type MainCommandItemLike,
  type MainCommandPresetModel,
  type MainCommandTargetLike,
} from '../utils/mainCommandModel';
import type { SessionTab } from './useSessionTabs';

export type MainCommandMode = 'GM_REQUEST' | 'RP_ACTION';

type MainCommandActorSource = {
  selectedCharacterId?: string | null;
  participantSessionCharacterId?: string | null;
  participantCharacterId?: string | null;
};

type UseMainCommandSubmitHandlersParams<
  TTarget extends MainCommandTargetLike,
  TItem extends MainCommandItemLike,
> = {
  mainMessage: string;
  setMainMessage: (message: string) => void;
  mainCommandMode: MainCommandMode;
  isAiGmSession: boolean;
  currentScreenType: SubmitMainCommandDto['screenType'] | null | undefined;
  currentNodeId?: string | null;
  mainCommandPresets: MainCommandPresetModel[];
  activeMainHelperOption: MainCommandHelperOption | null;
  selectedMainTargetId: string;
  selectedMainTarget: TTarget | null;
  selectedMainItemId: string;
  selectedMainItem: TItem | null;
  selectedMainSpellId: string;
  selectedMainRelatedIntent: SubmitMainCommandDto['intent'] | '';
  mainPointX: string;
  mainPointY: string;
  isExplorationMainCommandContext: boolean;
  actorSource: MainCommandActorSource;
  visibleTargets: TTarget[];
  inventoryItems: TItem[];
  setActiveTab: (tab: SessionTab) => void;
  setMainCommandMode: (mode: MainCommandMode) => void;
  setSelectedMainCategory: (category: string | null) => void;
  setOpenMainCommandCategory: (category: string | null) => void;
  setSelectedMainIntent: (intent: SubmitMainCommandDto['intent'] | null) => void;
  setActiveMainHelperGroup: (group: MainCommandHelperGroup | null) => void;
  setPendingMainCommandDraft: (request: ExplorationMainCommandRequest | null) => void;
  setPendingMainCommandCheck: (check: null) => void;
  setMainCommandError: (error: string | null) => void;
  applyExplorationMainCommandRequestModel: (
    model: ExplorationMainCommandRequestModel<TTarget, TItem>,
  ) => void;
  onAction: (label: string) => void;
  onMainCommand: (payload: SubmitMainCommandDto) => Promise<MainCommandResponseDto | null>;
};

function getMainCommandActorId(source: MainCommandActorSource): string {
  return (
    source.selectedCharacterId ??
    source.participantSessionCharacterId ??
    source.participantCharacterId ??
    ''
  );
}

export function useMainCommandSubmitHandlers<
  TTarget extends MainCommandTargetLike,
  TItem extends MainCommandItemLike,
>(params: UseMainCommandSubmitHandlersParams<TTarget, TItem>) {
  const {
    mainMessage,
    setMainMessage,
    mainCommandMode,
    isAiGmSession,
    currentScreenType,
    currentNodeId,
    mainCommandPresets,
    activeMainHelperOption,
    selectedMainTargetId,
    selectedMainTarget,
    selectedMainItemId,
    selectedMainItem,
    selectedMainSpellId,
    selectedMainRelatedIntent,
    mainPointX,
    mainPointY,
    isExplorationMainCommandContext,
    actorSource,
    visibleTargets,
    inventoryItems,
    setActiveTab,
    setMainCommandMode,
    setSelectedMainCategory,
    setOpenMainCommandCategory,
    setSelectedMainIntent,
    setActiveMainHelperGroup,
    setPendingMainCommandDraft,
    setPendingMainCommandCheck,
    setMainCommandError,
    applyExplorationMainCommandRequestModel,
    onAction,
    onMainCommand,
  } = params;

  async function handleMainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = mainMessage.trim();
    if (!next) return;

    if (mainCommandMode === 'RP_ACTION') {
      setMainCommandError(null);
      setMainMessage('');
      setPendingMainCommandCheck(null);
      onAction(`MAIN:${next}`);
      return;
    }

    if (isAiGmSession && currentScreenType) {
      const parsedSlash = parseMainSlashInput(next, mainCommandPresets);
      const submitPreset: MainCommandPresetModel | null = parsedSlash?.type === 'matched'
        ? parsedSlash.preset
        : parsedSlash
          ? null
          : buildGeneralGmPreset(currentScreenType);

      if (!submitPreset) {
        setMainCommandError(
          parsedSlash?.type === 'unknown'
            ? `현재 장면에서 사용할 수 없는 명령어입니다: ${parsedSlash.command}`
            : '명령어를 선택하거나 내용을 입력해주세요.',
        );
        return;
      }

      const commandBody =
        parsedSlash?.type === 'matched' ? parsedSlash.playerText : next;
      const playerText = commandBody.trim() || submitPreset.label;
      const activeFieldConfig = getMainCommandFieldConfigForSelection(
        submitPreset,
        activeMainHelperOption,
      );
      const submitPolicy = buildMainCommandSubmitPolicy({
        intent: submitPreset.intent,
        fieldConfig: activeFieldConfig,
        selectedTargetId: selectedMainTargetId,
        selectedTarget: selectedMainTarget,
        selectedItemId: selectedMainItemId,
        selectedItem: selectedMainItem,
        selectedSpellId: selectedMainSpellId,
        selectedRelatedIntent: selectedMainRelatedIntent,
        rawPointX: mainPointX,
        rawPointY: mainPointY,
        commandBody,
        isExplorationContext: isExplorationMainCommandContext,
      });

      if (submitPolicy.error) {
        setMainCommandError(submitPolicy.error);
        return;
      }

      setMainCommandError(null);
      setMainMessage('');
      await onMainCommand({
        commandId: submitPreset.intent,
        screenType: currentScreenType,
        category: submitPreset.category,
        intent: submitPreset.intent,
        actorId: getMainCommandActorId(actorSource),
        playerText,
        rawInputText: next,
        ...(currentNodeId ? { nodeId: currentNodeId } : {}),
        ...(submitPolicy.shouldSubmitTarget ? { targetId: selectedMainTargetId } : {}),
        ...(submitPolicy.shouldSubmitTarget && selectedMainTarget?.targetType
          ? { targetType: selectedMainTarget.targetType }
          : {}),
        ...(submitPolicy.shouldSubmitItem ? { itemId: selectedMainItemId } : {}),
        ...(submitPolicy.shouldSubmitSpell ? { spellId: selectedMainSpellId.trim() } : {}),
        ...(submitPolicy.shouldSubmitMapPoint && submitPolicy.mapPointResult.mapPoint
          ? { mapPoint: submitPolicy.mapPointResult.mapPoint }
          : {}),
        ...(submitPolicy.shouldSubmitRelatedIntent && selectedMainRelatedIntent
          ? { relatedIntent: selectedMainRelatedIntent }
          : {}),
      });
      setPendingMainCommandCheck(null);
      return;
    }

    setMainMessage('');
    onAction(`MAIN:${next}`);
    setPendingMainCommandCheck(null);
  }

  async function handleExplorationMainCommandRequest(
    request: ExplorationMainCommandRequest,
  ) {
    const preset = getExplorationMainCommandPresetByIntent(request.intent);

    if (!preset) {
      setMainCommandError('현재 탐색 화면에서 사용할 수 없는 명령입니다.');
      return;
    }

    if (!isImmediateExplorationMainCommandIntent(preset.intent)) {
      setActiveTab('Main');
      setMainCommandMode('GM_REQUEST');
      setSelectedMainCategory(preset.categoryLabel);
      setOpenMainCommandCategory(null);
      setSelectedMainIntent(preset.intent);
      setActiveMainHelperGroup(getMainCommandHelperGroup(preset) ?? null);
      setPendingMainCommandDraft(request);
      return;
    }

    const fieldConfig = getMainCommandFieldConfigForSelection(preset, null);
    const requestModel = buildExplorationMainCommandRequestModel({
      preset,
      fieldConfig,
      targetId: request.targetId,
      itemId: request.itemId,
      mapPoint: request.mapPoint ?? null,
      playerText: request.playerText,
      visibleTargets,
      inventoryItems,
      isExplorationContext: isExplorationMainCommandContext,
    });

    setActiveTab('Main');
    setMainCommandMode('GM_REQUEST');
    setSelectedMainCategory(preset.categoryLabel);
    setOpenMainCommandCategory(null);
    setSelectedMainIntent(preset.intent);
    setActiveMainHelperGroup(getMainCommandHelperGroup(preset) ?? null);
    applyExplorationMainCommandRequestModel(requestModel);
    setMainMessage('');
    setPendingMainCommandCheck(null);
    setPendingMainCommandDraft(null);
    setMainCommandError(null);

    await onMainCommand({
      commandId: preset.intent,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
      category: preset.category,
      intent: preset.intent,
      actorId: getMainCommandActorId(actorSource),
      playerText: request.playerText,
      rawInputText: requestModel.rawInputText,
      ...(currentNodeId ? { nodeId: currentNodeId } : {}),
      ...(requestModel.target
        ? { targetId: requestModel.target.id, targetType: requestModel.target.targetType }
        : {}),
      ...(requestModel.shouldSubmitItem && requestModel.item
        ? { itemId: requestModel.item.id }
        : {}),
      ...(requestModel.shouldSubmitMapPoint && request.mapPoint
        ? { mapPoint: request.mapPoint }
        : {}),
    });
  }

  return {
    handleMainSubmit,
    handleExplorationMainCommandRequest,
  };
}
