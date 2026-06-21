import { Injectable } from "@nestjs/common";
import { ConditionRuntimeService } from "./condition-runtime.service";

export type RestType = "short" | "long";

export type RestResourceState = {
  secondWindAvailable?: boolean;
  actionSurgeUses?: number;
  rageUses?: number;
  rageActive?: boolean;
  frenzyActive?: boolean;
  exhaustionLevel?: number;
  hitDiceSpent?: number;
};

export type RestResolutionInput = {
  restType: RestType;
  currentHp: number;
  maxHp: number;
  tempHp?: number | null;
  conditions?: unknown[];
  resource?: RestResourceState | null;
  resourceMaximums?: {
    secondWindAvailable?: boolean;
    actionSurgeUses?: number;
    rageUses?: number;
  };
  hitDiceToSpend?: number;
  totalHitDice?: number;
  hitDiceSpent?: number;
  hitDieAverage?: number;
  constitutionModifier?: number;
  spellSlots?: Record<string, number>;
  spellSlotMaximums?: Record<string, number>;
  inCombat?: boolean;
};

export type RestResolution = {
  restType: RestType;
  accepted: boolean;
  rejectedReason: "combat_active" | null;
  hp: {
    currentHp: number;
    maxHp: number;
    tempHp: number;
  };
  conditions: unknown[];
  resource: {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
    rageActive: boolean;
    frenzyActive: boolean;
    exhaustionLevel: number;
    hitDiceSpent: number;
  };
  spellSlots: Record<string, number>;
  recoveredTags: string[];
};

@Injectable()
export class RestResolutionService {
  constructor(
    private readonly conditionRuntime: ConditionRuntimeService = new ConditionRuntimeService(),
  ) {}

  resolveRest(input: RestResolutionInput): RestResolution {
    this.assertHp(input.currentHp, "currentHp");
    this.assertHp(input.maxHp, "maxHp");
    if (input.maxHp < 1) {
      throw new Error("maxHp must be at least 1.");
    }

    const baseResource = this.normalizeResource(input.resource);
    if (input.inCombat) {
      return {
        restType: input.restType,
        accepted: false,
        rejectedReason: "combat_active",
        hp: {
          currentHp: input.currentHp,
          maxHp: input.maxHp,
          tempHp: input.tempHp ?? 0,
        },
        conditions: input.conditions ?? [],
        resource: baseResource,
        spellSlots: { ...(input.spellSlots ?? {}) },
        recoveredTags: [],
      };
    }

    return input.restType === "short"
      ? this.resolveShortRest(input, baseResource)
      : this.resolveLongRest(input, baseResource);
  }

  private resolveShortRest(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): RestResolution {
    const hitDice = this.resolveShortRestHitDice(input, resource);
    const recoveredResource = {
      ...resource,
      secondWindAvailable: input.resourceMaximums?.secondWindAvailable ?? resource.secondWindAvailable,
      actionSurgeUses: input.resourceMaximums?.actionSurgeUses ?? resource.actionSurgeUses,
      hitDiceSpent: hitDice.hitDiceSpent,
    };
    const recoveredTags = [
      ...(recoveredResource.secondWindAvailable ? ["resource:second_wind_expended"] : []),
      ...(recoveredResource.actionSurgeUses > 0
        ? ["resource:action_surge_expended", "action_surge:additional_action_granted"]
        : []),
      ...(hitDice.spent > 0 ? [`hit_dice:spent:${hitDice.spent}`] : []),
      ...(this.hasConditionPrefix(input.conditions, "resource:ki_spent:")
        ? ["resource:ki_spent"]
        : []),
      ...(this.hasConditionTag(input.conditions, "resource:channel_divinity_expended")
        ? ["resource:channel_divinity_expended"]
        : []),
      ...(this.hasConditionPrefix(input.conditions, "resource:wild_shape_spent:")
        ? ["resource:wild_shape_spent"]
        : []),
    ];

    return {
      restType: "short",
      accepted: true,
      rejectedReason: null,
      hp: {
        currentHp: hitDice.currentHp,
        maxHp: input.maxHp,
        tempHp: input.tempHp ?? 0,
      },
      conditions: this.removeRecoveredConditions(input.conditions ?? [], "short", recoveredTags),
      resource: recoveredResource,
      spellSlots: { ...(input.spellSlots ?? {}) },
      recoveredTags,
    };
  }

  private resolveLongRest(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): RestResolution {
    const hitDice = this.resolveLongRestHitDice(input, resource);
    const recoveredResource = {
      ...resource,
      secondWindAvailable: input.resourceMaximums?.secondWindAvailable ?? resource.secondWindAvailable,
      actionSurgeUses: input.resourceMaximums?.actionSurgeUses ?? resource.actionSurgeUses,
      rageUses: input.resourceMaximums?.rageUses ?? resource.rageUses,
      rageActive: false,
      frenzyActive: false,
      exhaustionLevel: Math.max(resource.exhaustionLevel - 1, 0),
      hitDiceSpent: hitDice.hitDiceSpent,
    };
    const recoveredTags = [
      ...(recoveredResource.secondWindAvailable ? ["resource:second_wind_expended"] : []),
      ...(recoveredResource.actionSurgeUses > 0
        ? ["resource:action_surge_expended", "action_surge:additional_action_granted"]
        : []),
      ...(recoveredResource.rageUses > 0
        ? [
            "resource:rage_expended",
            "rage",
            "frenzy",
            "resistance:bludgeoning",
            "resistance:piercing",
            "resistance:slashing",
          ]
        : []),
      "spell_slots:all",
      ...(this.hasConditionTag(input.conditions, "resource:divine_sense_expended")
        ? ["resource:divine_sense_expended"]
        : []),
      ...(this.hasConditionTag(input.conditions, "resource:lay_on_hands_expended")
        ? ["resource:lay_on_hands_expended"]
        : []),
      ...(this.hasConditionTag(input.conditions, "sense:divine:60")
        ? ["sense:divine:60"]
        : []),
      ...(this.hasConditionPrefix(input.conditions, "resource:ki_spent:")
        ? ["resource:ki_spent"]
        : []),
      ...(this.hasConditionTag(input.conditions, "resource:channel_divinity_expended")
        ? ["resource:channel_divinity_expended"]
        : []),
      ...(this.hasConditionTag(input.conditions, "resource:arcane_recovery_expended")
        ? ["resource:arcane_recovery_expended"]
        : []),
      ...(this.hasConditionTag(input.conditions, "resource:natural_recovery_expended")
        ? ["resource:natural_recovery_expended"]
        : []),
      ...(this.hasConditionPrefix(
        input.conditions,
        "resource:bardic_inspiration_spent:",
      )
        ? ["resource:bardic_inspiration_spent"]
        : []),
      ...(this.hasConditionTag(input.conditions, "bardic_inspiration:1d6")
        ? ["bardic_inspiration:1d6"]
        : []),
      ...(this.hasConditionPrefix(
        input.conditions,
        "resource:sorcery_points_spent:",
      )
        ? ["resource:sorcery_points_spent"]
        : []),
      ...(this.hasConditionPrefix(input.conditions, "resource:wild_shape_spent:")
        ? ["resource:wild_shape_spent"]
        : []),
      ...(this.hasConditionTag(input.conditions, "wild_shape:wolf")
        ? ["wild_shape:wolf", "movement_speed_override:40"]
        : []),
      ...(hitDice.recovered > 0 ? [`hit_dice:recovered:${hitDice.recovered}`] : []),
    ];

    return {
      restType: "long",
      accepted: true,
      rejectedReason: null,
      hp: {
        currentHp: input.maxHp,
        maxHp: input.maxHp,
        tempHp: 0,
      },
      conditions: this.removeRecoveredConditions(input.conditions ?? [], "long", recoveredTags),
      resource: recoveredResource,
      spellSlots: { ...(input.spellSlotMaximums ?? input.spellSlots ?? {}) },
      recoveredTags,
    };
  }

  private normalizeResource(resource: RestResourceState | null | undefined): RestResolution["resource"] {
    return {
      secondWindAvailable: resource?.secondWindAvailable ?? false,
      actionSurgeUses: this.nonNegativeInteger(resource?.actionSurgeUses ?? 0, "actionSurgeUses"),
      rageUses: this.nonNegativeInteger(resource?.rageUses ?? 0, "rageUses"),
      rageActive: resource?.rageActive ?? false,
      frenzyActive: resource?.frenzyActive ?? false,
      exhaustionLevel: this.nonNegativeInteger(resource?.exhaustionLevel ?? 0, "exhaustionLevel"),
      hitDiceSpent: this.nonNegativeInteger(resource?.hitDiceSpent ?? 0, "hitDiceSpent"),
    };
  }

  private resolveShortRestHitDice(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): { currentHp: number; hitDiceSpent: number; spent: number } {
    const requestedSpend = this.nonNegativeInteger(input.hitDiceToSpend ?? 0, "hitDiceToSpend");
    const totalHitDice = this.nonNegativeInteger(input.totalHitDice ?? 0, "totalHitDice");
    const currentHitDiceSpent = this.nonNegativeInteger(
      input.hitDiceSpent ?? resource.hitDiceSpent,
      "hitDiceSpent",
    );
    const availableHitDice = Math.max(totalHitDice - currentHitDiceSpent, 0);
    const missingHp = Math.max(input.maxHp - input.currentHp, 0);
    const hitDiceToSpend = Math.min(requestedSpend, availableHitDice);

    if (hitDiceToSpend < 1 || missingHp < 1) {
      return {
        currentHp: input.currentHp,
        hitDiceSpent: currentHitDiceSpent,
        spent: 0,
      };
    }

    const hitDieAverage = this.nonNegativeInteger(input.hitDieAverage ?? 0, "hitDieAverage");
    const constitutionModifier = input.constitutionModifier ?? 0;
    if (!Number.isInteger(constitutionModifier)) {
      throw new Error("constitutionModifier must be an integer.");
    }
    const healingPerDie = Math.max(hitDieAverage + constitutionModifier, 1);
    const healedHp = Math.min(hitDiceToSpend * healingPerDie, missingHp);

    return {
      currentHp: input.currentHp + healedHp,
      hitDiceSpent: currentHitDiceSpent + hitDiceToSpend,
      spent: hitDiceToSpend,
    };
  }

  private resolveLongRestHitDice(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): { hitDiceSpent: number; recovered: number } {
    const totalHitDice = this.nonNegativeInteger(input.totalHitDice ?? 0, "totalHitDice");
    const currentHitDiceSpent = this.nonNegativeInteger(
      input.hitDiceSpent ?? resource.hitDiceSpent,
      "hitDiceSpent",
    );
    if (totalHitDice < 1 || currentHitDiceSpent < 1) {
      return { hitDiceSpent: currentHitDiceSpent, recovered: 0 };
    }

    const recovered = Math.min(currentHitDiceSpent, Math.max(Math.floor(totalHitDice / 2), 1));
    return {
      hitDiceSpent: currentHitDiceSpent - recovered,
      recovered,
    };
  }

  private removeRecoveredConditions(
    conditions: unknown[],
    restType: RestType,
    recoveredTags: string[],
  ): unknown[] {
    const recovered = new Set(recoveredTags);
    return conditions.filter((condition) => {
      if (typeof condition === "string") {
        if (
          recovered.has("resource:ki_spent") &&
          condition.startsWith("resource:ki_spent:")
        ) {
          return false;
        }
        if (
          recovered.has("resource:bardic_inspiration_spent") &&
          condition.startsWith("resource:bardic_inspiration_spent:")
        ) {
          return false;
        }
        if (
          recovered.has("resource:sorcery_points_spent") &&
          condition.startsWith("resource:sorcery_points_spent:")
        ) {
          return false;
        }
        if (
          recovered.has("resource:wild_shape_spent") &&
          condition.startsWith("resource:wild_shape_spent:")
        ) {
          return false;
        }
        return !recovered.has(condition);
      }
      if (!condition || typeof condition !== "object") {
        return true;
      }
      const record = condition as Record<string, unknown>;
      const parsed = this.conditionRuntime.parseConditionsJson(JSON.stringify([record]))[0];
      if (
        parsed &&
        this.conditionRuntime.resolveRestEnd([parsed], restType).expiredConditions.length > 0
      ) {
        return false;
      }
      const tags = Array.isArray(record.tags) ? record.tags : [];
      return tags.some((tag) => typeof tag === "string" && recovered.has(tag))
        ? false
        : !recovered.has(String(record.conditionId ?? ""));
    });
  }

  private assertHp(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }

  private hasConditionTag(
    conditions: unknown[] | undefined,
    expected: string,
  ): boolean {
    return (conditions ?? []).some((condition) => {
      if (typeof condition === "string") {
        return condition === expected;
      }
      if (!condition || typeof condition !== "object") {
        return false;
      }
      const record = condition as Record<string, unknown>;
      return (
        record.conditionId === expected ||
        (Array.isArray(record.tags) && record.tags.includes(expected))
      );
    });
  }

  private hasConditionPrefix(
    conditions: unknown[] | undefined,
    prefix: string,
  ): boolean {
    return (conditions ?? []).some((condition) => {
      if (typeof condition === "string") {
        return condition.startsWith(prefix);
      }
      if (!condition || typeof condition !== "object") {
        return false;
      }
      const record = condition as Record<string, unknown>;
      return (
        (typeof record.conditionId === "string" &&
          record.conditionId.startsWith(prefix)) ||
        (Array.isArray(record.tags) &&
          record.tags.some(
            (tag) => typeof tag === "string" && tag.startsWith(prefix),
          ))
      );
    });
  }

  private nonNegativeInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
    return value;
  }
}
