/*
 * SessionDetailPage
 * 역할: 공개/내 세션 상세 정보를 보여주고 참가 또는 현재 세션 복귀를 처리합니다.
 * 읽는 순서:
 * 1) STATUS_LABEL/GM_MODE_LABEL: 서버 상태값을 화면 문구로 변환
 * 2) state/useEffect: sessionPublicId로 상세 정보 조회
 * 3) canonicalPath useEffect: 세션 공개 주소를 정규화
 * 4) handleEnter: 이미 참여한 세션이면 열기, 아니면 참가 후 플레이 화면 이동
 * 5) JSX: 로딩/에러 상태, 세션 헤더, 메타 정보, 호스트 카드
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSessionDetail } from "../services/api";
import type { SessionDetail, SessionSnapshot, StoredUser, User } from "../types/session";
import { buildSessionPath } from "../utils/routes";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
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

// 서버에서 받은 세션 상태값을 화면 문구로 바꾸는 매핑입니다.
const STATUS_LABEL: Record<string, string> = {
  recruiting: "Recruiting",
  playing: "Playing",
  paused: "Paused",
  completed: "Completed",
  disbanded: "Disbanded",
};

// GM 모드 값(AI/HUMAN)을 사용자에게 보여줄 라벨로 바꿉니다.
const GM_MODE_LABEL: Record<string, string> = {
  AI: "AI GM",
  HUMAN: "인간 GM",
};

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
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
  // 라우터 훅: 세션 상세 주소를 canonical path로 정리할 때 사용합니다.
  const location = useLocation();
  const navigate = useNavigate();
  // 상세 API 응답, 로딩, 에러 상태입니다.
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // sessionPublicId가 바뀔 때마다 세션 상세 정보를 다시 불러옵니다.
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

  // 현재 접속 중인 세션인지, 이미 참여한 세션인지 판단해 버튼 문구/동작을 결정합니다.
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

  // 세션 입장 버튼 동작: 현재 세션이면 바로 열고, 아니면 참가 API 호출 후 플레이 화면으로 갑니다.
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

  // 로딩/에러는 본문 카드 대신 단순 상태 화면을 먼저 반환합니다.
  if (loading) {
    return (
      <main className="session-page">
      {/* 로딩 상태 카드입니다. */}
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
      {/* 세션 제목/설명과 입장 액션 버튼 영역입니다. */}
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

      {/* 세션 메타 정보와 호스트 프로필 정보를 나란히 보여줍니다. */}
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
              <dd>{detail.session.gmMode === "AI" ? "AI GM" : "\uC77C\uBC18 GM"}</dd>
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

