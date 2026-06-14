import { Injectable } from "@nestjs/common";

export type ConditionDuration =
  | { type: "instant" }
  | { type: "rounds"; remaining: number }
  | { type: "until_turn"; round: number; turn: number }
  | { type: "until_rest"; restType: "short" | "long" }
  | { type: "permanent" };

export type ConditionStackPolicy = "replace" | "ignore_duplicate" | "stack";

export type ConditionInstance = {
  conditionId: string;
  sourceId: string | null;
  duration: ConditionDuration;
  saveEnds: {
    ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
    dc: number;
  } | null;
  stackPolicy: ConditionStackPolicy;
  appliedAtRound: number | null;
  expiresAtTurn: {
    round: number;
    turn: number;
  } | null;
  tags: string[];
};

export type ConditionLifecycleResolution = {
  conditions: ConditionInstance[];
  expiredConditions: ConditionInstance[];
  updatedConditions: ConditionInstance[];
};

@Injectable()
export class ConditionRuntimeService {
  parseConditionsJson(value: string | null | undefined): ConditionInstance[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((entry) => this.toConditionInstance(entry))
        .filter((entry): entry is ConditionInstance => entry !== null);
    } catch {
      return [];
    }
  }

  toConditionTags(value: string | null | undefined): string[] {
    return Array.from(
      new Set(
        this.parseConditionsJson(value).flatMap((condition) => [
          condition.conditionId,
          ...condition.tags,
        ]),
      ),
    );
  }

  applyCondition(
    current: ConditionInstance[],
    next: ConditionInstance,
  ): ConditionInstance[] {
    switch (next.stackPolicy) {
      case "stack":
        return [...current, next];
      case "replace":
        return [
          ...current.filter((condition) => condition.conditionId !== next.conditionId),
          next,
        ];
      case "ignore_duplicate":
      default:
        return current.some((condition) => condition.conditionId === next.conditionId)
          ? current
          : [...current, next];
    }
  }

  removeCondition(current: ConditionInstance[], conditionId: string): ConditionInstance[] {
    const normalized = this.normalizeConditionId(conditionId);
    return current.filter((condition) => condition.conditionId !== normalized);
  }

  resolveTurnEnd(
    current: ConditionInstance[],
    turn: { round: number; turn: number },
  ): ConditionLifecycleResolution {
    this.assertNonNegativeInteger(turn.round, "turn.round");
    this.assertNonNegativeInteger(turn.turn, "turn.turn");

    const conditions: ConditionInstance[] = [];
    const expiredConditions: ConditionInstance[] = [];
    const updatedConditions: ConditionInstance[] = [];

    for (const condition of current) {
      const next = this.tickConditionAtTurnEnd(condition, turn);
      if (!next) {
        expiredConditions.push(condition);
        continue;
      }
      conditions.push(next);
      if (next !== condition) {
        updatedConditions.push(next);
      }
    }

    return { conditions, expiredConditions, updatedConditions };
  }

  resolveSaveEnd(
    current: ConditionInstance[],
    params: {
      conditionId: string;
      saveSucceeded: boolean;
    },
  ): ConditionLifecycleResolution {
    const normalized = this.normalizeConditionId(params.conditionId);
    const expiredConditions: ConditionInstance[] = [];
    const conditions = current.filter((condition) => {
      if (
        condition.conditionId === normalized &&
        condition.saveEnds &&
        params.saveSucceeded
      ) {
        expiredConditions.push(condition);
        return false;
      }
      return true;
    });

    return { conditions, expiredConditions, updatedConditions: [] };
  }

  resolveRestEnd(
    current: ConditionInstance[],
    restType: "short" | "long",
  ): ConditionLifecycleResolution {
    const expiredConditions: ConditionInstance[] = [];
    const conditions = current.filter((condition) => {
      if (condition.duration.type !== "until_rest") {
        return true;
      }
      if (condition.duration.restType === "short" || restType === "long") {
        expiredConditions.push(condition);
        return false;
      }
      return true;
    });

    return { conditions, expiredConditions, updatedConditions: [] };
  }

  createCondition(params: {
    conditionId: string;
    sourceId?: string | null;
    duration?: ConditionDuration;
    saveEnds?: ConditionInstance["saveEnds"];
    stackPolicy?: ConditionStackPolicy;
    appliedAtRound?: number | null;
    expiresAtTurn?: ConditionInstance["expiresAtTurn"];
    tags?: string[];
  }): ConditionInstance {
    return {
      conditionId: this.normalizeConditionId(params.conditionId),
      sourceId: params.sourceId ?? null,
      duration: params.duration ?? { type: "permanent" },
      saveEnds: params.saveEnds ?? null,
      stackPolicy: params.stackPolicy ?? "ignore_duplicate",
      appliedAtRound: params.appliedAtRound ?? null,
      expiresAtTurn: params.expiresAtTurn ?? null,
      tags: Array.from(
        new Set((params.tags ?? []).map((tag) => this.normalizeTag(tag)).filter(Boolean)),
      ),
    };
  }

  private toConditionInstance(value: unknown): ConditionInstance | null {
    if (typeof value === "string") {
      return this.createCondition({ conditionId: value });
    }
    if (!this.isRecord(value) || typeof value.conditionId !== "string") {
      return null;
    }

    return this.createCondition({
      conditionId: value.conditionId,
      sourceId: typeof value.sourceId === "string" ? value.sourceId : null,
      duration: this.toDuration(value.duration),
      saveEnds: this.toSaveEnds(value.saveEnds),
      stackPolicy: this.toStackPolicy(value.stackPolicy),
      appliedAtRound: this.toNullableInteger(value.appliedAtRound),
      expiresAtTurn: this.toExpiresAtTurn(value.expiresAtTurn),
      tags: Array.isArray(value.tags)
        ? value.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    });
  }

  private tickConditionAtTurnEnd(
    condition: ConditionInstance,
    turn: { round: number; turn: number },
  ): ConditionInstance | null {
    if (condition.duration.type === "instant") {
      return null;
    }

    if (
      condition.duration.type === "until_turn" &&
      this.isAtOrAfterTurn(turn, {
        round: condition.duration.round,
        turn: condition.duration.turn,
      })
    ) {
      return null;
    }

    if (condition.expiresAtTurn && this.isAtOrAfterTurn(turn, condition.expiresAtTurn)) {
      return null;
    }

    if (condition.duration.type !== "rounds") {
      return condition;
    }

    const remaining = condition.duration.remaining - 1;
    if (remaining <= 0) {
      return null;
    }

    return {
      ...condition,
      duration: { type: "rounds", remaining },
    };
  }

  private isAtOrAfterTurn(
    current: { round: number; turn: number },
    target: { round: number; turn: number },
  ): boolean {
    return current.round > target.round ||
      (current.round === target.round && current.turn >= target.turn);
  }

  private toDuration(value: unknown): ConditionDuration {
    if (!this.isRecord(value) || typeof value.type !== "string") {
      return { type: "permanent" };
    }
    switch (value.type) {
      case "instant":
        return { type: "instant" };
      case "rounds":
        return { type: "rounds", remaining: Math.max(this.toNullableInteger(value.remaining) ?? 1, 1) };
      case "until_turn":
        return {
          type: "until_turn",
          round: Math.max(this.toNullableInteger(value.round) ?? 0, 0),
          turn: Math.max(this.toNullableInteger(value.turn) ?? 0, 0),
        };
      case "until_rest":
        return { type: "until_rest", restType: value.restType === "short" ? "short" : "long" };
      case "permanent":
      default:
        return { type: "permanent" };
    }
  }

  private toSaveEnds(value: unknown): ConditionInstance["saveEnds"] {
    if (!this.isRecord(value) || typeof value.ability !== "string") {
      return null;
    }
    if (!["str", "dex", "con", "int", "wis", "cha"].includes(value.ability)) {
      return null;
    }
    const dc = this.toNullableInteger(value.dc);
    if (!dc) {
      return null;
    }
    return { ability: value.ability as NonNullable<ConditionInstance["saveEnds"]>["ability"], dc };
  }

  private toStackPolicy(value: unknown): ConditionStackPolicy {
    return value === "replace" || value === "stack" || value === "ignore_duplicate"
      ? value
      : "ignore_duplicate";
  }

  private toExpiresAtTurn(value: unknown): ConditionInstance["expiresAtTurn"] {
    if (!this.isRecord(value)) {
      return null;
    }
    const round = this.toNullableInteger(value.round);
    const turn = this.toNullableInteger(value.turn);
    return round === null || turn === null ? null : { round, turn };
  }

  private normalizeConditionId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) {
      throw new Error("conditionId must not be empty.");
    }
    return normalized.startsWith("condition.") || normalized.includes(":")
      ? normalized
      : `condition.${normalized}`;
  }

  private normalizeTag(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "_");
  }

  private toNullableInteger(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) ? numberValue : null;
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
