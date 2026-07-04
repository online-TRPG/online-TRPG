import { Injectable } from "@nestjs/common";
import {
  MainCommandCheckOptionDto,
} from "@trpg/shared-types";

export type MainCommandCheckAction = {
  ability?: string | null;
  skill?: string | null;
  approach: string;
  suggestedDifficulty?: string | null;
};

@Injectable()
export class MainCommandCheckBuilderService {
  buildCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    const dc = this.resolveCheckDc(action.suggestedDifficulty);
    if (!action.ability && !action.skill) {
      return [
        {
          dc,
          reason: action.approach,
        },
      ];
    }

    return [
      {
        ...(action.ability ? { ability: action.ability } : {}),
        ...(action.skill ? { skill: action.skill } : {}),
        dc,
        reason: action.suggestedDifficulty ? `${action.approach} (난이도 제안: ${action.suggestedDifficulty})` : action.approach,
      },
    ];
  }

  buildPersuasionCheckOptions(
    action: MainCommandCheckAction,
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "persuasion",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${npcName} 설득 (난이도 제안: ${action.suggestedDifficulty})` : `${npcName} 설득`,
      },
    ];
  }

  buildIntimidationCheckOptions(
    action: MainCommandCheckAction,
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "intimidation",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${npcName} 압박 (난이도 제안: ${action.suggestedDifficulty})` : `${npcName} 압박`,
      },
    ];
  }

  buildDeceptionCheckOptions(
    action: MainCommandCheckAction,
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "deception",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${npcName} 속이기(난이도 제안: ${action.suggestedDifficulty})` : `${npcName} 속이기`,
      },
    ];
  }

  buildInsightCheckOptions(
    action: MainCommandCheckAction,
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "insight",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${npcName} 감정 읽기 (난이도 제안: ${action.suggestedDifficulty})` : `${npcName} 감정 읽기`,
      },
    ];
  }

  buildInvestigationCheckOptions(
    action: MainCommandCheckAction,
    objectName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "int",
        skill: "investigation",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${objectName} 조사 (난이도 제안: ${action.suggestedDifficulty})` : `${objectName} 조사`,
      },
    ];
  }

  buildPerceptionCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "perception",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `주변 관찰 (난이도 제안: ${action.suggestedDifficulty})` : "주변 관찰",
      },
    ];
  }

  buildDangerDetectionCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "perception",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `위험 감지 (난이도 제안: ${action.suggestedDifficulty})` : "위험 감지",
      },
    ];
  }

  buildSpecialMoveCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "str",
        skill: "athletics",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `특수 이동 (난이도 제안: ${action.suggestedDifficulty})` : "특수 이동",
      },
      {
        ability: "dex",
        skill: "acrobatics",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `특수 이동 대안(난이도 제안: ${action.suggestedDifficulty})` : "특수 이동 대안",
      },
    ];
  }

  buildObjectInteractionCheckOptions(
    action: MainCommandCheckAction,
    objectName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${objectName} 조작 (난이도 제안: ${action.suggestedDifficulty})` : `${objectName} 조작`,
      },
    ];
  }

  buildToolUseCheckOptions(
    action: MainCommandCheckAction,
    toolName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : "";

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty ? `${toolName}${reasonTarget} 사용 (난이도 제안: ${action.suggestedDifficulty})` : `${toolName}${reasonTarget} 사용`,
      },
    ];
  }

  buildItemExploreCheckOptions(
    action: MainCommandCheckAction,
    itemName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : "";

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `${itemName}${reasonTarget} 창의적 활용 (난이도 제안: ${action.suggestedDifficulty})`
          : `${itemName}${reasonTarget} 창의적 활용`,
      },
    ];
  }

  private resolveCheckDc(suggestedDifficulty?: string | null): number {
    const normalized = suggestedDifficulty?.trim().toLowerCase() ?? "";
    const explicitDc = normalized.match(/\b(?:dc\s*)?([1-3]?\d)\b/);
    if (explicitDc) {
      const dc = Number(explicitDc[1]);
      if (Number.isInteger(dc) && dc >= 5 && dc <= 30) {
        return dc;
      }
    }

    const compact = normalized.replace(/[\s_-]+/g, "");
    if (compact.includes("trivial") || compact.includes("veryeasy") || compact.includes("매우쉬움")) {
      return 5;
    }
    if (compact.includes("easy") || compact.includes("쉬움") || compact.includes("낮음")) {
      return 10;
    }
    if (compact.includes("hard") || compact.includes("difficult") || compact.includes("어려움") || compact.includes("높음")) {
      return compact.includes("very") || compact.includes("매우") ? 25 : 20;
    }
    if (compact.includes("nearlyimpossible") || compact.includes("impossible") || compact.includes("거의불가능")) {
      return 30;
    }

    return 8;
  }
}
