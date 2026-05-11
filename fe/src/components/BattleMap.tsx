import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type {
  ScenarioAssetResponseDto,
  SrdMonsterReferenceDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { Character } from '../types/session';

interface BattleMapProps {
  map: VttMapStateDto;
  characters: Character[];
  isHost: boolean;
  onChange: (map: VttMapStateDto) => void;
  currentUserId?: string | null;
  title?: string;
  showPartyTools?: boolean;
  monsterCatalog?: SrdMonsterReferenceDto[];
  monsterCatalogError?: string | null;
  tokenAssets?: ScenarioAssetResponseDto[];
  tokenAssetsLoading?: boolean;
  tokenAssetsError?: string | null;
  uploadTokenAsset?: (file: File | null) => Promise<ScenarioAssetResponseDto | null>;
}

const tokenPalette = ['#79d8ff', '#f6d365', '#9ee6a8', '#f59cb1', '#c4a7ff', '#ffa87a'];
const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const feetPerGrid = 5;
const mapText = {
  tokenCount: (count: number) => '\uD1A0\uD070 ' + count + '\uAC1C',
  mapImagePlaceholder: '\uB9F5 \uC774\uBBF8\uC9C0 URL',
  applyMap: '\uB9F5 \uC801\uC6A9',
  syncParty: '\uD30C\uD2F0 \uD1A0\uD070 \uB3D9\uAE30\uD654',
  monsterSearchPlaceholder: 'SRD \uBAAC\uC2A4\uD130 \uAC80\uC0C9',
  unknownCr: 'CR \uBBF8\uC0C1',
  noMonsterOptions: '\uC120\uD0DD \uAC00\uB2A5\uD55C \uBAAC\uC2A4\uD130 \uC5C6\uC74C',
  addMonster: '\uBAAC\uC2A4\uD130 \uCD94\uAC00',
  pan: '\uC774\uB3D9',
  measure: '\uAC70\uB9AC \uCE21\uC815',
  ping: '\uD551',
  fog: '\uC548\uAC1C',
  hideAll: '\uC804\uCCB4 \uAC00\uB9AC\uAE30',
  reset: '\uCD08\uAE30\uD654',
  width: '\uAC00\uB85C',
  height: '\uC138\uB85C',
  grid: '\uACA9\uC790',
  startCount: '\uC2DC\uC791 \uC778\uC6D0',
  generateStarts: '\uC2DC\uC791 \uC704\uCE58 \uC0DD\uC131',
  clearStarts: '\uC2DC\uC791 \uC704\uCE58 \uC0AD\uC81C',
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
} as const;

type MeasurePoint = { x: number; y: number };
type PingMarker = { id: string; x: number; y: number; label: string };
type FogAction = 'reveal' | 'hide';
type FogRect = VttMapStateDto['fogRects'][number];
type FogBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;
type TokenDragMeasure = { tokenId: string; from: MeasurePoint; to: MeasurePoint };
type StartingPosition = NonNullable<VttMapStateDto['startingPositions']>[number];
type MapSizeField = 'width' | 'height' | 'gridSize';
type ScenarioAsset = ScenarioAssetResponseDto;

function useCanvasImage(src: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;

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

    // Some R2/public bucket images render in <img> but fail anonymous canvas fetches.
    loadImage('anonymous');

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

function getTokenLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function snapToGrid(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
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

function buildStartingPositions(count: number, map: VttMapStateDto): StartingPosition[] {
  return Array.from({ length: Math.max(1, Math.min(count, 12)) }, (_, index) =>
    getDefaultStartingPosition(index, map)
  );
}

function formatDistance(from: MeasurePoint, to: MeasurePoint, gridSize: number) {
  const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceFt = Math.round((distancePx / gridSize) * feetPerGrid);
  return `${distanceFt} ft`;
}

function BattleToken({
  token,
  fill,
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
  fill: string;
  isSelected: boolean;
  opacity: number;
  canControl: boolean;
  isFogMode: boolean;
  isPanMode: boolean;
  isMeasureMode: boolean;
  isPingMode: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, shiftKey: boolean) => void;
}) {
  const tokenImage = useCanvasImage(token.imageUrl);
  const radius = token.size / 2 - 4;

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
      onDragMove={(event) => onDragMove(event.target.x(), event.target.y())}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDragEnd(event.target.x(), event.target.y(), event.evt.shiftKey);
      }}
    >
      {tokenImage ? (
        <>
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();
              ctx.arc(token.size / 2, token.size / 2, radius, 0, Math.PI * 2);
              ctx.closePath();
            }}
          >
            <KonvaImage image={tokenImage} width={token.size} height={token.size} />
          </Group>
          <Circle
            x={token.size / 2}
            y={token.size / 2}
            radius={radius}
            fill="rgba(0, 0, 0, 0)"
            stroke={isSelected ? '#ffffff' : token.hidden ? '#cbd6e2' : fill}
            strokeWidth={isSelected ? 5 : 4}
            shadowColor="black"
            shadowBlur={14}
            shadowOpacity={0.35}
          />
        </>
      ) : (
        <>
          <Circle
            x={token.size / 2}
            y={token.size / 2}
            radius={radius}
            fill={fill}
            stroke={isSelected ? '#ffffff' : token.hidden ? '#cbd6e2' : '#101825'}
            strokeWidth={isSelected ? 5 : 4}
            shadowColor="black"
            shadowBlur={14}
            shadowOpacity={0.35}
          />
          <Text
            text={getTokenLabel(token.name)}
            width={token.size}
            y={token.size / 2 - 9}
            align="center"
            fill="#061017"
            fontSize={18}
            fontStyle="bold"
          />
        </>
      )}
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
  showPartyTools = true,
  monsterCatalog = [],
  monsterCatalogError = null,
  tokenAssets = [],
  tokenAssetsLoading = false,
  tokenAssetsError = null,
  uploadTokenAsset,
}: BattleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [containerHeight, setContainerHeight] = useState(720);
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
  const [measureStart, setMeasureStart] = useState<MeasurePoint | null>(null);
  const [measureEnd, setMeasureEnd] = useState<MeasurePoint | null>(null);
  const [measurePreview, setMeasurePreview] = useState<MeasurePoint | null>(null);
  const [tokenDragMeasure, setTokenDragMeasure] = useState<TokenDragMeasure | null>(null);
  const [pings, setPings] = useState<PingMarker[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState(map.imageUrl ?? '');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [selectedMonsterId, setSelectedMonsterId] = useState('');
  const [tokenAssetUploadBusy, setTokenAssetUploadBusy] = useState(false);
  const [mapSizeDraft, setMapSizeDraft] = useState({
    width: String(map.width),
    height: String(map.height),
    gridSize: String(map.gridSize),
  });
  const [startPositionCount, setStartPositionCount] = useState(
    Math.max(1, Math.min(map.startingPositions?.length || Math.max(characters.length, 4), 12))
  );
  const mapImage = useCanvasImage(map.imageUrl);
  const visibleTokens = useMemo(
    () => map.tokens.filter((token) => isHost || !token.hidden),
    [isHost, map.tokens]
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
    setImageUrlInput(map.imageUrl ?? '');
  }, [map.imageUrl]);

  useEffect(() => {
    setMapSizeDraft({
      width: String(map.width),
      height: String(map.height),
      gridSize: String(map.gridSize),
    });
  }, [map.gridSize, map.height, map.width]);

  useEffect(() => {
    setStartPositionCount(
      Math.max(1, Math.min(startingPositions.length || Math.max(characters.length, 4), 12))
    );
  }, [characters.length, startingPositions.length]);

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

  function handleMapSizeDraftKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: MapSizeField
  ) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitMapSizeField(field);
    event.currentTarget.blur();
  }

  function handleTokenMove(tokenId: string, x: number, y: number, snap = isTokenSnapEnabled) {
    const targetToken = map.tokens.find((token) => token.id === tokenId);
    if (!targetToken || !canControlToken(targetToken)) return;

    updateMap({
      tokens: map.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              x: Math.min(
                Math.max(snap ? snapToGrid(x, map.gridSize) : x, 0),
                map.width - token.size
              ),
              y: Math.min(
                Math.max(snap ? snapToGrid(y, map.gridSize) : y, 0),
                map.height - token.size
              ),
            }
          : token
      ),
    });
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
    const additions = characters.flatMap((character, index) =>
      knownTokenIds.has(character.id)
        ? []
        : [
            {
              ...getPartyPlacement(index),
              id: `token:${character.id}`,
              sessionCharacterId: character.id,
              name: character.name,
              imageUrl: character.avatarUrl ?? null,
              size: map.gridSize,
              hidden: false,
              isHostile: false,
              monster: null,
            },
          ]
    );

    if (!additions.length) return;
    updateMap({ tokens: [...map.tokens, ...additions] });
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

  function generateStartingPositions() {
    const nextPositions = buildStartingPositions(startPositionCount, map);
    updateMap({ startingPositions: nextPositions });
  }

  function clearStartingPositions() {
    updateMap({ startingPositions: [] });
  }

  function addPingAt(point: MeasurePoint) {
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
      isHost ||
      Boolean(token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId))
    );
  }

  function getWorldPointer(pointer: { x: number; y: number }) {
    return {
      x: (pointer.x - stagePosition.x) / scale,
      y: (pointer.y - stagePosition.y) / scale,
    };
  }

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

  function handleFogPointerDown(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onMouseDown']>>[0]
  ) {
    if (!isHost || !isFogMode || isPanMode || event.evt.button !== 0) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    const world = getWorldPointer(pointer);
    setFogDragStart(world);
    setFogDraft(null);
    setSelectedTokenId(null);
    setSelectedFogId(null);
  }

  function handleStagePointerMove(
    event: Parameters<NonNullable<ComponentProps<typeof Stage>['onMouseMove']>>[0]
  ) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const world = getWorldPointer(pointer);

    if (!fogDragStart) return;
    setFogDraft(normalizeFogBox(fogDragStart, world, map, isFogSnapEnabled));
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

  function handleFogPointerUp() {
    if (fogDraft) {
      applyFogBox(fogDraft);
    }
    setFogDragStart(null);
    setFogDraft(null);
  }

  function beginTokenDragMeasure(token: VttMapStateDto['tokens'][number]) {
    const center = {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
    setTokenDragMeasure({ tokenId: token.id, from: center, to: center });
  }

  function updateTokenDragMeasure(token: VttMapStateDto['tokens'][number], x: number, y: number) {
    setTokenDragMeasure((current) => {
      const from =
        current?.tokenId === token.id
          ? current.from
          : { x: token.x + token.size / 2, y: token.y + token.size / 2 };

      return {
        tokenId: token.id,
        from,
        to: {
          x: x + token.size / 2,
          y: y + token.size / 2,
        },
      };
    });
  }

  function setExclusiveTool(tool: 'pan' | 'fog' | 'measure' | 'ping') {
    setPanMode(tool === 'pan' ? !isPanMode : false);
    setFogMode(tool === 'fog' ? !isFogMode : false);
    setMeasureMode(tool === 'measure' ? !isMeasureMode : false);
    setPingMode(tool === 'ping' ? !isPingMode : false);
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
    <section className="vtt-panel">
      <div className="vtt-toolbar">
        <div>
          <span className="eyebrow">{title}</span>
          <strong>{mapText.tokenCount(map.tokens.length)}</strong>
        </div>

        {isHost ? (
          <div className="vtt-controls">
            <input
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              placeholder={mapText.mapImagePlaceholder}
            />
            <button
              type="button"
              onClick={() => updateMap({ imageUrl: imageUrlInput.trim() || null })}
            >
              {mapText.applyMap}
            </button>
            {showPartyTools ? (
              <button type="button" onClick={syncPartyTokens}>
                {mapText.syncParty}
              </button>
            ) : null}
            <input
              value={monsterSearch}
              onChange={(event) => setMonsterSearch(event.target.value)}
              placeholder={mapText.monsterSearchPlaceholder}
            />
            <select
              value={selectedMonster?.id ?? ''}
              onChange={(event) => setSelectedMonsterId(event.target.value)}
              disabled={monsterCatalog.length === 0}
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
            <button type="button" onClick={hideFullMap}>
              {mapText.hideAll}
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

        {isHost ? (
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
            <label>
              {mapText.startCount}
              <input
                type="number"
                min={1}
                max={12}
                value={startPositionCount}
                onChange={(event) =>
                  setStartPositionCount(clamp(Number(event.target.value) || 1, 1, 12))
                }
              />
            </label>
            <button type="button" onClick={generateStartingPositions}>
              {mapText.generateStarts}
            </button>
            <button type="button" onClick={clearStartingPositions}>
              {mapText.clearStarts}
            </button>
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
        {isHost && isFogMode ? (
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

      <div className={`vtt-workspace${selectedToken || selectedFog ? ' with-inspector' : ''}`}>
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
            onMouseDown={handleFogPointerDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleFogPointerUp}
            onWheel={(event) => {
              event.evt.preventDefault();
              setZoom((value) => clamp(value + (event.evt.deltaY > 0 ? -0.25 : 0.25), 0.5, 2));
            }}
            onClick={(event) => {
              const stage = event.target.getStage();
              const pointer = stage?.getPointerPosition();
              if (!pointer) return;
              if (event.target === stage || event.target.name() === 'map-background') {
                setSelectedTokenId(null);
                setSelectedFogId(null);
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
            }}
          >
            <Layer>
              <Rect name="map-background" width={map.width} height={map.height} fill="#121925" />
              {mapImage ? (
                <KonvaImage image={mapImage} width={map.width} height={map.height} opacity={0.82} />
              ) : (
                <>
                  <Rect
                    x={80}
                    y={96}
                    width={420}
                    height={180}
                    fill="#26384b"
                    opacity={0.55}
                    cornerRadius={18}
                  />
                  <Rect
                    x={620}
                    y={340}
                    width={440}
                    height={210}
                    fill="#233928"
                    opacity={0.48}
                    cornerRadius={18}
                  />
                  <Line
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

            <Layer>
              {isHost
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
              {visibleTokens.map((token, index) => {
                const fill = token.isHostile
                  ? '#ff6b6b'
                  : tokenPalette[index % tokenPalette.length];
                return (
                  <BattleToken
                    key={token.id}
                    token={token}
                    fill={fill}
                    isSelected={token.id === selectedTokenId}
                    opacity={token.hidden ? 0.45 : 1}
                    canControl={canControlToken(token)}
                    isFogMode={isFogMode}
                    isPanMode={isPanMode}
                    isMeasureMode={isMeasureMode}
                    isPingMode={isPingMode}
                    onSelect={() => {
                      setSelectedTokenId(token.id);
                      setSelectedFogId(null);
                    }}
                    onDragStart={() => beginTokenDragMeasure(token)}
                    onDragMove={(x, y) => updateTokenDragMeasure(token, x, y)}
                    onDragEnd={(x, y, shiftKey) => {
                      handleTokenMove(token.id, x, y, isTokenSnapEnabled && !shiftKey);
                      setTokenDragMeasure(null);
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
                  <Line
                    points={[
                      tokenDragMeasure.from.x,
                      tokenDragMeasure.from.y,
                      tokenDragMeasure.to.x,
                      tokenDragMeasure.to.y,
                    ]}
                    stroke="#9ee6a8"
                    strokeWidth={3}
                    dash={[10, 8]}
                  />
                  <Circle
                    x={tokenDragMeasure.from.x}
                    y={tokenDragMeasure.from.y}
                    radius={5}
                    fill="#9ee6a8"
                  />
                  <Text
                    text={formatDistance(tokenDragMeasure.from, tokenDragMeasure.to, map.gridSize)}
                    x={(tokenDragMeasure.from.x + tokenDragMeasure.to.x) / 2 + 10}
                    y={(tokenDragMeasure.from.y + tokenDragMeasure.to.y) / 2 - 28}
                    fill="#061017"
                    fontStyle="bold"
                    fontSize={18}
                    padding={6}
                    fillAfterStrokeEnabled
                  />
                </>
              ) : null}

              {pings.map((ping) => (
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

            <Layer listening={isHost && isFogMode}>
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

        {isHost && selectedToken ? (
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

        {isHost && selectedFog ? (
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
      </div>
    </section>
  );
}
