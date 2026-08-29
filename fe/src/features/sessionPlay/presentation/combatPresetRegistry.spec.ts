import { describe, expect, it } from 'vitest';
import { resolveCombatPreset } from './combatPresetRegistry';
import {
  createCombatEffectSeed,
  getCombatEffectPhase,
  seededCombatValue,
} from './combatEffectTimeline';

describe('combat preset registry', () => {
  it('resolves exact signature presets before generic delivery presets', () => {
    expect(resolveCombatPreset({
      presetId: 'spell.fireball',
      delivery: 'burst',
      damageType: 'fire',
    })).toEqual({ kind: 'signature', id: 'spell.fireball' });
  });

  it('keeps family variants distinct from exact signature playback', () => {
    expect(resolveCombatPreset({
      presetId: 'spell.fireball.upcast',
      delivery: 'burst',
      damageType: 'fire',
    })).toEqual({ kind: 'family', id: 'spell.fireball' });
  });

  it('falls back safely by delivery and damage or healing kind', () => {
    expect(resolveCombatPreset({
      presetId: 'spell.future',
      delivery: 'beam',
      damageType: 'cold',
    })).toEqual({ kind: 'generic', id: 'beam.cold' });
    expect(resolveCombatPreset({
      presetId: 'spell.future_heal',
      delivery: 'aura',
      hasHealing: true,
    })).toEqual({ kind: 'generic', id: 'aura.healing' });
  });

  it('produces stable phases and seeded values', () => {
    const seed = createCombatEffectSeed('turn-1:0');
    expect(seed).toBe(createCombatEffectSeed('turn-1:0'));
    expect(seededCombatValue(seed, 2)).toBe(seededCombatValue(seed, 2));
    expect(getCombatEffectPhase(0.1)).toBe('anticipation');
    expect(getCombatEffectPhase(0.5)).toBe('impact');
    expect(getCombatEffectPhase(0.9)).toBe('aftermath');
  });
});
