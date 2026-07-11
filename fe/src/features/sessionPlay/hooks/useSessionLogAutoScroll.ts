import { useLayoutEffect, useRef } from 'react';
import type { SessionTab } from './useSessionTabs';

type UseSessionLogAutoScrollParams = {
  activeTab: SessionTab;
  renderedLogRows: { id: string }[];
  isAtLatest: boolean;
};

type PreviousScrollState = {
  activeTab: SessionTab;
  firstId: string | null;
  lastId: string | null;
  scrollHeight: number;
};

export function useSessionLogAutoScroll(params: UseSessionLogAutoScrollParams) {
  const { activeTab, renderedLogRows, isAtLatest } = params;
  const logStackRef = useRef<HTMLDivElement | null>(null);
  const previousRef = useRef<PreviousScrollState | null>(null);
  const firstRenderedLogId = renderedLogRows[0]?.id ?? null;
  const lastRenderedLogId = renderedLogRows[renderedLogRows.length - 1]?.id ?? null;

  useLayoutEffect(() => {
    const container = logStackRef.current;
    if (!container) return;

    const previous = previousRef.current;
    const tabChanged = previous?.activeTab !== activeTab;
    const latestRowChanged = previous?.lastId !== lastRenderedLogId;
    const olderRowsPrepended =
      previous?.lastId === lastRenderedLogId && previous?.firstId !== firstRenderedLogId;

    if (!previous || tabChanged || (isAtLatest && latestRowChanged)) {
      container.scrollTop = container.scrollHeight;
    } else if (olderRowsPrepended) {
      container.scrollTop += container.scrollHeight - previous.scrollHeight;
    }

    previousRef.current = {
      activeTab,
      firstId: firstRenderedLogId,
      lastId: lastRenderedLogId,
      scrollHeight: container.scrollHeight,
    };
  }, [activeTab, firstRenderedLogId, isAtLatest, lastRenderedLogId]);

  return {
    logStackRef,
  };
}
