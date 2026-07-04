import { useMemo } from 'react';
import type { LogEntry, PlayerScenarioNode } from '../../../types/session';
import {
  buildHumanGmAssistPublicClueIdSignature,
  buildRecentHumanGmAssistLogSnippets,
} from '../utils/humanGmAssistModel';

const DEFAULT_SCENE_DESCRIPTION = '현재 장면 설명이 아직 준비되지 않았습니다.';

type UseCurrentNodeContextProjectionParams = {
  currentNode: PlayerScenarioNode | null;
  logs: LogEntry[];
};

export function useCurrentNodeContextProjection({
  currentNode,
  logs,
}: UseCurrentNodeContextProjectionParams) {
  const currentSceneDescriptionText =
    currentNode?.sceneText?.trim() || DEFAULT_SCENE_DESCRIPTION;
  const recentGmAiAssistLogs = useMemo(
    () => buildRecentHumanGmAssistLogSnippets(logs),
    [logs],
  );
  const currentPublicClueIdSignature = useMemo(
    () => buildHumanGmAssistPublicClueIdSignature(currentNode?.publicClues),
    [currentNode?.publicClues],
  );

  return {
    currentSceneDescriptionText,
    recentGmAiAssistLogs,
    currentPublicClueIdSignature,
  };
}
