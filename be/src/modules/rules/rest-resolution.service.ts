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

const SHORT_REST_RECOVERED_TAGS = [
  "resource:second_wind_expended",
  "resource:action_surge_expended",
  "action_surge:additional_action_granted",
];

const LONG_REST_RECOVERED_TAGS = [
  ...SHORT_REST_RECOVERED_TAGS,
  "resource:rage_expended",
  "rage",
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];

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
    return {
      restType: "short",
      accepted: true,
      rejectedReason: null,
      hp: {
        currentHp: hitDice.currentHp,
        maxHp: input.maxHp,
        tempHp: input.tempHp ?? 0,
      },
      conditions: this.removeRecoveredConditions(input.conditions ?? [], "short", SHORT_REST_RECOVERED_TAGS),
      resource: {
        ...resource,
        secondWindAvailable: true,
        actionSurgeUses: input.resourceMaximums?.actionSurgeUses ?? resource.actionSurgeUses,
        hitDiceSpent: hitDice.hitDiceSpent,
      },
      spellSlots: { ...(input.spellSlots ?? {}) },
      recoveredTags: [
        ...SHORT_REST_RECOVERED_TAGS,
        ...(hitDice.spent > 0 ? [`hit_dice:spent:${hitDice.spent}`] : []),
      ],
    };
  }

  private resolveLongRest(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): RestResolution {
    const hitDice = this.resolveLongRestHitDice(input, resource);
    return {
      restType: "long",
      accepted: true,
      rejectedReason: null,
      hp: {
        currentHp: input.maxHp,
        maxHp: input.maxHp,
        tempHp: 0,
      },
      conditions: this.removeRecoveredConditions(input.conditions ?? [], "long", LONG_REST_RECOVERED_TAGS),
      resource: {
        ...resource,
        secondWindAvailable: true,
        actionSurgeUses: input.resourceMaximums?.actionSurgeUses ?? resource.actionSurgeUses,
        rageUses: input.resourceMaximums?.rageUses ?? resource.rageUses,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: Math.max(resource.exhaustionLevel - 1, 0),
        hitDiceSpent: hitDice.hitDiceSpent,
      },
      spellSlots: { ...(input.spellSlotMaximums ?? input.spellSlots ?? {}) },
      recoveredTags: [
        ...LONG_REST_RECOVERED_TAGS,
        "spell_slots:all",
        ...(hitDice.recovered > 0 ? [`hit_dice:recovered:${hitDice.recovered}`] : []),
      ],
    };
  }

  private normalizeResource(resource: RestResourceState | null | undefined): RestResolution["resource"] {
    return {
      secondWindAvailable: resource?.secondWindAvailable ?? true,
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

  private nonNegativeInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
    return value;
  }
}
