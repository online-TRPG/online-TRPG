/*
 * SessionDiscoverPage
 * 역할: 공개 세션과 내 세션을 탐색하고, 초대 코드 또는 목록 선택으로 세션에 참가하는 페이지입니다.
 * 읽는 순서:
 * 1) 상단 헬퍼: 상태/GM 라벨 변환, 초대 코드/페이지 에러 메시지 정리
 * 2) state: 현재 탭, 검색/필터/정렬, 페이지네이션, 초대 모달, 상세 모달
 * 3) useSessionCatalog: 공개/내 세션의 서버 검색·정렬·페이지 상태 분리
 * 4) handler: 초대 코드 참가, 상세 모달 열기, 세션 참가/복귀, 페이지 이동
 * 5) JSX: 좌측 사이드바, 필터 바, 세션 카드 목록, 페이지네이션, 초대 코드 모달, 상세 모달
 */
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import {
  GmMode,
  SessionActivityStatus,
  SessionListSort,
} from "@trpg/shared-types/frontend";
import { Icon } from "../components/Icon";
import { SessionDetailModal } from "../components/SessionDetailModal";
import sidePanelImage from "../components/Side_Panel.webp";
import sidebarFooterImage from "../assets/images/Sidebar_Footer_Image.webp";
import dragonPeekImage from "../assets/images/Peak_a_Boo_Dragon.webp";
import { scenarioPlaceholder } from "../data/sessionVisuals";
import { useSessionCatalog } from "../hooks/useSessionCatalog";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import {
  getGmModeLabel,
  getSessionActivityStatusLabel,
  getSessionStatusLabel,
  sessionActivityStatusLabels,
} from "../presentation/sessionLabels";
import type { AvailableSessionListItem, SessionDetail, SessionSnapshot, StoredUser, User } from "../types/session";
import "./SessionDiscoverPage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface SessionDiscoverPageProps {
  user: StoredUser;
  accessToken: string | null;
  snapshot: SessionSnapshot | null;
  mySessionList: AvailableSessionListItem[];
  initialSection?: DiscoverSection;
  busy: boolean;
  error: string | null;
  onClearError: () => void;
  onJoinSession: (inviteCode: string) => Promise<SessionSnapshot | null>;
  onJoinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  onRequestSessionDetail: (sessionId: string) => Promise<SessionDetail>;
  onOpenHostProfile: (host: User) => void;
}

// 세션 탐색 탭 종류입니다. public은 공개 목록, my는 내가 참여한 목록입니다.
type DiscoverSection = "public" | "my";
interface DiscoverFilters {
  query: string;
  gmMode: string;
  status: string;
  sort: SessionListSort;
}
// 서버 세션 상태값을 한국어 라벨로 바꿉니다.
const PAGE_SIZE = 4;
const PAGE_TOAST_DURATION_MS = 2600;
const AI_GM_LABEL = "AI GM";
const ALL_FILTER = "all";
const GM_FILTER_OPTIONS = [GmMode.AI, GmMode.HUMAN] as const;
const DEFAULT_FILTERS: DiscoverFilters = {
  query: "",
  gmMode: ALL_FILTER,
  status: ALL_FILTER,
  sort: SessionListSort.RECENT,
};

// GM 모드 값에 따라 일반 GM/AI GM 라벨을 반환합니다.
function readFilterValue(value: string, options: readonly string[]): string | null {
  return value === ALL_FILTER || options.includes(value) ? value : null;
}

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionPublicId || item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
}

// 초대 코드 참가 실패 메시지를 사용자 친화적인 문구로 바꿉니다.
function getInviteErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error.includes("Session with this invite code was not found.")) {
    return "해당 초대 코드를 가진 세션을 찾을 수 없습니다.";
  }
  return error;
}

function isInviteCodeError(error: string | null): boolean {
  return Boolean(error?.includes("Session with this invite code was not found."));
}


// 페이지 전체에 띄울 에러만 걸러내고 메시지를 정리합니다.
function getPageErrorMessage(error: string | null): string | null {
  if (!error || isInviteCodeError(error)) return null;
  if (error.includes("You can only join one recruiting session at a time.")) {
    return "모집 중인 세션에는 하나만 참가할 수 있습니다.";
  }
  if (error.includes("Failed to join session")) {
    return "세션 입장에 실패했습니다.";
  }
  if (error.includes("Failed to create session")) {
    return "세션 생성에 실패했습니다.";
  }
  if (error.includes("Failed to fetch")) {
    return "서버에 연결하지 못했습니다.";
  }
  return error;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function SessionDiscoverPage({
  user,
  accessToken,
  snapshot,
  mySessionList,
  initialSection = "public",
  busy,
  error,
  onClearError,
  onJoinSession,
  onJoinSessionById,
  onRequestSessionDetail,
  onOpenHostProfile,
}: SessionDiscoverPageProps) {
  // 화면 상태: 탭, 검색/필터/정렬, 모달, 페이지네이션을 관리합니다.
  const [activeSection, setActiveSection] = useState<DiscoverSection>(initialSection);
  const [inviteCode, setInviteCode] = useState("");
  const [publicFilters, setPublicFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [myFilters, setMyFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [debouncedPublicQuery, setDebouncedPublicQuery] = useState("");
  const [debouncedMyQuery, setDebouncedMyQuery] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const inviteDialogFocus = useDialogFocusTrap<HTMLDivElement>(isInviteModalOpen, closeInviteModal);
  const [inviteErrorVisible, setInviteErrorVisible] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [pageToast, setPageToast] = useState<string | null>(null);
  const [publicPage, setPublicPage] = useState(0);
  const [myPage, setMyPage] = useState(0);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const activeFilters = activeSection === "public" ? publicFilters : myFilters;

  function updateActiveFilters(update: Partial<DiscoverFilters>) {
    if (activeSection === "public") {
      setPublicFilters((current) => ({ ...current, ...update }));
    } else {
      setMyFilters((current) => ({ ...current, ...update }));
    }
    updatePage(0);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedPublicQuery(publicFilters.query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [publicFilters.query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedMyQuery(myFilters.query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [myFilters.query]);

  const publicParams = useMemo(
    () => ({
      query: debouncedPublicQuery || undefined,
      gmMode: publicFilters.gmMode === ALL_FILTER ? undefined : (publicFilters.gmMode as GmMode),
      activityStatus: publicFilters.status === ALL_FILTER ? undefined : (publicFilters.status as SessionActivityStatus),
      sort: publicFilters.sort,
      page: publicPage,
      size: PAGE_SIZE,
    }),
    [debouncedPublicQuery, publicFilters.gmMode, publicFilters.sort, publicFilters.status, publicPage],
  );
  const myParams = useMemo(
    () => ({
      query: debouncedMyQuery || undefined,
      gmMode: myFilters.gmMode === ALL_FILTER ? undefined : (myFilters.gmMode as GmMode),
      activityStatus: myFilters.status === ALL_FILTER ? undefined : (myFilters.status as SessionActivityStatus),
      sort: myFilters.sort,
      page: myPage,
      size: PAGE_SIZE,
    }),
    [debouncedMyQuery, myFilters.gmMode, myFilters.sort, myFilters.status, myPage],
  );
  const catalog = useSessionCatalog(
    user,
    accessToken,
    publicParams,
    myParams,
    snapshot?.session.id ?? null,
  );

  const inviteError = getInviteErrorMessage(error);
  const pageError = getPageErrorMessage(error);
  // 내 세션 목록에 있는 sessionId를 Set으로 만들어 참가 여부 확인을 빠르게 합니다.
  const joinedSessionIds = useMemo(() => new Set(mySessionList.map((item) => item.sessionId)), [mySessionList]);

  useEffect(() => {
    document.body.classList.add("session-discover-body");
  return () => {
      document.body.classList.remove("session-discover-body");
    };
  }, []);

  useEffect(() => {
    if (!pageError) return;
    setPageToast(pageError);
    const timeout = window.setTimeout(() => {
      setPageToast((current) => (current === pageError ? null : current));
    }, PAGE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [pageError]);

  useEffect(() => {
    if (!isInviteModalOpen || !invitePending) return;
    if (!inviteError) return;
    setInviteErrorVisible(true);
    setInvitePending(false);
  }, [inviteError, invitePending, isInviteModalOpen]);

  // 공개 목록과 내 목록은 서로 독립된 서버 페이지 상태를 사용합니다.
  const currentCatalog = activeSection === "public" ? catalog.publicSessions : catalog.mySessions;
  const currentSource = currentCatalog.data.content;
  const currentPage = activeSection === "public" ? publicPage : myPage;
  const totalPages = Math.max(1, currentCatalog.data.totalPages);
  const safePage = Math.min(currentPage, totalPages - 1);
  const pagedSessions = currentSource;

  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index), [totalPages]);

  useEffect(() => {
    if (safePage === currentPage) return;
    if (activeSection === "public") {
      setPublicPage(safePage);
    } else {
      setMyPage(safePage);
    }
  }, [activeSection, currentPage, safePage]);

  // 페이지 번호 버튼을 눌렀을 때 현재 탭에 맞는 페이지 state를 갱신합니다.
  function updatePage(nextPage: number) {
    if (activeSection === "public") {
      setPublicPage(nextPage);
    } else {
      setMyPage(nextPage);
    }
  }

  // 초대 코드 입력 모달을 엽니다.
  function openInviteModal() {
    setInviteErrorVisible(false);
    setInvitePending(false);
    setInviteCode("");
    onClearError();
    setIsInviteModalOpen(true);
  }

  function closeInviteModal() {
    setInviteErrorVisible(false);
    setInvitePending(false);
    setInviteCode("");
    onClearError();
    setIsInviteModalOpen(false);
  }

  // 초대 코드 폼 제출: 입력값 정리 후 세션 참가 콜백을 호출합니다.
  function submitJoinByInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode) return;
    setInviteErrorVisible(false);
    setInvitePending(true);
    void onJoinSession(trimmedCode);
  }

  // 세션 카드를 눌렀을 때 상세 정보를 API로 받아 모달에 표시합니다.
  async function openSessionDetail(sessionId: string) {
    setSelectedSessionDetail(null);
    setDetailBusy(true);
    setDetailError(null);

    try {
      const detail = await onRequestSessionDetail(sessionId);
      setSelectedSessionDetail(detail);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "세션 정보를 불러오지 못했습니다.");
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
    const targetSessionPublicId = selectedSessionDetail.session.publicId;
    const nextSnapshot = await onJoinSessionById(targetSessionPublicId || targetSessionId);
    if (nextSnapshot) {
      closeSessionDetail();
    }
  }

  function openSelectedHostProfile(host: User) {
    closeSessionDetail();
    onOpenHostProfile(host);
  }

  async function handleJoinClick(
    event: MouseEvent<HTMLButtonElement>,
    sessionId: string,
    sessionPublicId?: string,
  ) {
    event.stopPropagation();

    await onJoinSessionById(sessionPublicId || sessionId);
  }

  // 키보드 접근성: Enter/Space로 세션 카드를 열 수 있게 합니다.
  const isCurrentSelectedSession = selectedSessionDetail?.session.id === snapshot?.session.id;
  const isKnownSelectedSession =
    (selectedSessionDetail ? joinedSessionIds.has(selectedSessionDetail.session.id) : false) || isCurrentSelectedSession;
  const canEnterSelectedSession = Boolean(selectedSessionDetail);

  return (
    <main className="session-discover-shell">
      {pageToast ? (
        <button type="button" className="page-error-toast" onClick={() => setPageToast(null)}>
          {pageToast}
        </button>
      ) : null}

      <section className="session-discover-layout">
        {/* 좌측 사이드바: 공개 세션/내 세션 탭과 세션 생성/초대 코드 진입점입니다. */}
      <aside className="session-discover-sidebar">
          <div className="session-discover-sidebar-nav">
            <button
              type="button"
              className={`session-discover-sidebutton${activeSection === "public" ? " active" : ""}`}
              onClick={() => setActiveSection("public")}
            >
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>공개 세션 탐색</span>
            </button>

            <button
              type="button"
              className={`session-discover-sidebutton${activeSection === "my" ? " active" : ""}`}
              onClick={() => setActiveSection("my")}
            >
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>내 세션 목록</span>
            </button>

            <button type="button" className="session-discover-sidebutton" onClick={openInviteModal}>
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>초대 코드 참가</span>
            </button>

            {snapshot ? (
              <div
                className="session-discover-sidebar-action"
                data-session-title={`세션 제목: ${snapshot.session.title}`}
              >
                <button
                  type="button"
                  className="session-discover-sidebutton"
                  data-label="최근 세션 열기"
                  onClick={() => void onJoinSessionById(snapshot.session.publicId || snapshot.session.id)}
                >
                  <img src={sidePanelImage} alt="" aria-hidden="true" />
                  <span>현재 세션 열기</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="session-discover-sidebar-footer">
            <img src={sidebarFooterImage} alt="" aria-hidden="true" />
          </div>
        </aside>

        <section className="session-discover-content">
          <section className="session-discover-toolbar">
            <div className="session-discover-search">
              <Icon name="eye" />
              <input
                value={activeFilters.query}
                onChange={(event) => updateActiveFilters({ query: event.target.value })}
                placeholder="세션 제목, 설명, 시나리오 검색"
                aria-label="세션 검색"
              />
            </div>

            <div className="session-discover-filters">
              <select
                value={activeFilters.gmMode}
                onChange={(event) => {
                  const nextGmFilter = readFilterValue(event.target.value, GM_FILTER_OPTIONS);
                  if (nextGmFilter) {
                    updateActiveFilters({ gmMode: nextGmFilter });
                  }
                }}
                aria-label="GM 필터"
              >
                <option value={ALL_FILTER}>모든 GM</option>
                {GM_FILTER_OPTIONS.map((gmMode) => (
                  <option key={gmMode} value={gmMode}>
                    {getGmModeLabel(gmMode)}
                  </option>
                ))}
              </select>

              <select
                value={activeFilters.status}
                onChange={(event) => {
                  const nextStatusFilter = readFilterValue(
                    event.target.value,
                    Object.keys(sessionActivityStatusLabels)
                  );
                  if (nextStatusFilter) {
                    updateActiveFilters({ status: nextStatusFilter });
                  }
                }}
                aria-label="상태 필터"
              >
                <option value={ALL_FILTER}>
                  모든 상태
                </option>
                {Object.entries(sessionActivityStatusLabels)
                  .filter(([status]) => activeSection !== "public" || ![
                    SessionActivityStatus.COMPLETED,
                    SessionActivityStatus.DISBANDED,
                  ].includes(status as SessionActivityStatus))
                  .map(([status, label]) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                  ))}
              </select>

              <select
                value={activeFilters.sort}
                onChange={(event) => {
                  updateActiveFilters({ sort: event.target.value as SessionListSort });
                }}
                aria-label="정렬"
              >
                <option value={SessionListSort.RECENT}>최근 활동 순</option>
                <option value={SessionListSort.SOONEST}>시작 임박 순</option>
                <option value={SessionListSort.TITLE}>이름 순</option>
              </select>
            </div>
          </section>

          <div className="session-discover-result-summary" aria-live="polite">
            총 {currentCatalog.data.totalElements}개 · {safePage + 1}/{totalPages} 페이지
          </div>

          {currentCatalog.error ? (
            <article className="session-discover-load-notice" role="alert">
              <span>{currentCatalog.error}</span>
              <button type="button" onClick={currentCatalog.retry}>다시 시도</button>
            </article>
          ) : null}

          <section className="session-discover-list" aria-busy={currentCatalog.loading}>
            {currentCatalog.loading && !pagedSessions.length ? (
              <article className="session-discover-empty">
                <h2>세션을 불러오는 중입니다</h2>
              </article>
            ) : pagedSessions.length ? (
              pagedSessions.map((item, index) => {
                const previewImage = item.scenarioThumbnailUrl || scenarioPlaceholder;
                const detailId = item.sessionPublicId || item.sessionId;
                const isCurrentListSession =
                  snapshot?.session.id === item.sessionId ||
                  (Boolean(item.sessionPublicId) && snapshot?.session.publicId === item.sessionPublicId);
                const isKnownListSession = Boolean(item.role) || joinedSessionIds.has(item.sessionId) || isCurrentListSession;
                const isJoinBlocked = busy;
                const gmLabel = getGmModeLabel(item.gmMode);
                const joinButtonLabel = isKnownListSession ? "세션 열기" : "세션 참가";

                return (
                  <article
                    className="session-discover-row"
                    key={getSessionListItemKey(item, safePage * PAGE_SIZE + index)}
                  >
                    <div className="session-discover-thumbnail-frame">
                      <img src={previewImage} alt={`${item.scenarioTitle} 대표 이미지`} className="session-discover-thumbnail" />
                    </div>

                    <div className="session-discover-row-copy">
                      <div className="session-discover-row-top">
                        <span className={`session-discover-gm-badge${gmLabel === AI_GM_LABEL ? " is-ai" : ""}`}>
                          {gmLabel}
                        </span>
                      </div>

                      <h2>
                        <button
                          type="button"
                          className="session-discover-detail-link"
                          onClick={() => void openSessionDetail(detailId)}
                        >
                          {item.title}
                        </button>
                      </h2>
                      <p>{item.scenarioDescription?.trim() || "시나리오 설명이 아직 입력되지 않았습니다."}</p>

                      <div className="session-discover-row-meta">
                        <span className="session-discover-meta-item">
                          <Icon name="user" />
                          <strong>
                            {item.currentPlayers} / {item.maxPlayers}
                          </strong>
                        </span>
                        <span className="session-discover-meta-pill">
                          {item.scenarioTags?.[0] ?? "테마 미정"}
                        </span>
                        <span className="session-discover-meta-pill">
                          {item.scenarioEstimatedMinutes
                            ? `약 ${item.scenarioEstimatedMinutes}분`
                            : "예상 시간 미정"}
                        </span>
                        <span className="session-discover-meta-pill muted">
                          {item.activityStatus ? getSessionActivityStatusLabel(item.activityStatus) : getSessionStatusLabel(item.status)}
                        </span>
                      </div>
                    </div>

                    <div className="session-discover-row-actions">
                      <button
                        type="button"
                        className="session-discover-join"
                        data-label={joinButtonLabel}
                        disabled={isJoinBlocked}
                        onClick={(event) =>
                          void handleJoinClick(event, item.sessionId, item.sessionPublicId)
                        }
                      >
                        {joinButtonLabel}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <article className="session-discover-empty">
                <h2>{activeSection === "public" ? "공개 세션이 없습니다" : "내 세션이 없습니다"}</h2>
                <p>
                  {activeSection === "public"
                    ? "검색 조건을 바꾸거나 초대 코드로 참가해 보세요."
                    : "참가한 세션이 생기면 여기에서 다시 열 수 있습니다."}
                </p>
              </article>
            )}
          </section>

          {currentCatalog.data.totalPages > 1 ? (
            <nav className="session-discover-pagination" aria-label="세션 페이지 이동">
              <button type="button" onClick={() => updatePage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
                {"<"}
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={pageNumber === safePage ? "active" : ""}
                  onClick={() => updatePage(pageNumber)}
                >
                  {pageNumber + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updatePage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
              >
                {">"}
              </button>
            </nav>
          ) : null}
        </section>
      </section>

      {/* 초대 코드로 비공개/직접 세션에 참가하는 모달입니다. */}
      {isInviteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeInviteModal}>
          <div
            ref={inviteDialogFocus.dialogRef}
            tabIndex={-1}
            className="modal-card session-invite-modal"
            role="dialog"
            aria-modal="true"
            onKeyDown={inviteDialogFocus.onDialogKeyDown}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>초대 코드 참가</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeInviteModal}>
                닫기
              </button>
            </div>

            <form className="modal-form" onSubmit={submitJoinByInvite}>
              <div className="session-invite-field">
                <img
                  src={dragonPeekImage}
                  alt=""
                  className="session-invite-dragon"
                  aria-hidden="true"
                />
                <input
                  id="discover-invite-code"
                  value={inviteCode}
                  onChange={(event) => {
                    setInviteCode(event.target.value);
                    setInviteErrorVisible(false);
                    setInvitePending(false);
                    onClearError();
                  }}
                  placeholder="코드 입력"
                  maxLength={12}
                  required
                />
              </div>
              {inviteError && inviteErrorVisible ? <p className="session-invite-error">{inviteError}</p> : null}
              <button type="submit" className="primary" disabled={busy}>
                참여하기
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <SessionDetailModal
        detail={selectedSessionDetail}
        loading={detailBusy}
        error={detailError}
        busy={busy}
        canEnter={canEnterSelectedSession}
        isKnownMember={isKnownSelectedSession}
        onClose={closeSessionDetail}
        onEnter={enterSelectedSession}
        onOpenHostProfile={openSelectedHostProfile}
      />
    </main>
  );
}
