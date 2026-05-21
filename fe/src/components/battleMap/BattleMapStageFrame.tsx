import type { ReactNode, RefObject } from 'react';
import { Icon } from '../Icon';

interface BattleMapStageFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isPanMode: boolean;
  showSessionViewControls: boolean;
  onTogglePan: () => void;
  children: ReactNode;
}

export function BattleMapStageFrame({
  containerRef,
  isPanMode,
  showSessionViewControls,
  onTogglePan,
  children,
}: BattleMapStageFrameProps) {
  return (
    <div className={`vtt-stage-wrap${isPanMode ? ' pan-active' : ''}`} ref={containerRef}>
      {showSessionViewControls ? (
        <div className="vtt-session-view-controls" aria-label="맵 화면 조작">
          <button
            type="button"
            className={isPanMode ? 'active' : ''}
            onClick={onTogglePan}
            aria-pressed={isPanMode}
            aria-label="맵 화면 이동"
            title={isPanMode ? '화면 이동 끄기' : '화면 이동 켜기'}
          >
            <Icon name="move" />
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
