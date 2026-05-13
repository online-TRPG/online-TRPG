/*
 * SessionDiscoverPage
 * 역할: 공개 세션과 내 세션을 탐색하고, 초대 코드 또는 목록 선택으로 세션에 참가하는 페이지입니다.
 * 읽는 순서:
 * 1) 상단 헬퍼: 상태/GM 라벨 변환, 초대 코드/페이지 에러 메시지 정리
 * 2) state: 현재 탭, 검색/필터/정렬, 페이지네이션, 초대 모달, 상세 모달
 * 3) useMemo: 세션 목록 필터링/정렬/페이지 자르기
 * 4) handler: 초대 코드 참가, 상세 모달 열기, 세션 참가/복귀, 페이지 이동
 * 5) JSX: 좌측 사이드바, 필터 바, 세션 카드 목록, 페이지네이션, 초대 코드 모달, 상세 모달
 */
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { SessionDetailModal } from "../components/SessionDetailModal";
import sidePanelImage from "../components/Side_Panel.webp";
import sidebarFooterImage from "../assets/images/Sidebar_Footer_Image.webp";
import dragonPeekImage from "../assets/images/Peak_a_Boo_Dragon.webp";
import { findSessionVisualByTitle, sessionVisualPresets } from "../data/sessionVisuals";
import { getScenario } from "../services/api";
import type { AvailableSessionListItem, SessionDetail, SessionSnapshot, User } from "../types/session";
import "./SessionDiscoverPage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface SessionDiscoverPageProps {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  initialSection?: DiscoverSection;
  busy: boolean;
  error: string | null;
  onClearError: () => void;
  onJoinSession: (inviteCode: string) => void | Promise<void>;
  onJoinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  onRequestSessionDetail: (sessionId: string) => Promise<SessionDetail>;
  onOpenHostProfile: (host: User) => void;
  onOpenCreate: () => void;
  onOpenPlay: () => void;
}

// 세션 탐색 탭 종류입니다. public은 공개 목록, my는 내가 참여한 목록입니다.
type DiscoverSection = "public" | "my";
// 세션 목록 정렬 기준입니다.
type SessionSort = "latest" | "title" | "players";

// 서버 세션 상태값을 한국어 라벨로 바꿉니다.
const STATUS_LABEL: Record<string, string> = {
  lobby: "대기 중",
  recruiting: "모집 중",
  playing: "진행 중",
  paused: "일시 정지",
  completed: "완료",
  disbanded: "해산",
};

const PAGE_SIZE = 4;
const PAGE_TOAST_DURATION_MS = 2600;
const JOIN_BLOCKED_TOAST_DURATION_MS = 5200;
const GENERAL_GM_LABEL = "\uC77C\uBC18 GM";
const AI_GM_LABEL = "AI GM";
const JOIN_BLOCKED_NOTICE =
  "\uD604\uC7AC \uB2E4\uB978 \uBAA8\uC9D1 \uC911\uC778 \uC138\uC158\uC5D0 \uC774\uBBF8 \uCC38\uC5EC \uD588\uC2B5\uB2C8\uB2E4.\n\uBAA8\uC9D1\uC744 \uB05D\uB0B4\uAC70\uB098 \uB098\uAC04 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";

// GM 모드 값에 따라 일반 GM/AI GM 라벨을 반환합니다.
function getGmModeLabel(gmMode?: string | null): string {
  return gmMode === "AI" ? AI_GM_LABEL : GENERAL_GM_LABEL;
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

function isBlockingSessionStatus(status: string | undefined): boolean {
  return status !== "completed" && status !== "disbanded";
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
  snapshot,
  sessionList,
  mySessionList,
  initialSection = "public",
  busy,
  error,
  onClearError,
  onJoinSession,
  onJoinSessionById,
  onRequestSessionDetail,
  onOpenHostProfile,
  onOpenPlay,
}: SessionDiscoverPageProps) {
  // 화면 상태: 탭, 검색/필터/정렬, 모달, 페이지네이션을 관리합니다.
  const [activeSection, setActiveSection] = useState<DiscoverSection>(initialSection);
  const [inviteCode, setInviteCode] = useState("");
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const [gmFilter, setGmFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<SessionSort>("latest");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteErrorVisible, setInviteErrorVisible] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [pageToast, setPageToast] = useState<string | null>(null);
  const [publicPage, setPublicPage] = useState(0);
  const [myPage, setMyPage] = useState(0);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [scenarioPreviewImages, setScenarioPreviewImages] = useState<Record<string, string>>({});

  // 이미 참여 중인 모집 세션이 있으면 다른 모집 세션 참가를 막기 위한 상태입니다.
  const hasBlockingSession = mySessionList.some((item) => isBlockingSessionStatus(item.status));
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

  // 중복 참가 불가 안내 토스트를 표시합니다.
  function showJoinBlockedToast() {
    setPageToast(null);
    window.setTimeout(() => {
      setPageToast(JOIN_BLOCKED_NOTICE);
      window.setTimeout(() => {
        setPageToast((current) => (current === JOIN_BLOCKED_NOTICE ? null : current));
      }, JOIN_BLOCKED_TOAST_DURATION_MS);
    }, 0);
  }

  useEffect(() => {
    if (!isInviteModalOpen || !invitePending) return;
    if (!inviteError) return;
    setInviteErrorVisible(true);
    setInvitePending(false);
  }, [inviteError, invitePending, isInviteModalOpen]);

  // 현재 탭에 맞춰 사용할 원본 목록과 페이지 인덱스를 결정합니다.
  const currentSection = activeSection;
  const currentSource = activeSection === "public" ? sessionList : mySessionList;
  const currentPage = activeSection === "public" ? publicPage : myPage;

  // 검색어/테마/GM/상태 필터와 정렬을 적용한 목록입니다.
  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const next = currentSource.filter((item) => {
      const visual = findSessionVisualByTitle(item.scenarioTitle) ?? sessionVisualPresets[0];
      const statusLabel = STATUS_LABEL[item.status] ?? item.status;
      const matchesKeyword =
        !keyword ||
        [item.title, item.scenarioTitle, item.ruleSetName, visual.theme, statusLabel]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesTheme = themeFilter === "all" || visual.theme === themeFilter;
      const matchesGm = gmFilter === "all" || getGmModeLabel(item.gmMode) === gmFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesKeyword && matchesTheme && matchesGm && matchesStatus;
    });

    if (sortOrder === "title") {
      next.sort((left, right) => left.title.localeCompare(right.title));
    } else if (sortOrder === "players") {
      next.sort((left, right) => right.currentPlayers - left.currentPlayers);
    }

    return next;
  }, [currentSource, gmFilter, query, sortOrder, statusFilter, themeFilter]);

  // 페이지네이션 계산값입니다. safePage는 범위를 벗어난 페이지 접근을 막습니다.
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pagedSessions = useMemo(
    () => filteredSessions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filteredSessions, safePage],
  );

  useEffect(() => {
    let ignore = false;
    const pending = pagedSessions.filter((item) => item.scenarioId && !scenarioPreviewImages[item.scenarioId]);

    if (!pending.length) {
      return () => {
        ignore = true;
      };
    }

    void Promise.all(
      pending.map(async (item) => {
        try {
          const detail = await getScenario(item.scenarioId);
          const firstNodeImage =
            detail.nodes.find((node) => typeof node.imageUrl === "string" && node.imageUrl.trim())?.imageUrl?.trim() ??
            null;
          return [item.scenarioId, firstNodeImage || item.scenarioThumbnailUrl || ""] as const;
        } catch {
          return [item.scenarioId, item.scenarioThumbnailUrl || ""] as const;
        }
      }),
    ).then((entries) => {
      if (ignore) return;
      setScenarioPreviewImages((current) => {
        const next = { ...current };
        for (const [scenarioId, image] of entries) {
          if (image) {
            next[scenarioId] = image;
          }
        }
        return next;
      });
    });

    return () => {
      ignore = true;
    };
  }, [pagedSessions, scenarioPreviewImages]);

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
    if (hasBlockingSession) {
      showJoinBlockedToast();
      return;
    }
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
    const isCurrentSession =
      snapshot?.session.id === targetSessionId ||
      (Boolean(targetSessionPublicId) && snapshot?.session.publicId === targetSessionPublicId);
    const isKnownSelectedSession =
      joinedSessionIds.has(targetSessionId) ||
      (Boolean(targetSessionPublicId) && joinedSessionIds.has(targetSessionPublicId));

    if (isCurrentSession) {
      closeSessionDetail();
      onOpenPlay();
      return;
    }

    if (!isKnownSelectedSession && hasBlockingSession) {
      showJoinBlockedToast();
      return;
    }

    const nextSnapshot = await onJoinSessionById(targetSessionPublicId || targetSessionId);
    if (nextSnapshot) {
      closeSessionDetail();
      onOpenPlay();
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

    const isCurrentSession =
      snapshot?.session.id === sessionId ||
      (Boolean(sessionPublicId) && snapshot?.session.publicId === sessionPublicId);
    const isKnownSession =
      joinedSessionIds.has(sessionId) ||
      (sessionPublicId ? joinedSessionIds.has(sessionPublicId) : false) ||
      isCurrentSession;

    if (isCurrentSession) {
      onOpenPlay();
      return;
    }

    if (isKnownSession) {
      const nextSnapshot = await onJoinSessionById(sessionPublicId || sessionId);
      if (nextSnapshot) {
        onOpenPlay();
      }
      return;
    }

    if (hasBlockingSession) {
      showJoinBlockedToast();
      return;
    }

    const nextSnapshot = await onJoinSessionById(sessionPublicId || sessionId);
    if (nextSnapshot) {
      onOpenPlay();
    }
  }

  // 키보드 접근성: Enter/Space로 세션 카드를 열 수 있게 합니다.
  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, sessionId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void openSessionDetail(sessionId);
  }

  const isCurrentSelectedSession = selectedSessionDetail?.session.id === snapshot?.session.id;
  const isKnownSelectedSession =
    (selectedSessionDetail ? joinedSessionIds.has(selectedSessionDetail.session.id) : false) || isCurrentSelectedSession;
  const canEnterSelectedSession = Boolean(selectedSessionDetail);
  const isSelectedSessionBlocked = !isKnownSelectedSession && hasBlockingSession;

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
                  onClick={onOpenPlay}
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
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  updatePage(0);
                }}
                placeholder="세션 이름, 테마, 룰셋 검색"
                aria-label="세션 검색"
              />
            </div>

            <div className="session-discover-filters">
              <select
                value={themeFilter}
                onChange={(event) => {
                  setThemeFilter(event.target.value);
                  updatePage(0);
                }}
                aria-label="테마 필터"
              >
                <option value="all">모든 테마</option>
                {[...new Set(sessionVisualPresets.map((preset) => preset.theme))].map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>

              <select
                value={gmFilter}
                onChange={(event) => {
                  setGmFilter(event.target.value);
                  updatePage(0);
                }}
                aria-label="GM 필터"
              >
                <option value="all">모든 GM</option>
                {[AI_GM_LABEL, GENERAL_GM_LABEL].map((gmLabel) => (
                  <option key={gmLabel} value={gmLabel}>
                    {gmLabel}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  updatePage(0);
                }}
                aria-label="상태 필터"
              >
                <option value="all">모든 상태</option>
                {Object.entries(STATUS_LABEL).map(([status, label]) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                value={sortOrder}
                onChange={(event) => {
                  setSortOrder(event.target.value as SessionSort);
                  updatePage(0);
                }}
                aria-label="정렬"
              >
                <option value="latest">최신 순</option>
                <option value="title">이름 순</option>
                <option value="players">인원 순</option>
              </select>
            </div>
          </section>

          <section className="session-discover-list">
            {pagedSessions.length ? (
              pagedSessions.map((item, index) => {
                const visual =
                  findSessionVisualByTitle(item.scenarioTitle) ??
                  sessionVisualPresets[(safePage * PAGE_SIZE + index) % sessionVisualPresets.length];
                const previewImage =
                  scenarioPreviewImages[item.scenarioId] || item.scenarioThumbnailUrl || visual.image;
                const detailId = item.sessionPublicId || item.sessionId;
                const isCurrentListSession =
                  snapshot?.session.id === item.sessionId ||
                  (Boolean(item.sessionPublicId) && snapshot?.session.publicId === item.sessionPublicId);
                const isKnownListSession = joinedSessionIds.has(item.sessionId) || isCurrentListSession;
                const isJoinBlocked = busy;
                const gmLabel = getGmModeLabel(item.gmMode);
                const joinButtonLabel = isKnownListSession ? "세션 열기" : "세션 참가";

                return (
                  <article
                    className="session-discover-row"
                    key={getSessionListItemKey(item, safePage * PAGE_SIZE + index)}
                    onClick={() => void openSessionDetail(detailId)}
                    onKeyDown={(event) => handleRowKeyDown(event, detailId)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="session-discover-thumbnail-frame">
                      <img src={previewImage} alt={`${visual.title} thumbnail`} className="session-discover-thumbnail" />
                    </div>

                    <div className="session-discover-row-copy">
                      <div className="session-discover-row-top">
                        <span className={`session-discover-gm-badge${gmLabel === AI_GM_LABEL ? " is-ai" : ""}`}>
                          {gmLabel}
                        </span>
                      </div>

                      <h2>{item.title}</h2>
                      <p>{visual.description}</p>

                      <div className="session-discover-row-meta">
                        <span className="session-discover-meta-item">
                          <Icon name="user" />
                          <strong>
                            {item.currentPlayers} / {item.maxPlayers}
                          </strong>
                        </span>
                        <span className="session-discover-meta-pill">{visual.theme}</span>
                        <span className="session-discover-meta-pill muted">{STATUS_LABEL[item.status] ?? item.status}</span>
                      </div>
                    </div>

                    <div className="session-discover-row-actions">
                      <button
                        type="button"
                        className={`session-discover-join${!isKnownListSession && hasBlockingSession ? " is-blocked" : ""}`}
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

          {filteredSessions.length > PAGE_SIZE ? (
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
            className="modal-card session-invite-modal"
            role="dialog"
            aria-modal="true"
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
        isEnterBlocked={isSelectedSessionBlocked}
        isCurrentSession={isCurrentSelectedSession}
        isKnownMember={isKnownSelectedSession}
        onClose={closeSessionDetail}
        onEnter={enterSelectedSession}
        onOpenHostProfile={openSelectedHostProfile}
      />
    </main>
  );
}
