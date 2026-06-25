import { RuleCatalogService } from "./rule-catalog.service";

describe("RuleCatalogService", () => {
  const service = new RuleCatalogService();

  it("catalogs Sacred Flame as a cover-ignoring single-target saving throw cantrip", () => {
    expect(service.getEntry("spell.sacred_flame")).toMatchObject({
      id: "spell.sacred_flame",
      kind: "spell_definitions",
      cost: { type: "action" },
      targeting: { type: "creature", rangeFt: 60 },
      save: { ability: "dex", dcSource: "spell_save_dc" },
      damage: { dice: "1d8", type: "radiant", scaling: "character_level" },
      concentration: false,
      runtimeEffect: {
        tags: expect.arrayContaining([
          "spell_level:0",
          "save:dex",
          "damage:radiant",
          "no_damage_on_success",
          "ignore_cover_save_bonus",
        ]),
      },
    });
  });

  it("catalogs Thunderwave as a cube save spell with forced movement", () => {
    expect(service.getEntry("spell.thunderwave")).toMatchObject({
      id: "spell.thunderwave",
      kind: "spell_definitions",
      targeting: { type: "area", shape: "cube", sizeFt: 15 },
      save: { ability: "con", dcSource: "spell_save_dc" },
      damage: { dice: "2d8", type: "thunder", scaling: "slot_level" },
      runtimeEffect: {
        tags: expect.arrayContaining([
          "spell_level:1",
          "area:cube",
          "half_damage_on_success",
          "forced_movement:push:10",
        ]),
      },
    });
  });

  it("catalogs the P0 concentration buff, debuff, terrain, and utility spells", () => {
    expect(service.getEntry("spell.bless")).toMatchObject({
      concentration: true,
      runtimeEffect: {
        tags: expect.arrayContaining([
          "target_count:3",
          "roll_bonus:attack_roll:1d4",
          "roll_bonus:saving_throw:1d4",
        ]),
      },
    });
    expect(service.getEntry("spell.bane")).toMatchObject({
      concentration: true,
      save: { ability: "cha", dcSource: "spell_save_dc" },
      runtimeEffect: {
        tags: expect.arrayContaining([
          "roll_penalty:attack_roll:1d4",
          "roll_penalty:saving_throw:1d4",
        ]),
      },
    });
    expect(service.getEntry("spell.entangle")).toMatchObject({
      concentration: true,
      targeting: { type: "area", shape: "cube", sizeFt: 20 },
      runtimeEffect: {
        tags: expect.arrayContaining([
          "condition:restrained",
          "terrain:terrain.difficult",
        ]),
      },
    });
    expect(service.getEntry("spell.detect_magic")).toMatchObject({
      concentration: true,
      targeting: { type: "self" },
      runtimeEffect: {
        tags: expect.arrayContaining(["utility:detection", "detect:magic:30"]),
      },
    });
  });

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
    expect(service.getEntry("race.dragonborn.trait.base_traits")).toMatchObject({
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "area", shape: "cone", sizeFt: 15 },
      save: { ability: "dex", dcSource: "class_feature_dc" },
      damage: { dice: "2d6", type: "ancestry", scaling: "character_level" },
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

  it("expands catalog feature ids into runtime tags while preserving custom tags", () => {
    expect(
      service.resolveRuntimeTags([
        "race.tiefling.trait.base_traits",
        "draconic_ancestry:red",
        "custom:campaign_feature",
      ]),
    ).toEqual(
      expect.arrayContaining([
        "vision:darkvision:60",
        "resistance:fire",
        "spellcasting:infernal_legacy",
        "draconic_ancestry:red",
        "resistance:fire",
        "custom:campaign_feature",
      ]),
    );
  });

  it("catalogs representative SRD subclass features", () => {
    expect(service.listEntries("subclass_features").map((entry) => entry.id)).toEqual([
      "subclass.barbarian.berserker.feature.frenzy",
      "subclass.barbarian.berserker.feature.mindless_rage",
      "subclass.barbarian.berserker.feature.intimidating_presence",
      "subclass.bard.lore.feature.bonus_proficiencies",
      "subclass.bard.lore.feature.cutting_words",
      "subclass.bard.lore.feature.additional_magical_secrets",
      "subclass.cleric.life.feature.bonus_proficiency",
      "subclass.cleric.life.feature.disciple_of_life",
      "subclass.cleric.life.feature.preserve_life",
      "subclass.cleric.life.feature.blessed_healer",
      "subclass.cleric.life.feature.divine_strike",
      "subclass.cleric.life.feature.domain_spells_level_9",
      "subclass.druid.land.feature.bonus_cantrip",
      "subclass.druid.land.feature.natural_recovery",
      "subclass.druid.land.feature.circle_spells_level_3",
      "subclass.druid.land.feature.circle_spells_level_5",
      "subclass.druid.land.feature.lands_stride",
      "subclass.druid.land.feature.circle_spells_level_9",
      "subclass.druid.land.feature.natures_ward",
      "subclass.fighter.champion.feature.improved_critical",
      "subclass.fighter.champion.feature.remarkable_athlete",
      "subclass.fighter.champion.feature.additional_fighting_style",
      "subclass.monk.open_hand.feature.open_hand_technique",
      "subclass.monk.open_hand.feature.wholeness_of_body",
      "subclass.monk.open_hand.feature.tranquility",
      "subclass.paladin.devotion.feature.sacred_weapon",
      "subclass.paladin.devotion.feature.turn_the_unholy",
      "subclass.paladin.devotion.feature.aura_of_devotion",
      "subclass.paladin.devotion.feature.oath_spells_level_9",
      "subclass.ranger.hunter.feature.hunters_prey",
      "subclass.ranger.hunter.feature.defensive_tactics",
      "subclass.ranger.hunter.feature.multiattack",
      "subclass.rogue.thief.feature.fast_hands",
      "subclass.rogue.thief.feature.second_story_work",
      "subclass.rogue.thief.feature.supreme_sneak",
      "subclass.sorcerer.draconic_bloodline.feature.dragon_ancestor",
      "subclass.sorcerer.draconic_bloodline.feature.draconic_resilience",
      "subclass.sorcerer.draconic_bloodline.feature.elemental_affinity",
      "subclass.warlock.fiend.feature.expanded_spell_list",
      "subclass.warlock.fiend.feature.dark_ones_blessing",
      "subclass.warlock.fiend.feature.dark_ones_own_luck",
      "subclass.warlock.fiend.feature.fiendish_resilience",
      "subclass.warlock.fiend.feature.hurl_through_hell",
      "subclass.wizard.evocation.feature.evocation_savant",
      "subclass.wizard.evocation.feature.sculpt_spells",
      "subclass.wizard.evocation.feature.potent_cantrip",
      "subclass.wizard.evocation.feature.empowered_evocation",
      "subclass.wizard.evocation.feature.overchannel",
      "subclass.barbarian.berserker.feature.retaliation",
      "subclass.bard.lore.feature.peerless_skill",
      "subclass.cleric.life.feature.divine_strike_2d8",
      "subclass.druid.land.feature.natures_sanctuary",
      "subclass.fighter.champion.feature.superior_critical",
      "subclass.paladin.devotion.feature.purity_of_spirit",
      "subclass.ranger.hunter.feature.superior_hunters_defense",
      "subclass.rogue.thief.feature.use_magic_device",
      "subclass.sorcerer.draconic_bloodline.feature.dragon_wings",
      "subclass.cleric.life.feature.supreme_healing",
      "subclass.fighter.champion.feature.survivor",
      "subclass.monk.open_hand.feature.quivering_palm",
      "subclass.paladin.devotion.feature.holy_nimbus",
      "subclass.rogue.thief.feature.thiefs_reflexes",
      "subclass.sorcerer.draconic_bloodline.feature.draconic_presence",
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
        "snapshot:level_up_choice_required",
        "spellcasting:half",
        "spellcasting:prepared",
        "spellcasting:divine",
        "immunity:disease",
        "subclass:choice_required",
        "snapshot:subclass_choice_required",
      ],
    });
  });

  it("keeps every class feature backed by runtime metadata", () => {
    const invalidClassFeatures = service
      .listEntries("class_features")
      .filter((entry) => !entry.runtimeEffect.type || entry.runtimeEffect.tags.length === 0)
      .map((entry) => entry.id);

    expect(invalidClassFeatures).toEqual([]);
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
        "snapshot:subclass_choice_required",
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
      classKey: "ranger",
      featureIds: [
        "class.ranger.feature.favored_enemy",
        "class.ranger.feature.natural_explorer",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "selection:favored_enemy",
        "tracking:advantage",
        "language:choice_one",
        "snapshot:level_up_choice_required",
        "selection:favored_terrain",
        "exploration:expertise:favored_terrain",
      ],
    },
    {
      classKey: "rogue",
      featureIds: [
        "class.rogue.feature.expertise",
        "class.rogue.feature.sneak_attack",
        "class.rogue.feature.thieves_cant",
      ],
      actionFeatureIds: [],
      resourceIds: [],
      passiveTags: [
        "skill:expertise",
        "selection:two_proficiencies",
        "snapshot:level_up_choice_required",
        "trigger:once_per_turn",
        "damage:extra:1d6",
        "scaling:rogue_level",
        "language:thieves_cant",
      ],
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
        "snapshot:subclass_choice_required",
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
        "snapshot:subclass_choice_required",
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

  it("covers all P1 SRD classes with level 1 through 3 class features", () => {
    const expectedFeatureIdsByClass: Record<string, string[]> = {
      barbarian: [
        "class.barbarian.feature.rage",
        "class.barbarian.feature.unarmored_defense",
        "class.barbarian.feature.danger_sense",
        "class.barbarian.feature.reckless_attack",
        "class.barbarian.feature.primal_path",
      ],
      bard: [
        "class.bard.feature.bardic_inspiration",
        "class.bard.feature.spellcasting",
        "class.bard.feature.jack_of_all_trades",
        "class.bard.feature.song_of_rest",
        "class.bard.feature.bard_college",
        "class.bard.feature.expertise",
      ],
      cleric: [
        "class.cleric.feature.divine_domain",
        "class.cleric.feature.spellcasting",
        "class.cleric.feature.channel_divinity",
      ],
      druid: [
        "class.druid.feature.druidic",
        "class.druid.feature.spellcasting",
        "class.druid.feature.druid_circle",
        "class.druid.feature.wild_shape",
      ],
      fighter: [
        "class.fighter.feature.fighting_style",
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
        "class.fighter.feature.martial_archetype",
      ],
      monk: [
        "class.monk.feature.martial_arts",
        "class.monk.feature.unarmored_defense",
        "class.monk.feature.ki",
        "class.monk.feature.unarmored_movement",
        "class.monk.feature.deflect_missiles",
        "class.monk.feature.monastic_tradition",
      ],
      paladin: [
        "class.paladin.feature.divine_sense",
        "class.paladin.feature.lay_on_hands",
        "class.paladin.feature.divine_smite",
        "class.paladin.feature.fighting_style",
        "class.paladin.feature.spellcasting",
        "class.paladin.feature.divine_health",
        "class.paladin.feature.sacred_oath",
      ],
      ranger: [
        "class.ranger.feature.favored_enemy",
        "class.ranger.feature.natural_explorer",
        "class.ranger.feature.fighting_style",
        "class.ranger.feature.spellcasting",
        "class.ranger.feature.primeval_awareness",
        "class.ranger.feature.ranger_archetype",
      ],
      rogue: [
        "class.rogue.feature.expertise",
        "class.rogue.feature.sneak_attack",
        "class.rogue.feature.thieves_cant",
        "class.rogue.feature.cunning_action",
        "class.rogue.feature.roguish_archetype",
      ],
      sorcerer: [
        "class.sorcerer.feature.sorcerous_origin",
        "class.sorcerer.feature.spellcasting",
        "class.sorcerer.feature.font_of_magic",
        "class.sorcerer.feature.metamagic",
      ],
      warlock: [
        "class.warlock.feature.otherworldly_patron",
        "class.warlock.feature.pact_magic",
        "class.warlock.feature.eldritch_invocations",
        "class.warlock.feature.pact_boon",
      ],
      wizard: [
        "class.wizard.feature.arcane_recovery",
        "class.wizard.feature.spellcasting",
        "class.wizard.feature.arcane_tradition",
      ],
    };

    for (const [classKey, expectedFeatureIds] of Object.entries(expectedFeatureIdsByClass)) {
      expect(service.getClassFeatureSnapshot(classKey, 3).featureIds).toEqual(expectedFeatureIds);
    }
  });

  it("covers all P2 classes through level 5 with ASI and representative level 5 features", () => {
    const classKeys = [
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "fighter",
      "monk",
      "paladin",
      "ranger",
      "rogue",
      "sorcerer",
      "warlock",
      "wizard",
    ];

    for (const classKey of classKeys) {
      expect(
        service.getClassFeatureSnapshot(classKey, 5).featureIds,
      ).toContain(`class.${classKey}.feature.ability_score_improvement`);
    }
    for (const classKey of [
      "barbarian",
      "fighter",
      "monk",
      "paladin",
      "ranger",
    ]) {
      expect(
        service.getClassFeatureSnapshot(classKey, 5).featureIds,
      ).toContain(`class.${classKey}.feature.extra_attack`);
    }
    expect(service.getClassFeatureSnapshot("bard", 5).featureIds).toEqual(
      expect.arrayContaining([
        "class.bard.feature.bardic_inspiration_d8",
        "class.bard.feature.font_of_inspiration",
      ]),
    );
    expect(service.getClassFeatureSnapshot("rogue", 5).featureIds).toContain(
      "class.rogue.feature.uncanny_dodge",
    );
  });

  it("catalogs every P3 class through level 8, including fighter's extra level 6 ASI", () => {
    const expectedFeatureIdsByClass: Record<string, string[]> = {
      barbarian: ["class.barbarian.feature.feral_instinct"],
      bard: ["class.bard.feature.countercharm"],
      cleric: [
        "class.cleric.feature.channel_divinity_uses_2",
        "class.cleric.feature.destroy_undead_cr_1",
      ],
      druid: ["class.druid.feature.wild_shape_improvement_cr_1"],
      fighter: ["class.fighter.feature.ability_score_improvement_6"],
      monk: [
        "class.monk.feature.ki_empowered_strikes",
        "class.monk.feature.evasion",
        "class.monk.feature.stillness_of_mind",
      ],
      paladin: ["class.paladin.feature.aura_of_protection"],
      ranger: [
        "class.ranger.feature.favored_enemy_improvement",
        "class.ranger.feature.natural_explorer_improvement",
        "class.ranger.feature.lands_stride",
      ],
      rogue: [
        "class.rogue.feature.expertise_improvement",
        "class.rogue.feature.evasion",
      ],
      sorcerer: [],
      warlock: [],
      wizard: [],
    };

    for (const [classKey, expectedFeatureIds] of Object.entries(expectedFeatureIdsByClass)) {
      const featureIds = service.getClassFeatureSnapshot(classKey, 8).featureIds;
      expect(featureIds).toContain(`class.${classKey}.feature.ability_score_improvement_8`);
      expect(featureIds).toEqual(expect.arrayContaining(expectedFeatureIds));
    }
  });

  it("catalogs the representative subclass features gained from levels 6 through 8", () => {
    const expectedSubclassFeatures = [
      ["barbarian", "berserker", "subclass.barbarian.berserker.feature.mindless_rage"],
      ["bard", "lore", "subclass.bard.lore.feature.additional_magical_secrets"],
      ["cleric", "life", "subclass.cleric.life.feature.blessed_healer"],
      ["cleric", "life", "subclass.cleric.life.feature.divine_strike"],
      ["druid", "land", "subclass.druid.land.feature.lands_stride"],
      ["fighter", "champion", "subclass.fighter.champion.feature.remarkable_athlete"],
      ["monk", "open_hand", "subclass.monk.open_hand.feature.wholeness_of_body"],
      ["paladin", "devotion", "subclass.paladin.devotion.feature.aura_of_devotion"],
      ["ranger", "hunter", "subclass.ranger.hunter.feature.defensive_tactics"],
      ["sorcerer", "draconic_bloodline", "subclass.sorcerer.draconic_bloodline.feature.elemental_affinity"],
      ["warlock", "fiend", "subclass.warlock.fiend.feature.dark_ones_own_luck"],
      ["wizard", "evocation", "subclass.wizard.evocation.feature.potent_cantrip"],
    ] as const;

    for (const [classKey, subclassKey, featureId] of expectedSubclassFeatures) {
      expect(
        service.listSubclassFeatures(classKey, subclassKey, 8).map((entry) => entry.id),
      ).toContain(featureId);
    }
  });

  it("catalogs every P4 class through level 12 with ASI and representative 9-12 features", () => {
    const expectedFeatureIdsByClass: Record<string, string[]> = {
      barbarian: [
        "class.barbarian.feature.brutal_critical",
        "class.barbarian.feature.rage_damage_3",
        "class.barbarian.feature.relentless_rage",
      ],
      bard: [
        "class.bard.feature.song_of_rest_d8",
        "class.bard.feature.bardic_inspiration_d10",
        "class.bard.feature.expertise_10",
        "class.bard.feature.magical_secrets",
      ],
      cleric: [
        "class.cleric.feature.divine_intervention",
        "class.cleric.feature.destroy_undead_cr_2",
      ],
      druid: ["class.druid.feature.wild_shape_uses_stable"],
      fighter: [
        "class.fighter.feature.indomitable",
        "class.fighter.feature.extra_attack_2",
      ],
      monk: [
        "class.monk.feature.unarmored_movement_improvement",
        "class.monk.feature.purity_of_body",
        "class.monk.feature.martial_arts_d8",
      ],
      paladin: [
        "class.paladin.feature.aura_of_courage",
        "class.paladin.feature.improved_divine_smite",
      ],
      ranger: ["class.ranger.feature.hide_in_plain_sight"],
      rogue: ["class.rogue.feature.reliable_talent"],
      sorcerer: [
        "class.sorcerer.feature.metamagic_improvement",
        "class.sorcerer.feature.sorcery_points_10",
      ],
      warlock: ["class.warlock.feature.mystic_arcanum_6"],
      wizard: ["class.wizard.feature.arcane_tradition_feature_10"],
    };

    for (const [classKey, expectedFeatureIds] of Object.entries(expectedFeatureIdsByClass)) {
      const featureIds = service.getClassFeatureSnapshot(classKey, 12).featureIds;
      expect(featureIds).toContain(`class.${classKey}.feature.ability_score_improvement_12`);
      expect(featureIds).toEqual(expect.arrayContaining(expectedFeatureIds));
    }
  });

  it.each([
    ["barbarian", "berserker"],
    ["bard", "lore"],
    ["cleric", "life"],
    ["druid", "land"],
    ["fighter", "champion"],
    ["monk", "open_hand"],
    ["paladin", "devotion"],
    ["ranger", "hunter"],
    ["rogue", "thief"],
    ["sorcerer", "draconic_bloodline"],
    ["warlock", "fiend"],
    ["wizard", "evocation"],
  ] as const)("keeps P4 9-12 %s/%s progression backed by runtime metadata", (classKey, subclassKey) => {
    const entries = [
      ...service.listClassFeaturesForLevel(classKey, 12),
      ...service.listSubclassFeatures(classKey, subclassKey, 12),
    ].filter((entry) => {
      const level = entry.levelRequirement.minClassLevel ?? 1;
      return level >= 9 && level <= 12;
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.runtimeEffect.tags.length > 0)).toBe(true);
  });

  it("catalogs the representative subclass features gained from levels 9 through 12 when SRD grants them", () => {
    const expectedSubclassFeatures = [
      ["barbarian", "berserker", "subclass.barbarian.berserker.feature.intimidating_presence"],
      ["cleric", "life", "subclass.cleric.life.feature.domain_spells_level_9"],
      ["druid", "land", "subclass.druid.land.feature.circle_spells_level_9"],
      ["druid", "land", "subclass.druid.land.feature.natures_ward"],
      ["fighter", "champion", "subclass.fighter.champion.feature.additional_fighting_style"],
      ["monk", "open_hand", "subclass.monk.open_hand.feature.tranquility"],
      ["paladin", "devotion", "subclass.paladin.devotion.feature.oath_spells_level_9"],
      ["ranger", "hunter", "subclass.ranger.hunter.feature.multiattack"],
      ["rogue", "thief", "subclass.rogue.thief.feature.supreme_sneak"],
      ["warlock", "fiend", "subclass.warlock.fiend.feature.fiendish_resilience"],
      ["wizard", "evocation", "subclass.wizard.evocation.feature.empowered_evocation"],
    ] as const;

    for (const [classKey, subclassKey, featureId] of expectedSubclassFeatures) {
      expect(
        service.listSubclassFeatures(classKey, subclassKey, 12).map((entry) => entry.id),
      ).toContain(featureId);
    }
  });

  it("catalogs every P5 class through level 16 with level 14/16 ASI and representative 13-16 features", () => {
    const expectedFeatureIdsByClass: Record<string, string[]> = {
      barbarian: [
        "class.barbarian.feature.brutal_critical_2",
        "class.barbarian.feature.persistent_rage",
      ],
      bard: [
        "class.bard.feature.song_of_rest_d10",
        "class.bard.feature.magical_secrets_14",
        "class.bard.feature.bardic_inspiration_d12",
      ],
      cleric: ["class.cleric.feature.destroy_undead_cr_3"],
      druid: [
        "class.druid.feature.seventh_level_spells",
        "class.druid.feature.eighth_level_spells",
      ],
      fighter: ["class.fighter.feature.indomitable_2"],
      monk: [
        "class.monk.feature.tongue_of_the_sun_and_moon",
        "class.monk.feature.diamond_soul",
        "class.monk.feature.timeless_body",
      ],
      paladin: ["class.paladin.feature.cleansing_touch"],
      ranger: [
        "class.ranger.feature.favored_enemy_improvement_14",
        "class.ranger.feature.vanish",
      ],
      rogue: [
        "class.rogue.feature.blindsense",
        "class.rogue.feature.slippery_mind",
      ],
      sorcerer: [
        "class.sorcerer.feature.seventh_level_spells",
        "class.sorcerer.feature.eighth_level_spells",
        "class.sorcerer.feature.sorcery_points_16",
      ],
      warlock: [
        "class.warlock.feature.mystic_arcanum_7",
        "class.warlock.feature.mystic_arcanum_8",
      ],
      wizard: [
        "class.wizard.feature.seventh_level_spells",
        "class.wizard.feature.eighth_level_spells",
      ],
    };

    for (const [classKey, expectedFeatureIds] of Object.entries(expectedFeatureIdsByClass)) {
      const featureIds = service.getClassFeatureSnapshot(classKey, 16).featureIds;
      expect(featureIds).toContain(`class.${classKey}.feature.ability_score_improvement_14`);
      expect(featureIds).toContain(`class.${classKey}.feature.ability_score_improvement_16`);
      expect(featureIds).toEqual(expect.arrayContaining(expectedFeatureIds));
    }
  });

  it.each([
    ["barbarian", "berserker"],
    ["bard", "lore"],
    ["cleric", "life"],
    ["druid", "land"],
    ["fighter", "champion"],
    ["monk", "open_hand"],
    ["paladin", "devotion"],
    ["ranger", "hunter"],
    ["rogue", "thief"],
    ["sorcerer", "draconic_bloodline"],
    ["warlock", "fiend"],
    ["wizard", "evocation"],
  ] as const)("keeps P5 13-16 %s/%s progression backed by runtime metadata", (classKey, subclassKey) => {
    const entries = [
      ...service.listClassFeaturesForLevel(classKey, 16),
      ...service.listSubclassFeatures(classKey, subclassKey, 16),
    ].filter((entry) => {
      const level = entry.levelRequirement.minClassLevel ?? 1;
      return level >= 13 && level <= 16;
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.runtimeEffect.tags.length > 0)).toBe(true);
  });

  it("catalogs representative P5 subclass features gained from levels 13 through 16", () => {
    const expectedSubclassFeatures = [
      ["barbarian", "berserker", "subclass.barbarian.berserker.feature.retaliation"],
      ["bard", "lore", "subclass.bard.lore.feature.peerless_skill"],
      ["cleric", "life", "subclass.cleric.life.feature.divine_strike_2d8"],
      ["druid", "land", "subclass.druid.land.feature.natures_sanctuary"],
      ["fighter", "champion", "subclass.fighter.champion.feature.superior_critical"],
      ["paladin", "devotion", "subclass.paladin.devotion.feature.purity_of_spirit"],
      ["ranger", "hunter", "subclass.ranger.hunter.feature.superior_hunters_defense"],
      ["rogue", "thief", "subclass.rogue.thief.feature.use_magic_device"],
      ["sorcerer", "draconic_bloodline", "subclass.sorcerer.draconic_bloodline.feature.dragon_wings"],
      ["warlock", "fiend", "subclass.warlock.fiend.feature.hurl_through_hell"],
      ["wizard", "evocation", "subclass.wizard.evocation.feature.overchannel"],
    ] as const;

    for (const [classKey, subclassKey, featureId] of expectedSubclassFeatures) {
      expect(
        service.listSubclassFeatures(classKey, subclassKey, 16).map((entry) => entry.id),
      ).toContain(featureId);
    }
  });

  it("catalogs every P6 class through level 20 with level 19 ASI, 9th-level casting, and capstones", () => {
    const expectedFeatureIdsByClass: Record<string, string[]> = {
      barbarian: [
        "class.barbarian.feature.brutal_critical_3",
        "class.barbarian.feature.primal_champion",
      ],
      bard: [
        "class.bard.feature.song_of_rest_d12",
        "class.bard.feature.magical_secrets_18",
        "class.bard.feature.superior_inspiration",
      ],
      cleric: [
        "class.cleric.feature.destroy_undead_cr_4",
        "class.cleric.feature.divine_intervention_improvement",
      ],
      druid: [
        "class.druid.feature.ninth_level_spells",
        "class.druid.feature.beast_spells",
        "class.druid.feature.archdruid",
      ],
      fighter: [
        "class.fighter.feature.action_surge_2",
        "class.fighter.feature.indomitable_3",
        "class.fighter.feature.extra_attack_3",
      ],
      monk: [
        "class.monk.feature.martial_arts_d10",
        "class.monk.feature.empty_body",
        "class.monk.feature.perfect_self",
      ],
      paladin: [
        "class.paladin.feature.aura_improvements",
        "class.paladin.feature.sacred_oath_capstone",
      ],
      ranger: [
        "class.ranger.feature.feral_senses",
        "class.ranger.feature.foe_slayer",
      ],
      rogue: [
        "class.rogue.feature.elusive",
        "class.rogue.feature.stroke_of_luck",
      ],
      sorcerer: [
        "class.sorcerer.feature.metamagic_improvement_17",
        "class.sorcerer.feature.ninth_level_spells",
        "class.sorcerer.feature.sorcerous_restoration",
      ],
      warlock: [
        "class.warlock.feature.mystic_arcanum_9",
        "class.warlock.feature.eldritch_master",
      ],
      wizard: [
        "class.wizard.feature.ninth_level_spells",
        "class.wizard.feature.spell_mastery",
        "class.wizard.feature.signature_spells",
      ],
    };

    for (const [classKey, expectedFeatureIds] of Object.entries(expectedFeatureIdsByClass)) {
      const featureIds = service.getClassFeatureSnapshot(classKey, 20).featureIds;
      expect(featureIds).toContain(`class.${classKey}.feature.ability_score_improvement_19`);
      expect(featureIds).toEqual(expect.arrayContaining(expectedFeatureIds));
    }
  });

  it.each([
    ["barbarian", "berserker"],
    ["bard", "lore"],
    ["cleric", "life"],
    ["druid", "land"],
    ["fighter", "champion"],
    ["monk", "open_hand"],
    ["paladin", "devotion"],
    ["ranger", "hunter"],
    ["rogue", "thief"],
    ["sorcerer", "draconic_bloodline"],
    ["warlock", "fiend"],
    ["wizard", "evocation"],
  ] as const)("keeps P6 17-20 %s/%s progression backed by runtime metadata", (classKey, subclassKey) => {
    const entries = [
      ...service.listClassFeaturesForLevel(classKey, 20),
      ...service.listSubclassFeatures(classKey, subclassKey, 20),
    ].filter((entry) => {
      const level = entry.levelRequirement.minClassLevel ?? 1;
      return level >= 17 && level <= 20;
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.runtimeEffect.tags.length > 0)).toBe(true);
  });

  it("catalogs representative P6 subclass features gained from levels 17 through 20", () => {
    const expectedSubclassFeatures = [
      ["cleric", "life", "subclass.cleric.life.feature.supreme_healing"],
      ["fighter", "champion", "subclass.fighter.champion.feature.survivor"],
      ["monk", "open_hand", "subclass.monk.open_hand.feature.quivering_palm"],
      ["paladin", "devotion", "subclass.paladin.devotion.feature.holy_nimbus"],
      ["rogue", "thief", "subclass.rogue.thief.feature.thiefs_reflexes"],
      ["sorcerer", "draconic_bloodline", "subclass.sorcerer.draconic_bloodline.feature.draconic_presence"],
    ] as const;

    for (const [classKey, subclassKey, featureId] of expectedSubclassFeatures) {
      expect(
        service.listSubclassFeatures(classKey, subclassKey, 20).map((entry) => entry.id),
      ).toContain(featureId);
    }
  });

  it("keeps all 12 representative subclasses present in the P6 level 20 snapshot", () => {
    const expectedRepresentativeSubclassAnchors = [
      ["barbarian", "berserker", "subclass.barbarian.berserker.feature.retaliation"],
      ["bard", "lore", "subclass.bard.lore.feature.peerless_skill"],
      ["cleric", "life", "subclass.cleric.life.feature.supreme_healing"],
      ["druid", "land", "subclass.druid.land.feature.natures_sanctuary"],
      ["fighter", "champion", "subclass.fighter.champion.feature.survivor"],
      ["monk", "open_hand", "subclass.monk.open_hand.feature.quivering_palm"],
      ["paladin", "devotion", "subclass.paladin.devotion.feature.holy_nimbus"],
      ["ranger", "hunter", "subclass.ranger.hunter.feature.superior_hunters_defense"],
      ["rogue", "thief", "subclass.rogue.thief.feature.thiefs_reflexes"],
      ["sorcerer", "draconic_bloodline", "subclass.sorcerer.draconic_bloodline.feature.draconic_presence"],
      ["warlock", "fiend", "subclass.warlock.fiend.feature.hurl_through_hell"],
      ["wizard", "evocation", "subclass.wizard.evocation.feature.overchannel"],
    ] as const;

    for (const [classKey, subclassKey, featureId] of expectedRepresentativeSubclassAnchors) {
      const entries = service.listSubclassFeatures(classKey, subclassKey, 20);
      expect(entries.map((entry) => entry.id)).toContain(featureId);
      expect(entries.find((entry) => entry.id === featureId)?.runtimeEffect.tags.length).toBeGreaterThan(0);
    }
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
      "condition.charmed",
      "condition.grappled",
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
      "terrain.flaming_sphere",
      "terrain.wall_of_fire",
    ]);
  });

  it("promotes MVP combat spells into executable catalog entries", () => {
    expect(service.listEntries("spell_definitions").map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
      "spell.bless",
      "spell.bane",
      "spell.chill_touch",
      "spell.fire_bolt",
      "spell.ray_of_frost",
      "spell.sacred_flame",
      "spell.light",
      "spell.detect_magic",
      "spell.magic_missile",
      "spell.cure_wounds",
      "spell.guiding_bolt",
      "spell.inflict_wounds",
      "spell.healing_word",
      "spell.command",
      "spell.shield",
      "spell.sleep",
      "spell.burning_hands",
      "spell.thunderwave",
      "spell.entangle",
      "spell.hold_person",
      "spell.web",
      "spell.misty_step",
      "spell.scorching_ray",
      "spell.fireball",
      "spell.dispel_magic",
      "spell.acid_splash",
      "spell.guidance",
      "spell.mage_hand",
      "spell.minor_illusion",
      "spell.shocking_grasp",
      "spell.charm_person",
      "spell.faerie_fire",
      "spell.feather_fall",
      "spell.fog_cloud",
      "spell.grease",
      "spell.heroism",
      "spell.hunters_mark",
      "spell.longstrider",
      "spell.aid",
      "spell.blindness_deafness",
      "spell.darkness",
      "spell.invisibility",
      "spell.lesser_restoration",
      "spell.moonbeam",
      "spell.spiritual_weapon",
      "spell.counterspell",
      "spell.fly",
      "spell.haste",
      "spell.lightning_bolt",
      "spell.revivify",
      "spell.blade_ward",
      "spell.eldritch_blast",
      "spell.false_life",
      "spell.flaming_sphere",
      "spell.call_lightning",
      "spell.blight",
      "spell.dimension_door",
      "spell.wall_of_fire",
    ]),
    );
    expect(service.listEntries("spell_definitions")).toHaveLength(329);
    expect(service.getEntry("spell.wish")).toMatchObject({
      kind: "spell_definitions",
      concentration: false,
      runtimeEffect: {
        tags: expect.arrayContaining(["p6_content", "final_srd_spell_manifest", "tier:9th_level"]),
      },
    });

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

    expect(service.getEntry("spell.wall_of_fire")).toMatchObject({
      targeting: { type: "area", shape: "line", sizeFt: 60 },
      damage: { dice: "5d8", type: "fire", scaling: "slot_level" },
      concentration: true,
      runtimeEffect: {
        tags: expect.arrayContaining(["spell_level:4", "trigger:on_enter"]),
        hookId: "hook.spell.cast_wall_of_fire",
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

    expect(service.getEntry("spell.burning_hands")).toMatchObject({
      id: "spell.burning_hands",
      kind: "spell_definitions",
      trigger: "action",
      cost: { type: "action" },
      targeting: { type: "area", shape: "cone", sizeFt: 15 },
      save: { ability: "dex", dcSource: "spell_save_dc" },
      damage: { dice: "3d6", type: "fire", scaling: "slot_level" },
      scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "1d6", perSlotAbove: 1 } },
      runtimeEffect: {
        type: "spell",
        tags: expect.arrayContaining(["spell_level:1", "area:cone", "range:15", "half_damage_on_success"]),
        hookId: "hook.spell.cast_burning_hands",
      },
    });

    expect(service.getEntry("spell.counterspell")).toMatchObject({
      trigger: "reaction",
      cost: { type: "reaction" },
      targeting: { type: "creature", rangeFt: 60 },
      runtimeEffect: {
        type: "spell",
        tags: expect.arrayContaining([
          "spell_level:3",
          "interrupt:spell",
          "reaction:creature_casts_spell",
        ]),
        hookId: "hook.spell.cast_counterspell",
      },
    });

    expect(service.getEntry("spell.moonbeam")).toMatchObject({
      concentration: true,
      save: { ability: "con", dcSource: "spell_save_dc" },
      damage: { dice: "2d10", type: "radiant", scaling: "slot_level" },
      runtimeEffect: {
        tags: expect.arrayContaining([
          "spell_level:2",
          "trigger:on_turn_start",
          "damage:radiant",
        ]),
      },
    });

    expect(service.getEntry("spell.disintegrate")).toMatchObject({
      kind: "spell_definitions",
      targeting: { type: "creature", rangeFt: 60 },
      save: { ability: "dex", dcSource: "spell_save_dc" },
      damage: { dice: "10d6+40", type: "force", scaling: "slot_level" },
      runtimeEffect: {
        type: "spell",
        tags: expect.arrayContaining([
          "spell_level:6",
          "p4_content",
          "destroy_if_zero_hp",
        ]),
        hookId: "hook.spell.cast_disintegrate",
      },
    });

    expect(service.getEntry("spell.mass_cure_wounds")).toMatchObject({
      kind: "spell_definitions",
      targeting: { type: "area", shape: "sphere", sizeFt: 30 },
      damage: { dice: "3d8", type: "healing", scaling: "slot_level" },
      runtimeEffect: {
        tags: expect.arrayContaining([
          "spell_level:5",
          "p4_content",
          "healing:multi_target:6",
        ]),
      },
    });
  });

  it("promotes monster actions into cumulative catalog ability entries", () => {
    const monsterAbilityIds = service
      .listEntries("monster_abilities")
      .map((entry) => entry.id);
    expect(monsterAbilityIds).toHaveLength(595);
    expect(monsterAbilityIds).toEqual(expect.arrayContaining([
      "monster.brown_bear.ability.multiattack",
      "monster.brown_bear.ability.bite",
      "monster.brown_bear.ability.claws",
      "monster.goblin.ability.scimitar",
      "monster.goblin.ability.shortbow",
      "monster.goblin.ability.nimble_escape",
      "monster.orc.ability.greataxe",
      "monster.orc.ability.javelin",
      "monster.wolf.ability.bite",
      "monster.skeleton.ability.shortsword",
      "monster.skeleton.ability.shortbow",
      "monster.zombie.ability.slam",
      "monster.zombie.ability.undead_fortitude",
      "monster.giant_rat.ability.bite",
      "monster.giant_spider.ability.web",
      "monster.giant_spider.ability.bite",
      "monster.dragon_whelp.ability.bite",
      "monster.dragon_whelp.ability.fire_breath",
      "monster.dragon_whelp.ability.dark_blessing",
      "monster.cultist.ability.scimitar",
      "monster.cultist.ability.dark_devotion",
      "monster.ogre.ability.greatclub",
      "monster.ogre.ability.javelin",
      "monster.kobold.ability.dagger",
      "monster.bandit.ability.light_crossbow",
      "monster.bugbear.ability.morningstar",
      "monster.hobgoblin.ability.longsword",
      "monster.dire_wolf.ability.bite",
      "monster.ghoul.ability.claws",
      "monster.wight.ability.life_drain",
      "monster.mimic.ability.pseudopod",
      "monster.gelatinous_cube.ability.engulf",
      "monster.swarm_of_rats.ability.bites",
      "monster.animated_armor.ability.multiattack",
      "monster.gargoyle.ability.stone_resistance",
      "monster.harpy.ability.luring_song",
      "monster.giant_scorpion.ability.sting",
      "monster.young_red_dragon.ability.fire_breath",
      "monster.troll.ability.regeneration",
      "monster.mage.ability.fireball",
      "monster.ghost.ability.possession",
      "monster.stone_golem.ability.slow",
      "monster.water_elemental.ability.whelm",
      "monster.basilisk.ability.petrifying_gaze",
      "monster.wyvern.ability.multiattack",
      "monster.young_blue_dragon.ability.lightning_breath",
      "monster.chimera.ability.fire_breath",
      "monster.lich.ability.paralyzing_touch",
      "monster.purple_worm.ability.swallow",
      "monster.archmage.ability.spell_burst",
      "monster.ancient_gold_dragon.ability.breath_or_bite",
      "monster.mummy_lord.ability.signature_action",
      "monster.will_o_wisp.ability.signature_action",
    ]));

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

    expect(service.listMonsterAbilities("dragon whelp").map((entry) => entry.id)).toEqual([
      "monster.dragon_whelp.ability.bite",
      "monster.dragon_whelp.ability.dark_blessing",
      "monster.dragon_whelp.ability.fire_breath",
    ]);

    expect(service.listMonsterAbilities("giant spider").map((entry) => entry.id)).toEqual([
      "monster.giant_spider.ability.bite",
      "monster.giant_spider.ability.web",
    ]);

    expect(
      [
        "monster.goblin",
        "monster.orc",
        "monster.wolf",
        "monster.skeleton",
        "monster.zombie",
        "monster.giant_spider",
        "monster.brown_bear",
        "monster.dragon_whelp",
        "monster.cultist",
        "monster.ogre",
      ].every((monsterId) => service.listMonsterAbilities(monsterId).length > 0),
    ).toBe(true);

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

    expect(
      service.resolveMonsterRuntimeTags("monster.swarm_of_rats"),
    ).toEqual(
      expect.arrayContaining([
        "resistance:bludgeoning",
        "resistance:piercing",
        "resistance:slashing",
        "immunity:condition:grappled",
        "passive:swarm",
      ]),
    );
    expect(
      service.resolveMonsterRuntimeTags("monster.young_red_dragon"),
    ).toEqual(
      expect.arrayContaining(["immunity:fire", "movement:fly:80"]),
    );
    expect(
      service.resolveMonsterRuntimeTags("monster.medusa"),
    ).toEqual(
      expect.arrayContaining(["p4_content", "condition:petrified", "avert_eyes"]),
    );
    expect(
      service.resolveMonsterRuntimeTags("monster.hydra"),
    ).toEqual(
      expect.arrayContaining(["p4_content", "head_regrowth", "multiattack:heads"]),
    );
  });
});
