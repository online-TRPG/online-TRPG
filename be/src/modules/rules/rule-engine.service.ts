import { Injectable } from "@nestjs/common";
import {
  AttackRollInput,
  AttackRollProduced,
  ChillTouchInput,
  ChillTouchProduced,
  DamageModifierInput,
  DamageModifierProduced,
  ProneModifierInput,
  ProneModifierProduced,
  RULE_HOOK_IDS,
  RuleAdvantageState,
  RuleHookResult,
  RuleTurnLogEvent,
} from "./rule-engine.types";

@Injectable()
export class RuleEngineService {
  resolveAttackRoll(
    input: AttackRollInput,
  ): RuleHookResult<AttackRollProduced> {
    this.assertIntegerInRange(input.naturalD20, 1, 20, "naturalD20");
    this.assertInteger(input.attackBonus, "attackBonus");
    this.assertInteger(input.targetArmorClass, "targetArmorClass");

    const criticalHitThreshold = input.criticalHitThreshold ?? 20;
    this.assertIntegerInRange(criticalHitThreshold, 1, 20, "criticalHitThreshold");

    const attackRollTotal = input.naturalD20 + input.attackBonus;
    const criticalMiss = input.naturalD20 === 1;
    const criticalHit = !criticalMiss && input.naturalD20 >= criticalHitThreshold;
    const hit = criticalHit || (!criticalMiss && attackRollTotal >= input.targetArmorClass);

    return this.accepted(RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL, {
      attackRollTotal,
      hit,
      criticalHit,
      criticalMiss,
    }, "attack_roll_resolved");
  }

  applyDamageModifiers(
    input: DamageModifierInput,
  ): RuleHookResult<DamageModifierProduced> {
    this.assertInteger(input.baseDamage, "baseDamage");
    if (input.baseDamage < 0) {
      throw new Error("baseDamage must be greater than or equal to 0.");
    }

    const damageType = this.normalizeToken(input.damageType);
    const immunities = this.toNormalizedSet(input.targetImmunities);
    const resistances = this.toNormalizedSet(input.targetResistances);
    const vulnerabilities = this.toNormalizedSet(input.targetVulnerabilities);
    const appliedDamageModifiers: string[] = [];

    if (immunities.has(damageType)) {
      appliedDamageModifiers.push(`immunity:${damageType}`);
      return this.accepted(RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS, {
        finalDamage: 0,
        appliedDamageModifiers,
      }, "damage_modifiers_applied");
    }

    let finalDamage = input.baseDamage;

    if (resistances.has(damageType)) {
      finalDamage = Math.floor(finalDamage / 2);
      appliedDamageModifiers.push(`resistance:${damageType}`);
    }

    if (vulnerabilities.has(damageType)) {
      finalDamage *= 2;
      appliedDamageModifiers.push(`vulnerability:${damageType}`);
    }

    return this.accepted(RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS, {
      finalDamage,
      appliedDamageModifiers,
    }, "damage_modifiers_applied");
  }

  applyProneModifiers(
    input: ProneModifierInput,
  ): RuleHookResult<ProneModifierProduced> {
    this.assertInteger(input.attackerDistanceFt, "attackerDistanceFt");
    this.assertInteger(input.remainingMovementFt, "remainingMovementFt");
    this.assertInteger(input.baseSpeedFt, "baseSpeedFt");

    const movementCostFt = input.isProne ? Math.floor(input.baseSpeedFt / 2) : 0;
    const produced: ProneModifierProduced = {
      movementCostFt,
      selfAttackDisadvantage: input.isProne,
      incomingAttackAdvantageState: this.resolveIncomingAttackAdvantage(
        input.isProne,
        input.attackerDistanceFt,
      ),
    };

    // 넘어짐에서 일어서기는 이동력 절반을 먼저 지불할 수 있어야 실제 상태 제거로 이어진다.
    // 이동력이 부족한 경우에도 계산 결과는 남겨서 UI와 로그가 같은 이유를 보여줄 수 있게 한다.
    if (input.isProne && input.remainingMovementFt < movementCostFt) {
      return this.rejected(
        RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
        produced,
        "condition_modifier_rejected",
        "not_enough_movement_to_stand",
      );
    }

    return this.accepted(
      RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
      produced,
      "condition_modifiers_applied",
    );
  }

  resolveChillTouch(input: ChillTouchInput): RuleHookResult<ChillTouchProduced> {
    const emptyProduced = this.createRejectedChillTouchProduced();

    if (!input.spellChillTouch) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "unsupported_spell",
      );
    }

    if (!input.casterKnownCantrips.includes("spell.chill_touch")) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "cantrip_not_known",
      );
    }

    if (!input.actionAvailable) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "action_unavailable",
      );
    }

    if (input.targetDistanceFt > 120) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "target_out_of_range",
      );
    }

    if (!input.componentAvailability.verbal) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "missing_verbal_component",
      );
    }

    if (!input.componentAvailability.somatic) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "missing_somatic_component",
      );
    }

    if (!input.spellAttackRollResult) {
      return this.rejected(
        RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        emptyProduced,
        "spell_cast_rejected",
        "spell_attack_roll_required",
      );
    }

    return this.accepted(RULE_HOOK_IDS.CAST_CHILL_TOUCH, {
      validatedSpellCast: true,
      "damagePacket.necrotic": input.spellAttackRollResult.hit
        ? {
            dice: "1d8",
            scalesByCharacterLevel: true,
          }
        : null,
      healingBlockedUntil: input.spellAttackRollResult.hit
        ? "caster_next_turn_start"
        : null,
      undeadAttackDisadvantage: input.spellAttackRollResult.hit && Boolean(input.targetIsUndead),
    }, "spell_cast_validated");
  }

  private createRejectedChillTouchProduced(): ChillTouchProduced {
    return {
      validatedSpellCast: false,
      "damagePacket.necrotic": null,
      healingBlockedUntil: null,
      undeadAttackDisadvantage: false,
    };
  }

  private resolveIncomingAttackAdvantage(
    isProne: boolean,
    attackerDistanceFt: number,
  ): RuleAdvantageState {
    if (!isProne) {
      return "normal";
    }

    return attackerDistanceFt <= 5 ? "advantage" : "disadvantage";
  }

  private accepted<TProduced>(
    hookId: RuleHookResult<TProduced>["hookId"],
    produced: TProduced,
    eventType: string,
  ): RuleHookResult<TProduced> {
    return {
      hookId,
      accepted: true,
      produced,
      statePatch: [],
      turnLogEvents: [this.publicEvent(eventType)],
      rejectedReason: null,
    };
  }

  private rejected<TProduced>(
    hookId: RuleHookResult<TProduced>["hookId"],
    produced: TProduced,
    eventType: string,
    rejectedReason: string,
  ): RuleHookResult<TProduced> {
    return {
      hookId,
      accepted: false,
      produced,
      statePatch: [],
      turnLogEvents: [this.publicEvent(eventType)],
      rejectedReason,
    };
  }

  private publicEvent(type: string): RuleTurnLogEvent {
    return { type, public: true };
  }

  private toNormalizedSet(values: string[] | undefined): Set<string> {
    return new Set((values ?? []).map((value) => this.normalizeToken(value)));
  }

  private normalizeToken(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      throw new Error("rule token must not be empty.");
    }
    return normalized;
  }

  private assertInteger(value: number, field: string): void {
    if (!Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
  }

  private assertIntegerInRange(value: number, min: number, max: number, field: string): void {
    this.assertInteger(value, field);
    if (value < min || value > max) {
      throw new Error(`${field} must be between ${min} and ${max}.`);
    }
  }
}
