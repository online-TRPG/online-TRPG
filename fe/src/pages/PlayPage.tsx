/*
 * PlayPage
 * ??븷: ?ㅼ젣 ?몄뀡 ?뚮젅???붾㈃?낅땲?? 罹먮┃???좏깮, 以鍮??곹깭, 梨꾪똿/濡쒓렇, ?꾩옱 ?쒕굹由ъ삤 ?몃뱶, VTT 留듭쓣 ?쒖떆?⑸땲??
 * ?쎈뒗 ?쒖꽌:
 * 1) ?곷떒 ?ы띁: 濡쒓렇 ?ㅼ퐫?? ?꾨컮?/?대옒???쒖떆 ?대?吏, ?몃뱶 ?쇰꺼 異붿텧
 * 2) PlayPageProps: ?몄뀡 ?ㅻ깄?룰낵 ?뚯폆 ?곹깭, ?뚮젅???≪뀡 肄쒕갚
 * 3) 而댄룷?뚰듃 state/ref: ?? 梨꾪똿 ?낅젰, 罹먮┃???앹꽦 ?? ?쒕굹由ъ삤/留?濡쒕뵫 ?곹깭, 留??????
 * 4) useEffect: ?쒕쾭 ?좏깮 罹먮┃???숆린?? ?쒕굹由ъ삤/留?議고쉶, 濡쒓렇 ?ㅽ겕濡? ?낅젰 珥덇린??
 * 5) handler: 罹먮┃???앹꽦, 梨꾪똿/?≪뀡 ?꾩넚, VTT 留?蹂寃????
 * 6) JSX: 紐⑥쭛 ?湲??붾㈃, ?뚮젅???? VTT 留? ?ъ씠???⑤꼸, 罹먮┃???앹꽦 紐⑤떖
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

// ?뚮젅???붾㈃ ?곷떒 ???대쫫?낅땲?? 媛???? 濡쒓렇/梨꾪똿/?뺣낫/?ㅼ젙??援щ텇?⑸땲??
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

// 遺紐?而댄룷?뚰듃媛 ???섏씠吏??二쇱엯?섎뒗 ?곗씠?곗? ?대깽??肄쒕갚?낅땲??
interface PlayPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  characters: PersistentCharacter[];
  logs: LogEntry[];
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void;
  onSelectCharacter: (characterId: string | null) => void;
  onSetReady: (isReady: boolean) => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
  onBackToLobby: () => void;
  onAction: (label: string) => void;
}

// 罹먮┃???앹꽦 紐⑤떖??泥섏쓬 ?????곕뒗 湲곕낯 ?낅젰媛믪엯?덈떎.
const defaultCharacter = {
  name: "",
  ancestry: "Human",
  className: "Wizard",
  maxHp: 12,
};

const visibleCharacterSlots = 3;

// 濡쒓렇 硫붿떆吏 ?욎쓽 [MAIN]/[CHAT] ?ㅼ퐫???쒓렇瑜??붾㈃ ?쒖떆?⑹쑝濡??쒓굅?⑸땲??
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

// 罹먮┃?곌? 吏곸젒 ?낅줈?쒗븳 ?대?吏, ?꾨━???대?吏, 吏곸뾽 湲곕낯 ?대?吏 ?쒖꽌濡??쒖떆 ?대?吏瑜?怨좊쫭?덈떎.
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

// ?섏씠吏 而댄룷?뚰듃 蹂몄껜?낅땲?? ?꾩뿉???곹깭/?대깽?몃? 留뚮뱾怨??꾨옒 JSX?먯꽌 ?붾㈃??洹몃┰?덈떎.
export function PlayPage({
  user,
  snapshot,
  characters,
  logs,
  socketConnected,
  busy,
  error,
  onCreateCharacter,
  onSelectCharacter,
  onSetReady,
  onStartSession,
  onLeaveSession,
  onBackToLobby,
  onAction,
}: PlayPageProps) {
  // UI ?곹깭: ?꾩옱 ?? 紐⑤떖 ?대┝, ?낅젰李?媛? 濡쒖뺄 罹먮┃???좏깮媛믪엯?덈떎.
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
  // ?꾩옱 ?몄뀡???뚮젅?댁뼱???쒕굹由ъ삤 ?몃뱶? VTT 留?濡쒕뵫 ?곹깭?낅땲??
  const [playerScenario, setPlayerScenario] = useState<PlayerScenarioView | null>(null);
  const [vttMap, setVttMap] = useState<VttMapStateDto | null>(null);
  const [scenarioLoadError, setScenarioLoadError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  // 濡쒓렇 ?먮룞 ?ㅽ겕濡ㅺ낵 留?????먮? 愿由ы븯??ref?낅땲?? ?뚮뜑留??놁씠 理쒖떊 媛믪쓣 ?좎??⑸땲??
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

  // ?쒕쾭 ?ㅻ깄?룹뿉???꾩옱 ?몄뀡/李멸????좏깮 罹먮┃??沅뚰븳 ?곹깭瑜?怨꾩궛?⑸땲??
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

  // ?쒕쾭媛 ?뚮젮以 ?좏깮 罹먮┃?곌? 諛붾뚮㈃ 濡쒖뺄 ?좏깮 ?곹깭??留욎땅?덈떎.
  useEffect(() => {
    setLocalSelectedCharacterId(serverSelectedCharacterId);
  }, [serverSelectedCharacterId]);

  // 以鍮??곹깭媛 ?由щ㈃ ?곹깭 ?⑤꼸???ㅼ떆 ?쇱퀜 ?ъ슜?먭? ?뺤씤?????덇쾶 ?⑸땲??
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

  // ?몄뀡???녾굅??諛붾뚮㈃ ?쒕굹由ъ삤/留??곹깭瑜?珥덇린?뷀븯怨??뚮젅?댁뼱???쒕굹由ъ삤瑜??ㅼ떆 遺덈윭?듬땲??
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
          setScenarioLoadError(caught instanceof Error ? caught.message : "?쒕굹由ъ삤瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
          setMapLoadError(caught instanceof Error ? caught.message : "留듭쓣 遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
    () =>
      [...scopedLogs].reverse().map((log) => {
        const normalizedMessage = stripScopePrefix(log.message);
        const isMine = log.title === user.displayName;
        const rowClass = log.kind === "system" ? "notice" : isMine ? "outgoing" : "incoming";

        return {
          ...log,
          message: normalizedMessage,
          rowClass,
          senderLabel: getLogSenderLabel(log.title, rowClass),
        };
      }),
    [scopedLogs, user.displayName],
  );

  const displayedParticipants = useMemo(() => {
    const minSlots = 4;
    const filled = [...participants];
    while (filled.length < minSlots) {
      filled.push(null as never);
    }
    return filled;
  }, [participants]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeTab, renderedRows.length]);

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

  return (
    <main className="session-prep-layout session-prep-layout-tight">
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
                  aria-label="?댁쟾 罹먮┃??蹂닿린"
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
                          <span>??罹먮┃?곕? 留뚮뱺 ?????몄뀡?먯꽌 諛붾줈 ?ъ슜?????덉뒿?덈떎.</span>
                        </button>
                      );
                    }

                    const { character } = item;
                    const cardImage = getCharacterImage(character);
                    const disabledLabel = !character.isSelectable
                      ? "사용 중"
                      : readyLocked && !character.isSelected
                        ? "READY 怨좎젙"
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
                  aria-label="?ㅼ쓬 罹먮┃??蹂닿린"
                >
                  {">"}
                </button>
              </div>

              <section className="character-selection-detail">
                <div className="character-selection-detail-header">
                  <span className="eyebrow">?좏깮 罹먮┃???뺣낫</span>
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
                      {selectedCharacter.bio?.trim() || "?꾩쭅 ?깅줉??罹먮┃???뚭컻媛 ?놁뒿?덈떎."}
                    </p>
                  </div>
                ) : (
                  <p className="character-selection-detail-empty">
                    罹먮┃?곕? ?좏깮?섎㈃ ?λ젰移섏? ?뚭컻瑜??ш린?먯꽌 諛붾줈 ?뺤씤?????덉뒿?덈떎.
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
                  <h1>硫붿씤?붾㈃</h1>
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
              <div className="session-log-stack">
                {renderedRows.length ? (
                  renderedRows.map((log) => (
                    <article key={log.id} className={`chat-thread-row ${log.rowClass}`}>
                      {log.rowClass === "incoming" ? (
                        <div className="chat-thread-avatar">{getAvatarLabel(log.title, user.displayName)}</div>
                      ) : null}
                      <div className="chat-thread-stack">
                        <span className={`chat-thread-sender ${log.rowClass}`}>{log.senderLabel}</span>
                        <div className="chat-thread-bubble">{log.message}</div>
                        {log.rowClass !== "notice" ? <span className="chat-thread-time">{log.time}</span> : null}
                      </div>
                      {log.rowClass === "outgoing" ? (
                        <div className="chat-thread-avatar">{getAvatarLabel(log.title, user.displayName)}</div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <article className="chat-thread-row notice">
                    <div className="chat-thread-stack">
                      <span className="chat-thread-sender notice">?몄뀡 濡쒓렇</span>
                      <div className="chat-thread-bubble">?꾩쭅 湲곕줉??硫붿떆吏媛 ?놁뒿?덈떎.</div>
                    </div>
                  </article>
                )}
                <div ref={logEndRef} />
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
                  placeholder={activeTab === "Main" ? "?됰룞???좎뼵?섍굅???곹솴???낅젰?섏꽭??.." : "梨꾪똿???낅젰?섏꽭??.."}
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
                  <p>?ㅼ젙???≪뀡???놁뒿?덈떎.</p>
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
                  <p>?꾩옱 ?ъ뿉 怨듦컻 ?⑥꽌媛 ?놁뒿?덈떎.</p>
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
                  <p>諛쒓껄???⑥꽌媛 ?꾩쭅 ?놁뒿?덈떎.</p>
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
            <strong>寃뚯엫 ?붾㈃?쇰줈 ?대룞?섎뒗 以묒엯?덈떎</strong>
            <p>?뺣낫瑜?遺덈윭?ㅻ뒗 以묒엯?덈떎.</p>
          </div>
        </div>
      ) : null}

      {/* 罹먮┃?곌? ?녿뒗 ?뚮젅?댁뼱媛 鍮좊Ⅴ寃?罹먮┃?곕? 留뚮뱶??紐⑤떖?낅땲?? */}
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
