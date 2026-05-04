import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";

export type ParsedCommand =
  | { type: "roll"; expression: string }
  | { type: "check"; checkName: string; dc: number }
  | { type: "attack"; target: string | null; dc: number }
  | { type: "cast_spell"; spellId: string; target: string; targetDistanceFt: number }
  | { type: "use_class_feature"; featureId: string; option: string | null }
  | { type: "damage"; target: string; amount: number; damageType?: string }
  | { type: "heal"; target: string; amount: number }
  | { type: "condition"; operation: "add" | "remove"; target: string; condition: string }
  | { type: "unknown"; command: string };

@Injectable()
export class CommandParserService {
  parse(rawText: string): ParsedCommand {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith("/")) {
      return { type: "unknown", command: "" };
    }

    const [commandToken, ...args] = trimmed.slice(1).split(/\s+/);
    const command = commandToken.toLowerCase();

    switch (command) {
      case "roll":
        return this.parseRoll(args);
      case "check":
        return this.parseCheck(args);
      case "attack":
        return this.parseAttack(args);
      case "cast":
        return this.parseCastSpell(args);
      case "feature":
        return this.parseClassFeature(args);
      case "damage":
        return this.parseAmountCommand("damage", args);
      case "heal":
        return this.parseAmountCommand("heal", args);
      case "condition":
        return this.parseCondition(args);
      default:
        return { type: "unknown", command };
    }
  }

  private parseRoll(args: string[]): ParsedCommand {
    const expression = args[0];
    if (!expression) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "ROLL_EXPRESSION_REQUIRED",
      });
    }

    return { type: "roll", expression };
  }

  private parseCheck(args: string[]): ParsedCommand {
    const checkName = args[0];
    if (!checkName) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "CHECK_NAME_REQUIRED",
      });
    }

    return {
      type: "check",
      checkName,
      dc: this.parseDc(args[1], 10),
    };
  }

  private parseAttack(args: string[]): ParsedCommand {
    return {
      type: "attack",
      target: args[0] ?? null,
      dc: this.parseDc(args[1], 10),
    };
  }

  private parseCastSpell(args: string[]): ParsedCommand {
    const spellToken = args[0];
    const target = args[1];

    if (!spellToken || !target) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", {
        reason: "CAST_SPELL_AND_TARGET_REQUIRED",
      });
    }

    return {
      type: "cast_spell",
      spellId: this.normalizeSpellId(spellToken),
      target,
      targetDistanceFt: this.parseOptionalPositiveInteger(
        args[2],
        90,
        "INVALID_TARGET_DISTANCE",
      ),
    };
  }

  private parseClassFeature(args: string[]): ParsedCommand {
    const featureToken = args[0];
    if (!featureToken) {
      throw badRequest("ACTION_400", "?섎せ??紐낅졊?낅땲??", {
        reason: "CLASS_FEATURE_REQUIRED",
      });
    }

    return {
      type: "use_class_feature",
      featureId: this.normalizeClassFeatureId(featureToken),
      option: args[1] ?? null,
    };
  }

  private parseAmountCommand(type: "damage" | "heal", args: string[]): ParsedCommand {
    const target = args[0];
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: `${type.toUpperCase()}_TARGET_AND_AMOUNT_REQUIRED`,
      });
    }

    if (type === "damage") {
      return {
        type,
        target,
        amount,
        ...(args[2] ? { damageType: args[2] } : {}),
      };
    }

    return { type, target, amount };
  }

  private parseCondition(args: string[]): ParsedCommand {
    const operation = args[0] as "add" | "remove";
    const target = args[1];
    const condition = args[2];

    if (!["add", "remove"].includes(operation) || !target || !condition) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "CONDITION_OPERATION_TARGET_AND_NAME_REQUIRED",
      });
    }

    return { type: "condition", operation, target, condition };
  }

  private parseDc(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const normalized = value.toLowerCase().startsWith("dc=")
      ? value.slice("dc=".length)
      : value;
    const dc = Number(normalized);
    if (!Number.isInteger(dc) || dc < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "INVALID_DC",
      });
    }

    return dc;
  }

  private parseOptionalPositiveInteger(
    value: string | undefined,
    fallback: number,
    reason: string,
  ): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", { reason });
    }

    return parsed;
  }

  private normalizeSpellId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    if (normalized === "chill_touch" || normalized === "chilltouch") {
      return "spell.chill_touch";
    }

    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private normalizeClassFeatureId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    const featureIds: Record<string, string> = {
      second_wind: "class.fighter.feature.second_wind",
      secondwind: "class.fighter.feature.second_wind",
      action_surge: "class.fighter.feature.action_surge",
      actionsurge: "class.fighter.feature.action_surge",
      rage: "class.barbarian.feature.rage",
      sneak_attack: "class.rogue.feature.sneak_attack",
      sneakattack: "class.rogue.feature.sneak_attack",
      cunning_action: "class.rogue.feature.cunning_action",
      cunningaction: "class.rogue.feature.cunning_action",
      frenzy: "class.barbarian.subclass_feature.frenzy",
    };

    return featureIds[normalized] ?? normalized;
  }
}
