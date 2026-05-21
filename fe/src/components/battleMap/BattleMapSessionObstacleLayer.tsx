import { Layer, Rect } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

interface BattleMapSessionObstacleLayerProps {
  terrainCells: NonNullable<VttMapStateDto['terrainCells']>;
  wallCells: NonNullable<VttMapStateDto['wallCells']>;
}

export function BattleMapSessionObstacleLayer({
  terrainCells,
  wallCells,
}: BattleMapSessionObstacleLayerProps) {
  if (!terrainCells.length && !wallCells.length) {
    return null;
  }

  return (
    <Layer listening={false}>
      {terrainCells.map((cell) => (
        <Rect
          key={`session-terrain:${cell.id}`}
          x={cell.x}
          y={cell.y}
          width={cell.width}
          height={cell.height}
          fill="rgba(96, 103, 111, 0.44)"
          stroke="rgba(218, 226, 234, 0.42)"
          strokeWidth={1.5}
          dash={[8, 5]}
        />
      ))}
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
