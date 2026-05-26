import { Injectable } from "@nestjs/common";

const FULL_CASTER_CLASSES = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTER_CLASSES = new Set(["paladin", "ranger"]);
const PACT_CASTER_CLASSES = new Set(["warlock"]);

const FULL_CASTER_SPELL_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

const PACT_MAGIC_SPELL_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 1 },
  2: { 1: 2 },
  3: { 2: 2 },
  4: { 2: 2 },
  5: { 3: 2 },
  6: { 3: 2 },
  7: { 4: 2 },
  8: { 4: 2 },
  9: { 5: 2 },
  10: { 5: 2 },
  11: { 5: 3 },
  12: { 5: 3 },
  13: { 5: 3 },
  14: { 5: 3 },
  15: { 5: 3 },
  16: { 5: 3 },
  17: { 5: 4 },
  18: { 5: 4 },
  19: { 5: 4 },
  20: { 5: 4 },
};

@Injectable()
export class SpellSlotService {
  resolveMaximumForCharacter(
    character: { className: string; level: number } | null,
    slotLevel: number,
  ): number {
    if (!character || character.level < 1 || slotLevel < 1) {
      return 0;
    }

    const className = this.normalizeClassName(character.className);
    if (FULL_CASTER_CLASSES.has(className)) {
      return FULL_CASTER_SPELL_SLOTS[Math.min(character.level, 20)]?.[slotLevel] ?? 0;
    }
    if (HALF_CASTER_CLASSES.has(className)) {
      const effectiveLevel = Math.floor(character.level / 2);
      return effectiveLevel > 0
        ? FULL_CASTER_SPELL_SLOTS[Math.min(effectiveLevel, 20)]?.[slotLevel] ?? 0
        : 0;
    }
    if (PACT_CASTER_CLASSES.has(className)) {
      return PACT_MAGIC_SPELL_SLOTS[Math.min(character.level, 20)]?.[slotLevel] ?? 0;
    }
    return 0;
  }

  private normalizeClassName(className: string): string {
    return className.trim().toLowerCase().replace(/[\s_]+/g, "-");
  }
}
