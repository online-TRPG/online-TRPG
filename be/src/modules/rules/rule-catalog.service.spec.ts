import { RuleCatalogService } from "./rule-catalog.service";

describe("RuleCatalogService", () => {
  const service = new RuleCatalogService();

  it("exposes the shared catalog entry shape for class features", () => {
    const entry = service.getEntry("class.wizard.feature.spellcasting");

    expect(entry).toMatchObject({
      id: "class.wizard.feature.spellcasting",
      kind: "class_features",
      source: "SRD5E",
      levelRequirement: {
        classKey: "wizard",
        minClassLevel: 1,
      },
      trigger: "always",
      cost: { type: "none" },
      targeting: { type: "none" },
      save: null,
      damage: null,
      duration: null,
      concentration: false,
      scaling: null,
      runtimeEffect: {
        type: "spellcasting",
        tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:arcane", "spellbook"],
      },
    });
  });

  it("builds an executable feature snapshot through class level 3", () => {
    const snapshot = service.getClassFeatureSnapshot("Paladin", 3);

    expect(snapshot).toEqual({
      classKey: "paladin",
      classLevel: 3,
      featureIds: [
        "class.paladin.feature.divine_sense",
        "class.paladin.feature.lay_on_hands",
        "class.paladin.feature.divine_smite",
        "class.paladin.feature.fighting_style",
        "class.paladin.feature.spellcasting",
        "class.paladin.feature.divine_health",
        "class.paladin.feature.sacred_oath",
      ],
      actionFeatureIds: [
        "class.paladin.feature.divine_sense",
        "class.paladin.feature.lay_on_hands",
      ],
      resourceIds: [
        "resource.paladin.divine_sense",
        "resource.paladin.lay_on_hands",
      ],
      passiveTags: [
        "selection:fighting_style",
        "spellcasting:half",
        "spellcasting:prepared",
        "spellcasting:divine",
        "immunity:disease",
        "subclass:choice_required",
      ],
    });
  });

  it("catalogs existing fighter and barbarian resource features for rest recovery", () => {
    expect(service.getClassFeatureSnapshot("fighter", 2)).toMatchObject({
      featureIds: [
        "class.fighter.feature.fighting_style",
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
      ],
      actionFeatureIds: ["class.fighter.feature.second_wind"],
      resourceIds: [
        "resource.fighter.second_wind",
        "resource.fighter.action_surge",
      ],
    });

    expect(service.getClassFeatureSnapshot("barbarian", 1)).toMatchObject({
      featureIds: [
        "class.barbarian.feature.rage",
        "class.barbarian.feature.unarmored_defense",
      ],
      actionFeatureIds: ["class.barbarian.feature.rage"],
      resourceIds: ["resource.barbarian.rage"],
    });
  });

  it("keeps condition definitions in the same catalog id surface", () => {
    const conditions = service.listEntries("condition_definitions").map((entry) => entry.id);

    expect(conditions).toEqual([
      "condition.prone",
      "condition.poisoned",
      "condition.restrained",
      "condition.frightened",
      "condition.paralyzed",
      "condition.incapacitated",
      "condition.burning",
      "condition.stunned",
    ]);
  });

  it("keeps terrain effects in the shared catalog id surface", () => {
    expect(service.listEntries("terrain_effects").map((entry) => entry.id)).toEqual([
      "terrain.difficult",
      "terrain.hazardous",
      "terrain.obscurement",
      "terrain.elevation",
      "terrain.slippery",
      "terrain.burning",
      "terrain.poison_cloud",
    ]);
  });

  it("promotes MVP combat spells into executable catalog entries", () => {
    expect(service.listEntries("spell_definitions").map((entry) => entry.id)).toEqual([
      "spell.chill_touch",
      "spell.fire_bolt",
      "spell.light",
      "spell.magic_missile",
      "spell.shield",
      "spell.sleep",
    ]);

    expect(service.getEntry("spell.sleep")).toMatchObject({
      id: "spell.sleep",
      kind: "spell_definitions",
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "area", shape: "sphere", sizeFt: 20 },
      duration: { unit: "minute", amount: 1 },
      scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "2d8", perSlotAbove: 1 } },
      runtimeEffect: {
        type: "spell",
        tags: ["spell_level:1", "hit_point_pool:5d8", "condition:unconscious", "area:sphere"],
        hookId: "hook.spell.cast_sleep",
      },
    });
  });
});
