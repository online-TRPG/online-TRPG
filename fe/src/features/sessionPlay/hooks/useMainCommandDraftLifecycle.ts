import { useEffect } from 'react';
import type { SubmitMainCommandDto } from '@trpg/shared-types';
import type { ExplorationMainCommandRequest } from '../components/ExplorationNodeSurface';
import {
  buildMainCommandDraftInputModel,
  type MainCommandDraftInputModel,
  type MainCommandPresetModel,
} from '../utils/mainCommandModel';

type UseMainCommandDraftLifecycleParams = {
  currentNodeId?: string | null;
  isExplorationMainCommandContext: boolean;
  selectedMainIntent: SubmitMainCommandDto['intent'] | null;
  pendingMainCommandDraft: ExplorationMainCommandRequest | null;
  mainCommandPresets: MainCommandPresetModel[];
  clearMainCommandSelectionFields: () => void;
  resetMainCommandFieldsForContext: (params: {
    isExplorationContext: boolean;
  }) => void;
  applyMainCommandDraftInput: (draftInput: MainCommandDraftInputModel) => void;
  setMainMessage: (message: string) => void;
  setMainCommandError: (error: string | null) => void;
  setPendingMainCommandDraft: (draft: ExplorationMainCommandRequest | null) => void;
};

export function useMainCommandDraftLifecycle(
  params: UseMainCommandDraftLifecycleParams,
) {
  const {
    currentNodeId,
    isExplorationMainCommandContext,
    selectedMainIntent,
    pendingMainCommandDraft,
    mainCommandPresets,
    clearMainCommandSelectionFields,
    resetMainCommandFieldsForContext,
    applyMainCommandDraftInput,
    setMainMessage,
    setMainCommandError,
    setPendingMainCommandDraft,
  } = params;

  useEffect(() => {
    clearMainCommandSelectionFields();
    setMainCommandError(null);
  }, [clearMainCommandSelectionFields, currentNodeId, setMainCommandError]);

  useEffect(() => {
    resetMainCommandFieldsForContext({
      isExplorationContext: isExplorationMainCommandContext,
    });
    setMainCommandError(null);
  }, [
    isExplorationMainCommandContext,
    resetMainCommandFieldsForContext,
    selectedMainIntent,
    setMainCommandError,
  ]);

  useEffect(() => {
    if (!pendingMainCommandDraft || selectedMainIntent !== pendingMainCommandDraft.intent) {
      return;
    }

    const draftPreset = mainCommandPresets.find(
      (preset) => preset.intent === pendingMainCommandDraft.intent,
    );
    const draftInput = buildMainCommandDraftInputModel({
      preset: draftPreset ?? null,
      playerText: pendingMainCommandDraft.playerText,
      targetId: pendingMainCommandDraft.targetId,
      itemId: pendingMainCommandDraft.itemId,
      mapPoint: pendingMainCommandDraft.mapPoint ?? null,
    });
    setMainMessage(draftInput.message);
    applyMainCommandDraftInput(draftInput);
    setMainCommandError(null);
    setPendingMainCommandDraft(null);
  }, [
    applyMainCommandDraftInput,
    mainCommandPresets,
    pendingMainCommandDraft,
    selectedMainIntent,
    setMainCommandError,
    setMainMessage,
    setPendingMainCommandDraft,
  ]);
}
