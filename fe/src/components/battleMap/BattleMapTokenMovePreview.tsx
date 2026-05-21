import { Circle, Line, Rect, Text } from 'react-konva';

type TokenPathCell = { x: number; y: number; blocked: boolean };
type TokenMovementPath = {
  cells: TokenPathCell[];
  blocked: boolean;
  distanceFt: number;
  extraCostFt: number;
};

export type BattleMapTokenDragMeasure = {
  tokenId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  path: TokenMovementPath;
  route: Array<{ x: number; y: number }>;
};

interface BattleMapTokenMovePreviewProps {
  measure: BattleMapTokenDragMeasure | null;
  gridSize: number;
  formatPathCost: (path: TokenMovementPath) => string;
}

export function BattleMapTokenMovePreview({
  measure,
  gridSize,
  formatPathCost,
}: BattleMapTokenMovePreviewProps) {
  if (!measure) {
    return null;
  }

  return (
    <>
      {measure.path.cells.map((cell, index) => (
        <Rect
          key={`${measure.tokenId}:path:${index}:${cell.x}:${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={gridSize}
          height={gridSize}
          fill={cell.blocked ? 'rgba(232, 91, 86, 0.3)' : 'rgba(158, 230, 168, 0.22)'}
          stroke={cell.blocked ? '#ff7771' : '#9ee6a8'}
          strokeWidth={2}
          dash={cell.blocked ? [4, 4] : undefined}
        />
      ))}
      <Line
        points={[measure.from.x, measure.from.y, measure.to.x, measure.to.y]}
        stroke={measure.path.blocked ? '#ff7771' : '#9ee6a8'}
        strokeWidth={3}
        dash={[10, 8]}
      />
      <Circle
        x={measure.from.x}
        y={measure.from.y}
        radius={5}
        fill={measure.path.blocked ? '#ff7771' : '#9ee6a8'}
      />
      <Text
        text={formatPathCost(measure.path)}
        x={(measure.from.x + measure.to.x) / 2 + 10}
        y={(measure.from.y + measure.to.y) / 2 - 28}
        fill={measure.path.blocked ? '#fff7f5' : '#061017'}
        fontStyle="bold"
        fontSize={18}
        padding={6}
        stroke={measure.path.blocked ? '#84211f' : undefined}
        strokeWidth={measure.path.blocked ? 4 : 0}
        fillAfterStrokeEnabled
      />
    </>
  );
}
