import { Stage } from 'react-konva';
import type { ComponentProps } from 'react';

export type BattleMapCanvasProps = ComponentProps<typeof Stage>;

export function BattleMapCanvas(props: BattleMapCanvasProps) {
  return <Stage {...props} />;
}
