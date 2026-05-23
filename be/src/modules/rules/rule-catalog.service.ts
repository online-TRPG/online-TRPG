import { Injectable } from "@nestjs/common";
import {
  RuleCatalogClassFeatureSnapshot,
  RuleCatalogEntry,
  RuleCost,
  RuleRuntimeEffect,
  RuleTargeting,
} from "./rule-catalog.types";

type ClassFeatureSeed = {
  id: string;
  classKey: string;
  level: number;
  trigger?: RuleCatalogEntry["trigger"];
  cost?: RuleCost;
  targeting?: RuleTargeting;
  runtimeEffect: RuleRuntimeEffect;
};

const NO_COST: RuleCost = { type: "none" };
const NO_TARGETING: RuleTargeting = { type: "none" };
const SELF_TARGETING: RuleTargeting = { type: "self" };

const PENDING_CLASS_FEATURES: ClassFeatureSeed[] = [
  classFeature("barbarian", 1, "rage", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:rage", "rest:long"],
    resourceId: "resource.barbarian.rage",
  }, { type: "bonus_action" }, SELF_TARGETING),
  classFeature("barbarian", 1, "unarmored_defense", {
    type: "modify_stat",
    tags: ["armor_class:unarmored_dex_con"],
  }),
  classFeature("barbarian", 2, "reckless_attack", {
    type: "grant_action",
    tags: ["trigger:first_attack", "advantage:self_attack", "advantage:incoming_attack"],
  }),
  classFeature("barbarian", 2, "danger_sense", {
    type: "grant_passive",
    tags: ["advantage:dex_save_visible_danger"],
  }),
  classFeature("barbarian", 3, "primal_path", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("bard", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("bard", 1, "bardic_inspiration", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:bardic_inspiration"],
    resourceId: "resource.bard.bardic_inspiration",
  }, { type: "bonus_action" }, { type: "creature", rangeFt: 60 }),
  classFeature("bard", 2, "jack_of_all_trades", {
    type: "grant_passive",
    tags: ["skill:half_proficiency_untrained"],
  }),
  classFeature("bard", 2, "song_of_rest", {
    type: "grant_passive",
    tags: ["rest:short", "healing_bonus:1d6"],
  }),
  classFeature("bard", 3, "expertise", {
    type: "resolver_pending",
    tags: ["skill:expertise", "selection:two_skills"],
  }),
  classFeature("bard", 3, "bard_college", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("cleric", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:divine"],
  }),
  classFeature("cleric", 1, "divine_domain", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("cleric", 2, "channel_divinity", {
    type: "grant_resource",
    tags: ["action:standard", "resource:channel_divinity"],
    resourceId: "resource.cleric.channel_divinity",
  }, { type: "action" }, SELF_TARGETING),

  classFeature("druid", 1, "druidic", {
    type: "grant_passive",
    tags: ["language:druidic"],
  }),
  classFeature("druid", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:primal"],
  }),
  classFeature("druid", 2, "wild_shape", {
    type: "grant_resource",
    tags: ["action:standard", "resource:wild_shape"],
    resourceId: "resource.druid.wild_shape",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("druid", 2, "druid_circle", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("fighter", 1, "fighting_style", {
    type: "resolver_pending",
    tags: ["selection:fighting_style"],
  }),
  classFeature("fighter", 1, "second_wind", {
    type: "grant_resource",
    tags: ["action:bonus", "resource:second_wind", "rest:short"],
    resourceId: "resource.fighter.second_wind",
  }, { type: "bonus_action" }, SELF_TARGETING),
  classFeature("fighter", 2, "action_surge", {
    type: "grant_resource",
    tags: ["action:free", "resource:action_surge", "rest:short"],
    resourceId: "resource.fighter.action_surge",
  }),
  classFeature("fighter", 3, "martial_archetype", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("monk", 1, "unarmored_defense", {
    type: "modify_stat",
    tags: ["armor_class:unarmored_dex_wis"],
  }),
  classFeature("monk", 1, "martial_arts", {
    type: "grant_passive",
    tags: ["unarmed:martial_arts_die", "action:bonus_unarmed_after_attack"],
  }),
  classFeature("monk", 2, "ki", {
    type: "grant_resource",
    tags: ["resource:ki", "action:bonus"],
    resourceId: "resource.monk.ki",
  }, { type: "resource", resourceId: "resource.monk.ki", amount: 1 }, SELF_TARGETING),
  classFeature("monk", 2, "unarmored_movement", {
    type: "modify_stat",
    tags: ["speed_bonus:unarmored"],
  }),
  classFeature("monk", 3, "monastic_tradition", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("monk", 3, "deflect_missiles", {
    type: "grant_action",
    tags: ["action:reaction", "damage_reduction:ranged_weapon"],
  }, { type: "reaction" }, SELF_TARGETING),

  classFeature("paladin", 1, "divine_sense", {
    type: "grant_resource",
    tags: ["action:standard", "resource:divine_sense"],
    resourceId: "resource.paladin.divine_sense",
  }, { type: "action" }, SELF_TARGETING),
  classFeature("paladin", 1, "lay_on_hands", {
    type: "grant_resource",
    tags: ["action:standard", "resource:lay_on_hands"],
    resourceId: "resource.paladin.lay_on_hands",
  }, { type: "action" }, { type: "creature", rangeFt: 5 }),
  classFeature("paladin", 2, "fighting_style", {
    type: "resolver_pending",
    tags: ["selection:fighting_style"],
  }),
  classFeature("paladin", 2, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:half", "spellcasting:prepared", "spellcasting:divine"],
  }),
  classFeature("paladin", 2, "divine_smite", {
    type: "grant_action",
    tags: ["trigger:on_melee_hit", "resource:spell_slot", "damage:radiant"],
  }, { type: "resource", resourceId: "resource.spell_slot", amount: 1 }, { type: "creature", rangeFt: 5 }, "on_hit"),
  classFeature("paladin", 3, "divine_health", {
    type: "grant_passive",
    tags: ["immunity:disease"],
  }),
  classFeature("paladin", 3, "sacred_oath", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),

  classFeature("sorcerer", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("sorcerer", 1, "sorcerous_origin", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("sorcerer", 2, "font_of_magic", {
    type: "grant_resource",
    tags: ["resource:sorcery_points"],
    resourceId: "resource.sorcerer.sorcery_points",
  }),
  classFeature("sorcerer", 3, "metamagic", {
    type: "resolver_pending",
    tags: ["selection:metamagic"],
  }),

  classFeature("warlock", 1, "otherworldly_patron", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
  classFeature("warlock", 1, "pact_magic", {
    type: "spellcasting",
    tags: ["spellcasting:pact", "spellcasting:known", "spellcasting:arcane"],
  }),
  classFeature("warlock", 2, "eldritch_invocations", {
    type: "resolver_pending",
    tags: ["selection:eldritch_invocations"],
  }),
  classFeature("warlock", 3, "pact_boon", {
    type: "resolver_pending",
    tags: ["selection:pact_boon"],
  }),

  classFeature("wizard", 1, "spellcasting", {
    type: "spellcasting",
    tags: ["spellcasting:full", "spellcasting:prepared", "spellcasting:arcane", "spellbook"],
  }),
  classFeature("wizard", 1, "arcane_recovery", {
    type: "grant_resource",
    tags: ["rest:short", "resource:arcane_recovery"],
    resourceId: "resource.wizard.arcane_recovery",
  }),
  classFeature("wizard", 2, "arcane_tradition", {
    type: "resolver_pending",
    tags: ["subclass:choice_required"],
  }),
];

const CONDITION_DEFINITIONS: RuleCatalogEntry[] = [
  condition("condition.prone", ["condition:prone", "movement:stand_cost_half_speed"]),
  condition("condition.poisoned", ["condition:poisoned", "disadvantage:attack_roll", "disadvantage:ability_check"]),
  condition("condition.restrained", ["condition:restrained", "speed:zero", "advantage:incoming_attack"]),
  condition("condition.frightened", ["condition:fear", "disadvantage:while_source_visible"]),
  condition("condition.paralyzed", ["condition:paralyzed", "incapacitated", "auto_crit:adjacent_hit"]),
  condition("condition.incapacitated", ["condition:incapacitated", "action_blocked", "reaction_blocked"]),
  condition("condition.burning", ["condition:burning", "damage_over_time:fire"]),
  condition("condition.stunned", ["condition:stunned", "incapacitated", "movement_blocked"]),
];

const TERRAIN_EFFECT_DEFINITIONS: RuleCatalogEntry[] = [
  terrainEffect("terrain.difficult", ["movement:difficult_terrain"]),
  terrainEffect("terrain.hazardous", ["trigger:on_enter", "damage:hazard"]),
  terrainEffect("terrain.obscurement", ["vision:obscured"]),
  terrainEffect("terrain.elevation", ["position:elevated"]),
  terrainEffect("terrain.slippery", ["trigger:on_enter", "save:dex", "condition:prone"]),
  terrainEffect("terrain.burning", ["trigger:on_enter", "damage:fire", "condition:burning"]),
  terrainEffect("terrain.poison_cloud", ["trigger:on_enter", "save:con", "damage:poison", "condition:poisoned"]),
];

const SPELL_DEFINITIONS: RuleCatalogEntry[] = [
  spell("spell.chill_touch", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "1d8", type: "necrotic", scaling: "character_level" },
    duration: { unit: "round", amount: 1 },
    tags: ["spell_attack:ranged", "damage:necrotic", "effect:healing_block", "effect:undead_disadvantage"],
    hookId: "hook.spell.cast_chill_touch",
    scaling: { mode: "character_level", table: { 5: "2d8", 11: "3d8", 17: "4d8" } },
  }),
  spell("spell.fire_bolt", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "1d10", type: "fire", scaling: "character_level" },
    duration: { unit: "instant", amount: null },
    tags: ["spell_attack:ranged", "damage:fire"],
    hookId: "hook.spell.cast_fire_bolt",
    scaling: { mode: "character_level", table: { 5: "2d10", 11: "3d10", 17: "4d10" } },
  }),
  spell("spell.light", {
    level: 0,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 5 },
    duration: { unit: "hour", amount: 1 },
    tags: ["effect:bright_light", "utility:illumination"],
    hookId: "hook.spell.cast_light",
  }),
  spell("spell.magic_missile", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "creature", rangeFt: 120 },
    damage: { dice: "3d4+3", type: "force", scaling: "slot_level" },
    duration: { unit: "instant", amount: null },
    tags: ["damage:force", "hit:auto", "missile_count:3"],
    hookId: "hook.spell.cast_magic_missile",
    scaling: { mode: "slot_level", table: { mode: "target_count", count: 1, perSlotAbove: 1 } },
  }),
  spell("spell.shield", {
    level: 1,
    cost: { type: "reaction" },
    targeting: SELF_TARGETING,
    duration: { unit: "round", amount: 1 },
    tags: ["reaction:on_hit", "armor_class:+5", "immunity:magic_missile"],
    hookId: "hook.spell.cast_shield",
  }),
  spell("spell.sleep", {
    level: 1,
    cost: { type: "action" },
    targeting: { type: "area", shape: "sphere", sizeFt: 20 },
    duration: { unit: "minute", amount: 1 },
    tags: ["hit_point_pool:5d8", "condition:unconscious", "area:sphere"],
    hookId: "hook.spell.cast_sleep",
    scaling: { mode: "slot_level", table: { mode: "damage_dice", dice: "2d8", perSlotAbove: 1 } },
  }),
];

@Injectable()
export class RuleCatalogService {
  private readonly entries = new Map<string, RuleCatalogEntry>();

  constructor() {
    for (const entry of [
      ...PENDING_CLASS_FEATURES.map(toClassFeatureEntry),
      ...CONDITION_DEFINITIONS,
      ...TERRAIN_EFFECT_DEFINITIONS,
      ...SPELL_DEFINITIONS,
    ]) {
      if (this.entries.has(entry.id)) {
        throw new Error(`Duplicate rule catalog id: ${entry.id}`);
      }
      this.entries.set(entry.id, entry);
    }
  }

  listEntries(kind?: RuleCatalogEntry["kind"]): RuleCatalogEntry[] {
    return Array.from(this.entries.values()).filter((entry) => !kind || entry.kind === kind);
  }

  getEntry(id: string): RuleCatalogEntry | null {
    return this.entries.get(id) ?? null;
  }

  getClassFeatureSnapshot(classKey: string, classLevel: number): RuleCatalogClassFeatureSnapshot {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const normalizedLevel = Math.max(Math.floor(classLevel), 0);
    const features = this.listClassFeaturesForLevel(normalizedClassKey, normalizedLevel);

    return {
      classKey: normalizedClassKey,
      classLevel: normalizedLevel,
      featureIds: features.map((feature) => feature.id),
      actionFeatureIds: features
        .filter((feature) =>
          this.isActionTrigger(feature.trigger) ||
          this.isActionCost(feature.cost),
        )
        .map((feature) => feature.id),
      resourceIds: Array.from(
        new Set(
          features
            .map((feature) => feature.runtimeEffect.resourceId)
            .filter((resourceId): resourceId is string => Boolean(resourceId)),
        ),
      ),
      passiveTags: Array.from(
        new Set(
          features
            .filter((feature) => feature.runtimeEffect.type === "grant_passive" || feature.cost.type === "none")
            .flatMap((feature) => feature.runtimeEffect.tags),
        ),
      ),
    };
  }

  listClassFeaturesForLevel(classKey: string, classLevel: number): RuleCatalogEntry[] {
    const normalizedClassKey = this.normalizeClassKey(classKey);
    const normalizedLevel = Math.max(Math.floor(classLevel), 0);

    return this.listEntries("class_features")
      .filter((entry) => entry.levelRequirement.classKey === normalizedClassKey)
      .filter((entry) => (entry.levelRequirement.minClassLevel ?? 1) <= normalizedLevel)
      .sort((left, right) => {
        const levelDelta = (left.levelRequirement.minClassLevel ?? 1) - (right.levelRequirement.minClassLevel ?? 1);
        return levelDelta || left.id.localeCompare(right.id);
      });
  }

  private normalizeClassKey(classKey: string): string {
    const normalized = classKey.trim().toLowerCase().replace(/_/g, "-");
    if (!normalized) {
      throw new Error("classKey must not be empty.");
    }
    return normalized;
  }

  private isActionTrigger(trigger: RuleCatalogEntry["trigger"]): boolean {
    return trigger === "action" || trigger === "bonus_action" || trigger === "reaction";
  }

  private isActionCost(cost: RuleCost): boolean {
    return cost.type === "action" || cost.type === "bonus_action" || cost.type === "reaction";
  }
}

function classFeature(
  classKey: string,
  level: number,
  featureKey: string,
  runtimeEffect: RuleRuntimeEffect,
  cost: RuleCost = NO_COST,
  targeting: RuleTargeting = NO_TARGETING,
  trigger?: RuleCatalogEntry["trigger"],
): ClassFeatureSeed {
  return {
    id: `class.${classKey}.feature.${featureKey}`,
    classKey,
    level,
    trigger: trigger ?? triggerFromCost(cost),
    cost,
    targeting,
    runtimeEffect,
  };
}

function toClassFeatureEntry(seed: ClassFeatureSeed): RuleCatalogEntry {
  return {
    id: seed.id,
    kind: "class_features",
    source: "SRD5E",
    levelRequirement: {
      classKey: seed.classKey,
      minClassLevel: seed.level,
    },
    trigger: seed.trigger ?? "always",
    cost: seed.cost ?? NO_COST,
    targeting: seed.targeting ?? NO_TARGETING,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: seed.runtimeEffect,
  };
}

function condition(id: string, tags: string[]): RuleCatalogEntry {
  return {
    id,
    kind: "condition_definitions",
    source: "SRD5E",
    levelRequirement: {},
    trigger: "always",
    cost: NO_COST,
    targeting: SELF_TARGETING,
    save: null,
    damage: null,
    duration: { unit: "permanent", amount: null },
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "condition",
      tags,
    },
  };
}

function terrainEffect(id: string, tags: string[]): RuleCatalogEntry {
  return {
    id,
    kind: "terrain_effects",
    source: "SRD5E",
    levelRequirement: {},
    trigger: "always",
    cost: NO_COST,
    targeting: NO_TARGETING,
    save: null,
    damage: null,
    duration: null,
    concentration: false,
    scaling: null,
    runtimeEffect: {
      type: "terrain_effect",
      tags,
    },
  };
}

function spell(
  id: string,
  options: {
    level: number;
    cost: RuleCost;
    targeting: RuleTargeting;
    damage?: RuleCatalogEntry["damage"];
    duration?: RuleCatalogEntry["duration"];
    concentration?: boolean;
    save?: RuleCatalogEntry["save"];
    tags: string[];
    hookId: string;
    scaling?: RuleCatalogEntry["scaling"];
  },
): RuleCatalogEntry {
  return {
    id,
    kind: "spell_definitions",
    source: "SRD5E",
    levelRequirement: options.level === 0 ? { minCharacterLevel: 1 } : {},
    trigger: triggerFromCost(options.cost),
    cost: options.cost,
    targeting: options.targeting,
    save: options.save ?? null,
    damage: options.damage ?? null,
    duration: options.duration ?? null,
    concentration: options.concentration ?? false,
    scaling: options.scaling ?? null,
    runtimeEffect: {
      type: "spell",
      tags: [`spell_level:${options.level}`, ...options.tags],
      hookId: options.hookId,
    },
  };
}

function triggerFromCost(cost: RuleCost): RuleCatalogEntry["trigger"] {
  if (cost.type === "action") {
    return "action";
  }
  if (cost.type === "bonus_action") {
    return "bonus_action";
  }
  if (cost.type === "reaction") {
    return "reaction";
  }
  return "always";
}
