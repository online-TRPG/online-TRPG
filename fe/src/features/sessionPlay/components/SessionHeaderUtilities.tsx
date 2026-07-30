import type { ReactNode } from 'react';
import './SessionHeaderUtilities.css';

export type SessionUtilityPanelId = 'economy' | 'calendar';

interface SessionHeaderUtilitiesProps {
  showEconomy: boolean;
  showCalendar: boolean;
  activePanel: SessionUtilityPanelId | null;
  onTogglePanel: (panel: SessionUtilityPanelId) => void;
  panel?: ReactNode;
}

export function SessionHeaderUtilities({
  showEconomy,
  showCalendar,
  activePanel,
  onTogglePanel,
  panel,
}: SessionHeaderUtilitiesProps) {
  if (!showEconomy && !showCalendar) {
    return null;
  }

  return (
    <div className="session-header-utilities">
      <div className="session-header-utility-controls" role="group" aria-label="세션 도구">
        {showEconomy ? (
          <button
            type="button"
            className={activePanel === 'economy' ? 'active' : undefined}
            aria-expanded={activePanel === 'economy'}
            aria-controls="session-economy-panel"
            onClick={() => onTogglePanel('economy')}
          >
            경제
          </button>
        ) : null}
        {showCalendar ? (
          <button
            type="button"
            className={activePanel === 'calendar' ? 'active' : undefined}
            aria-expanded={activePanel === 'calendar'}
            aria-controls="session-campaign-calendar-panel"
            onClick={() => onTogglePanel('calendar')}
          >
            일정
          </button>
        ) : null}
      </div>
      {panel}
    </div>
  );
}
