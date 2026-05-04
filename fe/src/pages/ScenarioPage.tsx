import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { deleteScenario, listMyScenarios } from "../services/api";
import type { Scenario, StoredUser } from "../types/session";

interface ScenarioPageProps {
  user: StoredUser;
  accessToken: string | null;
  busy: boolean;
  error: string | null;
  onOpenCreate: () => void;
  onOpenEdit: (scenarioId: string) => void;
}

export function ScenarioPage({
  user,
  accessToken,
  busy,
  error,
  onOpenCreate,
  onOpenEdit,
}: ScenarioPageProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLocalError(null);
    setLocalBusy(true);

    listMyScenarios(user, accessToken)
      .then((next) => {
        if (ignore) return;
        setScenarios(next);
        setSelectedScenarioId((current) => current ?? next[0]?.id ?? null);
      })
      .catch((caught) => {
        if (!ignore) {
          setLocalError(caught instanceof Error ? caught.message : "시나리오 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLocalBusy(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [accessToken, user]);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  async function handleDeleteSelected() {
    if (!selectedScenario) return;
    const confirmed = window.confirm(`${selectedScenario.title} 시나리오를 삭제할까요?`);
    if (!confirmed) return;

    setLocalBusy(true);
    setLocalError(null);

    try {
      await deleteScenario(user, selectedScenario.id, accessToken);
      setScenarios((current) => {
        const next = current.filter((scenario) => scenario.id !== selectedScenario.id);
        setSelectedScenarioId(next[0]?.id ?? null);
        return next;
      });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "시나리오 삭제에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  const disabled = busy || localBusy;

  return (
    <main className="character-page fantasy-character-page">
      <section className="scenario-management-layout">
        <aside className="fantasy-character-sidebar">
          <button type="button" className="fantasy-character-sidebutton" onClick={onOpenCreate}>
            새 시나리오 생성
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            disabled={!selectedScenario || disabled}
            onClick={() => selectedScenario && onOpenEdit(selectedScenario.id)}
          >
            시나리오 수정
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            disabled={!selectedScenario || disabled}
            onClick={() => void handleDeleteSelected()}
          >
            시나리오 삭제
          </button>
        </aside>

        <section className="scenario-library-board">
          <div className="section-heading">
            <div>
              <span className="eyebrow">My scenarios</span>
              <h1>내 시나리오</h1>
            </div>
            <button type="button" className="primary small" onClick={onOpenCreate}>
              <Icon name="plus" />
              Create
            </button>
          </div>

          <div className="scenario-library-grid">
            {scenarios.length ? (
              scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={`scenario-library-card${scenario.id === selectedScenarioId ? " selected" : ""}`}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  <span className="status-chip">{scenario.ruleSetId ?? "TRPG"}</span>
                  <strong>{scenario.title}</strong>
                  <p>{scenario.description || "설명이 아직 없습니다."}</p>
                  <dl>
                    <div>
                      <dt>난이도</dt>
                      <dd>{scenario.difficulty ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>라이선스</dt>
                      <dd>{scenario.license}</dd>
                    </div>
                  </dl>
                </button>
              ))
            ) : (
              <article className="empty-card">
                <h3>아직 직접 만든 시나리오가 없습니다.</h3>
                <p>새 시나리오를 만들어 세션 생성 화면에서 사용할 수 있습니다.</p>
              </article>
            )}
          </div>
        </section>

        <section className="scenario-detail-panel">
          {selectedScenario ? (
            <>
              <span className="eyebrow">Selected scenario</span>
              <h2>{selectedScenario.title}</h2>
              <p>{selectedScenario.description || "시나리오 소개가 비어 있습니다."}</p>
              <dl className="profile-kv-grid">
                <div>
                  <dt>시나리오 ID</dt>
                  <dd>{selectedScenario.id}</dd>
                </div>
                <div>
                  <dt>시작 노드</dt>
                  <dd>{selectedScenario.startNodeId ?? "-"}</dd>
                </div>
                <div>
                  <dt>룰셋</dt>
                  <dd>{selectedScenario.ruleSetId ?? "-"}</dd>
                </div>
                <div>
                  <dt>출처</dt>
                  <dd>{selectedScenario.attribution ?? "-"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <article className="empty-card">
              <h3>선택된 시나리오가 없습니다.</h3>
              <p>왼쪽에서 새 시나리오를 생성해 주세요.</p>
            </article>
          )}
        </section>
      </section>

      {localError || error ? <p className="panel-error">{localError ?? error}</p> : null}
    </main>
  );
}
