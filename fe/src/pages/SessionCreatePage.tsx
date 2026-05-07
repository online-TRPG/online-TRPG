import { FormEvent, useEffect, useMemo, useState } from "react";
import buttonSimpleBeigeImage from "../components/Button_Simple_Beige.webp";
import boxBulletinImage from "../components/Box_Bulletin_Rectangle.webp";
import { buildSessionScenarioOptions } from "../data/sessionVisuals";
import type { Scenario, SessionSnapshot } from "../types/session";

interface SessionCreatePageProps {
  scenarios: Scenario[];
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string | null;
  onCreateSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) => void | Promise<void>;
}

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
  snapshot,
  busy,
  error,
  onCreateSession,
}: SessionCreatePageProps) {
  const scenarioOptions = useMemo(() => buildSessionScenarioOptions(scenarios), [scenarios]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [selectedScenarioKey, setSelectedScenarioKey] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [useAiGm, setUseAiGm] = useState(true);

  const hasRecruitingSession = snapshot?.session.status === "recruiting";

  useEffect(() => {
    if (!selectedScenarioKey && scenarioOptions.length) {
      setSelectedScenarioKey(scenarioOptions[0].key);
    }
  }, [scenarioOptions, selectedScenarioKey]);

  const selectedScenario =
    scenarioOptions.find((scenarioOption) => scenarioOption.key === selectedScenarioKey) ?? scenarioOptions[0] ?? null;

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;

    void onCreateSession(sessionTitle.trim() || selectedScenario?.title || "새 세션", {
      scenarioId: selectedScenario?.scenarioId,
      maxParticipants: maxPlayers,
      useAiGm,
    });
  }

  return (
    <main className="session-create-page">
      <section className="session-create-bulletin" style={{ backgroundImage: `url(${boxBulletinImage})` }}>
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
                {scenarioOptions.map((scenarioOption) => (
                  <option key={scenarioOption.key} value={scenarioOption.key}>
                    {scenarioOption.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="session-create-inline-grid">
              <div className="session-create-field session-create-range-field">
                <label htmlFor="max-players-page">참가 인원 (1 ~ 8)</label>
                <input
                  id="max-players-page"
                  type="number"
                  min={1}
                  max={8}
                  value={maxPlayers}
                  step={1}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMaxPlayers(Number.isFinite(next) ? Math.min(8, Math.max(1, next)) : 1);
                  }}
                />
              </div>

              <label className="session-create-mini-card session-create-ai-card session-create-ai-inline" htmlFor="use-ai-gm-page">
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

            <button type="submit" className="session-create-submit" disabled={busy || hasRecruitingSession}>
              <img src={buttonSimpleBeigeImage} alt="" aria-hidden="true" className="session-create-submit-bg" />
              <span>세션 생성</span>
            </button>

            {error ? <p className="session-create-error">{error}</p> : null}
          </form>

          <article className="session-create-panel session-create-panel-preview">
            {selectedScenario ? (
              <>
                <img
                  src={selectedScenario.image}
                  alt={`${selectedScenario.title} thumbnail`}
                  className="session-create-preview-image"
                />

                <div className="session-create-preview-body">
                  <div className="session-create-preview-pill-row">
                    <span className="session-create-preview-pill">{useAiGm ? "AI GM" : "인간 GM"}</span>
                  </div>

                  <h2>{selectedScenario.title}</h2>
                  <p>{selectedScenario.description}</p>

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
