import { FormEvent, useState } from "react";
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
  const [sessionTitle, setSessionTitle] = useState("New session");
  const [scenarioId, setScenarioId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [useAiGm, setUseAiGm] = useState(true);

  const hasRecruitingSession = snapshot?.session.status === "recruiting";

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasRecruitingSession) return;

    void onCreateSession(sessionTitle, {
      scenarioId: scenarioId || undefined,
      maxParticipants: maxPlayers,
      useAiGm,
    });
  }

  return (
    <main className="session-page">
      <section className="session-page-header">
        <div>
          <span className="eyebrow">Create session</span>
          <h1>새 게임 만들기</h1>
          <p>세션 제목과 인원, GM 모드, 시작 시나리오를 설정해서 새로운 파티를 열 수 있습니다.</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={onOpenDiscover}>
            공개 세션 보기
          </button>
        </div>
      </section>

      <section className="session-create-layout">
        <article className="session-form-card session-form-card-wide">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Session setup</span>
              <h2>기본 설정</h2>
            </div>
          </div>

          <form className="modal-form" onSubmit={submitSession}>
            <label htmlFor="session-title-page">Title</label>
            <input
              id="session-title-page"
              value={sessionTitle}
              onChange={(event) => setSessionTitle(event.target.value)}
              maxLength={100}
              required
            />

            <label htmlFor="scenario-id-page">Scenario</label>
            <select id="scenario-id-page" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              <option value="">Select a scenario</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </select>

            <label htmlFor="max-players-page">Max participants</label>
            <input
              id="max-players-page"
              type="number"
              min={1}
              max={8}
              value={maxPlayers}
              onChange={(event) => setMaxPlayers(Math.min(8, Math.max(1, Number(event.target.value) || 1)))}
            />

            <label className="toggle-field" htmlFor="use-ai-gm-page">
              <input
                id="use-ai-gm-page"
                type="checkbox"
                checked={useAiGm}
                onChange={(event) => setUseAiGm(event.target.checked)}
              />
              <span>Use AI GM</span>
            </label>

            <button type="submit" className="primary" disabled={busy || hasRecruitingSession}>
              Create
            </button>
          </form>
        </article>

        <article className="session-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Guide</span>
              <h2>생성 전 확인</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>시나리오 선택</strong>
              <p>지금은 기존 시나리오를 골라서 바로 세션을 생성하는 흐름입니다. Human GM 시나리오 편집은 다음 단계에서 이어질 예정입니다.</p>
            </div>
            <div className="profile-note">
              <strong>모집 제한</strong>
              <p>이미 모집 중인 세션에 참가한 상태라면 새로운 모집 세션을 동시에 열거나 참가하지 못하도록 제한하고 있습니다.</p>
            </div>
            <div className="profile-note">
              <strong>GM 모드</strong>
              <p>AI GM은 자동 진행용, Human GM은 사람이 주도하는 진행용으로 사용합니다.</p>
            </div>
          </div>
        </article>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}
    </main>
  );
}
