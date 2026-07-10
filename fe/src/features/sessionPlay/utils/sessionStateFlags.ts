import type { VttMapStateDto } from '@trpg/shared-types';
import { decodeVttMapState } from '@trpg/shared-types/frontend';

export type SessionStateFlags = Record<string, unknown> | null | undefined;

export function readVttMapFromSessionFlags(flags: SessionStateFlags): VttMapStateDto | null {
  if (!flags) return null;
  try {
    return decodeVttMapState(flags.vttMap);
  } catch {
    return null;
  }
}

export function readCompletedCombatNodeIdsFromSessionFlags(flags: SessionStateFlags): Set<string> {
  const value = flags?.completedCombatNodeIds;
  return new Set(decodeCompletedCombatNodeIds(value));
}

function decodeCompletedCombatNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
}
