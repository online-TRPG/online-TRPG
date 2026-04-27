import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { CharacterPayload } from "../hooks/useSession";
import type { LogEntry, PersistentCharacter, SessionSnapshot, StoredUser } from "../types/session";

const sessionTabs = ["Main", "Chat", "Info", "Settings"] as const;

interface PlayPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  characters: PersistentCharacter[];
  logs: LogEntry[];
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void;
  onSelectCharacter: (characterId: string) => void;
  onSetReady: (isReady: boolean) => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
  onBackToLobby: () => void;
  onAction: (label: string) => void;
}

const defaultCharacter = {
  name: "",
  ancestry: "Human",
  className: "Wizard",
  maxHp: 12,
};

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
  const [activeTab, setActiveTab] = useState<(typeof sessionTabs)[number]>("Main");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [mainMessage, setMainMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [infoText, setInfoText] = useState(
    "세션 설명, 추가 룰, 세계관 메모를 적는 공간입니다. 현재는 임시 편집 상태이며, GM이 필요한 내용을 자유롭게 정리할 수 있습니다.",
  );
  const [formState, setFormState] = useState(defaultCharacter);
  const [isOverlayCollapsed, setOverlayCollapsed] = useState(false);
  const [localSelectedCharacterId, setLocalSelectedCharacterId] = useState<string | null>(null);
  const autoStartRef = useRef<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const session = snapshot?.session;
  const participants = snapshot?.participants ?? [];
  const myParticipant = participants.find((participant) => participant.userId === user.id) ?? null;
  const serverSelectedCharacterId = myParticipant?.characterId ?? null;
  const selectedCharacterId = localSelectedCharacterId;
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? null;
  const readyLocked = Boolean(myParticipant?.isReady);
  const allPlayersReady = participants.length > 0 && participants.every((participant) => participant.isReady);
  const isHumanGm = session?.gmMode === "HUMAN" && session.gmUserId === user.id;
  const isAiLeader =
    session?.gmMode === "AI" &&
    (session.captainUserId === user.id || session.hostUserId === user.id || session.ownerUserId === user.id);
  const showReadyCheck = isHumanGm;
  const showCharacterSelection = !isHumanGm;
  const canTriggerAutoStart = isHumanGm || isAiLeader;

  useEffect(() => {
    setLocalSelectedCharacterId(serverSelectedCharacterId);
  }, [serverSelectedCharacterId]);

  useEffect(() => {
    if (!session || session.status !== "lobby") {
      autoStartRef.current = null;
      return;
    }

    if (!canTriggerAutoStart || !allPlayersReady || busy) return;

    const startKey = `${session.id}:${participants.length}:${participants.map((item) => item.id).join(",")}`;
    if (autoStartRef.current === startKey) return;

    autoStartRef.current = startKey;
    onStartSession();
  }, [allPlayersReady, busy, canTriggerAutoStart, onStartSession, participants, session]);

  const joinableCharacters = useMemo(
    () =>
      characters.map((character) => ({
        ...character,
        isSelected: character.id === selectedCharacterId,
        isDisabled: readyLocked && character.id !== selectedCharacterId,
      })),
    [characters, readyLocked, selectedCharacterId],
  );

  const scopedLogs = useMemo(() => {
    if (activeTab === "Chat") {
      return logs.filter((log) => isChatScoped(log.message));
    }

    if (activeTab === "Main") {
      return logs.filter((log) => !isChatScoped(log.message));
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

  const stripParticipants = useMemo(() => {
    if (!session) return participants;

    if (session.gmMode === "AI") {
      const captainParticipant = participants.find((participant) => participant.userId === session.captainUserId);

      return [
        ...participants,
        {
          id: `ai-gm-${session.id}`,
          sessionId: session.id,
          userId: "ai-gm",
          characterId: captainParticipant?.characterId ?? null,
          sessionCharacterId: captainParticipant?.sessionCharacterId ?? null,
          role: "SPECTATOR" as const,
          connectionStatus: "ONLINE" as const,
          isReady: true,
          readyAt: new Date().toISOString(),
          joinedAt: session.createdAt,
          user: {
            id: "ai-gm",
            displayName: "AI GM",
            createdAt: session.createdAt,
          },
        },
      ];
    }

    if (!session.gmUserId) {
      return participants;
    }

    const gmAlreadyPresent = participants.some((participant) => participant.userId === session.gmUserId);
    if (gmAlreadyPresent) return participants;

    return [
      ...participants,
      {
        id: `gm-${session.gmUserId}`,
        sessionId: session.id,
        userId: session.gmUserId,
        characterId: null,
        sessionCharacterId: null,
        role: "SPECTATOR" as const,
        connectionStatus: "ONLINE" as const,
        isReady: false,
        readyAt: null,
        joinedAt: session.createdAt,
        user: {
          id: session.gmUserId,
          displayName: session.gmUserId === user.id ? user.displayName : "GM",
          createdAt: session.createdAt,
        },
      },
    ];
  }, [participants, session, user]);

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
    if (readyLocked || busy) return;

    if (selectedCharacterId === characterId) {
      setLocalSelectedCharacterId(null);
      return;
    }

    setLocalSelectedCharacterId(characterId);
    onSelectCharacter(characterId);
  }

  function getParticipantBadge(participantUserId: string): string | null {
    if (!session) return null;
    if (session.gmMode === "HUMAN" && session.gmUserId === participantUserId) return "GM";
    if (session.gmMode === "AI" && session.captainUserId === participantUserId) return "반장";
    if (participantUserId === "ai-gm") return "AI GM";
    return null;
  }

  return (
    <main className="session-prep-layout session-prep-layout-tight">
      <section className="session-prep-stage">
        <div className="session-stage-canvas">
          <section
            className={`session-room-overlay${isOverlayCollapsed ? " collapsed" : ""}`}
            onClick={isOverlayCollapsed ? () => setOverlayCollapsed(false) : undefined}
            role={isOverlayCollapsed ? "button" : undefined}
            tabIndex={isOverlayCollapsed ? 0 : undefined}
          >
            {isOverlayCollapsed ? (
              <div className="session-room-overlay-collapsed">
                <strong>{session?.title ?? "세션 준비실"}</strong>
              </div>
            ) : (
              <div className="session-room-overlay-row">
                <div className="session-room-overlay-title">
                  <span className="eyebrow">Session ready room</span>
                  <strong>{session?.title ?? "세션을 불러오는 중입니다."}</strong>
                </div>

                <span className={socketConnected ? "status-pill online" : "status-pill"}>
                  {socketConnected ? "Realtime connected" : "Realtime standby"}
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
                  <button type="button" className="ghost" onClick={() => setOverlayCollapsed(true)}>
                    최소화
                  </button>
                  <button type="button" className="ghost" onClick={onBackToLobby}>
                    나가기
                  </button>
                </div>
              </div>
            )}
          </section>

          {showReadyCheck ? (
            <section className="session-ready-card gm-ready-card session-main-ready">
              <span className="eyebrow">Ready check</span>
              <h2>모든 플레이어가 준비를 끝낼 때까지 기다려 주세요.</h2>
              <p>
                {allPlayersReady
                  ? "모든 플레이어가 READY 상태입니다. 잠시 후 세션이 자동으로 시작됩니다."
                  : "모든 플레이어가 READY 상태가 되면 세션이 자동으로 시작됩니다."}
              </p>
            </section>
          ) : null}

          {showCharacterSelection ? (
            <section className={`character-selection-board player-ready-board${isAiLeader ? " leader-visible" : ""}`}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Character selection</span>
                  <h2>캐릭터 선택</h2>
                </div>
                <button
                  type="button"
                  className={`ready-toggle-button${myParticipant?.isReady ? " active" : ""}`}
                  disabled={busy || !selectedCharacter}
                  onClick={() => onSetReady(!myParticipant?.isReady)}
                >
                  {myParticipant?.isReady ? "READY" : "READY 하기"}
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
                  <strong>캐릭터 추가 생성</strong>
                  <span>새 캐릭터를 만들고 바로 이 세션에 배치할 수 있습니다.</span>
                </button>

                {joinableCharacters.map((character) => (
                  <button
                    type="button"
                    key={character.id}
                    className={`character-selection-card${character.isSelected ? " active" : ""}`}
                    disabled={busy || character.isDisabled}
                    onClick={() => handleCharacterClick(character.id)}
                  >
                    <div className="character-selection-head">
                      <div className="avatar avatar-large">{character.name.slice(0, 1)}</div>
                      <div>
                        <strong>{character.name}</strong>
                        <span>
                          {character.ancestry} · {character.className}
                        </span>
                      </div>
                    </div>
                    <dl className="character-selection-meta">
                      <div>
                        <dt>LV</dt>
                        <dd>{character.level}</dd>
                      </div>
                      <div>
                        <dt>HP</dt>
                        <dd>{character.maxHp}</dd>
                      </div>
                      <div>
                        <dt>AC</dt>
                        <dd>{character.armorClass}</dd>
                      </div>
                      <div>
                        <dt>SPD</dt>
                        <dd>{character.speed}</dd>
                      </div>
                    </dl>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <section className="participant-strip participant-strip-four-up">
          {stripParticipants.length ? (
            stripParticipants.map((participant, index) => {
              const linkedCharacter =
                participant.userId === user.id && selectedCharacterId === null
                  ? null
                  : snapshot?.characters.find((character) => character.participantId === participant.id) ?? null;
              const stateLabel = participant.isReady
                ? "READY"
                : participant.userId === user.id
                  ? "선택 중..."
                  : "대기 중";
              const badgeLabel = getParticipantBadge(participant.userId);

              return (
                <article key={participant.id} className="participant-strip-card">
                  {badgeLabel ? <div className="participant-special-badge">{badgeLabel}</div> : null}
                  <div className="participant-avatar tone-1">
                    {(linkedCharacter?.name ?? participant.user.displayName).slice(0, 1)}
                  </div>
                  <div className="participant-card-body">
                    <strong>{participant.user.displayName}</strong>
                    <span>
                      {linkedCharacter
                        ? `${linkedCharacter.name} · ${linkedCharacter.className}`
                        : badgeLabel === "GM"
                          ? "세션 진행 담당"
                          : "캐릭터 미선택"}
                    </span>
                  </div>
                  <div className={`participant-state${participant.isReady ? " ready" : ""}`}>{stateLabel}</div>
                  <div className="participant-index">{index + 1}</div>
                </article>
              );
            })
          ) : (
            <article className="participant-strip-card empty">
              <strong>세션에 표시할 참가자가 없습니다.</strong>
              <span>세션에 참가하면 이 영역에서 현재 참가 상태를 확인할 수 있습니다.</span>
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
                      </div>
                      {log.rowClass !== "notice" ? <span className="chat-thread-time">{log.time}</span> : null}
                    </article>
                  ))
                ) : (
                  <article className="chat-thread-row notice">
                    <div className="chat-thread-bubble">
                      {activeTab === "Main"
                        ? "아직 기록된 메인 로그가 없습니다."
                        : "아직 채팅 메시지가 없습니다."}
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
                  placeholder={
                    activeTab === "Main"
                      ? "메인 로그나 /roll, /hint 명령을 입력하세요"
                      : "세션 채팅 메시지를 입력하세요"
                  }
                />
                <button type="submit" disabled={busy}>
                  전송
                </button>
              </form>
            </>
          ) : null}

          {activeTab === "Info" ? (
            <div className="session-info-panel">
              <textarea value={infoText} onChange={(event) => setInfoText(event.target.value)} />
              <p>세션 설명과 추가 규칙을 정리하는 공간입니다. 추후 서버 저장이 연결되면 이 내용을 공유 메모로 사용할 수 있습니다.</p>
            </div>
          ) : null}

          {activeTab === "Settings" ? (
            <div className="session-settings-panel">
              <strong>Settings</strong>
              <p>추가 세션 설정은 이후 단계에서 확장됩니다. 현재는 세션에서 나가기만 사용할 수 있습니다.</p>
              <button type="button" className="danger-button" disabled={busy} onClick={onLeaveSession}>
                세션에서 나가기
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Create character</span>
                <h2>새 캐릭터 생성</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setCreateModalOpen(false)}>
                닫기
              </button>
            </div>

            <form className="modal-form" onSubmit={handleCreateCharacter}>
              <label htmlFor="session-character-name">이름</label>
              <input
                id="session-character-name"
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                maxLength={50}
                required
              />

              <div className="field-row">
                <div>
                  <label htmlFor="session-character-ancestry">종족</label>
                  <input
                    id="session-character-ancestry"
                    value={formState.ancestry}
                    onChange={(event) => setFormState((current) => ({ ...current, ancestry: event.target.value }))}
                    maxLength={50}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="session-character-class">클래스</label>
                  <input
                    id="session-character-class"
                    value={formState.className}
                    onChange={(event) => setFormState((current) => ({ ...current, className: event.target.value }))}
                    maxLength={50}
                    required
                  />
                </div>
              </div>

              <label htmlFor="session-character-hp">최대 HP</label>
              <input
                id="session-character-hp"
                type="number"
                min={1}
                value={formState.maxHp}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, maxHp: Number(event.target.value) || 1 }))
                }
              />

              <button type="submit" className="primary" disabled={busy}>
                생성하고 선택
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
