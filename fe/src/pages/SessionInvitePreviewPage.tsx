import { useEffect, useState } from 'react';
import type { SessionInvitePreviewResponseDto } from '@trpg/shared-types';
import { GmMode } from '@trpg/shared-types/frontend';
import { getSessionInvitePreview } from '../services/sessionApi';
import type { SessionSnapshot } from '../types/session';
import './SessionInvitePreviewPage.css';

interface SessionInvitePreviewPageProps {
  inviteCode: string;
  busy: boolean;
  joinError: string | null;
  onJoin: (inviteCode: string) => Promise<SessionSnapshot | null>;
  onCancel: () => void;
}

function formatSchedule(value: string | null): string {
  if (!value) return '아직 정해지지 않음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '일정 확인 필요' : date.toLocaleString('ko-KR');
}

function getGmModeLabel(value: GmMode): string {
  return value === GmMode.AI ? 'AI GM' : '사람 GM';
}

export function SessionInvitePreviewPage({
  inviteCode,
  busy,
  joinError,
  onJoin,
  onCancel,
}: SessionInvitePreviewPageProps) {
  const [preview, setPreview] = useState<SessionInvitePreviewResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSessionInvitePreview(inviteCode)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setError('유효한 초대 링크를 확인할 수 없습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  async function confirmJoin() {
    await onJoin(inviteCode);
  }

  if (loading) {
    return <main className="session-invite-page"><p>초대받은 세션을 확인하는 중입니다.</p></main>;
  }

  if (!preview || error) {
    return (
      <main className="session-invite-page">
        <section className="session-invite-card">
          <h1>초대 링크를 확인하지 못했습니다</h1>
          <p>{error}</p>
          <button type="button" onClick={onCancel}>세션 탐색으로 돌아가기</button>
        </section>
      </main>
    );
  }

  const endLevel = preview.scenario.recommendedEndLevel;
  return (
    <main className="session-invite-page">
      <section className="session-invite-card">
        <span className="eyebrow">세션 초대</span>
        <h1>{preview.title}</h1>
        <p>{preview.description.trim() || '세션 설명이 아직 입력되지 않았습니다.'}</p>

        <dl>
          <div><dt>시나리오</dt><dd>{preview.scenario.title}</dd></div>
          <div><dt>GM</dt><dd>{getGmModeLabel(preview.gmMode)}</dd></div>
          <div><dt>인원</dt><dd>{preview.participantCount} / {preview.maxParticipants}</dd></div>
          <div><dt>다음 플레이</dt><dd>{formatSchedule(preview.nextSessionAt)}</dd></div>
          <div>
            <dt>권장 레벨</dt>
            <dd>{preview.scenario.startLevel}{endLevel && endLevel !== preview.scenario.startLevel ? `~${endLevel}` : ''}</dd>
          </div>
          <div><dt>예상 시간</dt><dd>{preview.scenario.estimatedMinutes ? `${preview.scenario.estimatedMinutes}분` : '미정'}</dd></div>
          <div>
            <dt>권장 인원</dt>
            <dd>
              {preview.scenario.recommendedPlayersMin && preview.scenario.recommendedPlayersMax
                ? `${preview.scenario.recommendedPlayersMin}~${preview.scenario.recommendedPlayersMax}명`
                : '미정'}
            </dd>
          </div>
          <div><dt>테마</dt><dd>{preview.scenario.tags.length ? preview.scenario.tags.join(', ') : '미정'}</dd></div>
        </dl>

        {preview.scenario.description ? <p className="session-invite-scenario-copy">{preview.scenario.description}</p> : null}
        {joinError ? <p className="session-invite-error" role="alert">{joinError}</p> : null}

        <div className="session-invite-actions">
          <button type="button" className="ghost" onClick={onCancel}>취소</button>
          <button type="button" className="primary" disabled={busy} onClick={() => void confirmJoin()}>
            참가하기
          </button>
        </div>
      </section>
    </main>
  );
}
