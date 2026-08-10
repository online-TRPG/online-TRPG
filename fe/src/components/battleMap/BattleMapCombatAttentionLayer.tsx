import { Circle, Group, Line, RegularPolygon, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import type {
  CombatMapAttentionState,
  CombatMotionPreference,
} from '../../features/sessionPlay/presentation/combatEffectTypes';
import { useCombatAnimationClock } from './useCombatAnimationClock';

type VttToken = VttMapStateDto['tokens'][number];

type BattleMapCombatAttentionLayerProps = {
  tokens: VttToken[];
  attention: CombatMapAttentionState | null;
  motionPreference: CombatMotionPreference;
};

function tokenCenter(token: VttToken) {
  return { x: token.x + token.size / 2, y: token.y + token.size / 2 };
}

export function BattleMapCombatAttentionLayer({
  tokens,
  attention,
  motionPreference,
}: BattleMapCombatAttentionLayerProps) {
  const hasAttention = Boolean(
    attention?.activeTokenId ||
    attention?.reactingTokenIds.length ||
    attention?.concentrationCasters.length,
  );
  const now = useCombatAnimationClock(hasAttention && motionPreference === 'full', 20);
  if (!attention) return null;

  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  const phase = motionPreference === 'full' ? (now % 1200) / 1200 : 0.35;
  const pulse = motionPreference === 'full'
    ? (Math.sin(phase * Math.PI * 2) + 1) / 2
    : 0.45;

  return (
    <Group listening={false}>
      {attention.concentrationCasters.flatMap((caster) => {
        const casterToken = tokenById.get(caster.tokenId);
        if (!casterToken) return [];
        const source = tokenCenter(casterToken);
        const lines = caster.visibleTargetTokenIds.flatMap((targetTokenId) => {
          const targetToken = tokenById.get(targetTokenId);
          if (!targetToken) return [];
          const target = tokenCenter(targetToken);
          return [(
            <Line
              key={`${caster.tokenId}:${targetTokenId}`}
              points={[source.x, source.y, target.x, target.y]}
              stroke="#C69CFF"
              strokeWidth={3}
              dash={[7, 8]}
              dashOffset={motionPreference === 'full' ? -phase * 30 : 0}
              opacity={0.58}
              shadowColor="#8A5CE6"
              shadowBlur={8}
            />
          )];
        });
        return [
          ...lines,
          <Circle
            key={`${caster.tokenId}:concentration`}
            x={source.x}
            y={source.y}
            radius={casterToken.size * 0.6 + pulse * 2}
            stroke="#C69CFF"
            strokeWidth={2}
            dash={[3, 5]}
            opacity={0.72}
          />,
        ];
      })}

      {attention.activeTokenId && tokenById.has(attention.activeTokenId) ? (() => {
        const token = tokenById.get(attention.activeTokenId)!;
        const center = tokenCenter(token);
        const radius = token.size * 0.59 + pulse * 2.5;
        return (
          <Group>
            <Circle
              x={center.x}
              y={center.y}
              radius={radius}
              stroke="#FFD36A"
              strokeWidth={4}
              dash={[12, 5]}
              dashOffset={motionPreference === 'full' ? phase * 18 : 0}
              shadowColor="#FFD36A"
              shadowBlur={8 + pulse * 7}
              opacity={0.86}
            />
            <RegularPolygon
              x={center.x}
              y={center.y - radius - 9}
              sides={3}
              radius={7}
              fill="#FFD36A"
              rotation={180}
              shadowColor="#111"
              shadowBlur={3}
            />
          </Group>
        );
      })() : null}

      {attention.reactingTokenIds.flatMap((tokenId) => {
        const token = tokenById.get(tokenId);
        if (!token) return [];
        const center = tokenCenter(token);
        const radius = token.size * 0.61;
        return [(
          <Group key={`${tokenId}:reaction`}>
            <Circle
              x={center.x}
              y={center.y}
              radius={radius + pulse * 5}
              stroke="#65E6FF"
              strokeWidth={4}
              dash={[4, 4]}
              opacity={0.78}
              shadowColor="#65E6FF"
              shadowBlur={10}
            />
            <Circle
              x={center.x}
              y={center.y}
              radius={radius + 8 + pulse * 7}
              stroke="#EAFBFF"
              strokeWidth={2}
              opacity={0.28 + pulse * 0.35}
            />
            <Circle
              x={center.x + radius * 0.72}
              y={center.y - radius * 0.72}
              radius={10}
              fill="#123442"
              stroke="#65E6FF"
              strokeWidth={2}
            />
            <Text
              x={center.x + radius * 0.72 - 5}
              y={center.y - radius * 0.72 - 8}
              width={10}
              align="center"
              text="!"
              fill="#EAFBFF"
              fontSize={16}
              fontStyle="bold"
            />
          </Group>
        )];
      })}
    </Group>
  );
}
