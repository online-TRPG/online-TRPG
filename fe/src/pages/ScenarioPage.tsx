/*
 * ScenarioPage
 * 역할: 내가 만든 시나리오 목록을 검색/선택/삭제/복제하고 에디터로 이동하는 라이브러리 페이지입니다.
 * 읽는 순서:
 * 1) 복제 헬퍼: 기존 시나리오의 노드/링크/단서 ID를 새 ID로 재매핑
 * 2) state: 목록, 선택된 시나리오, 검색어, 로딩/에러 상태
 * 3) useEffect: 검색어 변경 시 내 시나리오 목록을 다시 조회
 * 4) handler: 선택 시나리오 삭제, 선택 시나리오 복제
 * 5) JSX: 좌측 사이드바, 검색/목록 영역, 우측 상세 패널
 */
import { useEffect, useMemo, useState } from "react";
import plusSignImage from "../components/plussign.webp";
import quillImage from "../components/quill.webp";
import scenarioMetalFrameImage from "../components/scenario_metal_frame.webp";
import bookImage from "../components/book.webp";
import scrollImage from "../components/scroll.webp";
import scrollHorizontalImage from "../components/scroll_horizontal.webp";
import searchbarFrameImage from "../components/searchbar_gold_frame.webp";
import sidePanelImage from "../components/Side_Panel.webp";
import { Icon } from "../components/Icon";
import { createScenario, deleteScenario, getScenario, listMyScenarios } from "../services/api";
import type { Scenario, StoredUser } from "../types/session";
import type { CreateScenarioDto } from "@trpg/shared-types";
import "./CharacterPage.css";
import "./ScenarioPage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface ScenarioPageProps {
  user: StoredUser;
  accessToken: string | null;
  busy: boolean;
  error: string | null;
  onOpenCreate: () => void;
  onOpenEdit: (scenarioId: string) => void;
}

// 시나리오 복제 시 기존 ID와 충돌하지 않게 로컬 ID를 만듭니다.
function makeCloneId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 복제된 노드 ID 맵을 사용해 링크/단서가 새 노드를 가리키도록 바꿉니다.
function remapNodeReference(value: unknown, nodeIdMap: Map<string, string>): string | null {
  return typeof value === "string" ? nodeIdMap.get(value) ?? value : null;
}

function formatScenarioLevel(scenario: Scenario): string {
  const maybeScenarioWithLevels = scenario as Scenario & {
    startLevel?: number | null;
    recommendedEndLevel?: number | null;
  };
  const startLevel =
    typeof maybeScenarioWithLevels.startLevel === "number" ? maybeScenarioWithLevels.startLevel : 1;
  const endLevel =
    typeof maybeScenarioWithLevels.recommendedEndLevel === "number"
      ? maybeScenarioWithLevels.recommendedEndLevel
      : null;
  return endLevel && endLevel !== startLevel ? `LV ${startLevel}-${endLevel}` : `LV ${startLevel}`;
}

function formatScenarioUpdatedAt(value: string | null | undefined): string {
  if (!value) return "--/--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function ScenarioPage({
  user,
  accessToken,
  busy,
  error,
  onOpenCreate,
  onOpenEdit,
}: ScenarioPageProps) {
  // 목록/선택/검색/로딩 상태입니다.
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // 검색어가 바뀌면 짧은 debounce 후 내 시나리오 목록을 다시 불러옵니다.
  useEffect(() => {
    let ignore = false;
    setLocalError(null);
    setLocalBusy(true);

    const timer = window.setTimeout(() => {
      listMyScenarios(user, accessToken, searchTerm)
      .then((next) => {
        if (ignore) return;
        setScenarios(next);
        setSelectedScenarioId((current) =>
          next.some((scenario) => scenario.id === current) ? current : next[0]?.id ?? null
        );
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
    }, 250);
  return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, searchTerm, user]);

  // 현재 카드 목록에서 선택된 시나리오입니다. 오른쪽 상세 패널에 표시됩니다.
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  // 선택한 시나리오 삭제 버튼 동작입니다.
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

  // 선택한 시나리오를 전체 복제합니다. 노드/링크/단서 ID를 전부 새로 매핑합니다.
  async function handleCloneSelected() {
    if (!selectedScenario) return;

    setLocalBusy(true);
    setLocalError(null);

    try {
      const source = await getScenario(selectedScenario.id);
      const nodeIdMap = new Map(source.nodes.map((node) => [node.id, makeCloneId("node")]));
      const nodes = source.nodes.map((node) => ({
        id: nodeIdMap.get(node.id) ?? makeCloneId("node"),
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl,
        vttMap: node.vttMap
          ? {
              ...node.vttMap,
              id: `map:${nodeIdMap.get(node.id) ?? makeCloneId("node")}`,
              scenarioNodeId: nodeIdMap.get(node.id) ?? null,
            }
          : null,
        transitions: node.transitions.map((transition) => ({
          ...transition,
          id: makeCloneId("link"),
          nextNodeId: remapNodeReference(transition.nextNodeId, nodeIdMap),
        })),
        clues: node.clues.map((clue) => ({
          ...clue,
          id: makeCloneId("clue"),
          pointsToNodeId: remapNodeReference(clue.pointsToNodeId, nodeIdMap),
        })),
      }));
      const startNodeId = remapNodeReference(source.startNodeId, nodeIdMap);
      const startNode = nodes.find((node) => node.id === startNodeId) ?? nodes[0];
      const copyTitle = `${source.title} 복사본`.slice(0, 100);
      const payload: CreateScenarioDto = {
        title: copyTitle,
        description: source.description,
        thumbnailUrl: source.thumbnailUrl,
        ruleSetId: source.ruleSetId,
        difficulty: source.difficulty,
        startLevel: source.startLevel ?? 1,
        recommendedEndLevel: source.recommendedEndLevel,
        license: source.license,
        attribution: source.attribution,
        startNodeId,
        startNodeTitle: startNode?.title,
        startSceneText: startNode?.sceneText,
        nodes,
      };

      const created = await createScenario(user, payload, accessToken);
      const next = await listMyScenarios(user, accessToken, searchTerm);
      setScenarios(next);
      setSelectedScenarioId(next.some((scenario) => scenario.id === created.id) ? created.id : next[0]?.id ?? null);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "시나리오 복제에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  const disabled = busy || localBusy;

  return (
    <main
      className="character-page fantasy-character-page scenario-page"
      style={{
        ["--scenario-side-panel-image" as string]: `url(${sidePanelImage})`,
        ["--scenario-scroll-image" as string]: `url(${scrollImage})`,
        ["--scenario-scroll-horizontal-image" as string]: `url(${scrollHorizontalImage})`,
        ["--scenario-search-frame-image" as string]: `url(${searchbarFrameImage})`,
        ["--scenario-card-frame-image" as string]: `url(${scenarioMetalFrameImage})`,
        ["--scenario-book-image" as string]: `url(${bookImage})`,
      }}
    >
      <section className="scenario-management-layout">
        <aside className="scenario-action-rail">
          <div className="scenario-action-rail-shell">
            <button type="button" className="scenario-rail-action" onClick={onOpenCreate}>
              새 시나리오 생성
            </button>
            <button
              type="button"
              className="scenario-rail-action"
              disabled={!selectedScenario || disabled}
              onClick={() => void handleCloneSelected()}
            >
              시나리오 복제
            </button>
            <button
              type="button"
              className="scenario-rail-action"
              disabled={!selectedScenario || disabled}
              onClick={() => selectedScenario && onOpenEdit(selectedScenario.id)}
            >
              시나리오 수정
            </button>
            <button
              type="button"
              className="scenario-rail-action"
              disabled={!selectedScenario || disabled}
              onClick={() => void handleDeleteSelected()}
            >
              시나리오 삭제
            </button>
          </div>
        </aside>

        {/* 중앙 보드: 검색과 시나리오 카드 목록입니다. */}
        <section className="scenario-library-stage">
          <div className="scenario-library-board">
            <img className="scenario-library-quill" src={quillImage} alt="" aria-hidden="true" />
            <div className="scenario-library-heading">
              <h1>내 시나리오</h1>
            </div>

            <label className="scenario-library-search" htmlFor="scenario-title-search">
              <Icon name="search" />
              <input
                id="scenario-title-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="시나리오 제목 검색"
              />
            </label>

            <div className="scenario-library-grid">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={`scenario-library-card${scenario.id === selectedScenarioId ? " selected" : ""}`}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  <strong>{scenario.title}</strong>
                  <span className="scenario-library-updated-at">
                    마지막 업데이트 날짜 : {formatScenarioUpdatedAt(scenario.updatedAt)}
                  </span>
                </button>
              ))}

              <button
                type="button"
                className="scenario-library-card scenario-library-card-create"
                onClick={onOpenCreate}
              >
                <img src={plusSignImage} alt="" aria-hidden="true" />
                <strong>+ 새 시나리오 만들기</strong>
              </button>
            </div>
          </div>
        </section>

        {/* 우측 상세 패널: 선택 안내와 선택된 시나리오 상세 정보입니다. */}
        <aside className="scenario-detail-stage">
          <section className="scenario-detail-note">
            <h2>시나리오 상세</h2>
            <p>왼쪽에서 시나리오를 선택하면 상세 정보와 기본 메타 정보를 확인할 수 있습니다.</p>
          </section>

          <section className="scenario-detail-panel">
            <div className="scenario-detail-panel-scroll">
              {selectedScenario ? (
                <>
                  <div className="scenario-detail-panel-heading">
                    <span className="eyebrow">Selected scenario</span>
                    <h2>{selectedScenario.title}</h2>
                  </div>
                  <p>{selectedScenario.description || "시나리오 소개가 비어 있습니다."}</p>
                  <dl className="scenario-detail-meta">
                    <div>
                      <dt>레벨 권장</dt>
                      <dd>{formatScenarioLevel(selectedScenario)}</dd>
                    </div>
                    <div>
                      <dt>룰셋</dt>
                      <dd>{selectedScenario.ruleSetId ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>라이선스</dt>
                      <dd>{selectedScenario.license}</dd>
                    </div>
                    <div>
                      <dt>출처</dt>
                      <dd>{selectedScenario.attribution ?? "-"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <article className="scenario-detail-empty">
                  <h3>선택된 시나리오가 없습니다.</h3>
                  <p>중앙 보드에서 시나리오 카드를 선택하거나 새 시나리오를 생성해 주세요.</p>
                </article>
              )}
            </div>
          </section>
        </aside>
      </section>

      {localError || error ? <p className="panel-error">{localError ?? error}</p> : null}
    </main>
  );
}
