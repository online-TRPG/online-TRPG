import { Fragment } from 'react';
import { Layer, Rect, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import { getTerrainEffectVisual } from './battleMapTerrainEffects';

interface BattleMapSessionObstacleLayerProps {
  map: Pick<VttMapStateDto, 'gridSize'>;
  terrainCells: NonNullable<VttMapStateDto['terrainCells']>;
  wallCells: NonNullable<VttMapStateDto['wallCells']>;
}

export function BattleMapSessionObstacleLayer({
  map,
  terrainCells,
  wallCells,
}: BattleMapSessionObstacleLayerProps) {
  if (!terrainCells.length && !wallCells.length) {
    return null;
  }

  return (
    <Layer listening={false}>
      {terrainCells.map((cell) => {
        const visual = getTerrainEffectVisual(cell);
        return (
          <Fragment key={`session-terrain:${cell.id}`}>
            <Rect
              x={cell.x}
              y={cell.y}
              width={cell.width}
              height={cell.height}
              fill={visual.fill}
              stroke={visual.stroke}
              strokeWidth={1.5}
              dash={visual.dash}
            />
            {visual.label ? (
              <Text
                key={`session-terrain:${cell.id}:effect-label`}
                x={cell.x + 5}
                y={cell.y + 5}
                text={visual.label}
                fontSize={Math.max(10, Math.min(14, map.gridSize / 4))}
                fontStyle="bold"
                fill="rgba(255, 255, 255, 0.82)"
                listening={false}
              />
            ) : null}
          </Fragment>
        );
      })}
      {wallCells.map((cell) => (
        <Rect
          key={`session-wall:${cell.id}`}
          x={cell.x}
          y={cell.y}
          width={cell.width}
          height={cell.height}
          fill="rgba(58, 64, 72, 0.66)"
          stroke="rgba(236, 241, 247, 0.5)"
          strokeWidth={2}
        />
      ))}
    </Layer>
  );
}
