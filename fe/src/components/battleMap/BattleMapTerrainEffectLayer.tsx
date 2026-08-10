import { Circle, Ellipse, Group, Layer, Line, Rect, RegularPolygon, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { CombatMotionPreference } from '../../features/sessionPlay/presentation/combatEffectTypes';
import {
  getTerrainEffectVisual,
  selectAnimatedTerrainCells,
  type TerrainEffectPattern,
} from './battleMapTerrainEffects';
import { useCombatAnimationClock } from './useCombatAnimationClock';

type TerrainCell = NonNullable<VttMapStateDto['terrainCells']>[number];

type BattleMapTerrainEffectLayerProps = {
  terrainCells: TerrainCell[];
  animatedTerrainCellIds: ReadonlySet<string>;
  motionPreference: CombatMotionPreference;
};

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function StaticTerrainPattern({ cell, pattern, stroke }: {
  cell: TerrainCell;
  pattern: TerrainEffectPattern;
  stroke: string;
}) {
  const left = cell.x + 5;
  const top = cell.y + 5;
  const right = cell.x + cell.width - 5;
  const bottom = cell.y + cell.height - 5;
  const centerX = cell.x + cell.width / 2;
  const centerY = cell.y + cell.height / 2;
  if (pattern === 'crosshatch') {
    return <Group opacity={0.55}>
      <Line points={[left, bottom, right, top]} stroke={stroke} strokeWidth={1.5} />
      <Line points={[left, top, right, bottom]} stroke={stroke} strokeWidth={1.5} />
      <Line points={[left, centerY, centerX, top]} stroke={stroke} strokeWidth={1} dash={[3, 3]} />
    </Group>;
  }
  if (pattern === 'warning') {
    return <Group opacity={0.72}>
      <RegularPolygon x={centerX} y={centerY} sides={3} radius={Math.min(cell.width, cell.height) * 0.25} stroke={stroke} strokeWidth={2} />
      <Text x={centerX - 5} y={centerY - 8} width={10} align="center" text="!" fill={stroke} fontSize={15} fontStyle="bold" />
    </Group>;
  }
  if (pattern === 'fog-bands') {
    return <Group opacity={0.55}>
      {[0.32, 0.5, 0.68].map((ratio) => <Line key={ratio} points={[left, cell.y + cell.height * ratio, centerX, cell.y + cell.height * (ratio - 0.08), right, cell.y + cell.height * ratio]} stroke={stroke} strokeWidth={2} tension={0.45} />)}
    </Group>;
  }
  if (pattern === 'contours') {
    return <Group opacity={0.58}>
      <Ellipse x={centerX} y={centerY} radiusX={cell.width * 0.34} radiusY={cell.height * 0.25} stroke={stroke} strokeWidth={1.5} />
      <Ellipse x={centerX} y={centerY} radiusX={cell.width * 0.2} radiusY={cell.height * 0.13} stroke={stroke} strokeWidth={1} />
      <Line points={[centerX, bottom, centerX, top, centerX - 4, top + 5, centerX, top, centerX + 4, top + 5]} stroke={stroke} strokeWidth={1.5} />
    </Group>;
  }
  if (pattern === 'diagonal-glint') {
    return <Group opacity={0.58}>
      {[-0.25, 0.15, 0.55].map((offset) => <Line key={offset} points={[cell.x + cell.width * offset, bottom, cell.x + cell.width * (offset + 0.7), top]} stroke={stroke} strokeWidth={1.5} />)}
    </Group>;
  }
  if (pattern === 'flames') {
    return <Group opacity={0.68}>
      {[0.28, 0.5, 0.72].map((ratio, index) => <Line key={ratio} points={[cell.x + cell.width * ratio, bottom, cell.x + cell.width * (ratio - 0.06), centerY, cell.x + cell.width * (ratio + 0.05), top + index * 3]} stroke={stroke} strokeWidth={2} tension={0.35} />)}
    </Group>;
  }
  if (pattern === 'bubbles') {
    return <Group opacity={0.6}>
      <Circle x={cell.x + cell.width * 0.3} y={cell.y + cell.height * 0.62} radius={cell.width * 0.09} stroke={stroke} strokeWidth={1.5} />
      <Circle x={cell.x + cell.width * 0.58} y={cell.y + cell.height * 0.35} radius={cell.width * 0.12} stroke={stroke} strokeWidth={1.5} />
      <Circle x={cell.x + cell.width * 0.76} y={cell.y + cell.height * 0.7} radius={cell.width * 0.06} fill={stroke} opacity={0.7} />
    </Group>;
  }
  return <Rect x={left} y={top} width={Math.max(0, right - left)} height={Math.max(0, bottom - top)} stroke={stroke} strokeWidth={1.5} dash={[8, 5]} opacity={0.55} />;
}

function DynamicTerrainPattern({ cell, now }: { cell: TerrainCell; now: number }) {
  const visual = getTerrainEffectVisual(cell);
  const seed = hashUnit(cell.id);
  const phase = ((now / 2600) + seed) % 1;
  const centerX = cell.x + cell.width / 2;
  const centerY = cell.y + cell.height / 2;
  if (visual.motion === 'edge-pulse') {
    return <Rect x={cell.x + 2} y={cell.y + 2} width={cell.width - 4} height={cell.height - 4} stroke={visual.stroke} strokeWidth={2 + Math.sin(phase * Math.PI) * 2} opacity={0.25 + Math.sin(phase * Math.PI) * 0.5} />;
  }
  if (visual.motion === 'fog-drift') {
    return <Line points={[cell.x - cell.width * 0.2 + phase * cell.width * 0.5, centerY, centerX, centerY - 5, cell.x + cell.width * 1.2, centerY]} stroke={visual.stroke} strokeWidth={5} opacity={0.25} tension={0.45} dash={[14, 10]} />;
  }
  if (visual.motion === 'glint') {
    const x = cell.x - cell.width * 0.2 + phase * cell.width * 1.4;
    return <Line points={[x - cell.height * 0.35, cell.y + cell.height, x + cell.height * 0.35, cell.y]} stroke="#ECFCFF" strokeWidth={2} opacity={0.22 + Math.sin(phase * Math.PI) * 0.5} />;
  }
  if (visual.motion === 'embers') {
    return <Group>
      {[0.24, 0.5, 0.76].map((ratio, index) => {
        const rise = (phase + index * 0.27) % 1;
        return <Circle key={ratio} x={cell.x + cell.width * ratio + Math.sin((phase + index) * Math.PI * 2) * 3} y={cell.y + cell.height * (0.86 - rise * 0.72)} radius={2 + index * 0.45} fill={visual.stroke} opacity={1 - rise} />;
      })}
    </Group>;
  }
  if (visual.motion === 'bubbles') {
    return <Group>
      {[0.3, 0.56, 0.76].map((ratio, index) => {
        const rise = (phase + index * 0.31) % 1;
        return <Circle key={ratio} x={cell.x + cell.width * ratio + Math.sin((phase + index) * Math.PI * 2) * 4} y={cell.y + cell.height * (0.9 - rise * 0.75)} radius={3 + index} stroke={visual.stroke} strokeWidth={1.5} opacity={0.75 - rise * 0.5} />;
      })}
    </Group>;
  }
  return null;
}

export function BattleMapTerrainEffectLayer({
  terrainCells,
  animatedTerrainCellIds,
  motionPreference,
}: BattleMapTerrainEffectLayerProps) {
  const dynamicCells = motionPreference === 'full'
    ? selectAnimatedTerrainCells(terrainCells, animatedTerrainCellIds)
    : [];
  const now = useCombatAnimationClock(dynamicCells.length > 0, 20);
  if (!terrainCells.length) return null;

  return (
    <Layer listening={false}>
      {terrainCells.map((cell) => {
        const visual = getTerrainEffectVisual(cell);
        return <StaticTerrainPattern key={`${cell.id}:pattern`} cell={cell} pattern={visual.pattern} stroke={visual.stroke} />;
      })}
      {dynamicCells.map((cell) => <DynamicTerrainPattern key={`${cell.id}:dynamic`} cell={cell} now={now} />)}
    </Layer>
  );
}
