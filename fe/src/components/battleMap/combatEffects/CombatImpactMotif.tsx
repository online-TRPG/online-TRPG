import { Arc, Circle, Group, Line, Rect, RegularPolygon } from 'react-konva';
import type { CombatImpactMotif } from '../../../features/sessionPlay/presentation/combatDamagePresentation';

type Point = { x: number; y: number };

type CombatImpactMotifProps = {
  motif: CombatImpactMotif;
  point: Point;
  progress: number;
  color: string;
  intensity?: number;
  reduced?: boolean;
};

const angles = [0, 60, 120, 180, 240, 300];

function radialPoint(point: Point, angle: number, distance: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x + Math.cos(radians) * distance,
    y: point.y + Math.sin(radians) * distance,
  };
}

export function CombatImpactMotif({
  motif,
  point,
  progress,
  color,
  intensity = 1,
  reduced = false,
}: CombatImpactMotifProps) {
  const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);
  const opacity = Math.max(0, 1 - progress) * Math.min(1, progress * 7);
  const radius = (10 + eased * 34) * intensity;

  if (reduced) {
    return (
      <Circle
        x={point.x}
        y={point.y}
        radius={16 + eased * 12}
        stroke={color}
        strokeWidth={4}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (motif === 'droplets') {
    return (
      <Group opacity={opacity} listening={false}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Circle
            key={index}
            x={point.x + (index - 2) * 8}
            y={point.y - 12 + eased * (24 + index * 3)}
            radius={3 + (index % 2)}
            fill={color}
            scaleY={1.5}
          />
        ))}
      </Group>
    );
  }

  if (motif === 'dust') {
    return (
      <Group opacity={opacity} listening={false}>
        <Circle x={point.x} y={point.y} radius={radius * 0.72} stroke={color} strokeWidth={7 * (1 - progress)} />
        {angles.slice(0, 4).map((angle, index) => {
          const dust = radialPoint(point, angle + 25, radius * 0.75);
          return <Circle key={index} x={dust.x} y={dust.y} radius={5 - index * 0.5} fill={color} opacity={0.7} />;
        })}
      </Group>
    );
  }

  if (motif === 'shards') {
    return (
      <Group opacity={opacity} listening={false}>
        {angles.map((angle) => {
          const start = radialPoint(point, angle, 7);
          const end = radialPoint(point, angle, radius);
          return <Line key={angle} points={[start.x, start.y, end.x, end.y]} stroke={color} strokeWidth={3} lineCap="round" />;
        })}
      </Group>
    );
  }

  if (motif === 'embers') {
    return (
      <Group opacity={opacity} listening={false}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Circle
            key={index}
            x={point.x + Math.sin(index * 1.8) * (8 + eased * 18)}
            y={point.y + 10 - eased * (22 + index * 4)}
            radius={index % 2 ? 2.5 : 4}
            fill={index % 2 ? '#FFF2B2' : color}
            shadowColor={color}
            shadowBlur={8}
          />
        ))}
      </Group>
    );
  }

  if (motif === 'compression') {
    return (
      <Group opacity={opacity} listening={false}>
        <RegularPolygon x={point.x} y={point.y} sides={6} radius={Math.max(9, 34 - eased * 18)} stroke={color} strokeWidth={3} />
        <Circle x={point.x} y={point.y} radius={10 + eased * 30} stroke={color} strokeWidth={4 * (1 - progress)} />
      </Group>
    );
  }

  if (motif === 'arcs') {
    return (
      <Group opacity={opacity} listening={false}>
        {[-1, 1].map((direction) => (
          <Line
            key={direction}
            points={[
              point.x,
              point.y,
              point.x + direction * 8,
              point.y - 12,
              point.x + direction * 18,
              point.y + 3,
              point.x + direction * radius,
              point.y - 10,
            ]}
            stroke={color}
            strokeWidth={3}
            lineJoin="miter"
            shadowColor={color}
            shadowBlur={10}
          />
        ))}
      </Group>
    );
  }

  if (motif === 'implosion') {
    return (
      <Group opacity={opacity} listening={false}>
        {angles.map((angle, index) => {
          const from = radialPoint(point, angle, 42 - eased * 30);
          return <Circle key={index} x={from.x} y={from.y} radius={4} fill={index % 2 ? color : '#17121F'} />;
        })}
        <Circle x={point.x} y={point.y} radius={8 + eased * 5} fill="#17121F" stroke={color} strokeWidth={2} />
      </Group>
    );
  }

  if (motif === 'needles') {
    return (
      <Group opacity={opacity} listening={false}>
        {[-18, -6, 6, 18].map((offset) => (
          <Line key={offset} points={[point.x - radius, point.y + offset, point.x + radius, point.y - offset * 0.25]} stroke={color} strokeWidth={2} lineCap="round" />
        ))}
      </Group>
    );
  }

  if (motif === 'bubbles') {
    return (
      <Group opacity={opacity} listening={false}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Circle
            key={index}
            x={point.x + Math.cos(index * 2.1) * (8 + eased * 18)}
            y={point.y + 14 - eased * (14 + index * 5)}
            radius={4 + (index % 3) * 2}
            stroke={color}
            strokeWidth={2}
            fill={`${color}44`}
          />
        ))}
      </Group>
    );
  }

  if (motif === 'distortion') {
    return (
      <Group opacity={opacity} listening={false}>
        {[0, 1, 2].map((index) => (
          <Circle
            key={index}
            x={point.x + Math.sin(progress * 20 + index) * 5}
            y={point.y}
            radius={10 + eased * (18 + index * 6)}
            scaleX={1 + index * 0.22}
            scaleY={0.55 + index * 0.08}
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </Group>
    );
  }

  if (motif === 'rays') {
    return (
      <Group opacity={opacity} listening={false}>
        {angles.map((angle) => {
          const start = radialPoint(point, angle, 12);
          const end = radialPoint(point, angle, radius + 8);
          return <Line key={angle} points={[start.x, start.y, end.x, end.y]} stroke={color} strokeWidth={angle % 120 === 0 ? 5 : 2} shadowColor={color} shadowBlur={8} />;
        })}
      </Group>
    );
  }

  if (motif === 'slashes') {
    return (
      <Group opacity={opacity} listening={false}>
        <Line points={[point.x - radius, point.y + radius * 0.55, point.x + radius, point.y - radius * 0.55]} stroke={color} strokeWidth={6} lineCap="round" />
        <Line points={[point.x - radius * 0.7, point.y - radius * 0.7, point.x + radius * 0.55, point.y + radius * 0.65]} stroke="#FFF" strokeWidth={2} lineCap="round" />
      </Group>
    );
  }

  if (motif === 'shockwaves') {
    return (
      <Group opacity={opacity} listening={false}>
        <Circle x={point.x} y={point.y} radius={radius} stroke={color} strokeWidth={5 * (1 - progress)} />
        <Circle x={point.x} y={point.y} radius={radius * 0.62} stroke={color} strokeWidth={3 * (1 - progress)} dash={[8, 5]} />
      </Group>
    );
  }

  return (
    <Group opacity={opacity} listening={false}>
      <Circle x={point.x} y={point.y} radius={radius} stroke={color} strokeWidth={4 * (1 - progress)} />
      <Arc x={point.x} y={point.y} innerRadius={radius * 0.45} outerRadius={radius * 0.55} angle={210} rotation={-105} fill={color} />
      <Rect x={point.x - 2} y={point.y - 2} width={4} height={4} fill="#FFF" rotation={45} />
    </Group>
  );
}
