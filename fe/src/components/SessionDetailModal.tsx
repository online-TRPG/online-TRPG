import modalFancyBlue from "./Modal_Fancy_Blue.webp";
import buttonFancyBlue from "./Button_Fancy_Blue.webp";
import buttonFancyBlueCancel from "./Button_Fancy_Blue_Cancel.webp";
import {
  GmMode,
  SessionActivityStatus,
  SessionJoinPolicy,
  SessionParticipantStatus,
  SessionScenarioStatus,
  isAiGmMode,
} from "@trpg/shared-types/frontend";
import { scenarioPlaceholder } from "../data/sessionVisuals";
import type { SessionDetail, User } from "../types/session";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";

interface SessionDetailModalProps {
  detail: SessionDetail | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  canEnter: boolean;
  isKnownMember: boolean;
  onClose: () => void;
  onEnter: () => void | Promise<void>;
  onOpenHostProfile: (host: User) => void;
}

const GM_MODE_LABEL: Record<GmMode, string> = {
  [GmMode.AI]: "AI GM",
  [GmMode.HUMAN]: "사람 GM",
};

function getDetailErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error.includes("Failed to fetch")) return "세션 정보를 불러오지 못했습니다.";
  return error;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function getIntroductionMaxLength(value: string): number {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value) ? 40 : 75;
}

function MetaIcon({ kind }: { kind: "star" | "users" | "clock" | "book" | "quill" }) {
  if (kind === "star") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8l2.7 5.6 6.2.9-4.5 4.3 1.1 6.1L12 16.8l-5.5 2.9 1.1-6.1L3.1 9.3l6.2-.9L12 2.8z" />
      </svg>
    );
  }

  if (kind === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 11a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm6 1a3 3 0 100-6 3 3 0 000 6zM4 19.2c0-2.7 2.6-4.7 5.7-4.7s5.7 2 5.7 4.7V21H4v-1.8zm12.4 1.8v-1.4c0-1.1-.3-2.1-1-3 2.2.2 4.6 1.4 4.6 4.1V21h-3.6z" />
      </svg>
    );
  }

  if (kind === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5A8.5 8.5 0 1120.5 12 8.5 8.5 0 0112 3.5zm0 2A6.5 6.5 0 1018.5 12 6.5 6.5 0 0012 5.5zm-1 2.2h2v4.1l3 1.8-1 1.7-4-2.4V7.7z" />
      </svg>
    );
  }

  if (kind === "book") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.2C4 4 5 3 6.2 3H11c1.1 0 2 .4 2.7 1.1C14.4 3.4 15.3 3 16.4 3H21v16.8h-4.6c-1 0-1.8.3-2.4.9l-.5.5-.5-.5c-.6-.6-1.4-.9-2.4-.9H6.2C5 19.8 4 18.8 4 17.6V5.2zm2 .3v12.1c0 .1.1.2.2.2H11c.8 0 1.6.1 2.3.4V6.1C12.8 5.7 12 5.5 11 5.5H6zm9.3.6v12.1c.7-.3 1.5-.4 2.3-.4H19V5.5h-3.7c-.9 0-1.8.2-2.3.6z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.2 18.5l1-4.1 7.8-7.8a2.1 2.1 0 113 3l-7.8 7.8-4 .9zM13.7 6.9l3.4 3.4" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function SessionDetailModal({
  detail,
  loading,
  error,
  busy,
  canEnter,
  isKnownMember,
  onClose,
  onEnter,
  onOpenHostProfile,
}: SessionDetailModalProps) {
  const dialogFocus = useDialogFocusTrap<HTMLElement>(Boolean(loading || detail || error), onClose);
  if (!loading && !detail && !error) return null;

  const activeScenario =
    detail?.sessionScenarios.find((item) => item.status === SessionScenarioStatus.ACTIVE)?.scenario ?? detail?.scenario ?? null;
  const participantCount = detail?.participants.filter((item) => item.status === SessionParticipantStatus.JOINED).length ?? 0;
  const detailError = getDetailErrorMessage(error);

  const previewImage = activeScenario?.thumbnailUrl?.trim() || scenarioPlaceholder;
  const rawScenarioIntroduction =
    activeScenario?.description?.trim() ||
    detail?.session.description?.trim() ||
    "시나리오 설명이 아직 입력되지 않았습니다.";
  const scenarioIntroduction = truncateText(
    rawScenarioIntroduction,
    getIntroductionMaxLength(rawScenarioIntroduction),
  );
  const gmModeLabel = detail
    ? isAiGmMode(detail.session.gmMode)
      ? GM_MODE_LABEL[GmMode.AI]
      : GM_MODE_LABEL[GmMode.HUMAN]
    : GM_MODE_LABEL[GmMode.AI];
  const difficultyLabel = activeScenario?.difficulty?.trim() || "난이도 미정";
  const durationLabel = activeScenario?.estimatedMinutes
    ? `약 ${activeScenario.estimatedMinutes}분`
    : "예상 시간 미정";
  const themeLabel = activeScenario?.tags?.length
    ? activeScenario.tags.join(" / ")
    : "테마 미정";
  const recommendationTags = activeScenario?.tags ?? [];
  const recommendedPlayersLabel =
    activeScenario?.recommendedPlayersMin && activeScenario?.recommendedPlayersMax
      ? `${activeScenario.recommendedPlayersMin}~${activeScenario.recommendedPlayersMax}명 권장`
      : activeScenario?.recommendedPlayersMin
        ? `${activeScenario.recommendedPlayersMin}명 이상 권장`
        : activeScenario?.recommendedPlayersMax
          ? `${activeScenario.recommendedPlayersMax}명 이하 권장`
          : "권장 인원 미정";
  const canEnterLive = detail && [SessionActivityStatus.LOBBY_OPEN, SessionActivityStatus.PLAYING]
    .includes(detail.session.activityStatus);
  const enterLabel = isKnownMember
    ? canEnterLive ? "대기실 입장" : "세션 홈 열기"
    : detail?.session.joinPolicy === SessionJoinPolicy.APPROVAL_REQUIRED
      ? "참가 신청 화면 열기"
      : "참여하기";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogFocus.dialogRef}
        tabIndex={-1}
        className="session-detail-modal-fancy"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        onKeyDown={dialogFocus.onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
        style={{ backgroundImage: `url(${modalFancyBlue})` }}
      >
        <button
          type="button"
          className="session-detail-close"
          onClick={onClose}
          aria-label="모달 닫기"
          style={{ backgroundImage: `url(${buttonFancyBlueCancel})` }}
        />

        <header className="session-detail-fancy-header">
          <span className="session-detail-fancy-star">✦</span>
          <h2 id="session-detail-title">시나리오 상세 정보</h2>
          <span className="session-detail-fancy-star">✦</span>
        </header>

        {loading ? (
          <div className="session-detail-skeleton session-detail-skeleton-fancy">
            <p>세션 정보를 불러오는 중입니다.</p>
          </div>
        ) : null}

        {!loading && detailError ? <p className="panel-error session-detail-error">{detailError}</p> : null}

        {!loading && detail ? (
          <div className="session-detail-fancy-content">
            <div className="session-detail-fancy-main">
              <section className="session-detail-fancy-left">
                <div className="session-detail-titlebar">
                  <h3 className="session-detail-scenario-title">{detail.session.title}</h3>
                  <div className="session-detail-titlemeta">
                    <div className="session-detail-pill session-detail-pill-primary">{gmModeLabel}</div>
                    <button type="button" className="session-detail-hostlink" onClick={() => onOpenHostProfile(detail.host)}>
                      세션 관리자: {detail.host.displayName}
                    </button>
                  </div>
                </div>

                <div className="session-detail-scenario-image">
                  <img src={previewImage} alt={detail.session.title} />
                </div>

                <section className="session-detail-fancy-section">
                  <div className="session-detail-fancy-section-title">
                    <MetaIcon kind="quill" />
                    <strong>시나리오 소개</strong>
                  </div>
                  <p className="session-detail-introduction">{scenarioIntroduction}</p>
                </section>

                <section className="session-detail-fancy-section session-detail-fancy-tags">
                  <div className="session-detail-fancy-section-title">
                    <MetaIcon kind="star" />
                    <strong>테마 태그</strong>
                  </div>
                  <div className="session-detail-tag-list">
                    {recommendationTags.length ? recommendationTags.map((tag) => (
                      <span key={tag} className="session-detail-tag">{tag}</span>
                    )) : <span className="session-detail-tag">태그 미정</span>}
                  </div>
                </section>
              </section>

              <aside className="session-detail-fancy-right">
                <div className="session-detail-factcard">
                  <div className="session-detail-facticon">
                    <MetaIcon kind="users" />
                  </div>
                  <div>
                    <span>플레이 인원</span>
                    <strong>
                      {participantCount} / {detail.session.maxParticipants}
                    </strong>
                    <small>{recommendedPlayersLabel}</small>
                  </div>
                </div>

                <div className="session-detail-factcard">
                  <div className="session-detail-facticon">
                    <MetaIcon kind="star" />
                  </div>
                  <div>
                    <span>난이도</span>
                    <strong>{difficultyLabel}</strong>
                  </div>
                </div>

                <div className="session-detail-factcard">
                  <div className="session-detail-facticon">
                    <MetaIcon kind="clock" />
                  </div>
                  <div>
                    <span>예상 시간</span>
                    <strong>{durationLabel}</strong>
                  </div>
                </div>

                <div className="session-detail-factcard">
                  <div className="session-detail-facticon">
                    <MetaIcon kind="book" />
                  </div>
                  <div>
                    <span>테마</span>
                    <strong>{themeLabel}</strong>
                  </div>
                </div>

                <div className="session-detail-hostline">
                  <button
                    type="button"
                    className="session-detail-enter"
                    disabled={busy || !canEnter}
                    onClick={() => void onEnter()}
                    style={{ backgroundImage: `url(${buttonFancyBlue})` }}
                  >
                    <span>{enterLabel}</span>
                  </button>
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
