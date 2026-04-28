import { FormEvent, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import type { AvailableSessionListItem, LogEntry, Scenario, SessionSnapshot, StoredUser } from "../types/session";

interface LobbyPageProps {
  user: StoredUser;
  scenarios: Scenario[];
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
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
  onLeaveCurrentSession: () => void | Promise<void>;
}

type LobbyModal = "create-room" | "join-room" | null;
type SidebarSection = "current" | "joinable" | "my-sessions";

const STATUS_LABEL: Record<string, string> = {
  lobby: "Lobby",
  recruiting: "Recruiting",
  playing: "Playing",
  paused: "Paused",
  completed: "Completed",
  disbanded: "Disbanded",
};

const PAGE_SIZE = 10;

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
}

function renderSessionCard(
  item: AvailableSessionListItem,
  index: number,
  disabled: boolean,
  onJoin: (sessionId: string) => void | Promise<void>,
) {
  return (
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
      <button type="button" disabled={disabled} onClick={() => void onJoin(item.sessionId)}>
        <Icon name="enter" />
        Join
      </button>
    </article>
  );
}

export function LobbyPage({
  scenarios,
  snapshot,
  sessionList,
  mySessionList,
  busy,
  error,
  onCreateSession,
  onJoinSession,
  onJoinSessionById,
  onOpenPlay,
  onLeaveCurrentSession,
}: LobbyPageProps) {
  const [activeModal, setActiveModal] = useState<LobbyModal>(null);
  const [activeSection, setActiveSection] = useState<SidebarSection>(() => (snapshot ? "current" : "joinable"));
  const [sessionTitle, setSessionTitle] = useState("New session");
  const [scenarioId, setScenarioId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [useAiGm, setUseAiGm] = useState(true);
  const [page, setPage] = useState(0);

  const hasRecruitingSession = snapshot?.session.status === "recruiting";
  const totalPages = Math.max(1, Math.ceil(sessionList.length / PAGE_SIZE));
  const pagedSessions = useMemo(
    () => sessionList.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [page, sessionList],
  );

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;

    void onCreateSession(sessionTitle, {
      scenarioId: scenarioId || undefined,
      maxParticipants: maxPlayers,
      useAiGm,
    });
    setActiveModal(null);
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;

    void onJoinSession(inviteCode.trim().toUpperCase());
    setActiveModal(null);
  }

  return (
    <main className="page-with-sidebar">
      <aside className="page-sidebar">
        <nav className="section-nav" aria-label="Lobby sections">
          <button
            type="button"
            className={activeSection === "current" ? "active" : ""}
            onClick={() => setActiveSection("current")}
          >
            현재 세션
            <span>{snapshot ? 1 : 0}</span>
          </button>
          <button
            type="button"
            className={activeSection === "joinable" ? "active" : ""}
            onClick={() => setActiveSection("joinable")}
          >
            참가 가능 세션
            <span>{sessionList.length}</span>
          </button>
          <button
            type="button"
            className={activeSection === "my-sessions" ? "active" : ""}
            onClick={() => setActiveSection("my-sessions")}
          >
            진행 중인 세션
            <span>{mySessionList.length}</span>
          </button>
        </nav>

        <div className="quick-action-panel">
          {snapshot ? (
            <button type="button" className="primary" onClick={onOpenPlay}>
              <Icon name="enter" />
              세션 로비 복귀
            </button>
          ) : null}
          {snapshot ? (
            <button type="button" disabled={busy} onClick={onLeaveCurrentSession}>
              <Icon name="close" />
              세션 나가기
            </button>
          ) : null}
          <button
            type="button"
            className={snapshot ? "" : "primary"}
            disabled={busy || hasRecruitingSession}
            onClick={() => setActiveModal("join-room")}
          >
            <Icon name="enter" />
            세션 참가
          </button>
          <button
            type="button"
            disabled={busy || hasRecruitingSession}
            onClick={() => setActiveModal("create-room")}
          >
            <Icon name="plus" />
            세션 만들기
          </button>
        </div>
      </aside>

      <section className="main-column main-column-wide">
        {activeSection === "current" ? (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Current room</span>
                <h2>현재 세션</h2>
              </div>
            </div>

            <div className="card-grid">
              {snapshot ? (
                <article className="session-card">
                  <div className="session-card-top">
                    <span className="status-chip">{snapshot.session.gmMode} GM</span>
                    <span className="status-chip muted">
                      {STATUS_LABEL[snapshot.session.status] ?? snapshot.session.status}
                    </span>
                  </div>
                  <h3>{snapshot.session.title}</h3>
                  <p>{snapshot.session.description || "현재 참가 중인 세션입니다."}</p>
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
                  <button type="button" className="ghost" disabled={busy} onClick={onLeaveCurrentSession}>
                    세션 나가기
                  </button>
                </article>
              ) : (
                <article className="empty-card">
                  <h3>현재 참가 중인 세션이 없습니다.</h3>
                  <p>좌측 메뉴에서 참가 가능한 세션을 확인하거나 새 세션을 만드세요.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "joinable" ? (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Joinable rooms</span>
                <h2>참가 가능 세션</h2>
              </div>
            </div>

            <div className="card-grid joinable-room-grid">
              {pagedSessions.length ? (
                pagedSessions.map((item, index) =>
                  renderSessionCard(item, index, busy || hasRecruitingSession, onJoinSessionById),
                )
              ) : (
                <article className="empty-card">
                  <h3>현재 공개 세션이 없습니다.</h3>
                  <p>새 세션을 만들거나 나중에 다시 확인하세요.</p>
                </article>
              )}
            </div>

            {sessionList.length > PAGE_SIZE ? (
              <div className="pagination-row">
                <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                  Prev
                </button>
                <span>
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeSection === "my-sessions" ? (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <span className="eyebrow">My sessions</span>
                <h2>진행 중인 세션</h2>
              </div>
            </div>

            <div className="card-grid joinable-room-grid">
              {mySessionList.length ? (
                mySessionList.map((item, index) =>
                  renderSessionCard(item, index, busy, onJoinSessionById),
                )
              ) : (
                <article className="empty-card">
                  <h3>참여한 세션이 없습니다.</h3>
                  <p>진행 중, 일시정지, 완료된 세션이 여기에 표시됩니다.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {error ? <p className="panel-error">{error}</p> : null}
      </section>

      {activeModal === "create-room" ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Create room</span>
                <h2>Create session</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setActiveModal(null)}>
                Close
              </button>
            </div>

            <form className="modal-form" onSubmit={submitSession}>
              <label htmlFor="session-title">Title</label>
              <input
                id="session-title"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                maxLength={100}
                required
              />

              <label htmlFor="scenario-id">Scenario</label>
              <select id="scenario-id" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                <option value="">Select a scenario</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.title}
                  </option>
                ))}
              </select>

              <label htmlFor="max-players">Max participants</label>
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
                <span>Use AI GM</span>
              </label>

              <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
                Create
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
                <h2>Join by invite code</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setActiveModal(null)}>
                Close
              </button>
            </div>

            <form className="modal-form" onSubmit={submitJoin}>
              <label htmlFor="invite-code">Invite code</label>
              <input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="ABC123"
                maxLength={12}
                required
              />

              <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
                Join
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
