/*
 * PlayPage
 * 역할: 실제 세션 플레이 화면입니다. 캐릭터 선택, 준비 상태, 채팅/로그, 현재 시나리오 노드, VTT 맵을 표시합니다.
 * 읽는 순서:
 * 1) 상단 헬퍼: 로그 스코프, 아바타/클래스 표시 이미지, 노드 라벨 추출
 * 2) PlayPageProps: 세션 스냅샷과 소켓 상태, 플레이 액션 콜백
 * 3) 컴포넌트 state/ref: 탭, 채팅 입력, 캐릭터 생성 폼, 시나리오/맵 로딩 상태, 맵 저장 큐
 * 4) useEffect: 서버 선택 캐릭터 동기화, 시나리오/맵 조회, 로그 스크롤, 입력 초기화
 * 5) handler: 캐릭터 생성, 채팅/액션 전송, VTT 맵 변경 저장
 * 6) JSX: 모집 대기 화면, 플레이 탭, VTT 맵, 사이드 패널, 캐릭터 생성 모달
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import type { VttMapStateDto } from "@trpg/shared-types";
import defaultArcherImage from "../assets/images/Profile_Default_Archer.webp";
import defaultRogueImage from "../assets/images/Profile_Default_Rouge.webp";
import defaultWarriorImage from "../assets/images/Profile_Default_Warrior.webp";
import defaultWizardImage from "../assets/images/Profile_Default_Wizard.webp";
import { BattleMap } from "../components/BattleMap";
import { Icon } from "../components/Icon";
import profileBorderCharacter from "../components/Profile_Border_Character.webp";
import { getClassLabel } from "../services/staticSrd";
import type { CharacterPayload } from "../hooks/useSession";
import { getPlayerScenario, getVttMap, updateVttMap } from "../services/api";
import type { LogEntry, PersistentCharacter, PlayerScenarioView, SessionSnapshot, StoredUser } from "../types/session";
import "./CharacterPage.css";
import "./PlayPage.css";

// 플레이 화면 상단 탭 이름입니다. 각 탭은 로그/채팅/정보/설정을 구분합니다.
const sessionTabs = ["Main", "Chat", "Info", "Settings", "Control"] as const;
const sessionTabLabels: Record<(typeof sessionTabs)[number], string> = {
  Main: "\uBA54\uC778",
  Chat: "\uCC44\uD305",
  Info: "\uC815\uBCF4",
  Settings: "\uC124\uC815",
  Control: "\uC870\uC791",
};
const sessionTabDescriptions: Record<
  (typeof sessionTabs)[number],
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  Main: {
    eyebrow: "Session log",
    title: "\uBA54\uC778 \uB85C\uADF8",
    description: "\uD589\uB3D9 \uC120\uC5B8\uACFC \uC9C4\uD589 \uC0C1\uD669\uC774 \uC2DC\uAC04\uC21C\uC73C\uB85C \uAE30\uB85D\uB429\uB2C8\uB2E4.",
  },
  Chat: {
    eyebrow: "Party chat",
    title: "\uD30C\uD2F0 \uCC44\uD305",
    description: "\uC138\uC158 \uAD6C\uC131\uC6D0\uB07C\uB9AC \uC790\uC720\uB86D\uAC8C \uBA54\uC2DC\uC9C0\uB97C \uC8FC\uACE0\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  },
  Info: {
    eyebrow: "Scenario info",
    title: "\uC2DC\uB098\uB9AC\uC624 \uC815\uBCF4",
    description: "\uD604\uC7AC \uC138\uC158\uACFC \uC5F0\uACB0\uB41C \uC2DC\uB098\uB9AC\uC624 \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  },
  Settings: {
    eyebrow: "Room settings",
    title: "\uC138\uC158 \uC124\uC815",
    description: "\uBC29 \uC815\uBCF4\uC640 \uC774\uB3D9, \uB098\uAC00\uAE30 \uAC19\uC740 \uAE30\uB2A5\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  },
  Control: {
    eyebrow: "Host controls",
    title: "\uC2DC\uB098\uB9AC\uC624 \uC870\uC791",
    description: "\uC52C \uC124\uBA85\uACFC \uC561\uC158, \uB2E8\uC11C \uC815\uBCF4\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.",
  },
};
const avatarPresetImageMap = new Map([
  ["preset_wizard", defaultWizardImage],
  ["preset_archer", defaultArcherImage],
  ["preset_rogue", defaultRogueImage],
  ["preset_warrior", defaultWarriorImage],
]);

const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 620;

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface PlayPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  characters: PersistentCharacter[];
  logs: LogEntry[];
  socketConnected: boolean;
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void;
  onSelectCharacter: (characterId: string | null) => void;
  onSetReady: (isReady: boolean) => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
  onBackToLobby: () => void;
  onAction: (label: string) => void;
  onLoadOlderTurnLogs: () => void;
}

// 캐릭터 생성 모달을 처음 열 때 쓰는 기본 입력값입니다.
const defaultCharacter = {
  name: "",
  ancestry: "Human",
  className: "Wizard",
  maxHp: 12,
};

const visibleCharacterSlots = 3;

// 로그 메시지 앞의 [MAIN]/[CHAT] 스코프 태그를 화면 표시용으로 제거합니다.
function stripScopePrefix(message: string) {
  return message.replace(/^\[(MAIN|CHAT)\]/, "").trim();
}

function isChatScoped(message: string) {
  return message.startsWith("[CHAT]");
}

function getAvatarLabel(title: string, userName: string) {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  if (trimmed === userName) return userName.slice(0, 1).toUpperCase();
  return trimmed.slice(0, 1).toUpperCase();
}

function getLogSenderLabel(title: string, rowClass: "incoming" | "outgoing" | "notice") {
  if (rowClass === "notice") return "세션 로그";
  return title || "알 수 없음";
}

function getLogDate(createdAt: string): Date {
  const date = new Date(createdAt);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getLogDateKey(createdAt: string): string {
  const date = getLogDate(createdAt);

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getLogDateLabel(createdAt: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(getLogDate(createdAt));
}

function getConnectionLabel(connected: boolean) {
  return connected ? "Connected" : "Offline";
}

function getCharacterArt(className: string) {
  const normalized = className.toLowerCase();
  if (normalized.includes("wizard") || normalized.includes("mage") || normalized.includes("sorcer")) {
    return defaultWizardImage;
  }
  if (normalized.includes("archer") || normalized.includes("ranger") || normalized.includes("bow")) {
    return defaultArcherImage;
  }
  if (normalized.includes("rogue") || normalized.includes("rouge") || normalized.includes("thief")) {
    return defaultRogueImage;
  }
  if (normalized.includes("fighter") || normalized.includes("warrior") || normalized.includes("knight")) {
    return defaultWarriorImage;
  }
  return defaultWizardImage;
}

// 캐릭터가 직접 업로드한 이미지, 프리셋 이미지, 직업 기본 이미지 순서로 표시 이미지를 고릅니다.
function getCharacterImage(character: { avatarPresetId?: string | null; avatarUrl?: string | null; className: string }) {
  if (character.avatarUrl) return character.avatarUrl;
  if (character.avatarPresetId) {
    return avatarPresetImageMap.get(character.avatarPresetId) ?? getCharacterArt(character.className);
  }
  return getCharacterArt(character.className);
}

function getCharacterClassLabel(className: string) {
  return getClassLabel(className);
}

function getNodeLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.label === "string") return candidate.label;
  if (typeof candidate.id === "string") return candidate.id;
  if (typeof candidate.skill === "string") return candidate.skill;
  return null;
}

function getAbilitySummary(character: PersistentCharacter) {
  return [
    { label: "근력", value: character.abilities.str },
    { label: "민첩", value: character.abilities.dex },
    { label: "건강", value: character.abilities.con },
    { label: "지능", value: character.abilities.int },
    { label: "지혜", value: character.abilities.wis },
    { label: "매력", value: character.abilities.cha },
  ];
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function PlayPage({
  user,
  snapshot,
  characters,
  logs,
  socketConnected,
  hasOlderTurnLogs,
  isLoadingTurnLogs,
  busy,
  error,
  onCreateCharacter,
  onSelectCharacter,
  onSetReady,
  onStartSession,
  onLeaveSession,
  onBackToLobby,
  onAction,
  onLoadOlderTurnLogs,
}: PlayPageProps) {
  // UI 상태: 현재 탭, 모달 열림, 입력창 값, 로컬 캐릭터 선택값입니다.
  const [activeTab, setActiveTab] = useState<(typeof sessionTabs)[number]>("Main");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [mainMessage, setMainMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [infoText, setInfoText] = useState("");
  const [formState, setFormState] = useState(defaultCharacter);
  const [localSelectedCharacterId, setLocalSelectedCharacterId] = useState<string | null>(null);
  const [isStatusMinimized, setStatusMinimized] = useState(false);
  const [isGameStarting, setIsGameStarting] = useState(false);
  const [characterCarouselIndex, setCharacterCarouselIndex] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  // 현재 세션의 플레이어용 시나리오 노드와 VTT 맵 로딩 상태입니다.
  const [playerScenario, setPlayerScenario] = useState<PlayerScenarioView | null>(null);
  const [vttMap, setVttMap] = useState<VttMapStateDto | null>(null);
  const [scenarioLoadError, setScenarioLoadError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  // 로그 자동 스크롤과 맵 저장 큐를 관리하는 ref입니다. 렌더링 없이 최신 값을 유지합니다.
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const latestConfirmedMapRef = useRef<VttMapStateDto | null>(null);
  const mapSaveRef = useRef<{
    isSaving: boolean;
    pending: VttMapStateDto | null;
    activeSessionId: string | null;
  }>({
    isSaving: false,
    pending: null,
    activeSessionId: null,
  });

  // 서버 스냅샷에서 현재 세션/참가자/선택 캐릭터/권한 상태를 계산합니다.
  const session = snapshot?.session ?? null;
  const participants = snapshot?.participants ?? [];
  const sessionCharacters = snapshot?.characters ?? [];
  const myParticipant = participants.find((participant) => participant.userId === user.id) ?? null;
  const serverSelectedCharacterId = myParticipant?.characterId ?? null;
  const selectedCharacterId = localSelectedCharacterId;
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? null;
  const readyLocked = Boolean(myParticipant?.isReady);
  const allPlayersReady = participants.length > 0 && participants.every((participant) => participant.isReady);
  const isHost = session?.hostUserId === user.id;
  const isRecruiting = session?.status === "recruiting";
  const canManageStartedSession = Boolean(!isRecruiting && isHost);
  const canShowCharacterSelection = Boolean(session && isRecruiting);
  const canStartSession = Boolean(isHost && isRecruiting && allPlayersReady && participants.length > 0);
  const activeScenario =
    snapshot?.sessionScenarios.find((item) => item.status === "ACTIVE") ?? snapshot?.sessionScenarios[0];
  const currentNode = playerScenario?.currentNode ?? null;
  const revealedClues = playerScenario?.revealedClues ?? [];
  const snapshotVttMap = snapshot?.state.flags?.vttMap;
  const startedSessionTabs = useMemo(
    () =>
      canManageStartedSession
        ? (["Main", "Chat", "Control", "Info", "Settings"] as const)
        : (["Main", "Chat", "Info", "Settings"] as const),
    [canManageStartedSession]
  );
  const availableTabs = isRecruiting ? (["Main", "Chat", "Info", "Settings"] as const) : startedSessionTabs;
  const isStartedScreenReady = Boolean(
    !isRecruiting &&
      (currentNode || activeScenario || scenarioLoadError) &&
      (vttMap || mapLoadError || snapshotVttMap)
  );

  // 서버가 알려준 선택 캐릭터가 바뀌면 로컬 선택 상태도 맞춥니다.
  useEffect(() => {
    setLocalSelectedCharacterId(serverSelectedCharacterId);
  }, [serverSelectedCharacterId]);

  // 준비 상태가 풀리면 상태 패널을 다시 펼쳐 사용자가 확인할 수 있게 합니다.
  useEffect(() => {
    if (!allPlayersReady) {
      setStatusMinimized(false);
    }
  }, [allPlayersReady]);

  useEffect(() => {
    if (isRecruiting) {
      setIsGameStarting(false);
      return;
    }

    setIsGameStarting(true);
  }, [isRecruiting]);

  useEffect(() => {
    if (!isGameStarting || !isStartedScreenReady) return;
    const timeout = window.setTimeout(() => setIsGameStarting(false), 250);
    return () => window.clearTimeout(timeout);
  }, [isGameStarting, isStartedScreenReady]);

  useEffect(() => {
    if (availableTabs.some((tab) => tab === activeTab)) return;
    setActiveTab(availableTabs[0]);
  }, [activeTab, availableTabs]);

  // 세션이 없거나 바뀌면 시나리오/맵 상태를 초기화하고 플레이어용 시나리오를 다시 불러옵니다.
  useEffect(() => {
    if (!session) {
      setPlayerScenario(null);
      setVttMap(null);
      setScenarioLoadError(null);
      setMapLoadError(null);
      latestConfirmedMapRef.current = null;
      mapSaveRef.current = {
        isSaving: false,
        pending: null,
        activeSessionId: null,
      };
      return;
    }

    let ignore = false;
    setScenarioLoadError(null);

    getPlayerScenario(user, session.id)
      .then((scenario) => {
        if (!ignore) {
          setPlayerScenario(scenario);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setPlayerScenario(null);
          setScenarioLoadError(caught instanceof Error ? caught.message : "시나리오를 불러오지 못했습니다.");
        }
      });
  return () => {
      ignore = true;
    };
  }, [session, snapshot?.state.currentNodeId, user]);

  useEffect(() => {
    if (snapshotVttMap && typeof snapshotVttMap === "object") {
      const nextMap = snapshotVttMap as VttMapStateDto;
      latestConfirmedMapRef.current = nextMap;
      setVttMap(nextMap);
    }
  }, [snapshotVttMap]);

  useEffect(() => {
    if (!session || isRecruiting) {
      return;
    }

    let ignore = false;
    setMapLoadError(null);

    getVttMap(user, session.id)
      .then((map) => {
        if (!ignore) {
          latestConfirmedMapRef.current = map;
          setVttMap(map);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setMapLoadError(caught instanceof Error ? caught.message : "맵을 불러오지 못했습니다.");
        }
      });

    return () => {
      ignore = true;
    };
  }, [isRecruiting, session, user]);

  useEffect(() => {
    mapSaveRef.current.activeSessionId = session?.id ?? null;
    mapSaveRef.current.pending = null;
  }, [session?.id]);

  const joinableCharacters = useMemo(
    () =>
      characters.map((character) => ({
        ...character,
        isSelected: character.id === selectedCharacterId,
        isDisabled: !character.isSelectable || (readyLocked && character.id !== selectedCharacterId),
      })),
    [characters, readyLocked, selectedCharacterId],
  );

  const characterSelectionItems = useMemo(
    () => [
      { kind: "create" as const, id: "create-character" },
      ...joinableCharacters.map((character) => ({
        kind: "character" as const,
        id: character.id,
        character,
      })),
    ],
    [joinableCharacters],
  );

  const maxCharacterCarouselIndex = Math.max(0, characterSelectionItems.length - visibleCharacterSlots);

  const visibleCharacterItems = useMemo(
    () => characterSelectionItems.slice(characterCarouselIndex, characterCarouselIndex + visibleCharacterSlots),
    [characterCarouselIndex, characterSelectionItems],
  );

  const selectedCharacterAbilitySummary = useMemo(
    () => (selectedCharacter ? getAbilitySummary(selectedCharacter) : []),
    [selectedCharacter],
  );

  useEffect(() => {
    setCharacterCarouselIndex((current) => Math.min(current, maxCharacterCarouselIndex));
  }, [maxCharacterCarouselIndex]);

  useEffect(() => {
    if (!selectedCharacterId) return;
    const selectedIndex = characterSelectionItems.findIndex((item) => item.kind === "character" && item.id === selectedCharacterId);
    if (selectedIndex < 0) return;

    setCharacterCarouselIndex((current) => {
      if (selectedIndex < current) return selectedIndex;
      if (selectedIndex >= current + visibleCharacterSlots) {
        return selectedIndex - visibleCharacterSlots + 1;
      }
      return current;
    });
  }, [characterSelectionItems, selectedCharacterId]);

  const scopedLogs = useMemo(() => {
    if (activeTab === "Chat") {
      return logs.filter((log) => log.kind === "action" && isChatScoped(log.message));
    }

    if (activeTab === "Main") {
      return logs.filter((log) => log.kind === "action" && !isChatScoped(log.message));
    }

    return [];
  }, [activeTab, logs]);

  const renderedRows = useMemo(
    () => {
      let previousDateKey: string | null = null;

      return [...scopedLogs].reverse().map((log) => {
        const normalizedMessage = stripScopePrefix(log.message);
        const isMine = log.title === user.displayName;
        const rowClass = log.kind === "system" ? "notice" : isMine ? "outgoing" : "incoming";
        const dateKey = getLogDateKey(log.createdAt);
        const showDateSeparator = dateKey !== previousDateKey;
        previousDateKey = dateKey;

        return {
          ...log,
          message: normalizedMessage,
          // 서버 응답을 기다리는 임시 로그는 멈춘 것처럼 보이지 않도록 별도 표시를 붙입니다.
          isPendingAction: log.id.endsWith(":pending"),
          showDateSeparator,
          dateLabel: getLogDateLabel(log.createdAt),
          rowClass,
          senderLabel: getLogSenderLabel(log.title, rowClass),
        };
      });
    },
    [scopedLogs, user.displayName],
  );
  const latestRenderedLogId = renderedRows[renderedRows.length - 1]?.id ?? null;

  const displayedParticipants = useMemo(() => {
    const minSlots = 4;
    const filled = [...participants];
    while (filled.length < minSlots) {
      filled.push(null as never);
    }
    return filled;
  }, [participants]);

  useEffect(() => {
    if (!latestRenderedLogId) return;

    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeTab, latestRenderedLogId]);

  function handleCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateCharacter(formState);
    setCreateModalOpen(false);
    setFormState(defaultCharacter);
  }

  function handleMainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = mainMessage.trim();
    if (!next) return;
    onAction(`MAIN:${next}`);
    setMainMessage("");
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = chatMessage.trim();
    if (!next) return;
    onAction(`CHAT:${next}`);
    setChatMessage("");
  }

  function handleCharacterClick(characterId: string) {
    if (busy || readyLocked) return;
    if (selectedCharacterId === characterId) {
      setLocalSelectedCharacterId(null);
      onSelectCharacter(null);
      return;
    }

    setLocalSelectedCharacterId(characterId);
    onSelectCharacter(characterId);
  }

  async function flushPendingMapSave(sessionId: string) {
    const saveState = mapSaveRef.current;
    if (saveState.isSaving) {
      return;
    }

    const mapToSave = saveState.pending;
    if (!mapToSave) {
      return;
    }

    saveState.pending = null;
    saveState.isSaving = true;

    try {
      const savedMap = await updateVttMap(user, sessionId, mapToSave);
      if (mapSaveRef.current.activeSessionId === sessionId) {
        latestConfirmedMapRef.current = savedMap;
        setMapLoadError(null);
        setVttMap((current) => (current === mapToSave ? savedMap : current));
      }
    } catch (caught) {
      if (mapSaveRef.current.activeSessionId === sessionId) {
        const fallbackMap = latestConfirmedMapRef.current;
        setVttMap((current) => (current === mapToSave && fallbackMap ? fallbackMap : current));
        setMapLoadError(caught instanceof Error ? caught.message : 'Map save failed.');
      }
    } finally {
      saveState.isSaving = false;
      if (saveState.pending && mapSaveRef.current.activeSessionId === sessionId) {
        void flushPendingMapSave(sessionId);
      }
    }
  }

  function handleMapChange(nextMap: VttMapStateDto) {
    if (!session) return;
    mapSaveRef.current.activeSessionId = session.id;
    mapSaveRef.current.pending = nextMap;
    setVttMap(nextMap);
    setMapLoadError(null);
    void flushPendingMapSave(session.id);
  }

  function getParticipantBadge(participantUserId: string): string | null {
    if (!session) return null;
    if (participantUserId === session.hostUserId) {
      return session.gmMode === "HUMAN" ? "GM" : "HOST";
    }
    return null;
  }

  const layoutStyle = {
    "--session-sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;

  function handleSidebarResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const maxWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.65));
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(moveEvent: PointerEvent) {
      // 우측 패널이라서 마우스가 왼쪽으로 갈수록 넓어집니다.
      const nextWidth = window.innerWidth - moveEvent.clientX;
      setSidebarWidth(Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)));
    }

    function handlePointerUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <main className="session-prep-layout session-prep-layout-tight" style={layoutStyle}>
      <section className="session-prep-stage">
        <div className={`session-stage-canvas${!isRecruiting ? " started" : ""}`}>
          {isRecruiting ? (
          <section className="session-room-overlay">
            <div className="session-room-overlay-row">
              <div className="session-room-overlay-title">
                <span className="eyebrow">세션 룸</span>
                <strong>{session?.title ?? "활성 세션이 없습니다"}</strong>
              </div>

              <span className={socketConnected ? "status-pill online" : "status-pill"}>
                {getConnectionLabel(socketConnected)}
              </span>

              <div className="invite-inline">
                <strong>{session?.inviteCode ?? "------"}</strong>
                <button
                  type="button"
                  className="invite-copy-button"
                  onClick={() => session?.inviteCode && navigator.clipboard.writeText(session.inviteCode)}
                  aria-label="초대 코드 복사"
                >
                  <Icon name="copy" />
                </button>
              </div>

              <div className="session-room-overlay-actions">
                <button type="button" className="ghost" onClick={onBackToLobby}>
                  로비
                </button>
                <button type="button" className="ghost" onClick={onLeaveSession}>
                  나가기
                </button>
              </div>
            </div>
          </section>
          ) : null}

          {canShowCharacterSelection ? (
            <section className="character-selection-board player-ready-board session-character-board">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">캐릭터 선택</span>
                  <h2>플레이할 캐릭터를 선택해 주세요</h2>
                </div>
                <button
                  type="button"
                  className={`ready-toggle-button${myParticipant?.isReady ? " active" : ""}`}
                  disabled={busy || !selectedCharacter}
                  onClick={() => onSetReady(!myParticipant?.isReady)}
                >
                  {myParticipant?.isReady ? "준비 해제" : "준비 완료"}
                </button>
              </div>

              <div className="character-selection-carousel">
                <button
                  type="button"
                  className="character-selection-nav"
                  onClick={() => setCharacterCarouselIndex((current) => Math.max(0, current - 1))}
                  disabled={characterCarouselIndex === 0}
                  aria-label="이전 캐릭터 보기"
                >
                  {"<"}
                </button>

                <div className="character-selection-grid">
                  {visibleCharacterItems.map((item) => {
                    if (item.kind === "create") {
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className="character-selection-create"
                          onClick={() => setCreateModalOpen(true)}
                          disabled={readyLocked}
                        >
                          <Icon name="plus" />
                          <strong>캐릭터 생성</strong>
                          <span>새 캐릭터를 만든 뒤 이 세션에서 바로 사용할 수 있습니다.</span>
                        </button>
                      );
                    }

                    const { character } = item;
                    const cardImage = getCharacterImage(character);
                    const disabledLabel = !character.isSelectable
                      ? "사용 중"
                      : readyLocked && !character.isSelected
                        ? "READY 고정"
                        : null;

                    return (
                      <button
                        type="button"
                        key={character.id}
                        className={`fantasy-character-card session-character-option${
                          character.isSelected ? " selected" : ""
                        }`}
                        disabled={busy || character.isDisabled}
                        onClick={() => handleCharacterClick(character.id)}
                      >
                        <div
                          className="fantasy-character-card-frame session-character-option-frame"
                          style={{ ["--frame-image" as string]: `url(${profileBorderCharacter})` }}
                        >
                          <img src={cardImage} alt={character.name} className="fantasy-character-card-art" />
                          {disabledLabel ? <div className="fantasy-character-card-overlay">{disabledLabel}</div> : null}
                          <div className="session-character-option-badges">
                            <span>LV {character.level}</span>
                            <span>HP {character.maxHp}</span>
                            <span>AC {character.armorClass}</span>
                          </div>
                          <div className="fantasy-character-card-nameplate">{character.name}</div>
                          <div className="fantasy-character-card-class">{getCharacterClassLabel(character.className)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="character-selection-nav"
                  onClick={() => setCharacterCarouselIndex((current) => Math.min(maxCharacterCarouselIndex, current + 1))}
                  disabled={characterCarouselIndex >= maxCharacterCarouselIndex}
                  aria-label="다음 캐릭터 보기"
                >
                  {">"}
                </button>
              </div>

              <section className="character-selection-detail">
                <div className="character-selection-detail-header">
                  <span className="eyebrow">선택 캐릭터 정보</span>
                  <strong>{selectedCharacter?.name ?? "캐릭터를 선택해 주세요"}</strong>
                </div>

                {selectedCharacter ? (
                  <div className="character-selection-detail-body">
                    <div className="character-selection-detail-meta">
                      <span>{selectedCharacter.ancestry}</span>
                      <span>{getCharacterClassLabel(selectedCharacter.className)}</span>
                      <span>레벨 {selectedCharacter.level}</span>
                      <span>숙련 +{selectedCharacter.proficiencyBonus}</span>
                    </div>

                    <div className="character-selection-detail-stats">
                      <div>
                        <strong>체력</strong>
                        <span>{selectedCharacter.maxHp}</span>
                      </div>
                      <div>
                        <strong>방어도</strong>
                        <span>{selectedCharacter.armorClass}</span>
                      </div>
                      <div>
                        <strong>이동 속도</strong>
                        <span>{selectedCharacter.speed}</span>
                      </div>
                    </div>

                    <div className="character-selection-detail-abilities">
                      {selectedCharacterAbilitySummary.map((ability) => (
                        <div key={ability.label}>
                          <strong>{ability.label}</strong>
                          <span>{ability.value}</span>
                        </div>
                      ))}
                    </div>

                    <p className="character-selection-detail-bio">
                      {selectedCharacter.bio?.trim() || "아직 등록된 캐릭터 소개가 없습니다."}
                    </p>
                  </div>
                ) : (
                  <p className="character-selection-detail-empty">
                    캐릭터를 선택하면 능력치와 소개를 여기에서 바로 확인할 수 있습니다.
                  </p>
                )}
              </section>
            </section>
          ) : null}

          {session && !isRecruiting ? (
            <section className="session-game-surface">
              {scenarioLoadError ? <p className="panel-error">{scenarioLoadError}</p> : null}
              {vttMap ? (
                <BattleMap
                  map={vttMap}
                  characters={sessionCharacters}
                  isHost={isHost}
                  currentUserId={user.id}
                  onChange={handleMapChange}
                />
              ) : (
                <div className="session-game-surface__placeholder">
                  <h1>메인화면</h1>
                </div>
              )}
              {mapLoadError ? <p className="panel-error">{mapLoadError}</p> : null}
            </section>
          ) : null}
        </div>

        {allPlayersReady && isRecruiting ? (
          <div className={`session-status-floating-layer${isStatusMinimized ? " minimized" : " expanded"}`}>
            {isStatusMinimized ? (
              <section
                className="session-main-ready-minimized session-status-toggle-surface"
                onClick={() => setStatusMinimized(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setStatusMinimized(false);
                  }
                }}
              >
                <span className="eyebrow">Session status</span>
                <strong>All players ready</strong>
              </section>
            ) : (
              <section
                className="session-ready-card session-main-ready-overlay session-status-toggle-surface"
                onClick={() => setStatusMinimized(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setStatusMinimized(true);
                  }
                }}
              >
                <span className="eyebrow">Session status</span>
                <h2>{isRecruiting ? "Recruiting lobby" : "Session in progress"}</h2>
                <p>
                  {activeScenario
                    ? `${activeScenario.scenario.title} / ${activeScenario.scenario.ruleSetId ?? "TRPG"}`
                    : "Scenario not assigned"}
                </p>
                <p>All participants are READY. The host can start the session.</p>
                {isHost ? (
                  <div className="ready-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={!canStartSession || busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsGameStarting(true);
                        onStartSession();
                      }}
                    >
                      Start session
                    </button>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        ) : null}

        <section className="participant-strip participant-strip-four-up">
          {displayedParticipants.length ? (
            displayedParticipants.map((participant, index) => {
                if (!participant) {
                  return (
                    <article key={`empty-slot-${index}`} className="participant-strip-card placeholder">
                      <div className="participant-avatar-frame placeholder" />
                      <div className="participant-card-body">
                        <strong>빈 슬롯</strong>
                        <span>참가자를 기다리는 중입니다.</span>
                      </div>
                      <div className="participant-state">대기</div>
                      <div className="participant-index">{index + 1}</div>
                    </article>
                  );
                }

                const linkedCharacter = sessionCharacters.find((character) => character.userId === participant.userId) ?? null;
                const badgeLabel = getParticipantBadge(participant.userId);
                const stateLabel = participant.isReady ? "READY" : participant.connectionStatus;
                const participantImage = linkedCharacter ? getCharacterImage(linkedCharacter) : null;

                return (
                  <article key={participant.id} className="participant-strip-card">
                    {badgeLabel ? <div className="participant-special-badge">{badgeLabel}</div> : null}
                    <div className="participant-avatar-frame" style={{ ["--frame-image" as string]: `url(${profileBorderCharacter})` }}>
                      {participantImage ? (
                        <img
                          src={participantImage}
                          alt={linkedCharacter?.name ?? participant.user.displayName}
                          className="participant-avatar-image"
                        />
                      ) : (
                        <div className="participant-avatar tone-1">
                          {(linkedCharacter?.name ?? participant.user.displayName).slice(0, 1)}
                        </div>
                      )}
                    </div>
                  <div className="participant-card-body">
                    <strong>{participant.user.displayName}</strong>
                    <span>
                      {linkedCharacter
                        ? `${linkedCharacter.name} / ${getCharacterClassLabel(linkedCharacter.className)}`
                        : participant.userId === user.id
                          ? "\uCE90\uB9AD\uD130\uAC00 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4"
                          : "\uCE90\uB9AD\uD130\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911\uC785\uB2C8\uB2E4"}
                    </span>
                  </div>
                  <div className={`participant-state${participant.isReady ? " ready" : ""}`}>{stateLabel}</div>
                  <div className="participant-index">{index + 1}</div>
                </article>
              );
            })
          ) : null}
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>

      <div
        className="session-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="우측 패널 크기 조절"
        onPointerDown={handleSidebarResizePointerDown}
      />

      <aside className="session-sidebar">
        <div className="session-sidebar-tabs">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {sessionTabLabels[tab]}
            </button>
          ))}
        </div>

        <div className="session-sidebar-panel">
          <div className="session-sidebar-heading">
            <span className="eyebrow">{sessionTabDescriptions[activeTab].eyebrow}</span>
            <strong className="session-sidebar-title">{sessionTabDescriptions[activeTab].title}</strong>
            <p className="session-sidebar-subtitle">{sessionTabDescriptions[activeTab].description}</p>
          </div>

          {activeTab === "Main" || activeTab === "Chat" ? (
            <>
              <div className="session-log-area">
                {activeTab === "Main" && hasOlderTurnLogs ? (
                  <div className="session-log-history-bar">
                    <button
                      type="button"
                      className="session-log-history-button"
                      disabled={isLoadingTurnLogs}
                      onClick={onLoadOlderTurnLogs}
                    >
                      {isLoadingTurnLogs ? "불러오는 중..." : "이전 로그 보기"}
                    </button>
                  </div>
                ) : null}

                <div className="session-log-stack">
                  {renderedRows.length ? (
                    renderedRows.map((log) => (
                      <Fragment key={log.id}>
                        {log.showDateSeparator ? (
                          <div className="chat-thread-date-divider">
                            <span>{log.dateLabel}</span>
                          </div>
                        ) : null}
                        <article className={`chat-thread-row ${log.rowClass}`}>
                          {log.rowClass === "incoming" ? (
                            <div className="chat-thread-avatar">{getAvatarLabel(log.title, user.displayName)}</div>
                          ) : null}
                          <div className="chat-thread-stack">
                            <span className={`chat-thread-sender ${log.rowClass}`}>{log.senderLabel}</span>
                            <div className={`chat-thread-bubble${log.isPendingAction ? " pending" : ""}`}>
                              {log.isPendingAction ? <span className="chat-thread-spinner" aria-hidden="true" /> : null}
                              <span>{log.message}</span>
                            </div>
                            {log.rowClass !== "notice" ? <span className="chat-thread-time">{log.time}</span> : null}
                          </div>
                          {log.rowClass === "outgoing" ? (
                            <div className="chat-thread-avatar">{getAvatarLabel(log.title, user.displayName)}</div>
                          ) : null}
                        </article>
                      </Fragment>
                    ))
                  ) : (
                    <article className="chat-thread-row notice">
                      <div className="chat-thread-stack">
                        <span className="chat-thread-sender notice">세션 로그</span>
                        <div className="chat-thread-bubble">아직 기록된 메시지가 없습니다.</div>
                      </div>
                    </article>
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              <form
                className="session-sidebar-input"
                onSubmit={activeTab === "Main" ? handleMainSubmit : handleChatSubmit}
              >
                <input
                  value={activeTab === "Main" ? mainMessage : chatMessage}
                  onChange={(event) =>
                    activeTab === "Main" ? setMainMessage(event.target.value) : setChatMessage(event.target.value)
                  }
                  placeholder={activeTab === "Main" ? "행동을 선언하거나 상황을 입력하세요..." : "채팅을 입력하세요..."}
                />
                <button type="submit" disabled={busy}>
                  전송
                </button>
              </form>
            </>
          ) : null}

          {activeTab === "Info" ? (
            <div className="session-info-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Scenario info</span>
                  <h2>{activeScenario?.scenario.title ?? "시나리오가 없습니다"}</h2>
                </div>
              </div>
              <textarea
                value={infoText || activeScenario?.scenario.description || ""}
                onChange={(event) => setInfoText(event.target.value)}
              />
            </div>
          ) : null}

          {activeTab === "Control" ? (
            <div className="session-control-panel">
              <article className="scenario-node-panel">
                <span className="eyebrow">씬 설명</span>
                <strong>{currentNode?.title ?? activeScenario?.scenario.title ?? "진행 중인 장면"}</strong>
                <p>{currentNode?.sceneText ?? "현재 장면 설명이 아직 없습니다."}</p>
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">Actions</span>
                {currentNode?.checkOptions.length ? (
                  <ul className="scenario-node-list">
                    {currentNode.checkOptions.map((option, index) => {
                      const label = getNodeLabel(option) ?? `Check ${index + 1}`;
                      return (
                        <li key={`${label}-${index}`}>
                          <strong>{label}</strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>설정된 액션이 없습니다.</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">Clues</span>
                {currentNode?.publicClues.length ? (
                  <ul className="scenario-node-list">
                    {currentNode.publicClues.map((clue) => (
                      <li key={clue.id}>
                        <strong>{clue.title}</strong>
                        <span>{clue.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>현재 씬에 공개 단서가 없습니다.</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">Discovered clues</span>
                {revealedClues.length ? (
                  <ul className="scenario-node-list">
                    {revealedClues.map((clue) => (
                      <li key={clue.id}>
                        <strong>{clue.title}</strong>
                        <span>{clue.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>발견한 단서가 아직 없습니다.</p>
                )}
              </article>
            </div>
          ) : null}

          {activeTab === "Settings" ? (
            <div className="session-settings-panel">
              <span className="eyebrow">세션 룸</span>
              {!isRecruiting ? (
                <div className="session-settings-room">
                  <strong>{session?.title ?? "활성 세션이 없습니다"}</strong>
                  <div className="session-settings-invite">
                    <span>초대 코드</span>
                    <strong>{session?.inviteCode ?? "------"}</strong>
                  </div>
                  <button type="button" className="ghost" onClick={onBackToLobby}>
                    Lobby
                  </button>
                  <button type="button" className="danger-button" onClick={onLeaveSession}>
                    Leave
                  </button>
                </div>
              ) : null}
              <dl className="session-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{session?.status ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Phase</dt>
                  <dd>{snapshot?.state.phase ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd>{session?.visibility ?? "unknown"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </aside>

      {isGameStarting ? (
        <div className="modal-backdrop session-start-loading" role="dialog" aria-modal="true">
          <div className="modal-card session-start-loading-card">
            <div className="session-start-spinner" aria-hidden="true" />
            <strong>게임 화면으로 이동하는 중입니다</strong>
            <p>정보를 불러오는 중입니다.</p>
          </div>
        </div>
      ) : null}

      {/* 캐릭터가 없는 플레이어가 빠르게 캐릭터를 만드는 모달입니다. */}
      {isCreateModalOpen ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleCreateCharacter}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">캐릭터 생성</span>
                <h2>새 캐릭터 생성</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setCreateModalOpen(false)}>
                Close
              </button>
            </div>

            <label>
              Name
              <input
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>

            <label>
              Ancestry
              <input
                value={formState.ancestry}
                onChange={(event) => setFormState((current) => ({ ...current, ancestry: event.target.value }))}
                required
              />
            </label>

            <label>
              Class
              <input
                value={formState.className}
                onChange={(event) => setFormState((current) => ({ ...current, className: event.target.value }))}
                required
              />
            </label>

            <label>
              Max HP
              <input
                type="number"
                min={1}
                value={formState.maxHp}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, maxHp: Number(event.target.value) || 1 }))
                }
                required
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
