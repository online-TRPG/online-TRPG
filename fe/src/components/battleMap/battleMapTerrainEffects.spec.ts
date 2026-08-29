import { describe, expect, it } from 'vitest';
import {
  selectAnimatedTerrainCells,
  terrainEffectVisuals,
  type TerrainCell,
} from './battleMapTerrainEffects';

describe('terrainEffectVisuals', () => {
  it('defines seven terrain effects with distinct non-color patterns', () => {
    const visuals = Object.values(terrainEffectVisuals);
    expect(visuals).toHaveLength(7);
    expect(new Set(visuals.map((visual) => visual.pattern)).size).toBe(7);
    expect(visuals.every((visual) => visual.accessibleLabel.length > 0)).toBe(true);
  });

  it('animates only terrain whose meaning benefits from motion', () => {
    expect(terrainEffectVisuals['terrain.difficult'].motion).toBe('none');
    expect(terrainEffectVisuals['terrain.elevation'].motion).toBe('none');
    expect(terrainEffectVisuals['terrain.burning'].motion).toBe('embers');
  });

  it('caps dynamic terrain at twenty cells while preserving static fallback', () => {
    const cells = Array.from({ length: 100 }, (_, index) => ({
      id: `burning-${index}`,
      terrainEffectId: 'terrain.burning',
      x: index * 10,
      y: 0,
      width: 10,
      height: 10,
    })) as TerrainCell[];
    expect(selectAnimatedTerrainCells(cells, new Set(cells.map((cell) => cell.id)))).toHaveLength(20);
    expect(selectAnimatedTerrainCells(cells, new Set(['burning-7'])).map((cell) => cell.id)).toEqual(['burning-7']);
  });
});
