import { useEffect, useState } from "react";
import bannerMainImage from "../assets/images/Banner_Main.webp";
import boxBrickImage from "../components/Box_Brick.webp";
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

const PAGE_TOAST_DURATION_MS = 2600;

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

export function LobbyPage({
  sessionList,
  mySessionList,
  busy,
  error,
  onOpenDiscover,
  onOpenCreate,
}: LobbyPageProps) {
  const [pageToast, setPageToast] = useState<string | null>(null);

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
      {pageToast ? (
        <button type="button" className="page-error-toast" onClick={() => setPageToast(null)}>
          {pageToast}
        </button>
      ) : null}

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
          onClick={onOpenDiscover}
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
