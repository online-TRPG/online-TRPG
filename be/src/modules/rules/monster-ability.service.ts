import { Injectable } from "@nestjs/common";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleCatalogEntry } from "./rule-catalog.types";

export type ExecutableMonsterAction = {
  monsterId: string;
  actionId: string;
  label: string;
  attackKind: string;
  attackBonus: number;
  damageDice: string;
  damageType: string | null;
  reachFt: number | null;
  rangeFt: {
    normal: number | null;
    long: number | null;
  } | null;
  confidence: "high" | "medium" | "low" | "none";
  catalogEntryId: string;
  costType: RuleCatalogEntry["cost"]["type"];
  specialType: string | null;
  usage: string | null;
  recharge: string | null;
  save: { ability: string; dcSource: string | null; fixedDc?: number | null } | null;
  conditionRiders: string[];
  effectTags: string[];
};

const MONSTER_ACTION_PREFERENCES: Record<string, string[]> = {
  "monster.giant_rat": ["action.bite"],
  "monster.giant_spider": ["action.web", "action.bite"],
  "monster.goblin": ["action.scimitar", "action.shortbow", "monster.goblin.ability.nimble_escape"],
  "monster.orc": ["action.greataxe", "action.javelin"],
  "monster.wolf": ["action.bite"],
  "monster.skeleton": ["action.shortbow", "action.shortsword"],
  "monster.zombie": ["action.slam"],
  "monster.brown_bear": ["monster.brown_bear.ability.multiattack", "action.claws", "action.bite"],
  "monster.dragon_whelp": ["action.fire_breath", "action.bite"],
  "monster.cultist": ["action.scimitar"],
  "monster.ogre": ["action.greatclub", "action.javelin"],
  "monster.kobold": ["action.dagger", "action.sling"],
  "monster.bandit": ["action.scimitar", "action.light_crossbow"],
  "monster.bugbear": ["action.morningstar", "action.javelin"],
  "monster.hobgoblin": ["action.longsword", "action.longbow"],
  "monster.dire_wolf": ["action.bite"],
  "monster.ghoul": ["action.claws", "action.bite"],
  "monster.wight": ["monster.wight.ability.multiattack", "action.life_drain", "action.longbow"],
  "monster.mimic": ["action.pseudopod", "action.bite"],
  "monster.gelatinous_cube": ["action.engulf", "action.pseudopod"],
  "monster.swarm_of_rats": ["action.bites"],
  "monster.animated_armor": ["monster.animated_armor.ability.multiattack", "action.slam"],
  "monster.gargoyle": ["monster.gargoyle.ability.multiattack", "action.bite", "action.claws"],
  "monster.harpy": ["action.luring_song", "monster.harpy.ability.multiattack"],
  "monster.giant_scorpion": ["monster.giant_scorpion.ability.multiattack", "action.sting", "action.claw"],
  "monster.young_red_dragon": ["action.fire_breath", "monster.young_red_dragon.ability.multiattack"],
  "monster.black_bear": ["monster.black_bear.ability.multiattack"],
  "monster.lion": ["monster.lion.ability.multiattack"],
  "monster.tiger": ["monster.tiger.ability.multiattack"],
  "monster.troll": ["monster.troll.ability.multiattack"],
  "monster.hill_giant": ["action.rock", "action.greatclub"],
  "monster.giant_eagle": ["monster.giant_eagle.ability.multiattack"],
  "monster.giant_owl": ["action.talons"],
  "monster.manticore": ["action.tail_spike", "monster.manticore.ability.multiattack"],
  "monster.griffon": ["monster.griffon.ability.multiattack"],
  "monster.merrow": ["action.harpoon", "monster.merrow.ability.multiattack"],
  "monster.acolyte": ["action.sacred_flame", "action.club"],
  "monster.mage": ["action.fireball", "action.arcane_bolt"],
  "monster.priest": ["action.radiant_bolt", "action.mace"],
  "monster.cult_fanatic": ["action.hold_person", "action.dagger"],
  "monster.mummy": ["action.dreadful_glare", "action.rotting_fist"],
  "monster.specter": ["action.life_drain"],
  "monster.ghost": ["action.horrifying_visage", "action.withering_touch"],
  "monster.stone_golem": ["action.slow", "monster.stone_golem.ability.multiattack"],
  "monster.water_elemental": ["action.whelm", "monster.water_elemental.ability.multiattack"],
  "monster.swarm_of_insects": ["action.bites"],
  "monster.quasit": ["action.scare", "action.claws"],
  "monster.basilisk": ["action.petrifying_gaze", "action.bite"],
  "monster.wyvern": ["monster.wyvern.ability.multiattack"],
  "monster.young_blue_dragon": ["action.lightning_breath", "monster.young_blue_dragon.ability.multiattack"],
};

@Injectable()
export class MonsterAbilityService {
  constructor(private readonly ruleCatalog: RuleCatalogService = new RuleCatalogService()) {}

  listExecutableActions(monsterId: string | null | undefined): ExecutableMonsterAction[] {
    if (!monsterId) {
      return [];
    }

    return this.ruleCatalog
      .listMonsterAbilities(monsterId)
      .map((entry) => this.toExecutableAction(entry))
      .filter((action): action is ExecutableMonsterAction => Boolean(action));
  }

  chooseAction(
    monsterId: string | null | undefined,
    preferredActionId?: string | null,
  ): ExecutableMonsterAction | null {
    const actions = this.listExecutableActions(monsterId);
    if (!actions.length) {
      return null;
    }

    const normalizedPreferred = preferredActionId ? this.normalizeActionId(preferredActionId) : null;
    if (normalizedPreferred) {
      const preferred = actions.find((action) =>
        [action.actionId, action.catalogEntryId].includes(normalizedPreferred),
      );
      if (preferred) {
        return preferred;
      }
    }

    const normalizedMonsterId = actions[0].monsterId;
    for (const actionId of MONSTER_ACTION_PREFERENCES[normalizedMonsterId] ?? []) {
      const normalizedActionId = this.normalizeActionId(actionId);
      const action = actions.find((candidate) =>
        [candidate.actionId, candidate.catalogEntryId].includes(normalizedActionId),
      );
      if (action) {
        return action;
      }
    }

    return actions.find((action) => action.costType === "action") ?? actions[0] ?? null;
  }

  private toExecutableAction(entry: RuleCatalogEntry): ExecutableMonsterAction | null {
    if (entry.kind !== "monster_abilities") {
      return null;
    }

    const attackBonus = this.readSignedIntegerTag(entry.runtimeEffect.tags, "attack_bonus:");
    const actionId = this.readStringTag(entry.runtimeEffect.tags, "srd_action_id:") ?? entry.id;
    const attackKind = this.resolveAttackKind(entry);
    const monsterId = entry.levelRequirement.monsterId ?? null;
    const isLifecyclePassive = entry.runtimeEffect.tags.some(
      (tag) =>
        tag.startsWith("aura:") ||
        tag.startsWith("trigger:on_turn_start") ||
        tag.startsWith("trigger:on_turn_end"),
    );
    const isTaggedSpecial = entry.runtimeEffect.tags.some(
      (tag) =>
        tag.startsWith("multiattack:") ||
        tag.startsWith("legendary_like:") ||
        tag.startsWith("reaction:") ||
        tag.startsWith("spell_list:") ||
        tag.startsWith("teleport:"),
    );
    const isSpecial =
      !attackKind && (entry.cost.type !== "none" || isLifecyclePassive || isTaggedSpecial);

    if (!monsterId || (!attackKind && !isSpecial) || (attackKind && attackBonus === null)) {
      return null;
    }

    return {
      monsterId,
      actionId,
      label: this.createLabel(entry.id),
      attackKind: attackKind ?? "special",
      attackBonus: attackBonus ?? 0,
      damageDice: entry.damage?.dice ?? "",
      damageType: entry.damage?.type ?? null,
      reachFt: this.resolveReachFt(entry),
      rangeFt: this.resolveRangeFt(entry),
      confidence: entry.damage ? "high" : "medium",
      catalogEntryId: entry.id,
      costType: entry.cost.type,
      specialType: this.resolveSpecialType(entry),
      usage: this.readStringTag(entry.runtimeEffect.tags, "usage:"),
      recharge: this.readStringTag(entry.runtimeEffect.tags, "recharge:"),
      save: entry.save
        ? { ability: entry.save.ability, dcSource: entry.save.dcSource ?? null, fixedDc: entry.save.fixedDc ?? null }
        : null,
      conditionRiders: this.readPrefixedTags(entry.runtimeEffect.tags, "condition:")
        .map((conditionId) =>
          conditionId.startsWith("condition.") ? conditionId : `condition.${conditionId}`,
        ),
      effectTags: this.resolveEffectTags(entry),
    };
  }

  private resolveAttackKind(entry: RuleCatalogEntry): string | null {
    if (entry.runtimeEffect.tags.includes("attack:melee_weapon")) {
      return "melee_weapon";
    }
    if (entry.runtimeEffect.tags.includes("attack:ranged_weapon")) {
      return "ranged_weapon";
    }
    if (entry.runtimeEffect.tags.includes("attack:melee_or_ranged_weapon")) {
      return entry.targeting.type === "creature" && (entry.targeting.rangeFt ?? 0) > 5
        ? "ranged_weapon"
        : "melee_weapon";
    }
    return null;
  }

  private resolveReachFt(entry: RuleCatalogEntry): number | null {
    return entry.targeting.type === "creature" && this.resolveAttackKind(entry) === "melee_weapon"
      ? entry.targeting.rangeFt
      : null;
  }

  private resolveRangeFt(entry: RuleCatalogEntry): ExecutableMonsterAction["rangeFt"] {
    if (entry.targeting.type !== "creature" || this.resolveAttackKind(entry) !== "ranged_weapon") {
      return null;
    }

    return {
      normal: entry.targeting.rangeFt,
      long: this.readPositiveIntegerTag(entry.runtimeEffect.tags, "range_long:"),
    };
  }

  private resolveSpecialType(entry: RuleCatalogEntry): string | null {
    if (entry.runtimeEffect.tags.some((tag) => tag.startsWith("mobility:"))) {
      return "mobility";
    }
    if (
      entry.targeting.type === "area" &&
      entry.save &&
      !entry.damage &&
      entry.runtimeEffect.tags.some((tag) => tag.startsWith("condition:"))
    ) {
      return "area_control";
    }
    if (entry.runtimeEffect.tags.some((tag) => tag.startsWith("aura:"))) {
      return "aura";
    }
    if (entry.runtimeEffect.tags.some((tag) => tag.startsWith("multiattack:"))) {
      return "multiattack";
    }
    if (
      entry.targeting.type === "area" &&
      entry.damage &&
      entry.save
    ) {
      return "area_attack";
    }
    return null;
  }

  private resolveEffectTags(entry: RuleCatalogEntry): string[] {
    return [
      ...(entry.targeting.type === "area"
        ? [`area_size:${entry.targeting.sizeFt}`]
        : []),
      ...this.readPrefixedTags(entry.runtimeEffect.tags, "option:"),
      ...this.readPrefixedTags(entry.runtimeEffect.tags, "effect:"),
      ...entry.runtimeEffect.tags.filter(
        (tag) =>
          tag.startsWith("area:") ||
          tag === "half_damage_on_success" ||
          tag === "legendary_or_lair_candidate" ||
          tag.startsWith("aura:") ||
          tag.startsWith("legendary_like:") ||
          tag.startsWith("lair:") ||
          tag.startsWith("phase:") ||
          tag.startsWith("terrain:") ||
          tag.startsWith("trigger:"),
      ),
      ...entry.runtimeEffect.tags.filter((tag) => tag.startsWith("multiattack:")),
    ];
  }

  private readPrefixedTags(tags: string[], prefix: string): string[] {
    return tags
      .filter((tag) => tag.startsWith(prefix))
      .map((tag) => tag.slice(prefix.length))
      .filter(Boolean);
  }

  private readStringTag(tags: string[], prefix: string): string | null {
    return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? null;
  }

  private readSignedIntegerTag(tags: string[], prefix: string): number | null {
    const value = Number(this.readStringTag(tags, prefix));
    return Number.isInteger(value) ? value : null;
  }

  private readPositiveIntegerTag(tags: string[], prefix: string): number | null {
    const value = this.readSignedIntegerTag(tags, prefix);
    return value !== null && value > 0 ? value : null;
  }

  private createLabel(entryId: string): string {
    const segments = entryId.split(".");
    const name = segments[segments.length - 1] ?? entryId;
    return name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private normalizeActionId(value: string): string {
    return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
}
