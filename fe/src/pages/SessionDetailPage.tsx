import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSessionDetail } from "../services/api";
import type { SessionDetail, SessionSnapshot, StoredUser, User } from "../types/session";
import { buildSessionPath } from "../utils/routes";

interface SessionDetailPageProps {
  user: StoredUser;
  accessToken: string | null;
  sessionPublicId: string;
  snapshot: SessionSnapshot | null;
  busy: boolean;
  onJoinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  onOpenPlay: () => void;
  onOpenHostProfile: (host: User) => void;
}

const STATUS_LABEL: Record<string, string> = {
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

export function SessionDetailPage({
  user,
  accessToken,
  sessionPublicId,
  snapshot,
  busy,
  onJoinSessionById,
  onOpenPlay,
  onOpenHostProfile,
}: SessionDetailPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getSessionDetail(user, sessionPublicId, accessToken)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "세션 상세 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, sessionPublicId, user]);

  const isCurrentSession = detail?.session.id === snapshot?.session.id;
  const isKnownMember = isCurrentSession || (detail ? snapshot?.session.id === detail.session.id : false);
  const activeScenario =
    detail?.sessionScenarios.find((item) => item.status === "ACTIVE")?.scenario ?? detail?.scenario ?? null;
  const participantCount = detail?.participants.filter((item) => item.status === "JOINED").length ?? 0;
  const canonicalPath = detail ? buildSessionPath(detail.session) : null;

  useEffect(() => {
    if (!canonicalPath) return;
    if (location.pathname === canonicalPath) return;
    navigate(canonicalPath, { replace: true });
  }, [canonicalPath, location.pathname, navigate]);

  async function handleEnter() {
    if (!detail) return;
    if (isCurrentSession) {
      onOpenPlay();
      return;
    }

    const nextSnapshot = await onJoinSessionById(detail.session.publicId);
    if (nextSnapshot) {
      onOpenPlay();
    }
  }

  if (loading) {
    return (
      <main className="session-page">
        <section className="session-form-card">
          <p>세션 정보를 불러오는 중입니다.</p>
        </section>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="session-page">
        <section className="session-form-card">
          <p className="panel-error">{error ?? "세션 정보를 불러오지 못했습니다."}</p>
        </section>
      </main>
    );
  }

  const enterLabel = isCurrentSession ? "현재 세션 열기" : isKnownMember ? "복귀하기" : "세션 참가";

  return (
    <main className="session-page">
      <section className="session-page-header">
        <div>
          <span className="eyebrow">Session detail</span>
          <h1>{detail.session.title}</h1>
          <p>{detail.session.description?.trim() || "아직 세션 소개가 입력되지 않았습니다."}</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={() => onOpenHostProfile(detail.host)}>
            호스트 프로필 보기
          </button>
          <button type="button" className="primary small" disabled={busy} onClick={() => void handleEnter()}>
            {enterLabel}
          </button>
        </div>
      </section>

      <section className="profile-grid">
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
              <dt>상태</dt>
              <dd>{STATUS_LABEL[detail.session.status] ?? detail.session.status}</dd>
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
              <p>탐색 페이지에서는 모달로 빠르게 확인하고, 직접 링크로 들어오면 이 상세 페이지에서 세션 정보를 볼 수 있습니다.</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

