import { Layer, Rect } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

interface BattleMapVisionMaskLayerProps {
  map: Pick<VttMapStateDto, 'width' | 'height' | 'gridSize'>;
  visibleVisionCells: Set<string> | null;
  exploredVisionCells?: Set<string> | null;
}

export function BattleMapVisionMaskLayer({
  map,
  visibleVisionCells,
  exploredVisionCells = null,
}: BattleMapVisionMaskLayerProps) {
  if (!visibleVisionCells) {
    return null;
  }

  return (
    <Layer listening={false}>
      {Array.from({ length: Math.ceil(map.height / map.gridSize) }).flatMap((_, row) =>
        Array.from({ length: Math.ceil(map.width / map.gridSize) }).map((__, column) => {
          const key = `${column}:${row}`;
          if (visibleVisionCells.has(key)) {
            return null;
          }
          const isExplored = exploredVisionCells?.has(key) ?? false;
          const x = column * map.gridSize;
          const y = row * map.gridSize;
          return (
            <Rect
              key={`vision-mask:${key}`}
              x={x}
              y={y}
              width={Math.min(map.gridSize, map.width - x)}
              height={Math.min(map.gridSize, map.height - y)}
              fill={isExplored ? 'rgba(3, 6, 10, 0.48)' : 'rgba(3, 6, 10, 0.9)'}
            />
          );
        })
      )}
    </Layer>
  );
}
