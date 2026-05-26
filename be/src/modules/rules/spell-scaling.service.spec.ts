import { SpellScalingService } from "./spell-scaling.service";

describe("SpellScalingService", () => {
  const service = new SpellScalingService();

  it("adds damage dice for each slot level above the base spell level", () => {
    expect(
      service.resolveUpcast({
        spellId: "burning hands",
        baseSpellLevel: 1,
        slotLevel: 3,
        baseDamageDice: "3d6",
        scalingRules: [{ mode: "damage_dice", dice: "1d6" }],
      }),
    ).toMatchObject({
      spellId: "spell.burning_hands",
      baseSpellLevel: 1,
      slotLevel: 3,
      slotLevelsAboveBase: 2,
      damageDice: "5d6",
      appliedScaling: [{ mode: "damage_dice", steps: 2, value: "5d6" }],
    });
  });

  it("scales target count at custom slot intervals", () => {
    expect(
      service.resolveUpcast({
        spellId: "spell.magic_missile",
        baseSpellLevel: 1,
        slotLevel: 5,
        baseTargetCount: 3,
        scalingRules: [{ mode: "target_count", count: 1, perSlotAbove: 2 }],
      }),
    ).toMatchObject({
      targetCount: 5,
      appliedScaling: [{ mode: "target_count", steps: 2, value: 5 }],
    });
  });

  it("scales healing dice, duration, and summon count together", () => {
    expect(
      service.resolveUpcast({
        spellId: "conjure ally",
        baseSpellLevel: 2,
        slotLevel: 4,
        baseHealingDice: "2d8",
        baseDuration: { unit: "minute", amount: 10 },
        baseSummonCount: 1,
        scalingRules: [
          { mode: "healing_dice", dice: "1d8" },
          { mode: "duration", unit: "minute", amountPerSlotAbove: 5 },
          { mode: "summon_count", count: 1 },
        ],
      }),
    ).toMatchObject({
      spellId: "spell.conjure_ally",
      healingDice: "4d8",
      duration: { unit: "minute", amount: 20 },
      summonCount: 3,
      appliedScaling: [
        { mode: "healing_dice", steps: 2, value: "4d8" },
        { mode: "duration", steps: 2, value: { unit: "minute", amount: 20 } },
        { mode: "summon_count", steps: 2, value: 3 },
      ],
    });
  });

  it("does not apply scaling when the slot level equals the base level", () => {
    expect(
      service.resolveUpcast({
        spellId: "sleep",
        baseSpellLevel: 1,
        slotLevel: 1,
        baseDamageDice: "5d8",
        scalingRules: [{ mode: "damage_dice", dice: "2d8" }],
      }),
    ).toMatchObject({
      damageDice: "5d8",
      appliedScaling: [],
    });
  });

  it("rejects slots below the base spell level", () => {
    expect(() =>
      service.resolveUpcast({
        spellId: "fireball",
        baseSpellLevel: 3,
        slotLevel: 2,
      }),
    ).toThrow("slotLevel must be greater than or equal to baseSpellLevel.");
  });
});
