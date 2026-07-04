import { useCallback, useEffect, useState } from 'react';
import type { SubmitMainCommandDto } from '@trpg/shared-types';
import type { BattleMapSelection } from '../components/SessionBattleMap';
import type {
  ExplorationMainCommandRequestModel,
  MainCommandDraftInputModel,
} from '../utils/mainCommandModel';

export function useMainCommandSelectionFields() {
  const [selectedMainTargetId, setSelectedMainTargetId] = useState('');
  const [selectedMainItemId, setSelectedMainItemId] = useState('');
  const [selectedMainSpellId, setSelectedMainSpellId] = useState('');
  const [selectedMainRelatedIntent, setSelectedMainRelatedIntent] = useState('');
  const [mainPointX, setMainPointX] = useState('');
  const [mainPointY, setMainPointY] = useState('');
  const [selectedExplorationMapSelection, setSelectedExplorationMapSelection] =
    useState<BattleMapSelection | null>(null);

  const clearMainCommandSelectionFields = useCallback(() => {
    setSelectedMainTargetId('');
    setSelectedMainItemId('');
    setSelectedMainSpellId('');
    setSelectedMainRelatedIntent('');
    setMainPointX('');
    setMainPointY('');
    setSelectedExplorationMapSelection(null);
  }, []);

  const resetMainCommandFieldsForContext = useCallback((params: {
    isExplorationContext: boolean;
  }) => {
    setSelectedMainSpellId('');
    setSelectedMainRelatedIntent('');
    if (!params.isExplorationContext) {
      setSelectedMainTargetId('');
      setSelectedMainItemId('');
      setMainPointX('');
      setMainPointY('');
      setSelectedExplorationMapSelection(null);
    }
  }, []);

  const applyMainCommandDraftInput = useCallback((draftInput: MainCommandDraftInputModel) => {
    setSelectedMainTargetId(draftInput.targetId);
    setSelectedMainItemId(draftInput.itemId);
    setMainPointX(draftInput.pointX);
    setMainPointY(draftInput.pointY);
  }, []);

  const applyExplorationMainCommandRequestModel = useCallback(
    (requestModel: ExplorationMainCommandRequestModel) => {
      setSelectedMainTargetId(requestModel.target?.id ?? '');
      setSelectedMainItemId(requestModel.item?.id ?? '');
      setMainPointX(requestModel.pointX);
      setMainPointY(requestModel.pointY);
    },
    [],
  );

  const applyExplorationMapSelection = useCallback((selection: BattleMapSelection | null) => {
    setSelectedExplorationMapSelection(selection);
    setSelectedMainTargetId(
      selection?.kind === 'token' && selection.token.npcId ? selection.token.npcId : '',
    );
    setMainPointX(selection ? String(Math.round(selection.point.x)) : '');
    setMainPointY(selection ? String(Math.round(selection.point.y)) : '');
  }, []);

  const selectExplorationInventoryItem = useCallback((item: { id: string } | null) => {
    setSelectedMainItemId((current) => (item && current !== item.id ? item.id : ''));
  }, []);

  return {
    selectedMainTargetId,
    setSelectedMainTargetId,
    selectedMainItemId,
    setSelectedMainItemId,
    selectedMainSpellId,
    setSelectedMainSpellId,
    selectedMainRelatedIntent: selectedMainRelatedIntent as SubmitMainCommandDto['intent'] | '',
    setSelectedMainRelatedIntent,
    mainPointX,
    setMainPointX,
    mainPointY,
    setMainPointY,
    selectedExplorationMapSelection,
    setSelectedExplorationMapSelection,
    clearMainCommandSelectionFields,
    resetMainCommandFieldsForContext,
    applyMainCommandDraftInput,
    applyExplorationMainCommandRequestModel,
    applyExplorationMapSelection,
    selectExplorationInventoryItem,
  };
}

export function useMainCommandTargetReconciliation(params: {
  selectedMainTargetId: string;
  setSelectedMainTargetId: (targetId: string) => void;
  visibleTargetOptions: { id: string }[];
}) {
  const { selectedMainTargetId, setSelectedMainTargetId, visibleTargetOptions } = params;

  useEffect(() => {
    if (
      selectedMainTargetId &&
      !visibleTargetOptions.some((target) => target.id === selectedMainTargetId)
    ) {
      setSelectedMainTargetId('');
    }
  }, [selectedMainTargetId, setSelectedMainTargetId, visibleTargetOptions]);
}
