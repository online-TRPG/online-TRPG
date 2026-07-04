import { useEffect, useRef, useState } from 'react';
import type { PlayerScenarioClueDto } from '@trpg/shared-types';
import type { LogEntry } from '../../../types/session';
import {
  getMessageLogTab,
  type MessageLogTab,
} from '../utils/sessionLogPresentation';

type SessionPlayTab = 'Main' | 'Chat' | 'Info' | 'Settings';

type UsePlayUnreadNotificationsParams = {
  activeTab: SessionPlayTab;
  logs: LogEntry[];
  sessionId: string | null;
  currentNodeId: string | null;
  publicClues: PlayerScenarioClueDto[];
  publicClueIdSignature: string;
};

export function usePlayUnreadNotifications(params: UsePlayUnreadNotificationsParams) {
  const {
    activeTab,
    logs,
    sessionId,
    currentNodeId,
    publicClues,
    publicClueIdSignature,
  } = params;
  const [hasUnreadInfo, setHasUnreadInfo] = useState(false);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<MessageLogTab, number>>({
    Main: 0,
    Chat: 0,
  });
  const [revealedClueToast, setRevealedClueToast] = useState<PlayerScenarioClueDto | null>(null);
  const knownPublicClueIdsRef = useRef<Set<string>>(new Set());
  const knownPublicClueNodeIdRef = useRef<string | null>(null);
  const knownMessageLogIdsRef = useRef<Set<string>>(new Set());
  const knownMessageLogSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentNodeId) {
      knownPublicClueIdsRef.current = new Set();
      knownPublicClueNodeIdRef.current = null;
      setHasUnreadInfo(false);
      setRevealedClueToast(null);
      return;
    }

    const nextIds = new Set(publicClues.map((clue) => clue.id));
    const isSameNode = knownPublicClueNodeIdRef.current === currentNodeId;

    if (!isSameNode) {
      knownPublicClueIdsRef.current = nextIds;
      knownPublicClueNodeIdRef.current = currentNodeId;
      setHasUnreadInfo(false);
      setRevealedClueToast(null);
      return;
    }

    const hasNewClue = [...nextIds].some(
      (clueId) => !knownPublicClueIdsRef.current.has(clueId),
    );

    if (hasNewClue) {
      const revealedClue = publicClues.find(
        (clue) => !knownPublicClueIdsRef.current.has(clue.id),
      );
      if (revealedClue) {
        setRevealedClueToast(revealedClue);
      }
      if (activeTab !== 'Info') {
        setHasUnreadInfo(true);
      }
    }
    if (activeTab === 'Info') {
      setHasUnreadInfo(false);
    }

    knownPublicClueIdsRef.current = nextIds;
    knownPublicClueNodeIdRef.current = currentNodeId;
  }, [activeTab, currentNodeId, publicClueIdSignature, publicClues]);

  useEffect(() => {
    if (knownMessageLogSessionIdRef.current !== sessionId) {
      knownMessageLogSessionIdRef.current = sessionId;
      knownMessageLogIdsRef.current = new Set(logs.map((log) => log.id));
      setUnreadMessageCounts({ Main: 0, Chat: 0 });
      return;
    }

    const knownIds = knownMessageLogIdsRef.current;
    const firstKnownLogIndex = logs.findIndex((log) => knownIds.has(log.id));
    const newlyPrependedLogs =
      firstKnownLogIndex === -1 ? logs : logs.slice(0, firstKnownLogIndex);
    let mainIncrement = 0;
    let chatIncrement = 0;

    newlyPrependedLogs.forEach((log) => {
      if (knownIds.has(log.id)) return;

      const targetTab = getMessageLogTab(log);
      if (!targetTab || targetTab === activeTab) return;

      if (targetTab === 'Main') {
        mainIncrement += 1;
      } else {
        chatIncrement += 1;
      }
    });

    knownMessageLogIdsRef.current = new Set(logs.map((log) => log.id));

    if (!mainIncrement && !chatIncrement) return;

    setUnreadMessageCounts((current) => ({
      Main: current.Main + mainIncrement,
      Chat: current.Chat + chatIncrement,
    }));
  }, [activeTab, logs, sessionId]);

  useEffect(() => {
    if (activeTab !== 'Main' && activeTab !== 'Chat') return;

    setUnreadMessageCounts((current) =>
      current[activeTab] === 0 ? current : { ...current, [activeTab]: 0 },
    );
  }, [activeTab]);

  useEffect(() => {
    if (!revealedClueToast) return undefined;
    const timer = window.setTimeout(() => {
      setRevealedClueToast(null);
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [revealedClueToast]);

  return {
    hasUnreadInfo,
    unreadMessageCounts,
    revealedClueToast,
    revealedClueToastTitle: '새 단서 발견',
  };
}
