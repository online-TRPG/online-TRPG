import type { KeyboardEventHandler, ReactNode, Ref } from 'react';
import { Icon } from '../Icon';

interface BattleMapStageFrameProps {
  containerRef: Ref<HTMLDivElement>;
  isPanMode: boolean;
  showSessionViewControls: boolean;
  onTogglePan: () => void;
  keyboardMoveEnabled?: boolean;
  keyboardMoveStatus?: string | null;
  keyboardMoveLabel?: string;
  onKeyboardMoveKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onKeyboardFocusChange?: (focused: boolean) => void;
  children: ReactNode;
}

export function BattleMapStageFrame({
  containerRef,
  isPanMode,
  showSessionViewControls,
  onTogglePan,
  keyboardMoveEnabled = false,
  keyboardMoveStatus = null,
  keyboardMoveLabel,
  onKeyboardMoveKeyDown,
  onKeyboardFocusChange,
  children,
}: BattleMapStageFrameProps) {
  return (
    <div
      className={`vtt-stage-wrap${isPanMode ? ' pan-active' : ''}${
        keyboardMoveEnabled ? ' keyboard-move-enabled' : ''
      }`}
      ref={containerRef}
      tabIndex={keyboardMoveEnabled ? 0 : undefined}
      aria-label={keyboardMoveEnabled ? keyboardMoveLabel : undefined}
      onKeyDown={onKeyboardMoveKeyDown}
      onFocus={() => onKeyboardFocusChange?.(true)}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          onKeyboardFocusChange?.(false);
        }
      }}
      onPointerDown={(event) => {
        if (!keyboardMoveEnabled) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('button, input, select, textarea, a, [contenteditable="true"]')
        ) {
          return;
        }
        event.currentTarget.focus({ preventScroll: true });
      }}
    >
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
      {keyboardMoveStatus ? (
        <div className="vtt-keyboard-move-status" role="status" aria-live="polite">
          {keyboardMoveStatus}
        </div>
      ) : null}
      {children}
    </div>
  );
}
