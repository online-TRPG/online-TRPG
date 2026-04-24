import { FormEvent, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  API_BASE_URL,
  WS_BASE_URL,
  createGuest,
  createPersistentCharacter,
  createSession,
  joinSessionById,
  joinSessionByInvite,
  leaveSession,
  listMyCharacters,
  listMySessions,
  listScenarios,
  listSessions,
  resumeSession,
  selectCharacterForSession,
} from "../services/api";
import { connectSessionSocket } from "../services/realtime";
import {
  clearStoredSnapshot,
  clearStoredUser,
  loadStoredSnapshot,
  loadStoredUser,
  saveStoredSnapshot,
  saveStoredUser,
} from "../services/storage";
import type {
  Character,
  LogEntry,
  Participant,
  PersistentCharacter,
  Scenario,
  SessionListItem,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

type NavView = "main" | "characters" | "rulebook" | "settings" | "profile" | "session";
type SessionGmMode = "ai" | "human";
type ModalType = "create-session" | "join-invite" | null;

const SESSION_STATUS_LOBBY = "lobby";
const GM_MODE_AI: SessionGmMode = "ai";
const GM_MODE_HUMAN: SessionGmMode = "human";

const navItems: Array<{ id: Exclude<NavView, "session">; label: string }> = [
  { id: "main", label: "메인" },
  { id: "characters", label: "캐릭터" },
  { id: "rulebook", label: "룰북" },
  { id: "settings", label: "설정" },
  { id: "profile", label: "프로필" },
];

const testLoginNames = ["Amber Fox", "Cinder Vale", "Dawn Pike", "River Thorn", "Sable Rune"];

function nowTime(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function makeLog(kind: LogEntry["kind"], title: string, message: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    kind,
    title,
    message,
    time: nowTime(),
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function generateTestName(): string {
  const base = testLoginNames[Math.floor(Math.random() * testLoginNames.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base} ${suffix}`;
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "logo":
      return (
        <svg {...common}>
          <path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z" />
          <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "enter":
      return (
        <svg {...common}>
          <path d="M9 18l6-6-6-6" />
          <path d="M15 12H3" />
          <path d="M21 4v16" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0 2 5.3" />
          <path d="M20 4v7h-7" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M21 4v16" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function LoginView({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string | null;
  onLogin: () => void;
}) {
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="brand-mark">
          <Icon name="logo" />
        </div>
        <p className="login-eyebrow">TRPG Session Console</p>
        <h1>임시 게스트 로그인</h1>
        <p className="login-copy">
          버튼을 누르면 백엔드 `POST /users/guest` 로 테스트 유저를 만들고 `x-user-id` 기준 계정을
          로컬에 저장합니다.
        </p>

        <div className="login-card">
          <button type="button" className="primary" disabled={busy} onClick={onLogin}>
            <Icon name="enter" />
            {busy ? "로그인 처리 중..." : "테스트 로그인"}
          </button>
          <div className="login-hint">
            <span>생성 예시</span>
            <strong>{generateTestName()}</strong>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

function TopNavigation({
  activeView,
  user,
  socketConnected,
  onNavigate,
  onLogout,
}: {
  activeView: NavView;
  user: StoredUser;
  socketConnected: boolean;
  onNavigate: (view: Exclude<NavView, "session">) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Icon name="logo" />
          <div>
            <strong>TRPG</strong>
            <span>session dashboard</span>
          </div>
        </div>

        <nav className="top-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "active" : ""}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="topbar-right">
        <span className={socketConnected ? "status-pill online" : "status-pill"}>
          {socketConnected ? "Realtime connected" : "Realtime standby"}
        </span>

        <div className="profile-menu">
          <button type="button" className="profile-trigger" onClick={() => setOpen((current) => !current)}>
            <div className="avatar">{initials(user.displayName)}</div>
          </button>
          {open ? (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <strong>{user.displayName}</strong>
                <span>Temporary guest account</span>
              </div>
              <button type="button" className="profile-dropdown-action" onClick={onLogout}>
                <Icon name="logout" />
                로그아웃
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MainSidebar({
  currentSnapshot,
  joinableCount,
  mySessionCount,
  logs,
  onScrollTo,
}: {
  currentSnapshot: SessionSnapshot | null;
  joinableCount: number;
  mySessionCount: number;
  logs: LogEntry[];
  onScrollTo: (section: string) => void;
}) {
  return (
    <aside className="page-sidebar">
      <div className="page-sidebar-block">
        <span className="eyebrow">Sidebar</span>
        <h2>Main console</h2>
        <p>메인 대시보드의 핵심 섹션으로 바로 이동합니다.</p>
      </div>

      <nav className="section-nav" aria-label="Main page sections">
        <button type="button" onClick={() => onScrollTo("main-console")}>
          Main console
        </button>
        <button type="button" onClick={() => onScrollTo("current-room")}>
          Current room
        </button>
        <button type="button" onClick={() => onScrollTo("joinable-rooms")}>
          Joinable rooms
          <span>{joinableCount}</span>
        </button>
        <button type="button" onClick={() => onScrollTo("my-rooms")}>
          My rooms
          <span>{mySessionCount}</span>
        </button>
      </nav>

      <div className="sidebar-status-card">
        <span className="eyebrow">Current room</span>
        <strong>{currentSnapshot?.session.title ?? "세션 없음"}</strong>
        <p>{currentSnapshot ? currentSnapshot.session.inviteCode : "아직 연결된 방이 없습니다."}</p>
      </div>

      <div className="sidebar-log-dock">
        <LogPanel logs={logs} compact />
      </div>
    </aside>
  );
}

function SessionCard({
  item,
  actionLabel,
  onAction,
}: {
  item: SessionListItem;
  actionLabel: string;
  onAction: (sessionId: string) => void;
}) {
  return (
    <article className="session-card">
      <div className="session-card-top">
        <span className="status-chip">{item.session.gmMode.toUpperCase()} GM</span>
        <span className="status-chip muted">{item.session.status}</span>
      </div>
      <h3>{item.session.title}</h3>
      <p>{item.session.description || item.scenario.attribution || "설명이 아직 없습니다."}</p>
      <dl className="session-meta">
        <div>
          <dt>시나리오</dt>
          <dd>{item.scenario.title}</dd>
        </div>
        <div>
          <dt>참가</dt>
          <dd>
            {item.participantCount} / {item.session.maxParticipants}
          </dd>
        </div>
        <div>
          <dt>빈 자리</dt>
          <dd>{item.availableSlots}</dd>
        </div>
        <div>
          <dt>호스트</dt>
          <dd>{item.owner.displayName}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => onAction(item.session.id)}>
        <Icon name="enter" />
        {actionLabel}
      </button>
    </article>
  );
}

function SessionModal({
  type,
  busy,
  scenarios,
  onClose,
  onCreateSession,
  onJoinByInvite,
}: {
  type: ModalType;
  busy: boolean;
  scenarios: Scenario[];
  onClose: () => void;
  onCreateSession: (payload: {
    title: string;
    scenarioId?: string;
    gmMode: SessionGmMode;
    maxParticipants: number;
  }) => void;
  onJoinByInvite: (inviteCode: string) => void;
}) {
  const [sessionTitle, setSessionTitle] = useState("Crimson Wharf: Opening Scene");
  const [scenarioId, setScenarioId] = useState("");
  const [gmMode, setGmMode] = useState<SessionGmMode>(GM_MODE_AI);
  const [maxParticipants, setMaxParticipants] = useState("4");
  const [inviteCode, setInviteCode] = useState("");

  if (!type) {
    return null;
  }

  function submitCreateSession(event: FormEvent) {
    event.preventDefault();
    onCreateSession({
      title: sessionTitle,
      scenarioId: scenarioId || undefined,
      gmMode,
      maxParticipants: Number(maxParticipants) || 4,
    });
  }

  function submitJoinByInvite(event: FormEvent) {
    event.preventDefault();
    onJoinByInvite(inviteCode.trim().toUpperCase());
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{type === "create-session" ? "Create room" : "Join room"}</span>
            <h2>{type === "create-session" ? "새 방 생성" : "초대 코드 입장"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {type === "create-session" ? (
          <form className="modal-form" onSubmit={submitCreateSession}>
            <label htmlFor="modal-session-title">방 제목</label>
            <input
              id="modal-session-title"
              value={sessionTitle}
              onChange={(event) => setSessionTitle(event.target.value)}
              maxLength={100}
            />

            <label htmlFor="modal-session-scenario">시나리오</label>
            <select
              id="modal-session-scenario"
              value={scenarioId}
              onChange={(event) => setScenarioId(event.target.value)}
            >
              <option value="">기본 시나리오 사용</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </select>

            <div className="field-row">
              <div>
                <label htmlFor="modal-gm-mode">GM 모드</label>
                <select
                  id="modal-gm-mode"
                  value={gmMode}
                  onChange={(event) => setGmMode(event.target.value as SessionGmMode)}
                >
                  <option value={GM_MODE_AI}>AI GM</option>
                  <option value={GM_MODE_HUMAN}>HUMAN GM</option>
                </select>
              </div>
              <div>
                <label htmlFor="modal-max-participants">인원</label>
                <input
                  id="modal-max-participants"
                  value={maxParticipants}
                  onChange={(event) => setMaxParticipants(event.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <button type="submit" className="primary" disabled={busy}>
              <Icon name="plus" />
              방 생성
            </button>
          </form>
        ) : (
          <form className="modal-form" onSubmit={submitJoinByInvite}>
            <label htmlFor="modal-invite-code">Invite code</label>
            <input
              id="modal-invite-code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="ABC123"
              maxLength={12}
            />
            <button type="submit" disabled={busy}>
              <Icon name="enter" />
              초대 코드로 입장
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MainView({
  busy,
  error,
  currentSnapshot,
  joinableSessions,
  mySessions,
  myCharacters,
  logs,
  socketConnected,
  onOpenCreateModal,
  onOpenJoinModal,
  onJoinSession,
  onResumeSession,
}: {
  busy: boolean;
  error: string | null;
  currentSnapshot: SessionSnapshot | null;
  joinableSessions: SessionListItem[];
  mySessions: SessionListItem[];
  myCharacters: PersistentCharacter[];
  logs: LogEntry[];
  socketConnected: boolean;
  onOpenCreateModal: () => void;
  onOpenJoinModal: () => void;
  onJoinSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
}) {
  const mainRef = useRef<HTMLElement | null>(null);
  const currentRoomRef = useRef<HTMLElement | null>(null);
  const joinableRef = useRef<HTMLElement | null>(null);
  const myRoomsRef = useRef<HTMLElement | null>(null);

  const sectionRefs: Record<string, React.RefObject<HTMLElement | null>> = {
    "main-console": mainRef,
    "current-room": currentRoomRef,
    "joinable-rooms": joinableRef,
    "my-rooms": myRoomsRef,
  };

  function scrollToSection(section: string) {
    sectionRefs[section]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page-with-sidebar">
      <MainSidebar
        currentSnapshot={currentSnapshot}
        joinableCount={joinableSessions.length}
        mySessionCount={mySessions.length}
        logs={logs}
        onScrollTo={scrollToSection}
      />

      <section className="main-column">
        <section ref={mainRef} className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Main console</span>
            <h1>메인 대시보드</h1>
            <p>
              상단 네비게이션으로 주요 화면을 이동하고, 메인에서는 공개 세션 탐색과 세션 복귀에
              집중합니다. 방 생성과 초대 코드 입장은 모달에서 처리합니다.
            </p>
            <div className="hero-stats">
              <div>
                <strong>{joinableSessions.length}</strong>
                <span>Joinable sessions</span>
              </div>
              <div>
                <strong>{mySessions.length}</strong>
                <span>My rooms</span>
              </div>
              <div>
                <strong>{myCharacters.length}</strong>
                <span>Stored characters</span>
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="status-panel">
              <span className={socketConnected ? "status-pill online" : "status-pill"}>
                {socketConnected ? "Realtime on" : "Realtime idle"}
              </span>
              <strong>{currentSnapshot?.session.title ?? "현재 연결된 세션 없음"}</strong>
              <p>
                {currentSnapshot
                  ? `${currentSnapshot.participants.length}명 참가, ${currentSnapshot.characters.length}개 세션 캐릭터`
                  : "방을 생성하거나 입장하면 현재 세션 스냅샷이 유지됩니다."}
              </p>
            </div>

            <div className="quick-action-panel">
              <button type="button" className="primary" disabled={busy} onClick={onOpenCreateModal}>
                <Icon name="plus" />
                방 생성
              </button>
              <button type="button" disabled={busy} onClick={onOpenJoinModal}>
                <Icon name="enter" />
                초대 코드 입장
              </button>
            </div>
          </div>
        </section>

        <section ref={currentRoomRef} className="current-session-banner">
          <div>
            <span className="eyebrow">Current room</span>
            <h2>{currentSnapshot?.session.title ?? "현재 방이 없습니다."}</h2>
            <p>
              {currentSnapshot
                ? `초대 코드 ${currentSnapshot.session.inviteCode} · 상태 ${currentSnapshot.session.status} · phase ${currentSnapshot.state.phase}`
                : "세션을 만들거나 입장하면 여기서 현재 방 상태를 확인할 수 있습니다."}
            </p>
          </div>
          {currentSnapshot ? (
            <div className="banner-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => navigator.clipboard.writeText(currentSnapshot.session.inviteCode)}
              >
                <Icon name="copy" />
                코드 복사
              </button>
              <button type="button" onClick={() => onResumeSession(currentSnapshot.session.id)} disabled={busy}>
                <Icon name="refresh" />
                세션 열기
              </button>
            </div>
          ) : null}
        </section>

        <section ref={joinableRef} className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Joinable rooms</span>
              <h2>입장 가능한 방</h2>
            </div>
          </div>

          <div className="card-grid">
            {joinableSessions.length ? (
              joinableSessions.map((item) => (
                <SessionCard
                  key={item.session.id}
                  item={item}
                  actionLabel="방 입장"
                  onAction={onJoinSession}
                />
              ))
            ) : (
              <EmptyState
                title="입장 가능한 공개 세션이 없습니다."
                description="새 방을 만들거나 초대 코드로 세션에 입장해보세요."
              />
            )}
          </div>
        </section>

        <section ref={myRoomsRef} className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">My rooms</span>
              <h2>내 방</h2>
            </div>
          </div>

          <div className="card-grid">
            {mySessions.length ? (
              mySessions.map((item) => (
                <SessionCard
                  key={item.session.id}
                  item={item}
                  actionLabel="세션 열기"
                  onAction={onResumeSession}
                />
              ))
            ) : (
              <EmptyState
                title="아직 참가한 세션이 없습니다."
                description="세션을 생성하거나 목록에서 참가하면 여기에서 다시 열 수 있습니다."
              />
            )}
          </div>
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </div>
  );
}

function SessionParticipantStrip({
  participantSlots,
  gmMode,
}: {
  participantSlots: Array<{
    id: string;
    participant: Participant | null;
    participantCharacter: Character | null;
    isHost: boolean;
    isAiGm: boolean;
  }>;
  gmMode: SessionSnapshot["session"]["gmMode"];
}) {
  return (
    <>
      {participantSlots.map((slot, index) => {
        const roleLabel = slot.isAiGm
          ? "AI GM"
          : slot.isHost
            ? "Host"
            : slot.participant
              ? "Player"
              : "Open slot";
        const readyLabel = slot.isAiGm
          ? "ACTIVE"
          : slot.participant?.connectionStatus === "ONLINE"
            ? "READY"
            : slot.participant
              ? "WAITING"
              : "EMPTY";

        return (
          <article
            className={`session-participant-card ${!slot.participant && !slot.isAiGm ? "empty" : ""}`}
            key={slot.id}
          >
            <div className="session-profile-card">
              <div className="session-avatar-wrap">
                <div className={`avatar avatar-large ${slot.isAiGm ? "avatar-ai" : ""}`}>
                  {slot.isAiGm ? "AI" : slot.participant ? initials(slot.participant.user.displayName) : "--"}
                </div>
                <div className="session-avatar-badges">
                  {slot.isHost ? <span className="session-avatar-badge host" title="Host" /> : null}
                  {slot.isAiGm || (slot.isHost && gmMode === "HUMAN") ? (
                    <span className="session-avatar-badge gm" title="GM" />
                  ) : null}
                </div>
              </div>
              <div className="session-profile-copy">
                <strong>{slot.isAiGm ? "AI GM" : slot.participant?.user.displayName ?? `Slot ${index + 1}`}</strong>
                <span>{roleLabel}</span>
                <span>{slot.participantCharacter?.name ?? (slot.isAiGm ? "Narration channel" : "No character yet")}</span>
              </div>
            </div>

            <div className="session-ready-card">
              <span className="session-ready-label">Ready</span>
              <button
                type="button"
                className={`session-ready-button ${slot.isAiGm || slot.participant ? "active" : ""}`}
                disabled
              >
                {readyLabel}
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
}

function SessionChatSidebar({
  messages,
  chatDraft,
  onChatDraftChange,
}: {
  messages: Array<{
    id: string;
    sender: string;
    body: string;
    direction: "incoming" | "outgoing" | "notice";
    time: string;
  }>;
  chatDraft: string;
  onChatDraftChange: (value: string) => void;
}) {
  return (
    <div className="session-chat-body">
      <div className="session-chat-log">
        {messages.map((message) => (
          <div key={message.id} className={`chat-row ${message.direction}`}>
            {message.direction === "incoming" ? (
              <div className="chat-avatar">{message.sender.slice(0, 1).toUpperCase()}</div>
            ) : null}
            <div className="chat-stack">
              {message.direction !== "outgoing" ? <span className="chat-sender">{message.sender}</span> : null}
              <div className="chat-bubble">{message.body}</div>
            </div>
            <span className="chat-time">{message.time}</span>
          </div>
        ))}
      </div>

      <div className="session-chat-input">
        <input
          value={chatDraft}
          onChange={(event) => onChatDraftChange(event.target.value)}
          placeholder="Message input will be wired later."
        />
        <button type="button" disabled>
          Send
        </button>
      </div>
    </div>
  );
}

function SessionView({
  user,
  busy,
  snapshot,
  socketConnected,
  onLeaveSession,
}: {
  user: StoredUser;
  busy: boolean;
  snapshot: SessionSnapshot | null;
  socketConnected: boolean;
  onLeaveSession: (sessionId: string) => void;
}) {
  if (!snapshot) {
    return (
      <div className="page-grid single-column">
        <section className="main-column">
          <EmptyState
            title="연결된 세션이 없습니다."
            description="메인에서 방을 만들거나 입장하면 세션 페이지로 이동합니다."
          />
        </section>
      </div>
    );
  }

  const [activePanel, setActivePanel] = useState<"main" | "chatting" | "info" | "settings">(
    "main",
  );
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [chatDraft, setChatDraft] = useState("");
  const sortedParticipants = [...snapshot.participants].sort((left, right) => {
    const leftIsHost = left.userId === snapshot.session.ownerUserId;
    const rightIsHost = right.userId === snapshot.session.ownerUserId;

    if (leftIsHost && !rightIsHost) {
      return -1;
    }

    if (!leftIsHost && rightIsHost) {
      return 1;
    }

    return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
  });

  const participantCards = sortedParticipants.map((participant) => {
    const participantCharacter =
      snapshot.characters.find((character) => character.id === participant.sessionCharacterId) ??
      snapshot.characters.find((character) => character.participantId === participant.id) ??
      snapshot.characters.find((character) => character.ownerUserId === participant.userId) ??
      null;

    return {
      participant,
      participantCharacter,
      isHost: participant.userId === snapshot.session.ownerUserId,
    };
  });

  const participantSlots: Array<{
    id: string;
    participant: Participant | null;
    participantCharacter: Character | null;
    isHost: boolean;
    isAiGm: boolean;
  }> = [];

  if (snapshot.session.gmMode === "AI") {
    participantSlots.push({
      id: "ai-gm",
      participant: null,
      participantCharacter: null,
      isHost: true,
      isAiGm: true,
    });
  }

  participantCards.forEach(({ participant, participantCharacter, isHost }) => {
    participantSlots.push({
      id: participant.id,
      participant,
      participantCharacter,
      isHost,
      isAiGm: false,
    });
  });

  const playerSlotCount = Math.max(4, snapshot.session.maxParticipants);
  while (participantSlots.filter((slot) => !slot.isAiGm).length < playerSlotCount) {
    participantSlots.push({
      id: `empty-slot-${participantSlots.length}`,
      participant: null,
      participantCharacter: null,
      isHost: false,
      isAiGm: false,
    });
  }

  const panelMessages: Record<
    "main" | "chatting" | "info" | "settings",
    Array<{
      id: string;
      sender: string;
      body: string;
      direction: "incoming" | "outgoing" | "notice";
      time: string;
    }>
  > = {
    main: [
      {
        id: "main-notice",
        sender: "Room overview",
        body: `${snapshot.session.title} · ${snapshot.session.gmMode.toUpperCase()} GM · status ${snapshot.session.status}`,
        direction: "notice",
        time: "Now",
      },
      {
        id: "main-gm",
        sender: snapshot.session.gmMode === "AI" ? "AI GM" : "GM Console",
        body: "Main panel summary and room-level prompts can live here later.",
        direction: "incoming",
        time: "09:12",
      },
      {
        id: "main-user",
        sender: user.displayName,
        body: "The message input is UI-only for now and does not send.",
        direction: "outgoing",
        time: "09:13",
      },
    ],
    chatting: [
      {
        id: "chat-notice",
        sender: "System",
        body: "Chat transport is not connected yet. This panel is a layout placeholder.",
        direction: "notice",
        time: "Today",
      },
      {
        id: "chat-gm",
        sender: snapshot.session.gmMode === "AI" ? "AI GM" : "GM",
        body: "Future room chat, narration, and action prompts will render in this stream.",
        direction: "incoming",
        time: "09:18",
      },
      {
        id: "chat-user",
        sender: user.displayName,
        body: "The sidebar already behaves like a messenger view.",
        direction: "outgoing",
        time: "09:19",
      },
    ],
    info: [
      {
        id: "info-notice",
        sender: "Session info",
        body: `${snapshot.participants.length} participants joined, ${snapshot.characters.length} characters assigned, phase ${snapshot.state.phase}.`,
        direction: "notice",
        time: "Now",
      },
      {
        id: "info-gm",
        sender: "Scenario",
        body: `Invite code ${snapshot.session.inviteCode} is active and the owner id is ${snapshot.session.ownerUserId}.`,
        direction: "incoming",
        time: "09:21",
      },
    ],
    settings: [
      {
        id: "settings-notice",
        sender: "Room settings",
        body: "Room options and session-level controls can expand from this shell later.",
        direction: "notice",
        time: "Now",
      },
      {
        id: "settings-user",
        sender: user.displayName,
        body: "Current controls are limited to invite copy and leaving the room.",
        direction: "outgoing",
        time: "09:24",
      },
    ],
  };

  const activeMessages = panelMessages[activePanel];

  return (
    <div className="session-layout">
      <section className={`session-room-header ${headerExpanded ? "expanded" : "collapsed"}`}>
        <div>
          <span className="eyebrow">Room overview</span>
          <h1>{snapshot.session.title}</h1>
          {headerExpanded ? (
            <p>
              초대 코드 {snapshot.session.inviteCode} · {snapshot.session.gmMode.toUpperCase()} GM ·
              상태 {snapshot.session.status}
            </p>
          ) : null}
        </div>
        <div className="banner-actions">
          {headerExpanded ? (
            <>
              <div className="invite-inline">
                <span>{snapshot.session.inviteCode}</span>
                <button
                  type="button"
                  className="invite-copy-button"
                  onClick={() => navigator.clipboard.writeText(snapshot.session.inviteCode)}
                  aria-label="초대 코드 복사"
                >
                  <Icon name="copy" />
                </button>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => onLeaveSession(snapshot.session.id)}
                disabled={busy}
              >
                나가기
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="ghost session-header-toggle"
            onClick={() => setHeaderExpanded((current) => !current)}
          >
            {headerExpanded ? "축소" : "확대"}
          </button>
        </div>
      </section>

      <div className="session-stage">
        <section className="session-main-board">
          <div className="session-main-canvas">
            <span className="eyebrow">Main</span>
            <strong>캐릭터 선택용 창</strong>
            <p>
              현재 세션 참가자 {snapshot.participants.length}명 · 세션 캐릭터 {snapshot.characters.length}명 ·
              phase {snapshot.state.phase}
            </p>
          </div>

          <div className="session-bottom-row">
            <div className="session-participant-strip">
              <SessionParticipantStrip participantSlots={participantSlots} gmMode={snapshot.session.gmMode} />{/*
                return (
                  <article
                    className={`session-participant-card ${!slot.participant && !slot.isAiGm ? "empty" : ""}`}
                    key={slot.id}
                  >
                  <div className="session-profile-card">
                    <div className="session-avatar-wrap">
                      <div className="avatar avatar-large">{initials(participant.user.displayName)}</div>
                      <div className="session-avatar-badges">
                        {isHost ? <span className="session-avatar-badge host" title="방장" /> : null}
                        {isHost && snapshot.session.gmMode === "HUMAN" ? (
                          <span className="session-avatar-badge gm" title="GM" />
                        ) : null}
                      </div>
                    </div>
                    <div className="session-profile-copy">
                      <strong>{participant.user.displayName}</strong>
                      <span>{isHost ? "방장" : "플레이어"}</span>
                      <span>{participantCharacter?.name ?? "캐릭터 미선택"}</span>
                    </div>
                  </div>

                  <div className="session-ready-card">
                    <span className="session-ready-label">Ready</span>
                    <button type="button" className="session-ready-button" disabled>
                      {participant.connectionStatus === "ONLINE" ? "대기중" : "오프라인"}
                    </button>
                  </div>
                </article>
              */}
            </div>
          </div>
        </section>

        <aside className="session-chat-panel">
          <div className="session-chat-tabs">
            {["main", "chatting", "info", "settings"].map((tab) => (
              <button
                key={tab}
                type="button"
                className={activePanel === tab ? "active" : ""}
                onClick={() => setActivePanel(tab as "main" | "chatting" | "info" | "settings")}
              >
                {tab === "main" && "Main"}
                {tab === "chatting" && "Chatting"}
                {tab === "info" && "Info"}
                {tab === "settings" && "Settings"}
              </button>
            ))}
          </div>

          <SessionChatSidebar
            messages={activeMessages}
            chatDraft={chatDraft}
            onChatDraftChange={setChatDraft}
          />{/*
            <div className="session-chat-avatar" />
            <div className="session-chat-box">
              {activePanel === "main" && <strong>메시지 상자</strong>}
              {activePanel === "chatting" && <strong>채팅 로그 자리</strong>}
              {activePanel === "info" && <strong>방 정보 / 참가자 정보</strong>}
              {activePanel === "settings" && <strong>세션 설정 자리</strong>}
            </div>
          */}
        </aside>
      </div>
    </div>
  );
}

function CharacterView({
  busy,
  currentSnapshot,
  characters,
  onCreateCharacter,
  onSelectCharacter,
}: {
  busy: boolean;
  currentSnapshot: SessionSnapshot | null;
  characters: PersistentCharacter[];
  onCreateCharacter: (payload: {
    name: string;
    ancestry: string;
    className: string;
    maxHp: number;
    armorClass: number;
    speed: number;
  }) => void;
  onSelectCharacter: (characterId: string) => void;
}) {
  const [name, setName] = useState("Ash Walker");
  const [ancestry, setAncestry] = useState("Human");
  const [className, setClassName] = useState("Rogue");
  const [maxHp, setMaxHp] = useState("12");
  const [armorClass, setArmorClass] = useState("14");
  const [speed, setSpeed] = useState("30");

  function submitCharacter(event: FormEvent) {
    event.preventDefault();
    onCreateCharacter({
      name,
      ancestry,
      className,
      maxHp: Number(maxHp) || 10,
      armorClass: Number(armorClass) || 10,
      speed: Number(speed) || 30,
    });
  }

  return (
    <div className="page-grid single-column">
      <section className="main-column">
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Character builder</span>
              <h2>영속 캐릭터 생성</h2>
            </div>
          </div>

          <form className="form-card wide" onSubmit={submitCharacter}>
            <div className="field-row triple">
              <div>
                <label htmlFor="character-name">이름</label>
                <input
                  id="character-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={50}
                />
              </div>
              <div>
                <label htmlFor="character-ancestry">종족</label>
                <input
                  id="character-ancestry"
                  value={ancestry}
                  onChange={(event) => setAncestry(event.target.value)}
                  maxLength={50}
                />
              </div>
              <div>
                <label htmlFor="character-class">직업</label>
                <input
                  id="character-class"
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  maxLength={50}
                />
              </div>
            </div>

            <div className="field-row triple">
              <div>
                <label htmlFor="character-hp">최대 HP</label>
                <input
                  id="character-hp"
                  value={maxHp}
                  onChange={(event) => setMaxHp(event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div>
                <label htmlFor="character-ac">AC</label>
                <input
                  id="character-ac"
                  value={armorClass}
                  onChange={(event) => setArmorClass(event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div>
                <label htmlFor="character-speed">속도</label>
                <input
                  id="character-speed"
                  value={speed}
                  onChange={(event) => setSpeed(event.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <button type="submit" className="primary" disabled={busy}>
              <Icon name="plus" />
              캐릭터 저장
            </button>
          </form>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">My roster</span>
              <h2>보유 캐릭터</h2>
            </div>
          </div>

          <div className="card-grid">
            {characters.length ? (
              characters.map((character) => (
                <article className="character-card" key={character.id}>
                  <div className="character-head">
                    <div className="avatar">{initials(character.name)}</div>
                    <div>
                      <h3>{character.name}</h3>
                      <p>
                        {character.ancestry} · {character.className} · Lv {character.level}
                      </p>
                    </div>
                  </div>

                  <dl className="session-meta">
                    <div>
                      <dt>HP</dt>
                      <dd>{character.maxHp}</dd>
                    </div>
                    <div>
                      <dt>AC</dt>
                      <dd>{character.armorClass}</dd>
                    </div>
                    <div>
                      <dt>Speed</dt>
                      <dd>{character.speed}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{character.isSelectable ? "available" : "in session"}</dd>
                    </div>
                  </dl>

                  {currentSnapshot ? (
                    <button
                      type="button"
                      disabled={busy || !character.isSelectable}
                      onClick={() => onSelectCharacter(character.id)}
                    >
                      <Icon name="enter" />
                      현재 세션에 선택
                    </button>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                title="아직 저장된 캐릭터가 없습니다."
                description="먼저 캐릭터를 만든 뒤 세션에 입장해서 선택할 수 있습니다."
              />
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function RulebookView() {
  return (
    <div className="page-grid single-column">
      <section className="main-column">
        <section className="detail-grid">
          <article className="info-card">
            <span className="eyebrow">Rulebook</span>
            <h2>룰북 자리</h2>
            <p>최종 버전에서는 룰 요약, 판정 기준, 전투 흐름, 자주 쓰는 참조 문서를 여기에 배치하면 됩니다.</p>
            <ul className="plain-list">
              <li>기본 판정 절차</li>
              <li>전투 흐름</li>
              <li>능력치와 스킬 참조</li>
              <li>세션 운영 가이드</li>
            </ul>
          </article>
        </section>
      </section>
    </div>
  );
}

function ProfileView({
  user,
  mySessions,
  currentSnapshot,
}: {
  user: StoredUser;
  mySessions: SessionListItem[];
  currentSnapshot: SessionSnapshot | null;
}) {
  return (
    <div className="page-grid single-column">
      <section className="main-column">
        <section className="detail-grid">
          <article className="info-card">
            <span className="eyebrow">Profile</span>
            <h2>{user.displayName}</h2>
            <p>테스트용 임시 프로필입니다. 실제 계정 시스템이 붙으면 이 화면을 확장하면 됩니다.</p>
            <dl className="detail-list">
              <div>
                <dt>User ID</dt>
                <dd>{user.id}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Header</dt>
                <dd>x-user-id: {user.id}</dd>
              </div>
            </dl>
          </article>

          <article className="info-card">
            <span className="eyebrow">Session summary</span>
            <h2>현재 연결 정보</h2>
            <dl className="detail-list">
              <div>
                <dt>My sessions</dt>
                <dd>{mySessions.length}</dd>
              </div>
              <div>
                <dt>Connected room</dt>
                <dd>{currentSnapshot?.session.title ?? "없음"}</dd>
              </div>
              <div>
                <dt>Invite code</dt>
                <dd>{currentSnapshot?.session.inviteCode ?? "-"}</dd>
              </div>
            </dl>
          </article>
        </section>
      </section>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="page-grid single-column">
      <section className="main-column">
        <section className="detail-grid">
          <article className="info-card">
            <span className="eyebrow">Environment</span>
            <h2>프론트 연결 설정</h2>
            <dl className="detail-list">
              <div>
                <dt>API base</dt>
                <dd>{API_BASE_URL}</dd>
              </div>
              <div>
                <dt>WebSocket base</dt>
                <dd>{WS_BASE_URL}</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>localStorage</dd>
              </div>
            </dl>
          </article>

          <article className="info-card">
            <span className="eyebrow">Current scope</span>
            <h2>현재 제공 기능</h2>
            <ul className="plain-list">
              <li>공개 세션 목록 조회</li>
              <li>방 생성 및 초대 코드 입장</li>
              <li>내 세션 복귀</li>
              <li>영속 캐릭터 생성</li>
              <li>현재 세션에 캐릭터 선택</li>
            </ul>
          </article>
        </section>
      </section>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <article className="empty-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function LogPanel({ logs, compact = false }: { logs: LogEntry[]; compact?: boolean }) {
  return (
    <section className={compact ? "log-panel compact" : "log-panel"}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Activity</span>
          <h2>최근 로그</h2>
        </div>
      </div>
      <div className="log-list">
        {logs.map((log) => (
          <article key={log.id} className={`log-entry ${log.kind}`}>
            <div className="log-entry-head">
              <strong>{log.title}</strong>
              <time>{log.time}</time>
            </div>
            <p>{log.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const [user, setUser] = useState<StoredUser | null>(() => loadStoredUser());
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [joinableSessions, setJoinableSessions] = useState<SessionListItem[]>([]);
  const [mySessions, setMySessions] = useState<SessionListItem[]>([]);
  const [characters, setCharacters] = useState<PersistentCharacter[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    makeLog("system", "Dashboard ready", "Sign in with the test login button to load live data."),
  ]);
  const [activeView, setActiveView] = useState<NavView>("main");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  function appendLog(kind: LogEntry["kind"], title: string, message: string) {
    setLogs((current) => [makeLog(kind, title, message), ...current].slice(0, 24));
  }

  function updateSnapshot(nextSnapshot: SessionSnapshot) {
    setSnapshot(nextSnapshot);
    saveStoredSnapshot(nextSnapshot);
  }

  async function refreshDashboardData(currentUser: StoredUser) {
    const [nextScenarios, nextJoinableSessions, nextMySessions, nextCharacters] = await Promise.all([
      listScenarios(),
      listSessions({
        status: SESSION_STATUS_LOBBY,
        isPublic: true,
        openSlotsAtLeast: 1,
      }),
      listMySessions(currentUser),
      listMyCharacters(currentUser),
    ]);

    setScenarios(nextScenarios);
    setJoinableSessions(nextJoinableSessions);
    setMySessions(nextMySessions);
    setCharacters(nextCharacters);
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    setError(null);
    refreshDashboardData(user).catch((caught: Error) => {
      setError(caught.message);
      appendLog("rest", "Load failed", caught.message);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) {
      return undefined;
    }

    const socket: Socket = connectSessionSocket(user, snapshot.session.id, {
      onSnapshot: updateSnapshot,
      onParticipantUpdated: (participant: Participant) => {
        setSnapshot((current) => {
          if (!current) {
            return current;
          }

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
          if (!current) {
            return current;
          }

          const sessionCharacters = current.characters.some((item) => item.id === character.id)
            ? current.characters.map((item) => (item.id === character.id ? character : item))
            : [...current.characters, character];
          const next = { ...current, characters: sessionCharacters, sessionCharacters };
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
  }, [user?.id, snapshot?.session.id]);

  async function handleTestLogin() {
    setBusy(true);
    setError(null);

    try {
      const nextUser = await createGuest(generateTestName());
      saveStoredUser(nextUser);
      setUser(nextUser);
      appendLog("rest", "Guest issued", `Created temporary user ${nextUser.displayName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Test login failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearStoredUser();
    clearStoredSnapshot();
    setUser(null);
    setSnapshot(null);
    setJoinableSessions([]);
    setMySessions([]);
    setCharacters([]);
    setSocketConnected(false);
    setActiveView("main");
    setActiveModal(null);
    appendLog("system", "Logged out", "Cleared the temporary guest session from local storage.");
  }

  async function handleCreateSession(payload: {
    title: string;
    scenarioId?: string;
    gmMode: SessionGmMode;
    maxParticipants: number;
  }) {
    if (!user) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextSnapshot = await createSession(user, payload);
      updateSnapshot(nextSnapshot);
      await refreshDashboardData(user);
      setActiveModal(null);
      setActiveView("session");
      appendLog("rest", "Session created", `${nextSnapshot.session.title} room is ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinByInvite(inviteCode: string) {
    if (!user || !inviteCode) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextSnapshot = await joinSessionByInvite(user, inviteCode);
      updateSnapshot(nextSnapshot);
      await refreshDashboardData(user);
      setActiveModal(null);
      setActiveView("session");
      appendLog("rest", "Joined by invite", `${nextSnapshot.session.title} room joined with code.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinSession(sessionId: string) {
    if (!user) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextSnapshot = await joinSessionById(user, sessionId);
      updateSnapshot(nextSnapshot);
      await refreshDashboardData(user);
      setActiveView("session");
      appendLog("rest", "Joined room", `${nextSnapshot.session.title} room joined from list.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the selected room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeSession(sessionId: string) {
    if (!user) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextSnapshot = await resumeSession(user, sessionId);
      updateSnapshot(nextSnapshot);
      await refreshDashboardData(user);
      setActiveView("session");
      appendLog("rest", "Session resumed", `${nextSnapshot.session.title} snapshot restored.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resume the room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCharacter(payload: {
    name: string;
    ancestry: string;
    className: string;
    maxHp: number;
    armorClass: number;
    speed: number;
  }) {
    if (!user) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const character = await createPersistentCharacter(user, payload);
      setCharacters((current) => [character, ...current]);
      await refreshDashboardData(user);
      appendLog("rest", "Character created", `${character.name} was saved to your roster.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectCharacter(characterId: string) {
    if (!user || !snapshot) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await selectCharacterForSession(user, snapshot.session.id, characterId);
      const nextSnapshot = await resumeSession(user, snapshot.session.id);
      updateSnapshot(nextSnapshot);
      await refreshDashboardData(user);
      setActiveView("session");
      appendLog("rest", "Character assigned", "Selected character was applied to the current room.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign the character.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveSession(sessionId: string) {
    if (!user) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await leaveSession(user, sessionId);
      clearStoredSnapshot();
      setSnapshot(null);
      await refreshDashboardData(user);
      setActiveView("main");
      appendLog("rest", "Left session", "You left the room and released your current session assignment.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not leave the room.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <LoginView busy={busy} error={error} onLogin={handleTestLogin} />;
  }

  return (
    <div className="app-shell app-shell-topnav">
      {activeView !== "session" ? (
        <TopNavigation
          activeView={activeView}
          user={user}
          socketConnected={socketConnected}
          onNavigate={setActiveView}
          onLogout={handleLogout}
        />
      ) : null}

      <div className="workspace workspace-topnav">
        {activeView === "main" ? (
          <MainView
            busy={busy}
            error={error}
            currentSnapshot={snapshot}
            joinableSessions={joinableSessions}
            mySessions={mySessions}
            myCharacters={characters}
            logs={logs}
            socketConnected={socketConnected}
            onOpenCreateModal={() => setActiveModal("create-session")}
            onOpenJoinModal={() => setActiveModal("join-invite")}
            onJoinSession={handleJoinSession}
            onResumeSession={handleResumeSession}
          />
        ) : null}

        {activeView === "session" ? (
          <SessionView
            user={user}
            busy={busy}
            snapshot={snapshot}
            socketConnected={socketConnected}
            onLeaveSession={handleLeaveSession}
          />
        ) : null}

        {activeView === "characters" ? (
          <CharacterView
            busy={busy}
            currentSnapshot={snapshot}
            characters={characters}
            onCreateCharacter={handleCreateCharacter}
            onSelectCharacter={handleSelectCharacter}
          />
        ) : null}

        {activeView === "rulebook" ? <RulebookView /> : null}
        {activeView === "profile" ? (
          <ProfileView user={user} mySessions={mySessions} currentSnapshot={snapshot} />
        ) : null}
        {activeView === "settings" ? <SettingsView /> : null}
      </div>

      <SessionModal
        type={activeModal}
        busy={busy}
        scenarios={scenarios}
        onClose={() => setActiveModal(null)}
        onCreateSession={handleCreateSession}
        onJoinByInvite={handleJoinByInvite}
      />
    </div>
  );
}

