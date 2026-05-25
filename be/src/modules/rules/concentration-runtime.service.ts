import { Injectable } from "@nestjs/common";
import {
  ConditionInstance,
  ConditionRuntimeService,
} from "./condition-runtime.service";
import { RuleEngineService } from "./rule-engine.service";
import {
  RuleAdvantageState,
  RuleHookResult,
  SavingThrowModifier,
} from "./rule-engine.types";

export type ConcentrationState = {
  casterId: string;
  spellId: string;
  targetIds: string[];
  effectIds: string[];
  startedAtRound: number;
  endsAtRound?: number | null;
  endsAtTurn?: number | null;
};

export type ConcentrationCheckRuntimeInput = {
  conditions: ConditionInstance[];
  damageTaken: number;
  naturalD20: number;
  constitutionModifier: number;
  proficiencyBonus?: number;
  proficient?: boolean;
  advantageState?: RuleAdvantageState;
  bonusModifiers?: SavingThrowModifier[];
};

export type ConcentrationCheckRuntimeResolution = {
  activeConcentration: ConditionInstance | null;
  concentrationState: ConcentrationState | null;
  ruleResult: RuleHookResult<unknown> | null;
  conditions: ConditionInstance[];
  removedConditions: ConditionInstance[];
  concentrationMaintained: boolean;
};

@Injectable()
export class ConcentrationRuntimeService {
  constructor(
    private readonly ruleEngine: RuleEngineService = new RuleEngineService(),
    private readonly conditionRuntime: ConditionRuntimeService = new ConditionRuntimeService(),
  ) {}

  startConcentration(
    current: ConditionInstance[],
    state: ConcentrationState,
  ): ConditionInstance[] {
    return this.conditionRuntime.applyCondition(
      current.filter((condition) => !this.isConcentrationCondition(condition)),
      this.conditionRuntime.createCondition({
        conditionId: "condition.concentration",
        sourceId: state.spellId,
        duration: state.endsAtRound === null || state.endsAtRound === undefined
          ? { type: "permanent" }
          : { type: "until_turn", round: state.endsAtRound, turn: state.endsAtTurn ?? 0 },
        stackPolicy: "replace",
        appliedAtRound: state.startedAtRound,
        expiresAtTurn: state.endsAtRound === null || state.endsAtRound === undefined
          ? null
          : { round: state.endsAtRound, turn: state.endsAtTurn ?? 0 },
        tags: [
          "concentration",
          `concentration:spell:${state.spellId}`,
          ...state.targetIds.map((targetId) => `concentration:target:${targetId}`),
          ...state.effectIds.map((effectId) => `concentration:effect:${effectId}`),
        ],
      }),
    );
  }

  resolveDamageCheck(
    input: ConcentrationCheckRuntimeInput,
  ): ConcentrationCheckRuntimeResolution {
    const activeConcentration =
      input.conditions.find((condition) => this.isConcentrationCondition(condition)) ?? null;
    if (!activeConcentration) {
      return {
        activeConcentration: null,
        concentrationState: null,
        ruleResult: null,
        conditions: input.conditions,
        removedConditions: [],
        concentrationMaintained: true,
      };
    }

    const ruleResult = this.ruleEngine.resolveConcentrationCheck({
      damageTaken: input.damageTaken,
      naturalD20: input.naturalD20,
      constitutionModifier: input.constitutionModifier,
      proficiencyBonus: input.proficiencyBonus,
      proficient: input.proficient,
      advantageState: input.advantageState,
      bonusModifiers: input.bonusModifiers,
    });
    if (!ruleResult.produced.concentrationEnds) {
      return {
        activeConcentration,
        concentrationState: this.toConcentrationState(activeConcentration),
        ruleResult,
        conditions: input.conditions,
        removedConditions: [],
        concentrationMaintained: true,
      };
    }

    const removedConditions = input.conditions.filter((condition) =>
      this.isConcentrationLinkedCondition(condition, activeConcentration),
    );
    const removedKeys = new Set(removedConditions.map((condition) => this.conditionKey(condition)));

    return {
      activeConcentration,
      concentrationState: this.toConcentrationState(activeConcentration),
      ruleResult,
      conditions: input.conditions.filter((condition) => !removedKeys.has(this.conditionKey(condition))),
      removedConditions,
      concentrationMaintained: false,
    };
  }

  private isConcentrationCondition(condition: ConditionInstance): boolean {
    return condition.conditionId === "condition.concentration" ||
      condition.tags.includes("concentration");
  }

  private isConcentrationLinkedCondition(
    condition: ConditionInstance,
    activeConcentration: ConditionInstance,
  ): boolean {
    if (condition === activeConcentration || this.isConcentrationCondition(condition)) {
      return true;
    }
    const effectIds = this.readTaggedValues(activeConcentration, "concentration:effect:");
    return Boolean(
      condition.sourceId &&
        effectIds.some(
          (effectId) =>
            this.normalizedTagValue(effectId) === this.normalizedTagValue(condition.sourceId ?? ""),
        ),
    );
  }

  private toConcentrationState(condition: ConditionInstance): ConcentrationState | null {
    const spellId = this.readTaggedValues(condition, "concentration:spell:")[0] ?? condition.sourceId;
    if (!spellId) {
      return null;
    }
    return {
      casterId: "",
      spellId,
      targetIds: this.readTaggedValues(condition, "concentration:target:"),
      effectIds: this.readTaggedValues(condition, "concentration:effect:"),
      startedAtRound: condition.appliedAtRound ?? 0,
      endsAtRound: condition.expiresAtTurn?.round ?? null,
      endsAtTurn: condition.expiresAtTurn?.turn ?? null,
    };
  }

  private readTaggedValues(condition: ConditionInstance, prefix: string): string[] {
    return condition.tags
      .filter((tag) => tag.startsWith(prefix))
      .map((tag) => tag.slice(prefix.length))
      .filter(Boolean);
  }

  private conditionKey(condition: ConditionInstance): string {
    return `${condition.conditionId}:${condition.sourceId ?? ""}:${condition.appliedAtRound ?? ""}`;
  }

  private normalizedTagValue(value: string): string {
    return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }
}
