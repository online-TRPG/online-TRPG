import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { startSidebarResize } from '../utils/sidebarResize';

const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 360;
const MAX_SIDEBAR_WIDTH = 620;

export function useSessionSidebarLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handleSidebarResizePointerDown(event: ReactPointerEvent<HTMLElement>) {
    startSidebarResize({
      event,
      minWidth: MIN_SIDEBAR_WIDTH,
      maxWidth: MAX_SIDEBAR_WIDTH,
      setWidth: setSidebarWidth,
    });
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  return {
    sidebarWidth,
    isSidebarCollapsed,
    handleSidebarResizePointerDown,
    toggleSidebarCollapsed,
  };
}
