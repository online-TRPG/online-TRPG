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
import buttonSimpleBeigeImage from '../components/Button_Simple_Beige.webp';
import boxBulletinImage from '../components/Box_Bulletin_Rectangle.webp';
import { buildSessionScenarioOptions } from '../data/sessionVisuals';
import { getScenario } from '../services/api';
import type { AvailableSessionListItem, Scenario, StoredUser } from '../types/session';
import './SessionCreatePage.css';

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface SessionCreatePageProps {
  user: StoredUser;
  accessToken: string | null;
  scenarios: Scenario[];
  mySessionList: AvailableSessionListItem[];
  busy: boolean;
  error: string | null;
  onCreateSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean }
  ) => void | Promise<void>;
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
  user,
  accessToken,
  scenarios,
  mySessionList,
  busy,
  error,
  onCreateSession,
}: SessionCreatePageProps) {
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
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [useAiGm, setUseAiGm] = useState(true);
  const [selectedScenarioImage, setSelectedScenarioImage] = useState<string | null>(null);

  // 이미 모집 중인 세션이 있으면 중복 생성을 막기 위한 플래그입니다.
  const hasRecruitingSession = mySessionList.some((item) => item.status === 'recruiting');

  // 시나리오 옵션이 로드되면 구현 완료된 기본 제공 시나리오를 우선 선택합니다.
  useEffect(() => {
    const selectedOptionExists = scenarioOptions.some(
      (scenarioOption) => scenarioOption.key === selectedScenarioKey
    );
    if ((!selectedScenarioKey || !selectedOptionExists) && scenarioOptions.length) {
      setSelectedScenarioKey(scenarioOptions[0].key);
    }
  }, [scenarioOptions, selectedScenarioKey]);

  // 현재 선택된 시나리오 옵션입니다. 오른쪽 프리뷰 카드에 사용됩니다.
  const selectedScenario =
    scenarioOptions.find((scenarioOption) => scenarioOption.key === selectedScenarioKey) ??
    scenarioOptions[0] ??
    null;

  useEffect(() => {
    let ignore = false;

    if (!selectedScenario) {
      setSelectedScenarioImage(null);
      return () => {
        ignore = true;
      };
    }

    setSelectedScenarioImage(selectedScenario.image);

    if (!selectedScenario.scenarioId) {
      return () => {
        ignore = true;
      };
    }

    void getScenario(selectedScenario.scenarioId, user, accessToken)
      .then((detail) => {
        if (ignore) return;
        const firstNodeImage =
          detail.nodes.find((node) => typeof node.imageUrl === 'string' && node.imageUrl.trim())?.imageUrl?.trim() ??
          null;
        setSelectedScenarioImage(firstNodeImage || selectedScenario.image);
      })
      .catch(() => {
        if (!ignore) {
          setSelectedScenarioImage(selectedScenario.image);
        }
      });

    return () => {
      ignore = true;
    };
  }, [accessToken, selectedScenario, user]);

  // 폼 제출 시 부모의 세션 생성 콜백으로 입력값을 전달합니다.
  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;

    void onCreateSession(sessionTitle.trim() || selectedScenario?.title || '새 세션', {
      scenarioId: selectedScenario?.scenarioId,
      maxParticipants: maxPlayers,
      useAiGm,
    });
  }
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

            <div className="session-create-inline-grid">
              <div className="session-create-field session-create-range-field">
                <label htmlFor="max-players-page">참가 인원 (1 ~ 4)</label>
                <input
                  id="max-players-page"
                  type="number"
                  min={1}
                  max={4}
                  value={maxPlayers}
                  step={1}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMaxPlayers(Number.isFinite(next) ? Math.min(4, Math.max(1, next)) : 1);
                  }}
                />
              </div>

              <label
                className="session-create-mini-card session-create-ai-card session-create-ai-inline"
                htmlFor="use-ai-gm-page"
              >
                <div className="session-create-ai-inline-copy">
                  <RobotIcon />
                  <strong>AI GM 사용</strong>
                </div>
                <input
                  id="use-ai-gm-page"
                  type="checkbox"
                  checked={useAiGm}
                  onChange={(event) => setUseAiGm(event.target.checked)}
                />
              </label>
            </div>

            <button
              type="submit"
              className="session-create-submit"
              disabled={busy || hasRecruitingSession}
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
                  src={selectedScenarioImage || selectedScenario.image}
                  alt={`${selectedScenario.title} thumbnail`}
                  className="session-create-preview-image"
                />

                <div className="session-create-preview-body">
                  <div className="session-create-preview-title-row">
                    <h2>{selectedScenario.title}</h2>
                    <span className="session-create-preview-pill">
                      {useAiGm ? 'AI GM' : '인간 GM'}
                    </span>
                  </div>
                  <p className="session-create-preview-description">{selectedScenario.description}</p>

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
