import {
  getCantripsKnownLimit,
  getKnownSpellsLimit,
  SPELLCASTING_PROGRESSION,
} from "@trpg/shared-types";

describe("SRD spellcasting progression", () => {
  it("keeps a complete level progression for each P0 spellcasting class", () => {
    expect(SPELLCASTING_PROGRESSION.bard).toHaveLength(20);
    expect(SPELLCASTING_PROGRESSION.cleric).toHaveLength(20);
    expect(SPELLCASTING_PROGRESSION.druid).toHaveLength(20);
    expect(SPELLCASTING_PROGRESSION.paladin).toHaveLength(19);
    expect(SPELLCASTING_PROGRESSION.ranger).toHaveLength(19);
    expect(SPELLCASTING_PROGRESSION.sorcerer).toHaveLength(20);
    expect(SPELLCASTING_PROGRESSION.warlock).toHaveLength(20);
    expect(SPELLCASTING_PROGRESSION.wizard).toHaveLength(20);
  });

  it("exposes representative SRD cantrip and known-spell increases", () => {
    expect(getCantripsKnownLimit("wizard", 3)).toBe(3);
    expect(getCantripsKnownLimit("wizard", 4)).toBe(4);
    expect(getKnownSpellsLimit("bard", 1)).toBe(4);
    expect(getKnownSpellsLimit("bard", 2)).toBe(5);
    expect(getKnownSpellsLimit("warlock", 9)).toBe(10);
    expect(getKnownSpellsLimit("warlock", 10)).toBe(10);
    expect(getKnownSpellsLimit("cleric", 5)).toBeNull();
  });
});
