import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  SessionApplicationResponseDto,
  SessionPlayResponseDto,
} from '@trpg/shared-types';
import {
  SessionApplicationStatus,
  SessionActivityStatus,
  SessionAttendanceStatus,
  SessionJoinTiming,
  SessionPlayStatus,
} from '@trpg/shared-types/frontend';
import {
  createSessionPlay,
  listSessionApplications,
  listSessionPlays,
  resolveSessionApplication,
  startSessionPlay,
  transitionSessionPlay,
  updateSessionPlay,
  updateSessionPlayAttendance,
} from '../services/sessionApi';
import type { StoredUser } from '../types/session';
import { ConfirmDialog } from './ConfirmDialog';

interface SessionPlaySchedulePanelProps {
  user: StoredUser;
  accessToken: string | null;
  sessionId: string;
  isHost: boolean;
  activityStatus: SessionActivityStatus;
  onSessionChanged: () => Promise<void>;
  onPlayStarted: () => Promise<void> | void;
}

const playStatusPresentation: Record<SessionPlayStatus, string> = {
  [SessionPlayStatus.SCHEDULED]: '예약됨',
  [SessionPlayStatus.LOBBY_OPEN]: '입장 가능',
  [SessionPlayStatus.PLAYING]: '진행 중',
  [SessionPlayStatus.FINISHED]: '지난 플레이',
  [SessionPlayStatus.CANCELLED]: '취소됨',
};

function formatSchedule(value: string | null): string {
  if (!value) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SessionPlaySchedulePanel({
  user,
  accessToken,
  sessionId,
  isHost,
  activityStatus,
  onSessionChanged,
  onPlayStarted,
}: SessionPlaySchedulePanelProps) {
  const [plays, setPlays] = useState<SessionPlayResponseDto[]>([]);
  const [applications, setApplications] = useState<SessionApplicationResponseDto[]>([]);
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ kind: 'cancel' | 'close' | 'attend'; play: SessionPlayResponseDto } | null>(null);

  const reload = useCallback(async () => {
    const nextPlays = await listSessionPlays(user, sessionId, accessToken);
    setPlays(nextPlays);
    if (isHost) {
      setApplications(await listSessionApplications(user, sessionId, accessToken));
    }
  }, [accessToken, isHost, sessionId, user]);

  useEffect(() => {
    void reload().catch((caught) => {
      setFeedback(caught instanceof Error ? caught.message : '플레이 일정을 불러오지 못했습니다.');
    });
    const intervalId = window.setInterval(() => {
      void reload().then(onSessionChanged).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [onSessionChanged, reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduledStartAt) return;
    void run(async () => {
      const existingSchedule = plays.find((play) => play.status === SessionPlayStatus.SCHEDULED);
      const scheduleInput = {
        scheduledStartAt: new Date(scheduledStartAt).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
      };
      if (existingSchedule) {
        await updateSessionPlay(user, sessionId, existingSchedule.id, {
          ...scheduleInput,
          expectedScheduleVersion: existingSchedule.scheduleVersion,
        }, accessToken);
      } else {
        await createSessionPlay(user, sessionId, scheduleInput, accessToken);
      }
      setScheduledStartAt('');
      await reload();
      await onSessionChanged();
      setFeedback('다음 플레이 일정을 저장했습니다.');
    });
  }

  function cancelSchedule(play: SessionPlayResponseDto) {
    void run(async () => {
      await transitionSessionPlay(user, sessionId, play.id, 'cancel', {
        expectedStateVersion: play.stateVersion,
      }, accessToken);
      await reload();
      await onSessionChanged();
      setFeedback('플레이 일정을 취소했습니다.');
    });
  }

  function openLobbyNow() {
    void run(async () => {
      await createSessionPlay(user, sessionId, { openLobbyNow: true }, accessToken);
      await reload();
      await onSessionChanged();
      setFeedback('대기실을 열었습니다. 구성원은 직접 입장할 수 있습니다.');
    });
  }

  function closeLobby(play: SessionPlayResponseDto) {
    void run(async () => {
      await transitionSessionPlay(user, sessionId, play.id, 'finish', {
        expectedStateVersion: play.stateVersion,
      }, accessToken);
      await reload();
      await onSessionChanged();
      setFeedback('대기실을 닫고 대기 중으로 전환했습니다.');
    });
  }

  function updateAttendance(play: SessionPlayResponseDto, attendance: SessionAttendanceStatus) {
    void run(async () => {
      const acknowledgedScheduleVersions = attendance === SessionAttendanceStatus.ATTENDING
        ? play.proximityWarnings.map((warning) => ({
          comparedPlayId: warning.comparedPlayId,
          playScheduleVersion: warning.targetScheduleVersion,
          comparedScheduleVersion: warning.scheduleVersion,
        }))
        : [];
      await updateSessionPlayAttendance(user, sessionId, play.id, {
        attendance,
        acknowledgedScheduleVersions,
      }, accessToken);
      await reload();
      setFeedback('참석 응답을 저장했습니다.');
    });
  }

  function requestAttendance(play: SessionPlayResponseDto, attendance: SessionAttendanceStatus) {
    if (attendance === SessionAttendanceStatus.ATTENDING && play.proximityWarnings.length) {
      setPendingConfirmation({ kind: 'attend', play });
      return;
    }
    updateAttendance(play, attendance);
  }

  function openLobby(play: SessionPlayResponseDto) {
    void run(async () => {
      await transitionSessionPlay(user, sessionId, play.id, 'open-lobby', {
        expectedStateVersion: play.stateVersion,
      }, accessToken);
      await reload();
      await onSessionChanged();
      setFeedback('대기실을 열었습니다. 구성원은 직접 입장할 수 있습니다.');
    });
  }

  function startPlay(play: SessionPlayResponseDto) {
    void run(async () => {
      await startSessionPlay(user, sessionId, play.id, {
        expectedStateVersion: play.stateVersion,
      }, accessToken);
      await onPlayStarted();
    });
  }

  function resolveApplication(
    application: SessionApplicationResponseDto,
    approved: boolean,
    joinTiming: SessionJoinTiming = SessionJoinTiming.NEXT_PLAY,
  ) {
    void run(async () => {
      await resolveSessionApplication(user, sessionId, application.id, {
        status: approved ? SessionApplicationStatus.APPROVED : SessionApplicationStatus.REJECTED,
        ...(approved ? { joinTiming } : {}),
      }, accessToken);
      await reload();
      await onSessionChanged();
      setFeedback(approved ? '참가 신청을 승인했습니다.' : '참가 신청을 거절했습니다.');
    });
  }

  const visiblePlays = plays.filter((play) => play.status !== SessionPlayStatus.CANCELLED);
  const pendingApplications = applications.filter((application) => application.status === SessionApplicationStatus.PENDING);

  return (
    <section className="profile-card session-play-schedule-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Play schedule</span>
          <h2>플레이 일정</h2>
        </div>
      </div>

      {isHost && activityStatus === SessionActivityStatus.DORMANT ? (
        <form className="session-play-schedule-form" onSubmit={submitSchedule}>
          <label htmlFor="session-play-scheduled-start">다음 플레이 시작 날짜와 시간</label>
          <input
            id="session-play-scheduled-start"
            type="datetime-local"
            value={scheduledStartAt}
            onChange={(event) => setScheduledStartAt(event.target.value)}
            required
          />
          <button type="submit" className="primary small" disabled={busy || !scheduledStartAt}>일정 저장</button>
          {!plays.some((play) => play.status === SessionPlayStatus.SCHEDULED) ? (
            <button type="button" className="ghost small" disabled={busy} onClick={openLobbyNow}>지금 대기실 열기</button>
          ) : null}
          <small>종료 시간은 정하지 않습니다.</small>
        </form>
      ) : null}

      <div className="profile-session-items">
        {visiblePlays.length ? visiblePlays.map((play) => (
          <article key={play.id} className="profile-session-item">
            <strong>{formatSchedule(play.scheduledStartAt)}</strong>
            <span>{playStatusPresentation[play.status]}</span>
            {play.summary ? <p>{play.summary}</p> : null}
            {play.status === SessionPlayStatus.SCHEDULED ? (
              <div className="session-play-attendance-actions" aria-label="참석 응답">
                <button type="button" className="ghost" disabled={busy} onClick={() => requestAttendance(play, SessionAttendanceStatus.ATTENDING)}>참석</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => requestAttendance(play, SessionAttendanceStatus.TENTATIVE)}>미정</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => requestAttendance(play, SessionAttendanceStatus.ABSENT)}>불참</button>
              </div>
            ) : null}
            {isHost && play.status === SessionPlayStatus.SCHEDULED ? (
              <div className="session-play-attendance-actions">
                <button type="button" className="primary small" disabled={busy} onClick={() => openLobby(play)}>대기실 열기</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => setPendingConfirmation({ kind: 'cancel', play })}>일정 취소</button>
              </div>
            ) : null}
            {isHost && play.status === SessionPlayStatus.LOBBY_OPEN ? (
              <div className="session-play-attendance-actions">
                <button type="button" className="primary small" disabled={busy} onClick={() => startPlay(play)}>플레이 시작</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => setPendingConfirmation({ kind: 'close', play })}>대기실 닫기</button>
              </div>
            ) : null}
          </article>
        )) : <p>아직 정해진 다음 플레이 일정이 없습니다.</p>}
      </div>

      {isHost && pendingApplications.length ? (
        <div className="session-play-applications">
          <h3>참가 신청</h3>
          {pendingApplications.map((application) => (
            <article key={application.id} className="profile-session-item">
              <strong>{application.applicant.displayName}</strong>
              {application.note ? <p>{application.note}</p> : null}
              <div className="session-play-attendance-actions">
                {[
                  SessionActivityStatus.LOBBY_OPEN,
                  SessionActivityStatus.PLAYING,
                ].includes(activityStatus) ? (
                  <button
                    type="button"
                    className="primary small"
                    disabled={busy}
                    onClick={() => resolveApplication(application, true, SessionJoinTiming.CURRENT_PLAY)}
                  >
                    현재 플레이부터 승인
                  </button>
                ) : null}
                <button type="button" className="primary small" disabled={busy} onClick={() => resolveApplication(application, true, SessionJoinTiming.NEXT_PLAY)}>다음 플레이부터 승인</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => resolveApplication(application, false)}>거절</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {feedback ? <p className="panel-error">{feedback}</p> : null}
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.kind === 'cancel'
          ? '플레이 일정 취소'
          : pendingConfirmation?.kind === 'close'
            ? '대기실 닫기'
            : '가까운 플레이 일정 확인'}
        confirmLabel={pendingConfirmation?.kind === 'cancel'
          ? '일정 취소'
          : pendingConfirmation?.kind === 'close'
            ? '대기실 닫기'
            : '확인하고 참석'}
        danger={pendingConfirmation?.kind === 'cancel'}
        busy={busy}
        onClose={() => setPendingConfirmation(null)}
        onConfirm={() => {
          if (!pendingConfirmation) return;
          const { kind, play } = pendingConfirmation;
          setPendingConfirmation(null);
          if (kind === 'cancel') cancelSchedule(play);
          else if (kind === 'close') closeLobby(play);
          else updateAttendance(play, SessionAttendanceStatus.ATTENDING);
        }}
      >
        {pendingConfirmation?.kind === 'cancel' ? (
          <p>예약한 플레이 일정을 취소할까요?</p>
        ) : pendingConfirmation?.kind === 'close' ? (
          <p>대기실을 닫고 세션을 대기 중으로 전환할까요? 구성원의 준비 상태와 실시간 입장은 정리됩니다.</p>
        ) : (
          <>
            <p>시작 시간이 6시간 이하로 가까운 플레이가 있습니다. 종료 시간은 정하지 않으므로 일정이 겹칠 수 있습니다.</p>
            <ul>
              {pendingConfirmation?.play.proximityWarnings.map((warning) => (
                <li key={warning.comparedPlayId}>{warning.sessionTitle} · {formatSchedule(warning.scheduledStartAt)} · {warning.differenceMinutes}분 차이</li>
              ))}
            </ul>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
