import { Fragment } from 'react';
import { Layer, Rect, Text } from 'react-konva';
import type { ComponentProps } from 'react';
import type { VttMapStateDto } from '@trpg/shared-types';
import { getTerrainEffectVisual } from './battleMapTerrainEffects';

type MapStructureKind = 'terrain' | 'wall' | 'door' | 'object';
type MapStructureSelection = { kind: MapStructureKind; id: string };
type StructureBox = { x: number; y: number; width: number; height: number };
type ObjectCell = NonNullable<VttMapStateDto['objectCells']>[number];
type ObjectShapeCell = NonNullable<ObjectCell['shapeCells']>[number];

interface BattleMapEditorStructureLayerProps {
  map: Pick<VttMapStateDto, 'gridSize'>;
  terrainCells: NonNullable<VttMapStateDto['terrainCells']>;
  wallCells: NonNullable<VttMapStateDto['wallCells']>;
  doorCells: NonNullable<VttMapStateDto['doorCells']>;
  objectCells: NonNullable<VttMapStateDto['objectCells']>;
  selectedMapStructure: MapStructureSelection | null;
  structureDraft: { kind: MapStructureKind; box: StructureBox } | null;
  getObjectShapeCells: (cell: ObjectCell) => ObjectShapeCell[];
  onSelectStructure: (
    kind: MapStructureKind,
    cell:
      | NonNullable<VttMapStateDto['terrainCells']>[number]
      | NonNullable<VttMapStateDto['wallCells']>[number]
      | NonNullable<VttMapStateDto['doorCells']>[number]
      | NonNullable<VttMapStateDto['objectCells']>[number]
  ) => void;
  onBeginObjectExtensionDrag: (
    cell: ObjectCell,
    event: Parameters<NonNullable<ComponentProps<typeof Rect>['onMouseDown']>>[0]
  ) => void;
}

export function BattleMapEditorStructureLayer({
  map,
  terrainCells,
  wallCells,
  doorCells,
  objectCells,
  selectedMapStructure,
  structureDraft,
  getObjectShapeCells,
  onSelectStructure,
  onBeginObjectExtensionDrag,
}: BattleMapEditorStructureLayerProps) {
  return (
    <Layer>
      {terrainCells.map((cell) => {
        const visual = getTerrainEffectVisual(cell);
        const isSelected = selectedMapStructure?.id === cell.id;
        return (
          <Fragment key={cell.id}>
            <Rect
              x={cell.x}
              y={cell.y}
              width={cell.width}
              height={cell.height}
              fill={visual.fill}
              stroke={isSelected ? '#ffffff' : visual.stroke}
              strokeWidth={isSelected ? 3 : 1}
              dash={visual.dash}
              onClick={(event) => {
                event.cancelBubble = true;
                onSelectStructure('terrain', cell);
              }}
            />
            {visual.label ? (
              <Text
                key={`${cell.id}:effect-label`}
                x={cell.x + 5}
                y={cell.y + 5}
                text={visual.label}
                fontSize={Math.max(10, Math.min(14, map.gridSize / 4))}
                fontStyle="bold"
                fill="rgba(255, 255, 255, 0.88)"
                listening={false}
              />
            ) : null}
          </Fragment>
        );
      })}
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
            onSelectStructure('wall', cell);
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
              onSelectStructure('door', cell);
            }}
          />
        );
      })}
      {objectCells.flatMap((cell) =>
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
            onMouseDown={(event) => onBeginObjectExtensionDrag(cell, event)}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelectStructure('object', cell);
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
  );
}
