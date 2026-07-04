import type { CSSProperties } from 'react';

type UseSessionLayoutPresentationParams = {
  sidebarWidth: number;
  isSidebarCollapsed: boolean;
  isRecruiting: boolean;
  usesNodeSpecificPartyStrip: boolean;
  tavernImage: string;
  emptySlotImage: string;
  corkboardNoPaperImage: string;
  paperPinnedImage: string;
  bigBoxImage: string;
  smallBoxImage: string;
};

export function useSessionLayoutPresentation({
  sidebarWidth,
  isSidebarCollapsed,
  isRecruiting,
  usesNodeSpecificPartyStrip,
  tavernImage,
  emptySlotImage,
  corkboardNoPaperImage,
  paperPinnedImage,
  bigBoxImage,
  smallBoxImage,
}: UseSessionLayoutPresentationParams) {
  const layoutStyle = {
    '--session-sidebar-width': `${sidebarWidth}px`,
    '--session-recruiting-bg': `url(${tavernImage})`,
    '--session-empty-slot-image': `url(${emptySlotImage})`,
    '--session-corkboard-image': `url(${corkboardNoPaperImage})`,
    '--session-wanted-paper-image': `url(${paperPinnedImage})`,
    '--session-stat-bigbox-image': `url(${bigBoxImage})`,
    '--session-stat-smallbox-image': `url(${smallBoxImage})`,
  } as CSSProperties;
  const layoutClassName = `session-prep-layout session-prep-layout-tight${
    isRecruiting ? ' recruiting-tavern' : ''
  }${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`;
  const stageClassName = `session-prep-stage${
    usesNodeSpecificPartyStrip ? ' node-surface-active' : ''
  }${isRecruiting ? ' recruiting-stage' : ''}`;
  const canvasClassName = `session-stage-canvas${
    !isRecruiting ? ' started' : ''
  }${isRecruiting ? ' recruiting-stage-canvas' : ''}`;
  const gameSurfaceFallbackTitle = '메인화면';
  const sidebarResizeAriaLabel = '우측 패널 크기 조절';
  const sidebarClassName = `session-sidebar${isSidebarCollapsed ? ' collapsed' : ''}`;
  const sidebarCollapseToggleLabel = isSidebarCollapsed ? '채팅창 열기' : '채팅창 접기';
  const participantStripClassName = `participant-strip participant-strip-four-up${
    isRecruiting ? ' recruiting-party-strip' : ''
  }`;

  return {
    layoutStyle,
    layoutClassName,
    stageClassName,
    canvasClassName,
    gameSurfaceFallbackTitle,
    sidebarResizeAriaLabel,
    sidebarClassName,
    sidebarCollapseToggleLabel,
    participantStripClassName,
  };
}
