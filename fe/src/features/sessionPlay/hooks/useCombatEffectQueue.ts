import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CombatEffectPlayback,
  CombatMotionPreference,
  CombatPresentationEnvelope,
} from '../presentation/combatEffectTypes';

const STORAGE_KEY = 'trpg.combatEffects.motion';
const MAX_SEEN_IDS = 400;
const MAX_PENDING_EFFECTS = 40;
const MAX_CONCURRENT_EFFECTS = 8;

function readInitialMotionPreference(): CombatMotionPreference {
  if (typeof window === 'undefined') return 'full';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'full' || stored === 'reduced' || stored === 'off') {
    return stored;
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'reduced'
    : 'full';
}

function getDuration(preference: CombatMotionPreference) {
  if (preference === 'reduced') return 480;
  if (preference === 'off') return 0;
  return 1_050;
}

export function useCombatEffectQueue(events: CombatPresentationEnvelope[]) {
  const [motionPreference, setMotionPreferenceState] =
    useState<CombatMotionPreference>(readInitialMotionPreference);
  const [activeEffects, setActiveEffects] = useState<CombatEffectPlayback[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const seenIdsRef = useRef(new Map<string, true>());
  const pendingRef = useRef<CombatPresentationEnvelope[]>([]);
  const collapsedCountRef = useRef(0);

  const setMotionPreference = useCallback((value: CombatMotionPreference) => {
    setMotionPreferenceState(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  }, []);

  useEffect(() => {
    const unseen = events.filter((event) => !seenIdsRef.current.has(event.turnLogId));
    if (!unseen.length) return;

    for (const event of unseen) {
      seenIdsRef.current.set(event.turnLogId, true);
    }
    while (seenIdsRef.current.size > MAX_SEEN_IDS) {
      const oldest = seenIdsRef.current.keys().next().value as string | undefined;
      if (!oldest) break;
      seenIdsRef.current.delete(oldest);
    }

    const ordered = unseen.sort((left, right) => {
      const dateOrder = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return dateOrder || left.turnLogId.localeCompare(right.turnLogId);
    });
    setAnnouncement(ordered.at(-1)?.narration ?? '전투 결과가 적용되었습니다.');
    if (motionPreference === 'off') return;

    pendingRef.current.push(...ordered);
    if (pendingRef.current.length > MAX_PENDING_EFFECTS) {
      const overflow = pendingRef.current.length - MAX_PENDING_EFFECTS;
      pendingRef.current.splice(0, overflow);
      collapsedCountRef.current += overflow;
    }
  }, [events, motionPreference]);

  useEffect(() => {
    if (motionPreference === 'off') {
      pendingRef.current = [];
      collapsedCountRef.current = 0;
      setActiveEffects([]);
      return;
    }

    const timer = window.setInterval(() => {
      const now = performance.now();
      setActiveEffects((current) => {
        const next = current.filter(
          (effect) => now - effect.startedAt < effect.durationMs,
        );
        while (
          next.length < MAX_CONCURRENT_EFFECTS &&
          pendingRef.current.length > 0
        ) {
          const envelope = pendingRef.current.shift() ?? null;
          if (!envelope) break;
          next.push({
            id: envelope.turnLogId,
            envelope,
            startedAt: now,
            durationMs: getDuration(motionPreference),
            collapsedCount: 0,
          });
        }
        if (
          next.length < MAX_CONCURRENT_EFFECTS &&
          pendingRef.current.length === 0 &&
          collapsedCountRef.current > 0
        ) {
          const collapsedCount = collapsedCountRef.current;
          collapsedCountRef.current = 0;
          next.push({
            id: `collapsed:${now}:${collapsedCount}`,
            envelope: null,
            startedAt: now,
            durationMs: getDuration(motionPreference),
            collapsedCount,
          });
        }
        return next;
      });
    }, motionPreference === 'reduced' ? 120 : 80);
    return () => window.clearInterval(timer);
  }, [motionPreference]);

  return useMemo(
    () => ({
      activeEffects,
      announcement,
      motionPreference,
      setMotionPreference,
    }),
    [activeEffects, announcement, motionPreference, setMotionPreference],
  );
}
