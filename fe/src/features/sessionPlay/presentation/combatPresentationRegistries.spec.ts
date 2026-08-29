import { describe, expect, it } from 'vitest';
import { COMBAT_DAMAGE_TYPES, SRD_COMBAT_CONDITION_IDS } from '@trpg/shared-types/frontend';
import { COMBAT_DAMAGE_PRESENTATION } from './combatDamagePresentation';
import { COMBAT_CONDITION_PRESENTATION } from './combatConditionPresentation';

describe('combat presentation registries', () => {
  it('assigns every canonical damage type a unique local icon and color', () => {
    const entries = COMBAT_DAMAGE_TYPES.map((damageType) =>
      COMBAT_DAMAGE_PRESENTATION[damageType],
    );

    expect(entries).toHaveLength(13);
    expect(new Set(entries.map((entry) => entry.color)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.iconUrl)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.motif)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.iconUrl.startsWith('/assets/combat-icons/'))).toBe(true);
  });

  it('assigns every SRD condition a unique local icon', () => {
    const entries = SRD_COMBAT_CONDITION_IDS.map((conditionId) =>
      COMBAT_CONDITION_PRESENTATION[conditionId],
    );

    expect(entries).toHaveLength(15);
    expect(entries.every(Boolean)).toBe(true);
    expect(new Set(entries.map((entry) => entry.iconUrl)).size).toBe(entries.length);
  });
});
