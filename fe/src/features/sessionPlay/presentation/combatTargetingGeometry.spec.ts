import { describe, expect, it } from 'vitest';
import {
  isPointInCombatCircle,
  isPointInCombatCone,
  isPointInCombatLine,
} from '@trpg/shared-types';
import { getCombatSpellTargetShapeMetadata } from '../utils/combatSpellModel';

describe('combat targeting geometry', () => {
  it('evaluates circle, cone, and line boundaries', () => {
    expect(isPointInCombatCircle({ center: { x: 0, y: 0 }, point: { x: 3, y: 4 }, radius: 5 })).toBe(true);
    expect(isPointInCombatCone({ origin: { x: 0, y: 0 }, target: { x: 10, y: 0 }, point: { x: 5, y: 3 }, length: 10, angleDegrees: 90 })).toBe(true);
    expect(isPointInCombatCone({ origin: { x: 0, y: 0 }, target: { x: 10, y: 0 }, point: { x: -1, y: 0 }, length: 10, angleDegrees: 90 })).toBe(false);
    expect(isPointInCombatLine({ origin: { x: 0, y: 0 }, target: { x: 10, y: 0 }, point: { x: 8, y: 2 }, length: 10, width: 4 })).toBe(true);
    expect(isPointInCombatLine({ origin: { x: 0, y: 0 }, target: { x: 10, y: 0 }, point: { x: 8, y: 3 }, length: 10, width: 4 })).toBe(false);
  });

  it('uses explicit spell metadata and leaves unknown geometry unresolved', () => {
    expect(getCombatSpellTargetShapeMetadata('spell.fireball')).toEqual({ shape: 'circle', radiusFt: 20 });
    expect(getCombatSpellTargetShapeMetadata('spell.lightning_bolt')).toEqual({ shape: 'line', lengthFt: 100, widthFt: 5 });
    expect(getCombatSpellTargetShapeMetadata('spell.unknown')).toBeNull();
  });
});
