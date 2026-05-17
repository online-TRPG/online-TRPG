import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type {
  ScenarioAssetResponseDto,
  SrdMonsterReferenceDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { Icon } from './Icon';
import { TokenFrame } from './battleMap/TokenFrame';
import type { Character } from '../types/session';
import {
  MONSTER_TOKEN_COLOR,
  NPC_TOKEN_COLOR,
  getPlayerTokenColor,
} from '../utils/sessionTokenColors';
import type { SessionTokenColor } from '../utils/sessionTokenColors';
import { getCharacterImage } from '../features/sessionPlay/utils/characterVisuals';

interface BattleMapProps {
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

type MapStructureSelection = {
  kind: MapStructureKind;
  id: string;
};

const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const feetPerGrid = 5;
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
  terrain: '이동불가',
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
type PingMarker = { id: string; x: number; y: number; label: string; expiresAt?: string };
type FogAction = 'reveal' | 'hide';
type FogRect = VttMapStateDto['fogRects'][number];
type FogBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;
type StructureBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;
type TokenPathCell = { x: number; y: number; blocked: boolean };
type TokenMovementPath = { cells: TokenPathCell[]; blocked: boolean };
type TokenDragMeasure = {
  tokenId: string;
  from: MeasurePoint;
  to: MeasurePoint;
  path: TokenMovementPath;
};
type StartingPosition = NonNullable<VttMapStateDto['startingPositions']>[number];
type MapSizeField = 'width' | 'height' | 'gridSize';
type ScenarioAsset = ScenarioAssetResponseDto;
type ObjectCell = NonNullable<VttMapStateDto['objectCells']>[number];
type ObjectShapeCell = NonNullable<ObjectCell['shapeCells']>[number];
type ObjectEvent = NonNullable<ObjectCell['events']>[number];
type ObjectHazard = NonNullable<ObjectCell['hazard']>;

function useCanvasImage(src: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const isCrossOrigin = (() => {
      try {
        return new URL(src, window.location.href).origin !== window.location.origin;
      } catch {
        return true;
      }
    })();

    const loadImage = (mode: 'anonymous' | 'default') => {
      const nextImage = new window.Image();
      if (mode === 'anonymous') {
        nextImage.crossOrigin = 'anonymous';
      }
      nextImage.onload = () => {
        if (!cancelled) {
          setImage(nextImage);
        }
      };
      nextImage.onerror = () => {
        if (cancelled) return;
        if (mode === 'anonymous') {
          loadImage('default');
          return;
        }
        setImage(null);
      };
      nextImage.src = src;
    };

    // R2 public URLs may omit CORS headers. Loading them anonymously makes the browser reject
    // otherwise displayable images, so only same-origin assets use anonymous mode by default.
    loadImage(isCrossOrigin ? 'default' : 'anonymous');

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

function getTokenLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
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

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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

function BattleToken({
  token,
  color,
  isSelected,
  opacity,
  canControl,
  isFogMode,
  isPanMode,
  isMeasureMode,
  isPingMode,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  token: VttMapStateDto['tokens'][number];
  color: SessionTokenColor;
  isSelected: boolean;
  opacity: number;
  canControl: boolean;
  isFogMode: boolean;
  isPanMode: boolean;
  isMeasureMode: boolean;
  isPingMode: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number, shiftKey: boolean) => void;
  onDragEnd: (x: number, y: number, shiftKey: boolean) => boolean;
}) {
  const tokenImage = useCanvasImage(token.imageUrl);

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={!isFogMode && !isPanMode && !isMeasureMode && !isPingMode && canControl}
      opacity={opacity}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={onDragStart}
      onDragMove={(event) => onDragMove(event.target.x(), event.target.y(), event.evt.shiftKey)}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const wasMoved = onDragEnd(event.target.x(), event.target.y(), event.evt.shiftKey);
        if (!wasMoved) {
          event.target.position({ x: token.x, y: token.y });
        }
      }}
    >
      <TokenFrame
        image={tokenImage}
        label={getTokenLabel(token.name)}
        size={token.size}
        color={color}
        isSelected={isSelected}
        isHidden={Boolean(token.hidden)}
      />
    </Group>
  );
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
  const [pings, setPings] = useState<PingMarker[]>([]);
  const [pingClock, setPingClock] = useState(Date.now());
  const suppressStageClickRef = useRef(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const canEditMap = isHost && interactionMode === 'editor';
  const showMapChrome = interactionMode === 'editor';
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
    () => map.tokens.filter((token) => canEditMap || !token.hidden),
    [canEditMap, map.tokens]
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
  const visibleObjectCells = canEditMap
    ? objectCells
    : objectCells.filter((cell) => cell.visibleToPlayers !== false);
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
  const selectedCharacter = selectedToken?.sessionCharacterId
    ? (characters.find((character) => character.id === selectedToken.sessionCharacterId) ?? null)
    : null;
  const controlledTokenIds = useMemo(
    () =>
      new Set(
        characters
          .filter((character) => character.userId === currentUserId)
          .map((character) => character.id)
      ),
    [characters, currentUserId]
  );
  const activeMeasureEnd = measureEnd ?? measurePreview;
  const gridLines = useMemo(() => {
    const lines: Array<{ isMajor: boolean; points: number[]; key: string }> = [];
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
    onChange({
      ...map,
      ...patch,
      updatedAt: new Date().toISOString(),
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

  function handleTokenMove(
    tokenId: string,
    x: number,
    y: number,
    snap = isTokenSnapEnabled
  ): boolean {
    const targetToken = map.tokens.find((token) => token.id === tokenId);
    if (!targetToken || !canControlToken(targetToken)) return false;

    const nextPosition = getTokenMovePosition(targetToken, x, y, snap);

    if (getTokenMovementPath(targetToken, nextPosition.x, nextPosition.y).blocked) {
      return false;
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

  function addPingAt(point: MeasurePoint) {
    if (interactionMode === 'session') {
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
    return (
      canEditMap ||
      Boolean(token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId))
    );
  }

  function getMovementBlockers() {
    return [
      ...terrainCells,
      ...wallCells,
      ...doorCells.filter((door) => door.state !== 'open' && door.state !== 'broken'),
    ];
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

  function isTokenPositionBlocked(token: VttMapStateDto['tokens'][number], x: number, y: number) {
    if (canEditMap) return false;

    const tokenRect = {
      x,
      y,
      width: token.size,
      height: token.size,
    };

    return getMovementBlockers().some((blocker) => rectsOverlap(tokenRect, blocker));
  }

  function getTokenMovementPath(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number
  ): TokenMovementPath {
    const cells = getGridLineCells({ x: token.x, y: token.y }, { x, y }, map).map((cell, index) => {
      const cellPosition = {
        x: clamp(cell.column * map.gridSize, 0, map.width - token.size),
        y: clamp(cell.row * map.gridSize, 0, map.height - token.size),
      };
      return {
        ...cellPosition,
        blocked: index > 0 && isTokenPositionBlocked(token, cellPosition.x, cellPosition.y),
      };
    });

    const destinationBlocked =
      (token.x !== x || token.y !== y) && isTokenPositionBlocked(token, x, y);

    return {
      cells,
      blocked: cells.some((cell) => cell.blocked) || destinationBlocked,
    };
  }

  function getWorldPointer(pointer: { x: number; y: number }) {
    return {
      x: (pointer.x - stagePosition.x) / scale,
      y: (pointer.y - stagePosition.y) / scale,
    };
  }

  function getTileFromPoint(point: { x: number; y: number }) {
    return {
      column: Math.floor(clamp(point.x, 0, map.width - 1) / map.gridSize) + 1,
      row: Math.floor(clamp(point.y, 0, map.height - 1) / map.gridSize) + 1,
    };
  }

  function emitTileSelection(point: { x: number; y: number }) {
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
      (map.pings ?? []).filter((ping) => {
        const expiresAt = Date.parse(ping.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt > pingClock;
      }),
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

  function handleStageDragEnd(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onDragEnd']>>[0]
  ) {
    const stage = event.target.getStage();
    if (!stage || event.target !== stage) return;

    setStagePosition({ x: stage.x(), y: stage.y() });
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

  function handleStagePointerDown(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onMouseDown']>>[0]
  ) {
    if (!canEditMap || isPanMode || event.evt.button !== 0) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const isBackgroundTarget = event.target === stage || event.target.name() === 'map-background';

    const world = getWorldPointer(pointer);
    setSelectedTokenId(null);
    setSelectedFogId(null);
    setSelectedMapStructure(null);

    if (mapStructureTool) {
      if (!isBackgroundTarget) return;
      setStructureDragStart({ kind: mapStructureTool, point: world });
      setStructureDraft({ kind: mapStructureTool, box: getSnappedStructureBox(world, world) });
      return;
    }

    if (!isFogMode) return;
    setFogDragStart(world);
    setFogDraft(null);
  }

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

  function handleStagePointerMove(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onMouseMove']>>[0]
  ) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const world = getWorldPointer(pointer);

    if (structureDragStart) {
      setStructureDraft({
        kind: structureDragStart.kind,
        box: getSnappedStructureBox(structureDragStart.point, world),
      });
      return;
    }

    if (fogDragStart) {
      setFogDraft(normalizeFogBox(fogDragStart, world, map, isFogSnapEnabled));
    }
  }

  function handleStageMouseMove(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onMouseMove']>>[0]
  ) {
    handleStagePointerMove(event);

    if (!isMeasureMode || !measureStart || measureEnd) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    setMeasurePreview(getWorldPointer(pointer));
  }

  function handleStagePointerUp() {
    if (structureDragStart && structureDraft) {
      if (structureDragStart.mode === 'extend' && structureDragStart.targetObjectId) {
        extendObjectCell(structureDragStart.targetObjectId, structureDraft.box);
      } else {
        addStructureBox(structureDraft.kind, structureDraft.box);
      }
      suppressStageClickRef.current = true;
    }
    setStructureDragStart(null);
    setStructureDraft(null);

    if (fogDraft) {
      applyFogBox(fogDraft);
      suppressStageClickRef.current = true;
    }
    setFogDragStart(null);
    setFogDraft(null);
  }

  function beginTokenDragMeasure(token: VttMapStateDto['tokens'][number]) {
    const center = {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
    setTokenDragMeasure({
      tokenId: token.id,
      from: center,
      to: center,
      path: getTokenMovementPath(token, token.x, token.y),
    });
  }

  function updateTokenDragMeasure(
    token: VttMapStateDto['tokens'][number],
    x: number,
    y: number,
    snap = isTokenSnapEnabled
  ) {
    const nextPosition = getTokenMovePosition(token, x, y, snap);
    setTokenDragMeasure((current) => {
      const from =
        current?.tokenId === token.id
          ? current.from
          : { x: token.x + token.size / 2, y: token.y + token.size / 2 };

      return {
        tokenId: token.id,
        from,
        to: {
          x: nextPosition.x + token.size / 2,
          y: nextPosition.y + token.size / 2,
        },
        path: getTokenMovementPath(token, nextPosition.x, nextPosition.y),
      };
    });
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

  return (
    <section
      className={`vtt-panel${showMapChrome ? '' : ' session-map'}${
        isFullscreen ? ' vtt-fullscreen' : ''
      }`}
    >
      <div className="vtt-toolbar">
        <div>
          <span className="eyebrow">{title}</span>
          <strong>{mapText.tokenCount(map.tokens.length)}</strong>
        </div>

        {canEditMap ? (
          <div className="vtt-controls">
            {showPartyTools ? (
              <button type="button" onClick={syncPartyTokens}>
                {mapText.syncParty}
              </button>
            ) : null}
            <div className="vtt-monster-picker">
              <input
                value={monsterSearch}
                onChange={(event) => setMonsterSearch(event.target.value)}
                placeholder={mapText.monsterSearchPlaceholder}
              />
              <select
                value={selectedMonster?.id ?? ''}
                onChange={(event) => setSelectedMonsterId(event.target.value)}
                disabled={monsterCatalog.length === 0}
                title={selectedMonster ? getMonsterDisplayName(selectedMonster) : mapText.srdMonster}
              >
                {filteredMonsterCatalog.length ? (
                  filteredMonsterCatalog.slice(0, 120).map((monster) => (
                    <option key={monster.id} value={monster.id}>
                      {getMonsterDisplayName(monster)} ({monster.challengeRaw ?? mapText.unknownCr})
                    </option>
                  ))
                ) : (
                  <option value="">{monsterCatalogError ?? mapText.noMonsterOptions}</option>
                )}
              </select>
            </div>
            <button type="button" onClick={addHostileToken}>
              {mapText.addMonster}
            </button>
            <button
              type="button"
              className={isPanMode ? 'active' : ''}
              onClick={() => setExclusiveTool('pan')}
            >
              {mapText.pan}
            </button>
            <button
              type="button"
              className={isMeasureMode ? 'active' : ''}
              onClick={() => setExclusiveTool('measure')}
            >
              {mapText.measure}
            </button>
            <button
              type="button"
              className={isPingMode ? 'active' : ''}
              onClick={() => setExclusiveTool('ping')}
            >
              {mapText.ping}
            </button>
            <button
              type="button"
              className={isFogMode ? 'active' : ''}
              onClick={() => setExclusiveTool('fog')}
            >
              {mapText.fog}
            </button>
            <button
              type="button"
              className={mapStructureTool === 'terrain' ? 'active' : ''}
              onClick={() => setExclusiveTool('terrain')}
            >
              {mapText.terrain}
            </button>
            <button
              type="button"
              className={mapStructureTool === 'wall' ? 'active' : ''}
              onClick={() => setExclusiveTool('wall')}
            >
              {mapText.wall}
            </button>
            <button
              type="button"
              className={mapStructureTool === 'door' ? 'active' : ''}
              onClick={() => setExclusiveTool('door')}
            >
              {mapText.door}
            </button>
            <button
              type="button"
              className={mapStructureTool === 'object' ? 'active' : ''}
              onClick={() => setExclusiveTool('object')}
            >
              {mapText.object}
            </button>
            <button type="button" onClick={hideFullMap}>
              {mapText.hideAll}
            </button>
            <button
              type="button"
              className={`vtt-fullscreen-toggle${isFullscreen ? ' active' : ''}`}
              onClick={() => setIsFullscreen((value) => !value)}
              aria-label={isFullscreen ? '전체화면 종료' : '전체화면'}
              title={isFullscreen ? '전체화면 종료 (Esc)' : '전체화면'}
            >
              <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="vtt-subtoolbar">
        <div className="vtt-zoom-controls">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
            -
          </button>
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {zoomSteps.map((step) => (
              <option key={step} value={step}>
                {Math.round(step * 100)}%
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>
            +
          </button>
          <button type="button" onClick={resetView}>
            {mapText.reset}
          </button>
        </div>

        {canEditMap ? (
          <div className="vtt-map-settings">
            <label>
              {mapText.width}
              <input
                type="number"
                min={320}
                max={4000}
                value={mapSizeDraft.width}
                onChange={(event) => updateMapSizeDraft('width', event.target.value)}
                onBlur={() => commitMapSizeField('width')}
                onKeyDown={(event) => handleMapSizeDraftKeyDown(event, 'width')}
              />
            </label>
            <label>
              {mapText.height}
              <input
                type="number"
                min={240}
                max={4000}
                value={mapSizeDraft.height}
                onChange={(event) => updateMapSizeDraft('height', event.target.value)}
                onBlur={() => commitMapSizeField('height')}
                onKeyDown={(event) => handleMapSizeDraftKeyDown(event, 'height')}
              />
            </label>
            <label>
              {mapText.grid}
              <input
                type="number"
                min={16}
                max={160}
                value={mapSizeDraft.gridSize}
                onChange={(event) => updateMapSizeDraft('gridSize', event.target.value)}
                onBlur={() => commitMapSizeField('gridSize')}
                onKeyDown={(event) => handleMapSizeDraftKeyDown(event, 'gridSize')}
              />
            </label>
          </div>
        ) : null}
        {measureStart ? (
          <button type="button" className="vtt-clear-measure" onClick={clearMeasure}>
            {mapText.clearMeasure}
          </button>
        ) : null}
        <label className="vtt-token-snap">
          <input
            type="checkbox"
            checked={isTokenSnapEnabled}
            onChange={(event) => setTokenSnapEnabled(event.target.checked)}
          />
          {mapText.tokenSnap}
        </label>
        {canEditMap && isFogMode ? (
          <div className="vtt-fog-tools">
            <button
              type="button"
              className={fogAction === 'reveal' ? 'active' : ''}
              onClick={() => setFogAction('reveal')}
            >
              {mapText.reveal}
            </button>
            <button
              type="button"
              className={fogAction === 'hide' ? 'active' : ''}
              onClick={() => setFogAction('hide')}
            >
              {mapText.hide}
            </button>
            <label>
              <input
                type="checkbox"
                checked={isFogSnapEnabled}
                onChange={(event) => setFogSnapEnabled(event.target.checked)}
              />
              {mapText.snap}
            </label>
            <button type="button" onClick={hideFullMap}>
              {mapText.hideAll}
            </button>
            <button type="button" onClick={() => updateMap({ fogRects: [] })}>
              {mapText.revealAll}
            </button>
          </div>
        ) : null}
      </div>

      <div
        className={`vtt-workspace${
          canEditMap && (selectedToken || selectedFog || selectedMapStructureCell)
            ? ' with-inspector'
            : ''
        }`}
      >
        <div className="vtt-stage-wrap" ref={containerRef}>
          <Stage
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
            onClick={(event) => {
              if (suppressStageClickRef.current) {
                suppressStageClickRef.current = false;
                return;
              }
              const stage = event.target.getStage();
              const pointer = stage?.getPointerPosition();
              if (!pointer) return;
              if (event.target === stage || event.target.name() === 'map-background') {
                setSelectedTokenId(null);
                setSelectedFogId(null);
                setSelectedMapStructure(null);
              }
              const world = getWorldPointer(pointer);
              if (isPingMode) {
                addPingAt(world);
                return;
              }
              if (isMeasureMode) {
                handleMeasureClick(world);
                return;
              }
              if (event.target === stage || event.target.name() === 'map-background') {
                if (canEditMap && mapStructureTool) {
                  return;
                }
                emitTileSelection(world);
              }
            }}
          >
            <Layer>
              <Rect name="map-background" width={map.width} height={map.height} fill="#121925" />
              {mapImage ? (
                <KonvaImage
                  name="map-background"
                  image={mapImage}
                  width={map.width}
                  height={map.height}
                  opacity={0.82}
                />
              ) : (
                <>
                  <Rect
                    name="map-background"
                    x={80}
                    y={96}
                    width={420}
                    height={180}
                    fill="#26384b"
                    opacity={0.55}
                    cornerRadius={18}
                  />
                  <Rect
                    name="map-background"
                    x={620}
                    y={340}
                    width={440}
                    height={210}
                    fill="#233928"
                    opacity={0.48}
                    cornerRadius={18}
                  />
                  <Line
                    name="map-background"
                    points={[120, 660, 420, 480, 720, 520, 1100, 260]}
                    stroke="#58718f"
                    strokeWidth={28}
                    opacity={0.28}
                    tension={0.35}
                  />
                </>
              )}
              {gridLines.map((line) => (
                <Line
                  key={line.key}
                  points={line.points}
                  stroke={line.isMajor ? 'rgba(235, 244, 255, 0.54)' : 'rgba(222, 233, 245, 0.44)'}
                  strokeWidth={line.isMajor ? 1.35 : 1}
                  listening={false}
                />
              ))}
            </Layer>

            {canEditMap ? (
              <Layer>
                {terrainCells.map((cell) => (
                  <Rect
                    key={cell.id}
                    x={cell.x}
                    y={cell.y}
                    width={cell.width}
                    height={cell.height}
                    fill="rgba(86, 96, 106, 0.48)"
                    stroke={selectedMapStructure?.id === cell.id ? '#ffffff' : '#8c99a4'}
                    strokeWidth={selectedMapStructure?.id === cell.id ? 3 : 1}
                    dash={[8, 5]}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      setSelectedMapStructure({ kind: 'terrain', id: cell.id });
                      setSelectedTokenId(null);
                      setSelectedFogId(null);
                      emitStructureSelection('terrain', cell);
                    }}
                  />
                ))}
                {wallCells.map((cell) => (
                  <Rect
                    key={cell.id}
                    x={cell.x}
                    y={cell.y}
                    width={cell.width}
                    height={cell.height}
                    fill="rgba(10, 16, 22, 0.72)"
                    stroke={selectedMapStructure?.id === cell.id ? '#ffffff' : '#111820'}
                    strokeWidth={selectedMapStructure?.id === cell.id ? 3 : 1}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      setSelectedMapStructure({ kind: 'wall', id: cell.id });
                      setSelectedTokenId(null);
                      setSelectedFogId(null);
                      emitStructureSelection('wall', cell);
                    }}
                  />
                ))}
                {doorCells.map((cell) => {
                  const doorColor =
                    cell.state === 'open'
                      ? 'rgba(76, 143, 117, 0.64)'
                      : cell.state === 'locked'
                        ? 'rgba(183, 86, 75, 0.72)'
                        : cell.state === 'broken'
                          ? 'rgba(128, 118, 106, 0.66)'
                          : 'rgba(198, 143, 52, 0.7)';
                  return (
                    <Rect
                      key={cell.id}
                      x={cell.x}
                      y={cell.y}
                      width={cell.width}
                      height={cell.height}
                      fill={doorColor}
                      stroke={selectedMapStructure?.id === cell.id ? '#ffffff' : '#ffdf8a'}
                      strokeWidth={selectedMapStructure?.id === cell.id ? 3 : 2}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        setSelectedMapStructure({ kind: 'door', id: cell.id });
                        setSelectedTokenId(null);
                        setSelectedFogId(null);
                        emitStructureSelection('door', cell);
                      }}
                    />
                  );
                })}
                {visibleObjectCells.flatMap((cell) =>
                  getObjectShapeCells(cell).map((shapeCell, shapeIndex) => (
                    <Rect
                      key={`${cell.id}:shape:${shapeIndex}`}
                      x={shapeCell.x}
                      y={shapeCell.y}
                      width={shapeCell.width}
                      height={shapeCell.height}
                      fill="rgba(121, 86, 185, 0.5)"
                      stroke={selectedMapStructure?.id === cell.id ? '#ffffff' : '#cbbcff'}
                      strokeWidth={selectedMapStructure?.id === cell.id ? 3 : 2}
                      cornerRadius={Math.min(10, map.gridSize / 8)}
                      onMouseDown={(event) => beginObjectExtensionDrag(cell, event)}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        setSelectedMapStructure({ kind: 'object', id: cell.id });
                        setSelectedTokenId(null);
                        setSelectedFogId(null);
                        emitStructureSelection('object', cell);
                      }}
                    />
                  ))
                )}
                {structureDraft ? (
                  <Rect
                    x={structureDraft.box.x}
                    y={structureDraft.box.y}
                    width={structureDraft.box.width}
                    height={structureDraft.box.height}
                    fill={
                      structureDraft.kind === 'terrain'
                        ? 'rgba(86, 96, 106, 0.3)'
                        : structureDraft.kind === 'wall'
                          ? 'rgba(10, 16, 22, 0.46)'
                          : structureDraft.kind === 'door'
                            ? 'rgba(198, 143, 52, 0.38)'
                            : 'rgba(121, 86, 185, 0.32)'
                    }
                    stroke={
                      structureDraft.kind === 'terrain'
                        ? '#8c99a4'
                        : structureDraft.kind === 'wall'
                          ? '#111820'
                          : structureDraft.kind === 'door'
                            ? '#ffdf8a'
                            : '#cbbcff'
                    }
                    strokeWidth={2}
                    dash={[10, 7]}
                    listening={false}
                  />
                ) : null}
              </Layer>
            ) : null}

            <Layer>
              {canEditMap
                ? startingPositions.map((position, index) => (
                    <Group
                      key={position.id}
                      x={position.x}
                      y={position.y}
                      draggable={!isFogMode && !isPanMode && !isMeasureMode && !isPingMode}
                      onDragEnd={(event) => {
                        event.cancelBubble = true;
                        updateStartingPosition(
                          position.id,
                          {
                            x: event.target.x(),
                            y: event.target.y(),
                          },
                          isTokenSnapEnabled && !event.evt.shiftKey
                        );
                      }}
                    >
                      <Circle
                        x={map.gridSize / 2}
                        y={map.gridSize / 2}
                        radius={map.gridSize / 2 - 6}
                        fill="rgba(121, 216, 255, 0.14)"
                        stroke="#79d8ff"
                        strokeWidth={2}
                        dash={[8, 6]}
                      />
                      <Text
                        text={String(index + 1)}
                        width={map.gridSize}
                        y={map.gridSize / 2 - 10}
                        align="center"
                        fill="#d8f6ff"
                        fontSize={18}
                        fontStyle="bold"
                      />
                    </Group>
                  ))
                : null}
              {selectedToken && selectedCharacter ? (
                <Circle
                  x={selectedToken.x + selectedToken.size / 2}
                  y={selectedToken.y + selectedToken.size / 2}
                  radius={(selectedCharacter.speed / feetPerGrid) * map.gridSize}
                  fill="rgba(121, 216, 255, 0.08)"
                  stroke="rgba(121, 216, 255, 0.55)"
                  strokeWidth={2}
                  dash={[10, 10]}
                  listening={false}
                />
              ) : null}
              {visibleTokens.map((token) => {
                const color = getBattleTokenColor(token, characters);
                return (
                  <BattleToken
                    key={token.id}
                    token={token}
                    color={color}
                    isSelected={token.id === selectedTokenId}
                    opacity={token.hidden ? 0.45 : 1}
                    canControl={canControlToken(token)}
                    isFogMode={isFogMode || mapStructureTool !== null}
                    isPanMode={isPanMode}
                    isMeasureMode={isMeasureMode}
                    isPingMode={isPingMode}
                    onSelect={() => {
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
                    onDragStart={() => beginTokenDragMeasure(token)}
                    onDragMove={(x, y, shiftKey) =>
                      updateTokenDragMeasure(token, x, y, isTokenSnapEnabled && !shiftKey)
                    }
                    onDragEnd={(x, y, shiftKey) => {
                      const wasMoved = handleTokenMove(
                        token.id,
                        x,
                        y,
                        isTokenSnapEnabled && !shiftKey
                      );
                      setTokenDragMeasure(null);
                      return wasMoved;
                    }}
                  />
                );
              })}
            </Layer>

            <Layer listening={false}>
              {measureStart && (activeMeasureEnd || isMeasureMode) ? (
                <>
                  <Circle x={measureStart.x} y={measureStart.y} radius={6} fill="#79d8ff" />
                  {activeMeasureEnd ? (
                    <>
                      <Line
                        points={[
                          measureStart.x,
                          measureStart.y,
                          activeMeasureEnd.x,
                          activeMeasureEnd.y,
                        ]}
                        stroke="#79d8ff"
                        strokeWidth={3}
                        dash={[12, 8]}
                      />
                      <Circle
                        x={activeMeasureEnd.x}
                        y={activeMeasureEnd.y}
                        radius={6}
                        fill="#79d8ff"
                      />
                      <Text
                        text={formatDistance(measureStart, activeMeasureEnd, map.gridSize)}
                        x={(measureStart.x + activeMeasureEnd.x) / 2 + 10}
                        y={(measureStart.y + activeMeasureEnd.y) / 2 - 26}
                        fill="#061017"
                        fontStyle="bold"
                        fontSize={18}
                        padding={6}
                        fillAfterStrokeEnabled
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {tokenDragMeasure ? (
                <>
                  {tokenDragMeasure.path.cells.map((cell, index) => (
                    <Rect
                      key={`${tokenDragMeasure.tokenId}:path:${index}:${cell.x}:${cell.y}`}
                      x={cell.x}
                      y={cell.y}
                      width={map.gridSize}
                      height={map.gridSize}
                      fill={
                        cell.blocked ? 'rgba(232, 91, 86, 0.3)' : 'rgba(158, 230, 168, 0.22)'
                      }
                      stroke={cell.blocked ? '#ff7771' : '#9ee6a8'}
                      strokeWidth={2}
                      dash={cell.blocked ? [4, 4] : undefined}
                    />
                  ))}
                  <Line
                    points={[
                      tokenDragMeasure.from.x,
                      tokenDragMeasure.from.y,
                      tokenDragMeasure.to.x,
                      tokenDragMeasure.to.y,
                    ]}
                    stroke={tokenDragMeasure.path.blocked ? '#ff7771' : '#9ee6a8'}
                    strokeWidth={3}
                    dash={[10, 8]}
                  />
                  <Circle
                    x={tokenDragMeasure.from.x}
                    y={tokenDragMeasure.from.y}
                    radius={5}
                    fill={tokenDragMeasure.path.blocked ? '#ff7771' : '#9ee6a8'}
                  />
                  <Text
                    text={formatDistance(tokenDragMeasure.from, tokenDragMeasure.to, map.gridSize)}
                    x={(tokenDragMeasure.from.x + tokenDragMeasure.to.x) / 2 + 10}
                    y={(tokenDragMeasure.from.y + tokenDragMeasure.to.y) / 2 - 28}
                    fill={tokenDragMeasure.path.blocked ? '#fff7f5' : '#061017'}
                    fontStyle="bold"
                    fontSize={18}
                    padding={6}
                    stroke={tokenDragMeasure.path.blocked ? '#84211f' : undefined}
                    strokeWidth={tokenDragMeasure.path.blocked ? 4 : 0}
                    fillAfterStrokeEnabled
                  />
                </>
              ) : null}

              {[...pings, ...activeMapPings].map((ping) => (
                <Group key={ping.id} x={ping.x} y={ping.y}>
                  <Circle
                    radius={28}
                    fill="rgba(255, 214, 102, 0.22)"
                    stroke="#ffd666"
                    strokeWidth={3}
                  />
                  <Circle radius={9} fill="#ffd666" />
                  <Text
                    text={ping.label}
                    x={-5}
                    y={-11}
                    fill="#061017"
                    fontStyle="bold"
                    fontSize={18}
                  />
                </Group>
              ))}
            </Layer>

            <Layer listening={canEditMap && isFogMode}>
              {map.fogRects.map((rect) => (
                <Rect
                  key={rect.id}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={rect.id === selectedFogId ? '#18283a' : '#03060a'}
                  opacity={rect.id === selectedFogId ? 0.9 : 0.82}
                  stroke={rect.id === selectedFogId ? '#79d8ff' : undefined}
                  strokeWidth={rect.id === selectedFogId ? 2 : 0}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    setSelectedFogId(rect.id);
                    setSelectedTokenId(null);
                    setSelectedMapStructure(null);
                  }}
                />
              ))}
              {fogDraft ? (
                <Rect
                  x={fogDraft.x}
                  y={fogDraft.y}
                  width={fogDraft.width}
                  height={fogDraft.height}
                  fill={
                    fogAction === 'reveal'
                      ? 'rgba(121, 216, 255, 0.16)'
                      : 'rgba(255, 214, 102, 0.18)'
                  }
                  stroke={fogAction === 'reveal' ? '#79d8ff' : '#ffd666'}
                  strokeWidth={2}
                  dash={[10, 7]}
                  listening={false}
                />
              ) : null}
            </Layer>
          </Stage>
        </div>

        {canEditMap && selectedToken ? (
          <aside className="vtt-inspector">
            <div className="vtt-inspector-head">
              <span className="eyebrow">{mapText.token}</span>
              <button type="button" onClick={() => setSelectedTokenId(null)}>
                {mapText.close}
              </button>
            </div>
            <label>
              {mapText.name}
              <input
                value={selectedToken.name}
                onChange={(event) => updateToken(selectedToken.id, { name: event.target.value })}
              />
            </label>
            <label>
              {mapText.imageUrl}
              <input
                value={selectedToken.imageUrl ?? ''}
                onChange={(event) =>
                  updateToken(selectedToken.id, { imageUrl: event.target.value || null })
                }
              />
            </label>
            {uploadTokenAsset || tokenAssets.length || tokenAssetsLoading || tokenAssetsError ? (
              <div className="vtt-asset-library">
                <div className="vtt-asset-library-head">
                  <div>
                    <span className="eyebrow">Token library</span>
                    <strong>업로드한 토큰 이미지를 현재 토큰에 바로 적용할 수 있습니다.</strong>
                  </div>
                  {uploadTokenAsset ? (
                    <label
                      className={`vtt-asset-upload${tokenAssetUploadBusy ? ' disabled' : ''}`}
                      aria-disabled={tokenAssetUploadBusy}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        disabled={tokenAssetUploadBusy}
                        onChange={(event) => {
                          void handleTokenAssetFile(event.target.files?.[0] ?? null);
                          event.currentTarget.value = '';
                        }}
                      />
                      {tokenAssetUploadBusy ? '토큰 업로드 중..' : '토큰 업로드'}
                    </label>
                  ) : null}
                </div>
                {tokenAssetsError ? <p className="panel-error">{tokenAssetsError}</p> : null}
                {tokenAssetsLoading ? (
                  <p className="helper-copy">토큰 자산 목록을 불러오는 중입니다.</p>
                ) : tokenAssets.length ? (
                  <div className="vtt-asset-grid">
                    {tokenAssets.map((asset) => {
                      const isSelected = selectedToken.imageUrl === asset.publicUrl;
                      return (
                        <article
                          key={asset.id}
                          className={`vtt-asset-card${isSelected ? ' selected' : ''}`}
                        >
                          <img
                            className="vtt-asset-preview"
                            src={asset.publicUrl}
                            alt={asset.fileName}
                          />
                          <div className="vtt-asset-meta">
                            <strong>{asset.fileName}</strong>
                            <span>{Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB</span>
                          </div>
                          <button type="button" onClick={() => applyTokenAsset(asset)}>
                            {isSelected ? '현재 토큰' : '이 토큰 적용'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="vtt-asset-empty">
                    업로드한 토큰 이미지가 아직 없습니다. 자주 쓰는 말, 몬스터, NPC 토큰을 올려두면
                    맵 위 토큰에 바로 재사용할 수 있습니다.
                  </div>
                )}
              </div>
            ) : null}
            <div className="vtt-field-row">
              <label>
                X
                <input
                  type="number"
                  value={selectedToken.x}
                  onChange={(event) =>
                    updateToken(selectedToken.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={selectedToken.y}
                  onChange={(event) =>
                    updateToken(selectedToken.id, { y: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                {mapText.size}
                <input
                  type="number"
                  min={24}
                  max={160}
                  value={selectedToken.size}
                  onChange={(event) =>
                    updateToken(selectedToken.id, { size: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <div className="vtt-check-row">
              <label>
                <input
                  type="checkbox"
                  checked={selectedToken.hidden === true}
                  onChange={(event) =>
                    updateToken(selectedToken.id, { hidden: event.target.checked })
                  }
                />
                {mapText.hidden}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedToken.isHostile === true}
                  onChange={(event) =>
                    updateToken(selectedToken.id, { isHostile: event.target.checked })
                  }
                />
                {mapText.hostile}
              </label>
            </div>
            {selectedToken.monster ? (
              <div className="vtt-monster-card">
                <span className="eyebrow">{mapText.srdMonster}</span>
                <strong>{getMonsterDisplayName(selectedToken.monster)}</strong>
                <p>{selectedToken.monster.basicRaw}</p>
                <ul className="vtt-monster-stats">
                  <li>AC: {selectedToken.monster.armorClassRaw ?? '-'}</li>
                  <li>HP: {selectedToken.monster.hitPointsRaw ?? '-'}</li>
                  <li>
                    {mapText.speed}: {selectedToken.monster.speedRaw ?? '-'}
                  </li>
                  <li>CR: {selectedToken.monster.challengeRaw ?? '-'}</li>
                </ul>
                <p>
                  {mapText.senses}: {selectedToken.monster.sensesRaw ?? '-'}
                </p>
                <p>
                  {mapText.languages}: {selectedToken.monster.languagesRaw ?? '-'}
                </p>
                {selectedToken.monster.traits.length ? (
                  <p>
                    {mapText.traits}: {selectedToken.monster.traits.join(', ')}
                  </p>
                ) : null}
                {selectedToken.monster.actions.length ? (
                  <p>
                    {mapText.actions}: {selectedToken.monster.actions.join(', ')}
                  </p>
                ) : null}
                {selectedToken.monster.legendaryActions.length ? (
                  <p>
                    {mapText.legendaryActions}: {selectedToken.monster.legendaryActions.join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="vtt-inspector-actions">
              <button type="button" onClick={() => duplicateToken(selectedToken.id)}>
                {mapText.duplicate}
              </button>
              <button type="button" onClick={() => moveTokenLayer(selectedToken.id, 'front')}>
                {mapText.front}
              </button>
              <button type="button" onClick={() => moveTokenLayer(selectedToken.id, 'back')}>
                {mapText.back}
              </button>
            </div>
            <button type="button" className="danger" onClick={() => deleteToken(selectedToken.id)}>
              {mapText.deleteToken}
            </button>
          </aside>
        ) : null}

        {canEditMap && selectedFog ? (
          <aside className="vtt-inspector">
            <div className="vtt-inspector-head">
              <span className="eyebrow">{mapText.fogLabel}</span>
              <button type="button" onClick={() => setSelectedFogId(null)}>
                {mapText.close}
              </button>
            </div>
            <div className="vtt-field-row">
              <label>
                X
                <input
                  type="number"
                  value={selectedFog.x}
                  onChange={(event) =>
                    updateFogRect(selectedFog.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={selectedFog.y}
                  onChange={(event) =>
                    updateFogRect(selectedFog.id, { y: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <div className="vtt-field-row">
              <label>
                {mapText.width}
                <input
                  type="number"
                  value={selectedFog.width}
                  onChange={(event) =>
                    updateFogRect(selectedFog.id, { width: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                {mapText.height}
                <input
                  type="number"
                  value={selectedFog.height}
                  onChange={(event) =>
                    updateFogRect(selectedFog.id, { height: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <button type="button" className="danger" onClick={() => deleteFogRect(selectedFog.id)}>
              {mapText.deleteFog}
            </button>
          </aside>
        ) : null}

        {canEditMap && selectedMapStructure && selectedMapStructureCell ? (
          <aside className="vtt-inspector">
            <div className="vtt-inspector-head">
              <span className="eyebrow">
                {mapText.mapFeature} / {mapText[selectedMapStructure.kind]}
              </span>
              <button type="button" onClick={() => setSelectedMapStructure(null)}>
                {mapText.close}
              </button>
            </div>
            <label>
              {mapText.name}
              <input
                value={selectedMapStructureCell.name ?? ''}
                onChange={(event) =>
                  updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                    name: event.target.value || null,
                  })
                }
              />
            </label>
            <label>
              {mapText.description}
              <input
                value={selectedMapStructureCell.description ?? ''}
                onChange={(event) =>
                  updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                    description: event.target.value || null,
                  })
                }
              />
            </label>
            <div className="vtt-field-row">
              <label>
                X
                <input
                  type="number"
                  value={selectedMapStructureCell.x}
                  onChange={(event) =>
                    updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                      x: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={selectedMapStructureCell.y}
                  onChange={(event) =>
                    updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                      y: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="vtt-field-row">
              <label>
                {mapText.width}
                <input
                  type="number"
                  value={selectedMapStructureCell.width}
                  onChange={(event) =>
                    updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                      width: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                {mapText.height}
                <input
                  type="number"
                  value={selectedMapStructureCell.height}
                  onChange={(event) =>
                    updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                      height: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>

            {selectedMapStructure.kind === 'door' ? (
              <>
                <label>
                  {mapText.doorState}
                  <select
                    value={(selectedMapStructureCell as NonNullable<VttMapStateDto['doorCells']>[number]).state}
                    onChange={(event) =>
                      updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                        state: event.target.value as 'open' | 'closed' | 'locked' | 'broken',
                      })
                    }
                  >
                    <option value="open">열림</option>
                    <option value="closed">닫힘</option>
                    <option value="locked">잠김</option>
                    <option value="broken">파괴됨</option>
                  </select>
                </label>
                <label>
                  {mapText.keyItem}
                  <input
                    value={
                      (selectedMapStructureCell as NonNullable<VttMapStateDto['doorCells']>[number])
                        .keyItemId ?? ''
                    }
                    onChange={(event) =>
                      updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                        keyItemId: event.target.value || null,
                      })
                    }
                  />
                </label>
                <div className="vtt-check-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        (selectedMapStructureCell as NonNullable<VttMapStateDto['doorCells']>[number])
                          .canBreak === true
                      }
                      onChange={(event) =>
                        updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                          canBreak: event.target.checked,
                        })
                      }
                    />
                    {mapText.canBreak}
                  </label>
                </div>
                <label>
                  {mapText.breakDc}
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={
                      (selectedMapStructureCell as NonNullable<VttMapStateDto['doorCells']>[number])
                        .breakCheckDc ?? ''
                    }
                    onChange={(event) =>
                      updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                        breakCheckDc: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </label>
              </>
            ) : null}

            {selectedMapStructure.kind === 'object' ? (
              <>
                <div className="vtt-check-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        (selectedMapStructureCell as NonNullable<VttMapStateDto['objectCells']>[number])
                          .visibleToPlayers !== false
                      }
                      onChange={(event) =>
                        updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                          visibleToPlayers: event.target.checked,
                        })
                      }
                    />
                    {mapText.visibleToPlayers}
                  </label>
                </div>
                <label>
                  {mapText.linkedClues}
                  <select
                    multiple
                    size={Math.min(Math.max(clueOptions.length, 3), 8)}
                    value={(
                      selectedMapStructureCell as ObjectCell
                    ).hiddenClueIds ?? []}
                    onChange={(event) =>
                      updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                        hiddenClueIds: Array.from(event.target.selectedOptions, (option) => option.value).slice(
                          0,
                          30
                        ),
                      } as Partial<ObjectCell>)
                    }
                  >
                    {clueOptions.length ? (
                      clueOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option disabled>선택 가능한 단서 없음</option>
                    )}
                  </select>
                </label>
                <label>
                  {mapText.linkedItems}
                  <select
                    multiple
                    size={Math.min(Math.max(itemOptions.length, 3), 8)}
                    value={(
                      selectedMapStructureCell as ObjectCell
                    ).hiddenItemIds ?? []}
                    onChange={(event) =>
                      updateStructureCell(selectedMapStructure.kind, selectedMapStructure.id, {
                        hiddenItemIds: Array.from(event.target.selectedOptions, (option) => option.value).slice(
                          0,
                          30
                        ),
                      } as Partial<ObjectCell>)
                    }
                  >
                    {itemOptions.length ? (
                      itemOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option disabled>선택 가능한 아이템 없음</option>
                    )}
                  </select>
                </label>
                <div className="vtt-object-events">
                  <span className="eyebrow">{mapText.hazard}</span>
                  <div className="vtt-check-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean((selectedMapStructureCell as ObjectCell).hazard)}
                        onChange={(event) => setObjectHazardEnabled(event.target.checked)}
                      />
                      {mapText.hazardEnabled}
                    </label>
                  </div>
                  {(selectedMapStructureCell as ObjectCell).hazard ? (
                    <>
                      <label>
                        {mapText.hazardKind}
                        <select
                          value={(selectedMapStructureCell as ObjectCell).hazard?.kind ?? 'TRAP'}
                          onChange={(event) =>
                            updateObjectHazard({
                              kind: event.target.value as ObjectHazard['kind'],
                            })
                          }
                        >
                          <option value="TRAP">{mapText.hazardTrap}</option>
                          <option value="AMBUSH">{mapText.hazardAmbush}</option>
                          <option value="HAZARD">{mapText.hazardGeneric}</option>
                        </select>
                      </label>
                      <div className="vtt-field-row">
                        <label>
                          {mapText.hazardRadius}
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={
                              (selectedMapStructureCell as ObjectCell).hazard?.detectionRadiusCells ?? 3
                            }
                            onChange={(event) =>
                              updateObjectHazard({
                                detectionRadiusCells: clamp(Number(event.target.value) || 3, 1, 20),
                              })
                            }
                          />
                        </label>
                        <label>
                          {mapText.hazardDc}
                          <input
                            type="number"
                            min={1}
                            max={40}
                            value={(selectedMapStructureCell as ObjectCell).hazard?.detectionDc ?? 12}
                            onChange={(event) =>
                              updateObjectHazard({
                                detectionDc: clamp(Number(event.target.value) || 12, 1, 40),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        {mapText.hazardLinkedClues}
                        <select
                          multiple
                          size={Math.min(Math.max(clueOptions.length, 3), 8)}
                          value={(selectedMapStructureCell as ObjectCell).hazard?.linkedClueIds ?? []}
                          onChange={(event) =>
                            updateObjectHazard({
                              linkedClueIds: Array.from(
                                event.target.selectedOptions,
                                (option) => option.value
                              ).slice(0, 30),
                            })
                          }
                        >
                          {clueOptions.length ? (
                            clueOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))
                          ) : (
                            <option disabled>선택 가능한 단서 없음</option>
                          )}
                        </select>
                      </label>
                      <div className="vtt-check-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={(selectedMapStructureCell as ObjectCell).hazard?.triggerOnce !== false}
                            onChange={(event) =>
                              updateObjectHazard({ triggerOnce: event.target.checked })
                            }
                          />
                          {mapText.hazardTriggerOnce}
                        </label>
                      </div>
                      <button type="button" className="ghost small" onClick={resetObjectHazardState}>
                        {mapText.hazardResetState}
                      </button>
                    </>
                  ) : null}
                </div>
                {enableObjectEventEditing ? (
                  <div className="vtt-object-events">
                    <span className="eyebrow">{mapText.fogRevealEvent}</span>
                    {((selectedMapStructureCell as ObjectCell).events ?? []).map((event) => (
                      <div className="vtt-object-event" key={event.id}>
                        <label>
                          {mapText.eventName}
                          <input
                            value={event.name ?? ''}
                            onChange={(changeEvent) =>
                              updateObjectEvent(event.id, (current) => ({
                                ...current,
                                name: changeEvent.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="vtt-field-row">
                          <label>
                            {mapText.triggerDistance}
                            <input
                              type="number"
                              min={0}
                              value={event.trigger?.distanceFeet ?? 15}
                              onChange={(changeEvent) =>
                                updateObjectEvent(event.id, (current) => ({
                                  ...current,
                                  trigger: {
                                    ...current.trigger,
                                    distanceFeet: clamp(Number(changeEvent.target.value) || 0, 0, 500),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            {mapText.revealRadius}
                            <input
                              type="number"
                              min={5}
                              value={event.effect?.revealRadiusFeet ?? 30}
                              onChange={(changeEvent) =>
                                updateObjectEvent(event.id, (current) => ({
                                  ...current,
                                  effect: {
                                    ...current.effect,
                                    revealRadiusFeet: clamp(Number(changeEvent.target.value) || 5, 5, 500),
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div className="vtt-check-row">
                          <label>
                            <input
                              type="checkbox"
                              checked={event.trigger?.once !== false}
                              onChange={(changeEvent) =>
                                updateObjectEvent(event.id, (current) => ({
                                  ...current,
                                  trigger: { ...current.trigger, once: changeEvent.target.checked },
                                }))
                              }
                            />
                            {mapText.triggerOnce}
                          </label>
                        </div>
                        <button type="button" className="ghost small" onClick={() => deleteObjectEvent(event.id)}>
                          {mapText.removeEvent}
                        </button>
                      </div>
                    ))}
                    <button type="button" className="small" onClick={addObjectFogRevealEvent}>
                      {mapText.addFogEvent}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            <button
              type="button"
              className="danger"
              onClick={() => deleteStructureCell(selectedMapStructure.kind, selectedMapStructure.id)}
            >
              {mapText.deleteFeature}
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
