import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionInputType,
  ActionScope,
  DiceRollResponseDto,
  StateDiffResponseDto,
  SubmitActionDto,
  TurnLogResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import type { Socket } from "socket.io-client";
import {
  cloneCharacter as apiCloneCharacter,
  createCharacter as apiCreateCharacter,
  createSession as apiCreateSession,
  deleteCharacter as apiDeleteCharacter,
  getSession,
  joinSession as apiJoinSession,
  joinSessionById as apiJoinSessionById,
  leaveSession as apiLeaveSession,
  listTurnLogs as apiListTurnLogs,
  listMyCharacters as apiListMyCharacters,
  listMySessions as apiListMySessions,
  listSessions,
  selectSessionCharacter as apiSelectSessionCharacter,
  startSession as apiStartSession,
  submitAction as apiSubmitAction,
  updateCharacter as apiUpdateCharacter,
  updateReadyState as apiUpdateReadyState,
} from "../services/api";
import { connectSessionSocket, sendRealtimeChatMessage } from "../services/realtime";
import { clearStoredSnapshot, loadStoredSnapshot, saveStoredSnapshot } from "../services/storage";
import type {
  AvailableSessionListItem,
  Character,
  ChatMessage,
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
  avatarType?: "DEFAULT" | "PRESET" | "UPLOAD";
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
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
  mySessionList: AvailableSessionListItem[];
  myCharacters: PersistentCharacter[];
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  createSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) => Promise<SessionSnapshot | null>;
  joinSession: (inviteCode: string) => Promise<SessionSnapshot | null>;
  joinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  createCharacter: (payload: CharacterPayload) => Promise<void>;
  cloneCharacter: (characterId: string) => Promise<void>;
  updateCharacter: (characterId: string, payload: CharacterPayload) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  selectCharacter: (characterId: string | null) => Promise<void>;
  setReadyState: (isReady: boolean) => Promise<void>;
  startSession: () => Promise<void>;
  leaveSession: () => Promise<void>;
  sendAction: (rawText: string) => Promise<void>;
  sendChatMessage: (content: string) => Promise<void>;
  refreshSessionList: () => Promise<void>;
  refreshMyCharacters: () => Promise<void>;
  clearSnapshot: () => void;
  clearError: () => void;
}

function readNumberField(
  source: Record<string, unknown> | null | undefined,
  field: string,
): number | null {
  const value = source?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatOutcome(outcome: TurnLogResponseDto["outcome"]): string | null {
  if (outcome === "NO_ROLL") return null;
  if (outcome === "SUCCESS") return "성공";
  if (outcome === "FAILURE") return "실패";
  if (outcome === "IMPOSSIBLE") return "불가능";
  return outcome;
}

function formatTurnLogMessage(turnLog: TurnLogResponseDto): string {
  const lines = [
    turnLog.narration?.trim() || turnLog.rawInput?.trim() || "행동 결과가 기록되었습니다.",
  ];
  const diceTotal = readNumberField(turnLog.diceResult, "total");
  const outcome = formatOutcome(turnLog.outcome);

  if (diceTotal !== null) {
    lines.push(`주사위 결과: ${diceTotal}`);
  }

  if (outcome) {
    lines.push(`판정: ${outcome}`);
  }

  // PlayPage는 [MAIN] prefix가 붙은 action 로그만 Main 탭에 보여준다.
  return `[MAIN]${lines.join("\n")}`;
}

function formatDiceRollMessage(diceResult: DiceRollResponseDto): string {
  const parts = [
    `${diceResult.expression} = ${diceResult.total}`,
    diceResult.rolls.length ? `굴림: ${diceResult.rolls.join(", ")}` : null,
    diceResult.modifier ? `수정치: ${diceResult.modifier}` : null,
  ];

  return parts.filter((part): part is string => Boolean(part)).join(" / ");
}

function formatStateDiffMessage(stateDiff: StateDiffResponseDto): string {
  return `상태 버전 ${stateDiff.baseVersion} -> ${stateDiff.nextVersion} (${stateDiff.reason})`;
}

export function useSession(
  user: StoredUser | null,
  accessToken: string | null,
  appendLog: (kind: LogEntry["kind"], title: string, message: string) => void,
): UseSessionReturn {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [sessionList, setSessionList] = useState<AvailableSessionListItem[]>([]);
  const [mySessionList, setMySessionList] = useState<AvailableSessionListItem[]>([]);
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const seenTurnLogIdsRef = useRef<Set<string>>(new Set());
  const loadedTurnLogSessionIdRef = useRef<string | null>(null);

  const updateSnapshot = useCallback((next: SessionSnapshot) => {
    setSnapshot(next);
    saveStoredSnapshot(next);
  }, []);

  const hasRecruitingSession = useCallback(() => snapshot?.session.status === "recruiting", [snapshot]);
  const hasBlockingSession = useCallback(
    () =>
      Boolean(
        snapshot &&
          snapshot.session.status !== "completed" &&
          snapshot.session.status !== "disbanded",
      ),
    [snapshot],
  );

  useEffect(() => {
    if (!user) {
      // 로그아웃/토큰 만료 직후 이전 사용자의 세션 화면이 남지 않도록 메모리 상태까지 함께 비운다.
      setSnapshot(null);
      clearStoredSnapshot();
      setSessionList([]);
      setMySessionList([]);
      setMyCharacters([]);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      return;
    }

    void listSessions(user, accessToken)
      .then((result) => setSessionList(result.content))
      .catch(() => undefined);

    void apiListMySessions(user, accessToken)
      .then((result) => setMySessionList(result.content))
      .catch(() => undefined);

    void apiListMyCharacters(user, accessToken)
      .then(setMyCharacters)
      .catch(() => undefined);
  }, [accessToken, user]);

  const appendServerTurnLog = useCallback(
    (turnLog: TurnLogResponseDto) => {
      if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
        return;
      }

      seenTurnLogIdsRef.current.add(turnLog.turnLogId);
      appendLog("action", "세션 로그", formatTurnLogMessage(turnLog));
    },
    [appendLog],
  );

  const loadRecentTurnLogs = useCallback(
    async (sessionId: string) => {
      if (!user) return;

      try {
        const result = await apiListTurnLogs(
          user,
          sessionId,
          {
            size: 20,
            includeDiceResult: true,
            includeStateDiff: false,
          },
          accessToken,
        );

        // 서버는 최신순으로 내려주고, 화면 로그 저장소는 앞에 추가하는 구조라 오래된 것부터 넣어 순서를 맞춘다.
        result.turnLogs.slice().reverse().forEach(appendServerTurnLog);
      } catch {
        // 게임룸 진입 직후 로그 조회 실패는 입력 흐름 자체를 막을 정도의 오류는 아니므로 조용히 넘긴다.
      }
    },
    [accessToken, appendServerTurnLog, user],
  );

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;

    if (loadedTurnLogSessionIdRef.current !== snapshot.session.id) {
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = snapshot.session.id;
    }

    void loadRecentTurnLogs(snapshot.session.id);
  }, [loadRecentTurnLogs, snapshot?.session.id, user]);

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
      onChatMessage: (message: ChatMessage) => {
        // 기존 PlayPage는 [CHAT] prefix가 붙은 로그를 Chat 탭에 보여준다.
        // 화면 컴포넌트 충돌을 줄이기 위해 수신 메시지만 기존 로그 흐름에 얹는다.
        appendLog("action", message.senderDisplayName, `[CHAT]${message.content}`);
      },
      onTurnLogCreated: appendServerTurnLog,
      onDiceRolled: (diceResult: DiceRollResponseDto) => {
        // 주사위 결과는 TurnLog에도 포함되므로 Main 로그에 중복으로 넣지 않고, 실시간 이벤트 확인용 로그로만 남긴다.
        appendLog("socket", "주사위 결과", formatDiceRollMessage(diceResult));
      },
      onStateDiffApplied: (stateDiff: StateDiffResponseDto) => {
        // 실제 화면 상태 갱신은 전용 snapshot/도메인 이벤트가 책임지고, 여기서는 상태 변경 이벤트 수신 여부를 남긴다.
        appendLog("socket", "상태 변경", formatStateDiffMessage(stateDiff));
      },
      onVttMapUpdated: (map: VttMapStateDto) => {
        setSnapshot((current) => {
          if (!current) return current;

          const next = {
            ...current,
            state: {
              ...current.state,
              flags: {
                ...current.state.flags,
                vttMap: map,
              },
              state: {
                ...current.state.state,
                vttMap: map,
              },
            },
          };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onStatusChange: setSocketConnected,
      onLog: (title, message) => appendLog("socket", title, message),
    });
    socketRef.current = socket;

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.disconnect();
    };
  }, [appendLog, appendServerTurnLog, snapshot?.session.id, updateSnapshot, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;
    void refreshSessionList();
  }, [accessToken, snapshot?.session.id, snapshot?.session.status, user]);

  async function refreshSessionList() {
    if (!user) return;

    try {
      const [publicSessions, mySessions] = await Promise.all([
        listSessions(user, accessToken),
        apiListMySessions(user, accessToken),
      ]);
      setSessionList(publicSessions.content);
      setMySessionList(mySessions.content);
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
  ): Promise<SessionSnapshot | null> {
    if (!user) return null;
    if (hasBlockingSession()) {
      setError("모집 중인 세션에는 하나만 참가할 수 있습니다.");
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiCreateSession(user, title, options, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 생성", `${next.session.title} 세션을 생성했습니다.`);
      await refreshSessionList();
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 생성에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(inviteCode: string): Promise<SessionSnapshot | null> {
    if (!user) return null;
    if (hasBlockingSession()) {
      setError("모집 중인 세션에는 하나만 참가할 수 있습니다.");
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiJoinSession(user, inviteCode, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 입장", `${next.session.title} 세션에 입장했습니다.`);
      await refreshSessionList();
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 입장에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function joinSessionById(sessionId: string): Promise<SessionSnapshot | null> {
    if (!user) return null;
    const knownSession = mySessionList.find(
      (item) => item.sessionId === sessionId || item.sessionPublicId === sessionId,
    );
    if (!knownSession && hasBlockingSession()) {
      setError("모집 중인 세션에는 하나만 참가할 수 있습니다.");
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = knownSession
        ? await getSession(
            user,
            knownSession.sessionPublicId || knownSession.sessionId,
            accessToken,
          )
        : await apiJoinSessionById(user, sessionId, accessToken);
      updateSnapshot(next);
      appendLog("rest", "세션 입장", `${next.session.title} 세션에 입장했습니다.`);
      await refreshSessionList();
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 입장에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createCharacter(payload: CharacterPayload) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const shouldAssignToSession = payload.assignToSession === true && Boolean(snapshot);
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

  async function cloneCharacter(characterId: string) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const cloned = await apiCloneCharacter(user, characterId, accessToken);
      await refreshMyCharacters();
      appendLog("rest", "캐릭터 복제", `${cloned.name} 캐릭터를 복제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 복제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateCharacter(characterId: string, payload: CharacterPayload) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      await apiUpdateCharacter(
        user,
        characterId,
        {
          name: payload.name,
          ancestry: payload.ancestry,
          className: payload.className,
          avatarType: payload.avatarType,
          avatarPresetId: payload.avatarPresetId,
          avatarUrl: payload.avatarUrl,
          level: payload.level,
          abilities: payload.abilities,
          proficiencyBonus: payload.proficiencyBonus,
          proficientSkills: payload.proficientSkills,
          maxHp: payload.maxHp,
          armorClass: payload.armorClass,
          speed: payload.speed,
          inventory: payload.inventory,
        },
        accessToken,
      );

      await refreshMyCharacters();
      appendLog("rest", "캐릭터 수정", `${payload.name} 캐릭터를 수정했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 수정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCharacter(characterId: string) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      await apiDeleteCharacter(user, characterId, accessToken);
      await refreshMyCharacters();
      appendLog("rest", "캐릭터 삭제", "캐릭터를 삭제했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function selectCharacter(characterId: string | null) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      await apiSelectSessionCharacter(user, snapshot.session.id, characterId, accessToken);
      await syncSession(snapshot.session.id);
      const selected = myCharacters.find((character) => character.id === characterId);
      appendLog(
        "rest",
        characterId ? "캐릭터 선택" : "캐릭터 선택 해제",
        characterId ? `${selected?.name ?? "캐릭터"}를 선택했습니다.` : "캐릭터 선택을 해제했습니다.",
      );
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
      appendLog("rest", isReady ? "READY" : "READY 해제", isReady ? "READY 상태로 변경했습니다." : "READY를 해제했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "READY 상태 변경에 실패했습니다.");
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
      await refreshSessionList();
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
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      appendLog("rest", "세션 나가기", `${leavingSessionTitle} 세션에서 나갔습니다.`);
      await refreshSessionList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 나가기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function sendAction(rawText: string) {
    if (!user || !snapshot) return;

    const trimmed = rawText.trim();
    if (!trimmed) return;

    const myParticipant = snapshot.participants.find(
      (participant) => participant.userId === user.id,
    );
    const selectedCharacterId =
      myParticipant?.sessionCharacterId ?? myParticipant?.characterId ?? null;

    if (!selectedCharacterId) {
      const message = "행동을 입력하려면 먼저 캐릭터를 선택해야 합니다.";
      setError(message);
      appendLog("socket", "행동 전송 실패", message);
      return;
    }

    const payload: SubmitActionDto = {
      characterId: selectedCharacterId,
      rawText: trimmed,
      clientCreatedAt: new Date().toISOString(),
      // 전투가 아닐 때는 파티 공용 행동으로 보내야 현재 백엔드 검증 규칙을 통과한다.
      actionScope:
        snapshot.state.phase === "combat"
          ? ("INDIVIDUAL_TURN" as ActionScope)
          : ("PARTY_SHARED" as ActionScope),
      inputType: trimmed.startsWith("/")
        ? ("COMMAND" as ActionInputType)
        : ("TEXT" as ActionInputType),
    };

    setError(null);
    setBusy(true);

    try {
      await apiSubmitAction(user, snapshot.session.id, payload, accessToken);
      // 화면 표시는 서버가 저장 후 브로드캐스트하는 turn.log.created 이벤트만 믿는다.
      // 그래야 DB에 남은 기록과 사용자가 보는 로그가 같은 출처를 가진다.
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "행동 전송에 실패했습니다.";
      setError(message);
      appendLog("socket", "행동 전송 실패", message);
    } finally {
      setBusy(false);
    }
  }

  async function sendChatMessage(content: string) {
    if (!user || !snapshot) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    setError(null);

    if (trimmed.length > 1000) {
      const message = "채팅 메시지는 1000자 이하로 입력해주세요.";
      setError(message);
      appendLog("socket", "채팅 전송 실패", message);
      return;
    }

    const socket = socketRef.current;
    if (!socket?.connected) {
      const message = "실시간 채팅 연결 후 다시 시도해주세요.";
      setError(message);
      appendLog("socket", "채팅 전송 실패", message);
      return;
    }

    // 서버가 membership을 다시 확인한 뒤 같은 세션 room에 broadcast한다.
    // 그래서 낙관적 추가를 하지 않고, 서버가 돌려준 chat.message 이벤트만 화면에 표시한다.
    sendRealtimeChatMessage(socket, snapshot.session.id, trimmed);
  }

  function clearSnapshot() {
    clearStoredSnapshot();
    setSnapshot(null);
    setSocketConnected(false);
    seenTurnLogIdsRef.current.clear();
    loadedTurnLogSessionIdRef.current = null;
  }

  return {
    snapshot,
    sessionList,
    mySessionList,
    myCharacters,
    socketConnected,
    busy,
    error,
    createSession,
    joinSession,
    joinSessionById,
    createCharacter,
    cloneCharacter,
    updateCharacter,
    deleteCharacter,
    selectCharacter,
    setReadyState,
    startSession,
    leaveSession,
    sendAction,
    sendChatMessage,
    refreshSessionList,
    refreshMyCharacters,
    clearSnapshot,
    clearError: () => setError(null),
  };
}
