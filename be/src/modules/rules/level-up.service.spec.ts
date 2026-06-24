import { LevelUpService } from "./level-up.service";
import { RuleCatalogService } from "./rule-catalog.service";

describe("LevelUpService", () => {
  const service = new LevelUpService();
  const catalog = new RuleCatalogService();

  it("resolves canonical character level stats from hit die and constitution", () => {
    expect(
      service.resolveCharacterLevelStats({
        level: 5,
        hitDie: "d8",
        constitutionScore: 14,
      }),
    ).toEqual({
      level: 5,
      proficiencyBonus: 3,
      maxHp: 38,
      hitDie: "d8",
      constitutionModifier: 2,
    });
  });

  it("resolves proficiency, average HP, and new fighter features", () => {
    const result = service.resolveLevelUp({
      classKey: "fighter",
      currentLevel: 1,
      targetLevel: 3,
      hitDie: "d10",
      constitutionScore: 14,
      subclassChoiceLevel: catalog.getSubclassChoiceLevel("fighter"),
      classFeatures: catalog.listClassFeaturesForLevel("fighter", 3),
      subclassFeatures: catalog.listSubclassFeatures("fighter", "champion", 3),
    });

    expect(result).toMatchObject({
      classKey: "fighter",
      fromLevel: 1,
      toLevel: 3,
      proficiencyBonusBefore: 2,
      proficiencyBonusAfter: 2,
      constitutionModifier: 2,
      maxHpBefore: 12,
      maxHpAfter: 28,
      hpGains: [
        { level: 2, baseGain: 6, constitutionModifier: 2, totalGain: 8 },
        { level: 3, baseGain: 6, constitutionModifier: 2, totalGain: 8 },
      ],
      subclassChoiceRequiredAtLevels: [3],
      asiOrFeatChoiceRequiredAtLevels: [],
    });
    expect(result.grantedFeatures.map((feature) => feature.featureId)).toEqual([
      "class.fighter.feature.action_surge",
      "class.fighter.feature.martial_archetype",
      "subclass.fighter.champion.feature.improved_critical",
    ]);
  });

  it("uses explicit rolled HP when requested", () => {
    expect(
      service.resolveLevelUp({
        classKey: "wizard",
        currentLevel: 1,
        targetLevel: 2,
        hitDie: "d6",
        constitutionScore: 12,
        subclassChoiceLevel: catalog.getSubclassChoiceLevel("wizard"),
        hpMode: "rolled",
        rolledHpByLevel: { 2: 5 },
      }),
    ).toMatchObject({
      hpMode: "rolled",
      maxHpBefore: 7,
      maxHpAfter: 13,
      hpGains: [{ level: 2, baseGain: 5, constitutionModifier: 1, totalGain: 6 }],
      subclassChoiceRequiredAtLevels: [2],
    });
  });

  it("reports ASI or feat choice levels crossed during level up", () => {
    expect(
      service.resolveLevelUp({
        classKey: "rogue",
        currentLevel: 3,
        targetLevel: 8,
        hitDie: "d8",
        constitutionScore: 10,
      }),
    ).toMatchObject({
      proficiencyBonusBefore: 2,
      proficiencyBonusAfter: 3,
      asiOrFeatChoiceRequiredAtLevels: [4, 8],
    });
  });

  it("includes the fighter-specific level 6 ability score improvement", () => {
    expect(
      service.resolveLevelUp({
        classKey: "fighter",
        currentLevel: 5,
        targetLevel: 8,
        hitDie: "d10",
        constitutionScore: 14,
      }),
    ).toMatchObject({
      asiOrFeatChoiceRequiredAtLevels: [6, 8],
    });
  });

  it("resolves P4 level 8 to 12 progression with proficiency, ASI, and representative features", () => {
    const result = service.resolveLevelUp({
      classKey: "fighter",
      currentLevel: 8,
      targetLevel: 12,
      hitDie: "d10",
      constitutionScore: 16,
      currentMaxHp: 76,
      classFeatures: catalog.listClassFeaturesForLevel("fighter", 12),
      subclassFeatures: catalog.listSubclassFeatures("fighter", "champion", 12),
    });

    expect(result).toMatchObject({
      proficiencyBonusBefore: 3,
      proficiencyBonusAfter: 4,
      asiOrFeatChoiceRequiredAtLevels: [12],
      hpGains: [
        { level: 9, baseGain: 6, constitutionModifier: 3, totalGain: 9 },
        { level: 10, baseGain: 6, constitutionModifier: 3, totalGain: 9 },
        { level: 11, baseGain: 6, constitutionModifier: 3, totalGain: 9 },
        { level: 12, baseGain: 6, constitutionModifier: 3, totalGain: 9 },
      ],
      maxHpAfter: 112,
    });
    expect(result.grantedFeatures.map((feature) => feature.featureId)).toEqual([
      "class.fighter.feature.indomitable",
      "subclass.fighter.champion.feature.additional_fighting_style",
      "class.fighter.feature.extra_attack_2",
      "class.fighter.feature.ability_score_improvement_12",
    ]);
  });

  it.each([
    ["barbarian", "d12", "berserker"],
    ["bard", "d8", "lore"],
    ["cleric", "d8", "life"],
    ["druid", "d8", "land"],
    ["fighter", "d10", "champion"],
    ["monk", "d8", "open_hand"],
    ["paladin", "d10", "devotion"],
    ["ranger", "d10", "hunter"],
    ["rogue", "d8", "thief"],
    ["sorcerer", "d6", "draconic_bloodline"],
    ["warlock", "d8", "fiend"],
    ["wizard", "d6", "evocation"],
  ] as const)("resolves P4 8 to 12 progression for %s", (classKey, hitDie, subclassKey) => {
    const result = service.resolveLevelUp({
      classKey,
      currentLevel: 8,
      targetLevel: 12,
      hitDie,
      constitutionScore: 14,
      classFeatures: catalog.listClassFeaturesForLevel(classKey, 12),
      subclassFeatures: catalog.listSubclassFeatures(classKey, subclassKey, 12),
    });

    expect(result).toMatchObject({
      classKey,
      fromLevel: 8,
      toLevel: 12,
      proficiencyBonusBefore: 3,
      proficiencyBonusAfter: 4,
      asiOrFeatChoiceRequiredAtLevels: [12],
    });
    expect(result.hpGains).toHaveLength(4);
    expect(result.hpGains.map((gain) => gain.level)).toEqual([9, 10, 11, 12]);
    expect(result.grantedFeatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: `class.${classKey}.feature.ability_score_improvement_12`,
          level: 12,
        }),
      ]),
    );
    expect(result.grantedFeatures.some((feature) => feature.level >= 9 && feature.level <= 12)).toBe(true);
  });

  it("resolves P5 level 12 to 16 progression with level 14/16 ASI and high-level features", () => {
    const result = service.resolveLevelUp({
      classKey: "warlock",
      currentLevel: 12,
      targetLevel: 16,
      hitDie: "d8",
      constitutionScore: 14,
      currentMaxHp: 87,
      classFeatures: catalog.listClassFeaturesForLevel("warlock", 16),
      subclassFeatures: catalog.listSubclassFeatures("warlock", "fiend", 16),
    });

    expect(result).toMatchObject({
      proficiencyBonusBefore: 4,
      proficiencyBonusAfter: 5,
      asiOrFeatChoiceRequiredAtLevels: [14, 16],
      hpGains: [
        { level: 13, baseGain: 5, constitutionModifier: 2, totalGain: 7 },
        { level: 14, baseGain: 5, constitutionModifier: 2, totalGain: 7 },
        { level: 15, baseGain: 5, constitutionModifier: 2, totalGain: 7 },
        { level: 16, baseGain: 5, constitutionModifier: 2, totalGain: 7 },
      ],
      maxHpAfter: 115,
    });
    expect(result.grantedFeatures.map((feature) => feature.featureId)).toEqual(
      expect.arrayContaining([
        "class.warlock.feature.mystic_arcanum_7",
        "class.warlock.feature.mystic_arcanum_8",
        "class.warlock.feature.ability_score_improvement_14",
        "class.warlock.feature.ability_score_improvement_16",
      ]),
    );
  });

  it.each([
    ["barbarian", "d12", "berserker"],
    ["bard", "d8", "lore"],
    ["cleric", "d8", "life"],
    ["druid", "d8", "land"],
    ["fighter", "d10", "champion"],
    ["monk", "d8", "open_hand"],
    ["paladin", "d10", "devotion"],
    ["ranger", "d10", "hunter"],
    ["rogue", "d8", "thief"],
    ["sorcerer", "d6", "draconic_bloodline"],
    ["warlock", "d8", "fiend"],
    ["wizard", "d6", "evocation"],
  ] as const)("resolves P5 12 to 16 progression for %s", (classKey, hitDie, subclassKey) => {
    const result = service.resolveLevelUp({
      classKey,
      currentLevel: 12,
      targetLevel: 16,
      hitDie,
      constitutionScore: 14,
      classFeatures: catalog.listClassFeaturesForLevel(classKey, 16),
      subclassFeatures: catalog.listSubclassFeatures(classKey, subclassKey, 16),
    });

    expect(result).toMatchObject({
      classKey,
      fromLevel: 12,
      toLevel: 16,
      proficiencyBonusBefore: 4,
      proficiencyBonusAfter: 5,
      asiOrFeatChoiceRequiredAtLevels: [14, 16],
    });
    expect(result.hpGains.map((gain) => gain.level)).toEqual([13, 14, 15, 16]);
    expect(result.grantedFeatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: `class.${classKey}.feature.ability_score_improvement_14`,
          level: 14,
        }),
        expect.objectContaining({
          featureId: `class.${classKey}.feature.ability_score_improvement_16`,
          level: 16,
        }),
      ]),
    );
    expect(result.grantedFeatures.some((feature) => feature.level >= 13 && feature.level <= 16)).toBe(true);
  });

  it("rejects non-increasing level changes", () => {
    expect(() =>
      service.resolveLevelUp({
        classKey: "cleric",
        currentLevel: 3,
        targetLevel: 3,
        hitDie: "d8",
        constitutionScore: 12,
      }),
    ).toThrow("targetLevel must be greater than currentLevel.");
  });
});
