import { useEffect, useMemo, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type {
  CombatPresentationImpactV1,
  CombatPresentationV1,
  VttMapStateDto,
} from '@trpg/shared-types';
import type {
  CombatEffectPlayback,
  CombatMotionPreference,
} from '../../features/sessionPlay/presentation/combatEffectTypes';
import { getCombatDamagePresentation } from '../../features/sessionPlay/presentation/combatDamagePresentation';
import { getCombatConditionPresentation } from '../../features/sessionPlay/presentation/combatConditionPresentation';
import { useCanvasImage } from './useCanvasImage';

type Point = { x: number; y: number };
type VttToken = VttMapStateDto['tokens'][number];

type BattleMapCombatEffectLayerProps = {
  effects: CombatEffectPlayback[];
  tokens: VttToken[];
  participantTokenIdById: Record<string, string>;
  motionPreference: CombatMotionPreference;
  mapWidth: number;
};

function centerOf(token: VttToken): Point {
  return { x: token.x + token.size / 2, y: token.y + token.size / 2 };
}

function EffectIcon({ iconUrl, color, x, y, size, opacity }: {
  iconUrl: string;
  color: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
}) {
  const image = useCanvasImage(iconUrl);
  return (
    <Group x={x} y={y} opacity={opacity} listening={false}>
      <Circle radius={size / 2} fill={color} stroke="#111" strokeWidth={2} shadowColor={color} shadowBlur={8} shadowOpacity={0.75} />
      {image ? <KonvaImage image={image} x={-size * 0.31} y={-size * 0.31} width={size * 0.62} height={size * 0.62} /> : null}
    </Group>
  );
}

function DamageFloat({ impact, point, progress, index }: {
  impact: CombatPresentationImpactV1;
  point: Point;
  progress: number;
  index: number;
}) {
  const packet = impact.damagePackets[index];
  const presentation = getCombatDamagePresentation(packet.damageType);
  const immune = packet.modifiers.includes('immune');
  const resisted = packet.modifiers.includes('resisted');
  const vulnerable = packet.modifiers.includes('vulnerable');
  const saved = packet.modifiers.includes('saved_half') || impact.outcome === 'saved';
  const qualifier = immune ? '면역' : resisted ? '저항' : vulnerable ? '취약' : saved ? '내성' : '';
  const critical = impact.outcome === 'critical';
  const y = point.y - 26 - index * 28 - progress * 34;
  const opacity = Math.min(1, progress * 5) * Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28);
  return (
    <Group opacity={opacity} listening={false}>
      <EffectIcon iconUrl={presentation.iconUrl} color={presentation.color} x={point.x - 23} y={y + 10} size={22} opacity={1} />
      <Text
        text={immune ? '0 면역' : `${critical ? '치명타 ' : ''}-${packet.appliedAmount}${qualifier ? ` ${qualifier}` : ''}`}
        x={point.x - 10}
        y={y}
        width={120}
        fill={presentation.color}
        stroke="#111"
        strokeWidth={3}
        fontSize={critical ? 23 : 20}
        fontStyle="bold"
        shadowColor="#000"
        shadowBlur={4}
      />
    </Group>
  );
}

function HealingFloat({ impact, point, progress, index }: {
  impact: CombatPresentationImpactV1;
  point: Point;
  progress: number;
  index: number;
}) {
  const packet = impact.healingPackets[index];
  const colors = { hp: '#58E38D', temporary_hp: '#58B9FF', revive: '#FFE68A' } as const;
  const labels = { hp: '', temporary_hp: ' 임시 HP', revive: ' 부활' } as const;
  const iconUrl = `/assets/combat-icons/healing/${packet.kind}.svg`;
  const y = point.y - 28 - (impact.damagePackets.length + index) * 28 - progress * 32;
  const opacity = Math.min(1, progress * 5) * Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28);
  return (
    <Group opacity={opacity} listening={false}>
      <EffectIcon iconUrl={iconUrl} color={colors[packet.kind]} x={point.x - 23} y={y + 10} size={22} opacity={1} />
      <Text
        text={`+${packet.appliedAmount}${labels[packet.kind]}`}
        x={point.x - 10}
        y={y}
        width={150}
        fill={colors[packet.kind]}
        stroke="#111"
        strokeWidth={3}
        fontSize={20}
        fontStyle="bold"
      />
    </Group>
  );
}

function ConditionFloat({ impact, point, progress, index }: {
  impact: CombatPresentationImpactV1;
  point: Point;
  progress: number;
  index: number;
}) {
  const change = impact.conditionChanges[index];
  const presentation = getCombatConditionPresentation(change.conditionId);
  const y = point.y + 26 + index * 24 - progress * 18;
  const color = change.operation === 'added' ? '#F2C96D' : '#AAB3C3';
  return (
    <Group opacity={Math.max(0, 1 - progress)} listening={false}>
      <EffectIcon iconUrl={presentation.iconUrl} color={color} x={point.x - 20} y={y + 8} size={19} opacity={1} />
      <Text
        text={`${change.operation === 'added' ? '+' : '−'} ${presentation.label}`}
        x={point.x - 7}
        y={y}
        width={120}
        fill={color}
        stroke="#111"
        strokeWidth={2}
        fontSize={16}
        fontStyle="bold"
      />
    </Group>
  );
}

function DeliveryEffect({ presentation, source, target, progress, outcome }: {
  presentation: CombatPresentationV1;
  source: Point | null;
  target: Point;
  progress: number;
  outcome: CombatPresentationImpactV1['outcome'];
}) {
  const firstPacket = presentation.impacts.flatMap((impact) => impact.damagePackets)[0];
  const color = firstPacket
    ? getCombatDamagePresentation(firstPacket.damageType).color
    : presentation.impacts.some((impact) => impact.healingPackets.length)
      ? '#58E38D'
      : '#F2C96D';
  const opacity = Math.max(0, 1 - progress);
  if (presentation.delivery === 'melee') {
    const visualTarget = outcome === 'miss'
      ? { x: target.x + 22, y: target.y - 14 }
      : target;
    const lunge = source
      ? Math.sin(Math.min(1, progress * 1.8) * Math.PI) * 0.16
      : 0;
    const attackerEcho = source
      ? {
          x: source.x + (target.x - source.x) * lunge,
          y: source.y + (target.y - source.y) * lunge,
        }
      : null;
    return (
      <Group opacity={opacity} listening={false}>
        {attackerEcho ? <Circle x={attackerEcho.x} y={attackerEcho.y} radius={12} fill={`${color}44`} stroke={color} strokeWidth={2} /> : null}
        <Line points={[visualTarget.x - 24, visualTarget.y + 18, visualTarget.x + 24, visualTarget.y - 18]} stroke={color} strokeWidth={7} lineCap="round" shadowColor={color} shadowBlur={12} />
        <Line points={[visualTarget.x - 13, visualTarget.y - 22, visualTarget.x + 16, visualTarget.y + 20]} stroke="#fff" strokeWidth={3} lineCap="round" />
        {outcome === 'critical' ? (
          <>
            <Circle x={target.x} y={target.y} radius={24 + progress * 26} stroke={color} strokeWidth={5} opacity={opacity} />
            <Circle x={target.x} y={target.y} radius={13 + progress * 38} stroke="#fff" strokeWidth={2} opacity={opacity * 0.8} />
          </>
        ) : null}
      </Group>
    );
  }
  if (source && ['projectile', 'bolt', 'beam', 'line'].includes(presentation.delivery)) {
    const travel = presentation.delivery === 'beam' || presentation.delivery === 'line' ? 1 : Math.min(1, progress * 2.3);
    const projectile = {
      x: source.x + (target.x - source.x) * travel,
      y: source.y + (target.y - source.y) * travel,
    };
    return (
      <Group opacity={opacity} listening={false}>
        <Line points={[source.x, source.y, target.x, target.y]} stroke={color} strokeWidth={presentation.delivery === 'beam' ? 7 : 3} dash={presentation.delivery === 'projectile' ? [8, 7] : undefined} shadowColor={color} shadowBlur={10} />
        {presentation.delivery === 'projectile' || presentation.delivery === 'bolt' ? (
          <Circle x={projectile.x} y={projectile.y} radius={7} fill="#fff" stroke={color} strokeWidth={4} shadowColor={color} shadowBlur={12} />
        ) : null}
      </Group>
    );
  }
  if (source && presentation.delivery === 'cone') {
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const length = Math.max(46, Math.hypot(target.x - source.x, target.y - source.y));
    const spread = Math.PI / 5;
    const left = {
      x: source.x + Math.cos(angle - spread) * length,
      y: source.y + Math.sin(angle - spread) * length,
    };
    const right = {
      x: source.x + Math.cos(angle + spread) * length,
      y: source.y + Math.sin(angle + spread) * length,
    };
    return (
      <Line
        points={[source.x, source.y, left.x, left.y, right.x, right.y]}
        closed
        fill={`${color}33`}
        stroke={color}
        strokeWidth={4}
        opacity={opacity}
        shadowColor={color}
        shadowBlur={12}
        listening={false}
      />
    );
  }
  const radius = 18 + progress * (presentation.delivery === 'ground' ? 34 : 56);
  return (
    <Circle
      x={target.x}
      y={target.y}
      radius={radius}
      fill={presentation.delivery === 'ground' ? `${color}22` : undefined}
      stroke={color}
      strokeWidth={Math.max(2, 8 * (1 - progress))}
      opacity={opacity}
      shadowColor={color}
      shadowBlur={14}
      listening={false}
    />
  );
}

export function BattleMapCombatEffectLayer({
  effects,
  tokens,
  participantTokenIdById,
  motionPreference,
  mapWidth,
}: BattleMapCombatEffectLayerProps) {
  const [now, setNow] = useState(() => performance.now());
  const tokenById = useMemo(() => new Map(tokens.map((token) => [token.id, token])), [tokens]);

  useEffect(() => {
    if (!effects.length || motionPreference === 'off') return;
    let frame = 0;
    const update = () => {
      setNow(performance.now());
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [effects.length, motionPreference]);

  return (
    <>
      {effects.map((effect) => {
        const progress = Math.min(1, Math.max(0, (now - effect.startedAt) / effect.durationMs));
        if (!effect.envelope) {
          return (
            <Group key={effect.id} opacity={Math.max(0, 1 - progress)} listening={false}>
              <Rect x={mapWidth / 2 - 76} y={24} width={152} height={34} fill="#151820DD" cornerRadius={17} />
              <Text x={mapWidth / 2 - 76} y={32} width={152} align="center" text={`효과 ${effect.collapsedCount}개 요약`} fill="#fff" fontSize={15} fontStyle="bold" />
            </Group>
          );
        }
        const presentation = effect.envelope.presentation;
        const sourceTokenId = presentation.sourceParticipantId
          ? participantTokenIdById[presentation.sourceParticipantId]
          : null;
        const sourceToken = sourceTokenId ? tokenById.get(sourceTokenId) : null;
        const source = sourceToken ? centerOf(sourceToken) : null;
        return presentation.impacts.slice(0, 24).map((impact, impactIndex) => {
          const impactProgress = Math.min(
            1,
            Math.max(
              0,
              (now - effect.startedAt - Math.min(impactIndex, 8) * 75) /
                effect.durationMs,
            ),
          );
          const targetTokenId = impact.targetParticipantId
            ? participantTokenIdById[impact.targetParticipantId]
            : null;
          const targetToken = targetTokenId ? tokenById.get(targetTokenId) : null;
          const target = targetToken
            ? centerOf(targetToken)
            : impact.targetParticipantId
              ? null
              : presentation.publicPoint ?? null;
          if (!target) return null;
          return (
            <Group key={`${effect.id}:${impactIndex}:${impact.targetParticipantId ?? 'point'}`} listening={false}>
              <DeliveryEffect presentation={presentation} source={source} target={target} progress={motionPreference === 'reduced' ? 1 : impactProgress} outcome={impact.outcome} />
              {impact.outcome === 'miss' ? (
                <Text text="빗나감" x={target.x - 42} y={target.y - 34 - impactProgress * 20} width={84} align="center" fill="#CBD0DA" stroke="#111" strokeWidth={3} fontSize={18} fontStyle="bold" opacity={Math.max(0, 1 - impactProgress)} />
              ) : null}
              {impact.damagePackets.slice(0, 4).map((_, index) => <DamageFloat key={`d:${index}`} impact={impact} point={target} progress={impactProgress} index={index} />)}
              {impact.healingPackets.slice(0, 2).map((_, index) => <HealingFloat key={`h:${index}`} impact={impact} point={target} progress={impactProgress} index={index} />)}
              {impact.conditionChanges.slice(0, 4).map((_, index) => <ConditionFloat key={`c:${index}`} impact={impact} point={target} progress={impactProgress} index={index} />)}
            </Group>
          );
        });
      })}
    </>
  );
}
