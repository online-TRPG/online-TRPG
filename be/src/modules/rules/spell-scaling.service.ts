import { Injectable } from "@nestjs/common";

export type SpellScalingMode =
  | "damage_dice"
  | "healing_dice"
  | "flat_bonus"
  | "target_count"
  | "duration"
  | "summon_count";

export type SpellDurationUnit = "round" | "minute" | "hour" | "day";

export type SpellScalingRule =
  | {
      mode: "damage_dice" | "healing_dice";
      dice: string;
      perSlotAbove?: number;
    }
  | {
      mode: "flat_bonus";
      amount: number;
      perSlotAbove?: number;
    }
  | {
      mode: "target_count" | "summon_count";
      count: number;
      perSlotAbove?: number;
    }
  | {
      mode: "duration";
      unit: SpellDurationUnit;
      amountPerSlotAbove: number;
      perSlotAbove?: number;
    };

export type SpellDuration = {
  unit: SpellDurationUnit;
  amount: number;
};

export type SpellScalingInput = {
  spellId: string;
  baseSpellLevel: number;
  slotLevel: number;
  baseDamageDice?: string | null;
  baseHealingDice?: string | null;
  baseTargetCount?: number | null;
  baseDuration?: SpellDuration | null;
  baseSummonCount?: number | null;
  scalingRules?: SpellScalingRule[];
};

export type AppliedSpellScaling = {
  mode: SpellScalingMode;
  steps: number;
  value: string | number | SpellDuration;
};

export type SpellScalingResult = {
  spellId: string;
  baseSpellLevel: number;
  slotLevel: number;
  slotLevelsAboveBase: number;
  damageDice: string | null;
  healingDice: string | null;
  targetCount: number | null;
  duration: SpellDuration | null;
  summonCount: number | null;
  appliedScaling: AppliedSpellScaling[];
};

@Injectable()
export class SpellScalingService {
  resolveUpcast(input: SpellScalingInput): SpellScalingResult {
    const spellId = this.normalizeSpellId(input.spellId);
    const baseSpellLevel = this.assertSpellLevel(input.baseSpellLevel, "baseSpellLevel");
    const slotLevel = this.assertSpellLevel(input.slotLevel, "slotLevel");

    if (baseSpellLevel === 0 && slotLevel !== 0) {
      throw new Error("Cantrips do not use spell slot upcasting.");
    }
    if (slotLevel < baseSpellLevel) {
      throw new Error("slotLevel must be greater than or equal to baseSpellLevel.");
    }

    const slotLevelsAboveBase = slotLevel - baseSpellLevel;
    const result: SpellScalingResult = {
      spellId,
      baseSpellLevel,
      slotLevel,
      slotLevelsAboveBase,
      damageDice: input.baseDamageDice ?? null,
      healingDice: input.baseHealingDice ?? null,
      targetCount: this.normalizeOptionalCount(input.baseTargetCount, "baseTargetCount"),
      duration: input.baseDuration ? this.normalizeDuration(input.baseDuration) : null,
      summonCount: this.normalizeOptionalCount(input.baseSummonCount, "baseSummonCount"),
      appliedScaling: [],
    };

    for (const rule of input.scalingRules ?? []) {
      const steps = this.resolveSteps(slotLevelsAboveBase, rule.perSlotAbove);
      if (steps <= 0) {
        continue;
      }

      switch (rule.mode) {
        case "damage_dice":
          {
            const damageDice = this.addDice(result.damageDice, rule.dice, steps);
            result.damageDice = damageDice;
            result.appliedScaling.push({ mode: rule.mode, steps, value: damageDice });
          }
          break;
        case "healing_dice":
          {
            const healingDice = this.addDice(result.healingDice, rule.dice, steps);
            result.healingDice = healingDice;
            result.appliedScaling.push({ mode: rule.mode, steps, value: healingDice });
          }
          break;
        case "flat_bonus":
          {
            const damageDice = this.addFlatBonus(result.damageDice, rule.amount, steps);
            result.damageDice = damageDice;
            result.appliedScaling.push({ mode: rule.mode, steps, value: damageDice });
          }
          break;
        case "target_count":
          {
            const targetCount = (result.targetCount ?? 1) + rule.count * steps;
            result.targetCount = targetCount;
            result.appliedScaling.push({ mode: rule.mode, steps, value: targetCount });
          }
          break;
        case "summon_count":
          {
            const summonCount = (result.summonCount ?? 0) + rule.count * steps;
            result.summonCount = summonCount;
            result.appliedScaling.push({ mode: rule.mode, steps, value: summonCount });
          }
          break;
        case "duration":
          {
            const duration = this.addDuration(result.duration, rule, steps);
            result.duration = duration;
            result.appliedScaling.push({ mode: rule.mode, steps, value: duration });
          }
          break;
        default:
          throw new Error("Unsupported spell scaling mode.");
      }
    }

    return result;
  }

  private normalizeSpellId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) {
      throw new Error("spellId is required.");
    }
    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private assertSpellLevel(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      throw new Error(`${field} must be an integer from 0 to 9.`);
    }
    return value;
  }

  private normalizeOptionalCount(value: number | null | undefined, field: string): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
    return value;
  }

  private normalizeDuration(duration: SpellDuration): SpellDuration {
    if (!Number.isInteger(duration.amount) || duration.amount < 0) {
      throw new Error("duration amount must be a non-negative integer.");
    }
    if (!["round", "minute", "hour", "day"].includes(duration.unit)) {
      throw new Error("duration unit must be round, minute, hour, or day.");
    }
    return { ...duration };
  }

  private resolveSteps(slotLevelsAboveBase: number, perSlotAbove: number | undefined): number {
    const interval = perSlotAbove ?? 1;
    if (!Number.isInteger(interval) || interval <= 0) {
      throw new Error("perSlotAbove must be a positive integer.");
    }
    return Math.floor(slotLevelsAboveBase / interval);
  }

  private addDice(baseDice: string | null, dice: string, steps: number): string {
    const parsed = this.parseDice(dice);
    const additionalCount = parsed.count * steps;
    if (!baseDice) {
      return `${additionalCount}d${parsed.sides}`;
    }

    const parsedBase = this.tryParseDice(baseDice);
    if (parsedBase && parsedBase.sides === parsed.sides) {
      return `${parsedBase.count + additionalCount}d${parsed.sides}`;
    }

    return `${baseDice}+${additionalCount}d${parsed.sides}`;
  }

  private addFlatBonus(baseValue: string | null, amount: number, steps: number): string {
    if (!Number.isFinite(amount)) {
      throw new Error("flat bonus amount must be a finite number.");
    }
    const additional = amount * steps;
    const numericBase = baseValue === null ? 0 : Number(baseValue);
    if (Number.isFinite(numericBase)) {
      return String(numericBase + additional);
    }
    return additional >= 0 ? `${baseValue}+${additional}` : `${baseValue}${additional}`;
  }

  private parseDice(dice: string): { count: number; sides: number } {
    const match = dice.trim().toLowerCase().match(/^(\d+)d(\d+)$/);
    if (!match) {
      throw new Error(`Unsupported dice expression: ${dice}`);
    }
    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (count <= 0 || sides <= 0) {
      throw new Error(`Unsupported dice expression: ${dice}`);
    }
    return { count, sides };
  }

  private tryParseDice(dice: string): { count: number; sides: number } | null {
    try {
      return this.parseDice(dice);
    } catch {
      return null;
    }
  }

  private addDuration(
    baseDuration: SpellDuration | null,
    rule: Extract<SpellScalingRule, { mode: "duration" }>,
    steps: number,
  ): SpellDuration {
    const current = baseDuration ? this.normalizeDuration(baseDuration) : { unit: rule.unit, amount: 0 };
    if (current.unit !== rule.unit) {
      throw new Error("duration scaling unit must match base duration unit.");
    }
    if (!Number.isInteger(rule.amountPerSlotAbove) || rule.amountPerSlotAbove < 0) {
      throw new Error("amountPerSlotAbove must be a non-negative integer.");
    }
    return {
      unit: current.unit,
      amount: current.amount + rule.amountPerSlotAbove * steps,
    };
  }
}
