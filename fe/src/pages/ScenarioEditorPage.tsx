/*
 * ScenarioEditorPage
 * 역할: 노드 기반 TRPG 시나리오를 생성/수정하는 에디터입니다.
 * 읽는 순서:
 * 1) 타입 정의: 링크, 판정 가이드, 단서, 노드, 시나리오 폼 상태 구조
 * 2) 생성/매핑 헬퍼: 빈 노드/링크/단서 생성, API 응답을 폼 상태로 변환
 * 3) 직렬화 헬퍼: 폼 상태를 create/update API payload로 변환
 * 4) 그래프 헬퍼: 노드 연결을 시각화하기 위한 위치/간선 계산
 * 5) 메인 컴포넌트: 자동 저장, 수정 감지, 시나리오 로드, 저장/취소 처리
 * 6) 하위 컴포넌트: 노드 상세 편집기, 노드 그래프, 링크/판정 가이드/단서 컬렉션 편집기
 */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BattleMapEditor } from '../components/battleMap/BattleMapEditor';
import {
  createScenario,
  deleteScenarioAsset as deleteScenarioAssetRequest,
  getScenario,
  listScenarioAssets,
  updateScenario,
  uploadScenarioAsset,
} from '../services/api';
import { loadItemCatalog, loadMonsterCatalog } from '../services/staticSrd';
import type { ScenarioDetail, StoredUser } from '../types/session';
import type {
  CreateScenarioDto,
  ScenarioAssetKind,
  ScenarioAssetResponseDto,
  ScenarioLicense,
  ScenarioNodeType,
  SrdMonsterReferenceDto,
  UpdateScenarioDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import "./ScenarioEditorPage.css";

const SCENARIO_ASSET_KIND_MAP = "MAP" as ScenarioAssetKind;
const SCENARIO_ASSET_KIND_SCENE = "SCENE" as ScenarioAssetKind;
const SCENARIO_ASSET_KIND_TOKEN = "TOKEN" as ScenarioAssetKind;

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface ScenarioEditorPageProps {
  user: StoredUser;
  accessToken: string | null;
  scenarioId?: string | null;
  onDone: () => void;
  onCancel: () => void;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

// 노드에서 다른 노드로 이동하는 연결선 입력값입니다.
type LinkForm = {
  id: string;
  label: string;
  condition: string;
  nextNodeId: string;
  note: string;
  conditionRule: TransitionConditionRuleForm;
};

type TransitionConditionLogic = 'ALL' | 'ANY';
type TransitionConditionType =
  | 'ALWAYS'
  | 'CLUE_REVEALED'
  | 'COMBAT_RESOLVED'
  | 'NODE_VISITED'
  | 'FLAG_SET'
  | 'GM_APPROVAL';

type TransitionRequirementForm = {
  id: string;
  type: TransitionConditionType;
  targetId: string;
  flagKey: string;
  flagValue: string;
};

type TransitionConditionRuleForm = {
  logic: TransitionConditionLogic;
  requirements: TransitionRequirementForm[];
};

type CheckGuideForm = {
  id: string;
  label: string;
  type: string;
  skill: string;
};

type RevealMode =
  | 'AUTO_REVEAL'
  | 'PLAYER_ACTION'
  | 'CHECK_SUCCESS'
  | 'CHECK_PARTIAL'
  | 'POST_COMBAT'
  | 'GM_APPROVAL';

// 단서/핸드아웃 데이터입니다. 공개 방식과 GM 메모를 같이 들고 있습니다.
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

type NpcDisposition = 'friendly' | 'neutral' | 'hostile';

type NpcForm = {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  disposition: NpcDisposition;
  isVisible: boolean;
  imageUrl: string;
};

// 에디터 내부에서 쓰는 노드 폼 상태입니다. 스토리/탐색/전투 타입과 연결/판정 가이드/단서를 포함합니다.
type NodeForm = {
  id: string;
  nodeType: ScenarioNodeType;
  title: string;
  sceneText: string;
  imageUrl: string;
  vttMap: VttMapStateDto | null;
  checkGuides: CheckGuideForm[];
  links: LinkForm[];
  clues: ClueForm[];
  npcIds: string[];
  isEndingNode: boolean;
};

// 시나리오 전체 폼 상태입니다. 제목/설명/라이선스와 노드 배열을 포함합니다.
type ScenarioFormState = {
  title: string;
  description: string;
  ruleSetId: string;
  difficulty: string;
  startLevel: number | null;
  recommendedEndLevel: number | null;
  license: ScenarioLicense;
  attribution: string;
  startNodeId: string;
  npcs: NpcForm[];
  nodes: NodeForm[];
};

type ScenarioAsset = ScenarioAssetResponseDto;
type StartingPosition = NonNullable<VttMapStateDto['startingPositions']>[number];
type BattleMapOption = { id: string; label: string };

type GraphNodeLayout = {
  node: NodeForm;
  x: number;
  y: number;
  incomingCount: number;
};

type ScenarioGuideNote = {
  title: string;
  body: string;
};

// 노드 그래프 자동 배치에 사용하는 간격/패딩 값입니다.
const GRAPH_COLUMN_GAP = 180;
const GRAPH_ROW_GAP = 82;
const GRAPH_PADDING = 64;
const AUTO_SAVE_INTERVAL_MS = 300_000;
const UNSAVED_CHANGES_MESSAGE = '저장되지 않은 변경사항이 있습니다. 이 화면을 나가시겠습니까?';
const transitionConditionTypeOptions: Array<{ value: TransitionConditionType; label: string }> = [
  { value: 'ALWAYS', label: '항상 가능' },
  { value: 'CLUE_REVEALED', label: '단서 공개됨' },
  { value: 'COMBAT_RESOLVED', label: '전투 종료됨' },
  { value: 'NODE_VISITED', label: '노드 방문함' },
  { value: 'FLAG_SET', label: '상태 플래그' },
  { value: 'GM_APPROVAL', label: 'GM 승인 필요' },
];
const scenarioGuideNotes: ScenarioGuideNote[] = [
  {
    title: '핵심 흐름부터 고정',
    body:
      '첫 장면, 주요 분기, 결말처럼 플레이어가 반드시 지나갈 큰 흐름을 먼저 만들고 세부 장면은 그 다음에 채우는 편이 안정적입니다.',
  },
  {
    title: '노드마다 플레이어 행동 여지 명시',
    body:
      '장면 본문에는 정보 전달만 적지 말고 조사, 대화, 이동, 전투처럼 플레이어가 무엇을 시도할 수 있는지도 함께 적어두면 진행이 매끄럽습니다.',
  },
  {
    title: '단서와 다음 장면 연결 점검',
    body:
      '중요 단서는 최소 하나 이상의 다음 노드나 선택지로 이어지게 두고, 막히는 분기가 없는지 링크와 단서 목표 노드를 함께 확인하세요.',
  },
];

// 저장 전 임시 노드/링크/단서 ID를 만드는 유틸입니다.
function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 새 장면 버튼을 눌렀을 때 들어갈 기본 노드 구조를 만듭니다.
function createBlankNode(title = '새 장면'): NodeForm {
  const id = makeLocalId('node');
  return {
    id,
    nodeType: 'story' as ScenarioNodeType,
    title,
    sceneText: '',
    imageUrl: '',
    vttMap: null,
    checkGuides: [],
    links: [],
    clues: [],
    npcIds: [],
    isEndingNode: false,
  };
}

function clampMapValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createDefaultStartingPositions(
  gridSize: number,
  width: number,
  height: number,
  count = 4
): StartingPosition[] {
  return Array.from({ length: count }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);

    return {
      id: `start:${index + 1}`,
      label: `P${index + 1}`,
      x: clampMapValue(gridSize * (2 + column), 0, width - gridSize),
      y: clampMapValue(height - gridSize * (3 - row), 0, height - gridSize),
    };
  });
}

// 탐색/전투 노드에 기본 VTT 맵 상태를 붙일 때 사용합니다.
function createDefaultNodeMap(nodeId: string): VttMapStateDto {
  const gridSize = 64;
  const width = 1280;
  const height = 832;

  return {
    id: `map:${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: 'square',
    gridSize,
    width,
    height,
    tokens: [],
    encounterScaling: {
      enabled: false,
      basePartySize: 4,
      minMonsterCount: 1,
      mode: 'by_party_ratio',
    },
    fogRects: [],
    startingPositions: createDefaultStartingPositions(gridSize, width, height),
    terrainCells: [],
    wallCells: [],
    doorCells: [],
    objectCells: [],
    updatedAt: new Date().toISOString(),
  };
}

function ensureMapStartingPositions(map: VttMapStateDto): VttMapStateDto {
  if (map.startingPositions?.length) {
    return map;
  }

  return {
    ...map,
    startingPositions: createDefaultStartingPositions(map.gridSize, map.width, map.height),
  };
}

function createBlankLink(nodes: NodeForm[], currentNodeId: string): LinkForm {
  return {
    id: makeLocalId('link'),
    label: '다음 장면',
    condition: 'default',
    nextNodeId: nodes.find((node) => node.id !== currentNodeId)?.id ?? '',
    note: '',
    conditionRule: createDefaultTransitionRule(),
  };
}

function createTransitionRequirement(type: TransitionConditionType = 'ALWAYS'): TransitionRequirementForm {
  return {
    id: makeLocalId('transition_req'),
    type,
    targetId: '',
    flagKey: '',
    flagValue: '',
  };
}

function createDefaultTransitionRule(): TransitionConditionRuleForm {
  return {
    logic: 'ALL',
    requirements: [createTransitionRequirement('ALWAYS')],
  };
}

function createBlankCheckGuide(): CheckGuideForm {
  return {
    id: makeLocalId('check'),
    label: '',
    type: 'check',
    skill: '',
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
    revealMode: 'PLAYER_ACTION',
    handoutText: '',
    gmNotes: '',
  };
}

function createBlankNpc(): NpcForm {
  return {
    id: makeLocalId('npc'),
    name: '',
    shortDescription: '',
    description: '',
    disposition: 'neutral',
    isVisible: true,
    imageUrl: '',
  };
}

function createEmptyForm(): ScenarioFormState {
  const startNode = createBlankNode('첫 장면');
  return {
    title: '',
    description: '',
    ruleSetId: 'dnd5e',
    difficulty: 'easy',
    startLevel: 1,
    recommendedEndLevel: null,
    license: 'original' as ScenarioLicense,
    attribution: '',
    startNodeId: startNode.id,
    npcs: [],
    nodes: [startNode],
  };
}

function valueAsString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function valueAsScenarioLevel(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  return value >= 1 && value <= 20 ? value : null;
}

function scenarioLevelFromInput(value: string): number | null {
  if (!value) {
    return null;
  }

  const level = Number(value);
  if (!Number.isInteger(level)) {
    return null;
  }

  return Math.min(20, Math.max(1, level));
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
  if (
    mode === 'AUTO_REVEAL' ||
    mode === 'PLAYER_ACTION' ||
    mode === 'CHECK_SUCCESS' ||
    mode === 'CHECK_PARTIAL' ||
    mode === 'POST_COMBAT' ||
    mode === 'GM_APPROVAL'
  ) {
    return mode;
  }
  if (mode === 'on_node_visit') return 'AUTO_REVEAL';
  if (mode === 'manual') return 'GM_APPROVAL';
  if (mode === 'conditional') return 'PLAYER_ACTION';
  return 'PLAYER_ACTION';
}

function valueAsNpcDisposition(value: unknown): NpcDisposition {
  return value === 'friendly' || value === 'hostile' ? value : 'neutral';
}

function valueAsTransitionConditionLogic(value: unknown): TransitionConditionLogic {
  return value === 'ANY' ? 'ANY' : 'ALL';
}

function valueAsTransitionConditionType(value: unknown): TransitionConditionType {
  if (
    value === 'CLUE_REVEALED' ||
    value === 'COMBAT_RESOLVED' ||
    value === 'NODE_VISITED' ||
    value === 'FLAG_SET' ||
    value === 'GM_APPROVAL'
  ) {
    return value;
  }
  return 'ALWAYS';
}

function mapTransitionRequirement(requirement: Record<string, unknown>): TransitionRequirementForm {
  return {
    id: valueAsString(requirement.id, makeLocalId('transition_req')),
    type: valueAsTransitionConditionType(requirement.type),
    targetId: valueAsString(requirement.targetId),
    flagKey: valueAsString(requirement.flagKey),
    flagValue: valueAsString(requirement.flagValue),
  };
}

function isAutoTransitionConditionText(value: string): boolean {
  return ['', 'default', 'always', 'auto', '조건 없음', '항상'].includes(value.trim().toLowerCase());
}

function mapTransitionConditionRule(value: unknown, condition: string): TransitionConditionRuleForm {
  if (!value || typeof value !== 'object') {
    return isAutoTransitionConditionText(condition)
      ? createDefaultTransitionRule()
      : { logic: 'ALL', requirements: [createTransitionRequirement('GM_APPROVAL')] };
  }
  const rule = value as Record<string, unknown>;
  const rawRequirements = Array.isArray(rule.requirements) ? rule.requirements : [];
  const requirements = rawRequirements
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(mapTransitionRequirement);
  return {
    logic: valueAsTransitionConditionLogic(rule.logic),
    requirements: requirements.length ? requirements : [createTransitionRequirement('ALWAYS')],
  };
}

function mapNpc(npc: Record<string, unknown>): NpcForm {
  return {
    id: valueAsString(npc.id, makeLocalId('npc')),
    name: valueAsString(npc.name, valueAsString(npc.title)),
    shortDescription: valueAsString(npc.shortDescription, valueAsString(npc.summary)),
    description: valueAsString(npc.description),
    disposition: valueAsNpcDisposition(npc.disposition),
    isVisible: npc.isVisible !== false,
    imageUrl: valueAsString(npc.imageUrl),
  };
}

function mapLink(transition: Record<string, unknown>): LinkForm {
  const condition = valueAsString(transition.condition, 'default');
  return {
    id: valueAsString(transition.id, makeLocalId('link')),
    label: valueAsString(transition.label),
    condition,
    nextNodeId: valueAsString(transition.nextNodeId),
    note: valueAsString(transition.note),
    conditionRule: mapTransitionConditionRule(transition.conditionRule, condition),
  };
}

function mapCheckGuide(option: Record<string, unknown>): CheckGuideForm {
  return {
    id: valueAsString(option.id, makeLocalId('check')),
    label: valueAsString(option.playerLabel, valueAsString(option.label)),
    type: valueAsString(option.type, 'check'),
    skill: valueAsString(option.skill),
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

function mapVttMap(value: unknown, nodeId: string): VttMapStateDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<VttMapStateDto>;
  const gridSize = Number(candidate.gridSize) || 64;
  const width = Number(candidate.width) || 1280;
  const height = Number(candidate.height) || 832;
  const startingPositions =
    Array.isArray(candidate.startingPositions) && candidate.startingPositions.length > 0
      ? candidate.startingPositions
      : createDefaultStartingPositions(gridSize, width, height);

  return ensureMapStartingPositions({
    id: candidate.id || `map:${nodeId}`,
    scenarioNodeId: candidate.scenarioNodeId ?? nodeId,
    imageUrl: candidate.imageUrl ?? null,
    gridType: candidate.gridType === 'hex' ? 'hex' : 'square',
    gridSize,
    width,
    height,
    tokens: Array.isArray(candidate.tokens) ? candidate.tokens : [],
    encounterScaling:
      candidate.encounterScaling && typeof candidate.encounterScaling === 'object'
        ? {
            enabled: candidate.encounterScaling.enabled === true,
            basePartySize:
              typeof candidate.encounterScaling.basePartySize === 'number'
                ? Math.min(12, Math.max(1, Math.trunc(candidate.encounterScaling.basePartySize)))
                : 4,
            minMonsterCount:
              typeof candidate.encounterScaling.minMonsterCount === 'number'
                ? Math.min(80, Math.max(0, Math.trunc(candidate.encounterScaling.minMonsterCount)))
                : 1,
            mode: 'by_party_ratio',
          }
        : null,
    fogRects: Array.isArray(candidate.fogRects) ? candidate.fogRects : [],
    startingPositions,
    terrainCells: Array.isArray(candidate.terrainCells) ? candidate.terrainCells : [],
    wallCells: Array.isArray(candidate.wallCells) ? candidate.wallCells : [],
    doorCells: Array.isArray(candidate.doorCells) ? candidate.doorCells : [],
    objectCells: Array.isArray(candidate.objectCells) ? candidate.objectCells : [],
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
  });
}

function mapScenarioNpcs(scenario: ScenarioDetail): NpcForm[] {
  const scenarioNpcs = Array.isArray(scenario.npcs) ? scenario.npcs : [];
  const sourceNpcs = scenarioNpcs.length
    ? scenarioNpcs
    : scenario.nodes.flatMap((node) => {
        const meta = node.nodeMeta;
        if (!meta || typeof meta !== 'object') {
          return [];
        }

        const npcs = (meta as Record<string, unknown>).npcs;
        return Array.isArray(npcs) ? npcs : [];
      });

  const deduped = new Map<string, NpcForm>();
  sourceNpcs.forEach((npc) => {
    if (!npc || typeof npc !== 'object') {
      return;
    }

    const mappedNpc = mapNpc(npc as Record<string, unknown>);
    if (!deduped.has(mappedNpc.id)) {
      deduped.set(mappedNpc.id, mappedNpc);
    }
  });

  return Array.from(deduped.values());
}

function mapNodeNpcIds(nodeMeta: Record<string, unknown> | null): string[] {
  if (!nodeMeta || typeof nodeMeta !== 'object' || !Array.isArray(nodeMeta.npcs)) {
    return [];
  }

  return Array.from(
    new Set(
      nodeMeta.npcs
        .map((npc) =>
          npc && typeof npc === 'object' ? valueAsString((npc as Record<string, unknown>).id) : ''
        )
        .filter(Boolean),
    ),
  );
}

function mapNodeIsEnding(nodeMeta: Record<string, unknown> | null): boolean {
  if (!nodeMeta || typeof nodeMeta !== 'object') {
    return false;
  }

  return nodeMeta.isEndingNode === true || nodeMeta.endBehavior === 'SESSION_COMPLETE';
}

// API에서 받은 시나리오 상세 데이터를 에디터 폼 상태로 변환합니다.
function formFromScenario(scenario: ScenarioDetail): ScenarioFormState {
  const nodes = scenario.nodes.length
      ? scenario.nodes.map((node) => ({
          id: node.id,
          nodeType: node.nodeType,
          title: node.title,
          sceneText: node.sceneText,
          imageUrl: node.imageUrl ?? '',
          vttMap: mapVttMap(node.vttMap, node.id),
          checkGuides: (node.checkOptions ?? []).map(mapCheckGuide),
          links: node.transitions.map(mapLink),
          clues: node.clues.map(mapClue),
          npcIds: mapNodeNpcIds(node.nodeMeta),
          isEndingNode: mapNodeIsEnding(node.nodeMeta),
        }))
    : [createBlankNode('첫 장면')];
  const startNodeId = resolveScenarioStartNodeId(nodes, valueAsString(scenario.startNodeId));

  return {
    title: scenario.title,
    description: scenario.description ?? '',
    ruleSetId: scenario.ruleSetId ?? 'dnd5e',
    difficulty: scenario.difficulty ?? '',
    startLevel: valueAsScenarioLevel(scenario.startLevel),
    recommendedEndLevel: valueAsScenarioLevel(scenario.recommendedEndLevel),
    license: scenario.license,
    attribution: scenario.attribution ?? '',
    startNodeId,
    npcs: mapScenarioNpcs(scenario),
    nodes,
  };
}

// 폼의 노드 배열을 API 저장 형식으로 직렬화합니다.
function serializeNodes(nodes: NodeForm[], scenarioNpcs: NpcForm[]) {
  const npcById = new Map(scenarioNpcs.map((npc) => [npc.id, npc]));

  return nodes.map((node) => ({
    id: node.id,
    nodeType: node.nodeType,
    title: node.title.trim(),
    sceneText: node.sceneText.trim(),
    imageUrl: node.imageUrl || null,
    vttMap: node.vttMap as unknown as Record<string, unknown> | null,
    checkOptions: node.checkGuides
      .filter((guide) => guide.label.trim() || guide.skill.trim())
      .map((guide) => ({
        id: guide.id,
        label: guide.label.trim() || guide.skill.trim(),
        type: guide.type.trim() || 'check',
        skill: guide.skill.trim() || undefined,
      })),
    nodeMeta: buildNodeMetaFromFeaturedNpcs(node, npcById),
    transitions: node.links
      .filter((link) => link.nextNodeId)
      .map((link) => ({
        id: link.id,
        label: link.label.trim() || undefined,
        condition: link.condition.trim() || 'default',
        conditionRule: serializeTransitionConditionRule(link.conditionRule),
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

function serializeTransitionConditionRule(rule: TransitionConditionRuleForm) {
  const requirements = rule.requirements.map((requirement) => ({
    id: requirement.id,
    type: requirement.type,
    targetId: requirement.targetId.trim() || undefined,
    flagKey: requirement.flagKey.trim() || undefined,
    flagValue: requirement.flagValue.trim() || undefined,
  }));

  return {
    logic: rule.logic,
    requirements: requirements.length ? requirements : [{ id: makeLocalId('transition_req'), type: 'ALWAYS' }],
  };
}

function buildNodeMetaFromFeaturedNpcs(
  node: NodeForm,
  scenarioNpcById: Map<string, NpcForm>,
): Record<string, unknown> | null {
  const featuredNpcIds = new Set(node.npcIds.filter((npcId) => scenarioNpcById.has(npcId)));
  const tokenByNpcId = new Map(
    (node.vttMap?.tokens ?? [])
      .filter((token) => token.npcId && scenarioNpcById.has(token.npcId))
      .map((token) => {
        featuredNpcIds.add(token.npcId as string);
        return [token.npcId as string, token] as const;
      }),
  );

  const featuredNpcs = Array.from(featuredNpcIds).map((npcId) => {
    const npc = scenarioNpcById.get(npcId)!;
    const token = tokenByNpcId.get(npcId);
    return {
      id: npc.id,
      name: token?.name?.trim() || npc.name.trim() || npc.shortDescription.trim() || 'NPC',
      shortDescription: npc.shortDescription.trim() || undefined,
      description: npc.description.trim() || undefined,
      disposition: token?.isHostile ? 'hostile' : npc.disposition,
      isVisible: npc.isVisible && token?.hidden !== true,
      imageUrl: (token?.imageUrl ?? npc.imageUrl.trim()) || undefined,
    };
  });

  const meta: Record<string, unknown> = {};
  if (featuredNpcs.length) {
    meta.npcs = featuredNpcs;
  }
  if (node.isEndingNode) {
    meta.isEndingNode = true;
    meta.endBehavior = 'SESSION_COMPLETE';
  }

  return Object.keys(meta).length ? meta : null;
}

// 현재 폼 전체를 create/update API payload로 변환합니다.
function buildScenarioPayload(form: ScenarioFormState): CreateScenarioDto & UpdateScenarioDto {
  const startNodeId = resolveScenarioStartNodeId(form.nodes, form.startNodeId || form.nodes[0]?.id);
  const orderedNodes = sortNodesForScenarioFlow(form.nodes, startNodeId);
  const nodes = serializeNodes(orderedNodes, form.npcs);
  const startNode = orderedNodes.find((node) => node.id === startNodeId) ?? orderedNodes[0];

  return {
    title: form.title.trim(),
    description: form.description || null,
    ruleSetId: form.ruleSetId || null,
    difficulty: form.difficulty || null,
    startLevel: form.startLevel as number,
    recommendedEndLevel: form.recommendedEndLevel,
    license: form.license,
    attribution: form.attribution || null,
    startNodeId: startNode?.id ?? null,
    startNodeTitle: startNode?.title,
    startSceneText: startNode?.sceneText,
    npcs: form.npcs
      .filter((npc) => npc.name.trim() || npc.shortDescription.trim() || npc.description.trim())
      .map((npc) => ({
        id: npc.id,
        name: npc.name.trim() || npc.shortDescription.trim() || 'NPC',
        shortDescription: npc.shortDescription.trim() || undefined,
        description: npc.description.trim() || undefined,
        disposition: npc.disposition,
        isVisible: npc.isVisible,
        imageUrl: npc.imageUrl.trim() || undefined,
      })),
    nodes,
  };
}

function syncNpcIntoMap(map: VttMapStateDto | null, npc: NpcForm): VttMapStateDto | null {
  if (!map) {
    return map;
  }

  return {
    ...map,
    tokens: map.tokens.map((token) =>
      token.npcId === npc.id
        ? {
            ...token,
            name: npc.name.trim() || token.name,
            imageUrl: npc.imageUrl.trim() || null,
            hidden: !npc.isVisible,
            isHostile: npc.disposition === 'hostile',
          }
        : token
    ),
    updatedAt: new Date().toISOString(),
  };
}

function removeNpcFromMap(map: VttMapStateDto | null, npcId: string): VttMapStateDto | null {
  if (!map) {
    return map;
  }

  return {
    ...map,
    tokens: map.tokens.filter((token) => token.npcId !== npcId),
    updatedAt: new Date().toISOString(),
  };
}

function getRequiredScenarioMessage(payload: CreateScenarioDto & UpdateScenarioDto): string | null {
  if (!payload.title) {
    return '자동 저장 대기: 시나리오 제목을 입력해 주세요.';
  }

  if (!payload.startLevel) {
    return '자동 저장 대기: 시작 레벨을 입력해 주세요.';
  }

  if (
    payload.startLevel &&
    payload.recommendedEndLevel &&
    payload.recommendedEndLevel < payload.startLevel
  ) {
    return 'Recommended end level must be greater than or equal to start level.';
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

function sortNodesForScenarioFlow(nodes: NodeForm[], startNodeId: string | null | undefined): NodeForm[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ordered: NodeForm[] = [];
  const visited = new Set<string>();
  const resolvedStartNodeId = resolveScenarioStartNodeId(nodes, startNodeId);

  function visit(nodeId: string | null | undefined) {
    if (!nodeId || visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;

    visited.add(nodeId);
    ordered.push(node);
    node.links.forEach((link) => visit(link.nextNodeId));
  }

  visit(resolvedStartNodeId);
  nodes.forEach((node) => visit(node.id));
  return ordered;
}

function resolveScenarioStartNodeId(nodes: NodeForm[], requestedStartNodeId: string | null | undefined): string {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const fallbackNodeId = nodes[0]?.id ?? '';
  if (!nodeIds.size) {
    return '';
  }

  const incoming = new Map<string, number>();
  nodes.forEach((node) => {
    node.links.forEach((link) => {
      if (nodeIds.has(link.nextNodeId)) {
        incoming.set(link.nextNodeId, (incoming.get(link.nextNodeId) ?? 0) + 1);
      }
    });
  });

  const rootNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  if (
    requestedStartNodeId &&
    nodeIds.has(requestedStartNodeId) &&
    (rootNodes.length !== 1 || rootNodes[0].id === requestedStartNodeId)
  ) {
    return requestedStartNodeId;
  }

  return rootNodes.length === 1 ? rootNodes[0].id : requestedStartNodeId ?? fallbackNodeId;
}

// 노드 링크 구조를 읽어 그래프 화면의 좌표와 간선 목록을 계산합니다.
function buildGraphLayout(nodes: NodeForm[], startNodeId: string): {
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
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingByNode = new Map<string, string[]>();

  nodes.forEach((node) => {
    const outgoingNodeIds: string[] = [];
    node.links.forEach((link) => {
      if (!nodeIds.has(link.nextNodeId)) return;
      incomingByNode.set(link.nextNodeId, (incomingByNode.get(link.nextNodeId) ?? 0) + 1);
      if (!outgoingNodeIds.includes(link.nextNodeId)) {
        outgoingNodeIds.push(link.nextNodeId);
      }
    });
    outgoingByNode.set(node.id, outgoingNodeIds);
  });

  const depthByNode = new Map<string, number>();
  const queue = nodes[0] ? [resolveScenarioStartNodeId(nodes, startNodeId)] : [];

  queue.forEach((nodeId) => depthByNode.set(nodeId, 0));

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const nextDepth = (depthByNode.get(nodeId) ?? 0) + 1;

    (outgoingByNode.get(node.id) ?? []).forEach((nextNodeId) => {
      const currentDepth = depthByNode.get(nextNodeId);
      if (currentDepth !== undefined && currentDepth >= nextDepth) return;
      depthByNode.set(nextNodeId, nextDepth);
      if (!queue.includes(nextNodeId)) {
        queue.push(nextNodeId);
      }
    });
  }

  nodes.forEach((node) => {
    if (!depthByNode.has(node.id)) {
      depthByNode.set(node.id, Math.max(0, ...Array.from(depthByNode.values())) + 1);
    }
  });

  const rowByNode = new Map<string, number>();
  const expandedNodeIds = new Set<string>();
  const expandingNodeIds = new Set<string>();

  function setDirectChildRows(nodeId: string) {
    const parentRow = rowByNode.get(nodeId) ?? 0;
    const childNodeIds = outgoingByNode.get(nodeId) ?? [];
    childNodeIds.forEach((childNodeId, childIndex) => {
      if (rowByNode.has(childNodeId)) return;
      const branchOffset =
        childNodeIds.length <= 1
          ? 0
          : (childIndex - (childNodeIds.length - 1) / 2) * (childNodeIds.length === 2 ? 2 : 1);
      rowByNode.set(childNodeId, parentRow + branchOffset);
    });
  }

  function expandVisualRows(nodeId: string, row: number) {
    if (!nodeIds.has(nodeId)) return;
    if (!rowByNode.has(nodeId)) {
      rowByNode.set(nodeId, row);
    }
    if (expandedNodeIds.has(nodeId) || expandingNodeIds.has(nodeId)) return;

    expandingNodeIds.add(nodeId);
    setDirectChildRows(nodeId);
    (outgoingByNode.get(nodeId) ?? []).forEach((childNodeId) => {
      expandVisualRows(childNodeId, rowByNode.get(childNodeId) ?? row);
    });
    expandingNodeIds.delete(nodeId);
    expandedNodeIds.add(nodeId);
  }

  const resolvedStartNodeId = resolveScenarioStartNodeId(nodes, startNodeId);
  if (resolvedStartNodeId) {
    expandVisualRows(resolvedStartNodeId, 0);
  }

  nodes.forEach((node) => {
    if (!rowByNode.has(node.id)) {
      const nextRow = rowByNode.size ? Math.max(...Array.from(rowByNode.values())) + 1 : 0;
      expandVisualRows(node.id, nextRow);
    }
  });

  const minRow = Math.min(0, ...Array.from(rowByNode.values()));
  const occupiedRowsByDepth = new Map<number, Set<number>>();
  const graphNodes = nodes.map((node) => {
    const depth = depthByNode.get(node.id) ?? 0;
    const occupiedRows = occupiedRowsByDepth.get(depth) ?? new Set<number>();
    let rowKey = Math.round(((rowByNode.get(node.id) ?? 0) - minRow) * 2);
    while (occupiedRows.has(rowKey)) {
      rowKey += 2;
    }
    occupiedRows.add(rowKey);
    occupiedRowsByDepth.set(depth, occupiedRows);

    return {
      node,
      x: GRAPH_PADDING + depth * GRAPH_COLUMN_GAP,
      y: GRAPH_PADDING + (rowKey / 2) * GRAPH_ROW_GAP,
      incomingCount: incomingByNode.get(node.id) ?? 0,
    };
  });
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
  const maxY = Math.max(0, ...graphNodes.map((item) => item.y - GRAPH_PADDING));

  return {
    graphNodes,
    edges,
    width: GRAPH_PADDING * 2 + maxDepth * GRAPH_COLUMN_GAP + 180,
    height: GRAPH_PADDING * 2 + maxY + 80,
  };
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function ScenarioEditorPage({
  user,
  accessToken,
  scenarioId,
  onDone,
  onCancel,
  onUnsavedChangesChange,
}: ScenarioEditorPageProps) {
  // 에디터 기본 상태입니다. 생성/수정 모드, 선택 노드, 사이드 패널, 자동 저장 상태를 관리합니다.
  const formId = 'scenario-editor-form';
  const isEditMode = Boolean(scenarioId);
  const [draftScenarioId, setDraftScenarioId] = useState<string | null>(scenarioId ?? null);
  const [form, setForm] = useState<ScenarioFormState>(() => createEmptyForm());
  const [selectedNodeId, setSelectedNodeId] = useState(form.nodes[0].id);
  const [editorMode, setEditorMode] = useState<'graph' | 'detail'>('graph');
  const [isScenarioInfoOpen, setScenarioInfoOpen] = useState(!scenarioId);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monsterCatalog, setMonsterCatalog] = useState<SrdMonsterReferenceDto[]>([]);
  const [monsterCatalogError, setMonsterCatalogError] = useState<string | null>(null);
  const [itemOptions, setItemOptions] = useState<BattleMapOption[]>([]);
  const [itemCatalogError, setItemCatalogError] = useState<string | null>(null);
  const [mapAssets, setMapAssets] = useState<ScenarioAsset[]>([]);
  const [mapAssetsLoading, setMapAssetsLoading] = useState(false);
  const [mapAssetsError, setMapAssetsError] = useState<string | null>(null);
  const [sceneAssets, setSceneAssets] = useState<ScenarioAsset[]>([]);
  const [sceneAssetsLoading, setSceneAssetsLoading] = useState(false);
  const [sceneAssetsError, setSceneAssetsError] = useState<string | null>(null);
  const [tokenAssets, setTokenAssets] = useState<ScenarioAsset[]>([]);
  const [tokenAssetsLoading, setTokenAssetsLoading] = useState(false);
  const [tokenAssetsError, setTokenAssetsError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('자동 저장 준비 중');
  const autoSaveBusyRef = useRef(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const draftScenarioIdRef = useRef<string | null>(scenarioId ?? null);
  const formRef = useRef(form);
  const busyRef = useRef(busy);

  // 생성 직후 임시 draftScenarioId가 생기면 이후 자동 저장은 그 ID를 사용합니다.
  const effectiveScenarioId = draftScenarioId ?? scenarioId ?? null;

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (form.ruleSetId !== 'dnd5e') {
      setMonsterCatalog([]);
      setMonsterCatalogError('현재는 dnd5e 5.1 SRD 몬스터만 지원합니다.');
      setItemOptions([]);
      setItemCatalogError('현재는 dnd5e 5.1 SRD 아이템만 지원합니다.');
      return;
    }

    let ignore = false;
    setMonsterCatalogError(null);
    setItemCatalogError(null);

    loadMonsterCatalog()
      .then((monsters) => {
        if (!ignore) {
          setMonsterCatalog(monsters);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setMonsterCatalog([]);
          setMonsterCatalogError(
            caught instanceof Error ? caught.message : 'SRD 몬스터 목록을 불러오지 못했습니다.'
          );
        }
      });
    loadItemCatalog()
      .then((catalog) => {
        if (!ignore) {
          setItemOptions(
            [...catalog.equipmentItems, ...catalog.magicItems]
              .map((item) => {
                const id = typeof item.id === 'string' ? item.id : '';
                const nameKo = typeof item.nameKo === 'string' ? item.nameKo : '';
                const nameEn = typeof item.nameEn === 'string' ? item.nameEn : '';
                const label = [nameKo || nameEn || id, nameKo && nameEn ? nameEn : null]
                  .filter(Boolean)
                  .join(' / ');
                return id ? { id, label } : null;
              })
              .filter((item): item is BattleMapOption => Boolean(item))
          );
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setItemOptions([]);
          setItemCatalogError(
            caught instanceof Error ? caught.message : 'SRD 아이템 목록을 불러오지 못했습니다.'
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [form.ruleSetId]);

  useEffect(() => {
    if (!effectiveScenarioId) {
      setMapAssets([]);
      setMapAssetsLoading(false);
      setMapAssetsError(null);
      return;
    }

    let ignore = false;
    setMapAssetsLoading(true);
    setMapAssetsError(null);

    listScenarioAssets(user, effectiveScenarioId, { kind: SCENARIO_ASSET_KIND_MAP }, accessToken)
      .then((items) => {
        if (!ignore) {
          setMapAssets(items);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setMapAssets([]);
          setMapAssetsError(
            caught instanceof Error ? caught.message : '맵 자산 목록을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setMapAssetsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [accessToken, effectiveScenarioId, user]);

  useEffect(() => {
    if (!effectiveScenarioId) {
      setSceneAssets([]);
      setSceneAssetsLoading(false);
      setSceneAssetsError(null);
      return;
    }

    let ignore = false;
    setSceneAssetsLoading(true);
    setSceneAssetsError(null);

    listScenarioAssets(user, effectiveScenarioId, { kind: SCENARIO_ASSET_KIND_SCENE }, accessToken)
      .then((items) => {
        if (!ignore) {
          setSceneAssets(items);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setSceneAssets([]);
          setSceneAssetsError(
            caught instanceof Error ? caught.message : '장면 자산 목록을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setSceneAssetsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [accessToken, effectiveScenarioId, user]);

  useEffect(() => {
    if (!effectiveScenarioId) {
      setTokenAssets([]);
      setTokenAssetsLoading(false);
      setTokenAssetsError(null);
      return;
    }

    let ignore = false;
    setTokenAssetsLoading(true);
    setTokenAssetsError(null);

    listScenarioAssets(user, effectiveScenarioId, { kind: SCENARIO_ASSET_KIND_TOKEN }, accessToken)
      .then((items) => {
        if (!ignore) {
          setTokenAssets(items);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setTokenAssets([]);
          setTokenAssetsError(
            caught instanceof Error ? caught.message : '토큰 자산 목록을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setTokenAssetsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [accessToken, effectiveScenarioId, user]);

  // 마지막 저장 스냅샷과 현재 payload를 비교해 저장 안 된 변경사항을 판단합니다.
  const hasUnsavedChanges = useCallback(() => {
    const savedSnapshot = lastSavedSnapshotRef.current;
    return (
      savedSnapshot !== null &&
      JSON.stringify(buildScenarioPayload(formRef.current)) !== savedSnapshot
    );
  }, []);

  // 자동 저장 콜백에서 최신 form/busy 값을 읽을 수 있도록 ref에 동기화합니다.
  useEffect(() => {
    formRef.current = form;
    onUnsavedChangesChange?.(hasUnsavedChanges());
  }, [form, hasUnsavedChanges, onUnsavedChangesChange]);

  // 브라우저 새로고침/닫기 전에 미저장 변경사항 경고를 띄웁니다.
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

  // 수정 모드면 기존 시나리오를 불러와 폼을 채우고, 생성 모드면 빈 폼을 초기화합니다.
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

    getScenario(scenarioId, user, accessToken)
      .then((scenario) => {
        if (!ignore) {
          const nextForm = formFromScenario(scenario);
          setForm(nextForm);
          lastSavedSnapshotRef.current = JSON.stringify(buildScenarioPayload(nextForm));
          onUnsavedChangesChange?.(false);
          setAutoSaveStatus('저장됨');
          setSelectedNodeId(nextForm.startNodeId || nextForm.nodes[0].id);
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
  }, [accessToken, scenarioId, user]);

  // 주기적으로 현재 폼을 저장합니다. 필수값이 비어 있으면 저장을 건너뜁니다.
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

  // 현재 선택된 노드와 해당 노드로 들어오는 링크를 계산합니다.
  const effectiveStartNodeId = useMemo(
    () => resolveScenarioStartNodeId(form.nodes, form.startNodeId || form.nodes[0]?.id),
    [form.nodes, form.startNodeId]
  );

  const orderedNodes = useMemo(
    () => sortNodesForScenarioFlow(form.nodes, effectiveStartNodeId),
    [form.nodes, effectiveStartNodeId]
  );

  const selectedNode = useMemo(
    () => form.nodes.find((node) => node.id === selectedNodeId) ?? orderedNodes[0],
    [form.nodes, orderedNodes, selectedNodeId]
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

  const graphLayout = useMemo(
    () => buildGraphLayout(orderedNodes, effectiveStartNodeId),
    [orderedNodes, effectiveStartNodeId]
  );

  // 시나리오 기본 정보 필드를 부분 업데이트합니다.
  function updateField<K extends keyof Omit<ScenarioFormState, 'nodes'>>(
    field: K,
    value: ScenarioFormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // 특정 노드만 찾아 updater 결과로 교체합니다.
  function updateNode(nodeId: string, updater: (node: NodeForm) => NodeForm) {
    setForm((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
    }));
  }

  function addScenarioNpc() {
    setForm((current) => ({
      ...current,
      npcs: [...current.npcs, createBlankNpc()],
    }));
  }

  function updateScenarioNpc(index: number, patch: Partial<NpcForm>) {
    setForm((current) => {
      const nextNpcs = current.npcs.map((npc, itemIndex) =>
        itemIndex === index ? { ...npc, ...patch } : npc
      );
      const nextNpc = nextNpcs[index];

      return {
        ...current,
        npcs: nextNpcs,
        nodes: nextNpc
          ? current.nodes.map((node) => ({
              ...node,
              vttMap: syncNpcIntoMap(node.vttMap, nextNpc),
            }))
          : current.nodes,
      };
    });
  }

  function removeScenarioNpc(index: number) {
    setForm((current) => {
      const npc = current.npcs[index];
      if (!npc) {
        return current;
      }

      return {
        ...current,
        npcs: current.npcs.filter((_, itemIndex) => itemIndex !== index),
        nodes: current.nodes.map((node) => ({
          ...node,
          npcIds: node.npcIds.filter((npcId) => npcId !== npc.id),
          vttMap: removeNpcFromMap(node.vttMap, npc.id),
        })),
      };
    });
  }

  // 새 노드를 추가하고 즉시 선택합니다.
  function addNode() {
    const node = createBlankNode();
    setForm((current) => ({
      ...current,
      startNodeId: current.startNodeId || node.id,
      nodes: [...current.nodes, node],
    }));
    setSelectedNodeId(node.id);
    setEditorMode('detail');
  }

  // 노드를 삭제하면서 다른 노드의 링크/단서 참조도 함께 정리합니다.
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
        startNodeId:
          current.startNodeId === nodeId || !nodes.some((node) => node.id === current.startNodeId)
            ? nodes[0].id
            : current.startNodeId,
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

  // 그래프/사이드바에서 노드를 선택하면 상세 편집 모드로 전환합니다.
  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setEditorMode('detail');
  }

  async function uploadAssetByKind(
    file: File | null,
    kind: ScenarioAssetKind,
    missingScenarioMessage: string,
    onUploaded: (asset: ScenarioAsset) => void,
  ): Promise<ScenarioAsset | null> {
    if (!file) return null;

    if (!effectiveScenarioId) {
      setError(missingScenarioMessage);
      return null;
    }

    const dataBase64 = await fileToBase64(file);
    const asset = await uploadScenarioAsset(
      user,
      effectiveScenarioId,
      {
        kind,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        dataBase64,
      },
      accessToken,
    );

    onUploaded(asset);
    return asset;
  }

  async function handleMapAssetUpload(file: File | null): Promise<ScenarioAsset | null> {
    return uploadAssetByKind(
      file,
      SCENARIO_ASSET_KIND_MAP,
      '맵 이미지는 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.',
      (asset) => {
        setMapAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        setMapAssetsError(null);
      },
    );
  }

  async function handleSceneAssetUpload(file: File | null): Promise<ScenarioAsset | null> {
    return uploadAssetByKind(
      file,
      SCENARIO_ASSET_KIND_SCENE,
      '장면 이미지는 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.',
      (asset) => {
        setSceneAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        setSceneAssetsError(null);
      },
    );
  }

  async function handleTokenAssetUpload(file: File | null): Promise<ScenarioAsset | null> {
    return uploadAssetByKind(
      file,
      SCENARIO_ASSET_KIND_TOKEN,
      '토큰 이미지는 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.',
      (asset) => {
        setTokenAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        setTokenAssetsError(null);
      },
    );
  }

  // 수동 저장 버튼/폼 제출 처리입니다. 유효성 검사 후 create/update API를 호출합니다.
  function clearDeletedAssetReferences(kind: ScenarioAssetKind, publicUrl: string) {
    setForm((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (kind === SCENARIO_ASSET_KIND_SCENE && node.imageUrl === publicUrl) {
          return {
            ...node,
            imageUrl: '',
          };
        }

        if (kind === SCENARIO_ASSET_KIND_MAP && node.vttMap?.imageUrl === publicUrl) {
          return {
            ...node,
            vttMap: {
              ...node.vttMap,
              imageUrl: null,
              updatedAt: new Date().toISOString(),
            },
          };
        }

        if (kind === SCENARIO_ASSET_KIND_TOKEN && node.vttMap?.tokens?.some((token) => token.imageUrl === publicUrl)) {
          return {
            ...node,
            vttMap: {
              ...node.vttMap,
              tokens: node.vttMap.tokens.map((token) =>
                token.imageUrl === publicUrl
                  ? {
                      ...token,
                      imageUrl: null,
                    }
                  : token,
              ),
              updatedAt: new Date().toISOString(),
            },
          };
        }

        return node;
      }),
    }));
  }

  async function deleteAssetByKind(
    asset: ScenarioAsset,
    kind: ScenarioAssetKind,
    onDeleted: () => void,
  ): Promise<void> {
    if (!effectiveScenarioId) {
      setError('시나리오를 먼저 저장한 뒤 자산을 삭제할 수 있습니다.');
      return;
    }

    await deleteScenarioAssetRequest(user, effectiveScenarioId, asset.id, accessToken);
    onDeleted();
    clearDeletedAssetReferences(kind, asset.publicUrl);
  }

  async function handleMapAssetDelete(asset: ScenarioAsset): Promise<void> {
    await deleteAssetByKind(asset, SCENARIO_ASSET_KIND_MAP, () => {
      setMapAssets((current) => current.filter((item) => item.id !== asset.id));
      setMapAssetsError(null);
    });
  }

  async function handleSceneAssetDelete(asset: ScenarioAsset): Promise<void> {
    await deleteAssetByKind(asset, SCENARIO_ASSET_KIND_SCENE, () => {
      setSceneAssets((current) => current.filter((item) => item.id !== asset.id));
      setSceneAssetsError(null);
    });
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

      if (!payload.startLevel) {
        setScenarioInfoOpen(true);
        setError('시작 레벨을 입력해주세요.');
        return;
      }

      if (
        payload.startLevel &&
        payload.recommendedEndLevel &&
        payload.recommendedEndLevel < payload.startLevel
      ) {
        setScenarioInfoOpen(true);
        setError('Recommended end level must be greater than or equal to start level.');
        return;
      }

      const nodes = serializeNodes(form.nodes, form.npcs);
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
          <h1>{isEditMode ? '시나리오 수정' : '새 커스텀 시나리오'}</h1>
          <p>각 장면에서 이어질 장면을 연결하고, 마스터가 사용할 단서와 공개 자료를 계획합니다.</p>
        </div>
        <div className="session-page-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            목록으로
          </button>
          <button type="button" className="ghost" onClick={() => setGuideOpen(true)}>
            가이드
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setScenarioInfoOpen((current) => !current)}
          >
            기본 정보
          </button>
          <button type="submit" form={formId} className="primary" disabled={busy}>
            {busy ? '저장 중...' : '저장'}
          </button>
          <span className="scenario-autosave-status" role="status" aria-live="polite">
            {autoSaveStatus}
          </span>
        </div>
      </section>

      {isScenarioInfoOpen ? (
        <section className="session-form-card scenario-info-panel">
          {/* 시나리오 기본 정보 입력 패널입니다. 제목, 설명, 룰셋, 난이도, 라이선스를 관리합니다. */}
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
              <label htmlFor="scenario-start-level">Start level</label>
              <input
                id="scenario-start-level"
                type="number"
                min={1}
                max={20}
                step={1}
                required
                value={form.startLevel ?? ''}
                onChange={(event) =>
                  updateField('startLevel', scenarioLevelFromInput(event.target.value))
                }
              />
            </div>
            <div>
              <label htmlFor="scenario-recommended-end-level">Recommended end level</label>
              <input
                id="scenario-recommended-end-level"
                type="number"
                min={1}
                max={20}
                step={1}
                value={form.recommendedEndLevel ?? ''}
                onChange={(event) =>
                  updateField('recommendedEndLevel', scenarioLevelFromInput(event.target.value))
                }
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
            <div>
              <label htmlFor="scenario-start-node">Entry node</label>
              <select
                id="scenario-start-node"
                value={effectiveStartNodeId}
                onChange={(event) => updateField('startNodeId', event.target.value)}
              >
                {orderedNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title || node.id}
                  </option>
                ))}
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

      <form id={formId} className="scenario-editor-form" onSubmit={submit}>
        <div className="scenario-editor-layout">
          {/* 좌측 노드 목록: 장면 추가/삭제/선택을 담당합니다. */}
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
              {orderedNodes.map((node) => (
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
                    {node.id === effectiveStartNodeId ? '진입 · ' : ''}
                    {node.nodeType} · {node.links.length}개 연결
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {/* 우측 메인 에디터: 그래프 보기 또는 선택 노드 상세 편집을 표시합니다. */}
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
                scenarioId={effectiveScenarioId}
                node={selectedNode}
                nodes={orderedNodes}
                scenarioNpcs={form.npcs}
                incomingLinks={incomingLinks}
                mapAssets={mapAssets}
                mapAssetsLoading={mapAssetsLoading}
                mapAssetsError={mapAssetsError}
                uploadMapAsset={handleMapAssetUpload}
                deleteMapAsset={handleMapAssetDelete}
                sceneAssets={sceneAssets}
                sceneAssetsLoading={sceneAssetsLoading}
                sceneAssetsError={sceneAssetsError}
                uploadSceneAsset={handleSceneAssetUpload}
                deleteSceneAsset={handleSceneAssetDelete}
                tokenAssets={tokenAssets}
                tokenAssetsLoading={tokenAssetsLoading}
                tokenAssetsError={tokenAssetsError}
                uploadTokenAsset={handleTokenAssetUpload}
                monsterCatalog={monsterCatalog}
                monsterCatalogError={monsterCatalogError}
                itemOptions={itemOptions}
                itemCatalogError={itemCatalogError}
                updateNode={updateNode}
                onAddScenarioNpc={addScenarioNpc}
                onUpdateScenarioNpc={updateScenarioNpc}
                onRemoveScenarioNpc={removeScenarioNpc}
                removeNode={removeNode}
                setError={setError}
              />
            ) : null}
          </section>
        </div>
      </form>

      {error ? <p className="panel-error">{error}</p> : null}
      {isGuideOpen ? (
        <div className="modal-backdrop" onClick={() => setGuideOpen(false)}>
          <section
            className="modal-card scenario-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scenario-guide-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Guide</span>
                <h2 id="scenario-guide-title">시나리오 작성 가이드</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setGuideOpen(false)}>
                닫기
              </button>
            </div>
            <p className="scenario-guide-summary">
              작성 가이드는 필요할 때만 열어서 확인하고, 편집 화면은 노드 작성과 저장에 집중할 수
              있게 유지합니다.
            </p>
            <div className="profile-notes">
              {scenarioGuideNotes.map((note) => (
                <div key={note.title} className="profile-note">
                  <strong>{note.title}</strong>
                  <p>{note.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

// 선택된 노드 하나의 제목/타입/이미지/맵/본문/링크/판정 가이드/단서를 편집하는 하위 컴포넌트입니다.
function NodeDetailEditor({
  scenarioId,
  node,
  nodes,
  scenarioNpcs,
  incomingLinks,
  mapAssets,
  mapAssetsLoading,
  mapAssetsError,
  uploadMapAsset,
  deleteMapAsset,
  sceneAssets,
  sceneAssetsLoading,
  sceneAssetsError,
  uploadSceneAsset,
  deleteSceneAsset,
  tokenAssets,
  tokenAssetsLoading,
  tokenAssetsError,
  uploadTokenAsset,
  monsterCatalog,
  monsterCatalogError,
  itemOptions,
  itemCatalogError,
  updateNode,
  onAddScenarioNpc,
  onUpdateScenarioNpc,
  onRemoveScenarioNpc,
  removeNode,
  setError,
}: {
  scenarioId: string | null;
  node: NodeForm;
  nodes: NodeForm[];
  scenarioNpcs: NpcForm[];
  incomingLinks: Array<{ fromNode: string; label: string }>;
  mapAssets: ScenarioAsset[];
  mapAssetsLoading: boolean;
  mapAssetsError: string | null;
  uploadMapAsset: (file: File | null) => Promise<ScenarioAsset | null>;
  deleteMapAsset: (asset: ScenarioAsset) => Promise<void>;
  sceneAssets: ScenarioAsset[];
  sceneAssetsLoading: boolean;
  sceneAssetsError: string | null;
  uploadSceneAsset: (file: File | null) => Promise<ScenarioAsset | null>;
  deleteSceneAsset: (asset: ScenarioAsset) => Promise<void>;
  tokenAssets: ScenarioAsset[];
  tokenAssetsLoading: boolean;
  tokenAssetsError: string | null;
  uploadTokenAsset: (file: File | null) => Promise<ScenarioAsset | null>;
  monsterCatalog: SrdMonsterReferenceDto[];
  monsterCatalogError: string | null;
  itemOptions: BattleMapOption[];
  itemCatalogError: string | null;
  updateNode: (nodeId: string, updater: (node: NodeForm) => NodeForm) => void;
  onAddScenarioNpc: () => void;
  onUpdateScenarioNpc: (index: number, patch: Partial<NpcForm>) => void;
  onRemoveScenarioNpc: (index: number) => void;
  removeNode: (nodeId: string) => void;
  setError: (message: string | null) => void;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [sceneUploadBusy, setSceneUploadBusy] = useState(false);
  const [mapUploadBusy, setMapUploadBusy] = useState(false);
  const [deletingSceneAssetId, setDeletingSceneAssetId] = useState<string | null>(null);
  const [deletingMapAssetId, setDeletingMapAssetId] = useState<string | null>(null);
  const sceneImageInputRef = useRef<HTMLInputElement | null>(null);
  const sceneAssetInputRef = useRef<HTMLInputElement | null>(null);
  const mapAssetInputRef = useRef<HTMLInputElement | null>(null);
  const clueOptions = useMemo(
    () =>
      node.clues
        .map((clue) => ({
          id: clue.id,
          label: clue.title.trim() || clue.text.trim() || clue.revelation.trim() || clue.id,
        }))
        .filter((option) => option.id.trim()),
    [node.clues],
  );

  async function handleImageFile(file: File | null) {
    if (!file) return;
    if (!scenarioId) {
      setError('이미지는 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.');
      return;
    }

    setImageBusy(true);
    setError(null);

    try {
      const asset = await uploadSceneAsset(file);
      if (asset) {
        updateNode(node.id, (current) => ({
          ...current,
          imageUrl: asset.publicUrl,
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setImageBusy(false);
    }
  }

  function applySceneAsset(asset: ScenarioAsset) {
    updateNode(node.id, (current) => ({
      ...current,
      imageUrl: asset.publicUrl,
    }));
  }

  async function handleSceneAssetFile(file: File | null) {
    if (!file) return;

    setSceneUploadBusy(true);
    setError(null);

    try {
      const asset = await uploadSceneAsset(file);
      if (asset) {
        applySceneAsset(asset);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '장면 이미지를 업로드하지 못했습니다.');
    } finally {
      setSceneUploadBusy(false);
    }
  }

  function updateNodeMap(nextMap: VttMapStateDto) {
    updateNode(node.id, (current) => ({
      ...current,
      vttMap: ensureMapStartingPositions({
        ...nextMap,
        scenarioNodeId: current.id,
        updatedAt: new Date().toISOString(),
      }),
    }));
  }

  function enableNodeMap() {
    updateNode(node.id, (current) => ({
      ...current,
      vttMap: createDefaultNodeMap(current.id),
    }));
  }

  function placeNpcOnMap(npcId: string) {
    if (!node.vttMap) {
      setError('토큰은 이 노드에 기본 맵을 만든 뒤 배치할 수 있습니다.');
      return;
    }

    updateNode(node.id, (current) => {
      const npc = scenarioNpcs.find((candidate) => candidate.id === npcId);
      if (!npc) {
        return current;
      }

      const baseMap = current.vttMap;
      if (!baseMap) {
        return current;
      }

      const existingTokenIndex = baseMap.tokens.filter((token) => token.npcId === npc.id).length;
      const size = baseMap.gridSize;
      const positionX = Math.min(
        Math.max(size * (2 + (existingTokenIndex % 4)), 0),
        baseMap.width - size
      );
      const positionY = Math.min(
        Math.max(size * (2 + Math.floor(existingTokenIndex / 4)), 0),
        baseMap.height - size
      );

      return {
        ...current,
        npcIds: current.npcIds.includes(npc.id) ? current.npcIds : [...current.npcIds, npc.id],
        vttMap: {
          ...baseMap,
          tokens: [
            ...baseMap.tokens,
            {
              id: `token:npc:${npc.id}:${Date.now()}`,
              npcId: npc.id,
              sessionCharacterId: null,
              name: npc.name.trim() || 'NPC',
              imageUrl: npc.imageUrl.trim() || null,
              x: positionX,
              y: positionY,
              size,
              hidden: !npc.isVisible,
              isHostile: npc.disposition === 'hostile',
              monster: null,
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function applyMapAsset(asset: ScenarioAsset) {
    updateNode(node.id, (current) => {
      const baseMap = current.vttMap ?? createDefaultNodeMap(current.id);
      return {
        ...current,
        vttMap: ensureMapStartingPositions({
          ...baseMap,
          imageUrl: asset.publicUrl,
          updatedAt: new Date().toISOString(),
        }),
      };
    });
  }

  async function handleMapAssetFile(file: File | null) {
    if (!file) return;

    setMapUploadBusy(true);
    setError(null);

    try {
      const asset = await uploadMapAsset(file);
      if (asset) {
        applyMapAsset(asset);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '맵 이미지를 업로드하지 못했습니다.');
    } finally {
      setMapUploadBusy(false);
    }
  }

  async function handleDeleteSceneAsset(asset: ScenarioAsset) {
    const confirmed = window.confirm(
      `라이브러리에서 "${asset.fileName}" 장면 이미지를 삭제할까요?\n현재 시나리오에서 이 이미지를 사용 중인 장면 연결도 함께 제거됩니다.`,
    );
    if (!confirmed) return;

    setDeletingSceneAssetId(asset.id);
    setError(null);

    try {
      await deleteSceneAsset(asset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '장면 이미지를 삭제하지 못했습니다.');
    } finally {
      setDeletingSceneAssetId(null);
    }
  }

  async function handleDeleteMapAsset(asset: ScenarioAsset) {
    const confirmed = window.confirm(
      `라이브러리에서 "${asset.fileName}" 맵 이미지를 삭제할까요?\n현재 시나리오에서 이 이미지를 사용 중인 맵 연결도 함께 제거됩니다.`,
    );
    if (!confirmed) return;

    setDeletingMapAssetId(asset.id);
    setError(null);

    try {
      await deleteMapAsset(asset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '맵 이미지를 삭제하지 못했습니다.');
    } finally {
      setDeletingMapAssetId(null);
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
            <label className="scenario-node-ending-toggle">
              <input
                type="checkbox"
                checked={node.isEndingNode}
                onChange={(event) =>
                  updateNode(node.id, (current) => ({
                    ...current,
                    isEndingNode: event.target.checked,
                  }))
                }
              />
              세션 종료 노드
            </label>
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
            <input
              ref={sceneImageInputRef}
              type="file"
              accept="image/*"
              hidden
              disabled={imageBusy}
              onChange={(event) => {
                void handleImageFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              className={`scenario-image-upload${imageBusy ? ' disabled' : ''}`}
              disabled={imageBusy}
              onClick={() => {
                if (!scenarioId) {
                  setError('이미지는 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.');
                  return;
                }
                sceneImageInputRef.current?.click();
              }}
            >
              {imageBusy ? '이미지 업로드 중..' : '이미지 업로드'}
            </button>
          </div>
          {node.imageUrl ? (
            <img src={node.imageUrl} alt={`${node.title || '시나리오 노드'} visual`} />
          ) : (
            <div className="scenario-node-image-empty">아직 연결된 이미지가 없습니다.</div>
          )}
          <div className="scenario-map-library scenario-node-asset-library">
            <div className="scenario-map-library-header">
              <div>
                <span className="eyebrow">Scene library</span>
                <strong>업로드한 장면 이미지를 이 노드와 다른 노드에 다시 적용할 수 있습니다.</strong>
              </div>
              <div className="scenario-map-library-actions">
                <input
                  ref={sceneAssetInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={sceneUploadBusy}
                  onChange={(event) => {
                    void handleSceneAssetFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  className={`scenario-image-upload${sceneUploadBusy ? ' disabled' : ''}`}
                  disabled={sceneUploadBusy}
                  onClick={() => {
                    if (!scenarioId) {
                      setError('장면 자산은 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.');
                      return;
                    }
                    sceneAssetInputRef.current?.click();
                  }}
                >
                  {sceneUploadBusy ? '장면 업로드 중..' : '장면 업로드'}
                </button>
              </div>
            </div>
            {!scenarioId ? (
              <p className="helper-copy">장면 자산은 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.</p>
            ) : null}
            {sceneAssetsError ? <p className="panel-error">{sceneAssetsError}</p> : null}
            {sceneAssetsLoading ? (
              <p className="helper-copy">장면 자산 목록을 불러오는 중입니다.</p>
            ) : sceneAssets.length ? (
              <div className="scenario-map-library-grid">
                {sceneAssets.map((asset) => {
                  const isSelected = node.imageUrl === asset.publicUrl;
                  const isDeleting = deletingSceneAssetId === asset.id;
                  return (
                    <article
                      key={asset.id}
                      className={`scenario-map-asset-card${isSelected ? ' selected' : ''}`}
                    >
                      <img
                        className="scenario-map-asset-preview"
                        src={asset.publicUrl}
                        alt={asset.fileName}
                      />
                      <div className="scenario-map-asset-meta">
                        <strong>{asset.fileName}</strong>
                        <span>{Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB</span>
                      </div>
                      <div className="scenario-map-asset-actions">
                        <button
                        type="button"
                        className={isSelected ? 'ghost small' : 'small'}
                        disabled={isDeleting}
                        onClick={() => applySceneAsset(asset)}
                      >
                        {isSelected ? '현재 장면' : '이 장면 적용'}
                      </button>
                        <button
                        type="button"
                        className="ghost small scenario-asset-delete-button"
                        disabled={isDeleting}
                        onClick={() => {
                          void handleDeleteSceneAsset(asset);
                        }}
                      >
                        {isDeleting ? '삭제 중..' : '삭제'}
                      </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="scenario-map-asset-empty">
                업로드한 장면 이미지가 아직 없습니다. 반복해서 쓰는 배경이나 삽화를 올려두면
                다른 노드에도 바로 재사용할 수 있습니다.
              </div>
            )}
          </div>
        </section>

        <section className="scenario-node-map-panel">
          <div className="scenario-map-library">
            <div className="scenario-map-library-header">
              <div>
                <span className="eyebrow">Map library</span>
                <strong>업로드한 맵을 현재 장면에 바로 재사용할 수 있습니다.</strong>
              </div>
              <div className="scenario-map-library-actions">
                <input
                  ref={mapAssetInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={mapUploadBusy}
                  onChange={(event) => {
                    void handleMapAssetFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  className={`scenario-image-upload${mapUploadBusy ? ' disabled' : ''}`}
                  disabled={mapUploadBusy}
                  onClick={() => {
                    if (!scenarioId) {
                      setError('맵 자산은 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.');
                      return;
                    }
                    mapAssetInputRef.current?.click();
                  }}
                >
                  {mapUploadBusy ? '맵 업로드 중..' : '맵 업로드'}
                </button>
              </div>
            </div>
            {!scenarioId ? (
              <p className="helper-copy">맵 자산은 시나리오를 먼저 저장한 뒤 업로드할 수 있습니다.</p>
            ) : null}
            {mapAssetsError ? <p className="panel-error">{mapAssetsError}</p> : null}
            {mapAssetsLoading ? (
              <p className="helper-copy">맵 자산 목록을 불러오는 중입니다.</p>
            ) : mapAssets.length ? (
              <div className="scenario-map-library-grid">
                {mapAssets.map((asset) => {
                  const isSelected = node.vttMap?.imageUrl === asset.publicUrl;
                  const isDeleting = deletingMapAssetId === asset.id;
                  return (
                    <article
                      key={asset.id}
                      className={`scenario-map-asset-card${isSelected ? ' selected' : ''}`}
                    >
                      <img
                        className="scenario-map-asset-preview"
                        src={asset.publicUrl}
                        alt={asset.fileName}
                      />
                      <div className="scenario-map-asset-meta">
                        <strong>{asset.fileName}</strong>
                        <span>{Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB</span>
                      </div>
                      <div className="scenario-map-asset-actions">
                        <button
                          type="button"
                          className={isSelected ? 'ghost small' : 'small'}
                          disabled={isDeleting}
                          onClick={() => applyMapAsset(asset)}
                      >
                        {isSelected ? '현재 맵' : '이 맵 적용'}
                      </button>
                      <button
                        type="button"
                        className="ghost small scenario-asset-delete-button"
                        disabled={isDeleting}
                        onClick={() => {
                          void handleDeleteMapAsset(asset);
                        }}
                      >
                        {isDeleting ? '삭제 중..' : '삭제'}
                      </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="scenario-map-asset-empty">
                업로드한 맵이 아직 없습니다. 자주 쓰는 전투 맵이나 배경 지도를 먼저 올려두면
                장면마다 바로 재사용할 수 있습니다.
              </div>
            )}
          </div>
          {monsterCatalogError ? <p className="panel-error">{monsterCatalogError}</p> : null}
          {itemCatalogError ? <p className="panel-error">{itemCatalogError}</p> : null}
          {node.vttMap ? (
            <>
              <BattleMapEditor
                map={node.vttMap}
                characters={[]}
                isHost
                onChange={updateNodeMap}
                title="Default map"
                showPartyTools={false}
                monsterCatalog={monsterCatalog}
                monsterCatalogError={monsterCatalogError}
                tokenAssets={tokenAssets}
                tokenAssetsLoading={tokenAssetsLoading}
                tokenAssetsError={tokenAssetsError}
                uploadTokenAsset={uploadTokenAsset}
                clueOptions={clueOptions}
                itemOptions={itemOptions}
                enableObjectEventEditing
              />
              <button
                type="button"
                className="ghost small"
                onClick={() => updateNode(node.id, (current) => ({ ...current, vttMap: null }))}
              >
                기본 맵 제거
              </button>
            </>
          ) : (
            <div className="scenario-node-map-empty">
              <span className="eyebrow">Default map</span>
              <strong>이 장면에는 아직 기본 맵이 없습니다.</strong>
              <button type="button" className="ghost small" onClick={enableNodeMap}>
                기본 맵 만들기
              </button>
            </div>
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
            {node.clues.filter((clue) => clue.revealMode === 'AUTO_REVEAL').length ? (
              <ul className="scenario-node-list">
                {node.clues
                  .filter((clue) => clue.revealMode === 'AUTO_REVEAL')
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
        <ScenarioNodeCollections
          node={node}
          nodes={nodes}
          scenarioNpcs={scenarioNpcs}
          updateNode={updateNode}
          onAddScenarioNpc={onAddScenarioNpc}
          onUpdateScenarioNpc={onUpdateScenarioNpc}
          onRemoveScenarioNpc={onRemoveScenarioNpc}
          onPlaceNpc={placeNpcOnMap}
        />
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const graphScale =
    viewportWidth > 24 && layout.width > viewportWidth
      ? Math.min(1, (viewportWidth - 24) / layout.width)
      : 1;
  const scaledWidth = Math.ceil(layout.width * graphScale);
  const scaledHeight = Math.ceil(layout.height * graphScale);

  useEffect(() => {
    const observedViewport = viewportRef.current;
    if (!observedViewport) return;

    setViewportWidth(observedViewport.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === 'number') {
        setViewportWidth(width);
      }
    });
    observer.observe(observedViewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="scenario-graph-viewport" ref={viewportRef}>
      <div className="scenario-graph-scale-frame" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          className="scenario-graph-canvas"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${graphScale})`,
          }}
        >
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
    </div>
  );
}

// 선택 노드로 들어오는 링크와 나가는 링크를 요약해 보여주는 컴포넌트입니다.
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

// 노드의 전환 링크, 판정 가이드, 단서 목록을 추가/수정/삭제하는 편집 컴포넌트입니다.
function ScenarioNodeCollections({
  node,
  nodes,
  scenarioNpcs,
  updateNode,
  onAddScenarioNpc,
  onUpdateScenarioNpc,
  onRemoveScenarioNpc,
  onPlaceNpc,
}: {
  node: NodeForm;
  nodes: NodeForm[];
  scenarioNpcs: NpcForm[];
  updateNode: (nodeId: string, updater: (node: NodeForm) => NodeForm) => void;
  onAddScenarioNpc: () => void;
  onUpdateScenarioNpc: (index: number, patch: Partial<NpcForm>) => void;
  onRemoveScenarioNpc: (index: number) => void;
  onPlaceNpc: (npcId: string) => void;
}) {
  function updateNpcAt(index: number, patch: Partial<NpcForm>) {
    onUpdateScenarioNpc(index, patch);
  }

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
            <div className="scenario-editor-item">
              <div className="field-row-3">
                <div>
                  <label>조건 조합</label>
                  <select
                    value={link.conditionRule.logic}
                    onChange={(event) =>
                      updateNode(node.id, (current) => ({
                        ...current,
                        links: current.links.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                conditionRule: {
                                  ...item.conditionRule,
                                  logic: event.target.value === 'ANY' ? 'ANY' : 'ALL',
                                },
                              }
                            : item
                        ),
                      }))
                    }
                  >
                    <option value="ALL">AND</option>
                    <option value="ANY">OR</option>
                  </select>
                </div>
                <div>
                  <label>조건 추가</label>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      updateNode(node.id, (current) => ({
                        ...current,
                        links: current.links.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                conditionRule: {
                                  ...item.conditionRule,
                                  requirements: [
                                    ...item.conditionRule.requirements,
                                    createTransitionRequirement('CLUE_REVEALED'),
                                  ],
                                },
                              }
                            : item
                        ),
                      }))
                    }
                  >
                    조건 추가
                  </button>
                </div>
              </div>
              {link.conditionRule.requirements.map((requirement, requirementIndex) => (
                <div className="field-row-3" key={requirement.id}>
                  <div>
                    <label>조건</label>
                    <select
                      value={requirement.type}
                      onChange={(event) =>
                        updateNode(node.id, (current) => ({
                          ...current,
                          links: current.links.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  conditionRule: {
                                    ...item.conditionRule,
                                    requirements: item.conditionRule.requirements.map((entry, entryIndex) =>
                                      entryIndex === requirementIndex
                                        ? {
                                            ...entry,
                                            type: event.target.value as TransitionConditionType,
                                            targetId: '',
                                            flagKey: '',
                                            flagValue: '',
                                          }
                                        : entry
                                    ),
                                  },
                                }
                              : item
                          ),
                        }))
                      }
                    >
                      {transitionConditionTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>대상</label>
                    {requirement.type === 'CLUE_REVEALED' ? (
                      <select
                        value={requirement.targetId}
                        onChange={(event) =>
                          updateNode(node.id, (current) => ({
                            ...current,
                            links: current.links.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    conditionRule: {
                                      ...item.conditionRule,
                                      requirements: item.conditionRule.requirements.map((entry, entryIndex) =>
                                        entryIndex === requirementIndex
                                          ? { ...entry, targetId: event.target.value }
                                          : entry
                                      ),
                                    },
                                  }
                                : item
                            ),
                          }))
                        }
                      >
                        <option value="">단서 선택</option>
                        {nodes.flatMap((candidateNode) =>
                          candidateNode.clues.map((clue) => (
                            <option key={`${candidateNode.id}:${clue.id}`} value={clue.id}>
                              {candidateNode.title || candidateNode.id} / {clue.title || clue.id}
                            </option>
                          ))
                        )}
                      </select>
                    ) : requirement.type === 'COMBAT_RESOLVED' || requirement.type === 'NODE_VISITED' ? (
                      <select
                        value={requirement.targetId}
                        onChange={(event) =>
                          updateNode(node.id, (current) => ({
                            ...current,
                            links: current.links.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    conditionRule: {
                                      ...item.conditionRule,
                                      requirements: item.conditionRule.requirements.map((entry, entryIndex) =>
                                        entryIndex === requirementIndex
                                          ? { ...entry, targetId: event.target.value }
                                          : entry
                                      ),
                                    },
                                  }
                                : item
                            ),
                          }))
                        }
                      >
                        <option value="">현재 노드</option>
                        {nodes.map((candidateNode) => (
                          <option key={candidateNode.id} value={candidateNode.id}>
                            {candidateNode.title || candidateNode.id}
                          </option>
                        ))}
                      </select>
                    ) : requirement.type === 'FLAG_SET' ? (
                      <input
                        value={requirement.flagKey}
                        placeholder="flag key"
                        onChange={(event) =>
                          updateNode(node.id, (current) => ({
                            ...current,
                            links: current.links.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    conditionRule: {
                                      ...item.conditionRule,
                                      requirements: item.conditionRule.requirements.map((entry, entryIndex) =>
                                        entryIndex === requirementIndex
                                          ? { ...entry, flagKey: event.target.value }
                                          : entry
                                      ),
                                    },
                                  }
                                : item
                            ),
                          }))
                        }
                      />
                    ) : (
                      <input value="-" disabled />
                    )}
                  </div>
                  <div>
                    <label>값 / 삭제</label>
                    {requirement.type === 'FLAG_SET' ? (
                      <>
                        <input
                          value={requirement.flagValue}
                          placeholder="비워두면 존재 여부"
                          onChange={(event) =>
                            updateNode(node.id, (current) => ({
                              ...current,
                              links: current.links.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      conditionRule: {
                                        ...item.conditionRule,
                                        requirements: item.conditionRule.requirements.map((entry, entryIndex) =>
                                          entryIndex === requirementIndex
                                            ? { ...entry, flagValue: event.target.value }
                                            : entry
                                        ),
                                      },
                                    }
                                  : item
                              ),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            updateNode(node.id, (current) => ({
                              ...current,
                              links: current.links.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      conditionRule: {
                                        ...item.conditionRule,
                                        requirements:
                                          item.conditionRule.requirements.length > 1
                                            ? item.conditionRule.requirements.filter(
                                                (_, entryIndex) => entryIndex !== requirementIndex
                                              )
                                            : [createTransitionRequirement('ALWAYS')],
                                      },
                                    }
                                  : item
                              ),
                            }))
                          }
                        >
                          조건 삭제
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() =>
                          updateNode(node.id, (current) => ({
                            ...current,
                            links: current.links.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    conditionRule: {
                                      ...item.conditionRule,
                                      requirements:
                                        item.conditionRule.requirements.length > 1
                                          ? item.conditionRule.requirements.filter(
                                              (_, entryIndex) => entryIndex !== requirementIndex
                                            )
                                          : [createTransitionRequirement('ALWAYS')],
                                    },
                                  }
                                : item
                            ),
                          }))
                        }
                      >
                        조건 삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
        title="판정 가이드"
        actionLabel="가이드 추가"
        onAdd={() =>
          updateNode(node.id, (current) => ({
            ...current,
            checkGuides: [...current.checkGuides, createBlankCheckGuide()],
          }))
        }
      >
        {node.checkGuides.map((guide, index) => (
          <article className="scenario-editor-item" key={guide.id}>
            <div className="field-row-3">
              <div>
                <label>표시 이름</label>
                <input
                  value={guide.label}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      checkGuides: current.checkGuides.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item
                      ),
                    }))
                  }
                  placeholder="예: 방을 수색한다"
                />
              </div>
              <div>
                <label>판정 유형</label>
                <input
                  value={guide.type}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      checkGuides: current.checkGuides.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, type: event.target.value } : item
                      ),
                    }))
                  }
                  placeholder="check"
                />
              </div>
              <div>
                <label>기술/능력</label>
                <input
                  value={guide.skill}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      checkGuides: current.checkGuides.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, skill: event.target.value } : item
                      ),
                    }))
                  }
                  placeholder="investigation"
                />
              </div>
            </div>
            <button
              type="button"
              className="ghost small"
              onClick={() =>
                updateNode(node.id, (current) => ({
                  ...current,
                  checkGuides: current.checkGuides.filter((_, itemIndex) => itemIndex !== index),
                }))
              }
            >
              가이드 삭제
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
              <option value="AUTO_REVEAL">AUTO_REVEAL - 노드 진입 시 자동 공개</option>
              <option value="PLAYER_ACTION">PLAYER_ACTION - 발견 행동 요청 시 공개</option>
              <option value="CHECK_SUCCESS">CHECK_SUCCESS - 판정 성공 시 공개</option>
              <option value="CHECK_PARTIAL">CHECK_PARTIAL - 실패해도 일부 공개</option>
              <option value="POST_COMBAT">POST_COMBAT - 전투 종료 후 공개</option>
              <option value="GM_APPROVAL">GM_APPROVAL - GM/백엔드 조건 승인</option>
            </select>

            <label>Reveal source</label>
            <textarea
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
              rows={3}
            />

            <div className="field-row">
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
      <NodeCollection
        title="시나리오 NPC"
        actionLabel="NPC 추가"
        onAdd={onAddScenarioNpc}
      >
        {scenarioNpcs.map((npc, index) => {
          const placedTokenCount =
            node.vttMap?.tokens.filter((token) => token.npcId === npc.id).length ?? 0;
          const isFeaturedInNode = node.npcIds.includes(npc.id) || placedTokenCount > 0;

          return (
            <article className="scenario-editor-item" key={npc.id}>
              <div className="field-row">
                <div>
                  <label>Name</label>
                  <input
                    value={npc.name}
                    onChange={(event) => updateNpcAt(index, { name: event.target.value })}
                    placeholder="Innkeeper, guard captain, merchant"
                  />
                </div>
                <div>
                  <label>Disposition</label>
                  <select
                    value={npc.disposition}
                    onChange={(event) =>
                      updateNpcAt(index, { disposition: event.target.value as NpcDisposition })
                    }
                  >
                    <option value="friendly">Friendly</option>
                    <option value="neutral">Neutral</option>
                    <option value="hostile">Hostile</option>
                  </select>
                </div>
              </div>

              <label>Short summary</label>
              <input
                value={npc.shortDescription}
                onChange={(event) => updateNpcAt(index, { shortDescription: event.target.value })}
                placeholder="Gruff but helpful stable owner"
              />

              <label>Description</label>
              <textarea
                value={npc.description}
                onChange={(event) => updateNpcAt(index, { description: event.target.value })}
                rows={3}
                placeholder="What players can notice or learn about this NPC"
              />

              <label>Token image URL</label>
              <input
                value={npc.imageUrl}
                onChange={(event) => updateNpcAt(index, { imageUrl: event.target.value })}
                placeholder="Optional token portrait URL"
              />

              <div className="vtt-check-row">
                <label>
                  <input
                    type="checkbox"
                    checked={npc.isVisible}
                    onChange={(event) => updateNpcAt(index, { isVisible: event.target.checked })}
                  />
                  Visible to players
                </label>
              </div>

              <div className="vtt-check-row">
                <label>
                  <input
                    type="checkbox"
                    checked={isFeaturedInNode}
                    onChange={(event) =>
                      updateNode(node.id, (current) => ({
                        ...current,
                        npcIds: event.target.checked
                          ? Array.from(new Set([...current.npcIds, npc.id]))
                          : current.npcIds.filter((npcId) => npcId !== npc.id),
                        vttMap: event.target.checked
                          ? current.vttMap
                          : removeNpcFromMap(current.vttMap, npc.id),
                      }))
                    }
                  />
                  이 노드에 등장
                </label>
              </div>

              <div className="scenario-map-asset-actions">
                <button
                  type="button"
                  className="small"
                  disabled={!node.vttMap}
                  onClick={() => onPlaceNpc(npc.id)}
                >
                  {!node.vttMap
                    ? '맵 없음'
                    : placedTokenCount
                      ? `맵에 추가 배치 (${placedTokenCount})`
                      : '맵에 배치'}
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => onRemoveScenarioNpc(index)}
                >
                  NPC 삭제
                </button>
              </div>
            </article>
          );
        })}
      </NodeCollection>
    </div>
  );
}

// 링크/판정 가이드/단서 같은 반복 편집 목록의 공통 카드 레이아웃입니다.
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
