import { useMemo } from 'react';
import {
  formatUnreadCount,
  sessionTabDescriptions,
} from '../utils/playPagePresentation';
import type { SessionTab } from './useSessionTabs';

const sessionTabLabels: Record<SessionTab, string> = {
  Main: '메인',
  Chat: '채팅',
  Info: '정보',
  Settings: '설정',
};

type UseSessionTabPresentationParams = {
  activeTab: SessionTab;
  availableTabs: readonly SessionTab[];
  hasUnreadInfo: boolean;
  unreadMessageCounts: Partial<Record<SessionTab, number>>;
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
};

export function useSessionTabPresentation({
  activeTab,
  availableTabs,
  hasUnreadInfo,
  unreadMessageCounts,
  hasOlderTurnLogs,
  isLoadingTurnLogs,
}: UseSessionTabPresentationParams) {
  return useMemo(() => {
    const tabItems = availableTabs.map((tab) => {
      const unreadMessageCount =
        tab === 'Main' || tab === 'Chat' ? unreadMessageCounts[tab] ?? 0 : 0;
      const hasUnreadMessages = unreadMessageCount > 0;
      const hasInfoBadge = tab === 'Info' && hasUnreadInfo;

      return {
        tab,
        label: sessionTabLabels[tab],
        className: [
          activeTab === tab ? 'active' : '',
          hasInfoBadge ? 'has-unread-info' : '',
          hasUnreadMessages ? 'has-unread-messages' : '',
        ]
          .filter((className) => className.length > 0)
          .join(' '),
        ariaLabel: hasUnreadMessages
          ? `${sessionTabLabels[tab]} 새 메시지 ${unreadMessageCount}개`
          : sessionTabLabels[tab],
        shouldShowInfoBadge: hasInfoBadge,
        unreadCountText: hasUnreadMessages
          ? formatUnreadCount(unreadMessageCount)
          : null,
      };
    });

    return {
      tabItems,
      sidebarDescriptionClassName: `session-sidebar-description${
        activeTab === 'Main' && hasOlderTurnLogs ? ' has-history-button' : ''
      }`,
      historyButtonDisabled: isLoadingTurnLogs,
      historyButtonLabel: isLoadingTurnLogs ? '불러오는 중...' : '이전 로그 보기',
      activeTabDescription: sessionTabDescriptions[activeTab].description,
    };
  }, [
    activeTab,
    availableTabs,
    hasOlderTurnLogs,
    hasUnreadInfo,
    isLoadingTurnLogs,
    unreadMessageCounts,
  ]);
}
