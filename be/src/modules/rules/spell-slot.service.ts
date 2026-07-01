import { Injectable } from "@nestjs/common";
import { resolveSpellSlotLimit } from "@trpg/srd-data/rules";

@Injectable()
export class SpellSlotService {
  resolveMaximumForCharacter(
    character: { className: string; level: number } | null,
    slotLevel: number,
  ): number {
    if (!character || character.level < 1 || slotLevel < 1) {
      return 0;
    }
    return resolveSpellSlotLimit(character.className, character.level, slotLevel);
  }
}
