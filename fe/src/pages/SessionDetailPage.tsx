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
import {
  approveCharacterTransfer,
  completeLongCampaign,
  getCampaignArchive,
  getSessionDetail,
  rejectCharacterTransfer,
} from "../services/api";
import type { SessionDetail, SessionSnapshot, StoredUser, User } from "../types/session";
import type { CampaignArchiveResponseDto } from "@trpg/shared-types";

type P6CharacterTransferRequestView = {
  requestId: string;
  requestedByUserId: string;
  sourceSessionId: string;
  sourceSessionCharacterId: string;
  status: "requested" | "approved" | "rejected";
  mode: "clone" | "transfer";
  targetSessionCharacterId: string | null;
  createdAt: string;
};
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
  const [archive, setArchive] = useState<CampaignArchiveResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [p6ActionFeedback, setP6ActionFeedback] = useState<string | null>(null);
  const [p6ActionBusy, setP6ActionBusy] = useState(false);

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

  useEffect(() => {
    if (!detail || detail.session.status !== "completed") {
      setArchive(null);
      setArchiveError(null);
      return;
    }

    let cancelled = false;
    setArchiveError(null);
    void getCampaignArchive(user, detail.session.publicId || detail.session.id, accessToken)
      .then((next) => {
        if (cancelled) return;
        setArchive(next);
      })
      .catch((caught) => {
        if (cancelled) return;
        setArchive(null);
        setArchiveError(caught instanceof Error ? caught.message : "캠페인 archive를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, detail, user]);

  // 현재 접속 중인 세션인지, 이미 참여한 세션인지 판단해 버튼 문구/동작을 결정합니다.
  const isCurrentSession = detail?.session.id === snapshot?.session.id;
  const isKnownMember = isCurrentSession || (detail ? snapshot?.session.id === detail.session.id : false);
  const activeScenario =
    detail?.sessionScenarios.find((item) => item.status === "ACTIVE")?.scenario ?? detail?.scenario ?? null;
  const participantCount = detail?.participants.filter((item) => item.status === "JOINED").length ?? 0;
  const canonicalPath = detail ? buildSessionPath(detail.session) : null;
  const isHost = detail?.session.hostUserId === user.id;
  const transferRequests = parseP6CharacterTransferRequests(detail?.state.flags?.p6CharacterTransferRequests);
  const pendingTransferRequests = transferRequests.filter((request) => request.status === "requested");

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

  async function handleCompleteCampaignArchive() {
    if (!detail || !isHost) return;
    const epilogue = window.prompt("캠페인 후일담을 입력하세요.", "파티는 마지막 위협을 봉인하고 다음 전설을 남겼습니다.") ?? "";
    if (!epilogue.trim()) return;
    const shareScopeInput = window.prompt("공유 범위를 입력하세요: private, party, public_summary", "party") ?? "party";
    const shareScope =
      shareScopeInput === "private" || shareScopeInput === "public_summary" ? shareScopeInput : "party";
    const allowCharacterTransfer = window.confirm("완료 캐릭터의 새 캠페인 이관을 허용할까요?");

    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      const nextArchive = await completeLongCampaign(
        user,
        detail.session.publicId || detail.session.id,
        {
          epilogue: epilogue.trim(),
          finalNodeId: detail.state.currentNodeId,
          finalRewardIds: [],
          shareScope,
          allowCharacterTransfer,
        },
        accessToken,
      );
      setArchive(nextArchive);
      setP6ActionFeedback(`캠페인 archive가 생성되었습니다: ${nextArchive.archiveId}`);
      const refreshed = await getSessionDetail(user, detail.session.publicId || detail.session.id, accessToken);
      setDetail(refreshed);
    } catch (caught) {
      setP6ActionFeedback(caught instanceof Error ? caught.message : "캠페인 완결 처리에 실패했습니다.");
    } finally {
      setP6ActionBusy(false);
    }
  }

  async function handleApproveTransfer(request: P6CharacterTransferRequestView) {
    if (!detail || !isHost) return;
    if (!window.confirm(`${request.requestedByUserId}의 캐릭터 이관 요청을 승인할까요?`)) return;
    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      const result = await approveCharacterTransfer(
        user,
        detail.session.publicId || detail.session.id,
        request.requestId,
        accessToken,
      );
      setP6ActionFeedback(`이관 승인 완료: ${result.targetSessionCharacterId ?? result.requestId}`);
      const refreshed = await getSessionDetail(user, detail.session.publicId || detail.session.id, accessToken);
      setDetail(refreshed);
    } catch (caught) {
      setP6ActionFeedback(caught instanceof Error ? caught.message : "캐릭터 이관 승인에 실패했습니다.");
    } finally {
      setP6ActionBusy(false);
    }
  }

  async function handleRejectTransfer(request: P6CharacterTransferRequestView) {
    if (!detail || !isHost) return;
    if (!window.confirm(`${request.requestedByUserId}의 캐릭터 이관 요청을 거절할까요?`)) return;
    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      const result = await rejectCharacterTransfer(
        user,
        detail.session.publicId || detail.session.id,
        request.requestId,
        accessToken,
      );
      setP6ActionFeedback(`이관 요청을 거절했습니다: ${result.requestId}`);
      const refreshed = await getSessionDetail(user, detail.session.publicId || detail.session.id, accessToken);
      setDetail(refreshed);
    } catch (caught) {
      setP6ActionFeedback(caught instanceof Error ? caught.message : "캐릭터 이관 거절에 실패했습니다.");
    } finally {
      setP6ActionBusy(false);
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
          {isHost && detail.session.status !== "completed" ? (
            <button
              type="button"
              className="ghost"
              disabled={busy || p6ActionBusy}
              onClick={() => void handleCompleteCampaignArchive()}
            >
              P6 캠페인 완결·보관
            </button>
          ) : null}
          <button type="button" className="primary small" disabled={busy} onClick={() => void handleEnter()}>
            {enterLabel}
          </button>
        </div>
      </section>
      {p6ActionFeedback ? <p className="panel-error">{p6ActionFeedback}</p> : null}

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

      {detail.session.status === "completed" ? (
        <section className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">P6 Campaign Archive</span>
              <h2>완결 기록과 후일담</h2>
            </div>
          </div>
          {archive ? (
            <div className="profile-session-items">
              <div className="profile-session-item">
                <strong>{archive.epilogue}</strong>
                <span>
                  완료 {formatCompactDate(archive.completedAt)} · 공유 범위 {archive.shareScope} · 이관 {archive.allowCharacterTransfer ? "허용" : "불가"}
                </span>
                <span>
                  전투 {archive.analytics.combatCount}회 · 로그 {archive.analytics.turnLogCount}개 · 방문 노드 {archive.analytics.nodeVisitCount}개 · 보관 캐릭터 {archive.analytics.sessionCharacterCount}명
                </span>
                <span>
                  Snapshot v{archive.snapshot.stateVersion} · 최종 노드 {archive.snapshot.currentNodeId ?? "없음"} · downtime 완료 {archive.snapshot.downtime.completedTaskCount}개 · 진행 {archive.snapshot.downtime.activeTaskCount}개
                </span>
                <span>
                  경제 {archive.snapshot.economy.hasEconomyState ? "보존" : "없음"} · party stash {archive.snapshot.economy.partyStashItemCount}개 · 지갑 {archive.snapshot.economy.walletCount}개 · inventory {archive.snapshot.inventory.totalItemCount}개
                </span>
                <span>
                  공개 lineage {archive.snapshot.publicRevisionLineage ? "보존됨" : "없음"} · combat snapshot {archive.snapshot.combat.combatCount}회
                </span>
              </div>
              {archive.characters.slice(0, 6).map((character) => (
                <div key={character.sessionCharacterId} className="profile-session-item">
                  <strong>{character.name}</strong>
                  <span>
                    LV {character.level} {character.className}
                    {character.subclassName ? ` / ${character.subclassName}` : ""} · {character.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-error">{archiveError ?? "완료된 세션이지만 아직 P6 archive가 없습니다."}</p>
          )}
        </section>
      ) : null}

      {isHost && pendingTransferRequests.length > 0 ? (
        <section className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">P6 Character Transfer</span>
              <h2>캐릭터 이관 승인 대기</h2>
            </div>
          </div>
          <div className="profile-session-items">
            {pendingTransferRequests.map((request) => (
              <div key={request.requestId} className="profile-session-item">
                <strong>{request.requestedByUserId}</strong>
                <span>
                  {request.mode} · source {request.sourceSessionId} / {request.sourceSessionCharacterId}
                </span>
                <span>요청일 {formatCompactDate(request.createdAt)}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || p6ActionBusy}
                  onClick={() => void handleApproveTransfer(request)}
                >
                  이관 승인
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || p6ActionBusy}
                  onClick={() => void handleRejectTransfer(request)}
                >
                  이관 거절
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function parseP6CharacterTransferRequests(value: unknown): P6CharacterTransferRequestView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter(
      (entry) =>
        typeof entry.requestId === "string" &&
        typeof entry.requestedByUserId === "string" &&
        typeof entry.sourceSessionId === "string" &&
        typeof entry.sourceSessionCharacterId === "string" &&
        (entry.status === "requested" || entry.status === "approved" || entry.status === "rejected") &&
        (entry.mode === "clone" || entry.mode === "transfer") &&
        typeof entry.createdAt === "string",
    )
    .map((entry) => ({
      requestId: entry.requestId as string,
      requestedByUserId: entry.requestedByUserId as string,
      sourceSessionId: entry.sourceSessionId as string,
      sourceSessionCharacterId: entry.sourceSessionCharacterId as string,
      status: entry.status as P6CharacterTransferRequestView["status"],
      mode: entry.mode as P6CharacterTransferRequestView["mode"],
      targetSessionCharacterId:
        typeof entry.targetSessionCharacterId === "string" ? entry.targetSessionCharacterId : null,
      createdAt: entry.createdAt as string,
    }));
}

function formatCompactDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

