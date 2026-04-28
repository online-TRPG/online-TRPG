import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  createCharacter as apiCreateCharacter,
  createSession as apiCreateSession,
  getSession,
  joinSession as apiJoinSession,
  joinSessionById as apiJoinSessionById,
  leaveSession as apiLeaveSession,
  listMyCharacters as apiListMyCharacters,
  listSessions,
  selectSessionCharacter as apiSelectSessionCharacter,
  startSession as apiStartSession,
  updateReadyState as apiUpdateReadyState,
} from "../services/api";
import { connectSessionSocket } from "../services/realtime";
import { clearStoredSnapshot, loadStoredSnapshot, saveStoredSnapshot } from "../services/storage";
import type {
  AvailableSessionListItem,
  Character,
  LogEntry,
  Participant,
  PersistentCharacter,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

export interface CharacterPayload {
  name: string;
  ancestry: string;
  className: string;
  level?: number;
  abilities?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  proficiencyBonus?: number;
  proficientSkills?: string[];
  maxHp?: number;
  armorClass?: number;
  speed?: number;
  inventory?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  assignToSession?: boolean;
}

export interface UseSessionReturn {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  myCharacters: PersistentCharacter[];
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  createSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) => Promise<void>;
  joinSession: (inviteCode: string) => Promise<void>;
  joinSessionById: (sessionId: string) => Promise<void>;
  createCharacter: (payload: CharacterPayload) => Promise<void>;
  selectCharacter: (characterId: string) => Promise<void>;
  setReadyState: (isReady: boolean) => Promise<void>;
  startSession: () => Promise<void>;
  leaveSession: () => Promise<void>;
  refreshSessionList: () => Promise<void>;
  refreshMyCharacters: () => Promise<void>;
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
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
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
      setMyCharacters([]);
      return;
    }

    void listSessions(user, accessToken)
      .then((result) => setSessionList(result.content))
      .catch(() => undefined);

    void apiListMyCharacters(user, accessToken)
      .then(setMyCharacters)
      .catch(() => undefined);
  }, [accessToken, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return undefined;

    const socket: Socket = connectSessionSocket(user, snapshot.session.id, {
      onSnapshot: updateSnapshot,
      onParticipantUpdated: (participant: Participant) => {
        setSnapshot((current) => {
          if (!current) return current;

          const participants = current.participants.some((item) => item.id === participant.id)
            ? current.participants.map((item) => (item.id === participant.id ? participant : item))
            : [...current.participants, participant];

          const next = { ...current, participants };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onCharacterUpdated: (character: Character) => {
        setSnapshot((current) => {
          if (!current) return current;

          const characters = current.characters.some((item) => item.id === character.id)
            ? current.characters.map((item) => (item.id === character.id ? character : item))
            : [...current.characters, character];

          const next = { ...current, characters, sessionCharacters: characters };
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
  }, [appendLog, snapshot?.session.id, updateSnapshot, user]);

  async function refreshSessionList() {
    if (!user) return;

    try {
      const result = await listSessions(user, accessToken);
      setSessionList(result.content);
    } catch {
      // ignore
    }
  }

  async function refreshMyCharacters() {
    if (!user) return;

    try {
      const next = await apiListMyCharacters(user, accessToken);
      setMyCharacters(next);
    } catch {
      // ignore
    }
  }

  async function syncSession(sessionId: string) {
    if (!user) return;
    updateSnapshot(await getSession(user, sessionId, accessToken));
  }

  async function createSession(
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const next = await apiCreateSession(user, title, options, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 생성", `${next.session.title} 세션을 생성했습니다.`);
      await refreshSessionList();
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
      appendLog("rest", "세션 입장", `${next.session.title} 세션에 입장했습니다.`);
      await refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 입장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function joinSessionById(sessionId: string) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const next = await apiJoinSessionById(user, sessionId, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 합류", `${next.session.title} 세션에 합류했습니다.`);
      await refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 합류에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createCharacter(payload: CharacterPayload) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const shouldAssignToSession = payload.assignToSession !== false && Boolean(snapshot);
      const next = await apiCreateCharacter(
        user,
        {
          ...payload,
          sessionId: shouldAssignToSession ? snapshot?.session.id : undefined,
        },
        accessToken,
      );

      if (next) {
        updateSnapshot(next);
      }

      await refreshMyCharacters();
      appendLog("rest", "캐릭터 생성", `${payload.name} 캐릭터를 생성했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function selectCharacter(characterId: string) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      await apiSelectSessionCharacter(user, snapshot.session.id, characterId, accessToken);
      await syncSession(snapshot.session.id);
      const selected = myCharacters.find((character) => character.id === characterId);
      appendLog("rest", "캐릭터 선택", `${selected?.name ?? "캐릭터"}를 선택했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 선택에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function setReadyState(isReady: boolean) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      await apiUpdateReadyState(user, snapshot.session.id, isReady, accessToken);
      await syncSession(snapshot.session.id);
      appendLog("rest", isReady ? "준비 완료" : "준비 해제", isReady ? "준비를 완료했습니다." : "준비를 해제했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "준비 상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      const next = await apiStartSession(user, snapshot.session.id, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 시작", `${next.session.title} 세션을 시작했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 시작에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveSession() {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      const leavingSessionId = snapshot.session.id;
      const leavingSessionTitle = snapshot.session.title;
      await apiLeaveSession(user, leavingSessionId, accessToken);
      clearStoredSnapshot();
      setSnapshot(null);
      setSocketConnected(false);
      appendLog("rest", "세션 나가기", `${leavingSessionTitle} 세션에서 나갔습니다.`);
      await refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 나가기에 실패했습니다.");
    } finally {
      setBusy(false);
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
    myCharacters,
    socketConnected,
    busy,
    error,
    createSession,
    joinSession,
    joinSessionById,
    createCharacter,
    selectCharacter,
    setReadyState,
    startSession,
    leaveSession,
    refreshSessionList,
    refreshMyCharacters,
    clearSnapshot,
    clearError: () => setError(null),
  };
}
