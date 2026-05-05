import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createScenario,
  getScenario,
  updateScenario,
  uploadScenarioNodeImage,
} from '../services/api';
import type { ScenarioDetail, StoredUser } from '../types/session';
import type {
  CreateScenarioDto,
  ScenarioLicense,
  ScenarioNodeType,
  UpdateScenarioDto,
} from '@trpg/shared-types';

interface ScenarioEditorPageProps {
  user: StoredUser;
  accessToken: string | null;
  scenarioId?: string | null;
  onDone: () => void;
  onCancel: () => void;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

type LinkForm = {
  id: string;
  label: string;
  condition: string;
  nextNodeId: string;
  note: string;
};

type RevealMode = 'manual' | 'on_node_visit' | 'conditional';

type ClueForm = {
  id: string;
  title: string;
  text: string;
  revelation: string;
  source: string;
  pointsToNodeId: string;
  importance: 'core' | 'supporting' | 'optional';
  revealMode: RevealMode;
  handoutText: string;
  gmNotes: string;
};

type NodeForm = {
  id: string;
  nodeType: ScenarioNodeType;
  title: string;
  sceneText: string;
  imageUrl: string;
  links: LinkForm[];
  clues: ClueForm[];
};

type ScenarioFormState = {
  title: string;
  description: string;
  ruleSetId: string;
  difficulty: string;
  license: ScenarioLicense;
  attribution: string;
  nodes: NodeForm[];
};

type GraphNodeLayout = {
  node: NodeForm;
  x: number;
  y: number;
  incomingCount: number;
};

const GRAPH_COLUMN_GAP = 180;
const GRAPH_ROW_GAP = 82;
const GRAPH_PADDING = 64;
const AUTO_SAVE_INTERVAL_MS = 300_000;
const UNSAVED_CHANGES_MESSAGE = '저장되지 않은 변경사항이 있습니다. 이 화면을 나가시겠습니까?';

function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankNode(title = '새 장면'): NodeForm {
  return {
    id: makeLocalId('node'),
    nodeType: 'story' as ScenarioNodeType,
    title,
    sceneText: '',
    imageUrl: '',
    links: [],
    clues: [],
  };
}

function createBlankLink(nodes: NodeForm[], currentNodeId: string): LinkForm {
  return {
    id: makeLocalId('link'),
    label: '다음 장면',
    condition: 'default',
    nextNodeId: nodes.find((node) => node.id !== currentNodeId)?.id ?? '',
    note: '',
  };
}

function createBlankClue(): ClueForm {
  return {
    id: makeLocalId('clue'),
    title: '',
    text: '',
    revelation: '',
    source: '',
    pointsToNodeId: '',
    importance: 'supporting',
    revealMode: 'conditional',
    handoutText: '',
    gmNotes: '',
  };
}

function createEmptyForm(): ScenarioFormState {
  return {
    title: '',
    description: '',
    ruleSetId: 'dnd5e',
    difficulty: 'easy',
    license: 'original' as ScenarioLicense,
    attribution: '',
    nodes: [createBlankNode('첫 장면')],
  };
}

function valueAsString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function valueAsImportance(value: unknown): ClueForm['importance'] {
  return value === 'core' || value === 'optional' ? value : 'supporting';
}

function valueAsRevealMode(clue: Record<string, unknown>): RevealMode {
  const revealPolicy = clue.revealPolicy;
  const mode =
    revealPolicy && typeof revealPolicy === 'object'
      ? valueAsString((revealPolicy as Record<string, unknown>).mode)
      : '';
  return mode === 'manual' || mode === 'on_node_visit' || mode === 'conditional'
    ? mode
    : 'conditional';
}

function mapLink(transition: Record<string, unknown>): LinkForm {
  return {
    id: valueAsString(transition.id, makeLocalId('link')),
    label: valueAsString(transition.label),
    condition: valueAsString(transition.condition, 'default'),
    nextNodeId: valueAsString(transition.nextNodeId),
    note: valueAsString(transition.note),
  };
}

function mapClue(clue: Record<string, unknown>): ClueForm {
  return {
    id: valueAsString(clue.id, makeLocalId('clue')),
    title: valueAsString(clue.title),
    text: valueAsString(clue.text),
    revelation: valueAsString(clue.revelation),
    source: valueAsString(clue.source),
    pointsToNodeId: valueAsString(clue.pointsToNodeId),
    importance: valueAsImportance(clue.importance),
    revealMode: valueAsRevealMode(clue),
    handoutText: valueAsString(clue.handoutText),
    gmNotes: valueAsString(clue.gmNotes),
  };
}

function formFromScenario(scenario: ScenarioDetail): ScenarioFormState {
  const nodes = scenario.nodes.length
    ? scenario.nodes.map((node) => ({
        id: node.id,
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl ?? '',
        links: node.transitions.map(mapLink),
        clues: node.clues.map(mapClue),
      }))
    : [createBlankNode('첫 장면')];

  return {
    title: scenario.title,
    description: scenario.description ?? '',
    ruleSetId: scenario.ruleSetId ?? 'dnd5e',
    difficulty: scenario.difficulty ?? '',
    license: scenario.license,
    attribution: scenario.attribution ?? '',
    nodes,
  };
}

function serializeNodes(nodes: NodeForm[]) {
  return nodes.map((node) => ({
    id: node.id,
    nodeType: node.nodeType,
    title: node.title.trim(),
    sceneText: node.sceneText.trim(),
    imageUrl: node.imageUrl || null,
    transitions: node.links
      .filter((link) => link.nextNodeId)
      .map((link) => ({
        id: link.id,
        label: link.label.trim() || undefined,
        condition: link.condition.trim() || 'default',
        nextNodeId: link.nextNodeId,
        note: link.note.trim() || undefined,
      })),
    clues: node.clues
      .filter((clue) => clue.title.trim() || clue.text.trim() || clue.revelation.trim())
      .map((clue) => ({
        id: clue.id,
        title: clue.title.trim() || clue.text.trim().slice(0, 40) || '단서',
        text: clue.text.trim(),
        revelation: clue.revelation.trim(),
        source: clue.source.trim(),
        pointsToNodeId: clue.pointsToNodeId || null,
        importance: clue.importance,
        revealPolicy: { mode: clue.revealMode },
        handoutText: clue.handoutText.trim(),
        gmNotes: clue.gmNotes.trim(),
      })),
  }));
}

function buildScenarioPayload(form: ScenarioFormState): CreateScenarioDto & UpdateScenarioDto {
  const nodes = serializeNodes(form.nodes);

  return {
    title: form.title.trim(),
    description: form.description || null,
    ruleSetId: form.ruleSetId || null,
    difficulty: form.difficulty || null,
    license: form.license,
    attribution: form.attribution || null,
    startNodeTitle: nodes[0]?.title,
    startSceneText: nodes[0]?.sceneText,
    nodes,
  };
}

function getRequiredScenarioMessage(payload: CreateScenarioDto & UpdateScenarioDto): string | null {
  if (!payload.title) {
    return '자동 저장 대기: 시나리오 제목을 입력해 주세요.';
  }

  const invalidNode = payload.nodes?.find((node) => !node.title || !node.sceneText);
  if (invalidNode) {
    return '자동 저장 대기: 모든 노드의 제목과 장면 내용을 입력해 주세요.';
  }

  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function buildGraphLayout(nodes: NodeForm[]): {
  graphNodes: GraphNodeLayout[];
  edges: Array<{
    id: string;
    label: string;
    from: GraphNodeLayout;
    to: GraphNodeLayout;
  }>;
  width: number;
  height: number;
} {
  const incomingByNode = new Map<string, number>();
  const nodeIds = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => {
    node.links.forEach((link) => {
      if (!link.nextNodeId) return;
      incomingByNode.set(link.nextNodeId, (incomingByNode.get(link.nextNodeId) ?? 0) + 1);
    });
  });

  const depthByNode = new Map<string, number>();
  const queue = nodes
    .filter((node) => (incomingByNode.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  if (!queue.length && nodes[0]) {
    queue.push(nodes[0].id);
  }

  queue.forEach((nodeId) => depthByNode.set(nodeId, 0));

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    const nextDepth = (depthByNode.get(nodeId) ?? 0) + 1;

    node.links.forEach((link) => {
      if (!nodeIds.has(link.nextNodeId)) return;
      const currentDepth = depthByNode.get(link.nextNodeId);
      if (currentDepth !== undefined && currentDepth >= nextDepth) return;
      depthByNode.set(link.nextNodeId, nextDepth);
      if (!queue.includes(link.nextNodeId)) {
        queue.push(link.nextNodeId);
      }
    });
  }

  nodes.forEach((node) => {
    if (!depthByNode.has(node.id)) {
      depthByNode.set(node.id, Math.max(0, ...Array.from(depthByNode.values())) + 1);
    }
  });

  const nodesByDepth = new Map<number, NodeForm[]>();
  nodes.forEach((node) => {
    const depth = depthByNode.get(node.id) ?? 0;
    nodesByDepth.set(depth, [...(nodesByDepth.get(depth) ?? []), node]);
  });

  const graphNodes = Array.from(nodesByDepth.entries()).flatMap(([depth, depthNodes]) =>
    depthNodes.map((node, row) => ({
      node,
      x: GRAPH_PADDING + depth * GRAPH_COLUMN_GAP,
      y: GRAPH_PADDING + row * GRAPH_ROW_GAP,
      incomingCount: incomingByNode.get(node.id) ?? 0,
    }))
  );
  const layoutById = new Map(graphNodes.map((item) => [item.node.id, item]));
  const edges = graphNodes.flatMap((from) =>
    from.node.links
      .map((link) => {
        const to = layoutById.get(link.nextNodeId);
        if (!to) return null;
        return {
          id: link.id,
          label: link.label || link.condition,
          from,
          to,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
  );
  const maxDepth = Math.max(0, ...graphNodes.map((item) => depthByNode.get(item.node.id) ?? 0));
  const maxRows = Math.max(1, ...Array.from(nodesByDepth.values()).map((items) => items.length));

  return {
    graphNodes,
    edges,
    width: GRAPH_PADDING * 2 + maxDepth * GRAPH_COLUMN_GAP + 180,
    height: GRAPH_PADDING * 2 + (maxRows - 1) * GRAPH_ROW_GAP + 80,
  };
}

export function ScenarioEditorPage({
  user,
  accessToken,
  scenarioId,
  onDone,
  onCancel,
  onUnsavedChangesChange,
}: ScenarioEditorPageProps) {
  const isEditMode = Boolean(scenarioId);
  const [draftScenarioId, setDraftScenarioId] = useState<string | null>(scenarioId ?? null);
  const [form, setForm] = useState<ScenarioFormState>(() => createEmptyForm());
  const [selectedNodeId, setSelectedNodeId] = useState(form.nodes[0].id);
  const [editorMode, setEditorMode] = useState<'graph' | 'detail'>('graph');
  const [isScenarioInfoOpen, setScenarioInfoOpen] = useState(!scenarioId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('자동 저장 준비 중');
  const autoSaveBusyRef = useRef(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const draftScenarioIdRef = useRef<string | null>(scenarioId ?? null);
  const formRef = useRef(form);
  const busyRef = useRef(busy);

  const effectiveScenarioId = draftScenarioId ?? scenarioId ?? null;

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const hasUnsavedChanges = useCallback(() => {
    const savedSnapshot = lastSavedSnapshotRef.current;
    return (
      savedSnapshot !== null &&
      JSON.stringify(buildScenarioPayload(formRef.current)) !== savedSnapshot
    );
  }, []);

  useEffect(() => {
    formRef.current = form;
    onUnsavedChangesChange?.(hasUnsavedChanges());
  }, [form, hasUnsavedChanges, onUnsavedChangesChange]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges()) return;

      event.preventDefault();
      event.returnValue = UNSAVED_CHANGES_MESSAGE;
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!scenarioId) {
      const nextForm = createEmptyForm();
      setDraftScenarioId(null);
      draftScenarioIdRef.current = null;
      lastSavedSnapshotRef.current = JSON.stringify(buildScenarioPayload(nextForm));
      onUnsavedChangesChange?.(false);
      setAutoSaveStatus('자동 저장 대기: 필수 내용을 입력해 주세요.');
      setForm(nextForm);
      setSelectedNodeId(nextForm.nodes[0].id);
      setEditorMode('graph');
      setScenarioInfoOpen(true);
      return;
    }

    let ignore = false;
    setDraftScenarioId(scenarioId);
    draftScenarioIdRef.current = scenarioId;
    lastSavedSnapshotRef.current = null;
    setAutoSaveStatus('자동 저장 준비 중');
    setBusy(true);
    setError(null);

    getScenario(scenarioId)
      .then((scenario) => {
        if (!ignore) {
          const nextForm = formFromScenario(scenario);
          setForm(nextForm);
          lastSavedSnapshotRef.current = JSON.stringify(buildScenarioPayload(nextForm));
          onUnsavedChangesChange?.(false);
          setAutoSaveStatus('저장됨');
          setSelectedNodeId(nextForm.nodes[0].id);
          setEditorMode('graph');
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setError(caught instanceof Error ? caught.message : '시나리오를 불러오지 못했습니다.');
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

  const autoSave = useCallback(async () => {
    if (busyRef.current || autoSaveBusyRef.current) return;

    const payload = buildScenarioPayload(formRef.current);
    const snapshot = JSON.stringify(payload);

    if (lastSavedSnapshotRef.current === snapshot) {
      setAutoSaveStatus('저장됨');
      return;
    }

    const requiredMessage = getRequiredScenarioMessage(payload);
    if (requiredMessage) {
      setAutoSaveStatus(requiredMessage);
      return;
    }

    autoSaveBusyRef.current = true;
    setAutoSaveStatus('자동 저장 중...');

    try {
      const savedScenario = draftScenarioIdRef.current
        ? await updateScenario(user, draftScenarioIdRef.current, payload, accessToken)
        : await createScenario(user, payload, accessToken);

      draftScenarioIdRef.current = savedScenario.id;
      setDraftScenarioId(savedScenario.id);
      lastSavedSnapshotRef.current = snapshot;
      onUnsavedChangesChange?.(false);
      setAutoSaveStatus(
        `자동 저장됨 ${new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      );
    } catch (caught) {
      setAutoSaveStatus('자동 저장 실패');
      setError(caught instanceof Error ? caught.message : '자동 저장에 실패했습니다.');
    } finally {
      autoSaveBusyRef.current = false;
    }
  }, [accessToken, user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void autoSave();
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoSave]);

  const selectedNode = useMemo(
    () => form.nodes.find((node) => node.id === selectedNodeId) ?? form.nodes[0],
    [form.nodes, selectedNodeId]
  );

  const incomingLinks = useMemo(
    () =>
      selectedNode
        ? form.nodes.flatMap((node) =>
            node.links
              .filter((link) => link.nextNodeId === selectedNode.id)
              .map((link) => ({
                fromNode: node.title || node.id,
                label: link.label || link.condition,
              }))
          )
        : [],
    [form.nodes, selectedNode]
  );

  const graphLayout = useMemo(() => buildGraphLayout(form.nodes), [form.nodes]);

  function updateField<K extends keyof Omit<ScenarioFormState, 'nodes'>>(
    field: K,
    value: ScenarioFormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateNode(nodeId: string, updater: (node: NodeForm) => NodeForm) {
    setForm((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
    }));
  }

  function addNode() {
    const node = createBlankNode();
    setForm((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }));
    setSelectedNodeId(node.id);
    setEditorMode('detail');
  }

  function removeNode(nodeId: string) {
    let nextSelectedNodeId = selectedNodeId;
    setForm((current) => {
      if (current.nodes.length <= 1) return current;
      const nodes = current.nodes.filter((node) => node.id !== nodeId);
      if (selectedNodeId === nodeId) {
        nextSelectedNodeId = nodes[0].id;
      }

      return {
        ...current,
        nodes: nodes.map((node) => ({
          ...node,
          links: node.links.filter((link) => link.nextNodeId !== nodeId),
          clues: node.clues.map((clue) => ({
            ...clue,
            pointsToNodeId: clue.pointsToNodeId === nodeId ? '' : clue.pointsToNodeId,
          })),
        })),
      };
    });
    setSelectedNodeId(nextSelectedNodeId);
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setEditorMode('detail');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const payload = buildScenarioPayload(form);
      const title = payload.title;
      if (!title) {
        setScenarioInfoOpen(true);
        setError('시나리오 제목을 입력해주세요.');
        return;
      }

      const nodes = serializeNodes(form.nodes);
      const invalidNode = nodes.find((node) => !node.title || !node.sceneText);
      if (invalidNode) {
        setSelectedNodeId(invalidNode.id);
        setEditorMode('detail');
        setError('모든 노드의 제목과 장면 내용을 입력해주세요.');
        return;
      }

      setBusy(true);
      if (effectiveScenarioId) {
        await updateScenario(user, effectiveScenarioId, payload, accessToken);
      } else {
        await createScenario(user, payload, accessToken);
      }
      lastSavedSnapshotRef.current = JSON.stringify(payload);
      onUnsavedChangesChange?.(false);
      setAutoSaveStatus('저장됨');
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '시나리오 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="session-page">
      <section className="session-page-header">
        <div>
          <span className="eyebrow">{isEditMode ? 'Edit scenario' : 'Create scenario'}</span>
          <h1>{isEditMode ? '시나리오 수정' : '새 자작 시나리오'}</h1>
          <p>각 장면에서 이어질 장면을 연결하고, 마스터가 사용할 단서와 공개 자료를 계획합니다.</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            목록으로
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setScenarioInfoOpen((current) => !current)}
          >
            기본 정보
          </button>
          <span className="scenario-autosave-status" role="status" aria-live="polite">
            {autoSaveStatus}
          </span>
        </div>
      </section>

      {isScenarioInfoOpen ? (
        <section className="session-form-card scenario-info-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Scenario</span>
              <h2>기본 정보</h2>
            </div>
          </div>

          <div className="scenario-info-grid">
            <div>
              <label htmlFor="scenario-title">Title</label>
              <input
                id="scenario-title"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div>
              <label htmlFor="scenario-ruleset">Rule set</label>
              <input
                id="scenario-ruleset"
                value={form.ruleSetId}
                onChange={(event) => updateField('ruleSetId', event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="scenario-difficulty">Difficulty</label>
              <input
                id="scenario-difficulty"
                value={form.difficulty}
                onChange={(event) => updateField('difficulty', event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="scenario-license">License</label>
              <select
                id="scenario-license"
                value={form.license}
                onChange={(event) =>
                  updateField('license', event.target.value as ScenarioFormState['license'])
                }
              >
                <option value="original">Original</option>
                <option value="cc-by-4.0">CC BY 4.0</option>
                <option value="other-free">Other free</option>
              </select>
            </div>
            <div className="scenario-info-wide">
              <label htmlFor="scenario-description">Description</label>
              <textarea
                id="scenario-description"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={3}
              />
            </div>
            <div className="scenario-info-wide">
              <label htmlFor="scenario-attribution">Attribution</label>
              <input
                id="scenario-attribution"
                value={form.attribution}
                onChange={(event) => updateField('attribution', event.target.value)}
              />
            </div>
          </div>
        </section>
      ) : null}

      <form className="scenario-editor-form" onSubmit={submit}>
        <div className="scenario-editor-layout">
          <aside className="session-form-card scenario-editor-sidebar">
            <div className="scenario-editor-sidebar-header">
              <button type="button" className="primary small" onClick={addNode}>
                노드 추가
              </button>
              <button
                type="button"
                className={`ghost small${editorMode === 'graph' ? ' selected' : ''}`}
                onClick={() => setEditorMode('graph')}
              >
                그래프 보기
              </button>
            </div>
            <div className="scenario-editor-node-tabs">
              {form.nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={
                    node.id === selectedNode?.id && editorMode === 'detail' ? 'selected' : ''
                  }
                  onClick={() => selectNode(node.id)}
                >
                  <strong>{node.title || '제목 없음'}</strong>
                  <span>
                    {node.nodeType} · {node.links.length}개 연결
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="session-form-card session-form-card-wide scenario-editor-main">
            {editorMode === 'graph' ? (
              <>
                <div className="scenario-graph-toolbar">
                  <div>
                    <span className="eyebrow">Node graph</span>
                    <h2>시나리오 흐름</h2>
                  </div>
                </div>
                <ScenarioNodeGraph
                  layout={graphLayout}
                  selectedNodeId={selectedNode?.id ?? ''}
                  onSelectNode={selectNode}
                />
              </>
            ) : selectedNode ? (
              <NodeDetailEditor
                user={user}
                accessToken={accessToken}
                scenarioId={effectiveScenarioId}
                node={selectedNode}
                nodes={form.nodes}
                incomingLinks={incomingLinks}
                updateNode={updateNode}
                removeNode={removeNode}
                setError={setError}
              />
            ) : null}
          </section>

          <aside className="session-form-card scenario-editor-guide">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Guide</span>
                <h2>작성 기준</h2>
              </div>
            </div>
            <div className="profile-notes">
              <div className="profile-note">
                <strong>연결</strong>
                <p>
                  현재 노드에서 갈 수 있는 다음 노드만 설정합니다. 여러 노드가 같은 노드를 가리킬 수
                  있습니다.
                </p>
              </div>
              <div className="profile-note">
                <strong>단서</strong>
                <p>단서는 결론, 발견 경로, 공개 자료, GM 전용 메모를 나눠 기록합니다.</p>
              </div>
              <div className="profile-note">
                <strong>중요도</strong>
                <p>핵심 단서는 같은 결론을 뒷받침하도록 여러 위치에 흩어 두는 편이 안전합니다.</p>
              </div>
            </div>
            <div className="scenario-save-actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </aside>
        </div>
      </form>

      {error ? <p className="panel-error">{error}</p> : null}
    </main>
  );
}

function NodeDetailEditor({
  user,
  accessToken,
  scenarioId,
  node,
  incomingLinks,
  nodes,
  updateNode,
  removeNode,
  setError,
}: {
  user: StoredUser;
  accessToken: string | null;
  scenarioId: string | null;
  node: NodeForm;
  nodes: NodeForm[];
  incomingLinks: Array<{ fromNode: string; label: string }>;
  updateNode: (nodeId: string, updater: (node: NodeForm) => NodeForm) => void;
  removeNode: (nodeId: string) => void;
  setError: (message: string | null) => void;
}) {
  const [imageBusy, setImageBusy] = useState(false);

  async function handleImageFile(file: File | null) {
    if (!file) return;
    if (!scenarioId) {
      setError('이미지는 시나리오를 저장한 뒤 업로드할 수 있습니다.');
      return;
    }

    setImageBusy(true);
    setError(null);

    try {
      const dataBase64 = await fileToBase64(file);
      const result = await uploadScenarioNodeImage(
        user,
        scenarioId,
        node.id,
        {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          dataBase64,
        },
        accessToken
      );

      updateNode(node.id, (current) => ({
        ...current,
        imageUrl: result.imageUrl,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <div className="scenario-play-editor">
      <section className="scenario-play-stage">
        <div className="scenario-node-header">
          <div>
            <span className="eyebrow">Current scene preview</span>
            <input
              className="scenario-node-title-input"
              value={node.title}
              onChange={(event) =>
                updateNode(node.id, (current) => ({ ...current, title: event.target.value }))
              }
              maxLength={100}
              required
            />
            <select
              className="scenario-node-type-select"
              value={node.nodeType}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  nodeType: event.target.value as ScenarioNodeType,
                }))
              }
            >
              <option value="story">이야기</option>
              <option value="exploration">탐색</option>
              <option value="combat">전투</option>
            </select>
          </div>
          <div className="scenario-node-edit-actions">
            <button
              type="button"
              className="ghost small"
              disabled={nodes.length <= 1}
              onClick={() => removeNode(node.id)}
            >
              삭제
            </button>
          </div>
        </div>

        <section className="scenario-node-image-panel">
          <div>
            <span className="eyebrow">Scene image</span>
            <label className="scenario-image-upload">
              <input
                type="file"
                accept="image/*"
                disabled={imageBusy}
                onChange={(event) => {
                  void handleImageFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = '';
                }}
              />
              {imageBusy ? '업로드 중...' : '이미지 업로드'}
            </label>
          </div>
          {node.imageUrl ? (
            <img src={node.imageUrl} alt={`${node.title || '시나리오 노드'} visual`} />
          ) : (
            <div className="scenario-node-image-empty">아직 연결된 이미지가 없습니다.</div>
          )}
        </section>

        <label htmlFor="node-scene-text" className="eyebrow">
          Scene text
        </label>
        <textarea
          id="node-scene-text"
          className="scenario-node-text-editor"
          value={node.sceneText}
          onChange={(event) =>
            updateNode(node.id, (current) => ({ ...current, sceneText: event.target.value }))
          }
          rows={10}
          required
        />

        <div className="scenario-node-grid">
          <article className="scenario-node-panel">
            <span className="eyebrow">Incoming</span>
            <NodeConnectionSummary incomingLinks={incomingLinks} compact />
          </article>
          <article className="scenario-node-panel">
            <span className="eyebrow">Auto handouts</span>
            {node.clues.filter((clue) => clue.revealMode === 'on_node_visit').length ? (
              <ul className="scenario-node-list">
                {node.clues
                  .filter((clue) => clue.revealMode === 'on_node_visit')
                  .map((clue) => (
                    <li key={clue.id}>
                      <strong>{clue.title || clue.text || '단서'}</strong>
                      <span>{clue.importance}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>공개 예정 단서가 없습니다.</p>
            )}
          </article>
        </div>
      </section>

      <aside className="scenario-play-sidebar">
        <ScenarioNodeCollections node={node} nodes={nodes} updateNode={updateNode} />
      </aside>
    </div>
  );
}

function ScenarioNodeGraph({
  layout,
  selectedNodeId,
  onSelectNode,
}: {
  layout: ReturnType<typeof buildGraphLayout>;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  return (
    <div className="scenario-graph-viewport">
      <div className="scenario-graph-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg
          className="scenario-graph-edges"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="scenario-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const startX = edge.from.x;
            const startY = edge.from.y;
            const endX = edge.to.x;
            const endY = edge.to.y;
            const midX = startX + Math.max(36, (endX - startX) / 2);
            const path =
              endX >= startX
                ? `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
                : `M ${startX} ${startY} C ${startX + 48} ${startY}, ${endX - 48} ${endY}, ${endX} ${endY}`;
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 8;

            return (
              <g key={edge.id}>
                <path d={path} />
                {edge.label ? (
                  <text x={labelX} y={labelY}>
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {layout.graphNodes.map(({ node, x, y }) => (
          <button
            key={node.id}
            type="button"
            className={`scenario-graph-node${node.id === selectedNodeId ? ' selected' : ''}`}
            style={{ left: x, top: y }}
            onClick={() => onSelectNode(node.id)}
            aria-label={node.title || '제목 없음'}
          >
            <span className="scenario-graph-dot" />
            <strong>{node.title || '제목 없음'}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function NodeConnectionSummary({
  incomingLinks,
  compact = false,
}: {
  incomingLinks: Array<{ fromNode: string; label: string }>;
  compact?: boolean;
}) {
  return (
    <section
      className={compact ? 'scenario-connection-summary compact' : 'scenario-editor-collection'}
    >
      {compact ? null : (
        <div className="scenario-editor-collection-header">
          <h3>들어오는 연결</h3>
        </div>
      )}
      {incomingLinks.length ? (
        <ul className="scenario-editor-mini-list">
          {incomingLinks.map((link, index) => (
            <li key={`${link.fromNode}-${index}`}>
              <strong>{link.fromNode}</strong>
              <span>{link.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper-copy">아직 이 노드로 들어오는 연결이 없습니다.</p>
      )}
    </section>
  );
}

function ScenarioNodeCollections({
  node,
  nodes,
  updateNode,
}: {
  node: NodeForm;
  nodes: NodeForm[];
  updateNode: (nodeId: string, updater: (node: NodeForm) => NodeForm) => void;
}) {
  return (
    <div className="scenario-editor-collections">
      <NodeCollection
        title="다음 노드 연결"
        actionLabel="연결 추가"
        onAdd={() =>
          updateNode(node.id, (current) => ({
            ...current,
            links: [...current.links, createBlankLink(nodes, node.id)],
          }))
        }
      >
        {node.links.map((link, index) => (
          <article className="scenario-editor-item" key={link.id}>
            <div className="field-row-3">
              <div>
                <label>Label</label>
                <input
                  value={link.label}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      links: current.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item
                      ),
                    }))
                  }
                />
              </div>
              <div>
                <label>Condition</label>
                <input
                  value={link.condition}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      links: current.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, condition: event.target.value } : item
                      ),
                    }))
                  }
                />
              </div>
              <div>
                <label>Next node</label>
                <select
                  value={link.nextNodeId}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      links: current.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, nextNodeId: event.target.value } : item
                      ),
                    }))
                  }
                >
                  <option value="">선택</option>
                  {nodes
                    .filter((candidate) => candidate.id !== node.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title || candidate.id}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <label>GM note</label>
            <textarea
              value={link.note}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  links: current.links.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, note: event.target.value } : item
                  ),
                }))
              }
              rows={2}
            />
            <button
              type="button"
              className="ghost small"
              onClick={() =>
                updateNode(node.id, (current) => ({
                  ...current,
                  links: current.links.filter((_, itemIndex) => itemIndex !== index),
                }))
              }
            >
              연결 삭제
            </button>
          </article>
        ))}
      </NodeCollection>

      <NodeCollection
        title="단서"
        actionLabel="단서 추가"
        onAdd={() =>
          updateNode(node.id, (current) => ({
            ...current,
            clues: [...current.clues, createBlankClue()],
          }))
        }
      >
        {node.clues.map((clue, index) => (
          <article className="scenario-editor-item" key={clue.id}>
            <div className="field-row">
              <div>
                <label>Title</label>
                <input
                  value={clue.title}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      clues: current.clues.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item
                      ),
                    }))
                  }
                />
              </div>
              <div>
                <label>Importance</label>
                <select
                  value={clue.importance}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      clues: current.clues.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, importance: event.target.value as ClueForm['importance'] }
                          : item
                      ),
                    }))
                  }
                >
                  <option value="core">핵심</option>
                  <option value="supporting">보조</option>
                  <option value="optional">선택</option>
                </select>
              </div>
            </div>

            <label>Clue text</label>
            <textarea
              value={clue.text}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text: event.target.value } : item
                  ),
                }))
              }
              rows={3}
            />

            <label>Revelation / conclusion</label>
            <textarea
              value={clue.revelation}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, revelation: event.target.value } : item
                  ),
                }))
              }
              rows={2}
            />

            <div className="field-row">
              <div>
                <label>Discovery source</label>
                <input
                  value={clue.source}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      clues: current.clues.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, source: event.target.value } : item
                      ),
                    }))
                  }
                  placeholder="NPC, handout, object, rumor, environment"
                />
              </div>
              <div>
                <label>Points to node</label>
                <select
                  value={clue.pointsToNodeId}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      clues: current.clues.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, pointsToNodeId: event.target.value } : item
                      ),
                    }))
                  }
                >
                  <option value="">없음</option>
                  {nodes
                    .filter((candidate) => candidate.id !== node.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title || candidate.id}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <label>Reveal policy</label>
            <select
              value={clue.revealMode}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, revealMode: event.target.value as RevealMode }
                      : item
                  ),
                }))
              }
            >
              <option value="conditional">Conditional</option>
              <option value="on_node_visit">On node visit</option>
              <option value="manual">Manual GM reveal</option>
            </select>

            <label>Player handout text</label>
            <textarea
              value={clue.handoutText}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, handoutText: event.target.value } : item
                  ),
                }))
              }
              rows={3}
            />

            <label>GM notes</label>
            <textarea
              value={clue.gmNotes}
              onChange={(event) =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, gmNotes: event.target.value } : item
                  ),
                }))
              }
              rows={3}
            />

            <button
              type="button"
              className="ghost small"
              onClick={() =>
                updateNode(node.id, (current) => ({
                  ...current,
                  clues: current.clues.filter((_, itemIndex) => itemIndex !== index),
                }))
              }
            >
              단서 삭제
            </button>
          </article>
        ))}
      </NodeCollection>
    </div>
  );
}

function NodeCollection({
  title,
  actionLabel,
  onAdd,
  children,
}: {
  title: string;
  actionLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="scenario-editor-collection">
      <div className="scenario-editor-collection-header">
        <h3>{title}</h3>
        <button type="button" className="ghost small" onClick={onAdd}>
          {actionLabel}
        </button>
      </div>
      <div className="scenario-editor-items">{children}</div>
    </section>
  );
}
