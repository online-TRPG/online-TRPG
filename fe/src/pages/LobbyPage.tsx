import { FormEvent, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { LogPanel } from "../components/LogPanel";
import type {
  AvailableSessionListItem,
  LogEntry,
  Scenario,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

interface LobbyPageProps {
  user: StoredUser;
  scenarios: Scenario[];
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  logs: LogEntry[];
  busy: boolean;
  error: string | null;
  onCreateSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) => void | Promise<void>;
  onJoinSession: (inviteCode: string) => void | Promise<void>;
  onJoinSessionById: (sessionId: string) => void | Promise<void>;
  onOpenPlay: () => void;
}

type LobbyModal = "create-room" | "join-room" | null;

const STATUS_LABEL: Record<string, string> = {
  lobby: "대기 중",
  playing: "진행 중",
  paused: "중단",
  completed: "종료",
};

const PAGE_SIZE = 10;

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
}

export function LobbyPage({
  scenarios,
  snapshot,
  sessionList,
  logs,
  busy,
  error,
  onCreateSession,
  onJoinSession,
  onJoinSessionById,
  onOpenPlay,
}: LobbyPageProps) {
  const [activeModal, setActiveModal] = useState<LobbyModal>(null);
  const [sessionTitle, setSessionTitle] = useState("얼어붙은 항구지의 메아리");
  const [scenarioId, setScenarioId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [useAiGm, setUseAiGm] = useState(true);
  const [page, setPage] = useState(0);

  const myRoomCount = snapshot ? 1 : 0;
  const myReadyCount = useMemo(
    () => snapshot?.participants.filter((participant) => participant.isReady).length ?? 0,
    [snapshot],
  );

  const totalPages = Math.max(1, Math.ceil(sessionList.length / PAGE_SIZE));
  const pagedSessions = useMemo(
    () => sessionList.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [page, sessionList],
  );

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCreateSession(sessionTitle, {
      scenarioId: scenarioId || undefined,
      maxParticipants: maxPlayers,
      useAiGm,
    });
    setActiveModal(null);
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onJoinSession(inviteCode.trim().toUpperCase());
    setActiveModal(null);
  }

  return (
    <main className="page-with-sidebar">
      <aside className="page-sidebar">
        <div className="page-sidebar-block">
          <span className="eyebrow">Sidebar</span>
          <h2>Main console</h2>
          <p>메인 대시보드의 핵심 섹션으로 이동합니다.</p>
        </div>

        <nav className="section-nav" aria-label="Lobby sections">
          <button type="button">Main console</button>
          <button type="button">
            Joinable rooms
            <span>{sessionList.length}</span>
          </button>
          <button type="button">
            My rooms
            <span>{myRoomCount}</span>
          </button>
        </nav>

        <div className="sidebar-log-dock">
          <LogPanel logs={logs} compact />
        </div>
      </aside>

      <section className="main-column main-column-wide">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Main console</span>
            <h1>메인 대시보드</h1>
            <p>공개 세션 탐색, 초대 코드 입장, 진행 중인 세션 복귀를 한 화면에서 처리합니다.</p>
            <div className="hero-stats">
              <div>
                <strong>{sessionList.length}</strong>
                <span>Joinable sessions</span>
              </div>
              <div>
                <strong>{myRoomCount}</strong>
                <span>My rooms</span>
              </div>
              <div>
                <strong>{myReadyCount}</strong>
                <span>Ready players</span>
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="status-panel">
              <span className="status-pill">Realtime lobby</span>
              <strong>{snapshot?.session.title ?? "열어둔 세션 없음"}</strong>
              <p>
                {snapshot
                  ? `${snapshot.participants.length}명 참가, ${snapshot.characters.length}개 캐릭터가 현재 세션에 연결되어 있습니다.`
                  : "세션을 만들거나 초대 코드로 입장하면 현재 방이 이 패널에 표시됩니다."}
              </p>
            </div>

            <div className="quick-action-panel">
              <button type="button" className="primary" disabled={busy} onClick={() => setActiveModal("create-room")}>
                <Icon name="plus" />
                방 생성
              </button>
              <button type="button" disabled={busy} onClick={() => setActiveModal("join-room")}>
                <Icon name="enter" />
                초대 코드 입장
              </button>
            </div>
          </div>
        </section>

        <section className="current-session-banner">
          <div>
            <span className="eyebrow">Current room</span>
            <h2>{snapshot?.session.title ?? "진행 중인 세션 없음"}</h2>
            <p>
              {snapshot
                ? `초대 코드 ${snapshot.session.inviteCode} · 상태 ${snapshot.session.status} · phase ${snapshot.state.phase}`
                : "현재 세션이 없으면 공개 방 목록에서 합류하거나 새 방을 생성해 주세요."}
            </p>
          </div>
          {snapshot ? (
            <div className="banner-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => navigator.clipboard.writeText(snapshot.session.inviteCode)}
              >
                <Icon name="copy" />
                코드 복사
              </button>
              <button type="button" onClick={onOpenPlay}>
                세션 열기
              </button>
            </div>
          ) : null}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Joinable rooms</span>
              <h2>합류 가능한 방</h2>
            </div>
          </div>

          <div className="card-grid joinable-room-grid">
            {pagedSessions.length ? (
              pagedSessions.map((item, index) => (
                <article className="session-card" key={getSessionListItemKey(item, index)}>
                  <div className="session-card-top">
                    <span className="status-chip">{item.ruleSetName || "TRPG"}</span>
                    <span className="status-chip muted">{STATUS_LABEL[item.status] ?? item.status}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.scenarioTitle}</p>
                  <dl className="session-meta">
                    <div>
                      <dt>Players</dt>
                      <dd>
                        {item.currentPlayers} / {item.maxPlayers}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{STATUS_LABEL[item.status] ?? item.status}</dd>
                    </div>
                  </dl>
                  <button type="button" disabled={busy} onClick={() => void onJoinSessionById(item.sessionId)}>
                    <Icon name="enter" />
                    합류하기
                  </button>
                </article>
              ))
            ) : (
              <article className="empty-card">
                <h3>입장 가능한 공개 세션이 없습니다.</h3>
                <p>새 방을 만들거나 초대 코드로 세션에 입장해 보세요.</p>
              </article>
            )}
          </div>

          {sessionList.length > PAGE_SIZE ? (
            <div className="pagination-row">
              <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                이전
              </button>
              <span>
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => current + 1)}
              >
                다음
              </button>
            </div>
          ) : null}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">My rooms</span>
              <h2>내 방</h2>
            </div>
          </div>

          <div className="card-grid">
            {snapshot ? (
              <article className="session-card">
                <div className="session-card-top">
                  <span className="status-chip">{snapshot.session.gmMode} GM</span>
                  <span className="status-chip muted">{STATUS_LABEL[snapshot.session.status] ?? snapshot.session.status}</span>
                </div>
                <h3>{snapshot.session.title}</h3>
                <p>{snapshot.session.description || "세션 설명이 아직 없습니다."}</p>
                <dl className="session-meta">
                  <div>
                    <dt>Invite</dt>
                    <dd>{snapshot.session.inviteCode}</dd>
                  </div>
                  <div>
                    <dt>Party</dt>
                    <dd>{snapshot.participants.length}</dd>
                  </div>
                </dl>
                <button type="button" onClick={onOpenPlay}>
                  세션 열기
                </button>
              </article>
            ) : (
              <article className="empty-card">
                <h3>아직 참가한 세션이 없습니다.</h3>
                <p>세션을 생성하거나 공개 세션에 합류하면 이곳에서 다시 열 수 있습니다.</p>
              </article>
            )}
          </div>
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>

      {activeModal === "create-room" ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Create room</span>
                <h2>새 방 생성</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setActiveModal(null)}>
                닫기
              </button>
            </div>

            <form className="modal-form" onSubmit={submitSession}>
              <label htmlFor="session-title">세션 이름</label>
              <input
                id="session-title"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                maxLength={100}
                required
              />

              <label htmlFor="scenario-id">시나리오</label>
              <select id="scenario-id" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                <option value="">기본 시나리오 사용</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.title}
                  </option>
                ))}
              </select>

              <label htmlFor="max-players">참가 인원 수 (GM 미포함)</label>
              <input
                id="max-players"
                type="number"
                min={1}
                max={8}
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Math.min(8, Math.max(1, Number(event.target.value) || 1)))}
              />

              <label className="toggle-field" htmlFor="use-ai-gm">
                <input
                  id="use-ai-gm"
                  type="checkbox"
                  checked={useAiGm}
                  onChange={(event) => setUseAiGm(event.target.checked)}
                />
                <span>AI GM 사용</span>
              </label>

              <button type="submit" className="primary" disabled={busy}>
                방 생성하고 입장
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {activeModal === "join-room" ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Invite access</span>
                <h2>초대 코드 입장</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setActiveModal(null)}>
                닫기
              </button>
            </div>

            <form className="modal-form" onSubmit={submitJoin}>
              <label htmlFor="invite-code">초대 코드</label>
              <input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="ABC123"
                maxLength={12}
                required
              />

              <button type="submit" className="primary" disabled={busy}>
                코드로 세션 입장
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
