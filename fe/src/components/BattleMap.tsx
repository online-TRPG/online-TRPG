import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { VttMapStateDto } from "@trpg/shared-types";
import type { Character } from "../types/session";

interface BattleMapProps {
  map: VttMapStateDto;
  characters: Character[];
  isHost: boolean;
  onChange: (map: VttMapStateDto) => void;
  currentUserId?: string | null;
  title?: string;
  showPartyTools?: boolean;
}

const tokenPalette = ["#79d8ff", "#f6d365", "#9ee6a8", "#f59cb1", "#c4a7ff", "#ffa87a"];
const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const feetPerGrid = 5;

type MeasurePoint = { x: number; y: number };
type PingMarker = { id: string; x: number; y: number; label: string };
type FogAction = "reveal" | "hide";
type FogRect = VttMapStateDto["fogRects"][number];
type FogBox = Pick<FogRect, "x" | "y" | "width" | "height">;
type TokenDragMeasure = { tokenId: string; from: MeasurePoint; to: MeasurePoint };

function useCanvasImage(src: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

function getTokenLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function snapToGrid(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function formatDistance(from: MeasurePoint, to: MeasurePoint, gridSize: number) {
  const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceFt = Math.round((distancePx / gridSize) * feetPerGrid);
  return `${distanceFt} ft`;
}

function normalizeFogBox(from: MeasurePoint, to: MeasurePoint, map: VttMapStateDto, snap: boolean): FogBox | null {
  const rawLeft = clamp(Math.min(from.x, to.x), 0, map.width);
  const rawTop = clamp(Math.min(from.y, to.y), 0, map.height);
  const rawRight = clamp(Math.max(from.x, to.x), 0, map.width);
  const rawBottom = clamp(Math.max(from.y, to.y), 0, map.height);

  const left = snap ? clamp(Math.floor(rawLeft / map.gridSize) * map.gridSize, 0, map.width) : rawLeft;
  const top = snap ? clamp(Math.floor(rawTop / map.gridSize) * map.gridSize, 0, map.height) : rawTop;
  const right = snap ? clamp(Math.ceil(rawRight / map.gridSize) * map.gridSize, 0, map.width) : rawRight;
  const bottom = snap ? clamp(Math.ceil(rawBottom / map.gridSize) * map.gridSize, 0, map.height) : rawBottom;

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
    { ...rect, id: `${rect.id}:left:${Date.now()}`, y: top, width: left - rect.x, height: bottom - top },
    { ...rect, id: `${rect.id}:right:${Date.now()}`, x: right, y: top, width: rectRight - right, height: bottom - top },
  ];

  return pieces.filter((piece) => piece.width > 0 && piece.height > 0);
}

export function BattleMap({
  map,
  characters,
  isHost,
  onChange,
  currentUserId = null,
  title = "Tabletop",
  showPartyTools = true,
}: BattleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [isFogMode, setFogMode] = useState(false);
  const [isPanMode, setPanMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedFogId, setSelectedFogId] = useState<string | null>(null);
  const [isMeasureMode, setMeasureMode] = useState(false);
  const [isPingMode, setPingMode] = useState(false);
  const [isTokenSnapEnabled, setTokenSnapEnabled] = useState(true);
  const [fogAction, setFogAction] = useState<FogAction>("reveal");
  const [isFogSnapEnabled, setFogSnapEnabled] = useState(true);
  const [fogDragStart, setFogDragStart] = useState<MeasurePoint | null>(null);
  const [fogDraft, setFogDraft] = useState<FogBox | null>(null);
  const [measureStart, setMeasureStart] = useState<MeasurePoint | null>(null);
  const [measureEnd, setMeasureEnd] = useState<MeasurePoint | null>(null);
  const [measurePreview, setMeasurePreview] = useState<MeasurePoint | null>(null);
  const [tokenDragMeasure, setTokenDragMeasure] = useState<TokenDragMeasure | null>(null);
  const [pings, setPings] = useState<PingMarker[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState(map.imageUrl ?? "");
  const mapImage = useCanvasImage(map.imageUrl);
  const visibleTokens = useMemo(
    () => map.tokens.filter((token) => isHost || !token.hidden),
    [isHost, map.tokens],
  );
  const displayWidth = Math.max(280, containerWidth);
  const baseScale = displayWidth / map.width;
  const scale = baseScale * zoom;
  const displayHeight = clamp(map.height * baseScale, 320, 720);
  const selectedToken = map.tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedFog = map.fogRects.find((rect) => rect.id === selectedFogId) ?? null;
  const selectedCharacter = selectedToken?.sessionCharacterId
    ? characters.find((character) => character.id === selectedToken.sessionCharacterId) ?? null
    : null;
  const controlledTokenIds = useMemo(
    () =>
      new Set(
        characters
          .filter((character) => character.userId === currentUserId)
          .map((character) => character.id),
      ),
    [characters, currentUserId],
  );
  const activeMeasureEnd = measureEnd ?? measurePreview;
  const gridLines = useMemo(() => {
    const lines: Array<{ points: number[]; key: string }> = [];
    for (let x = 0; x <= map.width; x += map.gridSize) {
      lines.push({ key: `x-${x}`, points: [x, 0, x, map.height] });
    }
    for (let y = 0; y <= map.height; y += map.gridSize) {
      lines.push({ key: `y-${y}`, points: [0, y, map.width, y] });
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
    setImageUrlInput(map.imageUrl ?? "");
  }, [map.imageUrl]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
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

  function updateToken(tokenId: string, patch: Partial<VttMapStateDto["tokens"][number]>) {
    updateMap({
      tokens: map.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              ...patch,
              x: patch.x === undefined ? token.x : clamp(patch.x, 0, map.width - (patch.size ?? token.size)),
              y: patch.y === undefined ? token.y : clamp(patch.y, 0, map.height - (patch.size ?? token.size)),
              size: patch.size === undefined ? token.size : clamp(patch.size, 24, 160),
            }
          : token,
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

  function moveTokenLayer(tokenId: string, direction: "front" | "back") {
    const token = map.tokens.find((item) => item.id === tokenId);
    if (!token) return;

    updateMap({
      tokens:
        direction === "front"
          ? [...map.tokens.filter((item) => item.id !== tokenId), token]
          : [token, ...map.tokens.filter((item) => item.id !== tokenId)],
    });
  }

  function updateFogRect(fogId: string, patch: Partial<VttMapStateDto["fogRects"][number]>) {
    updateMap({
      fogRects: map.fogRects.map((rect) =>
        rect.id === fogId
          ? {
              ...rect,
              ...patch,
              x: patch.x === undefined ? rect.x : clamp(patch.x, 0, map.width),
              y: patch.y === undefined ? rect.y : clamp(patch.y, 0, map.height),
              width: patch.width === undefined ? rect.width : clamp(patch.width, map.gridSize, map.width),
              height: patch.height === undefined ? rect.height : clamp(patch.height, map.gridSize, map.height),
            }
          : rect,
      ),
    });
  }

  function deleteFogRect(fogId: string) {
    updateMap({ fogRects: map.fogRects.filter((rect) => rect.id !== fogId) });
    setSelectedFogId(null);
  }

  function updateMapSize(patch: Partial<Pick<VttMapStateDto, "width" | "height" | "gridSize">>) {
    updateMap({
      ...patch,
      width: patch.width === undefined ? map.width : clamp(patch.width, 320, 4000),
      height: patch.height === undefined ? map.height : clamp(patch.height, 240, 4000),
      gridSize: patch.gridSize === undefined ? map.gridSize : clamp(patch.gridSize, 16, 160),
    });
  }

  function handleTokenMove(tokenId: string, x: number, y: number, snap = isTokenSnapEnabled) {
    const targetToken = map.tokens.find((token) => token.id === tokenId);
    if (!targetToken || !canControlToken(targetToken)) return;

    updateMap({
      tokens: map.tokens.map((token) =>
        token.id === tokenId
          ? {
              ...token,
              x: Math.min(Math.max(snap ? snapToGrid(x, map.gridSize) : x, 0), map.width - token.size),
              y: Math.min(Math.max(snap ? snapToGrid(y, map.gridSize) : y, 0), map.height - token.size),
            }
          : token,
      ),
    });
  }

  function addHostileToken() {
    const index = map.tokens.filter((token) => token.isHostile).length + 1;
    updateMap({
      tokens: [
        ...map.tokens,
        {
          id: `token:hostile:${Date.now()}`,
          sessionCharacterId: null,
          name: `Enemy ${index}`,
          imageUrl: null,
          x: map.gridSize * 10,
          y: map.gridSize * 5,
          size: map.gridSize,
          hidden: false,
          isHostile: true,
        },
      ],
    });
  }

  function syncPartyTokens() {
    const knownTokenIds = new Set(map.tokens.map((token) => token.sessionCharacterId).filter(Boolean));
    const additions = characters
      .filter((character) => !knownTokenIds.has(character.id))
      .map((character, index) => ({
        id: `token:${character.id}`,
        sessionCharacterId: character.id,
        name: character.name,
        imageUrl: character.avatarUrl ?? null,
        x: map.gridSize * (2 + index),
        y: map.gridSize * 2,
        size: map.gridSize,
        hidden: false,
        isHostile: false,
      }));

    if (!additions.length) return;
    updateMap({ tokens: [...map.tokens, ...additions] });
  }

  function addPingAt(point: MeasurePoint) {
    const ping: PingMarker = {
      id: `ping:${Date.now()}`,
      x: point.x,
      y: point.y,
      label: "!",
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

  function canControlToken(token: VttMapStateDto["tokens"][number]) {
    return isHost || Boolean(token.sessionCharacterId && controlledTokenIds.has(token.sessionCharacterId));
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

  function handleStageDragEnd(event: Parameters<NonNullable<ComponentProps<typeof Stage>["onDragEnd"]>>[0]) {
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
    if (fogAction === "hide") {
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

  function handleFogPointerDown(event: Parameters<NonNullable<ComponentProps<typeof Stage>["onMouseDown"]>>[0]) {
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

  function handleStagePointerMove(event: Parameters<NonNullable<ComponentProps<typeof Stage>["onMouseMove"]>>[0]) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const world = getWorldPointer(pointer);

    if (!fogDragStart) return;
    setFogDraft(normalizeFogBox(fogDragStart, world, map, isFogSnapEnabled));
  }

  function handleStageMouseMove(event: Parameters<NonNullable<ComponentProps<typeof Stage>["onMouseMove"]>>[0]) {
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

  function beginTokenDragMeasure(token: VttMapStateDto["tokens"][number]) {
    const center = {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
    setTokenDragMeasure({ tokenId: token.id, from: center, to: center });
  }

  function updateTokenDragMeasure(token: VttMapStateDto["tokens"][number], x: number, y: number) {
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

  function setExclusiveTool(tool: "pan" | "fog" | "measure" | "ping") {
    setPanMode(tool === "pan" ? !isPanMode : false);
    setFogMode(tool === "fog" ? !isFogMode : false);
    setMeasureMode(tool === "measure" ? !isMeasureMode : false);
    setPingMode(tool === "ping" ? !isPingMode : false);
  }

  return (
    <section className="vtt-panel">
      <div className="vtt-toolbar">
        <div>
          <span className="eyebrow">{title}</span>
          <strong>{map.tokens.length} tokens</strong>
        </div>

        {isHost ? (
          <div className="vtt-controls">
            <input
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              placeholder="Map image URL"
            />
            <button type="button" onClick={() => updateMap({ imageUrl: imageUrlInput.trim() || null })}>
              Set map
            </button>
            {showPartyTools ? (
              <button type="button" onClick={syncPartyTokens}>
                Sync party
              </button>
            ) : null}
            <button type="button" onClick={addHostileToken}>
              Add enemy
            </button>
            <button type="button" className={isPanMode ? "active" : ""} onClick={() => setExclusiveTool("pan")}>
              Pan
            </button>
            <button type="button" className={isMeasureMode ? "active" : ""} onClick={() => setExclusiveTool("measure")}>
              Measure
            </button>
            <button type="button" className={isPingMode ? "active" : ""} onClick={() => setExclusiveTool("ping")}>
              Ping
            </button>
            <button type="button" className={isFogMode ? "active" : ""} onClick={() => setExclusiveTool("fog")}>
              Fog
            </button>
            <button type="button" onClick={hideFullMap}>
              Hide all
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
            Reset
          </button>
        </div>

        {isHost ? (
          <div className="vtt-map-settings">
            <label>
              W
              <input
                type="number"
                min={320}
                max={4000}
                value={map.width}
                onChange={(event) => updateMapSize({ width: Number(event.target.value) })}
              />
            </label>
            <label>
              H
              <input
                type="number"
                min={240}
                max={4000}
                value={map.height}
                onChange={(event) => updateMapSize({ height: Number(event.target.value) })}
              />
            </label>
            <label>
              Grid
              <input
                type="number"
                min={16}
                max={160}
                value={map.gridSize}
                onChange={(event) => updateMapSize({ gridSize: Number(event.target.value) })}
              />
            </label>
          </div>
        ) : null}
        {measureStart ? (
          <button type="button" className="vtt-clear-measure" onClick={clearMeasure}>
            Clear measure
          </button>
        ) : null}
        <label className="vtt-token-snap">
          <input
            type="checkbox"
            checked={isTokenSnapEnabled}
            onChange={(event) => setTokenSnapEnabled(event.target.checked)}
          />
          Token snap
        </label>
        {isHost && isFogMode ? (
          <div className="vtt-fog-tools">
            <button type="button" className={fogAction === "reveal" ? "active" : ""} onClick={() => setFogAction("reveal")}>
              Reveal
            </button>
            <button type="button" className={fogAction === "hide" ? "active" : ""} onClick={() => setFogAction("hide")}>
              Hide
            </button>
            <label>
              <input
                type="checkbox"
                checked={isFogSnapEnabled}
                onChange={(event) => setFogSnapEnabled(event.target.checked)}
              />
              Snap
            </label>
            <button type="button" onClick={hideFullMap}>
              Hide all
            </button>
            <button type="button" onClick={() => updateMap({ fogRects: [] })}>
              Reveal all
            </button>
          </div>
        ) : null}
      </div>

      <div className={`vtt-workspace${selectedToken || selectedFog ? " with-inspector" : ""}`}>
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
              if (event.target === stage || event.target.name() === "map-background") {
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
                <Rect x={80} y={96} width={420} height={180} fill="#26384b" opacity={0.55} cornerRadius={18} />
                <Rect x={620} y={340} width={440} height={210} fill="#233928" opacity={0.48} cornerRadius={18} />
                <Line points={[120, 660, 420, 480, 720, 520, 1100, 260]} stroke="#58718f" strokeWidth={28} opacity={0.28} tension={0.35} />
              </>
            )}
            {gridLines.map((line) => (
              <Line key={line.key} points={line.points} stroke="rgba(222, 233, 245, 0.16)" strokeWidth={1} />
            ))}
          </Layer>

          <Layer>
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
              const fill = token.isHostile ? "#ff6b6b" : tokenPalette[index % tokenPalette.length];
              return (
                <Group
                  key={token.id}
                  x={token.x}
                  y={token.y}
                  draggable={!isFogMode && !isPanMode && !isMeasureMode && !isPingMode && canControlToken(token)}
                  opacity={token.hidden ? 0.45 : 1}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    setSelectedTokenId(token.id);
                    setSelectedFogId(null);
                  }}
                  onDragStart={() => beginTokenDragMeasure(token)}
                  onDragMove={(event) => updateTokenDragMeasure(token, event.target.x(), event.target.y())}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    handleTokenMove(token.id, event.target.x(), event.target.y(), isTokenSnapEnabled && !event.evt.shiftKey);
                    setTokenDragMeasure(null);
                  }}
                >
                  <Circle
                    x={token.size / 2}
                    y={token.size / 2}
                    radius={token.size / 2 - 4}
                    fill={fill}
                    stroke={
                      token.id === selectedTokenId ? "#ffffff" : token.hidden ? "#cbd6e2" : "#101825"
                    }
                    strokeWidth={token.id === selectedTokenId ? 5 : 4}
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
                </Group>
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
                      points={[measureStart.x, measureStart.y, activeMeasureEnd.x, activeMeasureEnd.y]}
                      stroke="#79d8ff"
                      strokeWidth={3}
                      dash={[12, 8]}
                    />
                    <Circle x={activeMeasureEnd.x} y={activeMeasureEnd.y} radius={6} fill="#79d8ff" />
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
                <Circle x={tokenDragMeasure.from.x} y={tokenDragMeasure.from.y} radius={5} fill="#9ee6a8" />
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
                <Circle radius={28} fill="rgba(255, 214, 102, 0.22)" stroke="#ffd666" strokeWidth={3} />
                <Circle radius={9} fill="#ffd666" />
                <Text text={ping.label} x={-5} y={-11} fill="#061017" fontStyle="bold" fontSize={18} />
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
                fill={rect.id === selectedFogId ? "#18283a" : "#03060a"}
                opacity={rect.id === selectedFogId ? 0.9 : 0.82}
                stroke={rect.id === selectedFogId ? "#79d8ff" : undefined}
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
                fill={fogAction === "reveal" ? "rgba(121, 216, 255, 0.16)" : "rgba(255, 214, 102, 0.18)"}
                stroke={fogAction === "reveal" ? "#79d8ff" : "#ffd666"}
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
              <span className="eyebrow">Token</span>
              <button type="button" onClick={() => setSelectedTokenId(null)}>
                Close
              </button>
            </div>
            <label>
              Name
              <input value={selectedToken.name} onChange={(event) => updateToken(selectedToken.id, { name: event.target.value })} />
            </label>
            <label>
              Image URL
              <input value={selectedToken.imageUrl ?? ""} onChange={(event) => updateToken(selectedToken.id, { imageUrl: event.target.value || null })} />
            </label>
            <div className="vtt-field-row">
              <label>
                X
                <input type="number" value={selectedToken.x} onChange={(event) => updateToken(selectedToken.id, { x: Number(event.target.value) })} />
              </label>
              <label>
                Y
                <input type="number" value={selectedToken.y} onChange={(event) => updateToken(selectedToken.id, { y: Number(event.target.value) })} />
              </label>
              <label>
                Size
                <input type="number" min={24} max={160} value={selectedToken.size} onChange={(event) => updateToken(selectedToken.id, { size: Number(event.target.value) })} />
              </label>
            </div>
            <div className="vtt-check-row">
              <label>
                <input type="checkbox" checked={selectedToken.hidden === true} onChange={(event) => updateToken(selectedToken.id, { hidden: event.target.checked })} />
                Hidden
              </label>
              <label>
                <input type="checkbox" checked={selectedToken.isHostile === true} onChange={(event) => updateToken(selectedToken.id, { isHostile: event.target.checked })} />
                Hostile
              </label>
            </div>
            <div className="vtt-inspector-actions">
              <button type="button" onClick={() => duplicateToken(selectedToken.id)}>
                Duplicate
              </button>
              <button type="button" onClick={() => moveTokenLayer(selectedToken.id, "front")}>
                Front
              </button>
              <button type="button" onClick={() => moveTokenLayer(selectedToken.id, "back")}>
                Back
              </button>
            </div>
            <button type="button" className="danger" onClick={() => deleteToken(selectedToken.id)}>
              Delete token
            </button>
          </aside>
        ) : null}

        {isHost && selectedFog ? (
          <aside className="vtt-inspector">
            <div className="vtt-inspector-head">
              <span className="eyebrow">Fog</span>
              <button type="button" onClick={() => setSelectedFogId(null)}>
                Close
              </button>
            </div>
            <div className="vtt-field-row">
              <label>
                X
                <input type="number" value={selectedFog.x} onChange={(event) => updateFogRect(selectedFog.id, { x: Number(event.target.value) })} />
              </label>
              <label>
                Y
                <input type="number" value={selectedFog.y} onChange={(event) => updateFogRect(selectedFog.id, { y: Number(event.target.value) })} />
              </label>
            </div>
            <div className="vtt-field-row">
              <label>
                W
                <input type="number" value={selectedFog.width} onChange={(event) => updateFogRect(selectedFog.id, { width: Number(event.target.value) })} />
              </label>
              <label>
                H
                <input type="number" value={selectedFog.height} onChange={(event) => updateFogRect(selectedFog.id, { height: Number(event.target.value) })} />
              </label>
            </div>
            <button type="button" className="danger" onClick={() => deleteFogRect(selectedFog.id)}>
              Delete fog
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
