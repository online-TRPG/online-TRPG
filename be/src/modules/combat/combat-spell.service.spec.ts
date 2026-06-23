import { CombatSpellService } from "./combat-spell.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import { SpellScalingService } from "../rules/spell-scaling.service";
import { SpellSlotService } from "../rules/spell-slot.service";

describe("CombatSpellService", () => {
  const service = new CombatSpellService(
    null as never,
    null as never,
    new RuleCatalogService(),
    new SpellScalingService(),
    new SpellSlotService(),
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

  it("resolves P4 spell scaling from catalog definitions for combat execution", () => {
    const coneOfCold = service.resolveCombatSpellDefinition("spell.cone_of_cold");
    expect(service.resolveCombatSpellScalingFromCatalog(coneOfCold, 6)).toMatchObject({
      spellId: "spell.cone_of_cold",
      baseSpellLevel: 5,
      slotLevel: 6,
      damageDice: "9d8",
      appliedScaling: [{ mode: "damage_dice", steps: 1, value: "9d8" }],
    });

    const holdMonster = service.resolveCombatSpellDefinition("spell.hold_monster");
    expect(service.resolveCombatSpellScalingFromCatalog(holdMonster, 6)).toMatchObject({
      spellId: "spell.hold_monster",
      baseSpellLevel: 5,
      slotLevel: 6,
      targetCount: 2,
      appliedScaling: [{ mode: "target_count", steps: 1, value: 2 }],
    });

    const heal = service.resolveCombatSpellDefinition("spell.heal");
    expect(service.resolveCombatSpellScalingFromCatalog(heal, 8)).toMatchObject({
      spellId: "spell.heal",
      baseSpellLevel: 6,
      slotLevel: 8,
      damageDice: "90",
      appliedScaling: [{ mode: "flat_bonus", steps: 2, value: "90" }],
    });
  });
});
