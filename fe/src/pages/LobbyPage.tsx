/*
 * LobbyPage
 * 역할: 로그인 후 처음 보이는 메인 로비/랜딩 페이지입니다.
 * 읽는 순서:
 * 1) LobbyPageProps: 세션 목록 수와 페이지 이동 콜백
 * 2) PlusIcon: "세션 생성" 카드에 들어가는 장식 SVG
 * 3) pageToast state/useEffect: 페이지 상단 에러 토스트 자동 닫기
 * 4) JSX: 히어로 배너, 공개 세션/내 세션/세션 생성 카드
 */
import { useEffect, useState } from "react";
import bannerMainImage from "../assets/images/Banner_Main.webp";
import boxBrickImage from "../components/Box_Brick.webp";
import type { AvailableSessionListItem, LogEntry, SessionSnapshot, StoredUser } from "../types/session";
import "./LobbyPage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface LobbyPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  logs: LogEntry[];
  busy: boolean;
  error: string | null;
  onOpenDiscover: () => void;
  onOpenMySessions: () => void;
  onOpenCreate: () => void;
  onOpenPlay: () => void;
  onLeaveCurrentSession: () => void | Promise<void>;
}

// 에러 토스트가 화면에 머무는 시간입니다.
const PAGE_TOAST_DURATION_MS = 2600;

// 세션 생성 카드에 쓰는 장식용 플러스 아이콘입니다.
function PlusIcon() {
  return (
    <svg viewBox="0 0 64 64" className="main-landing-plusicon-svg" aria-hidden="true">
      <path
        d="M24 8c0-4.418 3.582-8 8-8s8 3.582 8 8v16h16c4.418 0 8 3.582 8 8s-3.582 8-8 8H40v16c0 4.418-3.582 8-8 8s-8-3.582-8-8V40H8c-4.418 0-8-3.582-8-8s3.582-8 8-8h16V8Z"
        fill="currentColor"
      />
    </svg>
  );
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function LobbyPage({
  sessionList,
  mySessionList,
  busy,
  error,
  onOpenDiscover,
  onOpenMySessions,
  onOpenCreate,
}: LobbyPageProps) {
  // error prop을 짧은 시간 보여주는 로컬 토스트 상태입니다.
  const [pageToast, setPageToast] = useState<string | null>(null);

  // 부모에서 내려온 error가 바뀌면 토스트를 띄우고 일정 시간 뒤 닫습니다.
  useEffect(() => {
    if (!error) return;
    setPageToast(error);
    const timeout = window.setTimeout(() => {
      setPageToast((current) => (current === error ? null : current));
    }, PAGE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [error]);

  return (
    <main className="main-landing-page">
      {/* 상단에 뜨는 임시 에러/알림 토스트입니다. */}
      {pageToast ? (
        <button type="button" className="page-error-toast" onClick={() => setPageToast(null)}>
          {pageToast}
        </button>
      ) : null}

      {/* 메인 배너와 주요 액션 카드 영역입니다. */}
      <section className="main-landing-hero">
        <img src={bannerMainImage} alt="모두의 TRPG" className="main-landing-banner" />
        <p className="main-landing-tagline">최상의 온라인 TRPG 경험</p>
      </section>

      <section className="main-landing-stats">
        <article
          className="main-landing-statcard"
          style={{ backgroundImage: `url(${boxBrickImage})` }}
          onClick={onOpenDiscover}
          role="button"
          tabIndex={0}
        >
          <h2>공개 세션</h2>
          <div className="main-landing-statvalue">
            <strong>{sessionList.length}</strong>
            <span>개</span>
          </div>
        </article>

        <article
          className="main-landing-statcard"
          style={{ backgroundImage: `url(${boxBrickImage})` }}
          onClick={onOpenMySessions}
          role="button"
          tabIndex={0}
        >
          <h2>내 세션</h2>
          <div className="main-landing-statvalue">
            <strong>{mySessionList.length}</strong>
            <span>개</span>
          </div>
        </article>

        <article
          className="main-landing-statcard main-landing-statcard-accent"
          style={{ backgroundImage: `url(${boxBrickImage})` }}
          onClick={onOpenCreate}
          role="button"
          tabIndex={0}
          aria-disabled={busy}
        >
          <h2>새 세션</h2>
          <div className="main-landing-plusicon" aria-hidden="true">
            <PlusIcon />
          </div>
        </article>
      </section>

      <section className="main-landing-cta">
        <p className="main-landing-cta-button">지금 바로 시작해보세요 !!</p>
      </section>
    </main>
  );
}
