import { useCallback, useMemo, useState } from 'react';
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

type LogWindowPosition = {
  tab: SessionTab;
  anchorId: string | null;
};

export type SessionRenderedLogWindow = {
  rows: RenderedSessionLogRow[];
  hasEarlierLoadedRows: boolean;
  hasLaterLoadedRows: boolean;
  isAtLatest: boolean;
  showEarlierLoadedRows: () => void;
  showLaterLoadedRows: () => void;
  showLatestRows: () => void;
};

const LOG_RENDER_WINDOW_SIZE = 200;
const LOG_RENDER_WINDOW_STEP = 100;

export function useSessionRenderedLogs(
  params: UseSessionRenderedLogsParams,
): SessionRenderedLogWindow {
  const {
    activeTab,
    logs,
    userDisplayName,
    participants,
    sessionCharacters,
    visibleTargets,
    mapTokens,
  } = params;
  const [windowPosition, setWindowPosition] = useState<LogWindowPosition>({
    tab: activeTab,
    anchorId: null,
  });

  const scopedLogs = useMemo(() => {
    if (activeTab === 'Chat') {
      return logs.filter((log) => log.kind === 'action' && isChatScoped(log.message));
    }

    if (activeTab === 'Main') {
      return logs.filter((log) => log.kind === 'action' && !isChatScoped(log.message));
    }

    return [];
  }, [activeTab, logs]);

  const maxWindowOffset = Math.max(0, scopedLogs.length - LOG_RENDER_WINDOW_SIZE);
  const requestedAnchorId = windowPosition.tab === activeTab ? windowPosition.anchorId : null;
  const requestedOffset = requestedAnchorId
    ? scopedLogs.findIndex((log) => log.id === requestedAnchorId)
    : 0;
  const windowOffset = Math.min(
    requestedOffset >= 0 ? requestedOffset : 0,
    maxWindowOffset,
  );
  const windowedLogs = useMemo(
    () => scopedLogs.slice(windowOffset, windowOffset + LOG_RENDER_WINDOW_SIZE),
    [scopedLogs, windowOffset],
  );

  const setWindowOffset = useCallback(
    (nextOffset: number) => {
      const boundedOffset = Math.max(0, Math.min(nextOffset, maxWindowOffset));
      setWindowPosition({
        tab: activeTab,
        anchorId: boundedOffset === 0 ? null : (scopedLogs[boundedOffset]?.id ?? null),
      });
    },
    [activeTab, maxWindowOffset, scopedLogs],
  );

  const showEarlierLoadedRows = useCallback(() => {
    setWindowOffset(windowOffset + LOG_RENDER_WINDOW_STEP);
  }, [setWindowOffset, windowOffset]);

  const showLaterLoadedRows = useCallback(() => {
    setWindowOffset(windowOffset - LOG_RENDER_WINDOW_STEP);
  }, [setWindowOffset, windowOffset]);

  const showLatestRows = useCallback(() => {
    setWindowOffset(0);
  }, [setWindowOffset]);

  const rows = useMemo(
    () =>
      buildRenderedSessionLogRows({
        logs: windowedLogs,
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
      sessionCharacters,
      userDisplayName,
      visibleTargets,
      windowedLogs,
    ],
  );

  return {
    rows,
    hasEarlierLoadedRows: windowOffset + LOG_RENDER_WINDOW_SIZE < scopedLogs.length,
    hasLaterLoadedRows: windowOffset > 0,
    isAtLatest: windowOffset === 0,
    showEarlierLoadedRows,
    showLaterLoadedRows,
    showLatestRows,
  };
}
