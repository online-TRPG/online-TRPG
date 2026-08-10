import { describe, expect, it } from 'vitest';
import type { VttMapStateDto } from '@trpg/shared-types';
import { projectCombatTargetPreview } from './combatTargetPreviewProjection';
import type { CombatTargetingMode } from './combatEffectTypes';

const tokens = [
  { id: 'source', x: 0, y: 0, size: 50 },
  { id: 'eligible', x: 100, y: 0, size: 50 },
  { id: 'wrong', x: 0, y: 100, size: 50 },
  { id: 'fallen', x: 50, y: 0, size: 50 },
] as VttMapStateDto['tokens'];

const singleMode: CombatTargetingMode = {
  sourceTokenId: 'source', actionId: 'attack', shape: 'single', rangeFt: 5,
  geometryKnown: true, eligibleTokenIds: ['eligible'], defeatedTokenIds: ['fallen'],
};

describe('projectCombatTargetPreview', () => {
  it('separates valid, out-of-range, wrong-kind, and defeated targets', () => {
    expect(projectCombatTargetPreview({ mode: { ...singleMode, rangeFt: 15 }, point: { x: 110, y: 10 }, tokens, gridSize: 50 }).reasonLabel).toBe('사용 가능');
    expect(projectCombatTargetPreview({ mode: singleMode, point: { x: 110, y: 10 }, tokens, gridSize: 50 }).reasonLabel).toBe('사거리 밖');
    expect(projectCombatTargetPreview({ mode: { ...singleMode, rangeFt: 15 }, point: { x: 10, y: 110 }, tokens, gridSize: 50 }).reasonLabel).toBe('대상 종류가 맞지 않음');
    expect(projectCombatTargetPreview({ mode: { ...singleMode, rangeFt: 15 }, point: { x: 60, y: 10 }, tokens, gridSize: 50 }).reasonLabel).toBe('쓰러진 대상');
  });

  it('does not infer affected tokens when area geometry is unknown', () => {
    const preview = projectCombatTargetPreview({
      mode: { ...singleMode, shape: 'circle', rangeFt: 50, geometryKnown: false },
      point: { x: 100, y: 100 }, tokens, gridSize: 50,
    });
    expect(preview.validity).toBe('unknown');
    expect(preview.visibleAffectedTokenIds).toEqual([]);
  });
});
