import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  AvailableActionDto,
  DiceAdvantageState,
  DiceRollResponseDto,
  GamePhase,
} from "@trpg/shared-types";
import { forbidden } from "../../common/exceptions/domain-error";
import { CommandParserService, ParsedCommand } from "./command-parser.service";
import { DiceService } from "./dice.service";
import { RuleEngineService } from "./rule-engine.service";
import { RuleAdvantageState, RuleHookResult } from "./rule-engine.types";

const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const DEFAULT_WEAPON_DAMAGE_TYPE = "slashing";
const DEFAULT_DIRECT_DAMAGE_TYPE = "untyped";
const CHILL_TOUCH_SPELL_ID = "spell.chill_touch";
const CHILL_TOUCH_DAMAGE_TYPE = "necrotic";

type SessionCharacterForRules = {
  id: string;
  characterId: string;
  currentHp: number;
  tempHp: number;
  conditionsJson: string;
  character: {
    id: string;
    name: string;
    className: string;
    maxHp: number;
    abilitiesJson: string;
    proficiencyBonus: number;
    proficientSkillsJson: string;
    armorClass: number;
    speed: number;
  };
};

export type CharacterStatePatch = {
  sessionCharacterId: string;
  currentHp?: number;
  tempHp?: number;
  conditions?: string[];
  markDead?: boolean;
};

export type ActionResolution = {
  structuredAction: Record<string, unknown>;
  diceResult: DiceRollResponseDto | null;
  outcome: ActionOutcome;
  narration: string;
  stateChanges: CharacterStatePatch[];
};

@Injectable()
export class ActionRuleService {
  constructor(
    private readonly commandParser: CommandParserService,
    private readonly diceService: DiceService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  getAvailableActions(params: {
    phase: GamePhase;
    isCurrentTurn: boolean;
    hasActiveCombat: boolean;
    isAlive: boolean;
  }): AvailableActionDto[] {
    if (!params.isAlive) {
      return [
        {
          code: "NO_ACTION",
          label: "행동 불가",
          enabled: false,
          reason: "캐릭터가 행동할 수 없는 상태입니다.",
        },
      ];
    }

    if (params.phase === GamePhase.COMBAT || params.hasActiveCombat) {
      return [
        {
          code: "MOVE",
          label: "이동",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "ATTACK",
          label: "공격",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "CHECK",
          label: "판정",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "END_TURN",
          label: "턴 종료",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
      ];
    }

    return [
      { code: "EXPLORE", label: "탐색", enabled: true, reason: null },
      { code: "TALK", label: "대화", enabled: true, reason: null },
      { code: "CHECK", label: "판정", enabled: true, reason: null },
    ];
  }

  resolveAction(
    rawText: string,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    if (!rawText.trim().startsWith("/")) {
      return {
        structuredAction: { type: "free_text", content: rawText.trim() },
        diceResult: null,
        outcome: ActionOutcome.NO_ROLL,
        narration: "행동을 기록했습니다.",
        stateChanges: [],
      };
    }

    const command = this.commandParser.parse(rawText);
    switch (command.type) {
      case "roll":
        return this.resolveRoll(command);
      case "check":
        return this.resolveCheck(command, actor);
      case "attack":
        return this.resolveAttack(command, actor, sessionCharacters);
      case "cast_spell":
        return this.resolveCastSpell(command, actor, sessionCharacters);
      case "damage":
        return this.resolveDamage(command, sessionCharacters);
      case "heal":
        return this.resolveHeal(command, sessionCharacters);
      case "condition":
        return this.resolveCondition(command, sessionCharacters);
      case "unknown":
      default:
        throw forbidden("ACTION_403", "실행할 수 없는 명령입니다.", {
          reason: "UNKNOWN_COMMAND",
        });
    }
  }

  private resolveRoll(command: Extract<ParsedCommand, { type: "roll" }>): ActionResolution {
    const diceResult = this.diceService.roll(command.expression);
    return {
      structuredAction: { type: "roll", expression: command.expression },
      diceResult,
      outcome: ActionOutcome.NO_ROLL,
      narration: `주사위 결과는 ${diceResult.total}입니다.`,
      stateChanges: [],
    };
  }

  private resolveCheck(
    command: Extract<ParsedCommand, { type: "check" }>,
    actor: SessionCharacterForRules,
  ): ActionResolution {
    const modifier = this.getCheckModifier(actor, command.checkName);
    const expression = modifier >= 0 ? `1d20+${modifier}` : `1d20${modifier}`;
    const diceResult = this.diceService.roll(expression, DiceAdvantageState.NORMAL);
    const success = diceResult.total >= command.dc;

    return {
      structuredAction: {
        type: "skill_check",
        checkName: command.checkName,
        dc: command.dc,
      },
      diceResult,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: success ? "판정에 성공했습니다." : "판정에 실패했습니다.",
      stateChanges: [],
    };
  }

  private resolveAttack(
    command: Extract<ParsedCommand, { type: "attack" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = command.target
      ? this.findTarget(command.target, sessionCharacters)
      : sessionCharacters.find((candidate) => candidate.id !== actor.id) ?? null;
    const modifier = actor.character.proficiencyBonus;
    const targetArmorClass = target?.character.armorClass ?? command.dc;
    const proneRuleContext = this.resolveAttackProneContext(actor, target);
    const attackAdvantageState = this.toDiceAdvantageState(proneRuleContext.advantageState);
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, attackAdvantageState);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20: this.selectNaturalD20(attackRoll),
      attackBonus: modifier,
      targetArmorClass,
      advantageState: proneRuleContext.advantageState,
    });
    const success = attackRuleResult.produced.hit;
    const ruleResults: RuleHookResult<unknown>[] = [
      ...proneRuleContext.ruleResults,
      attackRuleResult,
    ];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;

    if (success && target) {
      damageRoll = this.diceService.roll("1d6");
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: DEFAULT_WEAPON_DAMAGE_TYPE,
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
        type: "attack",
        target: target?.id ?? command.target,
        dc: command.dc,
        targetArmorClass,
        advantageState: attackAdvantageState,
        damageType: DEFAULT_WEAPON_DAMAGE_TYPE,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: this.createAttackNarration(attackRuleResult.produced),
      stateChanges,
    };
  }

  private resolveCastSpell(
    command: Extract<ParsedCommand, { type: "cast_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const targetArmorClass = target.character.armorClass;
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
          target: target.id,
          targetDistanceFt: command.targetDistanceFt,
          targetArmorClass,
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
      damageRoll = this.diceService.roll("1d8");
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: CHILL_TOUCH_DAMAGE_TYPE,
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
        target: target.id,
        targetDistanceFt: command.targetDistanceFt,
        targetArmorClass,
        damageType: CHILL_TOUCH_DAMAGE_TYPE,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: this.resolveSpellOutcome(spellRuleResult.accepted, attackRuleResult.produced.hit),
      narration: this.createChillTouchNarration(spellRuleResult.accepted, attackRuleResult.produced.hit),
      stateChanges,
    };
  }

  private resolveDamage(
    command: Extract<ParsedCommand, { type: "damage" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const damageType = command.damageType ?? DEFAULT_DIRECT_DAMAGE_TYPE;
    const damageRuleResult = this.ruleEngine.applyDamageModifiers({
      baseDamage: command.amount,
      damageType,
      ...this.resolveDamageProfile(target),
    });
    const finalDamage = damageRuleResult.produced.finalDamage;
    const remainingTempHp = Math.max(target.tempHp - finalDamage, 0);
    const overflowDamage = Math.max(finalDamage - target.tempHp, 0);
    const nextHp = Math.max(target.currentHp - overflowDamage, 0);

    return {
      structuredAction: {
        type: "damage",
        target: target.id,
        amount: command.amount,
        damageType,
        finalDamage,
        ruleResults: [damageRuleResult],
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}에게 ${finalDamage} 피해를 적용했습니다.`,
      stateChanges: [
        {
          sessionCharacterId: target.id,
          currentHp: nextHp,
          tempHp: remainingTempHp,
          markDead: nextHp <= 0,
        },
      ],
    };
  }

  private resolveHeal(
    command: Extract<ParsedCommand, { type: "heal" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const nextHp = Math.min(target.currentHp + command.amount, target.character.maxHp);

    return {
      structuredAction: { type: "heal", target: target.id, amount: command.amount },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}의 HP를 ${nextHp}로 회복했습니다.`,
      stateChanges: [{ sessionCharacterId: target.id, currentHp: nextHp }],
    };
  }

  private resolveCondition(
    command: Extract<ParsedCommand, { type: "condition" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const currentConditions = this.parseJson<string[]>(target.conditionsJson, []);
    const nextConditions =
      command.operation === "add"
        ? Array.from(new Set([...currentConditions, command.condition]))
        : currentConditions.filter((condition) => condition !== command.condition);

    return {
      structuredAction: {
        type: "condition",
        operation: command.operation,
        target: target.id,
        condition: command.condition,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}의 상태를 갱신했습니다.`,
      stateChanges: [{ sessionCharacterId: target.id, conditions: nextConditions }],
    };
  }

  private getCheckModifier(actor: SessionCharacterForRules, checkName: string): number {
    const abilities = this.parseJson<Record<string, number>>(actor.character.abilitiesJson, {});
    const proficientSkills = this.parseJson<string[]>(actor.character.proficientSkillsJson, []);
    const abilityKey = this.resolveAbilityKey(checkName);
    const abilityScore = abilities[abilityKey] ?? 10;
    const abilityModifier = Math.floor((abilityScore - 10) / 2);
    const proficiency = proficientSkills.includes(checkName.toLowerCase())
      ? actor.character.proficiencyBonus
      : 0;
    return abilityModifier + proficiency;
  }

  private resolveAbilityKey(checkName: string): string {
    const normalized = checkName.toLowerCase();
    const skillToAbility: Record<string, string> = {
      athletics: "str",
      acrobatics: "dex",
      stealth: "dex",
      arcana: "int",
      investigation: "int",
      perception: "wis",
      survival: "wis",
      persuasion: "cha",
      intimidation: "cha",
      deception: "cha",
    };

    return skillToAbility[normalized] ?? normalized.slice(0, 3);
  }

  private requireTarget(
    targetToken: string,
    sessionCharacters: SessionCharacterForRules[],
  ): SessionCharacterForRules {
    const target = this.findTarget(targetToken, sessionCharacters);
    if (!target) {
      throw forbidden("ACTION_403", "대상을 찾을 수 없습니다.", {
        reason: "TARGET_NOT_FOUND",
      });
    }

    return target;
  }

  private findTarget(
    targetToken: string,
    sessionCharacters: SessionCharacterForRules[],
  ): SessionCharacterForRules | null {
    const normalized = targetToken.toLowerCase();
    return (
      sessionCharacters.find(
        (candidate) =>
          candidate.id === targetToken ||
          candidate.characterId === targetToken ||
          candidate.character.name.toLowerCase() === normalized,
      ) ?? null
    );
  }

  private resolveAttackProneContext(
    actor: SessionCharacterForRules,
    target: SessionCharacterForRules | null,
  ): {
    advantageState: RuleAdvantageState;
    ruleResults: RuleHookResult<unknown>[];
  } {
    const ruleResults: RuleHookResult<unknown>[] = [];
    const advantageStates: RuleAdvantageState[] = [];

    if (this.hasCondition(actor, "prone")) {
      const actorProneResult = this.ruleEngine.applyProneModifiers({
        isProne: true,
        attackerDistanceFt: 0,
        remainingMovementFt: actor.character.speed,
        baseSpeedFt: actor.character.speed,
      });
      ruleResults.push(actorProneResult);
      if (actorProneResult.produced.selfAttackDisadvantage) {
        advantageStates.push("disadvantage");
      }
    }

    if (target && this.hasCondition(target, "prone")) {
      const targetProneResult = this.ruleEngine.applyProneModifiers({
        isProne: true,
        // 현재 command에는 거리 입력이 없으므로 MVP 기본 공격은 5ft 근접 공격으로 본다.
        // 나중에 이동/사거리 모델이 생기면 이 값을 action 입력에서 받아오면 된다.
        attackerDistanceFt: DEFAULT_MELEE_ATTACK_DISTANCE_FT,
        remainingMovementFt: target.character.speed,
        baseSpeedFt: target.character.speed,
      });
      ruleResults.push(targetProneResult);
      advantageStates.push(targetProneResult.produced.incomingAttackAdvantageState);
    }

    return {
      advantageState: this.mergeAdvantageStates(advantageStates),
      ruleResults,
    };
  }

  private resolveDamageProfile(target: SessionCharacterForRules): {
    targetImmunities: string[];
    targetResistances: string[];
    targetVulnerabilities: string[];
  } {
    const conditions = this.getConditions(target);

    return {
      // DB 스키마를 늘리지 않는 MVP 단계라서 임시 룰 태그를 conditionsJson에서 읽는다.
      // 예: resistance:slashing, immunity:necrotic, vulnerability:bludgeoning
      targetImmunities: this.getDamageTypesByPrefix(conditions, "immunity"),
      targetResistances: this.getDamageTypesByPrefix(conditions, "resistance"),
      targetVulnerabilities: this.getDamageTypesByPrefix(conditions, "vulnerability"),
    };
  }

  private getDamageTypesByPrefix(conditions: string[], prefix: string): string[] {
    const normalizedPrefix = `${prefix}:`;
    return conditions
      .map((condition) => this.normalizeRuleToken(condition))
      .filter((condition) => condition.startsWith(normalizedPrefix))
      .map((condition) => condition.slice(normalizedPrefix.length))
      .filter(Boolean);
  }

  private hasCondition(character: SessionCharacterForRules, conditionName: string): boolean {
    const normalizedName = this.normalizeRuleToken(conditionName);
    return this.getConditions(character).some((condition) => {
      const normalizedCondition = this.normalizeRuleToken(condition);
      return (
        normalizedCondition === normalizedName ||
        normalizedCondition === `condition.${normalizedName}`
      );
    });
  }

  private getConditions(character: SessionCharacterForRules): string[] {
    return this.parseJson<string[]>(character.conditionsJson, []);
  }

  private selectNaturalD20(diceResult: DiceRollResponseDto): number {
    if (diceResult.advantageState === DiceAdvantageState.ADVANTAGE) {
      return Math.max(...diceResult.rolls);
    }
    if (diceResult.advantageState === DiceAdvantageState.DISADVANTAGE) {
      return Math.min(...diceResult.rolls);
    }
    return diceResult.rolls[0] ?? diceResult.total - diceResult.modifier;
  }

  private mergeAdvantageStates(states: RuleAdvantageState[]): RuleAdvantageState {
    const hasAdvantage = states.includes("advantage");
    const hasDisadvantage = states.includes("disadvantage");

    if (hasAdvantage && !hasDisadvantage) {
      return "advantage";
    }
    if (hasDisadvantage && !hasAdvantage) {
      return "disadvantage";
    }
    return "normal";
  }

  private toDiceAdvantageState(value: RuleAdvantageState): DiceAdvantageState {
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

  private normalizeRuleToken(value: string): string {
    return value.trim().toLowerCase();
  }

  private createAttackNarration(result: {
    hit: boolean;
    criticalHit: boolean;
    criticalMiss: boolean;
  }): string {
    if (result.criticalHit) {
      return "공격이 치명타로 명중했습니다.";
    }
    if (result.criticalMiss) {
      return "공격이 대실패했습니다.";
    }
    return result.hit ? "공격이 명중했습니다." : "공격이 빗나갔습니다.";
  }

  private resolveKnownCantrips(spellId: string): string[] {
    // 아직 캐릭터별 주문 목록 모델이 없어서, MVP에서는 명령으로 선언된 Chill Touch만
    // "시전자가 알고 있는 cantrip"으로 간주한다. 주문 목록 테이블이 생기면 여기만 바꾸면 된다.
    return spellId === CHILL_TOUCH_SPELL_ID ? [CHILL_TOUCH_SPELL_ID] : [];
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

  private createSpellRejectedNarration(reason: string | null): string {
    switch (reason) {
      case "target_out_of_range":
        return "대상이 주문 사거리 밖에 있습니다.";
      case "unsupported_spell":
        return "지원하지 않는 주문입니다.";
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

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }
}
