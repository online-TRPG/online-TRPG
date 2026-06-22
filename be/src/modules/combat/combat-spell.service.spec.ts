import { CombatSpellService } from "./combat-spell.service";

describe("CombatSpellService", () => {
  const service = new CombatSpellService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  it("uses the class spellcasting ability for attack bonuses and save DCs", () => {
    const cleric = {
      character: {
        abilitiesJson: JSON.stringify({ int: 8, wis: 18 }),
        className: "cleric",
        level: 1,
        proficiencyBonus: 2,
      },
    };
    const sorcerer = {
      character: {
        abilitiesJson: JSON.stringify({ int: 10, cha: 16 }),
        className: "sorcerer",
        level: 1,
        proficiencyBonus: 2,
      },
    };

    expect(service.resolveSpellAttackBonusForCharacter(cleric)).toBe(6);
    expect(service.resolveCombatSpellSaveDcForCharacter(cleric)).toBe(14);
    expect(service.resolveSpellAttackBonusForCharacter(sorcerer)).toBe(5);
    expect(service.resolveCombatSpellSaveDcForCharacter(sorcerer)).toBe(13);
  });
});
