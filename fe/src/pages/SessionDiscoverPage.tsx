import { FormEvent, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { SessionDetailModal } from "../components/SessionDetailModal";
import type {
  AvailableSessionListItem,
  SessionDetail,
  SessionSnapshot,
  User,
} from "../types/session";

interface SessionDiscoverPageProps {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  busy: boolean;
  error: string | null;
  onJoinSession: (inviteCode: string) => void | Promise<void>;
  onJoinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  onRequestSessionDetail: (sessionId: string) => Promise<SessionDetail>;
  onOpenHostProfile: (host: User) => void;
  onOpenCreate: () => void;
  onOpenPlay: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  lobby: "Lobby",
  recruiting: "Recruiting",
  playing: "Playing",
  paused: "Paused",
  completed: "Completed",
  disbanded: "Disbanded",
};

const PAGE_SIZE = 12;

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionPublicId || item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
}

export function SessionDiscoverPage({
  snapshot,
  sessionList,
  mySessionList,
  busy,
  error,
  onJoinSession,
  onJoinSessionById,
  onRequestSessionDetail,
  onOpenHostProfile,
  onOpenCreate,
  onOpenPlay,
}: SessionDiscoverPageProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const hasRecruitingSession = snapshot?.session.status === "recruiting";
  const joinedSessionIds = useMemo(() => new Set(mySessionList.map((item) => item.sessionId)), [mySessionList]);

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sessionList;
    return sessionList.filter((item) =>
      [item.title, item.scenarioTitle, item.ruleSetName].some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [query, sessionList]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const pagedSessions = useMemo(
    () => filteredSessions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filteredSessions, page],
  );

  function submitJoinByInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;
    void onJoinSession(inviteCode.trim().toUpperCase());
  }

  async function openSessionDetail(sessionId: string) {
    setSelectedSessionDetail(null);
    setDetailBusy(true);
    setDetailError(null);

    try {
      const detail = await onRequestSessionDetail(sessionId);
      setSelectedSessionDetail(detail);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "세션 상세 정보를 불러오지 못했습니다.");
    } finally {
      setDetailBusy(false);
    }
  }

  function closeSessionDetail() {
    setSelectedSessionDetail(null);
    setDetailBusy(false);
    setDetailError(null);
  }

  async function enterSelectedSession() {
    if (!selectedSessionDetail) return;

    const targetSessionId = selectedSessionDetail.session.id;
    const isCurrentSession = snapshot?.session.id === targetSessionId;

    if (isCurrentSession) {
      closeSessionDetail();
      onOpenPlay();
      return;
    }

    const nextSnapshot = await onJoinSessionById(targetSessionId);
    if (nextSnapshot) {
      closeSessionDetail();
      onOpenPlay();
    }
  }

  function openSelectedHostProfile(host: User) {
    closeSessionDetail();
    onOpenHostProfile(host);
  }

  const isCurrentSelectedSession = selectedSessionDetail?.session.id === snapshot?.session.id;
  const isKnownSelectedSession =
    (selectedSessionDetail ? joinedSessionIds.has(selectedSessionDetail.session.id) : false) || isCurrentSelectedSession;
  const canEnterSelectedSession =
    isCurrentSelectedSession || isKnownSelectedSession || !hasRecruitingSession;

  return (
    <main className="session-page">
      <section className="session-page-header">
        <div>
          <span className="eyebrow">Discover sessions</span>
          <h1>게임 찾기</h1>
          <p>공개 세션을 탐색하고, 초대 코드로 바로 참가할 수 있습니다.</p>
        </div>
        <div className="session-page-actions">
          {snapshot ? (
            <button type="button" className="ghost" onClick={onOpenPlay}>
              현재 세션 열기
            </button>
          ) : null}
          <button type="button" className="primary small" onClick={onOpenCreate}>
            새 세션 만들기
          </button>
        </div>
      </section>

      <section className="session-page-grid">
        <article className="session-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Invite</span>
              <h2>초대 코드 참가</h2>
            </div>
          </div>

          <form className="modal-form" onSubmit={submitJoinByInvite}>
            <label htmlFor="discover-invite-code">Invite code</label>
            <input
              id="discover-invite-code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="ABC123"
              maxLength={12}
              required
            />
            <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
              참가하기
            </button>
          </form>
        </article>

        <article className="session-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Filter</span>
              <h2>공개 세션 탐색</h2>
            </div>
          </div>

          <label htmlFor="discover-query">검색</label>
          <input
            id="discover-query"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="세션 제목, 시나리오, 룰셋"
          />
          <p className="helper-copy">
            총 {filteredSessions.length}개의 세션이 검색되었습니다. 이미 모집 중인 세션에 참가한 상태라면 추가 참가가 제한될 수 있습니다.
          </p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Public rooms</span>
            <h2>참가 가능 세션</h2>
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
                <div className="session-card-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void openSessionDetail(item.sessionPublicId || item.sessionId)}
                  >
                    <Icon name="eye" />
                    상세 보기
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="empty-card">
              <h3>검색 결과가 없습니다.</h3>
              <p>검색어를 지우거나 새 세션을 만들어보세요.</p>
            </article>
          )}
        </div>

        {filteredSessions.length > PAGE_SIZE ? (
          <div className="pagination-row">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
              Prev
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((current) => current + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">My sessions</span>
            <h2>내 세션 빠른 보기</h2>
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
                <div className="session-card-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void openSessionDetail(item.sessionPublicId || item.sessionId)}
                  >
                    <Icon name="eye" />
                    상세 보기
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="empty-card">
              <h3>아직 내 세션이 없습니다.</h3>
              <p>새 세션을 열거나 공개 세션에 참가하면 여기에 표시됩니다.</p>
            </article>
          )}
        </div>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}

      <SessionDetailModal
        detail={selectedSessionDetail}
        loading={detailBusy}
        error={detailError}
        busy={busy}
        canEnter={canEnterSelectedSession}
        isCurrentSession={isCurrentSelectedSession}
        isKnownMember={isKnownSelectedSession}
        onClose={closeSessionDetail}
        onEnter={enterSelectedSession}
        onOpenHostProfile={openSelectedHostProfile}
      />
    </main>
  );
}
