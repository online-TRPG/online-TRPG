import { Circle, Group } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import { TokenFrame } from './TokenFrame';
import type { TokenHealthFrame } from './TokenFrame';
import { useCanvasImage } from './useCanvasImage';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';
import type {
  CombatMotionPreference,
  CombatTokenVisualEffect,
} from '../../features/sessionPlay/presentation/combatEffectTypes';
import { getCombatDamagePresentation } from '../../features/sessionPlay/presentation/combatDamagePresentation';
import { useCombatAnimationClock } from './useCombatAnimationClock';

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
  visualEffect?: CombatTokenVisualEffect;
  motionPreference?: CombatMotionPreference;
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
  visualEffect,
  motionPreference = 'full',
  constrainDragPosition,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: BattleTokenProps) {
  const tokenImage = useCanvasImage(token.imageUrl);
  const now = useCombatAnimationClock(
    Boolean(visualEffect && motionPreference !== 'off'),
    motionPreference === 'reduced' ? 24 : 60,
  );
  const responseDuration = visualEffect?.response === 'critical'
    ? 280
    : visualEffect?.response === 'source'
      ? 180
      : 220;
  const responseProgress = visualEffect
    ? Math.min(1, Math.max(0, (now - visualEffect.startedAt) / responseDuration))
    : 1;
  const responseActive = Boolean(visualEffect && responseProgress < 1 && motionPreference !== 'off');

  const response = visualEffect?.response ?? 'none';
  const canRecoil = response === 'hit' || response === 'critical' || response === 'vulnerable';
  const recoilStrength = response === 'critical' ? 5 : response === 'vulnerable' ? 4 : 3;
  const recoil = responseActive && canRecoil && motionPreference === 'full'
    ? Math.sin(responseProgress * Math.PI * 7) * recoilStrength * (1 - responseProgress)
    : 0;
  const pulse = responseActive && motionPreference === 'full'
    ? Math.sin(Math.min(1, responseProgress) * Math.PI)
    : 0;
  const scale = response === 'source'
    ? 1 + pulse * 0.07
    : response === 'critical'
      ? 1 + pulse * 0.055
      : response === 'healing' || response === 'applied'
        ? 1 + pulse * 0.035
        : 1;
  const presentation = getCombatDamagePresentation(visualEffect?.damageType ?? 'untyped');
  const flashOpacity = responseActive && response !== 'none'
    ? Math.max(0, Math.sin(responseProgress * Math.PI) * (motionPreference === 'reduced' ? 0.32 : 0.5))
    : 0;
  const center = token.size / 2;

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
      <Group
        x={center + recoil}
        y={center}
        offsetX={center}
        offsetY={center}
        scaleX={scale}
        scaleY={scale}
        listening={false}
      >
        <TokenFrame
          image={tokenImage}
          label={getTokenLabel(token.name)}
          size={token.size}
          color={color}
          isSelected={isSelected}
          isHidden={Boolean(token.hidden)}
          health={health}
          motionPreference={motionPreference}
        />
        {flashOpacity > 0 ? (
          <Circle
            x={center}
            y={center}
            radius={Math.max(8, center - 5)}
            fill={response === 'guarded' ? '#FFFFFF' : presentation.color}
            opacity={flashOpacity}
            shadowColor={presentation.color}
            shadowBlur={12}
          />
        ) : null}
      </Group>
    </Group>
  );
}
