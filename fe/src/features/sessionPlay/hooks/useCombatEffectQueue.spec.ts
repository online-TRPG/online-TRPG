import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CombatPresentationEnvelope } from '../presentation/combatEffectTypes';
import { useCombatEffectQueue } from './useCombatEffectQueue';

function event(turnLogId: string, createdAt: string): CombatPresentationEnvelope {
  return {
    turnLogId,
    createdAt,
    narration: `${turnLogId} 결과`,
    presentation: {
      schemaVersion: 1,
      sourceParticipantId: 'actor-1',
      delivery: 'melee',
      presetId: 'melee.slashing',
      impacts: [],
    },
  };
}

describe('useCombatEffectQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.spyOn(performance, 'now').mockReturnValue(100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('orders live TurnLogs and enqueues each id only once', () => {
    const first = event('turn-1', '2026-08-08T00:00:01.000Z');
    const second = event('turn-2', '2026-08-08T00:00:02.000Z');
    const { result, rerender } = renderHook(
      ({ events }) => useCombatEffectQueue(events),
      { initialProps: { events: [] as CombatPresentationEnvelope[] } },
    );

    rerender({ events: [second, first] });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.activeEffects.map((effect) => effect.id)).toEqual([
      'turn-1',
      'turn-2',
    ]);

    rerender({ events: [first, second, first] });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.activeEffects.map((effect) => effect.id)).toEqual([
      'turn-1',
      'turn-2',
    ]);
  });

  it('keeps accessibility announcements while motion is off', () => {
    const { result, rerender } = renderHook(
      ({ events }) => useCombatEffectQueue(events),
      { initialProps: { events: [] as CombatPresentationEnvelope[] } },
    );
    act(() => result.current.setMotionPreference('off'));
    rerender({ events: [event('turn-off', '2026-08-08T00:00:03.000Z')] });
    act(() => vi.advanceTimersByTime(200));

    expect(result.current.activeEffects).toEqual([]);
    expect(result.current.announcement).toBe('turn-off 결과');
  });
});
