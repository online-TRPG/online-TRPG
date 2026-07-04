import { Injectable } from "@nestjs/common";
import { MainCommandIntent, MainCommandTargetType, SubmitMainCommandDto } from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

type IntentRequirement = {
  requiresTargetTypes?: MainCommandTargetType[];
  allowsTargetTypes?: MainCommandTargetType[];
  requiresItem?: boolean;
  requiresSpell?: boolean;
  requiresMapPoint?: boolean;
  allowsMapPoint?: boolean;
};

const INTENT_REQUIREMENTS: Partial<Record<MainCommandIntent, IntentRequirement>> = {
  [MainCommandIntent.TALK_TO_NPC]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_PERSUADE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_INTIMIDATE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_DECEIVE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.READ_EMOTION]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.INSPECT_STORY_OBJECT]: {
    requiresTargetTypes: [MainCommandTargetType.OBJECT],
  },
  [MainCommandIntent.INVESTIGATE_OBJECT]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.DETECT_DANGER]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.SPECIAL_MOVE]: {
    requiresMapPoint: true,
  },
  [MainCommandIntent.INTERACT_OBJECT]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_TOOL]: {
    requiresItem: true,
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.NPC, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_ITEM_EXPLORE]: {
    requiresItem: true,
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.NPC, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.ENVIRONMENT_USE]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.IMPROVISED_ATTACK]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR, MainCommandTargetType.OBJECT],
  },
  [MainCommandIntent.CALLED_SHOT]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.COMBAT_TALK]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.USE_ITEM_COMBAT]: {
    requiresItem: true,
    allowsTargetTypes: [
      MainCommandTargetType.NPC,
      MainCommandTargetType.ACTOR,
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_SPELL_CREATIVELY]: {
    requiresSpell: true,
    allowsTargetTypes: [
      MainCommandTargetType.NPC,
      MainCommandTargetType.ACTOR,
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
};

@Injectable()
export class MainCommandValidatorService {
  constructor(private readonly mainCommandSceneEntity: MainCommandSceneEntityService) {}

  validateIntentPayload(dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[]): void {
    const requirement = INTENT_REQUIREMENTS[dto.intent];
    if (!requirement) {
      return;
    }

    if (requirement.requiresItem && !dto.itemId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 사용할 아이템을 함께 지정해야 합니다.", {
        reason: "ITEM_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresSpell && !dto.spellId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 사용할 주문을 함께 지정해야 합니다.", {
        reason: "SPELL_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 지도 좌표를 함께 지정해야 합니다.", {
        reason: "MAP_POINT_REQUIRED",
        intent: dto.intent,
      });
    }

    if (dto.targetType) {
      const allowedTargetTypes = requirement.requiresTargetTypes ?? requirement.allowsTargetTypes ?? [];
      if (allowedTargetTypes.length && !allowedTargetTypes.includes(dto.targetType)) {
        throw badRequest("MAIN_COMMAND_400", "이 명령에 맞지 않는 대상 종류입니다.", {
          reason: "TARGET_TYPE_INVALID",
          intent: dto.intent,
          targetType: dto.targetType,
        });
      }
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 대상을 함께 지정해야 합니다.", {
        reason: "TARGET_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    const hasNaturalLanguageTarget = dto.playerText.trim().length > 0;
    if (
      (dto.intent === MainCommandIntent.INVESTIGATE_OBJECT ||
        dto.intent === MainCommandIntent.INTERACT_OBJECT ||
        dto.intent === MainCommandIntent.ENVIRONMENT_USE) &&
      !dto.targetId &&
      !dto.mapPoint &&
      !hasNaturalLanguageTarget
    ) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 조사 대상 또는 지도 좌표가 필요합니다.", {
        reason: "TARGET_OR_POINT_REQUIRED",
        intent: dto.intent,
      });
    }

    if (dto.targetId) {
      if (dto.targetType === MainCommandTargetType.ACTOR || dto.targetType === MainCommandTargetType.POINT || dto.targetType === MainCommandTargetType.SELF) {
        return;
      }

      const allowedTargetTypes = requirement.requiresTargetTypes ?? requirement.allowsTargetTypes;
      const entity = this.mainCommandSceneEntity.resolveEntity(
        dto,
        allowedTargetTypes?.length ? visibleEntities.filter((item) => allowedTargetTypes.includes(item.kind)) : visibleEntities,
        dto.targetType,
      );
      if (!entity) {
        throw badRequest("MAIN_COMMAND_400", "현재 화면에서 보이는 대상만 지정할 수 있습니다.", {
          reason: "TARGET_NOT_VISIBLE",
          intent: dto.intent,
          targetId: dto.targetId,
        });
      }
    }
  }

  getAllowedTargetTypes(intent: MainCommandIntent): MainCommandTargetType[] | undefined {
    const requirement = INTENT_REQUIREMENTS[intent];
    return requirement?.requiresTargetTypes ?? requirement?.allowsTargetTypes;
  }

  requiresTargetSelection(intent: MainCommandIntent): boolean {
    return Boolean(INTENT_REQUIREMENTS[intent]?.requiresTargetTypes);
  }

  getMissingInterpreterRouteRequirementMessage(dto: SubmitMainCommandDto): string | null {
    const requirement = INTENT_REQUIREMENTS[dto.intent];
    if (!requirement) {
      return null;
    }

    if (requirement.requiresItem && !dto.itemId) {
      return "이 요청은 아이템 선택이 필요합니다. 아이템 선택 버튼에서 사용할 아이템을 고른 뒤 다시 입력해주세요.";
    }

    if (requirement.requiresSpell && !dto.spellId) {
      return "이 요청은 주문 선택이 필요합니다. 주문 선택 버튼에서 사용할 주문을 고른 뒤 다시 입력해주세요.";
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      return "이 요청은 지도 좌표 선택이 필요합니다. 좌표 선택 버튼에서 지점을 고른 뒤 다시 입력해주세요.";
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      return "이 요청은 대상 선택이 필요합니다. 대상 선택 버튼에서 대상을 고른 뒤 다시 입력해주세요.";
    }

    return null;
  }

  canUseExplicitPlayerText(dto: SubmitMainCommandDto, options: { acceptsMapPoint?: boolean; acceptsTarget?: boolean } = {}): boolean {
    const text = dto.playerText.trim();
    if (!text) {
      return false;
    }

    if (options.acceptsMapPoint && dto.mapPoint) {
      return true;
    }

    if (options.acceptsTarget || dto.targetId) {
      return text.length >= 3;
    }

    const normalized = text.replace(/\s+/g, "");
    if (normalized.length >= 8) {
      return true;
    }

    return /[?!.。！？]|한다|하겠다|말|묻|찾|살피|조사|협박|위협|압박|보여|열|뒤지|확인/.test(text);
  }

  shouldRequireMainCommandCheck(
    action: { requiresRoll?: boolean | null },
    dto: SubmitMainCommandDto,
    needsClarification: boolean,
  ): boolean {
    return (
      Boolean(action.requiresRoll) ||
      (needsClarification &&
        this.canUseExplicitPlayerText(dto, {
          acceptsMapPoint: true,
          acceptsTarget: Boolean(dto.targetId),
        }))
    );
  }
}
