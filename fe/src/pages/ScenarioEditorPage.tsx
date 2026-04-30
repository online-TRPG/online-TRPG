import { FormEvent, useEffect, useState } from "react";
import { createScenario, getScenario, updateScenario } from "../services/api";
import type { ScenarioDetail, StoredUser } from "../types/session";
import type { ScenarioLicense } from "@trpg/shared-types";

interface ScenarioEditorPageProps {
  user: StoredUser;
  accessToken: string | null;
  scenarioId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}

type ScenarioFormState = {
  title: string;
  description: string;
  ruleSetId: string;
  difficulty: string;
  license: ScenarioLicense;
  attribution: string;
  startNodeTitle: string;
  startSceneText: string;
};

const emptyForm: ScenarioFormState = {
  title: "",
  description: "",
  ruleSetId: "dnd5e",
  difficulty: "easy",
  license: "original" as ScenarioLicense,
  attribution: "",
  startNodeTitle: "시작 장면",
  startSceneText: "",
};

function formFromScenario(scenario: ScenarioDetail): ScenarioFormState {
  const startNode =
    scenario.nodes.find((node) => node.id === scenario.startNodeId) ?? scenario.nodes[0] ?? null;

  return {
    title: scenario.title,
    description: scenario.description ?? "",
    ruleSetId: scenario.ruleSetId ?? "dnd5e",
    difficulty: scenario.difficulty ?? "",
    license: scenario.license,
    attribution: scenario.attribution ?? "",
    startNodeTitle: startNode?.title ?? "시작 장면",
    startSceneText: startNode?.sceneText ?? "",
  };
}

export function ScenarioEditorPage({
  user,
  accessToken,
  scenarioId,
  onDone,
  onCancel,
}: ScenarioEditorPageProps) {
  const isEditMode = Boolean(scenarioId);
  const [form, setForm] = useState<ScenarioFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scenarioId) {
      setForm(emptyForm);
      return;
    }

    let ignore = false;
    setBusy(true);
    setError(null);

    getScenario(scenarioId)
      .then((scenario) => {
        if (!ignore) {
          setForm(formFromScenario(scenario));
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : "시나리오를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setBusy(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [scenarioId]);

  function updateField<K extends keyof ScenarioFormState>(field: K, value: ScenarioFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description || null,
      ruleSetId: form.ruleSetId || null,
      difficulty: form.difficulty || null,
      license: form.license,
      attribution: form.attribution || null,
      startNodeTitle: form.startNodeTitle,
      startSceneText: form.startSceneText,
    };

    try {
      if (scenarioId) {
        await updateScenario(user, scenarioId, payload, accessToken);
      } else {
        await createScenario(user, payload, accessToken);
      }
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "시나리오 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="session-page">
      <section className="session-page-header">
        <div>
          <span className="eyebrow">{isEditMode ? "Edit scenario" : "Create scenario"}</span>
          <h1>{isEditMode ? "시나리오 수정" : "새 자작 시나리오"}</h1>
          <p>기본 정보와 첫 장면을 작성하면 세션 생성 화면에서 바로 선택할 수 있습니다.</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            목록으로
          </button>
        </div>
      </section>

      <section className="session-create-layout">
        <article className="session-form-card session-form-card-wide">
          <form className="modal-form" onSubmit={submit}>
            <label htmlFor="scenario-title">Title</label>
            <input
              id="scenario-title"
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              maxLength={100}
              required
            />

            <label htmlFor="scenario-description">Description</label>
            <textarea
              id="scenario-description"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
            />

            <div className="field-row">
              <div>
                <label htmlFor="scenario-ruleset">Rule set</label>
                <input
                  id="scenario-ruleset"
                  value={form.ruleSetId}
                  onChange={(event) => updateField("ruleSetId", event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="scenario-difficulty">Difficulty</label>
                <input
                  id="scenario-difficulty"
                  value={form.difficulty}
                  onChange={(event) => updateField("difficulty", event.target.value)}
                />
              </div>
            </div>

            <label htmlFor="scenario-license">License</label>
            <select
              id="scenario-license"
              value={form.license}
              onChange={(event) => updateField("license", event.target.value as ScenarioFormState["license"])}
            >
              <option value="original">Original</option>
              <option value="cc-by-4.0">CC BY 4.0</option>
              <option value="other-free">Other free</option>
            </select>

            <label htmlFor="scenario-attribution">Attribution</label>
            <input
              id="scenario-attribution"
              value={form.attribution}
              onChange={(event) => updateField("attribution", event.target.value)}
            />

            <label htmlFor="scenario-start-title">Start node title</label>
            <input
              id="scenario-start-title"
              value={form.startNodeTitle}
              onChange={(event) => updateField("startNodeTitle", event.target.value)}
              required
            />

            <label htmlFor="scenario-start-text">Start scene text</label>
            <textarea
              id="scenario-start-text"
              value={form.startSceneText}
              onChange={(event) => updateField("startSceneText", event.target.value)}
              rows={8}
              required
            />

            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
          </form>
        </article>

        <article className="session-form-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Guide</span>
              <h2>작성 범위</h2>
            </div>
          </div>
          <div className="profile-notes">
            <div className="profile-note">
              <strong>첫 단계</strong>
              <p>지금은 시나리오 기본 정보와 시작 노드만 저장합니다.</p>
            </div>
            <div className="profile-note">
              <strong>다음 확장</strong>
              <p>노드 추가, 분기 연결, 맵 편집, 핸드아웃 공개 설정을 이 편집 화면에 이어 붙이면 됩니다.</p>
            </div>
          </div>
        </article>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}
    </main>
  );
}
