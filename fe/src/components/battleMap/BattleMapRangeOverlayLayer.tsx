import { Circle } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

type CombatMovementMode = 'normal' | 'jump';
type VttToken = VttMapStateDto['tokens'][number];

interface BattleMapRangeOverlayLayerProps {
  map: Pick<VttMapStateDto, 'gridSize'>;
  movementRangeToken: VttToken | null;
  movementRangeFt: number | undefined;
  combatMovementMode: CombatMovementMode;
  attackRangeOverlay: { tokenId: string; rangeFt: number } | null;
  attackRangeOverlayToken: VttToken | null;
}

const feetPerGrid = 5;

export function BattleMapRangeOverlayLayer({
  map,
  movementRangeToken,
  movementRangeFt,
  combatMovementMode,
  attackRangeOverlay,
  attackRangeOverlayToken,
}: BattleMapRangeOverlayLayerProps) {
  return (
    <>
      {movementRangeToken && movementRangeFt !== undefined ? (
        <Circle
          x={movementRangeToken.x + movementRangeToken.size / 2}
          y={movementRangeToken.y + movementRangeToken.size / 2}
          radius={(movementRangeFt / feetPerGrid) * map.gridSize}
          fill={combatMovementMode === 'jump' ? 'rgba(158, 230, 168, 0.1)' : 'rgba(121, 216, 255, 0.08)'}
          stroke={combatMovementMode === 'jump' ? 'rgba(158, 230, 168, 0.7)' : 'rgba(121, 216, 255, 0.55)'}
          strokeWidth={combatMovementMode === 'jump' ? 3 : 2}
          dash={combatMovementMode === 'jump' ? [14, 8] : [10, 10]}
          listening={false}
        />
      ) : null}
      {attackRangeOverlay && attackRangeOverlayToken ? (
        <Circle
          x={attackRangeOverlayToken.x + attackRangeOverlayToken.size / 2}
          y={attackRangeOverlayToken.y + attackRangeOverlayToken.size / 2}
          radius={(attackRangeOverlay.rangeFt / feetPerGrid) * map.gridSize}
          fill="rgba(255, 139, 76, 0.1)"
          stroke="rgba(255, 139, 76, 0.72)"
          strokeWidth={2}
          dash={[8, 7]}
          listening={false}
        />
      ) : null}
    </>
  );
}
