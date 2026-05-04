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

type SessionCharacterForRules = {
  id: string;
  characterId: string;
  currentHp: number;
  tempHp: number;
  conditionsJson: string;
  character: {
    id: string;
    name: string;
    maxHp: number;
    abilitiesJson: string;
    proficiencyBonus: number;
    proficientSkillsJson: string;
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
        narration: "행동이 기록되었습니다.",
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
      case "damage":
        return this.resolveDamage(command, sessionCharacters);
      case "heal":
        return this.resolveHeal(command, sessionCharacters);
      case "condition":
        return this.resolveCondition(command, sessionCharacters);
      case "unknown":
      default:
        throw forbidden("ACTION_403", "실행할 수 없는 명령어입니다.", {
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
    const modifier = actor.character.proficiencyBonus;
    const attackRoll = this.diceService.roll(`1d20+${modifier}`);
    const success = attackRoll.total >= command.dc;
    const target = command.target
      ? this.findTarget(command.target, sessionCharacters)
      : sessionCharacters.find((candidate) => candidate.id !== actor.id) ?? null;
    const stateChanges: CharacterStatePatch[] = [];

    if (success && target) {
      const damageRoll = this.diceService.roll("1d6");
      const nextHp = Math.max(target.currentHp - damageRoll.total, 0);
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
      },
      diceResult: attackRoll,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: success ? "공격이 명중했습니다." : "공격이 빗나갔습니다.",
      stateChanges,
    };
  }

  private resolveDamage(
    command: Extract<ParsedCommand, { type: "damage" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const remainingTempHp = Math.max(target.tempHp - command.amount, 0);
    const overflowDamage = Math.max(command.amount - target.tempHp, 0);
    const nextHp = Math.max(target.currentHp - overflowDamage, 0);

    return {
      structuredAction: { type: "damage", target: target.id, amount: command.amount },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}에게 ${command.amount} 피해를 적용했습니다.`,
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

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }
}
