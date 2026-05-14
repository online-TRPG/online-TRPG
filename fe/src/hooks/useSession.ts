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
  leaveSession: () => Promise<boolean>;
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

function isStaleLeaveErrorMessage(message: string): boolean {
  return (
    message.includes("(403)") ||
    message.includes("(404)") ||
    message.includes("You must join the session before accessing it.") ||
    message.includes("was not found")
  );
}

function formatDebugValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(?놁쓬)";
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
    return `[MAIN]${narration || "硫붿씤 紐낅졊??泥섎━?덉뒿?덈떎."}`;
  }

  if (
    structuredAction &&
    typeof structuredAction === "object" &&
    structuredAction.type === "action_error"
  ) {
    return `[MAIN]${turnLog.narration?.trim() || "?됰룞 泥섎━???ㅽ뙣?덉뒿?덈떎."}`;
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
    "?낅젰",
    `- rawInput: ${formatDebugValue(turnLog.rawInput)}`,
    "",
    "寃곌낵",
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

  return participant?.user.displayName ?? "?????놁쓬";
}

function getRawInputCreatedAt(turnLog: TurnLogResponseDto): string {
  return turnLog.actionClientCreatedAt ?? turnLog.actionCreatedAt ?? turnLog.createdAt;
}

function formatDiceRollMessage(diceResult: DiceRollResponseDto): string {
  const parts = [
    `${diceResult.expression} = ${diceResult.total}`,
    diceResult.rolls.length ? `援대┝: ${diceResult.rolls.join(", ")}` : null,
    diceResult.modifier ? `?섏젙移? ${diceResult.modifier}` : null,
  ];

  return parts.filter((part): part is string => Boolean(part)).join(" / ");
}

function formatStateDiffMessage(stateDiff: StateDiffResponseDto): string {
  return `?곹깭 踰꾩쟾 ${stateDiff.baseVersion} -> ${stateDiff.nextVersion} (${stateDiff.reason})`;
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

  const clearLocalSessionState = useCallback(() => {
    clearStoredSnapshot();
    setSnapshot(null);
    setSocketConnected(false);
    socketRef.current?.disconnect();
    socketRef.current = null;
    seenTurnLogIdsRef.current.clear();
    loadedTurnLogSessionIdRef.current = null;
    setTurnLogNextCursor(null);
    setIsLoadingTurnLogs(false);
  }, []);

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
      // 濡쒓렇?꾩썐/?좏겙 留뚮즺 吏곹썑 ?댁쟾 ?ъ슜?먯쓽 ?몄뀡 ?붾㈃???⑥? ?딅룄濡?硫붾え由??곹깭源뚯? ?④퍡 鍮꾩슫??
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
    if (!user || !snapshot || !mySessionsLoaded || busy) return;

    const matchedSession = mySessionList.find(
      (item) =>
        item.sessionId === snapshot.session.id ||
        item.sessionPublicId === snapshot.session.publicId,
    );

    if (!matchedSession) {
      clearLocalSessionState();
      return;
    }

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
  }, [busy, clearLocalSessionState, mySessionList, mySessionsLoaded, snapshot, user]);

  const appendPlayerRawInputLog = useCallback(
    (turnLog: TurnLogResponseDto, writeLog: AppendLogFn) => {
      const rawInput = turnLog.rawInput?.trim();
      if (!rawInput) {
        return;
      }

      // TurnLog??DB???⑥쑝誘濡? ?덈줈怨좎묠/?ъ젒???뚮룄 媛숈? id濡??ъ슜???먮Ц 留먰뭾?좎쓣 ?ㅼ떆 留뚮뱾 ???덉뒿?덈떎.
      const rawLogId = turnLog.playerActionId
        ? `player-action:${turnLog.playerActionId}:raw`
        : `turn-log:${turnLog.turnLogId}:raw`;
      const senderName = turnLog.actorUserId
        ? getSenderNameByUserId(turnLog.actorUserId, snapshotRef.current)
        : "?????놁쓬";

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
        "?몄뀡 濡쒓렇",
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

      // 怨쇨굅 濡쒓렇???대? 諛곗뿴???ㅼそ???ｌ뼱???붾㈃?먯꽌???꾩옱 濡쒓렇蹂대떎 ?꾩뿉 蹂댁엯?덈떎.
      appendOlderLog(
        "action",
        "?몄뀡 濡쒓렇",
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

        // 理쒖떊?쒖쑝濡?諛쏆? 10媛쒕? ?대? 理쒖떊??諛곗뿴??洹몃?濡?遺숈씠硫??붾㈃?먯꽌???ㅻ옒??寃껊???蹂댁엯?덈떎.
        result.turnLogs.forEach(appendHistoricalTurnLog);
        setTurnLogNextCursor(result.nextCursor);
      } catch {
        // 寃뚯엫猷?吏꾩엯 吏곹썑 濡쒓렇 議고쉶 ?ㅽ뙣???낅젰 ?먮쫫 ?먯껜瑜?留됱쓣 ?뺣룄???ㅻ쪟???꾨땲誘濡?議곗슜???섍릿??
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
      // ?댁쟾 濡쒓렇 議고쉶 ?ㅽ뙣???꾩옱 ?낅젰 ?먮쫫??留됱? ?딆쑝誘濡??붾㈃?먮뒗 湲곗〈 濡쒓렇瑜?洹몃?濡??〓땲??
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
        // 湲곗〈 PlayPage??[CHAT] prefix媛 遺숈? 濡쒓렇瑜?Chat ??뿉 蹂댁뿬以??
        // ?붾㈃ 而댄룷?뚰듃 異⑸룎??以꾩씠湲??꾪빐 ?섏떊 硫붿떆吏留?湲곗〈 濡쒓렇 ?먮쫫???밸뒗??
        appendLog("action", message.senderDisplayName, `[CHAT]${message.content}`, undefined, message.createdAt);
      },
      onActionAccepted: (action: ActionAcceptedEventDto) => {
        const rawText = action.rawText.trim();
        if (!rawText) return;

        // ?ъ슜?먭? ?좎뼵???먮Ц? 泥섎━ 寃곌낵瑜?湲곕떎由ъ? ?딄퀬, ?쒕쾭媛 ?묒닔???쒖젏??紐⑤몢?먭쾶 梨꾪똿泥섎읆 蹂댁뿬以??
        appendLog(
          "action",
          getSenderNameByUserId(action.actorUserId, snapshotRef.current),
          `[MAIN]${rawText}`,
          `player-action:${action.playerActionId}:raw`,
          action.clientCreatedAt,
        );
        appendLog(
          "action",
          "?몄뀡 濡쒓렇",
          "[MAIN]濡쒕뵫以?...",
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

        // ?쒕쾭 泥섎━ ?ㅽ뙣??Main ??뿉 ?④꺼???ъ슜?먭? "?묐떟 ?놁쓬"???꾨땲???ㅽ뙣 ?먯씤??蹂????덈떎.
        appendLog(
          "action",
          "?몄뀡 濡쒓렇",
          `[MAIN]${message.message}`,
          `system-message:${message.code}:${message.playerActionId ?? message.message}`,
        );
      },
      onDiceRolled: (diceResult: DiceRollResponseDto) => {
        // 二쇱궗??寃곌낵??TurnLog?먮룄 ?ы븿?섎?濡?Main 濡쒓렇??以묐났?쇰줈 ?ｌ? ?딄퀬, ?ㅼ떆媛??대깽???뺤씤??濡쒓렇濡쒕쭔 ?④릿??
        appendLog("socket", "二쇱궗??寃곌낵", formatDiceRollMessage(diceResult));
      },
      onStateDiffApplied: (stateDiff: StateDiffResponseDto) => {
        // ?ㅼ젣 ?붾㈃ ?곹깭 媛깆떊? ?꾩슜 snapshot/?꾨찓???대깽?멸? 梨낆엫吏怨? ?ш린?쒕뒗 ?곹깭 蹂寃??대깽???섏떊 ?щ?瑜??④릿??
        appendLog("socket", "상태 변화", formatStateDiffMessage(stateDiff));
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
      setError("紐⑥쭛 以묒씤 ?몄뀡?먮뒗 ?섎굹留?李멸??????덉뒿?덈떎.");
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiCreateSession(user, title, options, accessToken);
      updateSnapshot(next);
      appendLog("rest", "?몄뀡 ?앹꽦", `${next.session.title} ?몄뀡???앹꽦?덉뒿?덈떎.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "?몄뀡 ?앹꽦???ㅽ뙣?덉뒿?덈떎.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(inviteCode: string): Promise<SessionSnapshot | null> {
    if (!user) return null;
    if (hasBlockingSession()) {
      setError("紐⑥쭛 以묒씤 ?몄뀡?먮뒗 ?섎굹留?李멸??????덉뒿?덈떎.");
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiJoinSession(user, inviteCode, accessToken);
      updateSnapshot(next);
      appendLog("rest", "?몄뀡 ?낆옣", `${next.session.title} ?몄뀡???낆옣?덉뒿?덈떎.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "?몄뀡 ?낆옣???ㅽ뙣?덉뒿?덈떎.");
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
      setError("紐⑥쭛 以묒씤 ?몄뀡?먮뒗 ?섎굹留?李멸??????덉뒿?덈떎.");
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
      appendLog("rest", "?몄뀡 ?낆옣", `${next.session.title} ?몄뀡???낆옣?덉뒿?덈떎.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "?몄뀡 ?낆옣???ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", "罹먮┃???앹꽦", `${payload.name} 罹먮┃?곕? ?앹꽦?덉뒿?덈떎.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "罹먮┃???앹꽦???ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", "罹먮┃??蹂듭젣", `${cloned.name} 罹먮┃?곕? 蹂듭젣?덉뒿?덈떎.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "罹먮┃??蹂듭젣???ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", "罹먮┃???섏젙", `${payload.name} 罹먮┃?곕? ?섏젙?덉뒿?덈떎.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "罹먮┃???섏젙???ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", "罹먮┃????젣", "罹먮┃?곕? ??젣?덉뒿?덈떎.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "罹먮┃????젣???ㅽ뙣?덉뒿?덈떎.");
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
        characterId ? "罹먮┃???좏깮" : "罹먮┃???좏깮 ?댁젣",
        characterId ? `${selected?.name ?? "캐릭터"}를 선택했습니다.` : "캐릭터 선택을 해제했습니다.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "罹먮┃???좏깮???ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", isReady ? "READY" : "READY ?댁젣", isReady ? "READY ?곹깭濡?蹂寃쏀뻽?듬땲??" : "READY瑜??댁젣?덉뒿?덈떎.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "READY ?곹깭 蹂寃쎌뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
      appendLog("rest", "?몄뀡 ?쒖옉", `${next.session.title} ?몄뀡???쒖옉?덉뒿?덈떎.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "?몄뀡 ?쒖옉???ㅽ뙣?덉뒿?덈떎.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveSession(): Promise<boolean> {
    if (!user || !snapshot) return false;
    setError(null);
    setBusy(true);

    const previousSnapshot = snapshot;
    const leavingSessionId = snapshot.session.id;
    const leavingSessionTitle = snapshot.session.title;
    clearLocalSessionState();

    try {
      await apiLeaveSession(user, leavingSessionId, accessToken);
      appendLog("rest", "세션 이탈", `${leavingSessionTitle} 세션에서 이탈했습니다.`);
      await refreshSessionList();
      return true;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "세션 이탈에 실패했습니다.";

      if (isStaleLeaveErrorMessage(message)) {
        appendLog("rest", "세션 이탈", `${leavingSessionTitle} 세션 이탈 상태를 동기화했습니다.`);
        await refreshSessionList();
        return true;
      }

      updateSnapshot(previousSnapshot);
      setError(message);
      await refreshSessionList();
      return false;
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
      const message = "?됰룞???낅젰?섎젮硫?癒쇱? 罹먮┃?곕? ?좏깮?댁빞 ?⑸땲??";
      setError(message);
      appendLog("socket", "?됰룞 ?꾩넚 ?ㅽ뙣", message);
      return;
    }

    const payload: SubmitActionDto = {
      characterId: selectedCharacterId,
      rawText: trimmed,
      clientCreatedAt: new Date().toISOString(),
      // ?꾪닾媛 ?꾨땺 ?뚮뒗 ?뚰떚 怨듭슜 ?됰룞?쇰줈 蹂대궡???꾩옱 諛깆뿏??寃利?洹쒖튃???듦낵?쒕떎.
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
      // ?붾㈃ ?쒖떆???쒕쾭媛 ?????釉뚮줈?쒖틦?ㅽ듃?섎뒗 turn.log.created ?대깽?몃쭔 誘용뒗??
      // 洹몃옒??DB???⑥? 湲곕줉怨??ъ슜?먭? 蹂대뒗 濡쒓렇媛 媛숈? 異쒖쿂瑜?媛吏꾨떎.
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "?됰룞 ?꾩넚???ㅽ뙣?덉뒿?덈떎.";
      setError(message);
      appendLog("socket", "?됰룞 ?꾩넚 ?ㅽ뙣", message);
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
      const message = caught instanceof Error ? caught.message : "硫붿씤 紐낅졊 ?꾩넚???ㅽ뙣?덉뒿?덈떎.";
      setError(message);
      appendLog("socket", "硫붿씤 紐낅졊 ?꾩넚 ?ㅽ뙣", message);
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
      const message = "梨꾪똿 硫붿떆吏??1000???댄븯濡??낅젰?댁＜?몄슂.";
      setError(message);
      appendLog("socket", "梨꾪똿 ?꾩넚 ?ㅽ뙣", message);
      return;
    }

    const socket = socketRef.current;
    if (!socket?.connected) {
      const message = "?ㅼ떆媛?梨꾪똿 ?곌껐 ???ㅼ떆 ?쒕룄?댁＜?몄슂.";
      setError(message);
      appendLog("socket", "梨꾪똿 ?꾩넚 ?ㅽ뙣", message);
      return;
    }

    // ?쒕쾭媛 membership???ㅼ떆 ?뺤씤????媛숈? ?몄뀡 room??broadcast?쒕떎.
    // 洹몃옒???숆???異붽?瑜??섏? ?딄퀬, ?쒕쾭媛 ?뚮젮以 chat.message ?대깽?몃쭔 ?붾㈃???쒖떆?쒕떎.
    sendRealtimeChatMessage(socket, snapshot.session.id, trimmed);
  }

  function clearSnapshot() {
    clearLocalSessionState();
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
