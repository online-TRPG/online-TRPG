import { Injectable } from "@nestjs/common";
import {
  MAIN_COMMAND_CHECK_EFFECT_TYPES,
  MainCommandActionCandidateDto,
  MainCommandCheckOptionDto,
  MainCommandIntent,
  MainCommandNarrativeCheckEffectDto,
  MainCommandScreenType,
  VttDoorCheckEffectDto,
  VttHazardCheckEffectDto,
  VttObjectCheckEffectDto,
  VTT_CHECK_EFFECT_ACTIONS,
  isRecord,
} from "@trpg/shared-types";

const mainCommandIntentValues: readonly MainCommandIntent[] = [
  MainCommandIntent.GENERAL_GM_REQUEST,
  MainCommandIntent.TALK_TO_NPC,
  MainCommandIntent.SOCIAL_PERSUADE,
  MainCommandIntent.SOCIAL_INTIMIDATE,
  MainCommandIntent.SOCIAL_DECEIVE,
  MainCommandIntent.READ_EMOTION,
  MainCommandIntent.ASK_SCENE_INFO,
  MainCommandIntent.INSPECT_STORY_OBJECT,
  MainCommandIntent.DECLARE_RP_ACTION,
  MainCommandIntent.ASK_HINT,
  MainCommandIntent.ASK_SUMMARY,
  MainCommandIntent.REQUEST_SCENE_TRANSITION,
  MainCommandIntent.OBSERVE_AREA,
  MainCommandIntent.INVESTIGATE_OBJECT,
  MainCommandIntent.LISTEN,
  MainCommandIntent.DETECT_DANGER,
  MainCommandIntent.SPECIAL_MOVE,
  MainCommandIntent.INTERACT_OBJECT,
  MainCommandIntent.USE_TOOL,
  MainCommandIntent.USE_ITEM_EXPLORE,
  MainCommandIntent.SPLIT_PARTY_TASK,
  MainCommandIntent.COMBAT_MANEUVER,
  MainCommandIntent.ENVIRONMENT_USE,
  MainCommandIntent.IMPROVISED_ATTACK,
  MainCommandIntent.CALLED_SHOT,
  MainCommandIntent.READY_ACTION,
  MainCommandIntent.REACTION_REQUEST,
  MainCommandIntent.COMBAT_TALK,
  MainCommandIntent.USE_ITEM_COMBAT,
  MainCommandIntent.USE_SPELL_CREATIVELY,
  MainCommandIntent.TACTIC_QUERY,
  MainCommandIntent.ASK_RULE,
];

const mainCommandScreenTypeValues: readonly MainCommandScreenType[] = [
  MainCommandScreenType.STORY,
  MainCommandScreenType.EXPLORATION,
  MainCommandScreenType.COMBAT,
];

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.some((candidate) => candidate === value);
}

@Injectable()
export class MainCommandCheckEffectParserService {
  parseMainCommandCheckEffect(candidate: unknown): MainCommandNarrativeCheckEffectDto | null {
    const value = this.readRecord(candidate);
    if (!value || value.type !== MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK) {
      return null;
    }

    const requestId = this.readString(value.requestId);
    const nodeId = this.readString(value.nodeId);
    const intent = this.readString(value.intent);
    const screenType = this.readString(value.screenType);
    const playerText = this.readString(value.playerText);
    const actionSummary = this.readString(value.actionSummary) ?? playerText;
    if (
      !requestId ||
      !nodeId ||
      !intent ||
      !screenType ||
      !playerText ||
      !isOneOf(intent, mainCommandIntentValues) ||
      !isOneOf(screenType, mainCommandScreenTypeValues)
    ) {
      return null;
    }

    const mapPoint = this.readPoint(value.mapPoint);
    const checkOptionRecord = this.readRecord(value.checkOption);
    const actionCandidateRecord = this.readRecord(value.actionCandidate);
    const checkOption = checkOptionRecord ? this.parseCheckOption(checkOptionRecord) : null;
    const actionCandidate = actionCandidateRecord ? this.parseActionCandidate(actionCandidateRecord) : null;

    return {
      type: MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK,
      requestId,
      nodeId,
      sessionCharacterId: this.readString(value.sessionCharacterId) ?? "",
      intent,
      screenType,
      playerText,
      actionSummary: actionSummary ?? playerText,
      targetId: this.readString(value.targetId),
      targetName: this.readString(value.targetName),
      targetSummary: this.readString(value.targetSummary),
      targetDisposition: this.readString(value.targetDisposition),
      itemId: this.readString(value.itemId),
      itemName: this.readString(value.itemName),
      mapPoint,
      checkOption,
      visibleEntityNames: this.readStringArray(value.visibleEntityNames),
      publicClues: this.readStringArray(value.publicClues),
      sceneText: this.readString(value.sceneText) ?? "",
      actionCandidate,
    };
  }

  parseVttDoorCheckEffect(candidate: unknown): VttDoorCheckEffectDto | null {
    const value = this.readRecord(candidate);
    if (!value) {
      return null;
    }
    const type = value.type;
    const doorId = value.doorId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    const point = this.readPoint(mapPoint);
    if (
      type !== MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR ||
      typeof doorId !== "string" ||
      typeof nodeId !== "string" ||
      (effect !== VTT_CHECK_EFFECT_ACTIONS.OPEN && effect !== VTT_CHECK_EFFECT_ACTIONS.BROKEN) ||
      !point
    ) {
      return null;
    }
    return {
      type,
      doorId,
      effect,
      nodeId,
      mapPoint: point,
    };
  }

  parseVttHazardCheckEffect(candidate: unknown): VttHazardCheckEffectDto | null {
    const value = this.readRecord(candidate);
    if (!value) {
      return null;
    }
    const type = value.type;
    const hazardId = value.hazardId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    const point = this.readPoint(mapPoint);
    if (
      type !== MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD ||
      typeof hazardId !== "string" ||
      typeof nodeId !== "string" ||
      effect !== VTT_CHECK_EFFECT_ACTIONS.DISARM ||
      !point
    ) {
      return null;
    }
    return {
      type,
      hazardId,
      effect,
      nodeId,
      mapPoint: point,
    };
  }

  parseVttObjectCheckEffect(candidate: unknown): VttObjectCheckEffectDto | null {
    const value = this.readRecord(candidate);
    if (!value) {
      return null;
    }
    const type = value.type;
    const objectId = value.objectId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    const point = this.readPoint(mapPoint);
    if (
      type !== MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT ||
      typeof objectId !== "string" ||
      typeof nodeId !== "string" ||
      effect !== VTT_CHECK_EFFECT_ACTIONS.BROKEN ||
      !point
    ) {
      return null;
    }
    return {
      type,
      objectId,
      effect,
      nodeId,
      mapPoint: point,
    };
  }

  private parseCheckOption(value: Record<string, unknown>): MainCommandCheckOptionDto | null {
    const reason = this.readString(value.reason);
    if (!reason) {
      return null;
    }

    return {
      ...(this.readString(value.ability) ? { ability: this.readString(value.ability) ?? undefined } : {}),
      ...(this.readString(value.skill) ? { skill: this.readString(value.skill) ?? undefined } : {}),
      ...(this.readDc(value.dc) ? { dc: this.readDc(value.dc) ?? undefined } : {}),
      reason,
    };
  }

  private parseActionCandidate(value: Record<string, unknown>): MainCommandActionCandidateDto | null {
    const actorId = this.readString(value.actorId);
    const actionSummary = this.readString(value.actionSummary);
    if (!actorId || !actionSummary) {
      return null;
    }

    return {
      actorId,
      targetId: this.readString(value.targetId),
      actionSummary,
      declaredMethod: this.readString(value.declaredMethod),
    };
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.flatMap((item) => this.readStringEntry(item)) : [];
  }

  private readStringEntry(value: unknown): string[] {
    const item = this.readString(value);
    return item ? [item] : [];
  }

  private readPoint(value: unknown): { x: number; y: number } | null {
    const point = this.readRecord(value);
    if (!point) {
      return null;
    }
    return typeof point.x === "number" &&
      typeof point.y === "number" &&
      Number.isInteger(point.x) &&
      Number.isInteger(point.y)
      ? { x: point.x, y: point.y }
      : null;
  }

  private readDc(value: unknown): number | null {
    const dc = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isInteger(dc) && dc >= 5 && dc <= 30 ? dc : null;
  }
}
