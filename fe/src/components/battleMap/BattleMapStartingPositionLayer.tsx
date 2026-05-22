import { Circle, Group, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

type StartingPosition = NonNullable<VttMapStateDto['startingPositions']>[number];

interface BattleMapStartingPositionLayerProps {
  positions: StartingPosition[];
  gridSize: number;
  canEditMap: boolean;
  isDisabled: boolean;
  isTokenSnapEnabled: boolean;
  onUpdatePosition: (
    positionId: string,
    point: { x: number; y: number },
    snap: boolean
  ) => void;
}

export function BattleMapStartingPositionLayer({
  positions,
  gridSize,
  canEditMap,
  isDisabled,
  isTokenSnapEnabled,
  onUpdatePosition,
}: BattleMapStartingPositionLayerProps) {
  if (!canEditMap) return null;

  return (
    <>
      {positions.map((position, index) => (
        <Group
          key={position.id}
          x={position.x}
          y={position.y}
          draggable={!isDisabled}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            onUpdatePosition(
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
            x={gridSize / 2}
            y={gridSize / 2}
            radius={gridSize / 2 - 6}
            fill="rgba(121, 216, 255, 0.14)"
            stroke="#79d8ff"
            strokeWidth={2}
            dash={[8, 6]}
          />
          <Text
            text={String(index + 1)}
            width={gridSize}
            y={gridSize / 2 - 10}
            align="center"
            fill="#d8f6ff"
            fontSize={18}
            fontStyle="bold"
          />
        </Group>
      ))}
    </>
  );
}
