import { Injectable } from "@nestjs/common";
import {
  DiceAdvantageState,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import { DiceService } from "./dice.service";
import { RuleCatalogEntry } from "./rule-catalog.types";
import { RuleEngineService } from "./rule-engine.service";
import {
  RuleAdvantageState,
  RuleHookResult,
  SavingThrowAbility,
  SavingThrowModifier,
  SavingThrowProduced,
} from "./rule-engine.types";

export type AoeDamageTarget = {
  id: string;
  currentHp: number;
  abilityModifiers: Partial<Record<SavingThrowAbility, number>>;
  proficiencyBonus?: number;
  proficientSaves?: SavingThrowAbility[];
  advantageState?: RuleAdvantageState;
  bonusModifiers?: SavingThrowModifier[];
  modifierRolls?: DiceRollResponseDto[];
  immunities?: string[];
  resistances?: string[];
  vulnerabilities?: string[];
};

export type AoeDamageInput = {
  sourceId: string;
  damageDice: string;
  damageType: string;
  save: {
    ability: SavingThrowAbility;
    dc: number;
    halfDamageOnSuccess?: boolean;
  };
  targets: AoeDamageTarget[];
};

export type AoeSpellDamageInputParams = {
  spellDefinition: RuleCatalogEntry;
  saveDc?: number;
  damageDice?: string;
  halfDamageOnSuccess?: boolean;
  targets: AoeDamageTarget[];
};

export type AoeDamageTargetResult = {
  targetId: string;
  saveRoll: DiceRollResponseDto;
  savingThrow: SavingThrowProduced;
  modifierRolls: DiceRollResponseDto[];
  baseDamage: number;
  finalDamage: number;
  currentHp: number;
  nextHp: number;
  markDead: boolean;
  ruleResults: RuleHookResult<unknown>[];
};

export type AoeDamageResolution = {
  sourceId: string;
  damageDice: string;
  damageType: string;
  damageRoll: DiceRollResponseDto;
  targetResults: AoeDamageTargetResult[];
  stateChanges: Array<{
    sessionCharacterId: string;
    currentHp: number;
    markDead: boolean;
  }>;
};

@Injectable()
export class AoeDamageService {
  constructor(
    private readonly diceService: DiceService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  resolveDamage(input: AoeDamageInput): AoeDamageResolution {
    this.assertNonEmptyString(input.sourceId, "sourceId");
    this.assertNonEmptyString(input.damageDice, "damageDice");
    this.assertNonEmptyString(input.damageType, "damageType");
    this.assertPositiveInteger(input.save.dc, "save.dc");

    const damageRoll = this.diceService.roll(input.damageDice);
    const targetResults = input.targets.map((target) =>
      this.resolveTargetDamage(input, target, damageRoll.total),
    );

    return {
      sourceId: input.sourceId,
      damageDice: input.damageDice,
      damageType: input.damageType,
      damageRoll,
      targetResults,
      stateChanges: targetResults.map((targetResult) => ({
        sessionCharacterId: targetResult.targetId,
        currentHp: targetResult.nextHp,
        markDead: targetResult.markDead,
      })),
    };
  }

  createInputFromSpell(params: AoeSpellDamageInputParams): AoeDamageInput {
    const spell = params.spellDefinition;
    if (spell.kind !== "spell_definitions") {
      throw new Error("spellDefinition must be a spell catalog entry.");
    }
    if (spell.targeting.type !== "area") {
      throw new Error("spellDefinition must target an area.");
    }
    if (!spell.damage) {
      throw new Error("spellDefinition must define damage.");
    }
    if (!spell.save) {
      throw new Error("spellDefinition must define a saving throw.");
    }

    const save: AoeDamageInput["save"] = {
      ability: spell.save.ability,
      dc: this.resolveSpellSaveDc(spell, params.saveDc),
    };
    if (params.halfDamageOnSuccess !== undefined) {
      save.halfDamageOnSuccess = params.halfDamageOnSuccess;
    }

    return {
      sourceId: spell.id,
      damageDice: params.damageDice ?? spell.damage.dice,
      damageType: spell.damage.type,
      save,
      targets: params.targets,
    };
  }

  private resolveTargetDamage(
    input: AoeDamageInput,
    target: AoeDamageTarget,
    rolledDamage: number,
  ): AoeDamageTargetResult {
    this.assertNonEmptyString(target.id, "target.id");
    this.assertNonNegativeInteger(target.currentHp, "target.currentHp");

    const abilityModifier = target.abilityModifiers[input.save.ability] ?? 0;
    const saveRoll = this.diceService.roll("1d20", this.toDiceAdvantage(target.advantageState));
    const saveResult = this.ruleEngine.resolveSavingThrow({
      ability: input.save.ability,
      naturalD20: this.selectNaturalD20(saveRoll),
      difficultyClass: input.save.dc,
      abilityModifier,
      proficiencyBonus: target.proficiencyBonus,
      proficient: target.proficientSaves?.includes(input.save.ability) ?? false,
      advantageState: target.advantageState ?? "normal",
      bonusModifiers: target.bonusModifiers,
    });
    const baseDamage = this.resolveBaseDamageAfterSave(
      rolledDamage,
      saveResult.produced.success,
      input.save.halfDamageOnSuccess,
    );
    const damageResult = this.ruleEngine.applyDamageModifiers({
      baseDamage,
      damageType: input.damageType,
      targetImmunities: target.immunities ?? [],
      targetResistances: target.resistances ?? [],
      targetVulnerabilities: target.vulnerabilities ?? [],
    });
    const finalDamage = damageResult.produced.finalDamage;
    const nextHp = Math.max(target.currentHp - finalDamage, 0);

    return {
      targetId: target.id,
      saveRoll,
      savingThrow: saveResult.produced,
      modifierRolls: target.modifierRolls ?? [],
      baseDamage,
      finalDamage,
      currentHp: target.currentHp,
      nextHp,
      markDead: nextHp <= 0,
      ruleResults: [saveResult, damageResult],
    };
  }

  private resolveSpellSaveDc(spell: RuleCatalogEntry, saveDc: number | undefined): number {
    if (saveDc !== undefined) {
      this.assertPositiveInteger(saveDc, "saveDc");
      return saveDc;
    }
    if (spell.save?.dcSource === "fixed" && spell.save.fixedDc !== undefined) {
      this.assertPositiveInteger(spell.save.fixedDc, "spell.save.fixedDc");
      return spell.save.fixedDc;
    }
    throw new Error("saveDc is required when spell save DC is not fixed.");
  }

  private selectNaturalD20(roll: DiceRollResponseDto): number {
    if (roll.advantageState === DiceAdvantageState.ADVANTAGE) {
      return Math.max(...roll.rolls);
    }
    if (roll.advantageState === DiceAdvantageState.DISADVANTAGE) {
      return Math.min(...roll.rolls);
    }
    return roll.rolls[0] ?? roll.total - roll.modifier;
  }

  private toDiceAdvantage(value: RuleAdvantageState | undefined): DiceAdvantageState {
    switch (value) {
      case "advantage":
        return DiceAdvantageState.ADVANTAGE;
      case "disadvantage":
        return DiceAdvantageState.DISADVANTAGE;
      case "normal":
      default:
        return DiceAdvantageState.NORMAL;
    }
  }

  private resolveBaseDamageAfterSave(
    rolledDamage: number,
    saveSucceeded: boolean,
    halfDamageOnSuccess: boolean | undefined,
  ): number {
    if (!saveSucceeded) {
      return rolledDamage;
    }
    return halfDamageOnSuccess === false ? 0 : Math.floor(rolledDamage / 2);
  }

  private assertNonEmptyString(value: string, field: string): void {
    if (!value.trim()) {
      throw new Error(`${field} must not be empty.`);
    }
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${field} must be a positive integer.`);
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }
}
