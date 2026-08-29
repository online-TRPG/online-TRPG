import type { VttMapStateDto } from '@trpg/shared-types';

export type TerrainCell = NonNullable<VttMapStateDto['terrainCells']>[number];

export const MAX_TERRAIN_DYNAMIC_PRIMITIVES = 120;
export const TERRAIN_DYNAMIC_PRIMITIVES_PER_CELL = 6;

export type TerrainEffectPattern =
  | 'crosshatch'
  | 'warning'
  | 'fog-bands'
  | 'contours'
  | 'diagonal-glint'
  | 'flames'
  | 'bubbles'
  | 'neutral-dash';

export type TerrainEffectMotion =
  | 'none'
  | 'edge-pulse'
  | 'fog-drift'
  | 'glint'
  | 'embers'
  | 'bubbles';

export type TerrainEffectVisual = {
  fill: string;
  stroke: string;
  label: string | null;
  accessibleLabel: string;
  dash: number[];
  pattern: TerrainEffectPattern;
  motion: TerrainEffectMotion;
};

export const terrainEffectVisuals: Record<string, TerrainEffectVisual> = {
  'terrain.difficult': {
    fill: 'rgba(105, 128, 88, 0.38)',
    stroke: 'rgba(184, 218, 152, 0.72)',
    label: 'DIF',
    accessibleLabel: '험지',
    dash: [7, 5],
    pattern: 'crosshatch',
    motion: 'none',
  },
  'terrain.hazardous': {
    fill: 'rgba(168, 66, 58, 0.36)',
    stroke: 'rgba(255, 150, 132, 0.82)',
    label: 'HAZ',
    accessibleLabel: '위험 지형',
    dash: [4, 4],
    pattern: 'warning',
    motion: 'edge-pulse',
  },
  'terrain.obscurement': {
    fill: 'rgba(70, 88, 110, 0.42)',
    stroke: 'rgba(166, 198, 230, 0.76)',
    label: 'OBS',
    accessibleLabel: '시야 방해',
    dash: [2, 6],
    pattern: 'fog-bands',
    motion: 'fog-drift',
  },
  'terrain.elevation': {
    fill: 'rgba(117, 104, 80, 0.38)',
    stroke: 'rgba(226, 206, 146, 0.76)',
    label: 'ELV',
    accessibleLabel: '고저차',
    dash: [10, 4],
    pattern: 'contours',
    motion: 'none',
  },
  'terrain.slippery': {
    fill: 'rgba(78, 139, 165, 0.34)',
    stroke: 'rgba(151, 224, 241, 0.78)',
    label: 'SLP',
    accessibleLabel: '미끄러운 지형',
    dash: [5, 3],
    pattern: 'diagonal-glint',
    motion: 'glint',
  },
  'terrain.burning': {
    fill: 'rgba(188, 86, 42, 0.38)',
    stroke: 'rgba(255, 174, 99, 0.84)',
    label: 'BRN',
    accessibleLabel: '불타는 지형',
    dash: [6, 2],
    pattern: 'flames',
    motion: 'embers',
  },
  'terrain.poison_cloud': {
    fill: 'rgba(93, 145, 83, 0.4)',
    stroke: 'rgba(168, 231, 138, 0.82)',
    label: 'PSN',
    accessibleLabel: '독구름',
    dash: [3, 5],
    pattern: 'bubbles',
    motion: 'bubbles',
  },
};

const defaultTerrainVisual: TerrainEffectVisual = {
  fill: 'rgba(96, 103, 111, 0.44)',
  stroke: 'rgba(218, 226, 234, 0.42)',
  label: '특수',
  accessibleLabel: '특수 지형',
  dash: [8, 5],
  pattern: 'neutral-dash',
  motion: 'none',
};

export function getTerrainEffectId(cell: TerrainCell) {
  return cell.terrainEffectId?.trim() || null;
}

export function getTerrainEffectVisual(cell: TerrainCell): TerrainEffectVisual {
  const terrainEffectId = getTerrainEffectId(cell);
  return terrainEffectId ? terrainEffectVisuals[terrainEffectId] ?? defaultTerrainVisual : defaultTerrainVisual;
}

export function selectAnimatedTerrainCells(
  terrainCells: TerrainCell[],
  animatedTerrainCellIds: ReadonlySet<string>,
) {
  return terrainCells
    .filter((cell) =>
      animatedTerrainCellIds.has(cell.id) && getTerrainEffectVisual(cell).motion !== 'none',
    )
    .slice(
      0,
      Math.floor(MAX_TERRAIN_DYNAMIC_PRIMITIVES / TERRAIN_DYNAMIC_PRIMITIVES_PER_CELL),
    );
}
