import { Injectable } from "@nestjs/common";
import { MainCommandIntent, SubmitMainCommandDto } from "@trpg/shared-types";
import type { InterpreterParsedForRouting } from "./main-commands.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";
import { MainCommandValidatorService } from "./main-command-validator.service";

export type InterpreterActionRoute =
  | {
      route: "MAIN_COMMAND";
      intent: MainCommandIntent;
    }
  | {
      route: "MAP_CONTROL_ACTION";
      message: string;
    }
  | {
      route: "GAME_META_QUESTION";
    }
  | {
      route: "OUT_OF_SCOPE";
      message: string;
    };

export type ResolvedInterpreterActionRoute = {
  actionType: string;
  config: InterpreterActionRoute;
};

export type ResolvedTextFallbackRoute = {
  route: ResolvedInterpreterActionRoute;
  parsed: InterpreterParsedForRouting;
};

const INTERPRETER_ACTION_TYPE_ROUTES: Record<string, InterpreterActionRoute> = {
  TALK_TO_NPC: { route: "MAIN_COMMAND", intent: MainCommandIntent.TALK_TO_NPC },
  SOCIAL_PERSUADE: { route: "MAIN_COMMAND", intent: MainCommandIntent.SOCIAL_PERSUADE },
  SOCIAL_INTIMIDATE: { route: "MAIN_COMMAND", intent: MainCommandIntent.SOCIAL_INTIMIDATE },
  SOCIAL_DECEIVE: { route: "MAIN_COMMAND", intent: MainCommandIntent.SOCIAL_DECEIVE },
  READ_EMOTION: { route: "MAIN_COMMAND", intent: MainCommandIntent.READ_EMOTION },
  ASK_SCENE_INFO: { route: "MAIN_COMMAND", intent: MainCommandIntent.ASK_SCENE_INFO },
  ASK_HINT: { route: "MAIN_COMMAND", intent: MainCommandIntent.ASK_HINT },
  ASK_SUMMARY: { route: "MAIN_COMMAND", intent: MainCommandIntent.ASK_SUMMARY },
  REQUEST_SCENE_TRANSITION: {
    route: "MAIN_COMMAND",
    intent: MainCommandIntent.REQUEST_SCENE_TRANSITION,
  },
  OBSERVE_AREA: { route: "MAIN_COMMAND", intent: MainCommandIntent.OBSERVE_AREA },
  INSPECT_STORY_OBJECT: { route: "MAIN_COMMAND", intent: MainCommandIntent.INSPECT_STORY_OBJECT },
  INVESTIGATE_OBJECT: { route: "MAIN_COMMAND", intent: MainCommandIntent.INVESTIGATE_OBJECT },
  LISTEN: { route: "MAIN_COMMAND", intent: MainCommandIntent.LISTEN },
  DETECT_DANGER: { route: "MAIN_COMMAND", intent: MainCommandIntent.DETECT_DANGER },
  SPECIAL_MOVE: { route: "MAIN_COMMAND", intent: MainCommandIntent.SPECIAL_MOVE },
  INTERACT_OBJECT: { route: "MAIN_COMMAND", intent: MainCommandIntent.INTERACT_OBJECT },
  USE_TOOL: { route: "MAIN_COMMAND", intent: MainCommandIntent.USE_TOOL },
  USE_ITEM_EXPLORE: { route: "MAIN_COMMAND", intent: MainCommandIntent.USE_ITEM_EXPLORE },
  SPLIT_PARTY_TASK: { route: "MAIN_COMMAND", intent: MainCommandIntent.SPLIT_PARTY_TASK },
  COMBAT_MANEUVER: { route: "MAIN_COMMAND", intent: MainCommandIntent.COMBAT_MANEUVER },
  ENVIRONMENT_USE: { route: "MAIN_COMMAND", intent: MainCommandIntent.ENVIRONMENT_USE },
  IMPROVISED_ATTACK: { route: "MAIN_COMMAND", intent: MainCommandIntent.IMPROVISED_ATTACK },
  CALLED_SHOT: { route: "MAIN_COMMAND", intent: MainCommandIntent.CALLED_SHOT },
  READY_ACTION: { route: "MAIN_COMMAND", intent: MainCommandIntent.READY_ACTION },
  REACTION_REQUEST: { route: "MAIN_COMMAND", intent: MainCommandIntent.REACTION_REQUEST },
  COMBAT_TALK: { route: "MAIN_COMMAND", intent: MainCommandIntent.COMBAT_TALK },
  USE_ITEM_COMBAT: { route: "MAIN_COMMAND", intent: MainCommandIntent.USE_ITEM_COMBAT },
  USE_SPELL_CREATIVELY: { route: "MAIN_COMMAND", intent: MainCommandIntent.USE_SPELL_CREATIVELY },
  TACTIC_QUERY: { route: "MAIN_COMMAND", intent: MainCommandIntent.TACTIC_QUERY },
  ASK_RULE: { route: "MAIN_COMMAND", intent: MainCommandIntent.ASK_RULE },
  MAP_MOVE: {
    route: "MAP_CONTROL_ACTION",
    message: "이동은 메인탭에서 처리할 수 없습니다. 맵 하단의 이동 버튼으로 조작해주세요.",
  },
  MAP_ATTACK: {
    route: "MAP_CONTROL_ACTION",
    message: "공격은 메인탭에서 처리할 수 없습니다. 맵 하단의 공격 버튼으로 조작해주세요.",
  },
  MAP_CAST_SPELL: {
    route: "MAP_CONTROL_ACTION",
    message: "전투 주문 사용은 메인탭에서 처리할 수 없습니다. 맵 하단의 행동 버튼으로 조작해주세요.",
  },
  MAP_USE_CLASS_FEATURE: {
    route: "MAP_CONTROL_ACTION",
    message: "전투 특성 사용은 메인탭에서 처리할 수 없습니다. 맵 하단의 행동 버튼으로 조작해주세요.",
  },
  MAP_END_TURN: {
    route: "MAP_CONTROL_ACTION",
    message: "턴 종료는 메인탭에서 처리할 수 없습니다. 맵 하단의 턴 종료 버튼으로 조작해주세요.",
  },
  GM_ONLY_DAMAGE: { route: "OUT_OF_SCOPE", message: "처리할 수 없는 요청입니다." },
  GM_ONLY_HEAL: { route: "OUT_OF_SCOPE", message: "처리할 수 없는 요청입니다." },
  GM_ONLY_CONDITION: { route: "OUT_OF_SCOPE", message: "처리할 수 없는 요청입니다." },
  GM_ONLY_INVENTORY_MUTATION: { route: "OUT_OF_SCOPE", message: "처리할 수 없는 요청입니다." },
  OUT_OF_SCOPE: { route: "OUT_OF_SCOPE", message: "처리할 수 없는 요청입니다." },
  GAME_META_QUESTION: { route: "GAME_META_QUESTION" },
};

@Injectable()
export class MainCommandInterpreterRouterService {
  constructor(
    private readonly mainCommandValidator: MainCommandValidatorService,
    private readonly mainCommandSceneEntity: MainCommandSceneEntityService,
  ) {}

  resolveTextFallbackMainCommandIntent(dto: SubmitMainCommandDto, actionType?: string | null): MainCommandIntent | null {
    if (actionType?.trim().toUpperCase() !== "OUT_OF_SCOPE") {
      return null;
    }

    const text = dto.playerText.trim();
    if (!text) {
      return null;
    }

    if (/(조사|살피|살펴|찾|뒤지|확인)/.test(text)) {
      return MainCommandIntent.INVESTIGATE_OBJECT;
    }

    return null;
  }

  buildTextFallbackInterpretedCommand(
    dto: SubmitMainCommandDto,
    parsed: InterpreterParsedForRouting,
    intent: MainCommandIntent,
  ): InterpreterParsedForRouting {
    const actionSummary = dto.playerText.trim() || parsed.action.approach || intent;
    return {
      ...parsed,
      needsClarification: false,
      clarificationQuestion: null,
      action: {
        ...parsed.action,
        type: intent,
        approach: actionSummary,
        confidence: Math.max(parsed.action.confidence ?? 0, 0.55),
        requiresRoll: true,
        suggestedDifficulty: parsed.action.suggestedDifficulty ?? "medium",
      },
    };
  }

  resolveTextFallbackRoute(dto: SubmitMainCommandDto, parsed: InterpreterParsedForRouting): ResolvedTextFallbackRoute | null {
    const intent = this.resolveTextFallbackMainCommandIntent(dto, parsed.action.type);
    if (!intent) {
      return null;
    }

    return {
      route: {
        actionType: intent,
        config: { route: "MAIN_COMMAND", intent },
      },
      parsed: this.buildTextFallbackInterpretedCommand(dto, parsed, intent),
    };
  }

  resolveInterpreterActionTypeRoute(actionType?: string | null): ResolvedInterpreterActionRoute | null {
    const normalizedActionType = actionType?.trim().toUpperCase();
    if (!normalizedActionType) {
      return null;
    }

    const config = INTERPRETER_ACTION_TYPE_ROUTES[normalizedActionType];
    return config ? { actionType: normalizedActionType, config } : null;
  }

  buildInterpreterRoutedMainCommandDto(
    dto: SubmitMainCommandDto,
    intent: MainCommandIntent,
    visibleEntities: VisibleSceneEntity[],
    parsed: InterpreterParsedForRouting,
  ): SubmitMainCommandDto {
    const target = this.resolveInterpreterRouteTarget(dto, intent, visibleEntities, parsed.action.targetId);
    return {
      ...dto,
      commandId: intent,
      intent,
      targetId: dto.targetId ?? target?.id,
      targetType: dto.targetType ?? target?.kind,
      itemId: dto.itemId ?? parsed.mentionedItemId ?? undefined,
      spellId: dto.spellId ?? parsed.action.spellId ?? parsed.mentionedSpellId ?? undefined,
    };
  }

  buildInterpreterRouteData(route: ResolvedInterpreterActionRoute): Record<string, unknown> {
    return route.config.route === "MAIN_COMMAND"
      ? {
          actionType: route.actionType,
          route: route.config.route,
          intent: route.config.intent,
        }
      : {
          actionType: route.actionType,
          route: route.config.route,
        };
  }

  private resolveInterpreterRouteTarget(
    dto: SubmitMainCommandDto,
    intent: MainCommandIntent,
    visibleEntities: VisibleSceneEntity[],
    interpreterTargetId?: string | null,
  ): VisibleSceneEntity | null {
    const allowedTargetTypes = this.mainCommandValidator.getAllowedTargetTypes(intent);
    const candidates = allowedTargetTypes?.length ? visibleEntities.filter((entity) => allowedTargetTypes.includes(entity.kind)) : visibleEntities;
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      return candidates.find((entity) => entity.id.trim().toLowerCase() === normalizedTargetId) ?? null;
    }

    const matchedByText = this.mainCommandSceneEntity.resolveEntityMentionedInText(dto.playerText, candidates);
    if (matchedByText) {
      return matchedByText;
    }

    // 자유 입력에서 대상 후보가 여럿이면 AI가 임의로 고른 targetId를 믿지 않는다.
    // 사용자가 이름을 쓰거나 대상 선택 버튼으로 지정한 경우에만 특정 대상으로 진행한다.
    if (candidates.length > 1 && this.mainCommandValidator.requiresTargetSelection(intent)) {
      return null;
    }

    if (interpreterTargetId) {
      const normalizedTargetId = interpreterTargetId.trim().toLowerCase();
      const matchedByInterpreter = candidates.find((entity) => entity.id.trim().toLowerCase() === normalizedTargetId);
      if (matchedByInterpreter) {
        return matchedByInterpreter;
      }
    }

    const routedDto: SubmitMainCommandDto = {
      ...dto,
    };

    return this.mainCommandSceneEntity.resolveEntity(routedDto, candidates, dto.targetType);
  }
}
