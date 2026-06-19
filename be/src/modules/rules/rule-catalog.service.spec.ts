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

  it("catalogs race traits with fixed and runtime trait tags", () => {
    expect(service.listEntries("race_traits").map((entry) => entry.id)).toEqual([
      "race.human.trait.ability_score_increase",
      "race.elf.trait.base_traits",
      "race.high-elf.trait.subrace_traits",
      "race.dwarf.trait.base_traits",
      "race.hill-dwarf.trait.subrace_traits",
      "race.gnome.trait.base_traits",
      "race.rock-gnome.trait.subrace_traits",
      "race.half-elf.trait.base_traits",
      "race.half-orc.trait.base_traits",
      "race.halfling.trait.base_traits",
      "race.lightfoot-halfling.trait.subrace_traits",
      "race.dragonborn.trait.base_traits",
      "race.tiefling.trait.base_traits",
    ]);

    expect(service.getEntry("race.tiefling.trait.base_traits")).toMatchObject({
      id: "race.tiefling.trait.base_traits",
      kind: "race_traits",
      levelRequirement: { raceKey: "tiefling" },
      trigger: "character_creation",
      cost: { type: "none" },
      targeting: { type: "self" },
      runtimeEffect: {
        type: "race_trait",
        tags: [
          "fixed:ability:int:+1",
          "fixed:ability:cha:+2",
          "fixed:size:medium",
          "fixed:speed:30",
          "language:common",
          "language:infernal",
          "vision:darkvision:60",
          "resistance:fire",
          "spellcasting:infernal_legacy",
        ],
      },
    });
  });

  it("resolves inherited parent race traits for subraces", () => {
    expect(service.listRaceTraits("high_elf").map((entry) => entry.id)).toEqual([
      "race.elf.trait.base_traits",
      "race.high-elf.trait.subrace_traits",
    ]);

    expect(service.listRaceTraits("lightfoot-halfling").flatMap((entry) => entry.runtimeEffect.tags)).toEqual(
      expect.arrayContaining([
        "fixed:ability:dex:+2",
        "reroll:d20:natural_1",
        "fixed:ability:cha:+1",
        "hide:behind_larger_creature",
      ]),
    );
  });

  it("catalogs representative SRD subclass features", () => {
    expect(service.listEntries("subclass_features").map((entry) => entry.id)).toEqual([
      "subclass.barbarian.berserker.feature.frenzy",
      "subclass.bard.lore.feature.bonus_proficiencies",
      "subclass.bard.lore.feature.cutting_words",
      "subclass.cleric.life.feature.bonus_proficiency",
      "subclass.cleric.life.feature.disciple_of_life",
      "subclass.druid.land.feature.bonus_cantrip",
      "subclass.druid.land.feature.natural_recovery",
      "subclass.fighter.champion.feature.improved_critical",
      "subclass.monk.open_hand.feature.open_hand_technique",
      "subclass.paladin.devotion.feature.sacred_weapon",
      "subclass.paladin.devotion.feature.turn_the_unholy",
      "subclass.ranger.hunter.feature.hunters_prey",
      "subclass.rogue.thief.feature.fast_hands",
      "subclass.rogue.thief.feature.second_story_work",
      "subclass.sorcerer.draconic_bloodline.feature.dragon_ancestor",
      "subclass.sorcerer.draconic_bloodline.feature.draconic_resilience",
      "subclass.warlock.fiend.feature.expanded_spell_list",
      "subclass.warlock.fiend.feature.dark_ones_blessing",
      "subclass.wizard.evocation.feature.evocation_savant",
      "subclass.wizard.evocation.feature.sculpt_spells",
    ]);

    expect(service.getEntry("subclass.fighter.champion.feature.improved_critical")).toMatchObject({
      id: "subclass.fighter.champion.feature.improved_critical",
      kind: "subclass_features",
      levelRequirement: {
        classKey: "fighter",
        subclassKey: "champion",
        minClassLevel: 3,
      },
      trigger: "always",
      runtimeEffect: {
        type: "subclass_feature",
        tags: [
          "legacy_feature_id:class.fighter.subclass_feature.improved_critical",
          "critical_range:19_20",
          "attack:weapon",
        ],
      },
    });
  });

  it("resolves subclass features by class, subclass, and class level", () => {
    expect(service.listSubclassFeatures("wizard", "evocation", 1)).toEqual([]);

    expect(service.listSubclassFeatures("wizard", "evocation", 2).map((entry) => entry.id)).toEqual([
      "subclass.wizard.evocation.feature.evocation_savant",
      "subclass.wizard.evocation.feature.sculpt_spells",
    ]);

    expect(service.listSubclassFeatures("sorcerer", "draconic bloodline", 1).map((entry) => entry.id)).toEqual([
      "subclass.sorcerer.draconic_bloodline.feature.dragon_ancestor",
      "subclass.sorcerer.draconic_bloodline.feature.draconic_resilience",
    ]);
  });

  it("derives each class subclass choice level from catalog definitions", () => {
    const expectedChoiceLevels = {
      barbarian: 3,
      bard: 3,
      cleric: 1,
      druid: 2,
      fighter: 3,
      monk: 3,
      paladin: 3,
      ranger: 3,
      rogue: 3,
      sorcerer: 1,
      warlock: 1,
      wizard: 2,
    };

    for (const [classKey, choiceLevel] of Object.entries(expectedChoiceLevels)) {
      expect(service.getSubclassChoiceLevel(classKey)).toBe(choiceLevel);
    }
    expect(service.getSubclassChoiceLevel("unknown-class")).toBeNull();
  });

  it("builds a full character feature snapshot with race, class, subclass, and custom features", () => {
    expect(
      service.getCharacterFeatureSnapshot({
        raceKey: "high_elf",
        classKey: "fighter",
        subclassKey: "champion",
        classLevel: 3,
        requestedFeatureIds: [
          "race.elf.trait.base_traits",
          "class.fighter.feature.second_wind",
          "subclass.fighter.champion.feature.improved_critical",
          "homebrew.feature.duelist",
        ],
      }),
    ).toEqual({
      raceKey: "high-elf",
      classKey: "fighter",
      subclassKey: "champion",
      classLevel: 3,
      featureIds: [
        "race.elf.trait.base_traits",
        "race.high-elf.trait.subrace_traits",
        "class.fighter.feature.fighting_style",
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
        "class.fighter.feature.martial_archetype",
        "subclass.fighter.champion.feature.improved_critical",
        "homebrew.feature.duelist",
      ],
      raceTraitIds: [
        "race.elf.trait.base_traits",
        "race.high-elf.trait.subrace_traits",
      ],
      classFeatureIds: [
        "class.fighter.feature.fighting_style",
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
        "class.fighter.feature.martial_archetype",
      ],
      subclassFeatureIds: [
        "subclass.fighter.champion.feature.improved_critical",
      ],
      customFeatureIds: ["homebrew.feature.duelist"],
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
      actionFeatureIds: [
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
      ],
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

  it("exposes resource-backed action tags as class action features", () => {
    expect(service.getClassFeatureSnapshot("monk", 2)).toMatchObject({
      featureIds: [
        "class.monk.feature.martial_arts",
        "class.monk.feature.unarmored_defense",
        "class.monk.feature.ki",
        "class.monk.feature.unarmored_movement",
      ],
      actionFeatureIds: ["class.monk.feature.ki"],
      resourceIds: ["resource.monk.ki"],
    });
  });

  it.each([
    {
      classKey: "bard",
      featureIds: [
        "class.bard.feature.bardic_inspiration",
        "class.bard.feature.spellcasting",
      ],
      actionFeatureIds: ["class.bard.feature.bardic_inspiration"],
      resourceIds: ["resource.bard.bardic_inspiration"],
      passiveTags: ["spellcasting:full", "spellcasting:known", "spellcasting:arcane"],
    },
    {
      classKey: "cleric",
      featureIds: [
        "class.cleric.feature.divine_domain",
        "class.cleric.feature.spellcasting",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "subclass:choice_required",
        "spellcasting:full",
        "spellcasting:prepared",
        "spellcasting:divine",
      ],
    },
    {
      classKey: "druid",
      featureIds: [
        "class.druid.feature.druidic",
        "class.druid.feature.spellcasting",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "language:druidic",
        "spellcasting:full",
        "spellcasting:prepared",
        "spellcasting:primal",
      ],
    },
    {
      classKey: "monk",
      featureIds: [
        "class.monk.feature.martial_arts",
        "class.monk.feature.unarmored_defense",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "unarmed:martial_arts_die",
        "action:bonus_unarmed_after_attack",
        "armor_class:unarmored_dex_wis",
      ],
    },
    {
      classKey: "paladin",
      featureIds: [
        "class.paladin.feature.divine_sense",
        "class.paladin.feature.lay_on_hands",
      ],
      actionFeatureIds: [
        "class.paladin.feature.divine_sense",
        "class.paladin.feature.lay_on_hands",
      ],
      resourceIds: [
        "resource.paladin.divine_sense",
        "resource.paladin.lay_on_hands",
      ],
      passiveTags: [],
    },
    {
      classKey: "sorcerer",
      featureIds: [
        "class.sorcerer.feature.sorcerous_origin",
        "class.sorcerer.feature.spellcasting",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "subclass:choice_required",
        "spellcasting:full",
        "spellcasting:known",
        "spellcasting:arcane",
      ],
    },
    {
      classKey: "warlock",
      featureIds: [
        "class.warlock.feature.otherworldly_patron",
        "class.warlock.feature.pact_magic",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "subclass:choice_required",
        "spellcasting:pact",
        "spellcasting:known",
        "spellcasting:arcane",
      ],
    },
    {
      classKey: "wizard",
      featureIds: [
        "class.wizard.feature.arcane_recovery",
        "class.wizard.feature.spellcasting",
      ],
      actionFeatureIds: [],
      resourceIds: ["resource.wizard.arcane_recovery"],
      passiveTags: [
        "rest:short",
        "resource:arcane_recovery",
        "spellcasting:full",
        "spellcasting:prepared",
        "spellcasting:arcane",
        "spellbook",
      ],
    },
  ])("builds the level 1 $classKey SRD class feature snapshot", (expected) => {
    expect(service.getClassFeatureSnapshot(expected.classKey, 1)).toEqual({
      classKey: expected.classKey,
      classLevel: 1,
      featureIds: expected.featureIds,
      actionFeatureIds: expected.actionFeatureIds,
      resourceIds: expected.resourceIds,
      passiveTags: expected.passiveTags,
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
      "spell.ray_of_frost",
      "spell.light",
      "spell.magic_missile",
      "spell.cure_wounds",
      "spell.shield",
      "spell.sleep",
      "spell.fireball",
    ]);

    expect(service.getEntry("spell.ray_of_frost")).toMatchObject({
      targeting: { type: "creature", rangeFt: 60 },
      damage: { dice: "1d8", type: "cold", scaling: "character_level" },
      runtimeEffect: {
        tags: expect.arrayContaining(["movement_speed_penalty:10"]),
        hookId: "hook.spell.cast_ray_of_frost",
      },
    });

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
        tags: ["spell_level:1", "hit_point_pool:5d8", "condition:unconscious", "area:sphere", "range:90"],
        hookId: "hook.spell.cast_sleep",
      },
    });

    expect(service.getEntry("spell.fireball")).toMatchObject({
      id: "spell.fireball",
      kind: "spell_definitions",
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "area", shape: "sphere", sizeFt: 20 },
      save: { ability: "dex", dcSource: "spell_save_dc" },
      damage: { dice: "8d6", type: "fire", scaling: "slot_level" },
      scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
      runtimeEffect: {
        type: "spell",
        tags: [
          "spell_level:3",
          "area:sphere",
          "range:150",
          "save:dex",
          "damage:fire",
          "half_damage_on_success",
        ],
        hookId: "hook.spell.cast_fireball",
      },
    });
  });

  it("promotes MVP monster actions into catalog ability entries", () => {
    expect(service.listEntries("monster_abilities").map((entry) => entry.id)).toEqual([
      "monster.brown_bear.ability.multiattack",
      "monster.brown_bear.ability.bite",
      "monster.brown_bear.ability.claws",
      "monster.goblin.ability.scimitar",
      "monster.goblin.ability.shortbow",
      "monster.goblin.ability.nimble_escape",
      "monster.giant_rat.ability.bite",
      "monster.giant_spider.ability.bite",
    ]);

    expect(service.listMonsterAbilities("brown bear").map((entry) => entry.id)).toEqual([
      "monster.brown_bear.ability.bite",
      "monster.brown_bear.ability.claws",
      "monster.brown_bear.ability.multiattack",
    ]);

    expect(service.listMonsterAbilities("goblin").map((entry) => entry.id)).toEqual([
      "monster.goblin.ability.nimble_escape",
      "monster.goblin.ability.scimitar",
      "monster.goblin.ability.shortbow",
    ]);

    expect(service.getEntry("monster.goblin.ability.scimitar")).toMatchObject({
      id: "monster.goblin.ability.scimitar",
      kind: "monster_abilities",
      levelRequirement: { monsterId: "monster.goblin" },
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "creature", rangeFt: 5 },
      damage: { dice: "1d6+2", type: "slashing" },
      runtimeEffect: {
        type: "monster_ability",
        tags: ["attack:melee_weapon", "attack_bonus:+4", "srd_action_id:action.scimitar"],
        hookId: "hook.monster.attack",
      },
    });
  });
});
