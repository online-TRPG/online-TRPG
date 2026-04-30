import { FormEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import sidePanelImage from "../components/Side_Panel.png";
import sidebarFooterImage from "../assets/images/Sidebar_Footer_Image.png";
import { findSessionVisualByTitle, sessionVisualPresets } from "../data/sessionVisuals";
import type { AvailableSessionListItem, SessionSnapshot } from "../types/session";

interface SessionDiscoverPageProps {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  busy: boolean;
  error: string | null;
  onJoinSession: (inviteCode: string) => void | Promise<void>;
  onJoinSessionById: (sessionId: string) => void | Promise<void>;
  onOpenPlay: () => void;
}

type DiscoverSection = "public" | "my";
type SessionSort = "latest" | "title" | "players";

const STATUS_LABEL: Record<string, string> = {
  lobby: "대기 중",
  recruiting: "모집 중",
  playing: "진행 중",
  paused: "일시정지",
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

  const hasRecruitingSession = snapshot?.session.status === "recruiting";

  useEffect(() => {
    document.body.classList.add("session-discover-body");
    return () => {
      document.body.classList.remove("session-discover-body");
    };
  }, []);

  const currentSource = activeSection === "public" ? sessionList : mySessionList;
  const currentPage = activeSection === "public" ? publicPage : myPage;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(currentSource.length / PAGE_SIZE));
    if (currentPage >= totalPages) {
      if (activeSection === "public") {
        setPublicPage(Math.max(0, totalPages - 1));
      } else {
        setMyPage(Math.max(0, totalPages - 1));
      }
    }
  }, [activeSection, currentPage, currentSource.length]);

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

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index),
    [totalPages],
  );

  function updatePage(nextPage: number) {
    if (activeSection === "public") {
      setPublicPage(nextPage);
    } else {
      setMyPage(nextPage);
    }
  }

  function openInviteModal() {
    setIsInviteModalOpen(true);
  }

  function closeInviteModal() {
    setIsInviteModalOpen(false);
  }

  function submitJoinByInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;
    void onJoinSession(inviteCode.trim().toUpperCase());
    setInviteCode("");
    setIsInviteModalOpen(false);
  }

  return (
    <main className="session-discover-shell">
      <section className="session-discover-layout">
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
              <div className="session-discover-sidebar-action">
                <button type="button" className="session-discover-sidebutton session-discover-sidebutton-secondary" onClick={onOpenPlay}>
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
                <option value="일반 GM">일반 GM</option>
                <option value="AI GM">AI GM</option>
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
                <option value="lobby">대기 중</option>
                <option value="recruiting">모집 중</option>
                <option value="playing">진행 중</option>
                <option value="paused">일시정지</option>
                <option value="completed">종료</option>
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
                <option value="title">이름순</option>
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
                  <article className="session-discover-row" key={getSessionListItemKey(item, safePage * PAGE_SIZE + index)}>
                    <div className="session-discover-thumbnail-frame">
                      <img
                        src={visual.image}
                        alt={`${visual.title} thumbnail`}
                        className="session-discover-thumbnail"
                      />
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
                        onClick={() => void onJoinSessionById(item.sessionId)}
                      >
                        {activeSection === "public" ? "참여하기" : "입장하기"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <article className="session-discover-empty">
                <h2>{activeSection === "public" ? "표시할 공개 세션이 없습니다" : "아직 참여 중인 세션이 없습니다"}</h2>
                <p>
                  {activeSection === "public"
                    ? "검색어나 필터를 조정하거나 새 세션을 만들어 보세요."
                    : "공개 세션 목록에서 참가하거나 직접 세션을 생성해 보세요."}
                </p>
              </article>
            )}
          </section>

          {filteredSessions.length > PAGE_SIZE ? (
            <nav className="session-discover-pagination" aria-label="세션 페이지네이션">
              <button type="button" onClick={() => updatePage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
                ‹
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
                ›
              </button>
            </nav>
          ) : null}

          {error ? <p className="panel-error">{error}</p> : null}
        </section>
      </section>

      {isInviteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeInviteModal}>
          <div className="modal-card session-invite-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
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
              <p className="helper-copy">세션 호스트에게 받은 초대 코드를 입력하면 바로 해당 세션에 참가할 수 있습니다.</p>
              <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
                참가하기
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
