import { FormEvent, useEffect, useMemo, useState } from "react";
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

export function SessionCreatePage({
  scenarios,
  snapshot,
  busy,
  error,
  onCreateSession,
}: SessionCreatePageProps) {
  const scenarioOptions = useMemo(() => buildSessionScenarioOptions(scenarios), [scenarios]);
  const [sessionTitle, setSessionTitle] = useState("새 세션");
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

    void onCreateSession(sessionTitle, {
      scenarioId: selectedScenario?.scenarioId,
      maxParticipants: maxPlayers,
      useAiGm,
    });
  }

  return (
    <main className="session-create-page">
      <section className="session-create-hero">
        <div>
          <h1>세션 생성</h1>
        </div>
      </section>

      <section className="session-create-board">
        <article className="session-create-form-card">
          <div className="section-heading">
            <div>
              <h2>세션 설정</h2>
            </div>
          </div>

          <form className="modal-form session-create-form" onSubmit={submitSession}>
            <div>
              <label htmlFor="session-title-page">세션 제목</label>
              <input
                id="session-title-page"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div>
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

            <div className="field-row">
              <div>
                <label htmlFor="max-players-page">참가 인원 (1~8)</label>
                <input
                  id="max-players-page"
                  type="number"
                  min={1}
                  max={8}
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Math.min(8, Math.max(1, Number(event.target.value) || 1)))}
                />
              </div>

              <label className="toggle-field session-create-toggle" htmlFor="use-ai-gm-page">
                <input
                  id="use-ai-gm-page"
                  type="checkbox"
                  checked={useAiGm}
                  onChange={(event) => setUseAiGm(event.target.checked)}
                />
                <span>AI GM 사용</span>
              </label>
            </div>

            <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
              세션 생성
            </button>
          </form>
        </article>

        <article className="session-create-preview-card">
          {selectedScenario ? (
            <>
              <img src={selectedScenario.image} alt={`${selectedScenario.title} thumbnail`} className="session-create-preview-image" />

              <div className="session-create-preview-body">
                <div className="session-create-preview-badges">
                  <span className={`session-discover-gm-badge${selectedScenario.gmLabel === "AI GM" ? " is-ai" : ""}`}>
                    {selectedScenario.gmLabel}
                  </span>
                  <span className="session-discover-meta-pill">{selectedScenario.theme}</span>
                  <span className="session-discover-meta-pill muted">{selectedScenario.difficulty}</span>
                </div>

                <h2>{selectedScenario.title}</h2>
                <p>{selectedScenario.description}</p>

                <dl className="session-create-preview-meta">
                  <div>
                    <dt>참가 인원</dt>
                    <dd>{maxPlayers}명</dd>
                  </div>
                  <div>
                    <dt>GM 종류</dt>
                    <dd>{useAiGm ? "AI GM" : "일반 GM"}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <div className="session-discover-empty">
              <h2>시나리오를 선택해 주세요</h2>
              <p>왼쪽 설정에서 시나리오를 고르면 오른쪽에서 미리보기 정보를 확인할 수 있습니다.</p>
            </div>
          )}
        </article>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}
    </main>
  );
}
