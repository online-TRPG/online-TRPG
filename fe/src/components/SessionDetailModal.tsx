import type { SessionDetail, User } from "../types/session";

interface SessionDetailModalProps {
  detail: SessionDetail | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  canEnter: boolean;
  isCurrentSession: boolean;
  isKnownMember: boolean;
  onClose: () => void;
  onEnter: () => void | Promise<void>;
  onOpenHostProfile: (host: User) => void;
}

const STATUS_LABEL: Record<string, string> = {
  lobby: "Lobby",
  recruiting: "Recruiting",
  playing: "Playing",
  paused: "Paused",
  completed: "Completed",
  disbanded: "Disbanded",
};

const GM_MODE_LABEL: Record<string, string> = {
  AI: "AI GM",
  HUMAN: "인간 GM",
};

export function SessionDetailModal({
  detail,
  loading,
  error,
  busy,
  canEnter,
  isCurrentSession,
  isKnownMember,
  onClose,
  onEnter,
  onOpenHostProfile,
}: SessionDetailModalProps) {
  if (!loading && !detail && !error) return null;

  const activeScenario =
    detail?.sessionScenarios.find((item) => item.status === "ACTIVE")?.scenario ?? detail?.scenario ?? null;
  const participantCount = detail?.participants.filter((item) => item.status === "JOINED").length ?? 0;

  const enterLabel = isCurrentSession ? "현재 세션 열기" : isKnownMember ? "복귀하기" : "세션 참가";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card session-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">Session detail</span>
            <h2 id="session-detail-title">{detail?.session.title ?? "세션 정보를 불러오는 중입니다."}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            닫기
          </button>
        </header>

        {loading ? (
          <div className="session-detail-skeleton">
            <p>세션 정보를 불러오는 중입니다.</p>
          </div>
        ) : null}

        {!loading && error ? <p className="panel-error">{error}</p> : null}

        {!loading && detail ? (
          <div className="session-detail-content">
            <section className="session-detail-hero">
              <div>
                <div className="session-card-top">
                  <span className="status-chip">{activeScenario?.title ?? "Scenario pending"}</span>
                  <span className="status-chip muted">
                    {STATUS_LABEL[detail.session.status] ?? detail.session.status}
                  </span>
                </div>
                <p className="session-detail-description">
                  {detail.session.description?.trim() || "아직 세션 소개가 입력되지 않았습니다."}
                </p>
              </div>

              <div className="session-detail-actions">
                <button type="button" className="ghost" onClick={() => onOpenHostProfile(detail.host)}>
                  호스트 프로필 보기
                </button>
                <button type="button" className="primary" disabled={busy || !canEnter} onClick={() => void onEnter()}>
                  {enterLabel}
                </button>
              </div>
            </section>

            <section className="session-detail-grid">
              <article className="profile-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Overview</span>
                    <h2>세션 개요</h2>
                  </div>
                </div>
                <dl className="profile-kv-grid session-detail-kv">
                  <div className="profile-kv-item">
                    <dt>시나리오</dt>
                    <dd>{activeScenario?.title ?? "-"}</dd>
                  </div>
                  <div className="profile-kv-item">
                    <dt>룰셋</dt>
                    <dd>{detail.session.ruleSetId ?? "TRPG"}</dd>
                  </div>
                  <div className="profile-kv-item">
                    <dt>GM 모드</dt>
                    <dd>{GM_MODE_LABEL[detail.session.gmMode] ?? detail.session.gmMode}</dd>
                  </div>
                  <div className="profile-kv-item">
                    <dt>공개 범위</dt>
                    <dd>{detail.session.visibility}</dd>
                  </div>
                  <div className="profile-kv-item">
                    <dt>인원</dt>
                    <dd>
                      {participantCount} / {detail.session.maxParticipants}
                    </dd>
                  </div>
                  <div className="profile-kv-item">
                    <dt>다음 일정</dt>
                    <dd>{detail.session.nextSessionAt ?? "미정"}</dd>
                  </div>
                </dl>
              </article>

              <article className="profile-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Host</span>
                    <h2>호스트 정보</h2>
                  </div>
                </div>
                <div className="session-detail-host-card">
                  <div className="avatar avatar-xl">{detail.host.displayName.slice(0, 1)}</div>
                  <div className="session-detail-host-copy">
                    <strong>{detail.host.displayName}</strong>
                    <span>{detail.host.nickname || detail.host.name}</span>
                    <p>이 세션의 설정과 진행 입장은 호스트가 관리합니다. 자세한 정보는 프로필 화면에서 확인할 수 있습니다.</p>
                  </div>
                </div>
              </article>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
