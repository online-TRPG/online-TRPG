import { Circle, Line, Text } from 'react-konva';

type MeasurePoint = { x: number; y: number };

interface BattleMapMeasureOverlayProps {
  start: MeasurePoint | null;
  end: MeasurePoint | null;
  isMeasureMode: boolean;
  gridSize: number;
  formatDistance: (start: MeasurePoint, end: MeasurePoint, gridSize: number) => string;
}

export function BattleMapMeasureOverlay({
  start,
  end,
  isMeasureMode,
  gridSize,
  formatDistance,
}: BattleMapMeasureOverlayProps) {
  if (!start || (!end && !isMeasureMode)) {
    return null;
  }

  return (
    <>
      <Circle x={start.x} y={start.y} radius={6} fill="#79d8ff" />
      {end ? (
        <>
          <Line points={[start.x, start.y, end.x, end.y]} stroke="#79d8ff" strokeWidth={3} dash={[12, 8]} />
          <Circle x={end.x} y={end.y} radius={6} fill="#79d8ff" />
          <Text
            text={formatDistance(start, end, gridSize)}
            x={(start.x + end.x) / 2 + 10}
            y={(start.y + end.y) / 2 - 26}
            fill="#061017"
            fontStyle="bold"
            fontSize={18}
            padding={6}
            fillAfterStrokeEnabled
          />
        </>
      ) : null}
    </>
  );
}
