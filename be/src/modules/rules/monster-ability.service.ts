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
};

const MONSTER_ACTION_PREFERENCES: Record<string, string[]> = {
  "monster.giant_rat": ["action.bite"],
  "monster.goblin": ["action.scimitar", "action.shortbow", "monster.goblin.ability.nimble_escape"],
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

    if (!monsterId || !attackKind || attackBonus === null) {
      return null;
    }

    return {
      monsterId,
      actionId,
      label: this.createLabel(entry.id),
      attackKind,
      attackBonus,
      damageDice: entry.damage?.dice ?? "",
      damageType: entry.damage?.type ?? null,
      reachFt: this.resolveReachFt(entry),
      rangeFt: this.resolveRangeFt(entry),
      confidence: entry.damage ? "high" : "medium",
      catalogEntryId: entry.id,
      costType: entry.cost.type,
    };
  }

  private resolveAttackKind(entry: RuleCatalogEntry): string | null {
    if (entry.runtimeEffect.tags.includes("attack:melee_weapon")) {
      return "melee_weapon";
    }
    if (entry.runtimeEffect.tags.includes("attack:ranged_weapon")) {
      return "ranged_weapon";
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
