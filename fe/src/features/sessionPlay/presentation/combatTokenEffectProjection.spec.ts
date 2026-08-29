import { describe, expect, it } from 'vitest';
import type { CombatEffectPlayback } from './combatEffectTypes';
import { projectCombatTokenVisualEffects } from './combatTokenEffectProjection';

function buildEffect(overrides: Partial<CombatEffectPlayback> = {}): CombatEffectPlayback {
  return {
    id: 'turn-1',
    startedAt: 100,
    durationMs: 1_000,
    collapsedCount: 0,
    envelope: {
      turnLogId: 'turn-1',
      createdAt: '2026-08-11T00:00:00.000Z',
      narration: '공격 결과',
      presentation: {
        schemaVersion: 1,
        sourceParticipantId: 'attacker',
        delivery: 'melee',
        presetId: 'melee.slashing',
        impacts: [{
          targetParticipantId: 'target',
          outcome: 'critical',
          damagePackets: [{
            damageType: 'slashing',
            rolledAmount: 12,
            appliedAmount: 12,
            modifiers: [],
          }],
          healingPackets: [],
          conditionChanges: [],
        }],
      },
    },
    ...overrides,
  };
}

describe('projectCombatTokenVisualEffects', () => {
  it('projects source emphasis and critical target response without map mutation', () => {
    const result = projectCombatTokenVisualEffects({
      effects: [buildEffect()],
      participantTokenIdById: { attacker: 'token-a', target: 'token-b' },
      visibleTokenIds: new Set(['token-a', 'token-b']),
    });

    expect(result['token-a']).toMatchObject({ response: 'source', damageType: 'slashing' });
    expect(result['token-b']).toMatchObject({ response: 'critical', damageType: 'slashing' });
  });

  it('does not project hidden token effects', () => {
    const result = projectCombatTokenVisualEffects({
      effects: [buildEffect()],
      participantTokenIdById: { attacker: 'token-a', target: 'token-hidden' },
      visibleTokenIds: new Set(['token-a']),
    });

    expect(result['token-hidden']).toBeUndefined();
  });

  it('suppresses recoil for immune damage', () => {
    const effect = buildEffect();
    const impact = effect.envelope?.presentation.impacts[0];
    if (!impact) throw new Error('impact missing');
    impact.outcome = 'hit';
    impact.damagePackets[0].modifiers = ['immune'];

    const result = projectCombatTokenVisualEffects({
      effects: [effect],
      participantTokenIdById: { attacker: 'token-a', target: 'token-b' },
      visibleTokenIds: new Set(['token-a', 'token-b']),
    });

    expect(result['token-b']?.response).toBe('none');
  });
});
