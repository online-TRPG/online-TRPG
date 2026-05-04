import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";

export type ParsedCommand =
  | { type: "roll"; expression: string }
  | { type: "check"; checkName: string; dc: number }
  | { type: "attack"; target: string | null; dc: number }
  | { type: "damage"; target: string; amount: number }
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

  private parseAmountCommand(type: "damage" | "heal", args: string[]): ParsedCommand {
    const target = args[0];
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: `${type.toUpperCase()}_TARGET_AND_AMOUNT_REQUIRED`,
      });
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
}
