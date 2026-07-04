import { useEffect, useState } from 'react';

export const sessionTabs = ['Main', 'Chat', 'Info', 'Settings'] as const;
export type SessionTab = (typeof sessionTabs)[number];

const recruitingSessionTabs = sessionTabs;
const startedSessionTabs = sessionTabs;

type UseSessionTabsParams = {
  isRecruiting: boolean;
};

export function useSessionTabs(params: UseSessionTabsParams) {
  const { isRecruiting } = params;
  const [activeTab, setActiveTab] = useState<SessionTab>('Main');
  const availableTabs = isRecruiting ? recruitingSessionTabs : startedSessionTabs;

  useEffect(() => {
    if (availableTabs.some((tab) => tab === activeTab)) return;
    setActiveTab(availableTabs[0]);
  }, [activeTab, availableTabs]);

  return {
    activeTab,
    setActiveTab,
    availableTabs,
  };
}
