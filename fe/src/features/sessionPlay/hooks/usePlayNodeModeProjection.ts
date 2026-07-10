import { isEndedCombatStatus } from '@trpg/shared-types/frontend';
import type { CombatResponseDto } from '@trpg/shared-types';
import type { PlayerScenarioNode } from '../../../types/session';
import {
  MainCommandScreenTypeValues,
  getMainCommandScreenTypeFromNodeType,
} from '../utils/mainCommandModel';

type UsePlayNodeModeProjectionParams = {
  currentNode: PlayerScenarioNode | null;
  combat: CombatResponseDto | null;
  sessionId?: string | null;
  sessionExists: boolean;
  isRecruiting: boolean;
  completedCombatNodeIds: ReadonlySet<string>;
};

export function usePlayNodeModeProjection(params: UsePlayNodeModeProjectionParams) {
  const {
    currentNode,
    combat,
    sessionId,
    sessionExists,
    isRecruiting,
    completedCombatNodeIds,
  } = params;

  const isCompletedCombatNode = Boolean(
    currentNode?.nodeType === 'combat' &&
      currentNode.id &&
      (completedCombatNodeIds.has(currentNode.id) ||
        (combat?.sessionId === sessionId && isEndedCombatStatus(combat?.status))),
  );
  const currentScreenType = isCompletedCombatNode
    ? MainCommandScreenTypeValues.EXPLORATION
    : getMainCommandScreenTypeFromNodeType(currentNode?.nodeType);
  const isStoryNode = currentNode?.nodeType === 'story';
  const isExplorationNode = currentNode?.nodeType === 'exploration' || isCompletedCombatNode;
  const isCombatNode = currentNode?.nodeType === 'combat' && !isCompletedCombatNode;
  const usesNodeSpecificPartyStrip = Boolean(
    sessionExists && !isRecruiting && (isStoryNode || isExplorationNode || isCombatNode),
  );
  const isExplorationMainCommandContext =
    currentScreenType === MainCommandScreenTypeValues.EXPLORATION;

  return {
    completedCombatNodeIds,
    isCompletedCombatNode,
    currentScreenType,
    isStoryNode,
    isExplorationNode,
    isCombatNode,
    usesNodeSpecificPartyStrip,
    isExplorationMainCommandContext,
  };
}
