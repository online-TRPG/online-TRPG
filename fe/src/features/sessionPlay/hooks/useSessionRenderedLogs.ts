import { useMemo } from 'react';
import type { Character, LogEntry, Participant } from '../../../types/session';
import {
  buildRenderedSessionLogRows,
  isChatScoped,
  type MainCommandVisibleTargetLike,
  type RenderedSessionLogRow,
  type VttMapTokenLike,
} from '../utils/sessionLogPresentation';
import type { SessionTab } from './useSessionTabs';

type UseSessionRenderedLogsParams = {
  activeTab: SessionTab;
  logs: LogEntry[];
  userDisplayName: string;
  participants: Participant[];
  sessionCharacters: Character[];
  visibleTargets: MainCommandVisibleTargetLike[];
  mapTokens: VttMapTokenLike[];
};

export function useSessionRenderedLogs(
  params: UseSessionRenderedLogsParams,
): RenderedSessionLogRow[] {
  const {
    activeTab,
    logs,
    userDisplayName,
    participants,
    sessionCharacters,
    visibleTargets,
    mapTokens,
  } = params;

  const scopedLogs = useMemo(() => {
    if (activeTab === 'Chat') {
      return logs.filter((log) => log.kind === 'action' && isChatScoped(log.message));
    }

    if (activeTab === 'Main') {
      return logs.filter((log) => log.kind === 'action' && !isChatScoped(log.message));
    }

    return [];
  }, [activeTab, logs]);

  return useMemo(
    () =>
      buildRenderedSessionLogRows({
        logs: scopedLogs,
        activeTab,
        userDisplayName,
        participants,
        sessionCharacters,
        visibleTargets,
        mapTokens,
      }),
    [
      activeTab,
      mapTokens,
      participants,
      scopedLogs,
      sessionCharacters,
      userDisplayName,
      visibleTargets,
    ],
  );
}
