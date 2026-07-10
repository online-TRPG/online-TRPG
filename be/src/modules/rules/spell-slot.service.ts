import { Injectable } from "@nestjs/common";
import { resolveSpellSlotLimit } from "@trpg/srd-data/rules";
import { isRecord } from "@trpg/shared-types";

export const SPELL_SLOTS_BY_SESSION_CHARACTER_ID_FLAG = "spellSlotsBySessionCharacterId";

@Injectable()
export class SpellSlotService {
  readSpellSlotsFromFlags(flags: unknown): Record<string, Record<string, number>> {
    if (!isRecord(flags)) {
      return {};
    }
    return this.readSpellSlotsBySessionCharacterId(flags[SPELL_SLOTS_BY_SESSION_CHARACTER_ID_FLAG]);
  }

  readSpellSlotsBySessionCharacterId(value: unknown): Record<string, Record<string, number>> {
    if (!isRecord(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).flatMap(([sessionCharacterId, slotValue]) => {
        const slots = this.readSpellSlotRecord(slotValue);
        return Object.keys(slots).length > 0 ? [[sessionCharacterId, slots]] : [];
      }),
    );
  }

  resolveMaximumForCharacter(
    character: { className: string; level: number } | null,
    slotLevel: number,
  ): number {
    if (!character || character.level < 1 || slotLevel < 1) {
      return 0;
    }
    return resolveSpellSlotLimit(character.className, character.level, slotLevel);
  }

  private readSpellSlotRecord(value: unknown): Record<string, number> {
    if (!isRecord(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).flatMap(([slotLevel, remaining]) =>
        /^[1-9]$/.test(slotLevel) && typeof remaining === "number" && Number.isInteger(remaining) && remaining >= 0
          ? [[slotLevel, remaining] as const]
          : [],
      ),
    );
  }
}
