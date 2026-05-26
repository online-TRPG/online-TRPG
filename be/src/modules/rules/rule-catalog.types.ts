export type RuleCatalogKind =
  | "race_traits"
  | "class_features"
  | "subclass_features"
  | "spell_definitions"
  | "condition_definitions"
  | "monster_abilities"
  | "terrain_effects";

export type RuleTrigger =
  | "always"
  | "character_creation"
  | "level_up"
  | "action"
  | "bonus_action"
  | "reaction"
  | "short_rest"
  | "long_rest"
  | "turn_start"
  | "turn_end"
  | "on_hit"
  | "on_damage"
  | "manual";

export type RuleCost =
  | { type: "none" }
  | { type: "action" }
  | { type: "bonus_action" }
  | { type: "reaction" }
  | { type: "resource"; resourceId: string; amount: number };

export type RuleTargeting =
  | { type: "self" }
  | { type: "creature"; rangeFt: number | null }
  | { type: "area"; shape: "sphere" | "cone" | "line" | "cube"; sizeFt: number }
  | { type: "none" };

export type RuleSave = {
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
  dcSource: "spell_save_dc" | "class_feature_dc" | "fixed";
  fixedDc?: number;
} | null;

export type RuleDamage = {
  dice: string;
  type: string;
  scaling?: string | null;
} | null;

export type RuleDuration = {
  unit: "instant" | "round" | "minute" | "hour" | "day" | "until_rest" | "permanent";
  amount: number | null;
} | null;

export type RuleScaling = {
  mode: "none" | "class_level" | "character_level" | "slot_level";
  table?: Record<string, unknown>;
} | null;

export type RuleLevelRequirement = {
  classKey?: string;
  raceKey?: string;
  subclassKey?: string;
  monsterId?: string;
  minCharacterLevel?: number;
  minClassLevel?: number;
};

export type RuleRuntimeEffect = {
  type:
    | "grant_action"
    | "grant_passive"
    | "grant_resource"
    | "modify_stat"
    | "monster_ability"
    | "race_trait"
    | "spell"
    | "spellcasting"
    | "subclass_feature"
    | "condition"
    | "terrain_effect"
    | "resolver_pending";
  tags: string[];
  hookId?: string;
  resourceId?: string;
  value?: unknown;
};

export type RuleCatalogEntry = {
  id: string;
  kind: RuleCatalogKind;
  source: "SRD5E";
  levelRequirement: RuleLevelRequirement;
  trigger: RuleTrigger;
  cost: RuleCost;
  targeting: RuleTargeting;
  save: RuleSave;
  damage: RuleDamage;
  duration: RuleDuration;
  concentration: boolean;
  scaling: RuleScaling;
  runtimeEffect: RuleRuntimeEffect;
};

export type RuleCatalogClassFeatureSnapshot = {
  classKey: string;
  classLevel: number;
  featureIds: string[];
  actionFeatureIds: string[];
  resourceIds: string[];
  passiveTags: string[];
};

export type RuleCatalogCharacterFeatureSnapshot = {
  raceKey: string | null;
  classKey: string;
  subclassKey: string | null;
  classLevel: number;
  featureIds: string[];
  raceTraitIds: string[];
  classFeatureIds: string[];
  subclassFeatureIds: string[];
  customFeatureIds: string[];
};
