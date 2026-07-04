import { useEffect, useRef } from 'react';
import type { SessionTab } from './useSessionTabs';

type UseSessionLogAutoScrollParams = {
  activeTab: SessionTab;
  renderedLogRows: { id: string }[];
};

export function useSessionLogAutoScroll(params: UseSessionLogAutoScrollParams) {
  const { activeTab, renderedLogRows } = params;
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const latestRenderedLogId = renderedLogRows[renderedLogRows.length - 1]?.id ?? null;

  useEffect(() => {
    if (!latestRenderedLogId) return;

    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [activeTab, latestRenderedLogId]);

  return {
    logEndRef,
  };
}
