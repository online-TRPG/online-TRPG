import { Icon } from "../components/Icon";
import type { AvailableSessionListItem, LogEntry, SessionSnapshot, StoredUser } from "../types/session";

interface LobbyPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  logs: LogEntry[];
  busy: boolean;
  error: string | null;
  onOpenDiscover: () => void;
  onOpenCreate: () => void;
  onOpenPlay: () => void;
  onLeaveCurrentSession: () => void | Promise<void>;
}

const STATUS_LABEL: Record<string, string> = {
  lobby: "Lobby",
  recruiting: "Recruiting",
  playing: "Playing",
  paused: "Paused",
  completed: "Completed",
  disbanded: "Disbanded",
};

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
}

export function LobbyPage({
  user,
  snapshot,
  sessionList,
  mySessionList,
  logs,
  busy,
  error,
  onOpenDiscover,
  onOpenCreate,
  onOpenPlay,
  onLeaveCurrentSession,
}: LobbyPageProps) {
  return (
    <main className="page-with-sidebar">
      <aside className="page-sidebar">
        <section className="page-sidebar-block">
          <span className="eyebrow">Welcome back</span>
          <h2>{user.displayName}</h2>
          <p>오늘 진행할 세션을 확인하거나, 새 모험을 바로 열어보세요.</p>
        </section>

        <div className="quick-action-panel">
          {snapshot ? (
            <button type="button" className="primary" onClick={onOpenPlay}>
              <Icon name="enter" />
              현재 세션 열기
            </button>
          ) : null}

          <button type="button" onClick={onOpenDiscover}>
            <Icon name="eye" />
            세션 찾기
          </button>

          <button type="button" onClick={onOpenCreate}>
            <Icon name="plus" />
            새 세션 만들기
          </button>

          {snapshot ? (
            <button type="button" disabled={busy} onClick={onLeaveCurrentSession}>
              <Icon name="close" />
              세션 나가기
            </button>
          ) : null}
        </div>
      </aside>

      <section className="main-column main-column-wide">
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
                  <span className="status-chip muted">{STATUS_LABEL[snapshot.session.status] ?? snapshot.session.status}</span>
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
              </article>
            ) : (
              <article className="empty-card">
                <h3>현재 참가 중인 세션이 없습니다.</h3>
                <p>공개 세션을 둘러보거나 새 모험을 만들어 첫 파티를 시작해보세요.</p>
              </article>
            )}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Overview</span>
              <h2>세션 현황</h2>
            </div>
          </div>

          <div className="dashboard-grid">
            <article className="dashboard-card">
              <strong>공개 세션</strong>
              <span>{sessionList.length}개</span>
              <p>지금 바로 참가 가능한 세션 수입니다.</p>
            </article>
            <article className="dashboard-card">
              <strong>내 세션</strong>
              <span>{mySessionList.length}개</span>
              <p>내가 참여 중이거나 기록이 남아 있는 세션입니다.</p>
            </article>
            <article className="dashboard-card">
              <strong>실시간 로그</strong>
              <span>{logs.length}건</span>
              <p>현재 앱 세션에서 수집된 이벤트 로그 수입니다.</p>
            </article>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recent</span>
              <h2>내 최근 세션</h2>
            </div>
          </div>

          <div className="card-grid joinable-room-grid">
            {mySessionList.length ? (
              mySessionList.slice(0, 6).map((item, index) => (
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
                      <dt>Role</dt>
                      <dd>{item.role ?? "-"}</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <article className="empty-card">
                <h3>아직 참여한 세션이 없습니다.</h3>
                <p>세션을 시작하면 여기서 최근 활동을 빠르게 확인할 수 있습니다.</p>
              </article>
            )}
          </div>
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </main>
  );
}
