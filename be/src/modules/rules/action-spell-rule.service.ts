import { Injectable } from "@nestjs/common";
import { ActionOutcome, DiceAdvantageState, DiceRollResponseDto } from "@trpg/shared-types";
import { AoeDamageService, AoeDamageTarget } from "./aoe-damage.service";
import { ParsedCommand } from "./command-parser.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { DiceService } from "./dice.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleCatalogEntry } from "./rule-catalog.types";
import { RuleEngineService } from "./rule-engine.service";
import { RuleHookResult, SavingThrowAbility } from "./rule-engine.types";
import { SpellScalingResult, SpellScalingRule, SpellScalingService } from "./spell-scaling.service";
import type { ActionResolution, ActionRuntimeEffect, CharacterStatePatch, RuleRuntimeContext, SessionCharacterForRules } from "./action-rule.service";

const CHILL_TOUCH_SPELL_ID = "spell.chill_touch";
const FIRE_BOLT_SPELL_ID = "spell.fire_bolt";
const RAY_OF_FROST_SPELL_ID = "spell.ray_of_frost";
const MAGIC_MISSILE_SPELL_ID = "spell.magic_missile";
const CURE_WOUNDS_SPELL_ID = "spell.cure_wounds";
const SLEEP_SPELL_ID = "spell.sleep";
const LIGHT_SPELL_ID = "spell.light";
const DETECT_MAGIC_SPELL_ID = "spell.detect_magic";

export type ActionSpellRuleRuntime = {
  createActionUnavailableResolution: (...args: any[]) => any;
  createTargetStatePatch: (...args: any[]) => any;
  hasActionAvailable: (...args: any[]) => any;
  hasCondition: (...args: any[]) => any;
  normalizeRuleToken: (...args: any[]) => any;
  requireTarget: (...args: any[]) => any;
  resolveConcentrationDamageCheck: (...args: any[]) => any;
  resolveDamageProfile: (...args: any[]) => any;
  resolveSpellTargetList: (...args: any[]) => any;
  selectNaturalD20: (...args: any[]) => any;
  toAoeDamageTarget: (...args: any[]) => any;
  parseJson: <T>(value: string | null | undefined, fallback: T) => T;
};

@Injectable()
export class ActionSpellRuleService {
  constructor(
    private readonly diceService: DiceService,
    private readonly ruleEngine: RuleEngineService,
    private readonly conditionRuntime: ConditionRuntimeService = new ConditionRuntimeService(),
    private readonly aoeDamage: AoeDamageService = new AoeDamageService(diceService, ruleEngine),
    private readonly ruleCatalog: RuleCatalogService = new RuleCatalogService(),
    private readonly spellScaling: SpellScalingService = new SpellScalingService(),
  ) {}

  private runtime!: ActionSpellRuleRuntime;

  private withRuntime<T>(runtime: ActionSpellRuleRuntime, fn: () => T): T {
    const previous = this.runtime;
    this.runtime = runtime;
    try {
      return fn();
    } finally {
      this.runtime = previous;
    }
  }

  private createActionUnavailableResolution(...args: any[]): any {
    return this.runtime.createActionUnavailableResolution(...args);
  }

  private createTargetStatePatch(...args: any[]): any {
    return this.runtime.createTargetStatePatch(...args);
  }

  private hasActionAvailable(...args: any[]): any {
    return this.runtime.hasActionAvailable(...args);
  }

  private hasCondition(...args: any[]): any {
    return this.runtime.hasCondition(...args);
  }

  private normalizeRuleToken(...args: any[]): any {
    return this.runtime.normalizeRuleToken(...args);
  }

  private requireTarget(...args: any[]): any {
    return this.runtime.requireTarget(...args);
  }

  private resolveConcentrationDamageCheck(...args: any[]): any {
    return this.runtime.resolveConcentrationDamageCheck(...args);
  }

  private resolveDamageProfile(...args: any[]): any {
    return this.runtime.resolveDamageProfile(...args);
  }

  private resolveSpellTargetList(...args: any[]): any {
    return this.runtime.resolveSpellTargetList(...args);
  }

  private selectNaturalD20(...args: any[]): any {
    return this.runtime.selectNaturalD20(...args);
  }

  private toAoeDamageTarget(...args: any[]): any {
    return this.runtime.toAoeDamageTarget(...args);
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    return this.runtime.parseJson(value, fallback);
  }

  resolveCastSpell(
    runtime: ActionSpellRuleRuntime,
    command: Extract<ParsedCommand, { type: "cast_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    return this.withRuntime(runtime, () => this.resolveCastSpellImpl(command, actor, sessionCharacters, runtimeContext));
  }

  private resolveCastSpellImpl(
    command: Extract<ParsedCommand, { type: "cast_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("cast_spell", {
        spellId: command.spellId,
        target: command.target,
        targetDistanceFt: command.targetDistanceFt,
      });
    }

    const spellDefinition = this.resolveSpellDefinition(command.spellId);
    const spellDamageType = spellDefinition?.damage?.type ?? "untyped";
    const spellDamageDice = this.resolveSpellDamageDice(spellDefinition, actor.character.level);
    const spellLevel = spellDefinition ? this.resolveSpellLevel(spellDefinition) : 0;
    const slotLevel = command.slotLevel ?? spellLevel;
    const spellKnowledgeRejection = this.resolveSpellKnowledgeRejection(actor, command.spellId, spellLevel);
    if (spellKnowledgeRejection) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: command.target,
          targetDistanceFt: command.targetDistanceFt,
          rejectedReason: spellKnowledgeRejection,
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration(spellKnowledgeRejection),
        stateChanges: [],
        runtimeEffects: [],
      };
    }
    let spellScaling: SpellScalingResult | null = null;
    try {
      if (command.slotLevel !== null && spellLevel === 0 && command.slotLevel !== 0) {
        throw new Error("Cantrips do not use spell slot upcasting.");
      }
      spellScaling = this.resolveSpellScaling(spellDefinition, slotLevel);
    } catch (error) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: command.target,
          targetDistanceFt: command.targetDistanceFt,
          spellScaling: null,
          rejectedReason: "invalid_spell_slot_level",
          errorMessage: error instanceof Error ? error.message : "Invalid spell slot level.",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("invalid_spell_slot_level"),
        stateChanges: [],
      };
    }
    if (command.spellId === SLEEP_SPELL_ID) {
      return this.resolveSleepSpell({
        command,
        targets: this.resolveSpellTargetList(command.target, sessionCharacters),
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
      });
    }

    if (command.spellId === LIGHT_SPELL_ID) {
      return this.resolveLightSpell({
        command,
        target: this.requireTarget(command.target, sessionCharacters),
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
      });
    }

    if (command.spellId === DETECT_MAGIC_SPELL_ID) {
      return this.resolveDetectMagicSpell({
        command,
        actor,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
      });
    }

    const target = this.requireTarget(command.target, sessionCharacters);
    const targetArmorClass = target.character.armorClass;

    if (command.spellId === MAGIC_MISSILE_SPELL_ID) {
      return this.resolveMagicMissile({
        command,
        target,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
        spellDamageType,
      });
    }

    if (command.spellId === CURE_WOUNDS_SPELL_ID) {
      return this.resolveCureWounds({
        command,
        actor,
        target,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
      });
    }

    if (command.spellId === FIRE_BOLT_SPELL_ID || command.spellId === RAY_OF_FROST_SPELL_ID) {
      return this.resolveSpellAttackDamage({
        command,
        actor,
        target,
        targetArmorClass,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
        spellDamageType,
        spellDamageDice,
      });
    }

    if (command.spellId !== CHILL_TOUCH_SPELL_ID) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: command.target,
          targetDistanceFt: command.targetDistanceFt,
          rejectedReason: "unsupported_spell",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("unsupported_spell"),
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    const precheckResult = this.ruleEngine.resolveChillTouch({
      spellChillTouch: command.spellId === CHILL_TOUCH_SPELL_ID,
      casterKnownCantrips: this.resolveKnownCantrips(command.spellId),
      actionAvailable: true,
      targetDistanceFt: command.targetDistanceFt,
      componentAvailability: this.resolveDefaultComponentAvailability(),
      spellAttackRollResult: null,
      targetIsUndead: this.hasCondition(target, "undead"),
    });

    if (!precheckResult.accepted && precheckResult.rejectedReason !== "spell_attack_roll_required") {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: target.id,
          targetDistanceFt: command.targetDistanceFt,
          targetArmorClass,
          spellScaling,
          ruleResults: [precheckResult],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration(precheckResult.rejectedReason),
        stateChanges: [],
      };
    }

    const modifier = actor.character.proficiencyBonus;
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, DiceAdvantageState.NORMAL);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20: this.selectNaturalD20(attackRoll),
      attackBonus: modifier,
      targetArmorClass,
      advantageState: "normal",
    });
    const spellRuleResult = this.ruleEngine.resolveChillTouch({
      spellChillTouch: command.spellId === CHILL_TOUCH_SPELL_ID,
      casterKnownCantrips: this.resolveKnownCantrips(command.spellId),
      actionAvailable: true,
      targetDistanceFt: command.targetDistanceFt,
      componentAvailability: this.resolveDefaultComponentAvailability(),
      spellAttackRollResult: attackRuleResult.produced,
      targetIsUndead: this.hasCondition(target, "undead"),
    });
    const ruleResults: RuleHookResult<unknown>[] = [attackRuleResult, spellRuleResult];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;

    if (spellRuleResult.accepted && spellRuleResult.produced["damagePacket.necrotic"]) {
      damageRoll = this.diceService.roll(spellDamageDice ?? "1d8");
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: spellDamageType,
        ...this.resolveDamageProfile(target),
      });
      ruleResults.push(damageRuleResult);
      finalDamage = damageRuleResult.produced.finalDamage;
      const nextHp = Math.max(target.currentHp - finalDamage, 0);
      stateChanges.push({
        sessionCharacterId: target.id,
        currentHp: nextHp,
        markDead: nextHp <= 0,
      });
    }

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: command.spellId,
        slotLevel,
        target: target.id,
        targetDistanceFt: command.targetDistanceFt,
        targetArmorClass,
        spellDefinition: spellDefinition
          ? {
              id: spellDefinition.id,
              level: spellLevel,
              damage: spellDefinition.damage,
              targeting: spellDefinition.targeting,
              scaling: spellDefinition.scaling,
            }
          : null,
        spellScaling,
        damageType: spellDamageType,
        damageDice: spellDamageDice,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: this.resolveSpellOutcome(spellRuleResult.accepted, attackRuleResult.produced.hit),
      narration: this.createChillTouchNarration(spellRuleResult.accepted, attackRuleResult.produced.hit),
      stateChanges,
      runtimeEffects: spellRuleResult.accepted ? this.spellRuntimeEffects(slotLevel) : [],
    };
  }

  resolveCastAreaSpell(
    runtime: ActionSpellRuleRuntime,
    command: Extract<ParsedCommand, { type: "cast_area_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    return this.withRuntime(runtime, () => this.resolveCastAreaSpellImpl(command, actor, sessionCharacters, runtimeContext));
  }

  private resolveCastAreaSpellImpl(
    command: Extract<ParsedCommand, { type: "cast_area_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("cast_area_spell", {
        spellId: command.spellId,
        targetIds: command.targetIds,
      });
    }

    const spellDefinition = this.resolveSpellDefinition(command.spellId);
    if (!spellDefinition || spellDefinition.targeting.type !== "area" || !spellDefinition.damage || !spellDefinition.save) {
      return {
        structuredAction: {
          type: "cast_area_spell",
          spellId: command.spellId,
          targetIds: command.targetIds,
          rejectedReason: "unsupported_area_spell",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("unsupported_spell"),
        stateChanges: [],
      };
    }

    const spellLevel = this.resolveSpellLevel(spellDefinition);
    const slotLevel = command.slotLevel ?? spellLevel;
    const spellKnowledgeRejection = this.resolveSpellKnowledgeRejection(actor, command.spellId, spellLevel);
    if (spellKnowledgeRejection) {
      return {
        structuredAction: {
          type: "cast_area_spell",
          spellId: command.spellId,
          slotLevel,
          targetIds: command.targetIds,
          rejectedReason: spellKnowledgeRejection,
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration(spellKnowledgeRejection),
        stateChanges: [],
        runtimeEffects: [],
      };
    }
    let spellScaling: SpellScalingResult | null = null;
    try {
      spellScaling = this.resolveSpellScaling(spellDefinition, slotLevel);
    } catch (error) {
      return {
        structuredAction: {
          type: "cast_area_spell",
          spellId: command.spellId,
          slotLevel,
          targetIds: command.targetIds,
          spellScaling: null,
          rejectedReason: "invalid_spell_slot_level",
          errorMessage: error instanceof Error ? error.message : "Invalid spell slot level.",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("invalid_spell_slot_level"),
        stateChanges: [],
      };
    }

    const targets = command.targetIds.map((targetId) => this.requireTarget(targetId, sessionCharacters));
    const saveAbility = spellDefinition.save.ability;
    const aoeInput = this.aoeDamage.createInputFromSpell({
      spellDefinition,
      saveDc: command.saveDc,
      damageDice: spellScaling?.damageDice ?? spellDefinition.damage.dice,
      targets: targets.map((target) => this.toAoeDamageTarget(target, saveAbility)),
    });
    const aoeResolution = this.aoeDamage.resolveDamage(aoeInput);
    const concentrationChecks = aoeResolution.targetResults.flatMap((targetResult) => {
      if (targetResult.finalDamage <= 0) {
        return [];
      }
      const target = targets.find((candidate) => candidate.id === targetResult.targetId);
      if (!target) {
        return [];
      }
      const concentrationCheck = this.resolveConcentrationDamageCheck(target, targetResult.finalDamage);
      return concentrationCheck
        ? [
            {
              targetId: target.id,
              diceResult: concentrationCheck.diceResult,
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
              conditions: concentrationCheck.conditions,
            },
          ]
        : [];
    });
    const concentrationByTargetId = new Map(concentrationChecks.map((check) => [check.targetId, check]));

    return {
      structuredAction: {
        type: "cast_area_spell",
        spellId: command.spellId,
        slotLevel,
        saveDc: command.saveDc,
        targetIds: command.targetIds,
        spellDefinition: this.toStructuredSpellDefinition(spellDefinition, spellLevel),
        spellScaling,
        targeting: spellDefinition.targeting,
        aoe: {
          sourceId: aoeResolution.sourceId,
          damageDice: aoeResolution.damageDice,
          damageType: aoeResolution.damageType,
          targetResults: aoeResolution.targetResults,
          concentrationChecks: concentrationChecks.map((check) => ({
            targetId: check.targetId,
            diceResult: check.diceResult,
            concentrationMaintained: check.concentrationMaintained,
            removedConditions: check.removedConditions,
            concentrationState: check.concentrationState,
          })),
        },
      },
      diceResult: aoeResolution.damageRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: `${command.spellId} 광역 주문을 처리했습니다.`,
      stateChanges: aoeResolution.stateChanges.map((stateChange) => {
        const concentrationCheck = concentrationByTargetId.get(stateChange.sessionCharacterId);
        return concentrationCheck && !concentrationCheck.concentrationMaintained ? { ...stateChange, conditions: concentrationCheck.conditions } : stateChange;
      }),
      runtimeEffects: this.spellRuntimeEffects(slotLevel),
    };
  }

  private resolveSpellAttackDamage(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    actor: SessionCharacterForRules;
    target: SessionCharacterForRules;
    targetArmorClass: number;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
    spellDamageType: string;
    spellDamageDice: string | null;
  }): ActionResolution {
    const maxRangeFt = this.resolveSpellRangeFt(params.spellDefinition);
    if (maxRangeFt !== null && params.command.targetDistanceFt > maxRangeFt) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: params.command.spellId,
          slotLevel: params.slotLevel,
          target: params.target.id,
          targetDistanceFt: params.command.targetDistanceFt,
          targetArmorClass: params.targetArmorClass,
          spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
          spellScaling: params.spellScaling,
          rejectedReason: "target_out_of_range",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("target_out_of_range"),
        stateChanges: [],
      };
    }

    const modifier = params.actor.character.proficiencyBonus;
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, DiceAdvantageState.NORMAL);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20: this.selectNaturalD20(attackRoll),
      attackBonus: modifier,
      targetArmorClass: params.targetArmorClass,
      advantageState: "normal",
    });
    const ruleResults: RuleHookResult<unknown>[] = [attackRuleResult];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;

    if (attackRuleResult.produced.hit && params.spellDamageDice) {
      damageRoll = this.diceService.roll(params.spellDamageDice);
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: params.spellDamageType,
        ...this.resolveDamageProfile(params.target),
      });
      ruleResults.push(damageRuleResult);
      finalDamage = damageRuleResult.produced.finalDamage;
      const nextHp = Math.max(params.target.currentHp - finalDamage, 0);
      const stateChange: CharacterStatePatch = {
        sessionCharacterId: params.target.id,
        currentHp: nextHp,
        markDead: nextHp <= 0,
      };
      const speedPenaltyFt = this.resolveMovementSpeedPenaltyFt(params.spellDefinition);
      if (speedPenaltyFt > 0) {
        stateChange.conditions = this.conditionRuntime.applyCondition(
          this.conditionRuntime.parseConditionsJson(params.target.conditionsJson),
          this.conditionRuntime.createCondition({
            conditionId: `condition.spell.${params.command.spellId.slice("spell.".length)}`,
            sourceId: params.command.spellId,
            duration: { type: "rounds", remaining: 1 },
            stackPolicy: "replace",
            tags: [`movement_speed_penalty:${speedPenaltyFt}`],
          }),
        );
      }
      stateChanges.push(stateChange);
    }

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        targetArmorClass: params.targetArmorClass,
        spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
        spellScaling: params.spellScaling,
        damageType: params.spellDamageType,
        damageDice: params.spellDamageDice,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: attackRuleResult.produced.hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: this.createSpellAttackNarration(params.command.spellId, attackRuleResult.produced.hit),
      stateChanges,
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveMagicMissile(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    target: SessionCharacterForRules;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
    spellDamageType: string;
  }): ActionResolution {
    const missileCount = params.spellScaling?.targetCount ?? 3;
    const damageDice = `${missileCount}d4+${missileCount}`;
    const damageRoll = this.diceService.roll(damageDice);
    const damageRuleResult = this.ruleEngine.applyDamageModifiers({
      baseDamage: damageRoll.total,
      damageType: params.spellDamageType,
      ...this.resolveDamageProfile(params.target),
    });
    const finalDamage = damageRuleResult.produced.finalDamage;
    const nextHp = Math.max(params.target.currentHp - finalDamage, 0);
    const concentrationCheck = finalDamage > 0 ? this.resolveConcentrationDamageCheck(params.target, finalDamage) : null;

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        spellDefinition: params.spellDefinition
          ? {
              id: params.spellDefinition.id,
              level: params.spellLevel,
              damage: params.spellDefinition.damage,
              targeting: params.spellDefinition.targeting,
              scaling: params.spellDefinition.scaling,
            }
          : null,
        spellScaling: params.spellScaling,
        missileCount,
        damageType: params.spellDamageType,
        damageDice,
        damageRoll: { ...damageRoll },
        finalDamage,
        concentrationCheck: concentrationCheck
          ? {
              diceResult: concentrationCheck.diceResult,
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
        ruleResults: [damageRuleResult],
      },
      diceResult: damageRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: "Magic Missile이 자동으로 명중했습니다.",
      stateChanges: [
        {
          sessionCharacterId: params.target.id,
          currentHp: nextHp,
          markDead: nextHp <= 0,
          ...(concentrationCheck && !concentrationCheck.concentrationMaintained ? { conditions: concentrationCheck.conditions } : {}),
        },
      ],
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveCureWounds(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    actor: SessionCharacterForRules;
    target: SessionCharacterForRules;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
  }): ActionResolution {
    const maxRangeFt = this.resolveSpellRangeFt(params.spellDefinition);
    if (maxRangeFt !== null && params.command.targetDistanceFt > maxRangeFt) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: params.command.spellId,
          slotLevel: params.slotLevel,
          target: params.target.id,
          targetDistanceFt: params.command.targetDistanceFt,
          spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
          spellScaling: params.spellScaling,
          rejectedReason: "target_out_of_range",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("target_out_of_range"),
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    const healingBaseDice = params.spellScaling?.damageDice ?? this.resolveSpellDamageDice(params.spellDefinition, params.actor.character.level) ?? "1d8";
    const healingModifier = this.resolveSpellcastingAbilityModifier(params.actor);
    const healingDice = `${healingBaseDice}${healingModifier >= 0 ? "+" : ""}${healingModifier}`;
    const healingRoll = this.diceService.roll(healingDice);
    const finalHealing = healingRoll.total;
    const nextHp = Math.min(params.target.currentHp + finalHealing, params.target.character.maxHp);

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
        spellScaling: params.spellScaling,
        healingDice,
        healingRoll: { ...healingRoll },
        finalHealing,
      },
      diceResult: healingRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: "Cure Wounds 주문으로 대상을 회복했습니다.",
      stateChanges: [{ sessionCharacterId: params.target.id, currentHp: nextHp }],
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveSleepSpell(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    targets: SessionCharacterForRules[];
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
  }): ActionResolution {
    const damageDice = params.spellScaling?.damageDice ?? this.resolveSpellDamageDice(params.spellDefinition, 1) ?? "5d8";
    const poolRoll = this.diceService.roll(damageDice);
    let remainingPool = poolRoll.total;
    const sleptTargetIds: string[] = [];
    const stateChanges: CharacterStatePatch[] = [];

    for (const target of [...params.targets].sort((left, right) => left.currentHp - right.currentHp)) {
      if (target.currentHp <= 0 || target.currentHp > remainingPool) {
        continue;
      }
      remainingPool -= target.currentHp;
      sleptTargetIds.push(target.id);
      stateChanges.push(
        this.createTargetStatePatch(target, {
          conditions: this.conditionRuntime.applyCondition(
            this.conditionRuntime.parseConditionsJson(target.conditionsJson),
            this.conditionRuntime.createCondition({
              conditionId: "combat:sleep",
              sourceId: SLEEP_SPELL_ID,
              duration: { type: "rounds", remaining: 10 },
              stackPolicy: "replace",
              tags: ["combat:unconscious", "condition:incapacitated"],
            }),
          ),
        }),
      );
    }

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.command.target,
        targetDistanceFt: params.command.targetDistanceFt,
        spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
        spellScaling: params.spellScaling,
        sleepPoolTotal: poolRoll.total,
        sleepPoolRemaining: remainingPool,
        sleptTargetIds,
      },
      diceResult: poolRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: sleptTargetIds.length ? `Sleep 주문으로 ${sleptTargetIds.length}개 대상을 잠재웠습니다.` : "Sleep 주문이 잠재운 대상이 없습니다.",
      stateChanges,
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveLightSpell(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    target: SessionCharacterForRules;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
  }): ActionResolution {
    const lightRadiusFt = this.resolveLightRadiusFt(params.spellDefinition);
    const existingConditions = this.conditionRuntime.parseConditionsJson(params.target.conditionsJson);
    const nextConditions = this.conditionRuntime.applyCondition(
      existingConditions,
      this.conditionRuntime.createCondition({
        conditionId: LIGHT_SPELL_ID,
        sourceId: LIGHT_SPELL_ID,
        duration: { type: "permanent" },
        stackPolicy: "replace",
        tags: ["effect:bright_light", "utility:illumination", `light_radius:${lightRadiusFt}`],
      }),
    );

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
        spellScaling: params.spellScaling,
        lightRadiusFt,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "Light 주문으로 밝은 빛을 만들었습니다.",
      stateChanges: [this.createTargetStatePatch(params.target, { conditions: nextConditions })],
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveDetectMagicSpell(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    actor: SessionCharacterForRules;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
  }): ActionResolution {
    const nextConditions = this.conditionRuntime.applyCondition(
      this.conditionRuntime.parseConditionsJson(params.actor.conditionsJson),
      this.conditionRuntime.createCondition({
        conditionId: DETECT_MAGIC_SPELL_ID,
        sourceId: DETECT_MAGIC_SPELL_ID,
        duration: { type: "rounds", remaining: 100 },
        stackPolicy: "replace",
        tags: ["concentration", "utility:detection", "detect:magic:30"],
      }),
    );
    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.actor.id,
        targetDistanceFt: 0,
        spellDefinition: this.toStructuredSpellDefinition(
          params.spellDefinition,
          params.spellLevel,
        ),
        spellScaling: params.spellScaling,
        detectionRangeFt: 30,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "Detect Magic으로 30ft 안의 마법 존재를 감지하기 시작했습니다.",
      stateChanges: [
        this.createTargetStatePatch(params.actor, { conditions: nextConditions }),
      ],
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private spellRuntimeEffects(slotLevel: number): ActionRuntimeEffect[] {
    return [{ type: "SPEND_ACTION" }, ...(slotLevel > 0 ? [{ type: "SPEND_SPELL_SLOT", slotLevel } as const] : [])];
  }

  private resolveKnownCantrips(spellId: string): string[] {
    // 아직 캐릭터별 주문 목록 모델이 없어서, MVP에서는 실행 경로가 붙은 cantrip만
    // "시전자가 알고 있는 cantrip"으로 간주한다. 주문 목록 테이블이 생기면 여기만 바꾸면 된다.
    return [CHILL_TOUCH_SPELL_ID, FIRE_BOLT_SPELL_ID, RAY_OF_FROST_SPELL_ID].includes(spellId) ? [spellId] : [];
  }

  private resolveMovementSpeedPenaltyFt(spellDefinition: RuleCatalogEntry | null): number {
    const tag = spellDefinition?.runtimeEffect.tags.find((value) => value.startsWith("movement_speed_penalty:"));
    const value = Number(tag?.slice("movement_speed_penalty:".length));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  private resolveSpellDefinition(spellId: string): RuleCatalogEntry | null {
    const entry = this.ruleCatalog.getEntry(spellId);
    return entry?.kind === "spell_definitions" ? entry : null;
  }

  private toStructuredSpellDefinition(
    spellDefinition: RuleCatalogEntry | null,
    spellLevel: number,
  ): {
    id: string;
    level: number;
    damage: RuleCatalogEntry["damage"];
    targeting: RuleCatalogEntry["targeting"];
    scaling: RuleCatalogEntry["scaling"];
  } | null {
    return spellDefinition
      ? {
          id: spellDefinition.id,
          level: spellLevel,
          damage: spellDefinition.damage,
          targeting: spellDefinition.targeting,
          scaling: spellDefinition.scaling,
        }
      : null;
  }

  private resolveSpellRangeFt(spellDefinition: RuleCatalogEntry | null): number | null {
    if (!spellDefinition || spellDefinition.targeting.type !== "creature") {
      return null;
    }
    return spellDefinition.targeting.rangeFt;
  }

  private resolveSpellLevel(spellDefinition: RuleCatalogEntry): number {
    const tag = spellDefinition.runtimeEffect.tags.find((value) => value.startsWith("spell_level:"));
    const level = Number(tag?.slice("spell_level:".length));
    return Number.isInteger(level) && level >= 0 ? level : 0;
  }

  private resolveSpellKnowledgeRejection(
    actor: SessionCharacterForRules,
    spellId: string,
    spellLevel: number,
  ): "spell_not_known" | "spell_not_prepared" | null {
    const spellInventory = this.parseJson<{
      cantrips?: string[];
      spells?: string[];
      preparedSpells?: string[];
    } | null>(actor.character.spellsJson, null);
    if (!spellInventory) {
      return null;
    }

    const knownCantrips = (spellInventory.cantrips ?? []).map((value) => this.normalizeRuleToken(value));
    if (knownCantrips.includes(spellId)) {
      return null;
    }

    const knownSpells = (spellInventory.spells ?? []).map((value) => this.normalizeRuleToken(value));
    if (!knownSpells.includes(spellId)) {
      return "spell_not_known";
    }

    const preparedSpells = Array.isArray(spellInventory.preparedSpells) ? spellInventory.preparedSpells.map((value) => this.normalizeRuleToken(value)) : null;
    if (spellLevel > 0 && preparedSpells && !preparedSpells.includes(spellId)) {
      return "spell_not_prepared";
    }

    return null;
  }

  private resolveSpellcastingAbilityModifier(actor: SessionCharacterForRules): number {
    const abilities = this.parseJson<Record<string, number>>(actor.character.abilitiesJson, {});
    const classKey = actor.character.className.trim().toLowerCase();
    let abilityKey = "int";
    if (classKey === "cleric" || classKey === "druid" || classKey === "ranger") {
      abilityKey = "wis";
    } else if (classKey === "bard" || classKey === "paladin" || classKey === "sorcerer" || classKey === "warlock") {
      abilityKey = "cha";
    }
    return this.toAbilityModifier(abilities[abilityKey] ?? 10);
  }

  private toAbilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private resolveSpellDamageDice(spellDefinition: RuleCatalogEntry | null, characterLevel: number): string | null {
    if (!spellDefinition?.damage) {
      return null;
    }
    if (spellDefinition.scaling?.mode !== "character_level") {
      return spellDefinition.damage.dice;
    }

    const table = spellDefinition.scaling.table ?? {};
    const matchingThreshold = Object.keys(table)
      .map((key) => Number(key))
      .filter((level) => Number.isInteger(level) && level <= characterLevel)
      .sort((left, right) => right - left)[0];
    const scaledDice = matchingThreshold === undefined ? null : table[String(matchingThreshold)];
    return typeof scaledDice === "string" ? scaledDice : spellDefinition.damage.dice;
  }

  private resolveSpellScaling(spellDefinition: RuleCatalogEntry | null, slotLevel: number): SpellScalingResult | null {
    if (!spellDefinition) {
      return null;
    }

    const baseSpellLevel = this.resolveSpellLevel(spellDefinition);
    if (spellDefinition.scaling?.mode !== "slot_level") {
      return this.spellScaling.resolveUpcast({
        spellId: spellDefinition.id,
        baseSpellLevel,
        slotLevel: baseSpellLevel,
        baseDamageDice: this.resolveSpellBaseDamageDice(spellDefinition),
      });
    }

    return this.spellScaling.resolveUpcast({
      spellId: spellDefinition.id,
      baseSpellLevel,
      slotLevel,
      baseDamageDice: this.resolveSpellBaseDamageDice(spellDefinition),
      baseTargetCount: this.resolveBaseTargetCount(spellDefinition),
      scalingRules: this.toSpellScalingRules(spellDefinition),
    });
  }

  private resolveSpellBaseDamageDice(spellDefinition: RuleCatalogEntry | null): string | null {
    const poolTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("hit_point_pool:"));
    return poolTag?.slice("hit_point_pool:".length) ?? spellDefinition?.damage?.dice ?? null;
  }

  private resolveLightRadiusFt(spellDefinition: RuleCatalogEntry | null): number {
    const radiusTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("light_radius:"));
    const radiusFt = Number(radiusTag?.slice("light_radius:".length));
    return Number.isInteger(radiusFt) && radiusFt > 0 ? radiusFt : 40;
  }

  private resolveBaseTargetCount(spellDefinition: RuleCatalogEntry): number | null {
    const missileTag = spellDefinition.runtimeEffect.tags.find((tag) => tag.startsWith("missile_count:"));
    const missileCount = Number(missileTag?.slice("missile_count:".length));
    if (Number.isInteger(missileCount) && missileCount > 0) {
      return missileCount;
    }

    return spellDefinition.targeting.type === "creature" ? 1 : null;
  }

  private toSpellScalingRules(spellDefinition: RuleCatalogEntry): SpellScalingRule[] {
    const table = spellDefinition.scaling?.table;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      return [];
    }

    const mode = table.mode;
    switch (mode) {
      case "damage_dice":
        return typeof table.dice === "string" ? [{ mode, dice: table.dice, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }] : [];
      case "target_count":
      case "summon_count":
        return typeof table.count === "number" ? [{ mode, count: table.count, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }] : [];
      case "duration":
        return typeof table.unit === "string" && typeof table.amountPerSlotAbove === "number"
          ? [
              {
                mode,
                unit: table.unit as "round" | "minute" | "hour" | "day",
                amountPerSlotAbove: table.amountPerSlotAbove,
                perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove),
              },
            ]
          : [];
      default:
        return [];
    }
  }

  private toOptionalPositiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private resolveDefaultComponentAvailability(): {
    verbal: boolean;
    somatic: boolean;
    material: boolean | null;
  } {
    // 침묵, 구속, 양손 점유 같은 component 차단 상태는 아직 모델링되어 있지 않다.
    // 그래서 현재 action 흐름에서는 기본적으로 V/S component가 가능하다고 보고 훅 검증에 넘긴다.
    return { verbal: true, somatic: true, material: null };
  }

  private resolveSpellOutcome(accepted: boolean, hit: boolean): ActionOutcome {
    if (!accepted) {
      return ActionOutcome.IMPOSSIBLE;
    }
    return hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE;
  }

  private createChillTouchNarration(accepted: boolean, hit: boolean): string {
    if (!accepted) {
      return "주문을 시전할 수 없습니다.";
    }
    return hit ? "Chill Touch가 명중했습니다." : "Chill Touch가 빗나갔습니다.";
  }

  private createSpellAttackNarration(spellId: string, hit: boolean): string {
    const spellName = spellId === FIRE_BOLT_SPELL_ID ? "Fire Bolt" : spellId;
    return hit ? `${spellName}가 명중했습니다.` : `${spellName}가 빗나갔습니다.`;
  }

  private createSpellRejectedNarration(reason: string | null): string {
    switch (reason) {
      case "target_out_of_range":
        return "대상이 주문 사거리 밖에 있습니다.";
      case "unsupported_spell":
        return "지원하지 않는 주문입니다.";
      case "invalid_spell_slot_level":
        return "주문 슬롯 레벨이 유효하지 않습니다.";
      case "spell_not_known":
        return "시전자가 알지 못하는 주문입니다.";
      case "spell_not_prepared":
        return "준비되지 않은 주문입니다.";
      case "cantrip_not_known":
        return "시전자가 알지 못하는 cantrip입니다.";
      case "action_unavailable":
        return "이번 턴에 주문 시전에 사용할 행동이 없습니다.";
      case "missing_verbal_component":
      case "missing_somatic_component":
        return "주문 구성요소 조건을 만족하지 못했습니다.";
      default:
        return "주문을 시전할 수 없습니다.";
    }
  }
}
