import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  DiceAdvantageState,
  MainCommandIntent,
  MainCommandNarrativeCheckEffectDto,
  TurnLogDiceResultDto,
} from "@trpg/shared-types";
import { AiService } from "../ai/ai.service";

type MainCommandCheckEffect = MainCommandNarrativeCheckEffectDto;
export type SanitizedMainCommandDiceResult = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  advantageState: DiceAdvantageState;
  naturalRoll: number;
  outcome: ActionOutcome;
  dc?: number;
};

@Injectable()
export class MainCommandCheckResultNarrationService {
  constructor(private readonly aiService: AiService) {}

  sanitizeDiceResult(value: TurnLogDiceResultDto | undefined): SanitizedMainCommandDiceResult | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const rawRolls = value.rolls;
    const rolls = Array.isArray(rawRolls)
      ? rawRolls.flatMap((roll) =>
          Number.isInteger(roll) && roll >= 1 && roll <= 20 ? [roll] : [],
        )
      : [];
    const total = this.readFiniteNumber(value.total);
    const modifier = this.readFiniteNumber(value.modifier) ?? 0;
    const dc = this.readFiniteNumber(value.dc);
    const naturalRoll = this.readFiniteNumber(value.naturalRoll) ?? rolls[0] ?? null;
    const expression = typeof value.expression === "string" && value.expression.trim() ? value.expression.trim() : "1d20";
    const advantageState =
      value.advantageState === DiceAdvantageState.ADVANTAGE ||
      value.advantageState === DiceAdvantageState.DISADVANTAGE
        ? value.advantageState
        : DiceAdvantageState.NORMAL;
    const outcome =
      value.outcome === ActionOutcome.SUCCESS || value.outcome === ActionOutcome.FAILURE || value.outcome === ActionOutcome.IMPOSSIBLE
        ? value.outcome
        : ActionOutcome.NO_ROLL;

    if (total === null || naturalRoll === null || !rolls.length) {
      return null;
    }

    return {
      expression,
      rolls,
      modifier,
      total,
      advantageState,
      naturalRoll,
      outcome,
      ...(dc !== null ? { dc } : {}),
    };
  }

  formatRollSummary(diceResult: SanitizedMainCommandDiceResult | null, outcome: ActionOutcome): string | null {
    if (!diceResult) {
      return null;
    }

    const { expression, rolls, total, modifier } = diceResult;
    const dc = typeof diceResult.dc === "number" ? diceResult.dc : null;

    const outcomeLabel =
      outcome === ActionOutcome.SUCCESS
        ? "성공"
        : outcome === ActionOutcome.FAILURE
          ? "실패"
          : outcome === ActionOutcome.IMPOSSIBLE
            ? "불가"
            : "결과 없음";
    const modifierText = modifier ? `, 수정치 ${modifier >= 0 ? "+" : ""}${modifier}` : "";
    const dcText = dc !== null ? ` / DC ${dc}` : "";
    return `판정 결과: ${expression} = ${total} (굴림 ${rolls.join(", ")}${modifierText})${dcText} — ${outcomeLabel}`;
  }

  withRollSummary(message: string, summary: string | null): string {
    if (!summary) {
      return message;
    }
    return `${summary}\n${message}`;
  }

  async buildMessageForOutcome(
    userId: string,
    sessionId: string,
    effect: MainCommandCheckEffect,
    outcome: ActionOutcome,
  ): Promise<string> {
    if (outcome !== ActionOutcome.SUCCESS) {
      return this.buildTemplateMessage(effect, outcome);
    }

    try {
      if (this.isSocialInformationCheck(effect.intent)) {
        return await this.buildSocialInformationSuccessMessage(userId, sessionId, effect);
      }
      if (effect.intent === MainCommandIntent.READ_EMOTION) {
        return await this.buildReadEmotionSuccessMessage(userId, sessionId, effect);
      }
    } catch {
      return this.buildTemplateMessage(effect, outcome);
    }

    return this.buildTemplateMessage(effect, outcome);
  }

  buildTemplateMessage(effect: MainCommandCheckEffect, outcome: ActionOutcome): string {
    const pointLabel = effect.mapPoint ? ` (${effect.mapPoint.x}, ${effect.mapPoint.y}) 주변` : "";
    const targetLabel = effect.targetName ?? this.inferTargetLabel(effect);
    const itemLabel = effect.itemName ?? "준비한 물건";

    if (outcome !== ActionOutcome.SUCCESS) {
      return this.buildFailedNarration(effect, targetLabel, itemLabel, pointLabel);
    }

    const visibleSummary = effect.visibleEntityNames.length ? ` 눈에 띄는 대상: ${effect.visibleEntityNames.join(", ")}.` : "";

    return this.buildSuccessfulNarration(effect, targetLabel, itemLabel, pointLabel, visibleSummary);
  }

  private isSocialInformationCheck(intent: MainCommandIntent): boolean {
    return [MainCommandIntent.SOCIAL_PERSUADE, MainCommandIntent.SOCIAL_INTIMIDATE, MainCommandIntent.SOCIAL_DECEIVE].includes(intent);
  }

  private async buildSocialInformationSuccessMessage(userId: string, sessionId: string, effect: MainCommandCheckEffect): Promise<string> {
    const aiResult = await this.aiService.runCheckResult(sessionId, userId, {
      outcome: "SUCCESS",
      intent: effect.intent,
      playerText: effect.playerText,
      actionSummary: effect.actionSummary,
      targetName: effect.targetName,
      targetSummary: effect.targetSummary,
      targetDisposition: effect.targetDisposition,
      sceneSummary: effect.sceneText,
      publicClues: effect.publicClues,
      visibleEntities: effect.visibleEntityNames,
      outputMode: "NPC_REPLY",
    });
    const narration = aiResult.parsed.narration.trim();
    return narration ? narration : this.buildTemplateMessage(effect, ActionOutcome.SUCCESS);
  }

  private async buildReadEmotionSuccessMessage(userId: string, sessionId: string, effect: MainCommandCheckEffect): Promise<string> {
    const aiResult = await this.aiService.runCheckResult(sessionId, userId, {
      outcome: "SUCCESS",
      intent: effect.intent,
      playerText: effect.playerText,
      actionSummary: effect.actionSummary,
      targetName: effect.targetName,
      targetSummary: effect.targetSummary,
      targetDisposition: effect.targetDisposition,
      sceneSummary: effect.sceneText,
      publicClues: effect.publicClues,
      visibleEntities: effect.visibleEntityNames,
      outputMode: "OBSERVATION",
    });
    const narration = aiResult.parsed.narration.trim();
    return narration ? narration : this.buildTemplateMessage(effect, ActionOutcome.SUCCESS);
  }

  private buildSuccessfulNarration(
    effect: MainCommandCheckEffect,
    targetLabel: string,
    itemLabel: string,
    pointLabel: string,
    visibleSummary: string,
  ): string {
    switch (effect.intent) {
      case MainCommandIntent.OBSERVE_AREA:
        return `판정에 성공했습니다. ${pointLabel || "주변"}을 차분히 훑자 장면의 흐름과 눈에 띄는 단서가 또렷해집니다.${visibleSummary}`.trim();
      case MainCommandIntent.INVESTIGATE_OBJECT:
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return `판정에 성공했습니다. ${targetLabel}을(를) 꼼꼼히 조사해 겉보기만으로는 알 수 없던 흔적을 찾아냅니다.`;
      case MainCommandIntent.LISTEN:
        return "판정에 성공했습니다. 주변 소음 사이에서 의미 있는 기척과 방향을 구분해냅니다.";
      case MainCommandIntent.DETECT_DANGER:
        return "판정에 성공했습니다. 사소한 어긋남을 눈치채고 위험의 징후를 먼저 포착합니다.";
      case MainCommandIntent.SOCIAL_PERSUADE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 말의 무게를 받아들이고 태도를 누그러뜨립니다.`;
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 압박을 버티지 못하고 눈에 띄게 동요합니다.`;
      case MainCommandIntent.SOCIAL_DECEIVE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 꾸며낸 말에 빈틈을 찾지 못하고 넘어갑니다.`;
      case MainCommandIntent.READ_EMOTION:
        return `판정에 성공했습니다. ${targetLabel}의 표정과 말 사이에서 감춰진 감정의 결을 읽어냅니다.`;
      case MainCommandIntent.SPECIAL_MOVE:
        return "판정에 성공했습니다. 아슬아슬한 움직임이 통하며 원하는 위치까지 몸을 실어냅니다.";
      case MainCommandIntent.INTERACT_OBJECT:
        return `판정에 성공했습니다. ${targetLabel}을(를) 조작하자 의도한 반응이 나타납니다.`;
      case MainCommandIntent.USE_TOOL:
      case MainCommandIntent.USE_ITEM_EXPLORE:
      case MainCommandIntent.USE_ITEM_COMBAT:
        return `판정에 성공했습니다. ${itemLabel} 활용이 제대로 맞아떨어져 상황을 유리하게 바꿉니다.`;
      case MainCommandIntent.COMBAT_MANEUVER:
        return "판정에 성공했습니다. 전투 기동이 먹혀들어 상대의 균형과 흐름을 흔듭니다.";
      case MainCommandIntent.ENVIRONMENT_USE:
        return `판정에 성공했습니다. ${targetLabel}을(를) 전술적으로 활용해 장면의 지형을 유리하게 끌어옵니다.`;
      case MainCommandIntent.IMPROVISED_ATTACK:
        return `판정에 성공했습니다. 즉석 공격이 허를 찌르며 ${targetLabel}에게 제대로 닿습니다.`;
      case MainCommandIntent.CALLED_SHOT:
        return `판정에 성공했습니다. 노린 지점이 정확히 맞아 ${targetLabel}의 움직임에 빈틈이 생깁니다.`;
      case MainCommandIntent.READY_ACTION:
        return "판정에 성공했습니다. 준비한 행동이 정확한 순간에 이어질 수 있게 자세를 잡습니다.";
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return "판정에 성공했습니다. 주문의 효과를 창의적으로 응용해 예상 밖의 돌파구를 만듭니다.";
      default:
        return "판정에 성공했습니다. 단서의 실마리가 분명히 드러납니다.";
    }
  }

  private buildFailedNarration(effect: MainCommandCheckEffect, targetLabel: string, itemLabel: string, pointLabel: string): string {
    switch (effect.intent) {
      case MainCommandIntent.OBSERVE_AREA:
        return `판정에 실패했습니다. ${pointLabel || "주변"}을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
      case MainCommandIntent.INVESTIGATE_OBJECT:
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return `판정에 실패했습니다. ${targetLabel}을(를) 살펴보지만 눈에 띄는 흔적은 끝내 드러나지 않습니다.`;
      case MainCommandIntent.LISTEN:
        return "판정에 실패했습니다. 소리와 기척이 주변 소음에 묻혀 뚜렷한 정보를 얻지 못합니다.";
      case MainCommandIntent.DETECT_DANGER:
        return `판정에 실패했습니다. ${targetLabel || pointLabel || "주변"}을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
      case MainCommandIntent.SOCIAL_PERSUADE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 말을 끝까지 듣지만 마음을 바꾸지는 않습니다.`;
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 잠시 굳지만, 이내 버티듯 시선을 피하지 않습니다.`;
      case MainCommandIntent.SOCIAL_DECEIVE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 말의 빈틈을 눈치채고 경계심을 높입니다.`;
      case MainCommandIntent.READ_EMOTION:
        return `판정에 실패했습니다. ${targetLabel}의 반응은 읽히는 듯하다가도 곧 흐려져 확신을 주지 않습니다.`;
      case MainCommandIntent.SPECIAL_MOVE:
        return "판정에 실패했습니다. 시도한 움직임은 이어지지만, 원하는 만큼 민첩하게 자리를 잡지는 못합니다.";
      case MainCommandIntent.INTERACT_OBJECT:
        return `판정에 실패했습니다. ${targetLabel}을(를) 건드려 보지만 기대한 반응은 일어나지 않습니다.`;
      case MainCommandIntent.USE_TOOL:
      case MainCommandIntent.USE_ITEM_EXPLORE:
      case MainCommandIntent.USE_ITEM_COMBAT:
        return `판정에 실패했습니다. ${itemLabel}을(를) 꺼내 써보지만 상황에 맞게 풀리지는 않습니다.`;
      case MainCommandIntent.COMBAT_MANEUVER:
        return "판정에 실패했습니다. 전투 기동은 상대의 대응에 막혀 흐름을 빼앗지 못합니다.";
      case MainCommandIntent.ENVIRONMENT_USE:
        return `판정에 실패했습니다. ${targetLabel}을(를) 이용하려 하지만 장면은 의도한 만큼 따라주지 않습니다.`;
      case MainCommandIntent.IMPROVISED_ATTACK:
        return `판정에 실패했습니다. 즉석 공격은 빗나가거나 힘이 실리지 않아 ${targetLabel}에게 결정타가 되지 못합니다.`;
      case MainCommandIntent.CALLED_SHOT:
        return `판정에 실패했습니다. 노린 지점은 어긋나고 ${targetLabel}은(는) 결정적인 빈틈을 내주지 않습니다.`;
      case MainCommandIntent.READY_ACTION:
        return "판정에 실패했습니다. 타이밍을 재려 했지만 전장의 흐름이 어긋나 준비가 흔들립니다.";
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return "판정에 실패했습니다. 주문의 응용은 가능성을 보이지만 원하는 효과로 이어지지는 않습니다.";
      default:
        return "판정에 실패했습니다. 조사를 진행했지만 아직 결정적인 실마리는 잡히지 않습니다.";
    }
  }

  private inferTargetLabel(effect: MainCommandCheckEffect): string {
    if (effect.mapPoint) {
      return `(${effect.mapPoint.x}, ${effect.mapPoint.y}) 지점`;
    }
    if (
      effect.intent === MainCommandIntent.SOCIAL_PERSUADE ||
      effect.intent === MainCommandIntent.SOCIAL_INTIMIDATE ||
      effect.intent === MainCommandIntent.SOCIAL_DECEIVE ||
      effect.intent === MainCommandIntent.READ_EMOTION
    ) {
      return "상대";
    }
    return "대상";
  }

  private readFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
