import {
  getCantripsKnownLimit,
  getKnownSpellsLimit,
  getSrdClassDefinition,
  resolvePreparedSpellLimit,
} from "@trpg/srd-data/rules";

describe("SRD spellcasting progression", () => {
  it("keeps a complete level progression for each P0 spellcasting class", () => {
    expect(getSrdClassDefinition("bard")?.spellcastingProgression).toHaveLength(20);
    expect(getSrdClassDefinition("cleric")?.spellcastingProgression).toHaveLength(20);
    expect(getSrdClassDefinition("druid")?.spellcastingProgression).toHaveLength(20);
    expect(getSrdClassDefinition("paladin")?.spellcastingProgression).toHaveLength(19);
    expect(getSrdClassDefinition("ranger")?.spellcastingProgression).toHaveLength(19);
    expect(getSrdClassDefinition("sorcerer")?.spellcastingProgression).toHaveLength(20);
    expect(getSrdClassDefinition("warlock")?.spellcastingProgression).toHaveLength(20);
    expect(getSrdClassDefinition("wizard")?.spellcastingProgression).toHaveLength(20);
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

  it("only exposes prepared spell limits once a prepared caster has spell slots", () => {
    const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    expect(resolvePreparedSpellLimit({ classKey: "paladin", level: 1, abilities })).toBeNull();
    expect(resolvePreparedSpellLimit({ classKey: "paladin", level: 2, abilities })).toBe(1);
    expect(resolvePreparedSpellLimit({ classKey: "cleric", level: 1, abilities })).toBe(1);
  });

  it("exposes P4 9 through 12 known-spell and cantrip progression", () => {
    expect(getCantripsKnownLimit("bard", 10)).toBe(4);
    expect(getCantripsKnownLimit("sorcerer", 10)).toBe(6);
    expect(getKnownSpellsLimit("bard", 12)).toBe(15);
    expect(getKnownSpellsLimit("sorcerer", 11)).toBe(12);
    expect(getKnownSpellsLimit("warlock", 11)).toBe(11);
  });

  it("exposes P5 13 through 16 high-level spellcasting progression", () => {
    expect(getKnownSpellsLimit("bard", 13)).toBe(16);
    expect(getKnownSpellsLimit("bard", 14)).toBe(18);
    expect(getKnownSpellsLimit("sorcerer", 15)).toBe(14);
    expect(getKnownSpellsLimit("warlock", 15)).toBe(13);
    expect(getCantripsKnownLimit("wizard", 16)).toBe(5);
    expect(getKnownSpellsLimit("paladin", 16)).toBeNull();
    expect(getKnownSpellsLimit("ranger", 16)).toBe(9);
  });
});
