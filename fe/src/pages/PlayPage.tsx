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
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { VttMapStateDto } from "@trpg/shared-types";
import defaultArcherImage from "../assets/images/Profile_Default_Archer.webp";
import defaultRogueImage from "../assets/images/Profile_Default_Rouge.webp";
import defaultWarriorImage from "../assets/images/Profile_Default_Warrior.webp";
import defaultWizardImage from "../assets/images/Profile_Default_Wizard.webp";
import { BattleMap } from "../components/BattleMap";
import boxBulletinNarrowFrame from "../components/Box_Bulletin_Narrow_Frame.webp";
import boxBulletinNarrowPlanks from "../components/Box_Bulletin_Narrow_Planks.webp";
import { Icon } from "../components/Icon";
import profileBorderCharacter from "../components/Profile_Border_Character.webp";
import { getClassLabel } from "../data/class-options";
import type { CharacterPayload } from "../hooks/useSession";
import { getPlayerScenario, getVttMap, updateVttMap } from "../services/api";
import type { LogEntry, PersistentCharacter, PlayerScenarioView, SessionSnapshot, StoredUser } from "../types/session";
import "./CharacterPage.css";
import "./PlayPage.css";

// 플레이 화면 상단 탭 이름입니다. 각 탭은 로그/채팅/정보/설정을 구분합니다.
const sessionTabs = ["Main", "Chat", "Info", "Settings"] as const;
// 캐릭터 프리셋 ID를 실제 이미지 파일로 바꾸는 매핑입니다.
const avatarPresetImageMap = new Map([
  ["preset_wizard", defaultWizardImage],
  ["preset_archer", defaultArcherImage],
  ["preset_rogue", defaultRogueImage],
  ["preset_warrior", defaultWarriorImage],
]);

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
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

// 캐릭터 생성 모달을 처음 열 때 쓰는 기본 입력값입니다.
const defaultCharacter = {
  name: "",
  ancestry: "Human",
  className: "Wizard",
  maxHp: 12,
};

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

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
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
  // UI 상태: 현재 탭, 모달 열림, 입력창 값, 로컬 캐릭터 선택값입니다.
  const [activeTab, setActiveTab] = useState<(typeof sessionTabs)[number]>("Main");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [mainMessage, setMainMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [infoText, setInfoText] = useState("");
  const [formState, setFormState] = useState(defaultCharacter);
  const [localSelectedCharacterId, setLocalSelectedCharacterId] = useState<string | null>(null);
  const [isStatusMinimized, setStatusMinimized] = useState(false);
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
  const canShowCharacterSelection = Boolean(session && isRecruiting);
  const canStartSession = Boolean(isHost && isRecruiting && allPlayersReady && participants.length > 0);
  const activeScenario =
    snapshot?.sessionScenarios.find((item) => item.status === "ACTIVE") ?? snapshot?.sessionScenarios[0];
  const currentNode = playerScenario?.currentNode ?? null;
  const revealedClues = playerScenario?.revealedClues ?? [];
  const snapshotVttMap = snapshot?.state.flags?.vttMap;

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
        };
      }),
    [scopedLogs, user.displayName],
  );

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
        <div className="session-stage-canvas">
          <section className="session-room-overlay">
            <div className="session-room-overlay-row">
              <div className="session-room-overlay-title">
                <span className="eyebrow">Session room</span>
                <strong>{session?.title ?? "No active session"}</strong>
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
                  aria-label="Copy invite code"
                >
                  <Icon name="copy" />
                </button>
              </div>

              <div className="session-room-overlay-actions">
                <button type="button" className="ghost" onClick={onBackToLobby}>
                  Lobby
                </button>
                <button type="button" className="ghost" onClick={onLeaveSession}>
                  Leave
                </button>
              </div>
            </div>
          </section>

          {canShowCharacterSelection ? (
            <section
              className="character-selection-board player-ready-board session-character-board"
              style={{ backgroundImage: `url(${boxBulletinNarrowPlanks})` }}
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Character selection</span>
                  <h2>Choose your character</h2>
                </div>
                <button
                  type="button"
                  className={`ready-toggle-button${myParticipant?.isReady ? " active" : ""}`}
                  disabled={busy || !selectedCharacter}
                  onClick={() => onSetReady(!myParticipant?.isReady)}
                >
                  {myParticipant?.isReady ? "READY" : "Set READY"}
                </button>
              </div>

              <div className="character-selection-grid">
                <button
                  type="button"
                  className="character-selection-create"
                  onClick={() => setCreateModalOpen(true)}
                  disabled={readyLocked}
                >
                  <Icon name="plus" />
                  <strong>Create character</strong>
                  <span>Create a new character and use it in this session.</span>
                </button>

                {joinableCharacters.map((character) => {
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
              <div
                className="session-character-board-frame"
                style={{ backgroundImage: `url(${boxBulletinNarrowFrame})` }}
                aria-hidden="true"
              />
            </section>
          ) : null}

          {session && !isRecruiting ? (
            <section className="scenario-node-board">
              <div className="scenario-node-header">
                <div>
                  <span className="eyebrow">Current scene</span>
                  <h1>{currentNode?.title ?? activeScenario?.scenario.title ?? "Scenario scene"}</h1>
                </div>
                <span className="status-chip">{currentNode?.nodeType ?? snapshot?.state.phase ?? session.status}</span>
              </div>

              {scenarioLoadError ? (
                <p className="panel-error">{scenarioLoadError}</p>
              ) : currentNode ? (
                <>
                  {vttMap ? (
                    <BattleMap
                      map={vttMap}
                      characters={sessionCharacters}
                      isHost={isHost}
                      currentUserId={user.id}
                      onChange={handleMapChange}
                    />
                  ) : null}
                  {mapLoadError ? <p className="panel-error">{mapLoadError}</p> : null}
                  {currentNode.imageUrl ? (
                    <img
                      className="scenario-node-visual"
                      src={currentNode.imageUrl}
                      alt={`${currentNode.title} visual`}
                    />
                  ) : null}
                  <p className="scenario-node-text">{currentNode.sceneText}</p>

                  <div className="scenario-node-grid">
                    <article className="scenario-node-panel">
                      <span className="eyebrow">Actions</span>
                      {currentNode.checkOptions.length ? (
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
                        <p>No checks defined for this scene.</p>
                      )}
                    </article>

                    <article className="scenario-node-panel">
                      <span className="eyebrow">Clues</span>
                      {currentNode.publicClues.length ? (
                        <ul className="scenario-node-list">
                          {currentNode.publicClues.map((clue) => (
                            <li key={clue.id}>
                              <strong>{clue.title}</strong>
                              <span>{clue.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No clues discovered for this scene.</p>
                      )}
                    </article>
                  </div>

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
                      <p>No clues discovered yet.</p>
                    )}
                  </article>
                </>
              ) : (
                <article className="scenario-node-panel">
                  <span className="eyebrow">Loading</span>
                  <p>Scenario data is loading, or the current node is not included in the selected scenario.</p>
                </article>
              )}
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
          {participants.length ? (
            participants.map((participant, index) => {
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
                          ? "No character selected"
                          : "Waiting for character"}
                    </span>
                  </div>
                  <div className={`participant-state${participant.isReady ? " ready" : ""}`}>{stateLabel}</div>
                  <div className="participant-index">{index + 1}</div>
                </article>
              );
            })
          ) : (
            <article className="participant-strip-card empty">
              <strong>No participants in this session.</strong>
              <span>Invite players or return to the lobby to create a new room.</span>
            </article>
          )}
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>

      <aside className="session-sidebar">
        <div className="session-sidebar-tabs">
          {sessionTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="session-sidebar-panel">
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
                        <div className="chat-thread-bubble">{log.message}</div>
                        {log.rowClass !== "notice" ? <span className="chat-thread-time">{log.time}</span> : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="chat-thread-row notice">
                    <div className="chat-thread-bubble">No messages yet.</div>
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
                  placeholder={activeTab === "Main" ? "Send a main action" : "Send a chat message"}
                />
                <button type="submit" disabled={busy}>
                  Send
                </button>
              </form>
            </>
          ) : null}

          {activeTab === "Info" ? (
            <div className="session-info-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Scenario info</span>
                  <h2>{activeScenario?.scenario.title ?? "No scenario"}</h2>
                </div>
              </div>
              <textarea
                value={infoText || activeScenario?.scenario.description || ""}
                onChange={(event) => setInfoText(event.target.value)}
              />
            </div>
          ) : null}

          {activeTab === "Settings" ? (
            <div className="session-settings-panel">
              <span className="eyebrow">Room settings</span>
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

      {/* 캐릭터가 없는 플레이어가 빠르게 캐릭터를 만드는 모달입니다. */}
      {isCreateModalOpen ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleCreateCharacter}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">Character creator</span>
                <h2>Create a new character</h2>
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
