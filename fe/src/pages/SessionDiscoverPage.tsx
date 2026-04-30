import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { SessionDetailModal } from "../components/SessionDetailModal";
import { Icon } from "../components/Icon";
import sidePanelImage from "../components/Side_Panel.png";
import sidebarFooterImage from "../assets/images/Sidebar_Footer_Image.png";
import { findSessionVisualByTitle, sessionVisualPresets } from "../data/sessionVisuals";
import type { AvailableSessionListItem, SessionDetail, SessionSnapshot, User } from "../types/session";

interface SessionDiscoverPageProps {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  busy: boolean;
  error: string | null;
  onJoinSession: (inviteCode: string) => void | Promise<void>;
  onJoinSessionById: (sessionId: string) => boolean | Promise<boolean>;
  onRequestSessionDetail: (sessionId: string) => Promise<SessionDetail>;
  onOpenHostProfile: (host: User) => void;
  onOpenCreate: () => void;
  onOpenPlay: () => void;
}

type DiscoverSection = "public" | "my";
type SessionSort = "latest" | "title" | "players";

const STATUS_LABEL: Record<string, string> = {
  lobby: "대기 중",
  recruiting: "모집 중",
  playing: "진행 중",
  paused: "일시 정지",
  completed: "종료",
  disbanded: "해산",
};

const PAGE_SIZE = 4;

function getSessionListItemKey(item: AvailableSessionListItem, index: number): string {
  return item.sessionId || `${item.title}-${item.scenarioTitle}-${index}`;
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
  onOpenCreate: _onOpenCreate,
  onOpenPlay,
}: SessionDiscoverPageProps) {
  const [activeSection, setActiveSection] = useState<DiscoverSection>("public");
  const [inviteCode, setInviteCode] = useState("");
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const [gmFilter, setGmFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<SessionSort>("latest");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [publicPage, setPublicPage] = useState(0);
  const [myPage, setMyPage] = useState(0);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const hasRecruitingSession = snapshot?.session.status === "recruiting";
  const joinedSessionIds = useMemo(() => new Set(mySessionList.map((item) => item.sessionId)), [mySessionList]);

  useEffect(() => {
    document.body.classList.add("session-discover-body");
    return () => {
      document.body.classList.remove("session-discover-body");
    };
  }, []);

  const currentSource = activeSection === "public" ? sessionList : mySessionList;
  const currentPage = activeSection === "public" ? publicPage : myPage;

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
      const matchesGm = gmFilter === "all" || visual.gmLabel === gmFilter;
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

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pagedSessions = useMemo(
    () => filteredSessions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filteredSessions, safePage],
  );
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index), [totalPages]);

  useEffect(() => {
    if (safePage === currentPage) return;
    if (activeSection === "public") {
      setPublicPage(safePage);
    } else {
      setMyPage(safePage);
    }
  }, [activeSection, currentPage, safePage]);

  function updatePage(nextPage: number) {
    if (activeSection === "public") {
      setPublicPage(nextPage);
    } else {
      setMyPage(nextPage);
    }
  }

  function switchSection(section: DiscoverSection) {
    setActiveSection(section);
  }

  function openInviteModal() {
    setIsInviteModalOpen(true);
  }

  function closeInviteModal() {
    setIsInviteModalOpen(false);
  }

  function submitJoinByInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode || hasRecruitingSession) return;
    void onJoinSession(trimmedCode);
    setInviteCode("");
    closeInviteModal();
  }

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
    const isCurrentSession = snapshot?.session.id === targetSessionId;

    if (isCurrentSession) {
      closeSessionDetail();
      onOpenPlay();
      return;
    }

    const success = await onJoinSessionById(targetSessionId);
    if (success !== false) {
      closeSessionDetail();
      onOpenPlay();
    }
  }

  function openSelectedHostProfile(host: User) {
    closeSessionDetail();
    onOpenHostProfile(host);
  }

  async function handleJoinClick(event: MouseEvent<HTMLButtonElement>, sessionId: string) {
    event.stopPropagation();
    await onJoinSessionById(sessionId);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, sessionId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void openSessionDetail(sessionId);
  }

  const isCurrentSelectedSession = selectedSessionDetail?.session.id === snapshot?.session.id;
  const isKnownSelectedSession =
    (selectedSessionDetail ? joinedSessionIds.has(selectedSessionDetail.session.id) : false) || isCurrentSelectedSession;
  const canEnterSelectedSession =
    isCurrentSelectedSession || isKnownSelectedSession || !hasRecruitingSession;

  return (
    <main className="session-discover-shell">
      <section className="session-discover-layout">
        <aside className="session-discover-sidebar">
          <div className="session-discover-sidebar-nav">
            <button
              type="button"
              className={`session-discover-sidebutton${activeSection === "public" ? " active" : ""}`}
              onClick={() => switchSection("public")}
            >
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>공개 세션 탐색</span>
            </button>

            <button
              type="button"
              className={`session-discover-sidebutton${activeSection === "my" ? " active" : ""}`}
              onClick={() => switchSection("my")}
            >
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>내 세션 목록</span>
            </button>

            <button type="button" className="session-discover-sidebutton" onClick={openInviteModal}>
              <img src={sidePanelImage} alt="" aria-hidden="true" />
              <span>초대 코드 참가</span>
            </button>

            {snapshot ? (
              <div className="session-discover-sidebar-action">
                <button type="button" className="session-discover-sidebutton" onClick={onOpenPlay}>
                  <img src={sidePanelImage} alt="" aria-hidden="true" />
                  <span>현재 세션으로 이동</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="session-discover-sidebar-footer">
            <img src={sidebarFooterImage} alt="" aria-hidden="true" />
          </div>
        </aside>

        <section className="session-discover-content">
          <header className="session-discover-header">
            <h1>{activeSection === "public" ? "공개 세션 탐색" : "내 세션 목록"}</h1>
          </header>

          <section className="session-discover-toolbar">
            <div className="session-discover-search">
              <Icon name="eye" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  updatePage(0);
                }}
                placeholder="세션 제목, 테마, 키워드 검색"
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
                <option value="all">전체 테마</option>
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
                {[...new Set(sessionVisualPresets.map((preset) => preset.gmLabel))].map((gmLabel) => (
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
                <option value="latest">최신순</option>
                <option value="title">제목순</option>
                <option value="players">인원순</option>
              </select>
            </div>
          </section>

          <section className="session-discover-list">
            {pagedSessions.length ? (
              pagedSessions.map((item, index) => {
                const visual =
                  findSessionVisualByTitle(item.scenarioTitle) ??
                  sessionVisualPresets[(safePage * PAGE_SIZE + index) % sessionVisualPresets.length];

                return (
                  <article
                    className="session-discover-row"
                    key={getSessionListItemKey(item, safePage * PAGE_SIZE + index)}
                    onClick={() => void openSessionDetail(item.sessionId)}
                    onKeyDown={(event) => handleRowKeyDown(event, item.sessionId)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="session-discover-thumbnail-frame">
                      <img src={visual.image} alt={`${visual.title} thumbnail`} className="session-discover-thumbnail" />
                    </div>

                    <div className="session-discover-row-copy">
                      <div className="session-discover-row-top">
                        <span className={`session-discover-gm-badge${visual.gmLabel === "AI GM" ? " is-ai" : ""}`}>
                          {visual.gmLabel}
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
                        className="session-discover-join"
                        disabled={busy || hasRecruitingSession}
                        onClick={(event) => void handleJoinClick(event, item.sessionId)}
                      >
                        {activeSection === "public" ? "참여하기" : "입장하기"}
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
                    ? "검색 조건을 조정하거나 다른 테마의 세션을 찾아보세요."
                    : "참여 중인 세션이 생기면 이 목록에 표시됩니다."}
                </p>
              </article>
            )}
          </section>

          {filteredSessions.length > PAGE_SIZE ? (
            <nav className="session-discover-pagination" aria-label="세션 페이지네이션">
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

          {error ? <p className="panel-error">{error}</p> : null}
        </section>
      </section>

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
                <span className="eyebrow">Invite code</span>
                <h2>초대 코드 참가</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeInviteModal}>
                닫기
              </button>
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
              <p className="helper-copy">세션에서 받은 초대 코드를 입력하면 바로 참가할 수 있습니다.</p>
              <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
                참가하기
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
        isCurrentSession={isCurrentSelectedSession}
        isKnownMember={isKnownSelectedSession}
        onClose={closeSessionDetail}
        onEnter={enterSelectedSession}
        onOpenHostProfile={openSelectedHostProfile}
      />
    </main>
  );
}
