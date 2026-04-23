import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  createCharacter,
  createGuest,
  createSession,
  joinSession,
  listScenarios,
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
  Scenario,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

const quickActions = [
  { label: "동굴 조사", icon: "eye" },
  { label: "방어 태세", icon: "shield" },
  { label: "마법 탐지", icon: "spark" },
  { label: "휴식", icon: "rest" },
];

const sampleRooms = [
  {
    title: "얼어붙은 협곡",
    system: "D&D 5e",
    players: "2 / 4",
    note: "휴식할 때마다 첩탑 구조가 바뀌는 초보자 환영 세션",
  },
  {
    title: "검은 로의 하강",
    system: "Pathfinder 2e",
    players: "3 / 4",
    note: "전투 위주 단편. 캐릭터 생성 후 바로 참가 가능",
  },
  {
    title: "데드 선즈: 역슬롯 사건",
    system: "Starfinder",
    players: "5 / 5",
    note: "관전 가능. 우주 정거장 수사 시나리오",
  },
];

function nowTime(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
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
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      );
    case "rest":
      return (
        <svg {...common}>
          <path d="M4 14a8 8 0 0 0 13.6 5.7A8.5 8.5 0 0 1 13 3a8 8 0 0 0-9 11z" />
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
  onLogin,
  busy,
  error,
}: {
  onLogin: (displayName: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [displayName, setDisplayName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onLogin(displayName);
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="로그인">
        <div className="brand-mark">
          <Icon name="logo" />
        </div>
        <h1>모두의 TRPG</h1>
        <p>모험의 세계로 입장하세요.</p>

        <form className="login-card" onSubmit={submit}>
          <label htmlFor="displayName">모험가 이름</label>
          <input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="예: 던전 마스터"
            maxLength={50}
            autoComplete="nickname"
          />
          <button type="submit" disabled={busy}>
            <Icon name="enter" />
            {busy ? "입장 중..." : "게스트로 입장"}
          </button>
          <div className="login-divider">
            <span />
            <strong>또는 다음으로 계속</strong>
            <span />
          </div>
          <div className="social-row" aria-label="추후 로그인 제공자">
            <button type="button" disabled>
              Kakao
            </button>
            <button type="button" disabled>
              Discord
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

function Sidebar({
  user,
  activeView,
  onViewChange,
  onLogout,
}: {
  user: StoredUser;
  activeView: "lobby" | "play";
  onViewChange: (view: "lobby" | "play") => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Icon name="logo" />
        <span>모두의 TRPG</span>
      </div>
      <div className="profile">
        <div className="portrait">{user.displayName.slice(0, 1)}</div>
        <div>
          <strong>{user.displayName}</strong>
          <span>게스트 모험가</span>
        </div>
      </div>
      <nav className="side-nav" aria-label="주 메뉴">
        <button
          type="button"
          className={activeView === "lobby" ? "active" : ""}
          onClick={() => onViewChange("lobby")}
        >
          <Icon name="eye" />
          로비
        </button>
        <button
          type="button"
          className={activeView === "play" ? "active" : ""}
          onClick={() => onViewChange("play")}
        >
          <Icon name="spark" />
          세션
        </button>
      </nav>
      <button type="button" className="logout-button" onClick={onLogout}>
        <Icon name="logout" />
        로그아웃
      </button>
    </aside>
  );
}

function LobbyView({
  user,
  scenarios,
  snapshot,
  logs,
  busy,
  error,
  onCreateSession,
  onJoinSession,
  onCreateCharacter,
  onOpenPlay,
}: {
  user: StoredUser;
  scenarios: Scenario[];
  snapshot: SessionSnapshot | null;
  logs: LogEntry[];
  busy: boolean;
  error: string | null;
  onCreateSession: (title: string, scenarioId?: string) => void;
  onJoinSession: (inviteCode: string) => void;
  onCreateCharacter: (payload: {
    name: string;
    ancestry: string;
    className: string;
    maxHp?: number;
  }) => void;
  onOpenPlay: () => void;
}) {
  const [sessionTitle, setSessionTitle] = useState("얼어붙은 황무지의 메아리");
  const [scenarioId, setScenarioId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [characterName, setCharacterName] = useState(`${user.displayName}의 캐릭터`);
  const [ancestry, setAncestry] = useState("Human");
  const [className, setClassName] = useState("Rogue");

  const myCharacter = snapshot?.characters.find((character) => character.ownerUserId === user.id);

  function submitSession(event: FormEvent) {
    event.preventDefault();
    onCreateSession(sessionTitle, scenarioId || undefined);
  }

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    onJoinSession(inviteCode);
  }

  function submitCharacter(event: FormEvent) {
    event.preventDefault();
    onCreateCharacter({
      name: characterName,
      ancestry,
      className,
      maxHp: 12,
    });
  }

  return (
    <main className="content-grid">
      <section className="lobby-main">
        <div className="page-title">
          <div>
            <span className="eyebrow">로비 탐색기</span>
            <h2>진행 중인 모험을 발견하거나 새 세션을 시작하세요.</h2>
          </div>
          {snapshot ? (
            <button type="button" className="primary small" onClick={onOpenPlay}>
              <Icon name="enter" />
              세션 입장
            </button>
          ) : null}
        </div>

        <article className="featured-room">
          <div>
            <span className="badge">추천 캠페인</span>
            <h3>{snapshot?.session.title ?? "얼어붙은 황무지의 메아리"}</h3>
            <p>
              초대 코드로 동료를 불러오고, 캐릭터를 만든 뒤 같은 세션 상태와 실시간 변경
              이벤트를 확인할 수 있습니다.
            </p>
            <div className="meta-row">
              <span>참가자 {snapshot?.participants.length ?? 0}명</span>
              <span>캐릭터 {snapshot?.characters.length ?? 0}명</span>
              <span>{snapshot?.state.phase ?? "대기 중"}</span>
            </div>
          </div>
          {snapshot ? (
            <button
              type="button"
              className="ghost"
              onClick={() => navigator.clipboard.writeText(snapshot.session.inviteCode)}
            >
              <Icon name="copy" />
              {snapshot.session.inviteCode}
            </button>
          ) : null}
        </article>

        <div className="room-list">
          {sampleRooms.map((room) => (
            <article className="room-card" key={room.title}>
              <div className="room-top">
                <span>{room.system}</span>
                <strong>{room.players}</strong>
              </div>
              <h3>{room.title}</h3>
              <p>{room.note}</p>
              <button type="button">상세 보기</button>
            </article>
          ))}
        </div>
      </section>

      <aside className="control-panel">
        <form className="action-card" onSubmit={submitSession}>
          <h3>새 세션</h3>
          <label htmlFor="sessionTitle">세션 제목</label>
          <input
            id="sessionTitle"
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
            maxLength={100}
          />
          <label htmlFor="scenarioId">시나리오</label>
          <select
            id="scenarioId"
            value={scenarioId}
            onChange={(event) => setScenarioId(event.target.value)}
          >
            <option value="">기본 시나리오</option>
            {scenarios.map((scenario) => (
              <option value={scenario.id} key={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={busy}>
            <Icon name="plus" />
            세션 만들기
          </button>
        </form>

        <form className="action-card" onSubmit={submitJoin}>
          <h3>초대 코드 참가</h3>
          <label htmlFor="inviteCode">초대 코드</label>
          <input
            id="inviteCode"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={12}
          />
          <button type="submit" disabled={busy}>
            <Icon name="enter" />
            참가하기
          </button>
        </form>

        {snapshot ? (
          <form className="action-card" onSubmit={submitCharacter}>
            <h3>{myCharacter ? "내 캐릭터" : "캐릭터 생성"}</h3>
            {myCharacter ? (
              <div className="character-summary">
                <strong>{myCharacter.name}</strong>
                <span>
                  {myCharacter.ancestry} · {myCharacter.className} · HP {myCharacter.currentHp}/
                  {myCharacter.maxHp}
                </span>
              </div>
            ) : (
              <>
                <label htmlFor="characterName">이름</label>
                <input
                  id="characterName"
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                  maxLength={50}
                />
                <div className="form-pair">
                  <div>
                    <label htmlFor="ancestry">종족</label>
                    <input
                      id="ancestry"
                      value={ancestry}
                      onChange={(event) => setAncestry(event.target.value)}
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label htmlFor="className">직업</label>
                    <input
                      id="className"
                      value={className}
                      onChange={(event) => setClassName(event.target.value)}
                      maxLength={50}
                    />
                  </div>
                </div>
                <button type="submit" className="primary" disabled={busy}>
                  <Icon name="spark" />
                  캐릭터 생성
                </button>
              </>
            )}
          </form>
        ) : null}

        {error ? <p className="panel-error">{error}</p> : null}
        <LogPanel logs={logs} compact />
      </aside>
    </main>
  );
}

function BattleMap({ characters }: { characters: Character[] }) {
  return (
    <div className="battle-map" aria-label="세션 맵">
      <svg viewBox="0 0 900 520" role="img" aria-label="얼어붙은 협곡 지도">
        <rect width="900" height="520" rx="22" />
        <path d="M50 380C150 330 220 360 310 286C390 220 460 240 540 170C640 80 740 130 850 80" />
        <path d="M92 160C190 120 270 160 350 130C450 92 520 110 610 130C706 150 750 210 840 190" />
        <path d="M180 420C250 390 315 414 380 360C442 310 500 326 565 290C650 240 715 255 790 232" />
        {[140, 240, 330, 520, 610, 720].map((x, index) => (
          <g key={x} transform={`translate(${x} ${index % 2 ? 210 : 300})`}>
            <path d="M0 42l28-70 40 70z" />
            <path d="M30 42l24-58 36 58z" />
          </g>
        ))}
        <line x1="530" y1="265" x2="318" y2="214" />
        <text x="382" y="226">
          15 ft
        </text>
      </svg>
      {characters.slice(0, 4).map((character, index) => (
        <div
          className={`map-token tone-${index + 1}`}
          style={{
            left: `${42 + index * 9}%`,
            top: `${48 - index * 8}%`,
          }}
          key={character.id}
          title={character.name}
        >
          {character.name.slice(0, 1)}
        </div>
      ))}
      <div className="map-token hostile">!</div>
    </div>
  );
}

function PlayView({
  user,
  snapshot,
  logs,
  socketConnected,
  onAction,
}: {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  logs: LogEntry[];
  socketConnected: boolean;
  onAction: (label: string) => void;
}) {
  const characters = snapshot?.characters ?? [];
  const participants = snapshot?.participants ?? [];
  const myCharacter = characters.find((character) => character.ownerUserId === user.id);

  return (
    <main className="play-layout">
      <section className="initiative-panel">
        <h2>우선권</h2>
        <div className="initiative-list">
          {characters.length ? (
            characters.map((character, index) => (
              <div className="initiative-item" key={character.id}>
                <div className={`portrait mini tone-${(index % 4) + 1}`}>{character.name.slice(0, 1)}</div>
                <div>
                  <strong>{character.name}</strong>
                  <span>
                    HP {character.currentHp}/{character.maxHp}
                  </span>
                </div>
                <b>{21 - index * 3}</b>
              </div>
            ))
          ) : (
            <p className="empty-text">로비에서 캐릭터를 만들면 여기에 표시됩니다.</p>
          )}
        </div>
      </section>

      <section className="scene-panel">
        <div className="scene-header">
          <div>
            <span className="eyebrow">
              {snapshot?.session.title ?? "세션을 선택하세요"} · {socketConnected ? "온라인" : "대기"}
            </span>
            <h2>얼어붙은 협곡</h2>
          </div>
          <span className="round-pill">턴 4 · 라운드 2</span>
        </div>
        <BattleMap characters={characters} />
        <div className="scene-bottom">
          <article className="scene-text">
            <h3>{myCharacter?.name ?? "파티"}</h3>
            <p>
              매서운 바람 사이로 오래된 룬 문양이 희미하게 빛납니다. 동료들과 현재
              세션 상태를 공유하고, 아래 행동 버튼으로 로그를 남기며 흐름을 확인하세요.
            </p>
            <div className="action-row">
              {quickActions.map((action) => (
                <button type="button" key={action.label} onClick={() => onAction(action.label)}>
                  <Icon name={action.icon} />
                  {action.label}
                </button>
              ))}
            </div>
          </article>
          <div className="party-strip">
            {participants.map((participant) => (
              <div className="party-member" key={participant.id}>
                <strong>{participant.user.displayName}</strong>
                <span>{participant.role} · {participant.connectionStatus}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="log-dock">
        <LogPanel logs={logs} />
      </aside>
    </main>
  );
}

function LogPanel({ logs, compact = false }: { logs: LogEntry[]; compact?: boolean }) {
  return (
    <section className={compact ? "log-panel compact" : "log-panel"}>
      <div className="log-tabs">
        <strong>게임 로그</strong>
        <span>{logs.length}</span>
      </div>
      <div className="log-list">
        {logs.length ? (
          logs.map((log) => (
            <article className={`log-entry ${log.kind}`} key={log.id}>
              <div>
                <strong>{log.title}</strong>
                <time>{log.time}</time>
              </div>
              <p>{log.message}</p>
            </article>
          ))
        ) : (
          <p className="empty-text">API 응답과 실시간 이벤트가 여기에 쌓입니다.</p>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [user, setUser] = useState<StoredUser | null>(() => loadStoredUser());
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    makeLog("system", "준비 완료", "게스트 로그인 후 세션을 만들거나 초대 코드로 참가하세요."),
  ]);
  const [activeView, setActiveView] = useState<"lobby" | "play">("lobby");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const currentSessionId = snapshot?.session.id;

  const appendLog = (kind: LogEntry["kind"], title: string, message: string) => {
    setLogs((current) => [makeLog(kind, title, message), ...current].slice(0, 30));
  };

  const updateSnapshot = (nextSnapshot: SessionSnapshot) => {
    setSnapshot(nextSnapshot);
    saveStoredSnapshot(nextSnapshot);
  };

  useEffect(() => {
    listScenarios()
      .then(setScenarios)
      .catch((caught: Error) => appendLog("rest", "시나리오 조회 실패", caught.message));
  }, []);

  useEffect(() => {
    if (!user || !currentSessionId) {
      return undefined;
    }

    const socket: Socket = connectSessionSocket(user, currentSessionId, {
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

          const characters = current.characters.some((item) => item.id === character.id)
            ? current.characters.map((item) => (item.id === character.id ? character : item))
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
  }, [user?.id, currentSessionId]);

  const statusText = useMemo(() => {
    if (!snapshot) {
      return "세션 없음";
    }

    return `${snapshot.participants.length}명 참가 · ${snapshot.characters.length}개 캐릭터`;
  }, [snapshot]);

  async function handleLogin(displayName: string) {
    setError(null);
    const name = displayName.trim();
    if (!name) {
      setError("모험가 이름을 입력해주세요.");
      return;
    }

    setBusy(true);
    try {
      const nextUser = await createGuest(name);
      saveStoredUser(nextUser);
      setUser(nextUser);
      appendLog("rest", "게스트 로그인", `${nextUser.displayName} 님으로 입장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearStoredUser();
    clearStoredSnapshot();
    setUser(null);
    setSnapshot(null);
    setActiveView("lobby");
    setSocketConnected(false);
    appendLog("system", "로그아웃", "브라우저에 저장된 게스트 상태를 삭제했습니다.");
  }

  async function handleCreateSession(title: string, scenarioId?: string) {
    if (!user) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const nextSnapshot = await createSession(user, title, scenarioId);
      updateSnapshot(nextSnapshot);
      appendLog("rest", "세션 생성", `${nextSnapshot.session.title} 세션을 만들었습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinSession(inviteCode: string) {
    if (!user) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const nextSnapshot = await joinSession(user, inviteCode);
      updateSnapshot(nextSnapshot);
      appendLog("rest", "세션 참가", `${nextSnapshot.session.title} 세션에 참가했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 참가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCharacter(payload: {
    name: string;
    ancestry: string;
    className: string;
    maxHp?: number;
  }) {
    if (!user || !snapshot) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const character = await createCharacter(user, {
        ...payload,
        sessionId: snapshot.session.id,
      });
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        const next = {
          ...current,
          characters: [...current.characters, character],
          participants: current.participants.map((participant) =>
            participant.userId === user.id ? { ...participant, characterId: character.id } : participant,
          ),
        };
        saveStoredSnapshot(next);
        return next;
      });
      appendLog("rest", "캐릭터 생성", `${character.name} 캐릭터를 만들었습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} busy={busy} error={error} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activeView={activeView}
        onViewChange={setActiveView}
        onLogout={handleLogout}
      />
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{snapshot?.session.title ?? "로비"}</strong>
            <span>{statusText}</span>
          </div>
          <div className="topbar-right">
            <span className={socketConnected ? "status online" : "status"}>
              {socketConnected ? "실시간 연결" : "실시간 대기"}
            </span>
            <div className="avatar">{user.displayName.slice(0, 1)}</div>
          </div>
        </header>

        {activeView === "lobby" ? (
          <LobbyView
            user={user}
            scenarios={scenarios}
            snapshot={snapshot}
            logs={logs}
            busy={busy}
            error={error}
            onCreateSession={handleCreateSession}
            onJoinSession={handleJoinSession}
            onCreateCharacter={handleCreateCharacter}
            onOpenPlay={() => setActiveView("play")}
          />
        ) : (
          <PlayView
            user={user}
            snapshot={snapshot}
            logs={logs}
            socketConnected={socketConnected}
            onAction={(label) =>
              appendLog("action", label, `${user.displayName} 님이 "${label}" 행동을 선언했습니다.`)
            }
          />
        )}
      </div>
    </div>
  );
}
