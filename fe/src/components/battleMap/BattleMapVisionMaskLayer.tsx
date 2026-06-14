import { useMemo } from 'react';
import { Layer, Rect } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

interface BattleMapVisionMaskLayerProps {
  map: Pick<VttMapStateDto, 'width' | 'height' | 'gridSize'>;
  visibleVisionCells: Set<string> | null;
  exploredVisionCells?: Set<string> | null;
  variant?: 'player' | 'gm-preview';
}

export function BattleMapVisionMaskLayer({
  map,
  visibleVisionCells,
  exploredVisionCells = null,
  variant = 'player',
}: BattleMapVisionMaskLayerProps) {
  const maskRuns = useMemo(() => {
    if (!visibleVisionCells) return [];
    const unseenFill = variant === 'gm-preview' ? 'rgba(3, 6, 10, 0.18)' : 'rgba(3, 6, 10, 0.9)';
    const exploredFill =
      variant === 'gm-preview' ? unseenFill : 'rgba(3, 6, 10, 0.48)';

    const runs: Array<{
      key: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
    }> = [];
    const rowCount = Math.ceil(map.height / map.gridSize);
    const columnCount = Math.ceil(map.width / map.gridSize);

    for (let row = 0; row < rowCount; row += 1) {
      let runStartColumn: number | null = null;
      let runFill: string | null = null;

      for (let column = 0; column <= columnCount; column += 1) {
        const key = `${column}:${row}`;
        const nextFill =
          column < columnCount && !visibleVisionCells.has(key)
            ? exploredVisionCells?.has(key)
              ? exploredFill
              : unseenFill
            : null;

        if (nextFill === runFill) {
          continue;
        }

        if (runStartColumn !== null && runFill) {
          const x = runStartColumn * map.gridSize;
          const y = row * map.gridSize;
          const runEndColumn = column - 1;
          const endX = Math.min(map.width, (runEndColumn + 1) * map.gridSize);
          runs.push({
            key: `vision-mask:${row}:${runStartColumn}:${runEndColumn}:${runFill}`,
            x,
            y,
            width: endX - x,
            height: Math.min(map.gridSize, map.height - y),
            fill: runFill,
          });
        }

        runStartColumn = nextFill ? column : null;
        runFill = nextFill;
      }
    }

    return runs;
  }, [exploredVisionCells, map.gridSize, map.height, map.width, variant, visibleVisionCells]);

  if (!visibleVisionCells) return null;

  return (
    <Layer listening={false}>
      {maskRuns.map((run) => (
        <Rect
          key={run.key}
          x={run.x}
          y={run.y}
          width={run.width}
          height={run.height}
          fill={run.fill}
        />
      ))}
    </Layer>
  );
}
