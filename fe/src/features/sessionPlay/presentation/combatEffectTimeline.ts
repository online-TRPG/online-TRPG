export type CombatEffectPhase = 'anticipation' | 'travel' | 'impact' | 'aftermath';

export function getCombatEffectPhase(progress: number): CombatEffectPhase {
  const value = Math.min(1, Math.max(0, progress));
  if (value < 0.14) return 'anticipation';
  if (value < 0.48) return 'travel';
  if (value < 0.78) return 'impact';
  return 'aftermath';
}

export function getPhaseProgress(
  progress: number,
  start: number,
  end: number,
) {
  if (end <= start) return progress >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

export function createCombatEffectSeed(value: string) {
  let seed = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

export function seededCombatValue(seed: number, index: number) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}
