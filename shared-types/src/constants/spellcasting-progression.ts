export type SpellcastingProgressionEntry = {
  classLevel: number;
  cantripsKnown: number | null;
  spellsKnown: number | null;
};

const repeat = (
  cantripsKnown: number | null,
  spellsKnown: number | null,
  fromLevel: number,
  toLevel: number,
): SpellcastingProgressionEntry[] =>
  Array.from({ length: toLevel - fromLevel + 1 }, (_, index) => ({
    classLevel: fromLevel + index,
    cantripsKnown,
    spellsKnown,
  }));

const fromCounts = (
  cantripsKnown: readonly (number | null)[],
  spellsKnown: readonly (number | null)[],
  startLevel = 1,
): SpellcastingProgressionEntry[] =>
  cantripsKnown.map((cantripCount, index) => ({
    classLevel: startLevel + index,
    cantripsKnown: cantripCount,
    spellsKnown: spellsKnown[index] ?? null,
  }));

export const SPELLCASTING_PROGRESSION: Readonly<
  Record<string, readonly SpellcastingProgressionEntry[]>
> = {
  bard: fromCounts(
    [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  ),
  cleric: [
    ...repeat(3, null, 1, 3),
    ...repeat(4, null, 4, 9),
    ...repeat(5, null, 10, 20),
  ],
  druid: [
    ...repeat(2, null, 1, 3),
    ...repeat(3, null, 4, 9),
    ...repeat(4, null, 10, 20),
  ],
  paladin: repeat(null, null, 2, 20),
  ranger: fromCounts(
    Array.from({ length: 19 }, () => null),
    [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
    2,
  ),
  sorcerer: fromCounts(
    [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  ),
  warlock: fromCounts(
    [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  ),
  wizard: [
    ...repeat(3, null, 1, 3),
    ...repeat(4, null, 4, 9),
    ...repeat(5, null, 10, 20),
  ],
};

export function normalizeSpellcastingClassKey(className: string): string {
  return className.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getSpellcastingProgression(
  className: string,
  level: number,
): SpellcastingProgressionEntry | null {
  const classKey = normalizeSpellcastingClassKey(className);
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  const entries = SPELLCASTING_PROGRESSION[classKey] ?? [];
  return entries.find((entry) => entry.classLevel === normalizedLevel) ?? null;
}

export function getCantripsKnownLimit(className: string, level: number): number | null {
  return getSpellcastingProgression(className, level)?.cantripsKnown ?? null;
}

export function getKnownSpellsLimit(className: string, level: number): number | null {
  return getSpellcastingProgression(className, level)?.spellsKnown ?? null;
}
