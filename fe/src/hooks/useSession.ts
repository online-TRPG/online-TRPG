import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionAcceptedEventDto,
  ActionInputType,
  ActionScope,
  DiceRollResponseDto,
  MainCommandResponseDto,
  StateDiffResponseDto,
  SubmitMainCommandDto,
  SystemMessageEventDto,
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
  submitMainCommand as apiSubmitMainCommand,
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
  scenarioId?: string | null;
  startingEquipmentSelection?: number[];
  startingSpells?: { cantrips: string[]; spells: string[] };
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
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
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
  sendMainCommand: (payload: SubmitMainCommandDto) => Promise<MainCommandResponseDto | null>;
  sendAction: (rawText: string) => Promise<void>;
  sendChatMessage: (content: string) => Promise<void>;
  loadOlderTurnLogs: () => Promise<void>;
  refreshSessionList: () => Promise<void>;
  refreshMyCharacters: () => Promise<void>;
  clearSnapshot: () => void;
  clearError: () => void;
}

type SessionListRefreshResult = {
  publicSessions: AvailableSessionListItem[];
  mySessions: AvailableSessionListItem[];
};

type AppendLogFn = (
  kind: LogEntry["kind"],
  title: string,
  message: string,
  id?: string,
  createdAt?: string,
) => void;

function isBlockingSessionStatus(status: string | undefined): boolean {
  return status !== "completed" && status !== "disbanded";
}

function formatDebugValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(없음)";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function formatTurnLogMessage(turnLog: TurnLogResponseDto): string {
  const structuredAction = turnLog.structuredAction;
  if (
    structuredAction &&
    typeof structuredAction === "object" &&
    structuredAction.type === "main_command"
  ) {
    const narration = turnLog.narration?.trim();
    return `[MAIN]${narration || "메인 명령을 처리했습니다."}`;
  }

  if (
    structuredAction &&
    typeof structuredAction === "object" &&
    structuredAction.type === "action_error"
  ) {
    return `[MAIN]${turnLog.narration?.trim() || "행동 처리에 실패했습니다."}`;
  }

  const sections = [
    "TurnLog",
    `- turnLogId: ${turnLog.turnLogId}`,
    `- turnNumber: ${turnLog.turnNumber}`,
    `- playerActionId: ${formatDebugValue(turnLog.playerActionId)}`,
    `- actorUserId: ${formatDebugValue(turnLog.actorUserId)}`,
    `- sessionCharacterId: ${formatDebugValue(turnLog.sessionCharacterId)}`,
    `- actionClientCreatedAt: ${formatDebugValue(turnLog.actionClientCreatedAt)}`,
    `- actionCreatedAt: ${formatDebugValue(turnLog.actionCreatedAt)}`,
    `- createdAt: ${turnLog.createdAt}`,
    "",
    "입력",
    `- rawInput: ${formatDebugValue(turnLog.rawInput)}`,
    "",
    "결과",
    `- outcome: ${turnLog.outcome}`,
    `- narration: ${formatDebugValue(turnLog.narration)}`,
    "",
    "structuredAction",
    formatDebugValue(turnLog.structuredAction),
    "",
    "diceResult",
    formatDebugValue(turnLog.diceResult),
    "",
    "stateDiff",
    formatDebugValue(turnLog.stateDiff),
  ];

  return `[MAIN]${sections.join("\n")}`;
}

function getSenderNameByUserId(
  userId: string,
  snapshot: SessionSnapshot | null,
): string {
  const participant = snapshot?.participants.find((item) => item.userId === userId);

  return participant?.user.displayName ?? "알 수 없음";
}

function getRawInputCreatedAt(turnLog: TurnLogResponseDto): string {
  return turnLog.actionClientCreatedAt ?? turnLog.actionCreatedAt ?? turnLog.createdAt;
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
  appendLog: AppendLogFn,
  appendOlderLog: AppendLogFn,
  removeLog: (id: string) => void,
): UseSessionReturn {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [sessionList, setSessionList] = useState<AvailableSessionListItem[]>([]);
  const [mySessionList, setMySessionList] = useState<AvailableSessionListItem[]>([]);
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [turnLogNextCursor, setTurnLogNextCursor] = useState<string | null>(null);
  const [isLoadingTurnLogs, setIsLoadingTurnLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mySessionsLoaded, setMySessionsLoaded] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = useRef<SessionSnapshot | null>(snapshot);
  const seenTurnLogIdsRef = useRef<Set<string>>(new Set());
  const loadedTurnLogSessionIdRef = useRef<string | null>(null);

  const updateSnapshot = useCallback((next: SessionSnapshot) => {
    setSnapshot(next);
    saveStoredSnapshot(next);
  }, []);

  const reconcileSnapshotWithLists = useCallback(
    (nextSnapshot: SessionSnapshot, lists: SessionListRefreshResult | null): SessionSnapshot => {
      if (!lists) return nextSnapshot;

      const matchedSession =
        lists.mySessions.find(
          (item) =>
            item.sessionId === nextSnapshot.session.id ||
            item.sessionPublicId === nextSnapshot.session.publicId,
        ) ??
        lists.publicSessions.find(
          (item) =>
            item.sessionId === nextSnapshot.session.id ||
            item.sessionPublicId === nextSnapshot.session.publicId,
        );

      if (!matchedSession) return nextSnapshot;

      return {
        ...nextSnapshot,
        session: {
          ...nextSnapshot.session,
          status: matchedSession.status as typeof nextSnapshot.session.status,
        },
      };
    },
    [],
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const hasBlockingSession = useCallback(
    () => mySessionList.some((item) => isBlockingSessionStatus(item.status)),
    [mySessionList],
  );

  useEffect(() => {
    if (!user) {
      // 로그아웃/토큰 만료 직후 이전 사용자의 세션 화면이 남지 않도록 메모리 상태까지 함께 비운다.
      setSnapshot(null);
      clearStoredSnapshot();
      setSessionList([]);
      setMySessionList([]);
      setMyCharacters([]);
      setMySessionsLoaded(false);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
      return;
    }

    void listSessions(user, accessToken)
      .then((result) => setSessionList(result.content))
      .catch(() => undefined);

    void apiListMySessions(user, accessToken)
      .then((result) => {
        setMySessionList(result.content);
        setMySessionsLoaded(true);
      })
      .catch(() => undefined);

    void apiListMyCharacters(user, accessToken)
      .then(setMyCharacters)
      .catch(() => undefined);
  }, [accessToken, user]);

  useEffect(() => {
    if (!user || !snapshot || !mySessionsLoaded) return;

    const matchedSession = mySessionList.find(
      (item) =>
        item.sessionId === snapshot.session.id ||
        item.sessionPublicId === snapshot.session.publicId,
    );

    if (
      matchedSession &&
      !isBlockingSessionStatus(matchedSession.status) &&
      isBlockingSessionStatus(snapshot.session.status)
    ) {
      clearStoredSnapshot();
      setSnapshot(null);
      setSocketConnected(false);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
    }
  }, [mySessionList, mySessionsLoaded, snapshot, user]);

  const appendPlayerRawInputLog = useCallback(
    (turnLog: TurnLogResponseDto, writeLog: AppendLogFn) => {
      const rawInput = turnLog.rawInput?.trim();
      if (!rawInput) {
        return;
      }

      // TurnLog는 DB에 남으므로, 새로고침/재접속 때도 같은 id로 사용자 원문 말풍선을 다시 만들 수 있습니다.
      const rawLogId = turnLog.playerActionId
        ? `player-action:${turnLog.playerActionId}:raw`
        : `turn-log:${turnLog.turnLogId}:raw`;
      const senderName = turnLog.actorUserId
        ? getSenderNameByUserId(turnLog.actorUserId, snapshotRef.current)
        : "알 수 없음";

      writeLog("action", senderName, `[MAIN]${rawInput}`, rawLogId, getRawInputCreatedAt(turnLog));
    },
    [],
  );

  const appendServerTurnLog = useCallback(
    (turnLog: TurnLogResponseDto) => {
      if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
        return;
      }

      appendPlayerRawInputLog(turnLog, appendLog);
      seenTurnLogIdsRef.current.add(turnLog.turnLogId);
      if (turnLog.playerActionId) {
        removeLog(`player-action:${turnLog.playerActionId}:pending`);
      }
      appendLog(
        "action",
        "세션 로그",
        formatTurnLogMessage(turnLog),
        `turn-log:${turnLog.turnLogId}`,
        turnLog.createdAt,
      );
    },
    [appendLog, appendPlayerRawInputLog, removeLog],
  );

  const appendHistoricalTurnLog = useCallback(
    (turnLog: TurnLogResponseDto) => {
      if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
        return;
      }

      seenTurnLogIdsRef.current.add(turnLog.turnLogId);
      if (turnLog.playerActionId) {
        removeLog(`player-action:${turnLog.playerActionId}:pending`);
      }

      // 과거 로그는 내부 배열의 뒤쪽에 넣어야 화면에서는 현재 로그보다 위에 보입니다.
      appendOlderLog(
        "action",
        "세션 로그",
        formatTurnLogMessage(turnLog),
        `turn-log:${turnLog.turnLogId}`,
        turnLog.createdAt,
      );
      appendPlayerRawInputLog(turnLog, appendOlderLog);
    },
    [appendOlderLog, appendPlayerRawInputLog, removeLog],
  );

  const loadRecentTurnLogs = useCallback(
    async (sessionId: string) => {
      if (!user) return;
      setIsLoadingTurnLogs(true);

      try {
        const result = await apiListTurnLogs(
          user,
          sessionId,
          {
            size: 10,
            includeDiceResult: true,
            includeStateDiff: true,
          },
          accessToken,
        );

        // 최신순으로 받은 10개를 내부 최신순 배열에 그대로 붙이면 화면에서는 오래된 것부터 보입니다.
        result.turnLogs.forEach(appendHistoricalTurnLog);
        setTurnLogNextCursor(result.nextCursor);
      } catch {
        // 게임룸 진입 직후 로그 조회 실패는 입력 흐름 자체를 막을 정도의 오류는 아니므로 조용히 넘긴다.
      } finally {
        setIsLoadingTurnLogs(false);
      }
    },
    [accessToken, appendHistoricalTurnLog, user],
  );

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;

    if (loadedTurnLogSessionIdRef.current !== snapshot.session.id) {
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = snapshot.session.id;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
    }

    void loadRecentTurnLogs(snapshot.session.id);
  }, [loadRecentTurnLogs, snapshot?.session.id, user]);

  const loadOlderTurnLogs = useCallback(async () => {
    const sessionId = snapshotRef.current?.session.id;
    if (!user || !sessionId || !turnLogNextCursor || isLoadingTurnLogs) {
      return;
    }

    setIsLoadingTurnLogs(true);

    try {
      const result = await apiListTurnLogs(
        user,
        sessionId,
        {
          cursor: turnLogNextCursor,
          size: 10,
          includeDiceResult: true,
          includeStateDiff: true,
        },
        accessToken,
      );

      result.turnLogs.forEach(appendHistoricalTurnLog);
      setTurnLogNextCursor(result.nextCursor);
    } catch {
      // 이전 로그 조회 실패는 현재 입력 흐름을 막지 않으므로 화면에는 기존 로그를 그대로 둡니다.
    } finally {
      setIsLoadingTurnLogs(false);
    }
  }, [accessToken, appendHistoricalTurnLog, isLoadingTurnLogs, turnLogNextCursor, user]);

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
        appendLog("action", message.senderDisplayName, `[CHAT]${message.content}`, undefined, message.createdAt);
      },
      onActionAccepted: (action: ActionAcceptedEventDto) => {
        const rawText = action.rawText.trim();
        if (!rawText) return;

        // 사용자가 선언한 원문은 처리 결과를 기다리지 않고, 서버가 접수한 시점에 모두에게 채팅처럼 보여준다.
        appendLog(
          "action",
          getSenderNameByUserId(action.actorUserId, snapshotRef.current),
          `[MAIN]${rawText}`,
          `player-action:${action.playerActionId}:raw`,
          action.clientCreatedAt,
        );
        appendLog(
          "action",
          "세션 로그",
          "[MAIN]로딩중 ...",
          `player-action:${action.playerActionId}:pending`,
        );

        window.setTimeout(() => {
          removeLog(`player-action:${action.playerActionId}:pending`);
        }, 45_000);
      },
      onTurnLogCreated: appendServerTurnLog,
      onSystemMessage: (message: SystemMessageEventDto) => {
        if (message.playerActionId) {
          removeLog(`player-action:${message.playerActionId}:pending`);
        }

        // 서버 처리 실패도 Main 탭에 남겨야 사용자가 "응답 없음"이 아니라 실패 원인을 볼 수 있다.
        appendLog(
          "action",
          "세션 로그",
          `[MAIN]${message.message}`,
          `system-message:${message.code}:${message.playerActionId ?? message.message}`,
        );
      },
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
  }, [appendLog, appendServerTurnLog, removeLog, snapshot?.session.id, updateSnapshot, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;
    void refreshSessionList();
  }, [accessToken, snapshot?.session.id, snapshot?.session.status, user]);

  async function refreshSessionListInternal(): Promise<SessionListRefreshResult | null> {
    if (!user) return null;

    try {
      const [publicSessions, mySessions] = await Promise.all([
        listSessions(user, accessToken),
        apiListMySessions(user, accessToken),
      ]);
      setSessionList(publicSessions.content);
      setMySessionList(mySessions.content);
      setMySessionsLoaded(true);
      return {
        publicSessions: publicSessions.content,
        mySessions: mySessions.content,
      };
    } catch {
      // ignore
    }

    return null;
  }

  async function refreshSessionList() {
    await refreshSessionListInternal();
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
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
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
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
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
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
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
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
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

  async function sendMainCommand(payload: SubmitMainCommandDto): Promise<MainCommandResponseDto | null> {
    if (!user || !snapshot) return null;

    setError(null);
    setBusy(true);

    try {
      return await apiSubmitMainCommand(user, snapshot.session.id, payload, accessToken);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "메인 명령 전송에 실패했습니다.";
      setError(message);
      appendLog("socket", "메인 명령 전송 실패", message);
      return null;
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
    setTurnLogNextCursor(null);
    setIsLoadingTurnLogs(false);
  }

  return {
    snapshot,
    sessionList,
    mySessionList,
    myCharacters,
    socketConnected,
    hasOlderTurnLogs: Boolean(turnLogNextCursor),
    isLoadingTurnLogs,
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
    sendMainCommand,
    sendAction,
    sendChatMessage,
    loadOlderTurnLogs,
    refreshSessionList,
    refreshMyCharacters,
    clearSnapshot,
    clearError: () => setError(null),
  };
}
