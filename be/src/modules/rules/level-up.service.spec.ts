import { LevelUpService } from "./level-up.service";
import { RuleCatalogService } from "./rule-catalog.service";

describe("LevelUpService", () => {
  const service = new LevelUpService();
  const catalog = new RuleCatalogService();

  it("resolves proficiency, average HP, and new fighter features", () => {
    const result = service.resolveLevelUp({
      classKey: "fighter",
      currentLevel: 1,
      targetLevel: 3,
      hitDie: "d10",
      constitutionScore: 14,
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
