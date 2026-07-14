/*
 * SessionCreatePage
 * 역할: 새 플레이 세션을 만들기 위한 설정 페이지입니다.
 * 읽는 순서:
 * 1) SessionCreatePageProps: 선택 가능한 시나리오 목록과 생성 콜백
 * 2) scenarioOptions: 시나리오 목록을 셀렉트/프리뷰용 옵션으로 변환
 * 3) form state: 세션 제목, 선택 시나리오, 최대 인원, AI GM 사용 여부
 * 4) submitSession: 폼 값을 onCreateSession 콜백으로 전달
 * 5) JSX: 입력 폼 카드와 선택 시나리오 프리뷰 카드
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  GmMode,
  SessionVisibility,
} from '@trpg/shared-types/frontend';
import buttonSimpleBeigeImage from '../components/Button_Simple_Beige.webp';
import boxBulletinImage from '../components/Box_Bulletin_Rectangle.webp';
import { buildSessionScenarioOptions } from '../data/sessionVisuals';
import type { CreateSessionInput } from '../services/sessionApi';
import { trackProductEvent } from '../services/productEvents';
import type { Scenario } from '../types/session';
import './SessionCreatePage.css';

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface SessionCreatePageProps {
  scenarios: Scenario[];
  initialScenarioId?: string | null;
  busy: boolean;
  error: string | null;
  onCreateSession: (input: CreateSessionInput) => void | Promise<void>;
}

function readClampedInteger(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function padSchedulePart(value: number): string {
  return String(value).padStart(2, '0');
}

const SCHEDULE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => padSchedulePart(hour));
const SCHEDULE_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => padSchedulePart(minute));

function createCurrentLocalSchedule(): { date: string; time: string } {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${padSchedulePart(now.getMonth() + 1)}-${padSchedulePart(now.getDate())}`,
    time: `${padSchedulePart(now.getHours())}:${padSchedulePart(now.getMinutes())}`,
  };
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="session-create-icon">
      <rect x="6" y="7" width="12" height="10" rx="3" />
      <path d="M12 4v3M4 12H2M22 12h-2M8 19v2M16 19v2" />
      <circle cx="9.5" cy="12" r="1.2" className="session-create-icon-fill" />
      <circle cx="14.5" cy="12" r="1.2" className="session-create-icon-fill" />
      <path d="M9 15.3c.9.6 1.9.9 3 .9s2.1-.3 3-.9" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="session-create-meta-icon">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c.7-3.1 3.3-5 6.5-5s5.8 1.9 6.5 5" />
    </svg>
  );
}

export function SessionCreatePage({
  scenarios,
  initialScenarioId = null,
  busy,
  error,
  onCreateSession,
}: SessionCreatePageProps) {
  useEffect(() => {
    trackProductEvent('session_create_started', 'session-create');
  }, []);
  // 시나리오 데이터를 셀렉트 박스와 프리뷰 카드에서 쓰기 쉬운 형태로 변환합니다.
  const scenarioOptions = useMemo(() => buildSessionScenarioOptions(scenarios), [scenarios]);
  const providedScenarioOptions = useMemo(
    () => scenarioOptions.filter((scenarioOption) => scenarioOption.group === 'provided'),
    [scenarioOptions]
  );
  const customScenarioOptions = useMemo(
    () => scenarioOptions.filter((scenarioOption) => scenarioOption.group === 'custom'),
    [scenarioOptions]
  );
  // 세션 생성 폼에서 사용자가 입력/선택하는 값들입니다.
  const [sessionTitle, setSessionTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [gmMode, setGmMode] = useState<GmMode>(GmMode.AI);
  const [visibility, setVisibility] = useState<SessionVisibility>(SessionVisibility.PUBLIC);
  const [playSchedule, setPlaySchedule] = useState(createCurrentLocalSchedule);
  const [joinPolicy, setJoinPolicy] = useState<'INVITE_ONLY' | 'APPROVAL_REQUIRED' | 'OPEN_JOIN'>('APPROVAL_REQUIRED');
  const [openLobbyNow, setOpenLobbyNow] = useState(true);

  // 시나리오 옵션이 로드되면 구현 완료된 기본 제공 시나리오를 우선 선택합니다.
  useEffect(() => {
    const selectedOptionExists = scenarioOptions.some(
      (scenarioOption) => scenarioOption.key === selectedScenarioKey
    );
    const initialOption = initialScenarioId
      ? scenarioOptions.find((scenarioOption) => scenarioOption.scenarioId === initialScenarioId)
      : null;
    if (!selectedScenarioKey && initialOption) {
      setSelectedScenarioKey(initialOption.key);
      return;
    }
    if ((!selectedScenarioKey || !selectedOptionExists) && scenarioOptions.length) {
      setSelectedScenarioKey(scenarioOptions[0].key);
    }
  }, [initialScenarioId, scenarioOptions, selectedScenarioKey]);

  // 현재 선택된 시나리오 옵션입니다. 오른쪽 프리뷰 카드에 사용됩니다.
  const selectedScenario =
    scenarioOptions.find((scenarioOption) => scenarioOption.key === selectedScenarioKey) ??
    scenarioOptions[0] ??
    null;

  // 폼 제출 시 부모의 세션 생성 콜백으로 입력값을 전달합니다.
  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCreateSession({
      title: sessionTitle.trim() || selectedScenario?.title || '새 세션',
      description: description.trim(),
      scenarioId: selectedScenario?.scenarioId,
      maxParticipants: maxPlayers,
      gmMode,
      visibility,
      nextSessionAt: new Date(`${playSchedule.date}T${playSchedule.time}`).toISOString(),
      recruitmentStatus: visibility === SessionVisibility.PUBLIC ? 'OPEN' : 'CLOSED',
      joinPolicy: visibility === SessionVisibility.PRIVATE ? 'INVITE_ONLY' : joinPolicy,
      openLobbyNow,
    });
  }

  function updatePlayScheduleTime(part: 'hour' | 'minute', value: string) {
    setPlaySchedule((current) => {
      const [currentHour = '00', currentMinute = '00'] = current.time.split(':');
      return {
        ...current,
        time: part === 'hour' ? `${value}:${currentMinute}` : `${currentHour}:${value}`,
      };
    });
  }

  const [selectedScheduleHour = '00', selectedScheduleMinute = '00'] = playSchedule.time.split(':');

  return (
    <main className="session-create-page">
      <section
        className="session-create-bulletin"
        style={{ backgroundImage: `url(${boxBulletinImage})` }}
      >
        <div className="session-create-stage">
          <form className="session-create-panel session-create-panel-form" onSubmit={submitSession}>
            <div className="session-create-field">
              <label htmlFor="session-title-page">세션 제목</label>
              <input
                id="session-title-page"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div className="session-create-field">
              <label htmlFor="scenario-id-page">시나리오</label>
              <select
                id="scenario-id-page"
                value={selectedScenarioKey}
                onChange={(event) => setSelectedScenarioKey(event.target.value)}
              >
                {providedScenarioOptions.length ? (
                  <optgroup label="기본 제공 시나리오">
                    {providedScenarioOptions.map((scenarioOption) => (
                      <option key={scenarioOption.key} value={scenarioOption.key}>
                        {scenarioOption.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {customScenarioOptions.length ? (
                  <optgroup label="내가 만든 시나리오">
                    {customScenarioOptions.map((scenarioOption) => (
                      <option key={scenarioOption.key} value={scenarioOption.key}>
                        {scenarioOption.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>

            <div className="session-create-field">
              <label htmlFor="session-description-page">세션 설명</label>
              <textarea
                id="session-description-page"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                placeholder="진행 방식, 예상 분위기, 일정, 참가자가 미리 알아야 할 내용을 자유롭게 작성해주세요."
              />
            </div>

            <div className="session-create-inline-grid">
              <div className="session-create-field session-create-range-field">
                <label htmlFor="max-players-page">총 인원 (GM/세션 관리자 포함, 1~8명)</label>
                <input
                  id="max-players-page"
                  type="number"
                  min={1}
                  max={8}
                  value={maxPlayers}
                  step={1}
                  onChange={(event) =>
                    setMaxPlayers(readClampedInteger(event.target.value, maxPlayers, 1, 8))
                  }
                />
              </div>

              <div className="session-create-field">
                <label htmlFor="session-visibility-page">공개 범위</label>
                <select
                  id="session-visibility-page"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as SessionVisibility)}
                >
                  <option value={SessionVisibility.PUBLIC}>공개 · 목록에서 모집</option>
                  <option value={SessionVisibility.PRIVATE}>비공개 · 초대로만 참가</option>
                </select>
              </div>
            </div>

            <fieldset className="session-create-gm-field">
              <legend>GM 유형</legend>
              <label className={gmMode === GmMode.AI ? 'selected' : ''}>
                <input
                  type="radio"
                  name="gm-mode"
                  value={GmMode.AI}
                  checked={gmMode === GmMode.AI}
                  onChange={() => setGmMode(GmMode.AI)}
                />
                <RobotIcon />
                <span>
                  <strong>AI GM</strong>
                  <small>AI가 시나리오 진행과 판정을 맡습니다.</small>
                </span>
              </label>
              <label className={gmMode === GmMode.HUMAN ? 'selected' : ''}>
                <input
                  type="radio"
                  name="gm-mode"
                  value={GmMode.HUMAN}
                  checked={gmMode === GmMode.HUMAN}
                  onChange={() => setGmMode(GmMode.HUMAN)}
                />
                <UsersIcon />
                <span>
                  <strong>사람 GM</strong>
                  <small>세션을 만든 GM이 직접 진행과 판정을 맡습니다.</small>
                </span>
              </label>
            </fieldset>

            <div className="session-create-field">
              <span className="session-create-field-label">플레이 일정</span>
              <div className="session-create-schedule-grid">
                <label className="session-create-schedule-control" htmlFor="next-session-date-page">
                  <span>날짜</span>
                  <input
                    id="next-session-date-page"
                    type="date"
                    value={playSchedule.date}
                    required
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(event) =>
                      setPlaySchedule((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
                <div className="session-create-schedule-control">
                  <span id="next-session-time-label">시간</span>
                  <div
                    className="session-create-time-selects"
                    role="group"
                    aria-labelledby="next-session-time-label"
                  >
                    <select
                      id="next-session-hour-page"
                      value={selectedScheduleHour}
                      aria-label="시"
                      onChange={(event) => updatePlayScheduleTime('hour', event.target.value)}
                    >
                      {SCHEDULE_HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}시
                        </option>
                      ))}
                    </select>
                    <span aria-hidden="true">:</span>
                    <select
                      id="next-session-minute-page"
                      value={selectedScheduleMinute}
                      aria-label="분"
                      onChange={(event) => updatePlayScheduleTime('minute', event.target.value)}
                    >
                      {SCHEDULE_MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}분
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="session-create-field">
              <label htmlFor="session-join-policy-page">참가 방식</label>
              <select
                id="session-join-policy-page"
                value={visibility === SessionVisibility.PRIVATE ? 'INVITE_ONLY' : joinPolicy}
                disabled={visibility === SessionVisibility.PRIVATE}
                onChange={(event) => setJoinPolicy(event.target.value as 'APPROVAL_REQUIRED' | 'OPEN_JOIN')}
              >
                {visibility === SessionVisibility.PRIVATE ? <option value="INVITE_ONLY">초대 전용</option> : null}
                <option value="APPROVAL_REQUIRED">참가 신청 후 세션 관리자 승인</option>
                <option value="OPEN_JOIN">바로 참가</option>
              </select>
              <small>
                {visibility === SessionVisibility.PRIVATE
                  ? '비공개 세션은 초대를 받은 사람만 참가합니다.'
                  : '공개 세션은 신청을 검토하거나 누구나 바로 참가하게 할 수 있습니다.'}
              </small>
            </div>

            <label className="session-create-checkbox">
              <input
                type="checkbox"
                checked={openLobbyNow}
                onChange={(event) => setOpenLobbyNow(event.target.checked)}
              />
              <span>
                <strong>생성 후 바로 대기실 열기</strong>
                <small>끄면 세션 홈만 열리고, 세션 관리자가 준비를 마친 뒤 대기실을 열 수 있습니다.</small>
              </span>
            </label>

            <button
              type="submit"
              className="session-create-submit"
              disabled={busy}
            >
              <img
                src={buttonSimpleBeigeImage}
                alt=""
                aria-hidden="true"
                className="session-create-submit-bg"
              />
              <span>세션 생성</span>
            </button>

            {error ? <p className="session-create-error">{error}</p> : null}
          </form>

          {/* 선택한 시나리오의 요약 정보를 보여주는 프리뷰 카드입니다. */}
          <article className="session-create-panel session-create-panel-preview">
            {selectedScenario ? (
              <>
                <img
                  src={selectedScenario.image}
                  alt={`${selectedScenario.title} thumbnail`}
                  className="session-create-preview-image"
                />

                <div className="session-create-preview-body">
                  <div className="session-create-preview-title-row">
                    <h2>{selectedScenario.title}</h2>
                    <span className="session-create-preview-pill">
                      {gmMode === GmMode.AI ? 'AI GM' : '사람 GM'}
                    </span>
                  </div>
                  <p className="session-create-preview-description">{selectedScenario.description}</p>

                  <div className="session-create-preview-meta">
                    <span>
                      권장 레벨 {selectedScenario.startLevel}
                      {selectedScenario.recommendedEndLevel &&
                      selectedScenario.recommendedEndLevel !== selectedScenario.startLevel
                        ? `~${selectedScenario.recommendedEndLevel}`
                        : ''}
                    </span>
                    <span>
                      {selectedScenario.estimatedMinutes
                        ? `예상 ${selectedScenario.estimatedMinutes}분`
                        : '예상 시간 미정'}
                    </span>
                    <span>
                      {selectedScenario.recommendedPlayersMin && selectedScenario.recommendedPlayersMax
                        ? `${selectedScenario.recommendedPlayersMin}~${selectedScenario.recommendedPlayersMax}명 권장`
                        : '권장 인원 미정'}
                    </span>
                  </div>

                  <div className="session-create-preview-foot">
                    <span className="session-create-preview-count">
                      <UsersIcon />
                      <strong>1 / {maxPlayers}</strong>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="session-create-empty">
                <h2>시나리오를 준비 중입니다</h2>
                <p>선택 가능한 시나리오가 없으면 세션 정보를 미리 볼 수 없습니다.</p>
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}
