import {
  RuleCatalogEntry,
  RuleCost,
  RuleTargeting,
} from "./rule-catalog.types";

const ACTION: RuleCost = { type: "action" };
const SELF: RuleTargeting = { type: "self" };

export const P6_EXECUTABLE_MONSTER_IDS = [
  "monster.adult_brass_dragon",
  "monster.adult_bronze_dragon",
  "monster.adult_copper_dragon",
  "monster.adult_gold_dragon",
  "monster.adult_silver_dragon",
  "monster.ancient_brass_dragon",
  "monster.ancient_bronze_dragon",
  "monster.ancient_copper_dragon",
  "monster.ancient_gold_dragon",
  "monster.ancient_silver_dragon",
  "monster.ape",
  "monster.awakened_shrub",
  "monster.awakened_tree",
  "monster.axe_beak",
  "monster.azer",
  "monster.baboon",
  "monster.badger",
  "monster.barbed_devil",
  "monster.bat",
  "monster.bearded_devil",
  "monster.behir",
  "monster.black_dragon_wyrmling",
  "monster.black_pudding",
  "monster.blink_dog",
  "monster.blood_hawk",
  "monster.blue_dragon_wyrmling",
  "monster.boar",
  "monster.brass_dragon_wyrmling",
  "monster.bronze_dragon_wyrmling",
  "monster.camel",
  "monster.cat",
  "monster.centaur",
  "monster.chuul",
  "monster.cockatrice",
  "monster.commoner",
  "monster.constrictor_snake",
  "monster.copper_dragon_wyrmling",
  "monster.crab",
  "monster.crocodile",
  "monster.darkmantle",
  "monster.death_dog",
  "monster.deer",
  "monster.doppelganger",
  "monster.draft_horse",
  "monster.dretch",
  "monster.druid",
  "monster.dryad",
  "monster.duergar",
  "monster.dust_mephit",
  "monster.eagle",
  "monster.elf_drow",
  "monster.elk",
  "monster.flying_snake",
  "monster.flying_sword",
  "monster.frog",
  "monster.ghast",
  "monster.giant_badger",
  "monster.giant_bat",
  "monster.giant_boar",
  "monster.giant_centipede",
  "monster.giant_constrictor_snake",
  "monster.giant_crab",
  "monster.giant_elk",
  "monster.giant_fire_beetle",
  "monster.giant_frog",
  "monster.giant_goat",
  "monster.giant_hyena",
  "monster.giant_lizard",
  "monster.giant_poisonous_snake",
  "monster.giant_sea_horse",
  "monster.giant_toad",
  "monster.giant_vulture",
  "monster.giant_wasp",
  "monster.giant_weasel",
  "monster.giant_wolf_spider",
  "monster.gibbering_mouther",
  "monster.glabrezu",
  "monster.gnoll",
  "monster.gnome_deep_svirfneblin",
  "monster.goat",
  "monster.gold_dragon_wyrmling",
  "monster.gorgon",
  "monster.gray_ooze",
  "monster.green_dragon_wyrmling",
  "monster.grick",
  "monster.grimlock",
  "monster.guard",
  "monster.guardian_naga",
  "monster.half_red_dragon_veteran",
  "monster.hawk",
  "monster.hell_hound",
  "monster.hippogriff",
  "monster.homunculus",
  "monster.hunter_shark",
  "monster.hyena",
  "monster.ice_mephit",
  "monster.imp",
  "monster.jackal",
  "monster.killer_whale",
  "monster.lemure",
  "monster.lizard",
  "monster.lizardfolk",
  "monster.magma_mephit",
  "monster.magmin",
  "monster.mastiff",
  "monster.merfolk",
  "monster.minotaur_skeleton",
  "monster.mule",
  "monster.mummy_lord",
  "monster.noble",
  "monster.ochre_jelly",
  "monster.octopus",
  "monster.ogre_zombie",
  "monster.oni",
  "monster.owl",
  "monster.owlbear",
  "monster.panther",
  "monster.pegasus",
  "monster.poisonous_snake",
  "monster.polar_bear",
  "monster.pony",
  "monster.pseudodragon",
  "monster.quipper",
  "monster.rat",
  "monster.raven",
  "monster.red_dragon_wyrmling",
  "monster.riding_horse",
  "monster.rug_of_smothering",
  "monster.saber_toothed_tiger",
  "monster.sahuagin",
  "monster.satyr",
  "monster.scorpion",
  "monster.sea_horse",
  "monster.shadow",
  "monster.shambling_mound",
  "monster.shrieker",
  "monster.silver_dragon_wyrmling",
  "monster.spider",
  "monster.spirit_naga",
  "monster.sprite",
  "monster.steam_mephit",
  "monster.stirge",
  "monster.succubus_incubus",
  "monster.swarm_of_bats",
  "monster.swarm_of_poisonous_snakes",
  "monster.swarm_of_quippers",
  "monster.swarm_of_ravens",
  "monster.tribal_warrior",
  "monster.violet_fungus",
  "monster.vulture",
  "monster.warhorse",
  "monster.warhorse_skeleton",
  "monster.weasel",
  "monster.wereboar",
  "monster.weretiger",
  "monster.white_dragon_wyrmling",
  "monster.will_o_wisp",
  "monster.winter_wolf",
  "monster.worg",
  "monster.young_bronze_dragon",
  "monster.young_copper_dragon",
  "monster.young_gold_dragon",
  "monster.young_silver_dragon",
] as const;

function isDragon(monsterId: string): boolean {
  return monsterId.includes("dragon");
}

function isSwarm(monsterId: string): boolean {
  return monsterId.includes("swarm");
}

function p6BossRuntimeTags(monsterId: string): string[] {
  if (monsterId.includes("ancient_")) {
    return [
      "legendary_or_lair_candidate",
      "legendary_like:tail_attack",
      "legendary_like:wing_attack",
      "lair:regional_terrain",
      "phase:ancient_dragon_boss",
      "terrain:flight_and_breath_control",
    ];
  }
  if (monsterId === "monster.mummy_lord") {
    return [
      "legendary_or_lair_candidate",
      "legendary_like:dreadful_glare",
      "lair:necrotic_temple",
      "phase:curse_lord_boss",
      "terrain:sepulcher_hazard",
    ];
  }
  if (monsterId === "monster.guardian_naga" || monsterId === "monster.spirit_naga") {
    return [
      "legendary_or_lair_candidate",
      "legendary_like:spell_cycle",
      "lair:warded_sanctum",
      "phase:serpent_spell_boss",
      "terrain:arcane_ward",
    ];
  }
  return ["standard_action"];
}

function abilityFor(monsterId: string): RuleCatalogEntry {
  const dragon = isDragon(monsterId);
  const swarm = isSwarm(monsterId);
  const abilityId = isDragon(monsterId)
    ? "breath_or_bite"
    : isSwarm(monsterId)
      ? "swarm_bites"
      : "signature_action";
  const targeting: RuleTargeting = dragon
    ? { type: "area", shape: "cone", sizeFt: monsterId.includes("ancient") ? 90 : 30 }
    : swarm
      ? { type: "area", shape: "sphere", sizeFt: 10 }
      : { type: "creature", rangeFt: 5 };

  return {
    id: `${monsterId}.ability.${abilityId}`,
    kind: "monster_abilities",
    source: "SRD5E",
    levelRequirement: { monsterId },
    trigger: "action",
    cost: ACTION,
    targeting,
    save: dragon
      ? { ability: "dex", dcSource: "fixed", fixedDc: monsterId.includes("ancient") ? 21 : 15 }
      : swarm
        ? { ability: "dex", dcSource: "fixed", fixedDc: 12 }
      : null,
    damage: dragon
      ? { dice: monsterId.includes("ancient") ? "18d6" : "7d6", type: "elemental" }
      : { dice: swarm ? "4d6" : "1d6", type: "physical" },
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "monster_ability",
      tags: [
        "p6_content",
        "final_srd_monster_manifest",
        dragon ? "role:dragon" : "role:catalog_completion",
        swarm ? "trait:swarm" : "trait:single_creature",
        `srd_action_id:action.${abilityId}`,
        ...p6BossRuntimeTags(monsterId),
        ...(dragon || swarm
          ? ["half_damage_on_success"]
          : ["attack:melee_weapon", "attack_bonus:+3"]),
        "audit:turn_log_state_diff",
      ],
      hookId: dragon || swarm
        ? "hook.monster.aoe_save"
        : "hook.monster.attack",
    },
  };
}

function passiveFor(monsterId: string): RuleCatalogEntry {
  return {
    id: `${monsterId}.ability.p6_manifest_passive`,
    kind: "monster_abilities",
    source: "SRD5E",
    levelRequirement: { monsterId },
    trigger: "always",
    cost: { type: "none" },
    targeting: SELF,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "monster_ability",
      tags: ["p6_content", "final_srd_monster_manifest", "passive:manifest_coverage"],
      hookId: "hook.monster.passive",
    },
  };
}

export const P6_MONSTER_ABILITY_DEFINITIONS: RuleCatalogEntry[] =
  P6_EXECUTABLE_MONSTER_IDS.flatMap((monsterId) => [
    abilityFor(monsterId),
    passiveFor(monsterId),
  ]);
