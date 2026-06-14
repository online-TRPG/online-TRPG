import { Group } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import { TokenFrame } from './TokenFrame';
import type { TokenHealthFrame } from './TokenFrame';
import { useCanvasImage } from './useCanvasImage';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';

function getTokenLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

interface BattleTokenProps {
  token: VttMapStateDto['tokens'][number];
  color: SessionTokenColor;
  isSelected: boolean;
  opacity: number;
  canControl: boolean;
  isFogMode: boolean;
  isPanMode: boolean;
  isMeasureMode: boolean;
  isPingMode: boolean;
  health?: TokenHealthFrame;
  constrainDragPosition?: (x: number, y: number, shiftKey: boolean) => { x: number; y: number };
  onSelect: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number, shiftKey: boolean) => void;
  onDragEnd: (x: number, y: number, shiftKey: boolean) => boolean | Promise<boolean>;
}

export function BattleToken({
  token,
  color,
  isSelected,
  opacity,
  canControl,
  isFogMode,
  isPanMode,
  isMeasureMode,
  isPingMode,
  health,
  constrainDragPosition,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: BattleTokenProps) {
  const tokenImage = useCanvasImage(token.imageUrl);

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={!isFogMode && !isPanMode && !isMeasureMode && !isPingMode && canControl}
      opacity={opacity}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={onDragStart}
      onDragMove={(event) => {
        const node = event.target;
        const constrained = constrainDragPosition?.(node.x(), node.y(), event.evt.shiftKey);
        if (constrained && (constrained.x !== node.x() || constrained.y !== node.y())) {
          node.position(constrained);
        }
        onDragMove(node.x(), node.y(), event.evt.shiftKey);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const node = event.target;
        const constrained = constrainDragPosition?.(node.x(), node.y(), event.evt.shiftKey);
        if (constrained && (constrained.x !== node.x() || constrained.y !== node.y())) {
          node.position(constrained);
        }
        void Promise.resolve(onDragEnd(node.x(), node.y(), event.evt.shiftKey)).then((wasMoved) => {
          if (!wasMoved) {
            node.position({ x: token.x, y: token.y });
          }
        });
      }}
    >
      <TokenFrame
        image={tokenImage}
        label={getTokenLabel(token.name)}
        size={token.size}
        color={color}
        isSelected={isSelected}
        isHidden={Boolean(token.hidden)}
        health={health}
      />
    </Group>
  );
}
