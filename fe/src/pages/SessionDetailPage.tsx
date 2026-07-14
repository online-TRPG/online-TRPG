/*
 * SessionDetailPage
 * 역할: 공개/내 세션 상세 정보를 보여주고 참가 또는 현재 세션 복귀를 처리합니다.
 * 읽는 순서:
 * 1) STATUS_LABEL/GM_MODE_LABEL: 서버 상태값을 화면 문구로 변환
 * 2) state/useEffect: sessionPublicId로 상세 정보 조회
 * 3) canonicalPath useEffect: 세션 공개 주소를 정규화
 * 4) handleEnter: 이미 참여한 세션이면 열기, 아니면 참가 후 플레이 화면 이동
 * 5) JSX: 로딩/에러 상태, 세션 헤더, 메타 정보, 세션 관리자 카드
 */
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  approveCharacterTransfer,
  completeLongCampaign,
  createSessionApplication,
  getCampaignArchive,
  getSessionApplicationProximityWarnings,
  getSessionDetail,
  rejectCharacterTransfer,
  updateSession,
} from "../services/sessionApi";
import type { Scenario, SessionDetail, SessionSnapshot, StoredUser, User } from "../types/session";
import {
  isActiveSessionScenarioStatus,
  isCompletedSessionStatus,
  isJoinedParticipantStatus,
  isRecord,
  GmMode,
  RecruitmentStatus,
  SessionActivityStatus,
  SessionJoinPolicy,
  SessionVisibility,
} from "@trpg/shared-types/frontend";
import type { CampaignArchiveResponseDto, SessionScheduleProximityWarningDto } from "@trpg/shared-types";

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
import { SessionPlaySchedulePanel } from "../components/SessionPlaySchedulePanel";
import {
  getGmModeLabel,
  getSessionActivityStatusLabel,
  getSessionCharacterStatusLabel,
  getSessionVisibilityLabel,
} from "../presentation/sessionLabels";
import { getRuleSetLabel } from "../presentation/ruleSetLabels";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface SessionDetailPageProps {
  user: StoredUser;
  accessToken: string | null;
  sessionPublicId: string;
  snapshot: SessionSnapshot | null;
  scenarios: Scenario[];
  knownMember: boolean;
  busy: boolean;
  onJoinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  onOpenHostProfile: (host: User) => void;
}

// 서버에서 받은 세션 상태값을 화면 문구로 바꾸는 매핑입니다.
// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function SessionDetailPage({
  user,
  accessToken,
  sessionPublicId,
  snapshot,
  scenarios,
  knownMember,
  busy,
  onJoinSessionById,
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
  const [applicationFeedback, setApplicationFeedback] = useState<string | null>(null);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [applicationNote, setApplicationNote] = useState("");
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsScenarioId, setSettingsScenarioId] = useState("");
  const [settingsMaxParticipants, setSettingsMaxParticipants] = useState(4);
  const [settingsGmMode, setSettingsGmMode] = useState<GmMode>(GmMode.AI);
  const [settingsVisibility, setSettingsVisibility] = useState<SessionVisibility>(SessionVisibility.PUBLIC);
  const [settingsRecruitment, setSettingsRecruitment] = useState<RecruitmentStatus>(RecruitmentStatus.OPEN);
  const [settingsJoinPolicy, setSettingsJoinPolicy] = useState<SessionJoinPolicy>(SessionJoinPolicy.APPROVAL_REQUIRED);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);
  const [pendingScheduleWarnings, setPendingScheduleWarnings] = useState<SessionScheduleProximityWarningDto[]>([]);
  const [isCompletionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionEpilogue, setCompletionEpilogue] = useState("파티는 마지막 위협을 봉인하고 다음 전설을 남겼습니다.");
  const [completionShareScope, setCompletionShareScope] = useState<"private" | "party" | "public_summary">("party");
  const [allowCharacterTransfer, setAllowCharacterTransfer] = useState(false);
  const [pendingTransferDecision, setPendingTransferDecision] = useState<{ request: P6CharacterTransferRequestView; action: "approve" | "reject" } | null>(null);
  const completionDialogFocus = useDialogFocusTrap<HTMLDivElement>(isCompletionDialogOpen, () => setCompletionDialogOpen(false));

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
    if (!detail || !isCompletedSessionStatus(detail.session.status)) {
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
        setArchiveError(caught instanceof Error ? caught.message : "캠페인 완결 기록을 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, detail, user]);

  useEffect(() => {
    if (!detail) return;
    const scenarioId = detail.sessionScenarios
      .find((item) => isActiveSessionScenarioStatus(item.status))?.scenario.id
      ?? detail.scenario?.id
      ?? "";
    setSettingsTitle(detail.session.title);
    setSettingsDescription(detail.session.description ?? "");
    setSettingsScenarioId(scenarioId);
    setSettingsMaxParticipants(detail.session.maxParticipants);
    setSettingsGmMode(detail.session.gmMode);
    setSettingsVisibility(detail.session.visibility);
    setSettingsRecruitment(detail.session.recruitmentStatus);
    setSettingsJoinPolicy(detail.session.joinPolicy);
  }, [detail]);

  // 현재 접속 중인 세션인지, 이미 참여한 세션인지 판단해 버튼 문구/동작을 결정합니다.
  const isCurrentSession = detail?.session.id === snapshot?.session.id;
  const isKnownMember = isCurrentSession || knownMember;
  const activeScenario =
    detail?.sessionScenarios.find((item) => isActiveSessionScenarioStatus(item.status))?.scenario ?? detail?.scenario ?? null;
  const participantCount = detail?.participants.filter((item) => isJoinedParticipantStatus(item.status)).length ?? 0;
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
    if (!isKnownMember && detail.session.joinPolicy === SessionJoinPolicy.APPROVAL_REQUIRED) {
      setApplicationFeedback(null);
      try {
        const warnings = await getSessionApplicationProximityWarnings(
          user,
          detail.session.publicId || detail.session.id,
          accessToken,
        );
        if (warnings.length) {
          setPendingScheduleWarnings(warnings);
          return;
        }
        await submitApplication([]);
      } catch (caught) {
        setApplicationFeedback(caught instanceof Error ? caught.message : "참가 신청을 보내지 못했습니다.");
      }
      return;
    }

    await onJoinSessionById(detail.session.publicId);
  }

  async function submitApplication(warnings: SessionScheduleProximityWarningDto[]) {
    if (!detail) return;
    setApplicationFeedback(null);
    try {
      await createSessionApplication(user, detail.session.publicId || detail.session.id, {
        note: applicationNote.trim() || undefined,
        acknowledgedScheduleVersions: warnings.map((warning) => ({
          comparedPlayId: warning.comparedPlayId,
          playScheduleVersion: warning.targetScheduleVersion,
          comparedScheduleVersion: warning.scheduleVersion,
        })),
      }, accessToken);
      setApplicationSubmitted(true);
      setPendingScheduleWarnings([]);
      setApplicationFeedback("세션 관리자에게 참가 신청을 보냈습니다.");
    } catch (caught) {
      setApplicationFeedback(caught instanceof Error ? caught.message : "참가 신청을 보내지 못했습니다.");
    }
  }

  async function saveSessionSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !isHost) return;
    setSettingsBusy(true);
    setSettingsFeedback(null);
    try {
      await updateSession(user, detail.session.publicId || detail.session.id, {
        title: settingsTitle.trim(),
        description: settingsDescription.trim(),
        scenarioId: settingsScenarioId || undefined,
        maxParticipants: settingsMaxParticipants,
        gmMode: settingsGmMode,
        visibility: settingsVisibility,
        recruitmentStatus: settingsRecruitment,
        joinPolicy: settingsVisibility === SessionVisibility.PRIVATE
          ? SessionJoinPolicy.INVITE_ONLY
          : settingsJoinPolicy,
      }, accessToken);
      setDetail(await getSessionDetail(user, detail.session.publicId || detail.session.id, accessToken));
      setSettingsFeedback("방 설정을 저장했습니다.");
    } catch (caught) {
      setSettingsFeedback(caught instanceof Error ? caught.message : "방 설정을 저장하지 못했습니다.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleCompleteCampaignArchive() {
    if (!detail || !isHost) return;
    setCompletionEpilogue("파티는 마지막 위협을 봉인하고 다음 전설을 남겼습니다.");
    setCompletionShareScope("party");
    setAllowCharacterTransfer(false);
    setCompletionDialogOpen(true);
  }

  async function submitCompleteCampaignArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !isHost || !completionEpilogue.trim()) return;

    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      const nextArchive = await completeLongCampaign(
        user,
        detail.session.publicId || detail.session.id,
        {
          epilogue: completionEpilogue.trim(),
          finalNodeId: detail.state.currentNodeId,
          finalRewardIds: [],
          shareScope: completionShareScope,
          allowCharacterTransfer,
        },
        accessToken,
      );
      setArchive(nextArchive);
      setCompletionDialogOpen(false);
      setP6ActionFeedback("캠페인 완결 기록을 저장했습니다.");
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
    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      await approveCharacterTransfer(
        user,
        detail.session.publicId || detail.session.id,
        request.requestId,
        accessToken,
      );
      setP6ActionFeedback("캐릭터 이관을 승인했습니다.");
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
    setP6ActionBusy(true);
    setP6ActionFeedback(null);
    try {
      await rejectCharacterTransfer(
        user,
        detail.session.publicId || detail.session.id,
        request.requestId,
        accessToken,
      );
      setP6ActionFeedback("캐릭터 이관 요청을 거절했습니다.");
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

  const enterLabel = isKnownMember
    ? [SessionActivityStatus.LOBBY_OPEN, SessionActivityStatus.PLAYING].includes(detail.session.activityStatus)
      ? "대기실 입장"
      : "세션 홈 열기"
    : detail.session.joinPolicy === SessionJoinPolicy.APPROVAL_REQUIRED
      ? applicationSubmitted ? "참가 신청 완료" : "참가 신청"
      : "세션 참가";
  const showEnterAction = !isKnownMember || [
    SessionActivityStatus.LOBBY_OPEN,
    SessionActivityStatus.PLAYING,
  ].includes(detail.session.activityStatus);

  return (
    <main className="session-page">
      {/* 세션 제목/설명과 입장 액션 버튼 영역입니다. */}
      <section className="session-page-header">
        <div>
          <span className="eyebrow">세션 상세</span>
          <h1>{detail.session.title}</h1>
          <p>{detail.session.description?.trim() || "아직 세션 소개가 입력되지 않았습니다."}</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={() => onOpenHostProfile(detail.host)}>
            세션 관리자 프로필 보기
          </button>
          {isHost && !isCompletedSessionStatus(detail.session.status) ? (
            <button
              type="button"
              className="ghost"
              disabled={busy || p6ActionBusy}
              onClick={() => void handleCompleteCampaignArchive()}
            >
              캠페인 완결·보관
            </button>
          ) : null}
          {showEnterAction ? <button
            type="button"
            className="primary small"
            disabled={
              busy ||
              applicationSubmitted ||
              (!isKnownMember && detail.session.recruitmentStatus !== RecruitmentStatus.OPEN)
            }
            onClick={() => void handleEnter()}
          >
            {enterLabel}
          </button> : null}
        </div>
      </section>
      {p6ActionFeedback ? <p className="panel-error">{p6ActionFeedback}</p> : null}
      {applicationFeedback ? <p className="panel-error">{applicationFeedback}</p> : null}
      {!isKnownMember && detail.session.joinPolicy === SessionJoinPolicy.APPROVAL_REQUIRED ? (
        <section className="profile-card session-application-note">
          <label htmlFor="session-application-note">세션 관리자에게 전할 참가 메모 (선택)</label>
          <textarea
            id="session-application-note"
            value={applicationNote}
            onChange={(event) => setApplicationNote(event.target.value)}
            maxLength={300}
            rows={3}
            disabled={applicationSubmitted}
            placeholder="예: 가능한 요일이나 처음 참여한다는 점을 간단히 알려주세요."
          />
          <small>{applicationNote.length}/300 · 이 메모는 참가 신청 검토에만 사용됩니다.</small>
        </section>
      ) : null}

      {isHost ? (
        <section className="profile-card session-home-settings">
          <div className="section-heading">
            <div><span className="eyebrow">방 설정</span><h2>방 설정</h2></div>
          </div>
          {[SessionActivityStatus.DORMANT, SessionActivityStatus.LOBBY_OPEN].includes(detail.session.activityStatus) ? (
            <form className="session-home-settings-form" onSubmit={saveSessionSettings}>
              <label>세션 제목<input value={settingsTitle} onChange={(event) => setSettingsTitle(event.target.value)} maxLength={100} required /></label>
              <label className="session-home-settings-wide">세션 설명<textarea value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} maxLength={500} /></label>
              <label>시나리오<select value={settingsScenarioId} onChange={(event) => setSettingsScenarioId(event.target.value)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}</select></label>
              <label>총 인원 (GM/세션 관리자 포함)<input type="number" min={1} max={8} value={settingsMaxParticipants} onChange={(event) => setSettingsMaxParticipants(Number(event.target.value))} /></label>
              <label>GM 유형<select value={settingsGmMode} onChange={(event) => setSettingsGmMode(event.target.value as GmMode)}><option value={GmMode.AI}>AI GM</option><option value={GmMode.HUMAN}>사람 GM</option></select></label>
              <label>공개 범위<select value={settingsVisibility} onChange={(event) => setSettingsVisibility(event.target.value as SessionVisibility)}><option value={SessionVisibility.PUBLIC}>공개</option><option value={SessionVisibility.PRIVATE}>비공개</option></select></label>
              <label>모집 상태<select value={settingsRecruitment} onChange={(event) => setSettingsRecruitment(event.target.value as RecruitmentStatus)}><option value={RecruitmentStatus.OPEN}>모집 중</option><option value={RecruitmentStatus.CLOSED}>모집 마감</option></select></label>
              <label>참가 방식<select disabled={settingsVisibility === SessionVisibility.PRIVATE} value={settingsVisibility === SessionVisibility.PRIVATE ? SessionJoinPolicy.INVITE_ONLY : settingsJoinPolicy} onChange={(event) => setSettingsJoinPolicy(event.target.value as SessionJoinPolicy)}><option value={SessionJoinPolicy.INVITE_ONLY}>초대 전용</option><option value={SessionJoinPolicy.APPROVAL_REQUIRED}>세션 관리자 승인</option><option value={SessionJoinPolicy.OPEN_JOIN}>바로 참가</option></select></label>
              <button type="submit" className="primary small" disabled={settingsBusy}>{settingsBusy ? "저장 중..." : "방 설정 저장"}</button>
            </form>
          ) : (
            <p>플레이 진행 중에는 방 설정을 변경할 수 없습니다. <strong>진행 저장 후 닫기</strong>로 대기 중 상태에 돌아온 뒤 수정해주세요.</p>
          )}
          {settingsFeedback ? <p className="panel-error">{settingsFeedback}</p> : null}
        </section>
      ) : null}

      {isKnownMember ? (
        <SessionPlaySchedulePanel
          user={user}
          accessToken={accessToken}
          sessionId={detail.session.publicId || detail.session.id}
          isHost={isHost}
          activityStatus={detail.session.activityStatus}
          onSessionChanged={async () => {
            setDetail(await getSessionDetail(user, detail.session.publicId || detail.session.id, accessToken));
          }}
          onPlayStarted={async () => {
            await onJoinSessionById(detail.session.publicId || detail.session.id);
          }}
        />
      ) : null}

      {/* 세션 메타 정보와 세션 관리자 프로필 정보를 나란히 보여줍니다. */}
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
              <dd>{getRuleSetLabel(detail.session.ruleSetId)}</dd>
            </div>
            <div className="profile-kv-item">
              <dt>GM 모드</dt>
              <dd>{getGmModeLabel(detail.session.gmMode)}</dd>
            </div>
            <div className="profile-kv-item">
              <dt>공개 범위</dt>
              <dd>{getSessionVisibilityLabel(detail.session.visibility)}</dd>
            </div>
            <div className="profile-kv-item">
              <dt>인원</dt>
              <dd>
                {participantCount} / {detail.session.maxParticipants}
              </dd>
            </div>
            <div className="profile-kv-item">
              <dt>상태</dt>
              <dd>{getSessionActivityStatusLabel(detail.session.activityStatus)}</dd>
            </div>
          </dl>
        </article>

        <article className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Host</span>
              <h2>세션 관리자 정보</h2>
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

      {isCompletedSessionStatus(detail.session.status) ? (
        <section className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">캠페인 완결 기록</span>
              <h2>완결 기록과 후일담</h2>
            </div>
          </div>
          {archive ? (
            <div className="profile-session-items">
              <div className="profile-session-item">
                <strong>{archive.epilogue}</strong>
                <span>
                  완료 {formatCompactDate(archive.completedAt)} · 공유 범위 {getArchiveShareScopeLabel(archive.shareScope)} · 이관 {archive.allowCharacterTransfer ? "허용" : "불가"}
                </span>
                <span>
                  전투 {archive.analytics.combatCount}회 · 로그 {archive.analytics.turnLogCount}개 · 방문 장면 {archive.analytics.nodeVisitCount}개 · 보관 캐릭터 {archive.analytics.sessionCharacterCount}명
                </span>
                <span>
                  휴식기 활동 완료 {archive.snapshot.downtime.completedTaskCount}개 · 진행 {archive.snapshot.downtime.activeTaskCount}개
                </span>
                <span>
                  경제 기록 {archive.snapshot.economy.hasEconomyState ? "보존" : "없음"} · 공용 보관함 {archive.snapshot.economy.partyStashItemCount}개 · 지갑 {archive.snapshot.economy.walletCount}개 · 소지품 {archive.snapshot.inventory.totalItemCount}개
                </span>
                <span>
                  공개 시나리오 계보 {archive.snapshot.publicRevisionLineage ? "보존됨" : "없음"} · 전투 기록 {archive.snapshot.combat.combatCount}회
                </span>
              </div>
              {archive.characters.slice(0, 6).map((character) => (
                <div key={character.sessionCharacterId} className="profile-session-item">
                  <strong>{character.name}</strong>
                  <span>
                    LV {character.level} {character.className}
                    {character.subclassName ? ` / ${character.subclassName}` : ""} · {getSessionCharacterStatusLabel(character.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-error">{archiveError ?? "완료된 세션의 보관 기록을 아직 불러올 수 없습니다."}</p>
          )}
        </section>
      ) : null}

      {isHost && pendingTransferRequests.length > 0 ? (
        <section className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">캐릭터 이관</span>
              <h2>캐릭터 이관 승인 대기</h2>
            </div>
          </div>
          <div className="profile-session-items">
            {pendingTransferRequests.map((request) => (
              <div key={request.requestId} className="profile-session-item">
                <strong>캐릭터 이관 요청</strong>
                <span>{request.mode === "transfer" ? "이관" : "복제"}</span>
                <span>요청일 {formatCompactDate(request.createdAt)}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || p6ActionBusy}
                  onClick={() => setPendingTransferDecision({ request, action: "approve" })}
                >
                  이관 승인
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || p6ActionBusy}
                  onClick={() => setPendingTransferDecision({ request, action: "reject" })}
                >
                  이관 거절
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingScheduleWarnings.length > 0}
        title="가까운 플레이 일정 확인"
        confirmLabel="확인하고 참가 신청"
        busy={applicationSubmitted}
        onClose={() => setPendingScheduleWarnings([])}
        onConfirm={() => void submitApplication(pendingScheduleWarnings)}
      >
        <p>이미 참가를 예정한 플레이와 시작 시간이 6시간 이하로 가깝습니다. 종료 시간은 정하지 않으므로 일정이 겹칠 수 있습니다.</p>
        <ul>
          {pendingScheduleWarnings.map((warning) => (
            <li key={warning.comparedPlayId}>
              {warning.sessionTitle} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(warning.scheduledStartAt))} · {warning.differenceMinutes}분 차이
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      {isCompletionDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCompletionDialogOpen(false)}>
          <div
            ref={completionDialogFocus.dialogRef}
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-completion-title"
            tabIndex={-1}
            onKeyDown={completionDialogFocus.onDialogKeyDown}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header"><h2 id="campaign-completion-title">캠페인 완결·보관</h2></div>
            <form className="modal-form" onSubmit={submitCompleteCampaignArchive}>
              <label htmlFor="campaign-epilogue">후일담</label>
              <textarea id="campaign-epilogue" value={completionEpilogue} onChange={(event) => setCompletionEpilogue(event.target.value)} rows={5} required maxLength={2000} />
              <label htmlFor="campaign-share-scope">완결 기록 공유 범위</label>
              <select id="campaign-share-scope" value={completionShareScope} onChange={(event) => setCompletionShareScope(event.target.value as "private" | "party" | "public_summary")}>
                <option value="private">나만 보기</option>
                <option value="party">참가자에게 공개</option>
                <option value="public_summary">요약 공개</option>
              </select>
              <label>
                <input type="checkbox" checked={allowCharacterTransfer} onChange={(event) => setAllowCharacterTransfer(event.target.checked)} />
                완료 캐릭터를 새 캠페인으로 이관할 수 있게 허용
              </label>
              <div className="session-page-actions">
                <button type="button" className="ghost" disabled={p6ActionBusy} onClick={() => setCompletionDialogOpen(false)}>취소</button>
                <button type="submit" className="primary" disabled={p6ActionBusy || !completionEpilogue.trim()}>{p6ActionBusy ? "저장 중..." : "완결 기록 저장"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingTransferDecision)}
        title={`캐릭터 이관 ${pendingTransferDecision?.action === "approve" ? "승인" : "거절"}`}
        confirmLabel={pendingTransferDecision?.action === "approve" ? "이관 승인" : "이관 거절"}
        busy={p6ActionBusy}
        danger={pendingTransferDecision?.action === "reject"}
        onClose={() => setPendingTransferDecision(null)}
        onConfirm={() => {
          if (!pendingTransferDecision) return;
          const decision = pendingTransferDecision;
          setPendingTransferDecision(null);
          if (decision.action === "approve") void handleApproveTransfer(decision.request);
          else void handleRejectTransfer(decision.request);
        }}
      >
        <p>이 캐릭터 이관 요청을 {pendingTransferDecision?.action === "approve" ? "승인" : "거절"}할까요?</p>
      </ConfirmDialog>
    </main>
  );
}

function getArchiveShareScopeLabel(value: "private" | "party" | "public_summary"): string {
  if (value === "private") return "나만 보기";
  if (value === "public_summary") return "요약 공개";
  return "참가자 공개";
}

function parseP6CharacterTransferRequests(value: unknown): P6CharacterTransferRequestView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.requestId !== "string" ||
      typeof entry.requestedByUserId !== "string" ||
      typeof entry.sourceSessionId !== "string" ||
      typeof entry.sourceSessionCharacterId !== "string" ||
      (entry.status !== "requested" && entry.status !== "approved" && entry.status !== "rejected") ||
      (entry.mode !== "clone" && entry.mode !== "transfer") ||
      typeof entry.createdAt !== "string"
    ) {
      return [];
    }

    return [{
      requestId: entry.requestId,
      requestedByUserId: entry.requestedByUserId,
      sourceSessionId: entry.sourceSessionId,
      sourceSessionCharacterId: entry.sourceSessionCharacterId,
      status: entry.status,
      mode: entry.mode,
      targetSessionCharacterId:
        typeof entry.targetSessionCharacterId === "string" ? entry.targetSessionCharacterId : null,
      createdAt: entry.createdAt,
    }];
  });
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

