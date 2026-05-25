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
    return {
      restType: "short",
      accepted: true,
      rejectedReason: null,
      hp: {
        currentHp: input.currentHp,
        maxHp: input.maxHp,
        tempHp: input.tempHp ?? 0,
      },
      conditions: this.removeRecoveredConditions(input.conditions ?? [], "short", SHORT_REST_RECOVERED_TAGS),
      resource: {
        ...resource,
        secondWindAvailable: true,
        actionSurgeUses: input.resourceMaximums?.actionSurgeUses ?? resource.actionSurgeUses,
      },
      spellSlots: { ...(input.spellSlots ?? {}) },
      recoveredTags: [...SHORT_REST_RECOVERED_TAGS],
    };
  }

  private resolveLongRest(
    input: RestResolutionInput,
    resource: RestResolution["resource"],
  ): RestResolution {
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
      },
      spellSlots: { ...(input.spellSlotMaximums ?? input.spellSlots ?? {}) },
      recoveredTags: [...LONG_REST_RECOVERED_TAGS, "spell_slots:all"],
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
