import type { VttMapStateDto } from '@trpg/shared-types';

type TerrainCell = NonNullable<VttMapStateDto['terrainCells']>[number];

type TerrainEffectVisual = {
  fill: string;
  stroke: string;
  label: string | null;
  dash: number[];
};

const terrainEffectVisuals: Record<string, TerrainEffectVisual> = {
  'terrain.difficult': {
    fill: 'rgba(105, 128, 88, 0.38)',
    stroke: 'rgba(184, 218, 152, 0.72)',
    label: 'DIF',
    dash: [7, 5],
  },
  'terrain.hazardous': {
    fill: 'rgba(168, 66, 58, 0.36)',
    stroke: 'rgba(255, 150, 132, 0.82)',
    label: 'HAZ',
    dash: [4, 4],
  },
  'terrain.obscurement': {
    fill: 'rgba(70, 88, 110, 0.42)',
    stroke: 'rgba(166, 198, 230, 0.76)',
    label: 'OBS',
    dash: [2, 6],
  },
  'terrain.elevation': {
    fill: 'rgba(117, 104, 80, 0.38)',
    stroke: 'rgba(226, 206, 146, 0.76)',
    label: 'ELV',
    dash: [10, 4],
  },
  'terrain.slippery': {
    fill: 'rgba(78, 139, 165, 0.34)',
    stroke: 'rgba(151, 224, 241, 0.78)',
    label: 'SLP',
    dash: [5, 3],
  },
  'terrain.burning': {
    fill: 'rgba(188, 86, 42, 0.38)',
    stroke: 'rgba(255, 174, 99, 0.84)',
    label: 'BRN',
    dash: [6, 2],
  },
  'terrain.poison_cloud': {
    fill: 'rgba(93, 145, 83, 0.4)',
    stroke: 'rgba(168, 231, 138, 0.82)',
    label: 'PSN',
    dash: [3, 5],
  },
};

const defaultTerrainVisual: TerrainEffectVisual = {
  fill: 'rgba(96, 103, 111, 0.44)',
  stroke: 'rgba(218, 226, 234, 0.42)',
  label: null,
  dash: [8, 5],
};

export function getTerrainEffectId(cell: TerrainCell) {
  return cell.terrainEffectId?.trim() || null;
}

export function getTerrainEffectVisual(cell: TerrainCell): TerrainEffectVisual {
  const terrainEffectId = getTerrainEffectId(cell);
  return terrainEffectId ? terrainEffectVisuals[terrainEffectId] ?? defaultTerrainVisual : defaultTerrainVisual;
}
