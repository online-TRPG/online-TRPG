import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Layer, Rect } from 'react-konva';
import type {
  ScenarioAssetResponseDto,
  SrdMonsterReferenceDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { BattleMapBackgroundLayer } from './BattleMapBackgroundLayer';
import type { BattleMapGridLine } from './BattleMapBackgroundLayer';
import { BattleMapCanvas } from './BattleMapCanvas';
import {
  BattleMapEditorToolbarControls,
  buildBattleMapEditorSubtoolbarControls,
} from './BattleMapEditorControls';
import { BattleMapEditorStructureLayer } from './BattleMapEditorStructureLayer';
import { BattleMapFogLayer } from './BattleMapFogLayer';
import { BattleMapFogInspector } from './BattleMapFogInspector';
import { BattleMapMeasureOverlay } from './BattleMapMeasureOverlay';
import { BattleMapObjectMarkerLayer } from './BattleMapObjectMarkerLayer';
import { BattleMapPingMarkers } from './BattleMapPingMarkers';
import type { BattleMapPingMarker } from './BattleMapPingMarkers';
import { BattleMapRangeOverlayLayer } from './BattleMapRangeOverlayLayer';
import { BattleMapSessionObstacleLayer } from './BattleMapSessionObstacleLayer';
import { BattleMapStageFrame } from './BattleMapStageFrame';
import { BattleMapStartingPositionLayer } from './BattleMapStartingPositionLayer';
import { BattleMapStructureInspector } from './BattleMapStructureInspector';
import { BattleMapSubtoolbar } from './BattleMapSubtoolbar';
import { BattleMapTokenLayer } from './BattleMapTokenLayer';
import { BattleMapTokenInspector } from './BattleMapTokenInspector';
import { BattleMapToolbar } from './BattleMapToolbar';
import { BattleMapTokenMovePreview } from './BattleMapTokenMovePreview';
import type { BattleMapTokenDragMeasure } from './BattleMapTokenMovePreview';
import { BattleMapVisionMaskLayer } from './BattleMapVisionMaskLayer';
import { BattleMapWorkspace } from './BattleMapWorkspace';
import {
  computeVisibleVisionCells,
  getVisionGridIndex,
} from './battleMapVision';
import type { TokenHealthFrame } from './TokenFrame';
import { useBattleMapPointerInput } from './useBattleMapPointerInput';
import { useCanvasImage } from './useCanvasImage';
import type { Character } from '../../types/session';
import {
  MONSTER_TOKEN_COLOR,
  NPC_TOKEN_COLOR,
  getPlayerTokenColor,
} from '../../utils/sessionTokenColors';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';
import { getCharacterImage } from '../../features/sessionPlay/utils/characterVisuals';

export interface BattleMapProps {
  map: VttMapStateDto;
  characters: Character[];
  isHost: boolean;
  onChange: (map: VttMapStateDto) => void;
  currentUserId?: string | null;
  title?: string;
  interactionMode?: 'editor' | 'session';
  showPartyTools?: boolean;
  monsterCatalog?: SrdMonsterReferenceDto[];
  monsterCatalogError?: string | null;
  tokenAssets?: ScenarioAssetResponseDto[];
  tokenAssetsLoading?: boolean;
  tokenAssetsError?: string | null;
  uploadTokenAsset?: (file: File | null) => Promise<ScenarioAssetResponseDto | null>;
  clueOptions?: Array<{ id: string; label: string }>;
  itemOptions?: Array<{ id: string; label: string }>;
  enableObjectEventEditing?: boolean;
  onSelectionChange?: (selection: BattleMapSelection | null) => void;
  isInteractionLocked?: boolean;
  tokenMovementRangeFtByTokenId?: Record<string, number>;
  controllableTokenIds?: string[];
  tokenHealthByTokenId?: Record<string, TokenHealthFrame>;
  attackRangeOverlay?: { tokenId: string; rangeFt: number } | null;
  combatMovementMode?: CombatMovementMode;
  showHiddenContent?: boolean;
  showPlayerVisionPreview?: boolean;
  onTokenMoveRequest?: (
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode?: CombatMovementMode
  ) => Promise<VttMapStateDto | null>;
  onPingRequest?: (point: { x: number; y: number }, label?: string) => Promise<VttMapStateDto | null>;
}

export type BattleMapSelection =
  | {
      kind: 'token';
      token: VttMapStateDto['tokens'][number];
      character: Character | null;
      point: { x: number; y: number };
      tile: { column: number; row: number };
    }
  | {
      kind: 'tile';
      point: { x: number; y: number };
      tile: { column: number; row: number };
    }
  | {
      kind: 'terrain' | 'wall' | 'door' | 'object';
      cell:
        | NonNullable<VttMapStateDto['terrainCells']>[number]
        | NonNullable<VttMapStateDto['wallCells']>[number]
        | NonNullable<VttMapStateDto['doorCells']>[number]
        | NonNullable<VttMapStateDto['objectCells']>[number];
      point: { x: number; y: number };
      tile: { column: number; row: number };
    };

type MapStructureKind = 'terrain' | 'wall' | 'door' | 'object';
type CombatMovementMode = 'normal' | 'jump';

type MapStructureSelection = {
  kind: MapStructureKind;
  id: string;
};

const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const feetPerGrid = 5;
const jumpExtraMovementFt = 10;
const playerVisionRangeFt = 40;
const mapText = {
  tokenCount: (count: number) => '\uD1A0\uD070 ' + count + '\uAC1C',
  syncParty: '\uD30C\uD2F0 \uD1A0\uD070 \uB3D9\uAE30\uD654',
  monsterSearchPlaceholder: 'SRD \uBAAC\uC2A4\uD130 \uAC80\uC0C9',
  unknownCr: 'CR \uBBF8\uC0C1',
  noMonsterOptions: '\uC120\uD0DD \uAC00\uB2A5\uD55C \uBAAC\uC2A4\uD130 \uC5C6\uC74C',
  addMonster: '\uBAAC\uC2A4\uD130 \uCD94\uAC00',
  pan: '\uC774\uB3D9',
  measure: '\uAC70\uB9AC \uCE21\uC815',
  ping: '\uD551',
  fog: '\uC548\uAC1C',
  terrain: '지형',
  wall: '벽',
  door: '문',
  object: '오브젝트',
  hideAll: '\uC804\uCCB4 \uAC00\uB9AC\uAE30',
  reset: '\uCD08\uAE30\uD654',
  width: '\uAC00\uB85C',
  height: '\uC138\uB85C',
  grid: '\uACA9\uC790',
  clearMeasure: '\uCE21\uC815 \uC9C0\uC6B0\uAE30',
  tokenSnap: '\uD1A0\uD070 \uACA9\uC790 \uC2A4\uB0C5',
  reveal: '\uB4DC\uB7EC\uB0B4\uAE30',
  hide: '\uAC00\uB9AC\uAE30',
  snap: '\uC2A4\uB0C5',
  revealAll: '\uC804\uCCB4 \uACF5\uAC1C',
  token: '\uD1A0\uD070',
  close: '\uB2EB\uAE30',
  name: '\uC774\uB984',
  imageUrl: '\uC774\uBBF8\uC9C0 URL',
  size: '\uD06C\uAE30',
  hidden: '\uC228\uAE40',
  hostile: '\uC801\uB300\uC801',
  encounterScaling: '인원수 조정',
  basePartySize: '기준 인원',
  fixedEncounterToken: '고정 몬스터',
  scalingPriority: '유지 우선순위',
  srdMonster: 'SRD \uBAAC\uC2A4\uD130',
  speed: '\uC18D\uB3C4',
  senses: '\uAC10\uC9C0',
  languages: '\uC5B8\uC5B4',
  traits: '\uD2B9\uC131',
  actions: '\uD589\uB3D9',
  legendaryActions: '\uC804\uC124 \uD589\uB3D9',
  duplicate: '\uBCF5\uC81C',
  front: '\uC55E\uC73C\uB85C',
  back: '\uB4A4\uB85C',
  deleteToken: '\uD1A0\uD070 \uC0AD\uC81C',
  fogLabel: '\uC548\uAC1C',
  deleteFog: '\uC548\uAC1C \uC0AD\uC81C',
  mapFeature: '맵 구조',
  deleteFeature: '구조 삭제',
  description: '설명',
  terrainEffect: '지형 효과',
  doorState: '문 상태',
  keyItem: '열쇠 아이템 ID',
  canBreak: '파괴 가능',
  breakDc: '파괴 DC',
  visibleToPlayers: '플레이어에게 공개',
  linkedClues: '숨겨진 단서',
  linkedItems: '숨겨진 아이템',
  hazard: '위험 요소',
  hazardEnabled: '함정/매복으로 사용',
  hazardKind: '위험 종류',
  hazardTrap: '함정',
  hazardAmbush: '매복',
  hazardGeneric: '위험',
  hazardRadius: '탐지 반경(칸)',
  hazardDc: '탐지 DC',
  hazardLinkedClues: '탐지 성공 단서',
  hazardTriggerOnce: '1회만 성공 처리',
  hazardResetState: '탐지 기록 초기화',
  fogRevealEvent: '근접 안개 해제',
  eventName: '이벤트 이름',
  triggerDistance: '발동 거리(ft)',
  revealRadius: '해제 반경(ft)',
  triggerOnce: '1회만 발동',
  addFogEvent: '안개 해제 이벤트 추가',
  removeEvent: '이벤트 삭제',
} as const;

type MeasurePoint = { x: number; y: number };
type PingMarker = BattleMapPingMarker;
type FogAction = 'reveal' | 'hide';
type FogRect = VttMapStateDto['fogRects'][number];
type FogBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;
type StructureBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;
type TokenPathCell = { x: number; y: number; blocked: boolean };
type TokenMovementPath = {
  cells: TokenPathCell[];
  blocked: boolean;
  distanceFt: number;
  extraCostFt: number;
};
type TokenDragMeasure = BattleMapTokenDragMeasure;
type StartingPosition = NonNullable<VttMapStateDto['startingPositions']>[number];
type MapSizeField = 'width' | 'height' | 'gridSize';
type ScenarioAsset = ScenarioAssetResponseDto;
type RectBlocker = { x: number; y: number; width: number; height: number; tokenId?: string };
type BlockerIndex = Map<string, RectBlocker[]>;
type ObjectCell = NonNullable<VttMapStateDto['objectCells']>[number];
type ObjectShapeCell = NonNullable<ObjectCell['shapeCells']>[number];
type ObjectEvent = NonNullable<ObjectCell['events']>[number];
type ObjectHazard = NonNullable<ObjectCell['hazard']>;
type ObjectRevealCheck = NonNullable<ObjectCell['revealChecks']>[number];
type StoredExploredVisionCells = {
  width: number;
  height: number;
  gridSize: number;
  cells: string[];
};

function shouldLogBattleMapPerf() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return window.localStorage.getItem('trpg:debug:battle-map-perf') === '1';
}

function measureBattleMapPerf<T>(label: string, callback: () => T, detail?: () => string): T {
  if (!shouldLogBattleMapPerf() || typeof performance === 'undefined') {
    return callback();
  }

  const start = performance.now();
  const result = callback();
  const duration = performance.now() - start;
  if (duration >= 1) {
    const suffix = detail ? ` ${detail()}` : '';
    console.debug(`[battle-map] ${label}: ${duration.toFixed(2)}ms${suffix}`);
  }
  return result;
}

function getExploredVisionStorageKey(map: VttMapStateDto, currentUserId: string | null | undefined) {
  return ['trpg', 'battle-map', 'explored-vision', currentUserId || 'anonymous', map.id].join(':');
}

function loadExploredVisionCells(storageKey: string, map: VttMapStateDto) {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as Partial<StoredExploredVisionCells>;
    if (
      parsed.width !== map.width ||
      parsed.height !== map.height ||
      parsed.gridSize !== map.gridSize ||
      !Array.isArray(parsed.cells)
    ) {
      return new Set<string>();
    }
    return new Set(parsed.cells.filter((cell): cell is string => typeof cell === 'string'));
  } catch {
    return new Set<string>();
  }
}

function saveExploredVisionCells(storageKey: string, map: VttMapStateDto, cells: Set<string>) {
  if (typeof window === 'undefined') return;

  const payload: StoredExploredVisionCells = {
    width: map.width,
    height: map.height,
    gridSize: map.gridSize,
    cells: Array.from(cells),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // localStorage may be full or unavailable; the current in-memory exploration state still works.
  }
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getRectCellKeys(rect: RectBlocker, map: Pick<VttMapStateDto, 'width' | 'height' | 'gridSize'>) {
  const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
  const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
  const minColumn = Math.max(0, Math.floor(rect.x / map.gridSize));
  const maxRectColumn = Math.min(maxColumn, Math.ceil((rect.x + rect.width) / map.gridSize) - 1);
  const minRow = Math.max(0, Math.floor(rect.y / map.gridSize));
  const maxRectRow = Math.min(maxRow, Math.ceil((rect.y + rect.height) / map.gridSize) - 1);
  const keys: string[] = [];

  for (let row = minRow; row <= maxRectRow; row += 1) {
    for (let column = minColumn; column <= maxRectColumn; column += 1) {
      keys.push(`${column}:${row}`);
    }
  }
  return keys;
}

function buildBlockerIndex(
  blockers: RectBlocker[],
  map: Pick<VttMapStateDto, 'width' | 'height' | 'gridSize'>
) {
  const index: BlockerIndex = new Map();
  blockers.forEach((blocker) => {
    getRectCellKeys(blocker, map).forEach((key) => {
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(blocker);
      } else {
        index.set(key, [blocker]);
      }
    });
  });
  return index;
}

function indexedBlockersOverlap(
  rect: RectBlocker,
  index: BlockerIndex,
  map: VttMapStateDto,
  options: { ignoreTokenId?: string } = {}
) {
  const candidates = new Set<RectBlocker>();
  getRectCellKeys(rect, map).forEach((key) => {
    index.get(key)?.forEach((blocker) => candidates.add(blocker));
  });
  for (const blocker of candidates) {
    if (blocker.tokenId && blocker.tokenId === options.ignoreTokenId) continue;
    if (rectsOverlap(rect, blocker)) return true;
  }
  return false;
}

function isVisionPointVisible(
  point: MeasurePoint,
  map: VttMapStateDto,
  visibleVisionCells: Set<string> | null
) {
  if (!visibleVisionCells) return true;
  const column = getVisionGridIndex(point.x, map.gridSize, map.width);
  const row = getVisionGridIndex(point.y, map.gridSize, map.height);
  return visibleVisionCells.has(`${column}:${row}`);
}

function getBattleTokenColor(
  token: VttMapStateDto['tokens'][number],
  characters: Character[]
): SessionTokenColor {
  if (token.sessionCharacterId) {
    const characterIndex = characters.findIndex(
      (character) => character.id === token.sessionCharacterId
    );
    return getPlayerTokenColor(characterIndex);
  }

  if (token.monster || token.isHostile) {
    return MONSTER_TOKEN_COLOR;
  }

  // 현재 VTT 토큰에는 NPC 세부 분류가 없어서, 플레이어/몬스터가 아닌 토큰은 NPC 색으로 묶습니다.
  return NPC_TOKEN_COLOR;
}

function snapToGrid(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getGridIndex(value: number, gridSize: number, maxSize: number) {
  return Math.floor(clamp(value, 0, Math.max(0, maxSize - 1)) / gridSize);
}

function getGridLineCells(
  from: { x: number; y: number },
  to: { x: number; y: number },
  map: VttMapStateDto
) {
  const startColumn = getGridIndex(from.x, map.gridSize, map.width);
  const startRow = getGridIndex(from.y, map.gridSize, map.height);
  const endColumn = getGridIndex(to.x, map.gridSize, map.width);
  const endRow = getGridIndex(to.y, map.gridSize, map.height);
  const cells: Array<{ column: number; row: number }> = [];
  let column = startColumn;
  let row = startRow;
  const dx = Math.abs(endColumn - startColumn);
  const dy = Math.abs(endRow - startRow);
  const sx = startColumn < endColumn ? 1 : -1;
  const sy = startRow < endRow ? 1 : -1;
  let error = dx - dy;

  while (true) {
    cells.push({ column, row });
    if (column === endColumn && row === endRow) break;
    const doubledError = error * 2;
    if (doubledError > -dy) {
      error -= dy;
      column += sx;
    }
    if (doubledError < dx) {
      error += dx;
      row += sy;
    }
  }

  return cells;
}

function getMonsterDisplayName(monster: SrdMonsterReferenceDto) {
  return monster.nameKo?.trim() || monster.nameEn;
}

function getDefaultStartingPosition(index: number, map: VttMapStateDto): StartingPosition {
  const columns = 4;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    id: `start:${index + 1}`,
    label: `P${index + 1}`,
    x: clamp(map.gridSize * (2 + column), 0, map.width - map.gridSize),
    y: clamp(map.height - map.gridSize * (3 - row), 0, map.height - map.gridSize),
  };
}

function formatDistance(from: MeasurePoint, to: MeasurePoint, gridSize: number) {
  const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceFt = Math.round((distancePx / gridSize) * feetPerGrid);
  return `${distanceFt} ft`;
}

function getGridMovementDistanceFt(
  from: { x: number; y: number },
  to: { x: number; y: number },
  map: VttMapStateDto
) {
  const fromColumn = getGridIndex(from.x, map.gridSize, map.width);
  const fromRow = getGridIndex(from.y, map.gridSize, map.height);
  const toColumn = getGridIndex(to.x, map.gridSize, map.width);
  const toRow = getGridIndex(to.y, map.gridSize, map.height);
  return Math.max(Math.abs(toColumn - fromColumn), Math.abs(toRow - fromRow)) * feetPerGrid;
}

function isGridRangeWithin(
  from: MeasurePoint,
  to: MeasurePoint,
  map: VttMapStateDto,
  rangeFt: number
) {
  return getGridMovementDistanceFt(from, to, map) <= rangeFt;
}

function formatGridDistance(from: MeasurePoint, to: MeasurePoint, map: VttMapStateDto) {
  return `${getGridMovementDistanceFt(from, to, map)} ft`;
}

function formatTokenMovementPathCost(path: TokenMovementPath) {
  if (path.extraCostFt > 0) {
    return `${path.distanceFt} ft + ${path.extraCostFt} ft`;
  }
  return `${path.distanceFt} ft`;
}

function appendTokenRoutePoint(
  route: Array<{ x: number; y: number }>,
  point: { x: number; y: number }
) {
  const last = route[route.length - 1];
  if (last && last.x === point.x && last.y === point.y) {
    return route;
  }
  return [...route, { x: point.x, y: point.y }];
}

function expandTokenRoute(
  route: Array<{ x: number; y: number }>,
  map: VttMapStateDto
) {
  if (route.length <= 1) {
    return route;
  }
  return route.reduce<Array<{ x: number; y: number }>>((expanded, point) => {
    const last = expanded[expanded.length - 1];
    if (!last) {
      return [point];
    }
    const segment = getGridLineCells(last, point, map)
      .slice(1)
      .map((cell) => ({
        x: clamp(cell.column * map.gridSize, 0, map.width - map.gridSize),
        y: clamp(cell.row * map.gridSize, 0, map.height - map.gridSize),
      }));
    for (const entry of segment) {
      const previous = expanded[expanded.length - 1];
      if (!previous || previous.x !== entry.x || previous.y !== entry.y) {
        expanded.push(entry);
      }
    }
    return expanded;
  }, []);
}

function compactTokenRoute(
  route: Array<{ x: number; y: number }>,
  map: VttMapStateDto
) {
  const compacted: Array<{ x: number; y: number }> = [];
  for (const point of route) {
    const previous = compacted[compacted.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      compacted.push(point);
    }
  }
  let index = 1;
  while (index < compacted.length - 1) {
    const before = compacted[index - 1];
    const current = compacted[index];
    const after = compacted[index + 1];
    const directDistance = getGridMovementDistanceFt(before, after, map);
    const viaDistance =
      getGridMovementDistanceFt(before, current, map) +
      getGridMovementDistanceFt(current, after, map);
    if (directDistance < viaDistance) {
      compacted.splice(index, 1);
      index = Math.max(1, index - 1);
      continue;
    }
    index += 1;
  }
  return compacted;
}

function normalizeFogBox(
  from: MeasurePoint,
  to: MeasurePoint,
  map: VttMapStateDto,
  snap: boolean
): FogBox | null {
  const rawLeft = clamp(Math.min(from.x, to.x), 0, map.width);
  const rawTop = clamp(Math.min(from.y, to.y), 0, map.height);
  const rawRight = clamp(Math.max(from.x, to.x), 0, map.width);
  const rawBottom = clamp(Math.max(from.y, to.y), 0, map.height);

  const left = snap
    ? clamp(Math.floor(rawLeft / map.gridSize) * map.gridSize, 0, map.width)
    : rawLeft;
  const top = snap
    ? clamp(Math.floor(rawTop / map.gridSize) * map.gridSize, 0, map.height)
    : rawTop;
  const right = snap
    ? clamp(Math.ceil(rawRight / map.gridSize) * map.gridSize, 0, map.width)
    : rawRight;
  const bottom = snap
    ? clamp(Math.ceil(rawBottom / map.gridSize) * map.gridSize, 0, map.height)
    : rawBottom;

  if (right - left < 4 || bottom - top < 4) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function subtractFogBox(rect: FogRect, cut: FogBox): FogRect[] {
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const cutRight = cut.x + cut.width;
  const cutBottom = cut.y + cut.height;
  const left = Math.max(rect.x, cut.x);
  const top = Math.max(rect.y, cut.y);
  const right = Math.min(rectRight, cutRight);
  const bottom = Math.min(rectBottom, cutBottom);

  if (left >= right || top >= bottom) return [rect];

  const pieces: FogRect[] = [
    { ...rect, id: `${rect.id}:top:${Date.now()}`, height: top - rect.y },
    { ...rect, id: `${rect.id}:bottom:${Date.now()}`, y: bottom, height: rectBottom - bottom },
    {
      ...rect,
      id: `${rect.id}:left:${Date.now()}`,
      y: top,
      width: left - rect.x,
      height: bottom - top,
    },
    {
      ...rect,
      id: `${rect.id}:right:${Date.now()}`,
      x: right,
      y: top,
      width: rectRight - right,
      height: bottom - top,
    },
  ];

  return pieces.filter((piece) => piece.width > 0 && piece.height > 0);
}

export function BattleMap({
  map,
  characters,
  isHost,
  onChange,
  currentUserId = null,
  title = 'Tabletop',
  interactionMode = 'editor',
  showPartyTools = true,
  monsterCatalog = [],
  monsterCatalogError = null,
  tokenAssets = [],
  tokenAssetsLoading = false,
  tokenAssetsError = null,
  uploadTokenAsset,
  clueOptions = [],
  itemOptions = [],
  enableObjectEventEditing = false,
  onSelectionChange,
  isInteractionLocked = false,
  tokenMovementRangeFtByTokenId,
  controllableTokenIds,
  tokenHealthByTokenId,
  attackRangeOverlay = null,
  combatMovementMode = 'normal',
  showHiddenContent = false,
  showPlayerVisionPreview = false,
  onTokenMoveRequest,
  onPingRequest,
}: BattleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [containerHeight, setContainerHeight] = useState(720);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFogMode, setFogMode] = useState(false);
  const [isPanMode, setPanMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedFogId, setSelectedFogId] = useState<string | null>(null);
  const [isMeasureMode, setMeasureMode] = useState(false);
  const [isPingMode, setPingMode] = useState(false);
  const [isTokenSnapEnabled, setTokenSnapEnabled] = useState(true);
  const [fogAction, setFogAction] = useState<FogAction>('reveal');
  const [isFogSnapEnabled, setFogSnapEnabled] = useState(true);
  const [fogDragStart, setFogDragStart] = useState<MeasurePoint | null>(null);
  const [fogDraft, setFogDraft] = useState<FogBox | null>(null);
  const [structureDragStart, setStructureDragStart] = useState<{
    kind: MapStructureKind;
    point: MeasurePoint;
    mode?: 'create' | 'extend';
    targetObjectId?: string;
  } | null>(null);
  const [structureDraft, setStructureDraft] = useState<{
    kind: MapStructureKind;
    box: StructureBox;
  } | null>(null);
  const [measureStart, setMeasureStart] = useState<MeasurePoint | null>(null);
  const [measureEnd, setMeasureEnd] = useState<MeasurePoint | null>(null);
  const [measurePreview, setMeasurePreview] = useState<MeasurePoint | null>(null);
  const [tokenDragMeasure, setTokenDragMeasure] = useState<TokenDragMeasure | null>(null);
  const tokenDragMeasureRef = useRef<TokenDragMeasure | null>(null);
  const tokenDragFrameRef = useRef<number | null>(null);
  const tokenPathCacheRef = useRef<Map<string, TokenMovementPath>>(new Map());
  const [pings, setPings] = useState<PingMarker[]>([]);
  const [pingClock, setPingClock] = useState(Date.now());
  const exploredVisionStorageKey = useMemo(
    () => getExploredVisionStorageKey(map, currentUserId),
    [currentUserId, map.id]
  );
  const [exploredVisionCells, setExploredVisionCells] = useState<Set<string>>(() =>
    loadExploredVisionCells(exploredVisionStorageKey, map)
  );
  const [monsterSearch, setMonsterSearch] = useState('');
  const canEditMap = isHost && interactionMode === 'editor';
  const canSeeHiddenContent = canEditMap || showHiddenContent;
  const showMapChrome = interactionMode === 'editor';
  const showSessionViewControls = interactionMode === 'session';
  const [selectedMonsterId, setSelectedMonsterId] = useState('');
  const [mapStructureTool, setMapStructureTool] = useState<MapStructureKind | null>(null);
  const [selectedMapStructure, setSelectedMapStructure] = useState<MapStructureSelection | null>(
    null
  );
  const [tokenAssetUploadBusy, setTokenAssetUploadBusy] = useState(false);
  const [mapSizeDraft, setMapSizeDraft] = useState({
    width: String(map.width),
    height: String(map.height),
    gridSize: String(map.gridSize),
  });
  const mapImage = useCanvasImage(map.imageUrl);
  const visibleTokens = useMemo(
    () => map.tokens.filter((token) => canSeeHiddenContent || !token.hidden),
    [canSeeHiddenContent, map.tokens]
  );
  const displayWidth = Math.max(280, containerWidth);
  const widthScale = displayWidth / map.width;
  const availableHeight = Math.max(320, containerHeight);
  const heightScale = availableHeight / map.height;
  const baseScale = Math.min(widthScale, heightScale);
  const scale = baseScale * zoom;
  const displayHeight = Math.max(320, Math.floor(map.height * baseScale));
  const selectedToken = map.tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedFog = map.fogRects.find((rect) => rect.id === selectedFogId) ?? null;
  const terrainCells = map.terrainCells ?? [];
  const wallCells = map.wallCells ?? [];
  const doorCells = map.doorCells ?? [];
  const objectCells = map.objectCells ?? [];
  const visibleObjectCells = canSeeHiddenContent
    ? objectCells
    : objectCells.filter((cell) => cell.visibleToPlayers !== false);
  const detectedHazardCells = useMemo(
    () =>
      visibleObjectCells.filter((cell) =>
        canSeeHiddenContent ? isArmedHazardCell(cell) : isDetectedHazardCell(cell)
      ),
    [canSeeHiddenContent, visibleObjectCells]
  );
  const observedObjectCells = useMemo(
    () =>
      visibleObjectCells.filter((cell) =>
        canSeeHiddenContent ? !isArmedHazardCell(cell) : isObservedObjectCell(cell)
      ),
    [canSeeHiddenContent, visibleObjectCells]
  );
  const selectedMapStructureCell =
    selectedMapStructure?.kind === 'terrain'
      ? (terrainCells.find((cell) => cell.id === selectedMapStructure.id) ?? null)
      : selectedMapStructure?.kind === 'wall'
        ? (wallCells.find((cell) => cell.id === selectedMapStructure.id) ?? null)
        : selectedMapStructure?.kind === 'door'
          ? (doorCells.find((cell) => cell.id === selectedMapStructure.id) ?? null)
          : selectedMapStructure?.kind === 'object'
            ? (objectCells.find((cell) => cell.id === selectedMapStructure.id) ?? null)
            : null;
  const startingPositions = map.startingPositions ?? [];
  const filteredMonsterCatalog = useMemo(() => {
    const keyword = monsterSearch.trim().toLowerCase();
    if (!keyword) return monsterCatalog;
    return monsterCatalog.filter((monster) =>
      [monster.id, monster.nameEn, monster.nameKo ?? ''].some((value) =>
        value.toLowerCase().includes(keyword)
      )
    );
  }, [monsterCatalog, monsterSearch]);
  const selectedMonster =
    filteredMonsterCatalog.find((monster) => monster.id === selectedMonsterId) ??
    monsterCatalog.find((monster) => monster.id === selectedMonsterId) ??
    filteredMonsterCatalog[0] ??
    monsterCatalog[0] ??
    null;
  const controlledTokenIds = useMemo(
    () =>
      new Set(
        characters
          .filter((character) => character.userId === currentUserId)
          .map((character) => character.id)
      ),
    [characters, currentUserId]
  );
  const explicitControllableTokenIds = useMemo(
    () => new Set(controllableTokenIds ?? []),
    [controllableTokenIds]
  );
  const hasExplicitControllableTokens = controllableTokenIds !== undefined;
  const isVisionMaskEnabled = interactionMode === 'session' && !showHiddenContent;
  const shouldComputePlayerVisionCells =
    interactionMode === 'session' && (isVisionMaskEnabled || showPlayerVisionPreview);
  const movementBlockerIndex = useMemo(
    () =>
      buildBlockerIndex(
        [
          ...terrainCells.filter((cell) => !cell.terrainEffectId),
          ...wallCells,
          ...doorCells.filter((door) => door.state !== 'open' && door.state !== 'broken'),
        ],
        map
      ),
    [doorCells, map.gridSize, map.height, map.width, terrainCells, wallCells]
  );
  const tokenOccupancyBlockerIndex = useMemo(
    () =>
      buildBlockerIndex(
        map.tokens
          .filter((token) => token.hidden !== true)
          .map((token) => ({
            x: token.x,
            y: token.y,
            width: token.size,
            height: token.size,
            tokenId: token.id,
          })),
        map
      ),
    [map]
  );
  const partyCharacterIds = useMemo(
    () => new Set(characters.map((character) => character.id)),
    [characters]
  );
  const playerVisionCells = useMemo(
    () => {
      if (!shouldComputePlayerVisionCells) return null;

      const tokenSources = map.tokens
        .filter(
          (token) =>
            token.hidden !== true &&
            token.sessionCharacterId &&
            partyCharacterIds.has(token.sessionCharacterId) &&
            token.isHostile !== true
        )
        .map((token) => ({
          x: token.x + token.size / 2,
          y: token.y + token.size / 2,
        }));
      const lightSources = (map.lightSources ?? []).map((light) => ({
        x: light.x + map.gridSize / 2,
        y: light.y + map.gridSize / 2,
        rangeFt: light.rangeFt,
      }));

      const sources = [...tokenSources, ...lightSources];
      return measureBattleMapPerf(
        'vision cells',
        () =>
          computeVisibleVisionCells({
            map,
            sources,
            rangeFt: playerVisionRangeFt,
          }),
        () => `sources=${sources.length}`
      );
    },
    [shouldComputePlayerVisionCells, map, partyCharacterIds]
  );
  const visibleVisionCells = isVisionMaskEnabled ? playerVisionCells : null;
  const activeMeasureEnd = measureEnd ?? measurePreview;
  const selectedJumpMovementToken =
    selectedToken &&
    canControlToken(selectedToken) &&
    (tokenMovementRangeFtByTokenId?.[selectedToken.id] ?? 0) > 0
      ? selectedToken
      : null;
  const activeJumpMovementToken =
    combatMovementMode === 'jump'
      ? (visibleTokens.find((token) => {
          return canControlToken(token) && (tokenMovementRangeFtByTokenId?.[token.id] ?? 0) > 0;
        }) ?? null)
      : null;
  const movementRangeToken =
    combatMovementMode === 'jump'
      ? (selectedJumpMovementToken ?? activeJumpMovementToken)
      : selectedToken;
  const movementRangeCharacter = movementRangeToken?.sessionCharacterId
    ? (characters.find((character) => character.id === movementRangeToken.sessionCharacterId) ?? null)
    : null;
  const tokenMovementRangeFt =
    movementRangeToken && tokenMovementRangeFtByTokenId?.[movementRangeToken.id] !== undefined
      ? Math.max(0, tokenMovementRangeFtByTokenId[movementRangeToken.id])
      : movementRangeCharacter?.speed;
  const displayedTokenMovementRangeFt =
    tokenMovementRangeFt === undefined
      ? undefined
      : combatMovementMode === 'jump'
        ? Math.max(0, tokenMovementRangeFt - jumpExtraMovementFt)
        : tokenMovementRangeFt;
  const attackRangeOverlayToken =
    attackRangeOverlay && attackRangeOverlay.rangeFt > 0
      ? (map.tokens.find((token) => token.id === attackRangeOverlay.tokenId) ?? null)
      : null;
  const visibleTokensForDisplay = useMemo(
    () =>
      visibleTokens.filter((token) =>
        isVisionPointVisible(
          {
            x: token.x + token.size / 2,
            y: token.y + token.size / 2,
          },
          map,
          visibleVisionCells
        )
      ),
    [map, visibleTokens, visibleVisionCells]
  );
  const gridLines = useMemo(() => {
    const lines: BattleMapGridLine[] = [];
    for (let x = 0, index = 0; x <= map.width; x += map.gridSize, index += 1) {
      lines.push({
        key: `x-${x}`,
        points: [x, 0, x, map.height],
        isMajor: index % 5 === 0,
      });
    }
    for (let y = 0, index = 0; y <= map.height; y += map.gridSize, index += 1) {
      lines.push({
        key: `y-${y}`,
        points: [0, y, map.width, y],
        isMajor: index % 5 === 0,
      });
    }
    return lines;
  }, [map.gridSize, map.height, map.width]);

  useEffect(() => {
    setExploredVisionCells(loadExploredVisionCells(exploredVisionStorageKey, map));
  }, [exploredVisionStorageKey, map.gridSize, map.height, map.width]);

  useEffect(() => {
    tokenPathCacheRef.current.clear();
  }, [map]);

  useEffect(() => {
    if (!visibleVisionCells) return;
    setExploredVisionCells((current) => {
      let changed = false;
      const next = new Set(current);
      visibleVisionCells.forEach((cellKey) => {
        if (!next.has(cellKey)) {
          next.add(cellKey);
          changed = true;
        }
      });
      if (!changed) return current;
      saveExploredVisionCells(exploredVisionStorageKey, map, next);
      return next;
    });
  }, [exploredVisionStorageKey, map, visibleVisionCells]);

  useEffect(() => {
    if (selectedTokenId && !map.tokens.some((token) => token.id === selectedTokenId)) {
      setSelectedTokenId(null);
    }
  }, [map.tokens, selectedTokenId]);

  useEffect(() => {
    if (selectedFogId && !map.fogRects.some((rect) => rect.id === selectedFogId)) {
      setSelectedFogId(null);
    }
  }, [map.fogRects, selectedFogId]);

  useEffect(() => {
    if (!selectedMapStructure) return;
    const exists =
      selectedMapStructure.kind === 'terrain'
        ? terrainCells.some((cell) => cell.id === selectedMapStructure.id)
        : selectedMapStructure.kind === 'wall'
          ? wallCells.some((cell) => cell.id === selectedMapStructure.id)
          : selectedMapStructure.kind === 'door'
            ? doorCells.some((cell) => cell.id === selectedMapStructure.id)
            : objectCells.some((cell) => cell.id === selectedMapStructure.id);

    if (!exists) {
      setSelectedMapStructure(null);
    }
  }, [doorCells, objectCells, selectedMapStructure, terrainCells, wallCells]);

  useEffect(() => {
    setMapSizeDraft({
      width: String(map.width),
      height: String(map.height),
      gridSize: String(map.gridSize),
    });
  }, [map.gridSize, map.height, map.width]);

  useEffect(() => {
    if (!selectedMonsterId && monsterCatalog.length > 0) {
      setSelectedMonsterId(monsterCatalog[0].id);
    }
  }, [monsterCatalog, selectedMonsterId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
      setContainerHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  function updateMap(patch: Partial<VttMapStateDto>) {
    if (isInteractionLocked) return;
    onChange({
      ...map,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  function updateEncounterScaling(patch: Partial<NonNullable<VttMapStateDto['encounterScaling']>>) {
    const current = map.encounterScaling ?? {
      enabled: false,
      basePartySize: 4,
      minMonsterCount: 1,
      mode: 'by_party_ratio' as const,
    };
    updateMap({
      encounterScaling: {
        ...current,
        ...patch,
        mode: 'by_party_ratio',
      },
    });
  }

  function updateToken(tokenId: string, patch: Partial<VttMapStateDto['tokens'][number]>) {
    updateMap({
      tokens: map.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              ...patch,
              x:
                patch.x === undefined
                  ? token.x
                  : clamp(patch.x, 0, map.width - (patch.size ?? token.size)),
              y:
                patch.y === undefined
                  ? token.y
                  : clamp(patch.y, 0, map.height - (patch.size ?? token.size)),
              size: patch.size === undefined ? token.size : clamp(patch.size, 24, 160),
            }
          : token
      ),
    });
  }

  function deleteToken(tokenId: string) {
    updateMap({ tokens: map.tokens.filter((token) => token.id !== tokenId) });
    setSelectedTokenId(null);
  }

  function duplicateToken(tokenId: string) {
    const token = map.tokens.find((item) => item.id === tokenId);
    if (!token) return;

    const copy = {
      ...token,
      id: `token:copy:${Date.now()}`,
      name: `${token.name} copy`,
      x: clamp(token.x + map.gridSize, 0, map.width - token.size),
      y: clamp(token.y + map.gridSize, 0, map.height - token.size),
    };
    updateMap({ tokens: [...map.tokens, copy] });
    setSelectedTokenId(copy.id);
  }

  function moveTokenLayer(tokenId: string, direction: 'front' | 'back') {
    const token = map.tokens.find((item) => item.id === tokenId);
    if (!token) return;

    updateMap({
      tokens:
        direction === 'front'
          ? [...map.tokens.filter((item) => item.id !== tokenId), token]
          : [token, ...map.tokens.filter((item) => item.id !== tokenId)],
    });
  }

  function updateFogRect(fogId: string, patch: Partial<VttMapStateDto['fogRects'][number]>) {
    updateMap({
      fogRects: map.fogRects.map((rect) =>
        rect.id === fogId
          ? {
              ...rect,
              ...patch,
              x: patch.x === undefined ? rect.x : clamp(patch.x, 0, map.width),
              y: patch.y === undefined ? rect.y : clamp(patch.y, 0, map.height),
              width:
                patch.width === undefined
                  ? rect.width
                  : clamp(patch.width, map.gridSize, map.width),
              height:
                patch.height === undefined
                  ? rect.height
                  : clamp(patch.height, map.gridSize, map.height),
            }
          : rect
      ),
    });
  }

  function deleteFogRect(fogId: string) {
    updateMap({ fogRects: map.fogRects.filter((rect) => rect.id !== fogId) });
    setSelectedFogId(null);
  }

  function getStructureCells(kind: MapStructureKind) {
    if (kind === 'terrain') return terrainCells;
    if (kind === 'wall') return wallCells;
    if (kind === 'door') return doorCells;
    return objectCells;
  }

  function updateStructureCells(
    kind: MapStructureKind,
    cells: Array<
      | NonNullable<VttMapStateDto['terrainCells']>[number]
      | NonNullable<VttMapStateDto['wallCells']>[number]
      | NonNullable<VttMapStateDto['doorCells']>[number]
      | NonNullable<VttMapStateDto['objectCells']>[number]
    >
  ) {
    if (kind === 'terrain') {
      updateMap({ terrainCells: cells as NonNullable<VttMapStateDto['terrainCells']> });
      return;
    }
    if (kind === 'wall') {
      updateMap({ wallCells: cells as NonNullable<VttMapStateDto['wallCells']> });
      return;
    }
    if (kind === 'door') {
      updateMap({ doorCells: cells as NonNullable<VttMapStateDto['doorCells']> });
      return;
    }
    updateMap({ objectCells: cells as NonNullable<VttMapStateDto['objectCells']> });
  }

  function updateStructureCell(
    kind: MapStructureKind,
    cellId: string,
    patch: Partial<
      | NonNullable<VttMapStateDto['terrainCells']>[number]
      | NonNullable<VttMapStateDto['wallCells']>[number]
      | NonNullable<VttMapStateDto['doorCells']>[number]
      | NonNullable<VttMapStateDto['objectCells']>[number]
    >
  ) {
    updateStructureCells(
      kind,
      getStructureCells(kind).map((cell) =>
        cell.id === cellId
          ? {
              ...cell,
              ...patch,
              x: patch.x === undefined ? cell.x : clamp(patch.x, 0, map.width - map.gridSize),
              y: patch.y === undefined ? cell.y : clamp(patch.y, 0, map.height - map.gridSize),
              width:
                patch.width === undefined
                  ? cell.width
                  : clamp(patch.width, map.gridSize, map.width),
              height:
                patch.height === undefined
                  ? cell.height
                  : clamp(patch.height, map.gridSize, map.height),
            }
          : cell
      )
    );
  }

  function deleteStructureCell(kind: MapStructureKind, cellId: string) {
    updateStructureCells(
      kind,
      getStructureCells(kind).filter((cell) => cell.id !== cellId)
    );
    setSelectedMapStructure(null);
  }

  function getSnappedStructureBox(from: { x: number; y: number }, to: { x: number; y: number }) {
    const gridMaxColumn = Math.ceil(map.width / map.gridSize) - 1;
    const gridMaxRow = Math.ceil(map.height / map.gridSize) - 1;
    const startColumn = clamp(Math.floor(from.x / map.gridSize), 0, gridMaxColumn);
    const startRow = clamp(Math.floor(from.y / map.gridSize), 0, gridMaxRow);
    const endColumn = clamp(Math.floor(to.x / map.gridSize), 0, gridMaxColumn);
    const endRow = clamp(Math.floor(to.y / map.gridSize), 0, gridMaxRow);
    const minColumn = Math.min(startColumn, endColumn);
    const maxColumn = Math.max(startColumn, endColumn);
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const x = minColumn * map.gridSize;
    const y = minRow * map.gridSize;

    return {
      x,
      y,
      width: clamp((maxColumn - minColumn + 1) * map.gridSize, map.gridSize, map.width - x),
      height: clamp((maxRow - minRow + 1) * map.gridSize, map.gridSize, map.height - y),
    };
  }

  function getDefaultStructureName(kind: MapStructureKind) {
    if (kind === 'terrain') return '이동 불가 칸';
    if (kind === 'wall') return '벽';
    if (kind === 'door') return '문';
    return '오브젝트';
  }

  function getObjectShapeCells(cell: ObjectCell): ObjectShapeCell[] {
    return cell.shapeCells?.length
      ? cell.shapeCells
      : [{ x: cell.x, y: cell.y, width: cell.width, height: cell.height }];
  }

  function isDetectedHazardCell(cell: ObjectCell): boolean {
    return Boolean(cell.hazard?.armed !== false && cell.hazard?.detectedBySessionCharacterIds?.length);
  }

  function isArmedHazardCell(cell: ObjectCell): boolean {
    return Boolean(cell.hazard && cell.hazard.armed !== false);
  }

  function isObservedObjectCell(cell: ObjectCell): boolean {
    return Boolean(cell.observedBySessionCharacterIds?.length);
  }

  function getHazardMarkerLabel(kind: ObjectHazard['kind'] | undefined): string {
    if (kind === 'AMBUSH') return '매복';
    if (kind === 'HAZARD') return '위험';
    return '함정';
  }

  function getGridShapeCellsFromBox(box: StructureBox): ObjectShapeCell[] {
    const minColumn = Math.floor(box.x / map.gridSize);
    const maxColumn = Math.max(minColumn, Math.ceil((box.x + box.width) / map.gridSize) - 1);
    const minRow = Math.floor(box.y / map.gridSize);
    const maxRow = Math.max(minRow, Math.ceil((box.y + box.height) / map.gridSize) - 1);
    const cells: ObjectShapeCell[] = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const x = clamp(column * map.gridSize, 0, map.width - map.gridSize);
        const y = clamp(row * map.gridSize, 0, map.height - map.gridSize);
        cells.push({ x, y, width: map.gridSize, height: map.gridSize });
      }
    }

    return cells;
  }

  function getShapeCellKey(cell: ObjectShapeCell) {
    return `${cell.x}:${cell.y}:${cell.width}:${cell.height}`;
  }

  function getShapeBounds(shapeCells: ObjectShapeCell[]): StructureBox {
    const left = Math.min(...shapeCells.map((cell) => cell.x));
    const top = Math.min(...shapeCells.map((cell) => cell.y));
    const right = Math.max(...shapeCells.map((cell) => cell.x + cell.width));
    const bottom = Math.max(...shapeCells.map((cell) => cell.y + cell.height));

    return {
      x: left,
      y: top,
      width: Math.max(map.gridSize, right - left),
      height: Math.max(map.gridSize, bottom - top),
    };
  }

  function addStructureBox(kind: MapStructureKind, box: StructureBox) {
    const id = `${kind}:${Date.now()}`;
    const base = {
      id,
      ...box,
      name: getDefaultStructureName(kind),
      description: null,
    };
    const nextCell =
      kind === 'door'
        ? { ...base, state: 'closed' as const, keyItemId: null, canBreak: false, breakCheckDc: null }
        : kind === 'object'
          ? {
              ...base,
              shapeCells: getGridShapeCellsFromBox(box),
              visibleToPlayers: true,
              canBreak: false,
              broken: false,
              breakCheckDc: null,
              hiddenClueIds: [],
              hiddenItemIds: [],
              hiddenEventIds: [],
              events: [],
              hazard: null,
            }
          : base;
    updateStructureCells(kind, [...getStructureCells(kind), nextCell]);
    setSelectedMapStructure({ kind, id });
    setSelectedTokenId(null);
    setSelectedFogId(null);
  }

  function extendObjectCell(cellId: string, box: StructureBox) {
    const target = objectCells.find((cell) => cell.id === cellId);
    if (!target) return;

    const shapeByKey = new Map(
      [...getObjectShapeCells(target), ...getGridShapeCellsFromBox(box)].map((cell) => [
        getShapeCellKey(cell),
        cell,
      ])
    );
    const shapeCells = Array.from(shapeByKey.values()).sort((left, right) =>
      left.y === right.y ? left.x - right.x : left.y - right.y
    );
    const bounds = getShapeBounds(shapeCells);

    updateStructureCell('object', cellId, {
      ...bounds,
      shapeCells,
    } as Partial<ObjectCell>);
    setSelectedMapStructure({ kind: 'object', id: cellId });
    setSelectedTokenId(null);
    setSelectedFogId(null);
  }

  function updateMapSize(patch: Partial<Pick<VttMapStateDto, 'width' | 'height' | 'gridSize'>>) {
    updateMap({
      ...patch,
      width: patch.width === undefined ? map.width : clamp(patch.width, 320, 4000),
      height: patch.height === undefined ? map.height : clamp(patch.height, 240, 4000),
      gridSize: patch.gridSize === undefined ? map.gridSize : clamp(patch.gridSize, 16, 160),
    });
  }

  function updateMapSizeDraft(field: MapSizeField, value: string) {
    setMapSizeDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function commitMapSizeField(field: MapSizeField) {
    const rawValue = mapSizeDraft[field].trim();
    if (!rawValue) {
      setMapSizeDraft((current) => ({
        ...current,
        [field]: String(map[field]),
      }));
      return;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      setMapSizeDraft((current) => ({
        ...current,
        [field]: String(map[field]),
      }));
      return;
    }

    if (field === 'width') {
      updateMapSize({ width: parsedValue });
      return;
    }

    if (field === 'height') {
      updateMapSize({ height: parsedValue });
      return;
    }

    updateMapSize({ gridSize: parsedValue });
  }

  function setObjectHazardEnabled(enabled: boolean) {
    if (selectedMapStructure?.kind !== 'object') return;

    updateStructureCell('object', selectedMapStructure.id, {
      hazard: enabled
        ? {
            kind: 'TRAP',
            armed: true,
            triggerOnce: true,
            detectionRadiusCells: 3,
            detectionDc: 12,
            linkedClueIds: [],
            attemptedBySessionCharacterIds: [],
            detectedBySessionCharacterIds: [],
          }
        : null,
    } as Partial<ObjectCell>);
  }

  function updateObjectHazard(patch: Partial<ObjectHazard>) {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    const hazard = objectCell?.hazard;
    if (!hazard) return;

    updateStructureCell('object', selectedMapStructure.id, {
      hazard: {
        ...hazard,
        ...patch,
      },
    } as Partial<ObjectCell>);
  }

  function updateObjectRevealChecks(contentIds: string[]) {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    const existingChecks = objectCell?.revealChecks ?? [];
    const nextChecks = contentIds.map((contentId) => {
      const existing = existingChecks.find((check) => check.contentId === contentId);
      return (
        existing ?? {
          contentId,
          requiresCheck: true,
          ability: 'int',
          skill: 'investigation',
          dc: 15,
        }
      );
    });
    updateStructureCell('object', selectedMapStructure.id, {
      hiddenClueIds: contentIds,
      revealChecks: nextChecks,
    } as Partial<ObjectCell>);
  }

  function patchObjectRevealCheck(contentId: string, patch: Partial<ObjectRevealCheck>) {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    const hiddenClueIds = objectCell?.hiddenClueIds ?? [];
    const existingChecks = objectCell?.revealChecks ?? [];
    const nextChecks = hiddenClueIds.map((id) => {
      const existing =
        existingChecks.find((check) => check.contentId === id) ??
        ({
          contentId: id,
          requiresCheck: true,
          ability: 'int',
          skill: 'investigation',
          dc: 15,
        } satisfies ObjectRevealCheck);
      return id === contentId ? { ...existing, ...patch } : existing;
    });
    updateStructureCell('object', selectedMapStructure.id, {
      revealChecks: nextChecks,
    } as Partial<ObjectCell>);
  }

  function resetObjectHazardState() {
    updateObjectHazard({
      attemptedBySessionCharacterIds: [],
      detectedBySessionCharacterIds: [],
      armed: true,
    });
  }

  function handleMapSizeDraftKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: MapSizeField
  ) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitMapSizeField(field);
    event.currentTarget.blur();
  }

  function addObjectFogRevealEvent() {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    if (!objectCell) return;

    const events = objectCell.events ?? [];
    const nextEvent: ObjectEvent = {
      id: `event:fog:${Date.now()}`,
      name: '근접 안개 해제',
      type: 'REVEAL_FOG_ON_PROXIMITY',
      trigger: { distanceFeet: 15, once: true },
      effect: { revealRadiusFeet: 30 },
    };
    updateStructureCell('object', selectedMapStructure.id, {
      events: [...events, nextEvent].slice(0, 20),
    } as Partial<ObjectCell>);
  }

  function updateObjectEvent(eventId: string, updater: (event: ObjectEvent) => ObjectEvent) {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    if (!objectCell) return;

    updateStructureCell('object', selectedMapStructure.id, {
      events: (objectCell.events ?? []).map((event) =>
        event.id === eventId ? updater(event) : event
      ),
    } as Partial<ObjectCell>);
  }

  function deleteObjectEvent(eventId: string) {
    if (selectedMapStructure?.kind !== 'object') return;
    const objectCell = selectedMapStructureCell as ObjectCell | null;
    if (!objectCell) return;

    updateStructureCell('object', selectedMapStructure.id, {
      events: (objectCell.events ?? []).filter((event) => event.id !== eventId),
    } as Partial<ObjectCell>);
  }

  async function handleTokenMove(
    tokenId: string,
    x: number,
    y: number,
    snap = isTokenSnapEnabled
  ): Promise<boolean> {
    const targetToken = map.tokens.find((token) => token.id === tokenId);
    if (!targetToken || !canControlToken(targetToken)) return false;

    const nextPosition = getTokenMovePosition(targetToken, x, y, snap);

    const movementPath = getCachedTokenMovementPath(
      targetToken,
      nextPosition.x,
      nextPosition.y,
      combatMovementMode
    );
    if (movementPath.blocked) {
      return false;
    }

    if (isTokenMovementOverRange(targetToken, nextPosition.x, nextPosition.y, combatMovementMode)) {
      return false;
    }

    if (onTokenMoveRequest) {
      const trackedRoute =
        tokenDragMeasureRef.current?.tokenId === tokenId && tokenDragMeasureRef.current.route.length > 1
          ? expandTokenRoute(
              compactTokenRoute(
                appendTokenRoutePoint(tokenDragMeasureRef.current.route, nextPosition),
                map
              ),
              map
            )
          : movementPath.cells;
      const requestedMap = await onTokenMoveRequest(
        targetToken,
        nextPosition,
        trackedRoute,
        combatMovementMode
      );
      return Boolean(requestedMap);
    }

    updateMap({
      tokens: map.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              x: nextPosition.x,
              y: nextPosition.y,
            }
          : token
      ),
    });
    return true;
  }

  function getPartyPlacement(index: number) {
    const slot = startingPositions[index] ?? getDefaultStartingPosition(index, map);
    return {
      x: clamp(slot.x, 0, map.width - map.gridSize),
      y: clamp(slot.y, 0, map.height - map.gridSize),
    };
  }

  function addHostileToken() {
    if (!selectedMonster) return;

    const index = map.tokens.filter((token) => token.isHostile).length + 1;
    const position = getDefaultStartingPosition(index + 3, map);
    updateMap({
      tokens: [
        ...map.tokens,
        {
          id: `token:hostile:${Date.now()}`,
          sessionCharacterId: null,
          name: getMonsterDisplayName(selectedMonster),
          imageUrl: null,
          x: position.x,
          y: position.y,
          size: map.gridSize,
          hidden: false,
          isHostile: true,
          encounterRole: 'scalable',
          encounterGroupId: selectedMonster.id,
          encounterPriority: 0,
          monster: selectedMonster,
        },
      ],
    });
  }

  function syncPartyTokens() {
    const knownTokenIds = new Set(
      map.tokens.map((token) => token.sessionCharacterId).filter(Boolean)
    );
    const characterImageById = new Map(
      characters.map((character) => [character.id, getCharacterImage(character)])
    );
    let hasTokenImageUpdates = false;
    const tokensWithCharacterImages = map.tokens.map((token) => {
      if (!token.sessionCharacterId || token.imageUrl) {
        return token;
      }

      const characterImage = characterImageById.get(token.sessionCharacterId);
      if (!characterImage) {
        return token;
      }

      hasTokenImageUpdates = true;
      // 이미 배치된 토큰의 수동 이미지는 유지하고, 비어 있는 플레이어 토큰만 캐릭터/직업 이미지로 채웁니다.
      return {
        ...token,
        imageUrl: characterImage,
      };
    });
    const additions = characters.flatMap((character, index) =>
      knownTokenIds.has(character.id)
        ? []
        : [
            {
              ...getPartyPlacement(index),
              id: `token:${character.id}`,
              sessionCharacterId: character.id,
              name: character.name,
              imageUrl: getCharacterImage(character),
              size: map.gridSize,
              hidden: false,
              isHostile: false,
              monster: null,
            },
          ]
    );

    if (!additions.length && !hasTokenImageUpdates) return;
    updateMap({ tokens: [...tokensWithCharacterImages, ...additions] });
  }

  function updateStartingPosition(
    positionId: string,
    patch: Partial<StartingPosition>,
    snap = false
  ) {
    updateMap({
      startingPositions: startingPositions.map((position) =>
        position.id === positionId
          ? {
              ...position,
              ...patch,
              x:
                patch.x === undefined
                  ? position.x
                  : clamp(
                      snap ? snapToGrid(patch.x, map.gridSize) : patch.x,
                      0,
                      map.width - map.gridSize
                    ),
              y:
                patch.y === undefined
                  ? position.y
                  : clamp(
                      snap ? snapToGrid(patch.y, map.gridSize) : patch.y,
                      0,
                      map.height - map.gridSize
                    ),
              label: patch.label === undefined ? (position.label ?? null) : patch.label,
            }
          : position
      ),
    });
  }

  async function addPingAt(point: MeasurePoint) {
    if (interactionMode === 'session') {
      if (onPingRequest) {
        await onPingRequest(point, '!');
        return;
      }
      const expiresAt = new Date(Date.now() + 2200).toISOString();
      updateMap({
        pings: [
          ...(map.pings ?? []).filter((ping) => Date.parse(ping.expiresAt) > Date.now()).slice(-4),
          {
            id: `ping:${Date.now()}`,
            x: point.x,
            y: point.y,
            label: '!',
            expiresAt,
          },
        ],
      });
      return;
    }

    const ping: PingMarker = {
      id: `ping:${Date.now()}`,
      x: point.x,
      y: point.y,
      label: '!',
    };
    setPings((current) => [...current.slice(-4), ping]);
    window.setTimeout(() => {
      setPings((current) => current.filter((item) => item.id !== ping.id));
    }, 2200);
  }

  function handleMeasureClick(point: MeasurePoint) {
    if (!measureStart || measureEnd) {
      setMeasureStart(point);
      setMeasureEnd(null);
      setMeasurePreview(null);
      return;
    }

    setMeasureEnd(point);
    setMeasurePreview(null);
  }

  function clearMeasure() {
    setMeasureStart(null);
    setMeasureEnd(null);
    setMeasurePreview(null);
  }

  function canControlToken(token: VttMapStateDto['tokens'][number]) {
    if (isInteractionLocked) return false;
    if (hasExplicitControllableTokens) {
      return explicitControllableTokenIds.has(token.id);
    }
    return (
      canEditMap ||
      showHiddenContent ||
      Boolean(token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId))
    );
  }

  function getTokenMovePosition(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    snap = isTokenSnapEnabled
  ) {
    return {
      x: clamp(snap ? snapToGrid(x, map.gridSize) : x, 0, map.width - token.size),
      y: clamp(snap ? snapToGrid(y, map.gridSize) : y, 0, map.height - token.size),
    };
  }

  function getTokenDragPosition(token: VttMapStateDto['tokens'][number], x: number, y: number) {
    return {
      x: clamp(x, 0, Math.max(0, map.width - token.size)),
      y: clamp(y, 0, Math.max(0, map.height - token.size)),
    };
  }

  function getTokenRemainingMovementFt(token: VttMapStateDto['tokens'][number]) {
    const range = tokenMovementRangeFtByTokenId?.[token.id];
    return range === undefined ? null : Math.max(0, range);
  }

  function getTokenMovementDistanceFt(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number
  ) {
    return getGridMovementDistanceFt({ x: token.x, y: token.y }, { x, y }, map);
  }

  function isTokenMovementOverRange(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    movementMode: CombatMovementMode = 'normal'
  ) {
    const remainingMovementFt = getTokenRemainingMovementFt(token);
    const movementCostFt =
      getTokenMovementDistanceFt(token, x, y) +
      (movementMode === 'jump' ? jumpExtraMovementFt : 0);
    return (
      remainingMovementFt !== null &&
      movementCostFt > remainingMovementFt
    );
  }

  function isTokenPositionBlocked(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {}
  ) {
    if (canEditMap) return false;

    const tokenRect = {
      x,
      y,
      width: token.size,
      height: token.size,
    };

    if (indexedBlockersOverlap(tokenRect, movementBlockerIndex, map)) {
      return true;
    }
    return options.ignoreTokens
      ? false
      : indexedBlockersOverlap(tokenRect, tokenOccupancyBlockerIndex, map, {
          ignoreTokenId: token.id,
        });
  }

  function getTokenMovementPath(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    movementMode: CombatMovementMode = 'normal'
  ): TokenMovementPath {
    return measureBattleMapPerf(
      'token path',
      () => {
        const cells = getGridLineCells({ x: token.x, y: token.y }, { x, y }, map).map((cell, index) => {
          const cellPosition = {
            x: clamp(cell.column * map.gridSize, 0, map.width - token.size),
            y: clamp(cell.row * map.gridSize, 0, map.height - token.size),
          };
          return {
            ...cellPosition,
            blocked:
              index > 0 &&
              isTokenPositionBlocked(token, cellPosition.x, cellPosition.y, {
                ignoreTokens: movementMode === 'jump',
              }),
          };
        });

        const destinationBlocked =
          (token.x !== x || token.y !== y) && isTokenPositionBlocked(token, x, y);
        const overRange = isTokenMovementOverRange(token, x, y, movementMode);
        const distanceFt = getTokenMovementDistanceFt(token, x, y);
        const extraCostFt = movementMode === 'jump' && distanceFt > 0 ? jumpExtraMovementFt : 0;

        return {
          cells,
          blocked: cells.some((cell) => cell.blocked) || destinationBlocked || overRange,
          distanceFt,
          extraCostFt,
        };
      },
      () => `token=${token.id}`
    );
  }

  function getCachedTokenMovementPath(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    movementMode: CombatMovementMode = 'normal'
  ) {
    const cacheKey = [
      map.updatedAt,
      token.id,
      token.x,
      token.y,
      x,
      y,
      movementMode,
      isTokenSnapEnabled ? 'snap' : 'free',
    ].join(':');
    const cached = tokenPathCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const path = getTokenMovementPath(token, x, y, movementMode);
    tokenPathCacheRef.current.set(cacheKey, path);
    return path;
  }

  function getTileFromPoint(point: { x: number; y: number }) {
    return {
      column: Math.floor(clamp(point.x, 0, map.width - 1) / map.gridSize) + 1,
      row: Math.floor(clamp(point.y, 0, map.height - 1) / map.gridSize) + 1,
    };
  }

  function emitTileSelection(point: { x: number; y: number }) {
    if (!isVisionPointVisible(point, map, visibleVisionCells)) {
      onSelectionChange?.(null);
      return;
    }

    const structureSelection = getSessionStructureSelectionAtPoint(point);
    if (structureSelection) {
      emitStructureSelection(structureSelection.kind, structureSelection.cell);
      return;
    }

    onSelectionChange?.({
      kind: 'tile',
      point,
      tile: getTileFromPoint(point),
    });
  }

  function emitTokenSelection(token: VttMapStateDto['tokens'][number]) {
    const point = {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
    onSelectionChange?.({
      kind: 'token',
      token,
      character: token.sessionCharacterId
        ? (characters.find((character) => character.id === token.sessionCharacterId) ?? null)
        : null,
      point,
      tile: getTileFromPoint(point),
    });
  }

  function emitStructureSelection(
    kind: MapStructureKind,
    cell:
      | NonNullable<VttMapStateDto['terrainCells']>[number]
      | NonNullable<VttMapStateDto['wallCells']>[number]
      | NonNullable<VttMapStateDto['doorCells']>[number]
      | NonNullable<VttMapStateDto['objectCells']>[number]
  ) {
    const point = {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
    };
    onSelectionChange?.({
      kind,
      cell,
      point,
      tile: getTileFromPoint(point),
    });
  }

  function isPointInCell(
    point: { x: number; y: number },
    cell:
      | NonNullable<VttMapStateDto['terrainCells']>[number]
      | NonNullable<VttMapStateDto['wallCells']>[number]
      | NonNullable<VttMapStateDto['doorCells']>[number]
      | NonNullable<VttMapStateDto['objectCells']>[number]
  ) {
    const shapeCells = 'shapeCells' in cell ? getObjectShapeCells(cell as ObjectCell) : [cell];
    return shapeCells.some(
      (shapeCell) =>
        point.x >= shapeCell.x &&
        point.x <= shapeCell.x + shapeCell.width &&
        point.y >= shapeCell.y &&
        point.y <= shapeCell.y + shapeCell.height
    );
  }

  function getSessionStructureSelectionAtPoint(point: { x: number; y: number }) {
    if (canEditMap) return null;
    if (!isVisionPointVisible(point, map, visibleVisionCells)) return null;

    const objectCell = visibleObjectCells.find((cell) => isPointInCell(point, cell));
    if (objectCell) {
      return { kind: 'object' as const, cell: objectCell };
    }

    const doorCell = doorCells.find((cell) => isPointInCell(point, cell));
    if (doorCell) {
      return { kind: 'door' as const, cell: doorCell };
    }

    const wallCell = wallCells.find((cell) => isPointInCell(point, cell));
    if (wallCell) {
      return { kind: 'wall' as const, cell: wallCell };
    }

    const terrainCell = terrainCells.find((cell) => isPointInCell(point, cell));
    if (terrainCell) {
      return { kind: 'terrain' as const, cell: terrainCell };
    }

    return null;
  }

  const activeMapPings = useMemo(
    () =>
      (map.pings ?? [])
        .filter((ping) => {
          const expiresAt = Date.parse(ping.expiresAt);
          return Number.isFinite(expiresAt) && expiresAt > pingClock;
        })
        .map((ping) => ({
          ...ping,
          label: ping.label ?? '!',
        })),
    [map.pings, pingClock]
  );

  useEffect(() => {
    if (!activeMapPings.length) return undefined;
    const nextExpiry = Math.min(...activeMapPings.map((ping) => Date.parse(ping.expiresAt)));
    const timer = window.setTimeout(
      () => setPingClock(Date.now()),
      Math.max(0, nextExpiry - Date.now()) + 16
    );
    return () => window.clearTimeout(timer);
  }, [activeMapPings]);

  function resetView() {
    setZoom(1);
    setStagePosition({ x: 0, y: 0 });
    setPanMode(false);
  }

  function hideFullMap() {
    updateMap({
      fogRects: [
        {
          id: `fog:full:${Date.now()}`,
          x: 0,
          y: 0,
          width: map.width,
          height: map.height,
        },
      ],
    });
    setSelectedFogId(null);
  }

  function applyFogBox(box: FogBox) {
    if (fogAction === 'hide') {
      updateMap({
        fogRects: [
          ...map.fogRects,
          {
            id: `fog:${Date.now()}`,
            ...box,
          },
        ].slice(-200),
      });
      return;
    }

    updateMap({
      fogRects: map.fogRects.flatMap((rect) => subtractFogBox(rect, box)).slice(0, 200),
    });
    setSelectedFogId(null);
  }

  const {
    getWorldPointer,
    handleStageClick,
    handleStageDragEnd,
    handleStageMouseMove,
    handleStagePointerDown,
    handleStagePointerUp,
  } = useBattleMapPointerInput({
    map,
    scale,
    stagePosition,
    setStagePosition,
    canEditMap,
    isPanMode,
    isFogMode,
    isFogSnapEnabled,
    isPingMode,
    isMeasureMode,
    measureStart,
    measureEnd,
    mapStructureTool,
    structureDragStart,
    structureDraft,
    fogDragStart,
    fogDraft,
    setSelectedTokenId,
    setSelectedFogId,
    setSelectedMapStructure,
    setStructureDragStart,
    setStructureDraft,
    setFogDragStart,
    setFogDraft,
    setMeasurePreview,
    getSnappedStructureBox,
    normalizeFogBox,
    addStructureBox,
    extendObjectCell,
    applyFogBox,
    addPingAt,
    handleMeasureClick,
    emitTileSelection,
  });

  function beginObjectExtensionDrag(
    cell: ObjectCell,
    event: Parameters<NonNullable<ComponentProps<typeof Rect>['onMouseDown']>>[0]
  ) {
    const isSelectedObject =
      selectedMapStructure?.kind === 'object' && selectedMapStructure.id === cell.id;
    if (
      !canEditMap ||
      (mapStructureTool !== 'object' && !isSelectedObject) ||
      isPanMode ||
      event.evt.button !== 0
    ) {
      return;
    }
    event.cancelBubble = true;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const world = getWorldPointer(pointer);

    setSelectedMapStructure({ kind: 'object', id: cell.id });
    setSelectedTokenId(null);
    setSelectedFogId(null);
    setStructureDragStart({
      kind: 'object',
      point: world,
      mode: 'extend',
      targetObjectId: cell.id,
    });
    setStructureDraft({ kind: 'object', box: getSnappedStructureBox(world, world) });
  }

  function beginTokenDragMeasure(token: VttMapStateDto['tokens'][number]) {
    const center = {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
    const nextMeasure = {
      tokenId: token.id,
      from: center,
      to: center,
      path: getCachedTokenMovementPath(token, token.x, token.y, combatMovementMode),
      route: [{ x: token.x, y: token.y }],
    };
    tokenDragMeasureRef.current = nextMeasure;
    setTokenDragMeasure(nextMeasure);
  }

  function updateTokenDragMeasure(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    snap = isTokenSnapEnabled
  ) {
    const nextPosition = getTokenMovePosition(token, x, y, snap);
    const current = tokenDragMeasureRef.current;
    const previousRoute =
      current?.tokenId === token.id ? current.route : [{ x: token.x, y: token.y }];
    const nextRoute = appendTokenRoutePoint(previousRoute, nextPosition);
    const nextCenter = {
      x: nextPosition.x + token.size / 2,
      y: nextPosition.y + token.size / 2,
    };
    if (
      current?.tokenId === token.id &&
      current.to.x === nextCenter.x &&
      current.to.y === nextCenter.y
    ) {
      return;
    }
    tokenDragMeasureRef.current = {
      ...(current ?? {
        tokenId: token.id,
        from: { x: token.x + token.size / 2, y: token.y + token.size / 2 },
        to: nextCenter,
        path: getCachedTokenMovementPath(token, token.x, token.y, combatMovementMode),
        route: previousRoute,
      }),
      tokenId: token.id,
      to: nextCenter,
      route: nextRoute,
    };
    if (tokenDragFrameRef.current !== null) {
      return;
    }
    tokenDragFrameRef.current = window.requestAnimationFrame(() => {
      tokenDragFrameRef.current = null;
      const latest = tokenDragMeasureRef.current;
      if (!latest || latest.tokenId !== token.id) {
        return;
      }
      const latestPosition = {
        x: latest.to.x - token.size / 2,
        y: latest.to.y - token.size / 2,
      };
      setTokenDragMeasure({
        ...latest,
        path: getCachedTokenMovementPath(token, latestPosition.x, latestPosition.y, combatMovementMode),
      });
    });
  }

  function finishTokenDragMeasure() {
    if (tokenDragFrameRef.current !== null) {
      window.cancelAnimationFrame(tokenDragFrameRef.current);
      tokenDragFrameRef.current = null;
    }
    tokenDragMeasureRef.current = null;
    setTokenDragMeasure(null);
  }

  function setExclusiveTool(tool: 'pan' | 'fog' | 'measure' | 'ping' | MapStructureKind) {
    const isStructureTool =
      tool === 'terrain' || tool === 'wall' || tool === 'door' || tool === 'object';
    setPanMode(tool === 'pan' ? !isPanMode : false);
    setFogMode(tool === 'fog' ? !isFogMode : false);
    setMeasureMode(tool === 'measure' ? !isMeasureMode : false);
    setPingMode(tool === 'ping' ? !isPingMode : false);
    setMapStructureTool((current) =>
      isStructureTool ? (tool === current ? null : (tool as MapStructureKind)) : null
    );
  }

  function applyTokenAsset(asset: ScenarioAsset) {
    if (!selectedToken) return;
    updateToken(selectedToken.id, { imageUrl: asset.publicUrl });
  }

  async function handleTokenAssetFile(file: File | null) {
    if (!file || !uploadTokenAsset) return;

    setTokenAssetUploadBusy(true);

    try {
      const asset = await uploadTokenAsset(file);
      if (asset) {
        applyTokenAsset(asset);
      }
    } finally {
      setTokenAssetUploadBusy(false);
    }
  }

  const subtoolbarControls = buildBattleMapEditorSubtoolbarControls({
    zoom,
    zoomSteps,
    canEditMap,
    mapSizeDraft,
    measureStart: Boolean(measureStart),
    isTokenSnapEnabled,
    isFogMode,
    fogAction,
    isFogSnapEnabled,
    labels: {
      reset: mapText.reset,
      width: mapText.width,
      height: mapText.height,
      grid: mapText.grid,
      clearMeasure: mapText.clearMeasure,
      tokenSnap: mapText.tokenSnap,
      reveal: mapText.reveal,
      hide: mapText.hide,
      snap: mapText.snap,
      hideAll: mapText.hideAll,
      revealAll: mapText.revealAll,
    },
    onZoomChange: setZoom,
    onZoomSelect: setZoom,
    onResetView: resetView,
    onMapSizeDraftChange: updateMapSizeDraft,
    onMapSizeFieldCommit: commitMapSizeField,
    onMapSizeDraftKeyDown: handleMapSizeDraftKeyDown,
    onClearMeasure: clearMeasure,
    onTokenSnapChange: setTokenSnapEnabled,
    onFogActionChange: setFogAction,
    onFogSnapChange: setFogSnapEnabled,
    onHideFullMap: hideFullMap,
    onRevealFullMap: () => updateMap({ fogRects: [] }),
  });

  return (
    <section
      className={`vtt-panel${showMapChrome ? '' : ' session-map'}${
        isFullscreen ? ' vtt-fullscreen' : ''
      }`}
    >
      <BattleMapToolbar
        title={title}
        tokenCountLabel={mapText.tokenCount(map.tokens.length)}
        controls={canEditMap ? (
          <BattleMapEditorToolbarControls
            showPartyTools={showPartyTools}
            monsterSearch={monsterSearch}
            selectedMonster={selectedMonster}
            filteredMonsterCatalog={filteredMonsterCatalog}
            monsterCatalogLength={monsterCatalog.length}
            monsterCatalogError={monsterCatalogError}
            encounterScaling={map.encounterScaling}
            isPanMode={isPanMode}
            isMeasureMode={isMeasureMode}
            isPingMode={isPingMode}
            isFogMode={isFogMode}
            mapStructureTool={mapStructureTool}
            isFullscreen={isFullscreen}
            labels={{
              syncParty: mapText.syncParty,
              monsterSearchPlaceholder: mapText.monsterSearchPlaceholder,
              srdMonster: mapText.srdMonster,
              unknownCr: mapText.unknownCr,
              noMonsterOptions: mapText.noMonsterOptions,
              addMonster: mapText.addMonster,
              encounterScaling: mapText.encounterScaling,
              basePartySize: mapText.basePartySize,
              pan: mapText.pan,
              measure: mapText.measure,
              ping: mapText.ping,
              fog: mapText.fog,
              terrain: mapText.terrain,
              wall: mapText.wall,
              door: mapText.door,
              object: mapText.object,
              hideAll: mapText.hideAll,
            }}
            onSyncPartyTokens={syncPartyTokens}
            onMonsterSearchChange={setMonsterSearch}
            onSelectedMonsterChange={setSelectedMonsterId}
            onAddHostileToken={addHostileToken}
            onUpdateEncounterScaling={updateEncounterScaling}
            onSelectTool={setExclusiveTool}
            onHideFullMap={hideFullMap}
            onToggleFullscreen={() => setIsFullscreen((value) => !value)}
            getMonsterDisplayName={getMonsterDisplayName}
            clamp={clamp}
          />
        ) : null}
      />

      <BattleMapSubtoolbar
        zoomControls={subtoolbarControls.zoomControls}
        mapSettings={subtoolbarControls.mapSettings}
        measureControl={subtoolbarControls.measureControl}
        tokenSnapControl={subtoolbarControls.tokenSnapControl}
        fogTools={subtoolbarControls.fogTools}
      />

      <BattleMapWorkspace hasInspector={canEditMap && Boolean(selectedToken || selectedFog || selectedMapStructureCell)}>
        <BattleMapStageFrame
          containerRef={containerRef}
          isPanMode={isPanMode}
          showSessionViewControls={showSessionViewControls}
          onTogglePan={() => setExclusiveTool('pan')}
        >
          <BattleMapCanvas
            width={displayWidth}
            height={displayHeight}
            x={stagePosition.x}
            y={stagePosition.y}
            scaleX={scale}
            scaleY={scale}
            draggable={isPanMode}
            onDragEnd={handleStageDragEnd}
            onMouseDown={handleStagePointerDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStagePointerUp}
            onWheel={(event) => {
              event.evt.preventDefault();
              setZoom((value) => clamp(value + (event.evt.deltaY > 0 ? -0.25 : 0.25), 0.5, 2));
            }}
            onClick={handleStageClick}
          >
            <BattleMapBackgroundLayer map={map} mapImage={mapImage} gridLines={gridLines} />

            {canEditMap ? (
              <BattleMapEditorStructureLayer
                map={map}
                terrainCells={terrainCells}
                wallCells={wallCells}
                doorCells={doorCells}
                objectCells={visibleObjectCells}
                selectedMapStructure={selectedMapStructure}
                structureDraft={structureDraft}
                getObjectShapeCells={getObjectShapeCells}
                onSelectStructure={(kind, cell) => {
                  setSelectedMapStructure({ kind, id: cell.id });
                  setSelectedTokenId(null);
                  setSelectedFogId(null);
                  emitStructureSelection(kind, cell);
                }}
                onBeginObjectExtensionDrag={beginObjectExtensionDrag}
              />
            ) : null}

            {!canEditMap ? (
              <BattleMapSessionObstacleLayer map={map} terrainCells={terrainCells} wallCells={wallCells} />
            ) : null}

            <BattleMapObjectMarkerLayer
              map={map}
              detectedHazardCells={detectedHazardCells}
              observedObjectCells={observedObjectCells}
              getObjectShapeCells={getObjectShapeCells}
              getShapeBounds={getShapeBounds}
              getHazardMarkerLabel={getHazardMarkerLabel}
            />

            <Layer>
              <BattleMapStartingPositionLayer
                positions={startingPositions}
                gridSize={map.gridSize}
                canEditMap={canEditMap}
                isDisabled={isFogMode || isPanMode || isMeasureMode || isPingMode}
                isTokenSnapEnabled={isTokenSnapEnabled}
                onUpdatePosition={updateStartingPosition}
              />
              <BattleMapRangeOverlayLayer
                map={map}
                movementRangeToken={movementRangeToken}
                movementRangeFt={displayedTokenMovementRangeFt}
                combatMovementMode={combatMovementMode}
                attackRangeOverlay={attackRangeOverlay}
                attackRangeOverlayToken={attackRangeOverlayToken}
              />
              <BattleMapTokenLayer
                tokens={visibleTokensForDisplay}
                characters={characters}
                selectedTokenId={selectedTokenId}
                isFogMode={isFogMode || mapStructureTool !== null}
                isPanMode={isPanMode}
                isMeasureMode={isMeasureMode}
                isPingMode={isPingMode}
                tokenHealthByTokenId={tokenHealthByTokenId}
                getTokenColor={getBattleTokenColor}
                canControlToken={canControlToken}
                constrainTokenDragPosition={(token, x, y) => getTokenDragPosition(token, x, y)}
                onSelectToken={(token) => {
                  if (selectedTokenId === token.id) {
                    setSelectedTokenId(null);
                    onSelectionChange?.(null);
                    return;
                  }
                  setSelectedTokenId(token.id);
                  setSelectedFogId(null);
                  setSelectedMapStructure(null);
                  emitTokenSelection(token);
                }}
                onTokenDragStart={(token) => beginTokenDragMeasure(token)}
                onTokenDragMove={(token, x, y, shiftKey) =>
                  updateTokenDragMeasure(token, x, y, isTokenSnapEnabled && !shiftKey)
                }
                onTokenDragEnd={(token, x, y, shiftKey) => {
                  const wasMoved = handleTokenMove(
                    token.id,
                    x,
                    y,
                    isTokenSnapEnabled && !shiftKey
                  );
                  finishTokenDragMeasure();
                  return wasMoved;
                }}
              />
            </Layer>

            <BattleMapVisionMaskLayer
              map={map}
              visibleVisionCells={
                showPlayerVisionPreview && showHiddenContent ? playerVisionCells : visibleVisionCells
              }
              exploredVisionCells={isVisionMaskEnabled ? exploredVisionCells : null}
              variant={showPlayerVisionPreview && showHiddenContent ? 'gm-preview' : 'player'}
            />

            <Layer listening={false}>
              <BattleMapMeasureOverlay
                start={measureStart}
                end={activeMeasureEnd}
                isMeasureMode={isMeasureMode}
                gridSize={map.gridSize}
                formatDistance={formatDistance}
              />

              <BattleMapTokenMovePreview
                measure={tokenDragMeasure}
                gridSize={map.gridSize}
                formatPathCost={formatTokenMovementPathCost}
              />

              <BattleMapPingMarkers pings={[...pings, ...activeMapPings]} />
            </Layer>

            <BattleMapFogLayer
              fogRects={map.fogRects}
              selectedFogId={selectedFogId}
              fogDraft={fogDraft}
              fogAction={fogAction}
              isInteractive={canEditMap && isFogMode}
              isGmPreview={showHiddenContent}
              onSelectFog={(fogId) => {
                setSelectedFogId(fogId);
                setSelectedTokenId(null);
                setSelectedMapStructure(null);
              }}
            />
          </BattleMapCanvas>
        </BattleMapStageFrame>

        {canEditMap && selectedToken ? (
          <BattleMapTokenInspector
            token={selectedToken}
            tokenAssets={tokenAssets}
            tokenAssetsLoading={tokenAssetsLoading}
            tokenAssetsError={tokenAssetsError}
            tokenAssetUploadBusy={tokenAssetUploadBusy}
            canUploadTokenAsset={Boolean(uploadTokenAsset)}
            labels={{
              token: mapText.token,
              close: mapText.close,
              name: mapText.name,
              imageUrl: mapText.imageUrl,
              size: mapText.size,
              hidden: mapText.hidden,
              hostile: mapText.hostile,
              fixedEncounterToken: mapText.fixedEncounterToken,
              scalingPriority: mapText.scalingPriority,
              srdMonster: mapText.srdMonster,
              speed: mapText.speed,
              senses: mapText.senses,
              languages: mapText.languages,
              traits: mapText.traits,
              actions: mapText.actions,
              legendaryActions: mapText.legendaryActions,
              duplicate: mapText.duplicate,
              front: mapText.front,
              back: mapText.back,
              deleteToken: mapText.deleteToken,
            }}
            onClose={() => setSelectedTokenId(null)}
            onUpdate={updateToken}
            onDuplicate={duplicateToken}
            onMoveLayer={moveTokenLayer}
            onDelete={deleteToken}
            onApplyTokenAsset={applyTokenAsset}
            onTokenAssetFile={(file) => {
              void handleTokenAssetFile(file);
            }}
          />
        ) : null}

        {canEditMap && selectedFog ? (
          <BattleMapFogInspector
            fog={selectedFog}
            labels={{
              fogLabel: mapText.fogLabel,
              close: mapText.close,
              width: mapText.width,
              height: mapText.height,
              deleteFog: mapText.deleteFog,
            }}
            onClose={() => setSelectedFogId(null)}
            onUpdate={updateFogRect}
            onDelete={deleteFogRect}
          />
        ) : null}

        {canEditMap && selectedMapStructure && selectedMapStructureCell ? (
          <BattleMapStructureInspector
            kind={selectedMapStructure.kind}
            cell={selectedMapStructureCell}
            clueOptions={clueOptions}
            itemOptions={itemOptions}
            enableObjectEventEditing={enableObjectEventEditing}
            labels={{
              mapFeature: mapText.mapFeature,
              terrain: mapText.terrain,
              wall: mapText.wall,
              door: mapText.door,
              object: mapText.object,
              close: mapText.close,
              name: mapText.name,
              description: mapText.description,
              terrainEffect: mapText.terrainEffect,
              width: mapText.width,
              height: mapText.height,
              doorState: mapText.doorState,
              keyItem: mapText.keyItem,
              canBreak: mapText.canBreak,
              breakDc: mapText.breakDc,
              visibleToPlayers: mapText.visibleToPlayers,
              linkedClues: mapText.linkedClues,
              linkedItems: mapText.linkedItems,
              hazard: mapText.hazard,
              hazardEnabled: mapText.hazardEnabled,
              hazardKind: mapText.hazardKind,
              hazardTrap: mapText.hazardTrap,
              hazardAmbush: mapText.hazardAmbush,
              hazardGeneric: mapText.hazardGeneric,
              hazardRadius: mapText.hazardRadius,
              hazardDc: mapText.hazardDc,
              hazardLinkedClues: mapText.hazardLinkedClues,
              hazardTriggerOnce: mapText.hazardTriggerOnce,
              hazardResetState: mapText.hazardResetState,
              fogRevealEvent: mapText.fogRevealEvent,
              eventName: mapText.eventName,
              triggerDistance: mapText.triggerDistance,
              revealRadius: mapText.revealRadius,
              triggerOnce: mapText.triggerOnce,
              addFogEvent: mapText.addFogEvent,
              removeEvent: mapText.removeEvent,
              deleteFeature: mapText.deleteFeature,
            }}
            onClose={() => setSelectedMapStructure(null)}
            onUpdate={updateStructureCell}
            onDelete={deleteStructureCell}
            onUpdateObjectRevealChecks={updateObjectRevealChecks}
            onPatchObjectRevealCheck={patchObjectRevealCheck}
            onSetObjectHazardEnabled={setObjectHazardEnabled}
            onUpdateObjectHazard={updateObjectHazard}
            onResetObjectHazardState={resetObjectHazardState}
            onAddObjectFogRevealEvent={addObjectFogRevealEvent}
            onUpdateObjectEvent={updateObjectEvent}
            onDeleteObjectEvent={deleteObjectEvent}
          />
        ) : null}
      </BattleMapWorkspace>
    </section>
  );
}
