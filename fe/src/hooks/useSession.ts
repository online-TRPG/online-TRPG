import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  createCharacter as apiCreateCharacter,
  createSession as apiCreateSession,
  joinSession as apiJoinSession,
  listSessions,
} from "../services/api";
import { connectSessionSocket } from "../services/realtime";
import {
  clearStoredSnapshot,
  loadStoredSnapshot,
  saveStoredSnapshot,
} from "../services/storage";
import type {
  AvailableSessionListItem,
  Character,
  LogEntry,
  Participant,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

export interface CharacterPayload {
  name: string;
  ancestry: string;
  className: string;
  maxHp?: number;
}

export interface UseSessionReturn {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  createSession: (title: string, scenarioId?: string) => Promise<void>;
  joinSession: (inviteCode: string) => Promise<void>;
  createCharacter: (payload: CharacterPayload) => Promise<void>;
  refreshSessionList: () => Promise<void>;
  clearSnapshot: () => void;
  clearError: () => void;
}

export function useSession(
  user: StoredUser | null,
  accessToken: string | null,
  appendLog: (kind: LogEntry["kind"], title: string, message: string) => void,
): UseSessionReturn {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [sessionList, setSessionList] = useState<AvailableSessionListItem[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSnapshot = useCallback((next: SessionSnapshot) => {
    setSnapshot(next);
    saveStoredSnapshot(next);
  }, []);

  useEffect(() => {
    if (!user) {
      setSessionList([]);
      return;
    }
    listSessions(user, accessToken)
      .then((result) => setSessionList(result.content))
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return undefined;

    const socket: Socket = connectSessionSocket(user, snapshot.session.id, {
      onSnapshot: updateSnapshot,
      onParticipantUpdated: (participant: Participant) => {
        setSnapshot((current) => {
          if (!current) return current;
          const participants = current.participants.some((p) => p.id === participant.id)
            ? current.participants.map((p) => (p.id === participant.id ? participant : p))
            : [...current.participants, participant];
          const next = { ...current, participants };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onCharacterUpdated: (character: Character) => {
        setSnapshot((current) => {
          if (!current) return current;
          const characters = current.characters.some((c) => c.id === character.id)
            ? current.characters.map((c) => (c.id === character.id ? character : c))
            : [...current.characters, character];
          const next = { ...current, characters };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onStatusChange: setSocketConnected,
      onLog: (title, message) => appendLog("socket", title, message),
    });

    return () => {
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, snapshot?.session.id]);

  async function createSession(title: string, scenarioId?: string) {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const next = await apiCreateSession(user, title, scenarioId, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 생성", `${next.session.title} 세션을 만들었습니다.`);
      void refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(inviteCode: string) {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const next = await apiJoinSession(user, inviteCode, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 참가", `${next.session.title} 세션에 참가했습니다.`);
      void refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 참가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createCharacter(payload: CharacterPayload) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);
    try {
      const next = await apiCreateCharacter(
        user,
        { ...payload, sessionId: snapshot.session.id },
        accessToken,
      );
      updateSnapshot(next);
      const character = next.characters.find((c) => c.ownerUserId === user.id && c.name === payload.name);
      appendLog("rest", "캐릭터 생성", `${character?.name ?? payload.name} 캐릭터를 만들었습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshSessionList() {
    if (!user) return;
    try {
      const result = await listSessions(user, accessToken);
      setSessionList(result.content);
    } catch {
      // 목록 실패는 무시
    }
  }

  function clearSnapshot() {
    clearStoredSnapshot();
    setSnapshot(null);
    setSocketConnected(false);
  }

  return {
    snapshot,
    sessionList,
    socketConnected,
    busy,
    error,
    createSession,
    joinSession,
    createCharacter,
    refreshSessionList,
    clearSnapshot,
    clearError: () => setError(null),
  };
}
