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
  onOpenDiscover: () => void;
}

export function SessionCreatePage({
  scenarios,
  snapshot,
  busy,
  error,
  onCreateSession,
  onOpenDiscover,
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
          <span className="eyebrow">Create session</span>
          <h1>세션 생성</h1>
          <p>시나리오를 고르고 플레이 인원, GM 방식, 세션 이름을 정한 뒤 바로 공개 세션으로 열 수 있습니다.</p>
        </div>

        <div className="session-create-hero-actions">
          <button type="button" className="ghost" onClick={onOpenDiscover}>
            세션 탐색으로 이동
          </button>
        </div>
      </section>

      <section className="session-create-board">
        <article className="session-create-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Session setup</span>
              <h2>기본 설정</h2>
            </div>
          </div>

          <form className="modal-form session-create-form" onSubmit={submitSession}>
            <div>
              <label htmlFor="session-title-page">Title</label>
              <input
                id="session-title-page"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div>
              <label htmlFor="scenario-id-page">Scenario</label>
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
                <label htmlFor="max-players-page">Max participants</label>
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
                <span>Use AI GM</span>
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
                    <dt>권장 인원</dt>
                    <dd>{maxPlayers}명</dd>
                  </div>
                  <div>
                    <dt>GM 유형</dt>
                    <dd>{useAiGm ? "AI GM" : "일반 GM"}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <div className="session-discover-empty">
              <h2>시나리오를 선택해 주세요</h2>
              <p>드롭다운에서 시나리오를 고르면 썸네일과 설명이 여기 표시됩니다.</p>
            </div>
          )}
        </article>

        <article className="session-create-guide-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Guide</span>
              <h2>생성 가이드</h2>
            </div>
          </div>

          <div className="session-create-guide-list">
            <div>
              <strong>Scenario</strong>
              <p>썸네일 시나리오는 세션 탐색 목록에서도 같은 이미지로 표시됩니다.</p>
            </div>
            <div>
              <strong>Participants</strong>
              <p>최대 인원은 1명부터 8명까지 설정할 수 있으며, 현재 선택값이 세션 카드에 그대로 반영됩니다.</p>
            </div>
            <div>
              <strong>AI GM</strong>
              <p>체크하면 AI GM 기준으로 세션을 생성하고, 끄면 일반 GM 세션으로 준비됩니다.</p>
            </div>
          </div>
        </article>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}
    </main>
  );
}
