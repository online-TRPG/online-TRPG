import { useMemo } from 'react';
import type { BattleMapSelection } from '../components/SessionBattleMap';
import type { InventoryItemDto } from '@trpg/shared-types';
import {
  getSelectedExplorationItemLabel,
  getSelectedExplorationMapLabel,
} from '../utils/playPagePresentation';

type VisibleTargetLike = {
  id: string;
  name?: string | null;
  label?: string | null;
};

type UseExplorationSelectionLabelsParams = {
  selectedMapSelection: BattleMapSelection | null;
  visibleTargets: VisibleTargetLike[];
  selectedItem: InventoryItemDto | null;
};

export function useExplorationSelectionLabels({
  selectedMapSelection,
  visibleTargets,
  selectedItem,
}: UseExplorationSelectionLabelsParams) {
  const selectedExplorationMapLabel = useMemo(
    () => getSelectedExplorationMapLabel(selectedMapSelection, visibleTargets),
    [selectedMapSelection, visibleTargets],
  );
  const selectedExplorationItemLabel = getSelectedExplorationItemLabel(selectedItem);

  return {
    selectedExplorationMapLabel,
    selectedExplorationItemLabel,
  };
}
