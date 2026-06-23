import { Injectable } from "@nestjs/common";
import {
  DiceAdvantageState as PrismaDiceAdvantageState,
} from "@prisma/client";
import {
  DiceAdvantageState,
  DiceRollRequestDto,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";

const supportedDice = new Set([4, 6, 8, 10, 12, 20, 100]);

type ParsedDiceExpression = {
  terms: Array<{ count: number; sides: number }>;
  modifier: number;
};

@Injectable()
export class DiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  roll(
    expression: string,
    advantageState: DiceAdvantageState = DiceAdvantageState.NORMAL,
  ): DiceRollResponseDto {
    const parsed = this.parseExpression(expression);
    const normalizedAdvantage = this.normalizeAdvantage(advantageState);

    const advantageTerm = parsed.terms.length === 1 ? parsed.terms[0] : null;
    if (
      normalizedAdvantage !== DiceAdvantageState.NORMAL &&
      (!advantageTerm || advantageTerm.count !== 1 || advantageTerm.sides !== 20)
    ) {
      throw badRequest("DICE_400", "advantage/disadvantage는 d20 판정에만 사용할 수 있습니다.", {
        reason: "ADVANTAGE_REQUIRES_D20",
      });
    }

    const rolls =
      normalizedAdvantage === DiceAdvantageState.NORMAL
        ? parsed.terms.flatMap((term) => this.rollMany(term.count, term.sides))
        : this.rollMany(2, 20);
    const selectedRolls =
      normalizedAdvantage === DiceAdvantageState.ADVANTAGE
        ? [Math.max(...rolls)]
        : normalizedAdvantage === DiceAdvantageState.DISADVANTAGE
          ? [Math.min(...rolls)]
          : rolls;

    return {
      expression: this.normalizeExpression(parsed),
      rolls,
      modifier: parsed.modifier,
      // advantage 상태에서는 실제 선택된 d20 하나만 총합에 반영한다.
      total: selectedRolls.reduce((sum, value) => sum + value, 0) + parsed.modifier,
      advantageState: normalizedAdvantage,
    };
  }

  async rollAndPersist(
    userId: string,
    sessionId: string,
    dto: DiceRollRequestDto,
  ): Promise<DiceRollResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    const result = this.roll(dto.expression, dto.advantageState ?? DiceAdvantageState.NORMAL);
    const turnLogId = await this.resolveTurnLogId(session.id, dto.turnLogId);

    await this.prisma.diceRollLog.create({
      data: {
        sessionId: session.id,
        userId,
        expression: result.expression,
        rollsJson: JSON.stringify(result.rolls),
        modifier: result.modifier,
        total: result.total,
        advantageState: this.toPrismaAdvantage(result.advantageState),
        reason: dto.reason?.trim() || null,
        turnLogId,
      },
    });

    this.realtimeEvents.emitDiceRolled(session.id, result);

    return result;
  }

  private async resolveTurnLogId(
    sessionId: string,
    turnLogId: string | undefined,
  ): Promise<string | null> {
    const trimmedTurnLogId = turnLogId?.trim();
    if (!trimmedTurnLogId) {
      return null;
    }

    const turnLog = await this.prisma.turnLog.findFirst({
      where: {
        id: trimmedTurnLogId,
        sessionId,
      },
      select: { id: true },
    });

    if (!turnLog) {
      // 잘못된 turnLogId를 그대로 FK에 넣으면 Prisma 오류가 500으로 올라간다.
      // 사용자 입력 문제로 명확히 내려주기 위해 저장 전에 세션 소속 로그인지 검증한다.
      throw badRequest("DICE_400", "turnLogId가 올바르지 않습니다.", {
        reason: "INVALID_TURN_LOG_ID",
      });
    }

    return turnLog.id;
  }

  private parseExpression(expression: string): ParsedDiceExpression {
    const normalized = expression.replace(/\s+/g, "").toLowerCase();
    const match = normalized.match(/^((?:\d*d\d+\+)*\d*d\d+)([+-]\d+)?$/);
    if (!match) {
      throw badRequest("DICE_400", "주사위 수식이 올바르지 않습니다.", {
        reason: "INVALID_DICE_EXPRESSION",
      });
    }

    const terms = match[1].split("+").map((term) => {
      const termMatch = term.match(/^(\d*)d(\d+)$/);
      const count = termMatch?.[1] ? Number(termMatch[1]) : 1;
      const sides = Number(termMatch?.[2]);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        throw badRequest("DICE_400", "주사위 개수가 올바르지 않습니다.", {
          reason: "INVALID_DICE_COUNT",
        });
      }
      if (!supportedDice.has(sides)) {
        throw badRequest("DICE_400", "지원하지 않는 주사위입니다.", {
          reason: "UNSUPPORTED_DICE_SIDES",
        });
      }
      return { count, sides };
    });
    const totalDice = terms.reduce((sum, term) => sum + term.count, 0);
    if (totalDice > 100) {
      throw badRequest("DICE_400", "주사위 개수가 올바르지 않습니다.", {
        reason: "INVALID_DICE_COUNT",
      });
    }
    const modifier = match[2] ? Number(match[2]) : 0;
    return { terms, modifier };
  }

  private rollMany(count: number, sides: number): number[] {
    return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  }

  private normalizeExpression(parsed: ParsedDiceExpression): string {
    const modifier =
      parsed.modifier > 0
        ? `+${parsed.modifier}`
        : parsed.modifier < 0
          ? String(parsed.modifier)
          : "";
    const dice = parsed.terms
      .map((term) => `${term.count}d${term.sides}`)
      .join("+");
    return `${dice}${modifier}`;
  }

  private normalizeAdvantage(value: DiceAdvantageState): DiceAdvantageState {
    const lower = String(value).toLowerCase();
    if (lower === "advantage") {
      return DiceAdvantageState.ADVANTAGE;
    }
    if (lower === "disadvantage") {
      return DiceAdvantageState.DISADVANTAGE;
    }
    return DiceAdvantageState.NORMAL;
  }

  private toPrismaAdvantage(value: DiceAdvantageState): PrismaDiceAdvantageState {
    switch (value) {
      case DiceAdvantageState.ADVANTAGE:
        return PrismaDiceAdvantageState.ADVANTAGE;
      case DiceAdvantageState.DISADVANTAGE:
        return PrismaDiceAdvantageState.DISADVANTAGE;
      case DiceAdvantageState.NORMAL:
      default:
        return PrismaDiceAdvantageState.NORMAL;
    }
  }
}
