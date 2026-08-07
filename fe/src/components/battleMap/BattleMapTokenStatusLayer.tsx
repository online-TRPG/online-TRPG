import { Circle, Group, Image as KonvaImage, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { CombatTokenConditionState } from '../../features/sessionPlay/presentation/combatEffectTypes';
import { getCombatConditionPresentation } from '../../features/sessionPlay/presentation/combatConditionPresentation';
import { useCanvasImage } from './useCanvasImage';

type VttToken = VttMapStateDto['tokens'][number];

type BattleMapTokenStatusLayerProps = {
  tokens: VttToken[];
  conditionStates: CombatTokenConditionState[];
};

const polarityColor = {
  beneficial: '#4FCB86',
  harmful: '#E35D6A',
  neutral: '#9EA6B5',
} as const;

const conditionPriority = [
  'condition.unconscious',
  'condition.paralyzed',
  'condition.stunned',
  'condition.incapacitated',
  'condition.petrified',
  'condition.restrained',
  'condition.grappled',
  'condition.prone',
  'condition.frightened',
  'condition.charmed',
  'condition.blinded',
  'condition.poisoned',
];

function ConditionBadge({
  condition,
  x,
  y,
  size,
}: {
  condition: CombatTokenConditionState;
  x: number;
  y: number;
  size: number;
}) {
  const presentation = getCombatConditionPresentation(condition.conditionId);
  const image = useCanvasImage(presentation.iconUrl);
  const color = polarityColor[condition.polarity] ?? polarityColor.neutral;
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={size / 2} fill="#171921" stroke={color} strokeWidth={2} shadowColor="#000" shadowBlur={4} shadowOpacity={0.7} />
      {image ? (
        <KonvaImage image={image} x={-size * 0.31} y={-size * 0.31} width={size * 0.62} height={size * 0.62} />
      ) : (
        <Text text="•" x={-size / 2} y={-size * 0.38} width={size} align="center" fill={color} fontSize={size * 0.8} />
      )}
      {condition.remainingRounds !== null ? (
        <Text
          text={String(condition.remainingRounds)}
          x={size * 0.1}
          y={size * 0.04}
          width={size * 0.55}
          align="center"
          fill="#fff"
          stroke="#111"
          strokeWidth={2}
          fontStyle="bold"
          fontSize={Math.max(8, size * 0.42)}
        />
      ) : null}
    </Group>
  );
}

export function BattleMapTokenStatusLayer({
  tokens,
  conditionStates,
}: BattleMapTokenStatusLayerProps) {
  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  const grouped = new Map<string, CombatTokenConditionState[]>();
  for (const condition of conditionStates) {
    if (!tokenById.has(condition.tokenId)) continue;
    const current = grouped.get(condition.tokenId) ?? [];
    current.push(condition);
    current.sort((left, right) => {
      const leftPriority = conditionPriority.indexOf(left.conditionId);
      const rightPriority = conditionPriority.indexOf(right.conditionId);
      return (leftPriority < 0 ? 999 : leftPriority) -
        (rightPriority < 0 ? 999 : rightPriority);
    });
    grouped.set(condition.tokenId, current);
  }

  return (
    <>
      {Array.from(grouped.entries()).map(([tokenId, conditions]) => {
        const token = tokenById.get(tokenId);
        if (!token) return null;
        const size = Math.max(15, Math.min(24, token.size * 0.3));
        const visible = conditions.slice(0, 4);
        return (
          <Group key={tokenId} listening={false}>
            {visible.map((condition, index) => (
              <ConditionBadge
                key={`${condition.conditionId}:${condition.sourceId ?? index}`}
                condition={condition}
                x={token.x + token.size - size * 0.35 - index * size * 0.72}
                y={token.y + size * 0.38}
                size={size}
              />
            ))}
            {conditions.length > visible.length ? (
              <Text
                text={`+${conditions.length - visible.length}`}
                x={token.x + token.size - size * 1.1}
                y={token.y + size * 1.05}
                width={size}
                align="center"
                fill="#fff"
                stroke="#111"
                strokeWidth={2}
                fontStyle="bold"
                fontSize={Math.max(9, size * 0.48)}
              />
            ) : null}
          </Group>
        );
      })}
    </>
  );
}
