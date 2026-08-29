import { Circle, Group, Line, Rect } from 'react-konva';
import type { SignatureCombatPresetId } from '../../../features/sessionPlay/presentation/combatPresetRegistry';
import {
  createCombatEffectSeed,
  getPhaseProgress,
  seededCombatValue,
} from '../../../features/sessionPlay/presentation/combatEffectTimeline';

type Point = { x: number; y: number };

type SignatureSpellEffectProps = {
  presetId: SignatureCombatPresetId;
  effectId: string;
  source: Point | null;
  target: Point;
  center: Point;
  progress: number;
  impactIndex: number;
  reduced: boolean;
};

function interpolate(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function SignatureSpellEffect({
  presetId,
  effectId,
  source,
  target,
  center,
  progress,
  impactIndex,
  reduced,
}: SignatureSpellEffectProps) {
  const opacity = Math.max(0, 1 - Math.max(0, progress - 0.76) / 0.24);
  const seed = createCombatEffectSeed(`${effectId}:${impactIndex}:${presetId}`);

  if (reduced) {
    const reducedColor = presetId === 'spell.fireball'
      ? '#FF6A36'
      : presetId === 'spell.lightning_bolt'
        ? '#FFE04A'
        : presetId === 'spell.thunderwave'
          ? '#4E8CFF'
          : presetId === 'spell.moonbeam'
            ? '#E8ECFF'
            : '#D8C7FF';
    return (
      <Circle
        x={center.x}
        y={center.y}
        radius={18 + progress * 22}
        stroke={reducedColor}
        strokeWidth={4}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (presetId === 'spell.magic_missile') {
    if (!source) return null;
    const travel = getPhaseProgress(progress, 0.08, 0.68);
    const controlOffset = (seededCombatValue(seed, 0) - 0.5) * 76;
    const current = interpolate(source, target, travel);
    const control = {
      x: (source.x + target.x) / 2 + controlOffset,
      y: Math.min(source.y, target.y) - 34 - impactIndex * 4,
    };
    return (
      <Group opacity={opacity} listening={false}>
        <Line
          points={[source.x, source.y, control.x, control.y, target.x, target.y]}
          stroke="#BDA4FF"
          strokeWidth={3}
          tension={0.48}
          shadowColor="#8F68FF"
          shadowBlur={12}
          opacity={0.75}
        />
        <Circle x={current.x} y={current.y} radius={7} fill="#FFFFFF" stroke="#A884FF" strokeWidth={4} shadowColor="#A884FF" shadowBlur={16} />
        {progress > 0.58 ? <Circle x={target.x} y={target.y} radius={8 + (progress - 0.58) * 42} stroke="#D8C7FF" strokeWidth={3} /> : null}
      </Group>
    );
  }

  if (presetId === 'spell.fireball') {
    if (impactIndex > 0) return null;
    const travel = getPhaseProgress(progress, 0.05, 0.42);
    const explosion = getPhaseProgress(progress, 0.35, 0.82);
    const orb = source ? interpolate(source, center, travel) : center;
    return (
      <Group opacity={opacity} listening={false}>
        {source && travel < 1 ? <Line points={[source.x, source.y, orb.x, orb.y]} stroke="#FFB24A" strokeWidth={5} shadowColor="#FF5A36" shadowBlur={14} /> : null}
        {travel < 1 ? <Circle x={orb.x} y={orb.y} radius={8 + travel * 4} fill="#FFF1A8" stroke="#FF5A36" strokeWidth={4} shadowColor="#FF5A36" shadowBlur={18} /> : null}
        <Circle x={center.x} y={center.y} radius={12 + explosion * 62} fill={`rgba(255, 90, 54, ${0.24 * (1 - explosion)})`} stroke="#FF6A36" strokeWidth={Math.max(2, 10 * (1 - explosion))} shadowColor="#FF5A36" shadowBlur={20} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
          const angle = seededCombatValue(seed, index) * Math.PI * 2;
          const distance = explosion * (32 + seededCombatValue(seed, index + 8) * 46);
          return <Circle key={index} x={center.x + Math.cos(angle) * distance} y={center.y + Math.sin(angle) * distance} radius={2 + (index % 3)} fill={index % 2 ? '#FFD36A' : '#FF5A36'} />;
        })}
      </Group>
    );
  }

  if (presetId === 'spell.lightning_bolt') {
    if (!source || impactIndex > 0) return null;
    const reveal = getPhaseProgress(progress, 0.08, 0.5);
    const end = interpolate(source, center, reveal);
    const dx = end.x - source.x;
    const dy = end.y - source.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / length, y: dx / length };
    const points: number[] = [source.x, source.y];
    for (let index = 1; index < 7; index += 1) {
      const ratio = index / 7;
      const offset = (seededCombatValue(seed, index) - 0.5) * 20;
      points.push(source.x + dx * ratio + normal.x * offset, source.y + dy * ratio + normal.y * offset);
    }
    points.push(end.x, end.y);
    return (
      <Group opacity={opacity} listening={false}>
        <Line points={points} stroke="#FFE04A" strokeWidth={8} shadowColor="#FFE04A" shadowBlur={18} lineJoin="miter" />
        <Line points={points} stroke="#FFFFFF" strokeWidth={2} lineJoin="miter" />
      </Group>
    );
  }

  if (presetId === 'spell.thunderwave') {
    if (impactIndex > 0) return null;
    const expansion = getPhaseProgress(progress, 0.12, 0.78);
    const size = 28 + expansion * 92;
    return (
      <Group opacity={opacity} listening={false}>
        <Rect x={center.x - size / 2} y={center.y - size / 2} width={size} height={size} stroke="#4E8CFF" strokeWidth={Math.max(2, 8 * (1 - expansion))} cornerRadius={8} />
        <Rect x={center.x - size * 0.32} y={center.y - size * 0.32} width={size * 0.64} height={size * 0.64} stroke="#A9C5FF" strokeWidth={3} dash={[10, 6]} />
      </Group>
    );
  }

  if (impactIndex > 0) return null;
  const beam = getPhaseProgress(progress, 0.06, 0.42);
  return (
    <Group opacity={opacity} listening={false}>
      <Rect x={center.x - 18} y={center.y - 150 * beam} width={36} height={150 * beam} fill="rgba(224, 231, 255, 0.28)" shadowColor="#E8ECFF" shadowBlur={18} />
      <Circle x={center.x} y={center.y} radius={18 + beam * 24} fill="rgba(214, 220, 255, 0.18)" stroke="#E8ECFF" strokeWidth={3} dash={[7, 5]} />
      <Circle x={center.x} y={center.y} radius={9 + beam * 12} stroke="#B8C5FF" strokeWidth={2} />
    </Group>
  );
}
