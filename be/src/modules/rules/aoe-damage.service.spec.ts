import {
  DiceAdvantageState,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import { AoeDamageService } from "./aoe-damage.service";
import { DiceService } from "./dice.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleEngineService } from "./rule-engine.service";
import { RULE_HOOK_IDS } from "./rule-engine.types";

const dice = (
  expression: string,
  rolls: number[],
  modifier = 0,
  advantageState = DiceAdvantageState.NORMAL,
): DiceRollResponseDto => ({
  expression,
  rolls,
  modifier,
  total: rolls.reduce((sum, roll) => sum + roll, 0) + modifier,
  advantageState,
});

describe("AoeDamageService", () => {
  const createService = (rolls: DiceRollResponseDto[]): AoeDamageService => {
    const diceService = {
      roll: jest.fn(() => {
        const result = rolls.shift();
        if (!result) {
          throw new Error("No mocked dice result remained.");
        }
        return result;
      }),
    } as unknown as DiceService;

    return new AoeDamageService(diceService, new RuleEngineService());
  };

  it("resolves one damage roll with individual saves and damage modifiers", () => {
    const service = createService([
      dice("8d6", [6, 5, 4, 4, 3, 3, 2, 1]),
      dice("1d20", [15]),
      dice("1d20", [8]),
    ]);

    const result = service.resolveDamage({
      sourceId: "spell.fireball",
      damageDice: "8d6",
      damageType: "fire",
      save: { ability: "dex", dc: 14 },
      targets: [
        {
          id: "rogue",
          currentHp: 30,
          abilityModifiers: { dex: 3 },
          proficiencyBonus: 2,
          proficientSaves: ["dex"],
          resistances: ["fire"],
        },
        {
          id: "zombie",
          currentHp: 22,
          abilityModifiers: { dex: -2 },
          vulnerabilities: ["fire"],
        },
      ],
    });

    expect(result.damageRoll.total).toBe(28);
    expect(result.targetResults).toEqual([
      expect.objectContaining({
        targetId: "rogue",
        baseDamage: 14,
        finalDamage: 7,
        currentHp: 30,
        nextHp: 23,
        markDead: false,
        savingThrow: expect.objectContaining({
          success: true,
          savingThrowTotal: 20,
        }),
      }),
      expect.objectContaining({
        targetId: "zombie",
        baseDamage: 28,
        finalDamage: 56,
        currentHp: 22,
        nextHp: 0,
        markDead: true,
        savingThrow: expect.objectContaining({
          success: false,
          savingThrowTotal: 6,
        }),
      }),
    ]);
    expect(result.targetResults[0].ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.RESOLVE_SAVING_THROW,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "rogue", currentHp: 23, markDead: false },
      { sessionCharacterId: "zombie", currentHp: 0, markDead: true },
    ]);
  });

  it("supports save effects that do no damage on success", () => {
    const service = createService([
      dice("2d6", [5, 4]),
      dice("1d20", [18]),
    ]);

    const result = service.resolveDamage({
      sourceId: "trap.falling_rocks",
      damageDice: "2d6",
      damageType: "bludgeoning",
      save: { ability: "dex", dc: 12, halfDamageOnSuccess: false },
      targets: [
        {
          id: "target",
          currentHp: 10,
          abilityModifiers: { dex: 1 },
        },
      ],
    });

    expect(result.targetResults[0]).toMatchObject({
      targetId: "target",
      baseDamage: 0,
      finalDamage: 0,
      nextHp: 10,
      savingThrow: { success: true },
    });
  });

  it("applies Evasion to Dexterity saves that normally deal half damage", () => {
    const service = createService([
      dice("8d6", [6, 5, 4, 4, 3, 3, 2, 1]),
      dice("1d20", [15]),
      dice("1d20", [5]),
    ]);
    const evasionTags = [
      "save:dex:success_no_damage",
      "save:dex:failure_half_damage",
    ];

    const result = service.resolveDamage({
      sourceId: "spell.fireball",
      damageDice: "8d6",
      damageType: "fire",
      save: { ability: "dex", dc: 14, halfDamageOnSuccess: true },
      targets: [
        {
          id: "successful-rogue",
          currentHp: 30,
          abilityModifiers: { dex: 3 },
          runtimeTags: evasionTags,
        },
        {
          id: "failed-monk",
          currentHp: 30,
          abilityModifiers: { dex: 3 },
          runtimeTags: evasionTags,
        },
      ],
    });

    expect(result.targetResults).toEqual([
      expect.objectContaining({
        targetId: "successful-rogue",
        finalDamage: 0,
        nextHp: 30,
        savingThrow: expect.objectContaining({ success: true }),
      }),
      expect.objectContaining({
        targetId: "failed-monk",
        finalDamage: 14,
        nextHp: 16,
        savingThrow: expect.objectContaining({ success: false }),
      }),
    ]);
  });

  it("preserves rolled condition modifiers used by saving throws", () => {
    const blessRoll = dice("1d4", [3]);
    const service = createService([
      dice("1d8", [6]),
      dice("1d20", [9]),
    ]);

    const result = service.resolveDamage({
      sourceId: "spell.sacred_flame",
      damageDice: "1d8",
      damageType: "radiant",
      save: { ability: "dex", dc: 13, halfDamageOnSuccess: false },
      targets: [
        {
          id: "blessed-target",
          currentHp: 10,
          abilityModifiers: { dex: 1 },
          bonusModifiers: [{ source: "spell.bless", value: 3 }],
          modifierRolls: [blessRoll],
        },
      ],
    });

    expect(result.targetResults[0]).toMatchObject({
      modifierRolls: [blessRoll],
      savingThrow: {
        success: true,
        savingThrowTotal: 13,
      },
      finalDamage: 0,
    });
  });

  it("creates AoE damage input from a catalog area spell", () => {
    const service = createService([]);
    const catalog = new RuleCatalogService();
    const fireball = catalog.getEntry("spell.fireball");

    if (!fireball) {
      throw new Error("fireball catalog entry is required for this spec.");
    }

    expect(
      service.createInputFromSpell({
        spellDefinition: fireball,
        saveDc: 15,
        damageDice: "9d6",
        targets: [
          {
            id: "target",
            currentHp: 20,
            abilityModifiers: { dex: 2 },
          },
        ],
      }),
    ).toEqual({
      sourceId: "spell.fireball",
      damageDice: "9d6",
      damageType: "fire",
      save: {
        ability: "dex",
        dc: 15,
      },
      targets: [
        {
          id: "target",
          currentHp: 20,
          abilityModifiers: { dex: 2 },
        },
      ],
    });
  });
});
