import { useRef } from 'react';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { BattleMapCanvasProps } from './BattleMapCanvas';

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type StructureKind = 'terrain' | 'wall' | 'door' | 'object';
type StructureDragStart = {
  kind: StructureKind;
  point: Point;
  mode?: 'create' | 'extend';
  targetObjectId?: string;
} | null;
type StructureDraft = {
  kind: StructureKind;
  box: Box;
} | null;

export function useBattleMapPointerInput(params: {
  map: VttMapStateDto;
  scale: number;
  stagePosition: Point;
  setStagePosition: (position: Point) => void;
  canEditMap: boolean;
  isPanMode: boolean;
  isFogMode: boolean;
  isFogSnapEnabled: boolean;
  isPingMode: boolean;
  isMeasureMode: boolean;
  measureStart: Point | null;
  measureEnd: Point | null;
  mapStructureTool: StructureKind | null;
  structureDragStart: StructureDragStart;
  structureDraft: StructureDraft;
  fogDragStart: Point | null;
  fogDraft: Box | null;
  setSelectedTokenId: (id: string | null) => void;
  setSelectedFogId: (id: string | null) => void;
  setSelectedMapStructure: (selection: { kind: StructureKind; id: string } | null) => void;
  setStructureDragStart: (start: StructureDragStart) => void;
  setStructureDraft: (draft: StructureDraft) => void;
  setFogDragStart: (point: Point | null) => void;
  setFogDraft: (box: Box | null) => void;
  setMeasurePreview: (point: Point | null) => void;
  getSnappedStructureBox: (from: Point, to: Point) => Box;
  normalizeFogBox: (
    from: Point,
    to: Point,
    map: VttMapStateDto,
    snap: boolean,
  ) => Box | null;
  addStructureBox: (kind: StructureKind, box: Box) => void;
  extendObjectCell: (cellId: string, box: Box) => void;
  applyFogBox: (box: Box) => void;
  addPingAt: (point: Point) => Promise<void>;
  handleMeasureClick: (point: Point) => void;
  emitTileSelection: (point: Point) => void;
}) {
  const suppressStageClickRef = useRef(false);

  function getWorldPointer(pointer: Point) {
    return {
      x: (pointer.x - params.stagePosition.x) / params.scale,
      y: (pointer.y - params.stagePosition.y) / params.scale,
    };
  }

  function handleStageDragEnd(
    event: Parameters<NonNullable<BattleMapCanvasProps['onDragEnd']>>[0],
  ) {
    const stage = event.target.getStage();
    if (!stage || event.target !== stage) return;

    params.setStagePosition({ x: stage.x(), y: stage.y() });
    suppressStageClickRef.current = true;
  }

  function handleStagePointerDown(
    event: Parameters<NonNullable<BattleMapCanvasProps['onMouseDown']>>[0],
  ) {
    if (!params.canEditMap || params.isPanMode || event.evt.button !== 0) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const isBackgroundTarget = event.target === stage || event.target.name() === 'map-background';

    const world = getWorldPointer(pointer);
    params.setSelectedTokenId(null);
    params.setSelectedFogId(null);
    params.setSelectedMapStructure(null);

    if (params.mapStructureTool) {
      if (!isBackgroundTarget) return;
      params.setStructureDragStart({ kind: params.mapStructureTool, point: world });
      params.setStructureDraft({
        kind: params.mapStructureTool,
        box: params.getSnappedStructureBox(world, world),
      });
      return;
    }

    if (!params.isFogMode) return;
    params.setFogDragStart(world);
    params.setFogDraft(null);
  }

  function handleStagePointerMove(
    event: Parameters<NonNullable<BattleMapCanvasProps['onMouseMove']>>[0],
  ) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const world = getWorldPointer(pointer);

    if (params.structureDragStart) {
      params.setStructureDraft({
        kind: params.structureDragStart.kind,
        box: params.getSnappedStructureBox(params.structureDragStart.point, world),
      });
      return;
    }

    if (params.fogDragStart) {
      params.setFogDraft(
        params.normalizeFogBox(params.fogDragStart, world, params.map, params.isFogSnapEnabled),
      );
    }
  }

  function handleStageMouseMove(
    event: Parameters<NonNullable<BattleMapCanvasProps['onMouseMove']>>[0],
  ) {
    handleStagePointerMove(event);

    if (!params.isMeasureMode || !params.measureStart || params.measureEnd) return;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    params.setMeasurePreview(getWorldPointer(pointer));
  }

  function handleStagePointerUp() {
    if (params.structureDragStart && params.structureDraft) {
      if (params.structureDragStart.mode === 'extend' && params.structureDragStart.targetObjectId) {
        params.extendObjectCell(params.structureDragStart.targetObjectId, params.structureDraft.box);
      } else {
        params.addStructureBox(params.structureDraft.kind, params.structureDraft.box);
      }
      suppressStageClickRef.current = true;
    }
    params.setStructureDragStart(null);
    params.setStructureDraft(null);

    if (params.fogDraft) {
      params.applyFogBox(params.fogDraft);
      suppressStageClickRef.current = true;
    }
    params.setFogDragStart(null);
    params.setFogDraft(null);
  }

  function handleStageClick(
    event: Parameters<NonNullable<BattleMapCanvasProps['onClick']>>[0],
  ) {
    if (suppressStageClickRef.current) {
      suppressStageClickRef.current = false;
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const isBackgroundTarget = event.target === stage || event.target.name() === 'map-background';
    if (isBackgroundTarget) {
      params.setSelectedTokenId(null);
      params.setSelectedFogId(null);
      params.setSelectedMapStructure(null);
    }
    const world = getWorldPointer(pointer);
    if (params.isPingMode) {
      void params.addPingAt(world);
      return;
    }
    if (params.isMeasureMode) {
      params.handleMeasureClick(world);
      return;
    }
    if (isBackgroundTarget) {
      if (params.canEditMap && params.mapStructureTool) {
        return;
      }
      params.emitTileSelection(world);
    }
  }

  return {
    getWorldPointer,
    handleStageClick,
    handleStageDragEnd,
    handleStageMouseMove,
    handleStagePointerDown,
    handleStagePointerUp,
  };
}
