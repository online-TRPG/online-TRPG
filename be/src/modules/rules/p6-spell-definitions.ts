import {
  RuleCatalogEntry,
  RuleCost,
  RuleTargeting,
} from "./rule-catalog.types";

type P6SpellSeed = readonly [
  id: string,
  level: number,
  concentration: boolean,
  ritual: boolean,
];

const ACTION: RuleCost = { type: "action" };
const REACTION: RuleCost = { type: "reaction" };
const SELF: RuleTargeting = { type: "self" };

const P6_SPELL_SEEDS: P6SpellSeed[] = [
  ["acid_arrow", 2, false, false],
  ["animal_shapes", 8, true, false],
  ["animate_dead", 3, false, false],
  ["antilife_shell", 5, true, false],
  ["arcane_hand", 5, true, false],
  ["arcane_lock", 2, false, false],
  ["arcane_sword", 7, true, false],
  ["arcanists_magic_aura", 2, false, false],
  ["astral_projection", 9, false, false],
  ["augury", 2, false, true],
  ["awaken", 5, false, false],
  ["beacon_of_hope", 3, true, false],
  ["blade_barrier", 6, true, false],
  ["blink", 3, false, false],
  ["branding_smite", 2, true, false],
  ["commune_with_nature", 5, false, true],
  ["conjure_animals", 3, true, false],
  ["conjure_celestial", 7, true, false],
  ["conjure_fey", 6, true, false],
  ["contact_other_plane", 5, false, true],
  ["contagion", 5, false, false],
  ["contingency", 6, false, false],
  ["create_food_and_water", 3, false, false],
  ["create_undead", 6, false, false],
  ["creation", 5, false, false],
  ["detect_evil_and_good", 1, true, false],
  ["detect_poison_and_disease", 1, true, true],
  ["detect_thoughts", 2, true, false],
  ["disguise_self", 1, false, false],
  ["dispel_evil_and_good", 5, true, false],
  ["divine_favor", 1, true, false],
  ["dominate_beast", 4, true, false],
  ["dream", 5, false, false],
  ["druidcraft", 0, false, false],
  ["faithful_hound", 4, false, false],
  ["find_steed", 2, false, false],
  ["find_traps", 2, false, false],
  ["flame_blade", 2, true, false],
  ["floating_disk", 1, false, true],
  ["forbiddance", 6, false, true],
  ["foresight", 9, false, false],
  ["freezing_sphere", 6, false, false],
  ["gate", 9, true, false],
  ["geas", 5, false, false],
  ["giant_insect", 4, true, false],
  ["guards_and_wards", 6, false, false],
  ["hallow", 5, false, false],
  ["hellish_rebuke", 1, false, false],
  ["hideous_laughter", 1, true, false],
  ["hypnotic_pattern", 3, true, false],
  ["identify", 1, false, true],
  ["illusory_script", 1, false, true],
  ["imprisonment", 9, false, false],
  ["instant_summons", 6, false, true],
  ["irresistible_dance", 6, true, false],
  ["legend_lore", 5, false, false],
  ["locate_animals_or_plants", 2, false, true],
  ["magic_jar", 6, false, false],
  ["magnificent_mansion", 7, false, false],
  ["major_image", 3, true, false],
  ["mass_heal", 9, false, false],
  ["mass_healing_word", 3, false, false],
  ["meld_into_stone", 3, false, true],
  ["meteor_swarm", 9, false, false],
  ["phantom_steed", 3, false, true],
  ["planar_ally", 6, false, false],
  ["planar_binding", 5, false, false],
  ["power_word_kill", 9, false, false],
  ["prestidigitation", 0, false, false],
  ["prismatic_wall", 9, false, false],
  ["private_sanctum", 4, false, false],
  ["programmed_illusion", 6, false, false],
  ["protection_from_evil_and_good", 1, true, false],
  ["purify_food_and_drink", 1, false, true],
  ["ray_of_enfeeblement", 2, true, false],
  ["reincarnate", 5, false, false],
  ["sanctuary", 1, false, false],
  ["secret_chest", 4, false, false],
  ["seeming", 5, false, false],
  ["shapechange", 9, true, false],
  ["shatter", 2, false, false],
  ["shield_of_faith", 1, true, false],
  ["shillelagh", 0, false, false],
  ["silent_image", 1, true, false],
  ["speak_with_animals", 1, false, true],
  ["speak_with_plants", 3, false, false],
  ["spike_growth", 2, true, false],
  ["spirit_guardians", 3, true, false],
  ["stinking_cloud", 3, true, false],
  ["stone_shape", 4, false, false],
  ["storm_of_vengeance", 9, true, false],
  ["suggestion", 2, true, false],
  ["telepathic_bond", 5, false, true],
  ["thaumaturgy", 0, false, false],
  ["time_stop", 9, false, false],
  ["tiny_hut", 3, false, true],
  ["transport_via_plants", 6, false, false],
  ["tree_stride", 5, true, false],
  ["true_polymorph", 9, true, false],
  ["true_resurrection", 9, false, false],
  ["true_strike", 0, true, false],
  ["unseen_servant", 1, false, true],
  ["vampiric_touch", 3, true, false],
  ["vicious_mockery", 0, false, false],
  ["wall_of_thorns", 6, true, false],
  ["weird", 9, true, false],
  ["wind_walk", 6, false, false],
  ["wind_wall", 3, true, false],
  ["wish", 9, false, false],
];

function targetingFor(id: string, level: number): RuleTargeting {
  if (
    id.includes("self") ||
    id.includes("shapechange") ||
    id.includes("time_stop") ||
    id.includes("foresight")
  ) {
    return SELF;
  }
  if (
    id.includes("wall") ||
    id.includes("storm") ||
    id.includes("swarm") ||
    id.includes("barrier") ||
    id.includes("sphere")
  ) {
    return { type: "area", shape: "sphere", sizeFt: level >= 6 ? 40 : 20 };
  }
  return { type: "creature", rangeFt: level >= 6 ? 120 : 60 };
}

function durationFor(id: string, concentration: boolean): RuleCatalogEntry["duration"] {
  if (id === "foresight") return { unit: "hour", amount: 8 };
  if (id === "gate") return { unit: "minute", amount: 1 };
  if (id === "shapechange" || id === "true_polymorph") return { unit: "hour", amount: 1 };
  if (id === "astral_projection") return { unit: "permanent", amount: null };
  if (id === "hallow" || id === "forbiddance") return { unit: "day", amount: 1 };
  if (id === "guards_and_wards") return { unit: "hour", amount: 24 };
  if (id === "imprisonment") return { unit: "permanent", amount: null };
  if (id === "wish" || id === "true_resurrection") return { unit: "instant", amount: null };
  return concentration
    ? { unit: "minute", amount: 1 }
    : { unit: "instant", amount: null };
}

function extraRuntimeTagsFor(id: string, level: number, ritual: boolean): string[] {
  const tags: string[] = [];
  if (level === 9) {
    tags.push("p6_final_spell_smoke_candidate");
  }
  if (ritual) {
    tags.push("campaign_time:ritual_casting");
  }
  if (id === "wish") {
    tags.push(
      "wish:mvp_option:replicate_spell_level_8_or_lower",
      "gm_approval_required:non_replication_wish",
      "audit:gm_override_required_for_broad_effect",
      "risk:33_percent_wish_loss_non_replication",
    );
  }
  if (id === "true_resurrection") {
    tags.push(
      "material_cost:diamond:25000gp:consumed",
      "campaign_state:death_resurrection_history",
      "archive:major_reward_or_reversal",
    );
  }
  if (id === "gate" || id === "astral_projection") {
    tags.push("campaign_location:planar_travel", "timeline:location_transition");
  }
  if (id === "foresight") {
    tags.push("condition:foresight", "duration:8_hours", "advantage:attacks_checks_saves");
  }
  if (id === "meteor_swarm") {
    tags.push("area:four_points", "damage:fire", "damage:bludgeoning", "partial_success:half_damage");
  }
  if (id === "shapechange" || id === "true_polymorph") {
    tags.push("form_replacement:stat_block", "concentration_lifecycle:form_reverts");
  }
  if (id === "hallow" || id === "forbiddance" || id === "guards_and_wards") {
    tags.push("campaign_state:warding_effect", "downtime:long_casting");
  }
  return tags;
}

function p6Spell([id, level, concentration, ritual]: P6SpellSeed): RuleCatalogEntry {
  const isReaction = id === "hellish_rebuke";
  const isCantrip = level === 0;

  return {
    id: `spell.${id}`,
    kind: "spell_definitions",
    source: "SRD5E",
    levelRequirement: isCantrip ? { minCharacterLevel: 1 } : {},
    trigger: isReaction ? "reaction" : "action",
    cost: isReaction ? REACTION : ACTION,
    targeting: targetingFor(id, level),
    save: null,
    damage: null,
    duration: durationFor(id, concentration),
    concentration,
    scaling: null,
    runtimeEffect: {
      type: "spell",
      tags: [
        `spell_level:${level}`,
        "p6_content",
        "final_srd_spell_manifest",
        ritual ? "ritual" : "non_ritual",
        concentration ? "concentration" : "no_concentration",
        level === 9 ? "tier:9th_level" : "tier:final_catalog_fill",
        "audit:turn_log_state_diff",
        ...extraRuntimeTagsFor(id, level, ritual),
      ],
      hookId: `hook.spell.p6_${id}`,
    },
  };
}

export const P6_SPELL_DEFINITIONS: RuleCatalogEntry[] =
  P6_SPELL_SEEDS.map(p6Spell);

export const P6_EXECUTABLE_SPELL_IDS = P6_SPELL_DEFINITIONS.map(
  (spell) => spell.id,
);
