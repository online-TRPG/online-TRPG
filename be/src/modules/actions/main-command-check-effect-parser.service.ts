import { Injectable } from "@nestjs/common";
import { MainCommandActionCandidateDto, MainCommandCheckOptionDto, MainCommandIntent, MainCommandScreenType } from "@trpg/shared-types";

export type VttDoorCheckEffect = {
  type: "vttDoor";
  doorId: string;
  effect: "open" | "broken";
  nodeId: string;
  mapPoint: { x: number; y: number };
};

export type VttHazardCheckEffect = {
  type: "vttHazard";
  hazardId: string;
  effect: "disarm";
  nodeId: string;
  mapPoint: { x: number; y: number };
};

export type VttObjectCheckEffect = {
  type: "vttObject";
  objectId: string;
  effect: "broken";
  nodeId: string;
  mapPoint: { x: number; y: number };
};

export type MainCommandCheckEffect = {
  type: "mainCommandCheck";
  requestId: string;
  nodeId: string;
  sessionCharacterId: string;
  intent: MainCommandIntent;
  screenType: MainCommandScreenType;
  playerText: string;
  actionSummary: string;
  targetId: string | null;
  targetName: string | null;
  targetSummary: string | null;
  targetDisposition: string | null;
  itemId: string | null;
  itemName: string | null;
  mapPoint: { x: number; y: number } | null;
  checkOption: MainCommandCheckOptionDto | null;
  visibleEntityNames: string[];
  publicClues: string[];
  sceneText: string;
  actionCandidate: MainCommandActionCandidateDto | null;
};

@Injectable()
export class MainCommandCheckEffectParserService {
  parseMainCommandCheckEffect(value: Record<string, unknown>): MainCommandCheckEffect | null {
    if (value.type !== "mainCommandCheck") {
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
      !Object.values(MainCommandIntent).includes(intent as MainCommandIntent) ||
      !Object.values(MainCommandScreenType).includes(screenType as MainCommandScreenType)
    ) {
      return null;
    }

    const mapPoint = this.readPoint(value.mapPoint);
    const checkOption = value.checkOption && typeof value.checkOption === "object" ? this.parseCheckOption(value.checkOption as Record<string, unknown>) : null;
    const actionCandidate =
      value.actionCandidate && typeof value.actionCandidate === "object" ? this.parseActionCandidate(value.actionCandidate as Record<string, unknown>) : null;

    return {
      type: "mainCommandCheck",
      requestId,
      nodeId,
      sessionCharacterId: this.readString(value.sessionCharacterId) ?? "",
      intent: intent as MainCommandIntent,
      screenType: screenType as MainCommandScreenType,
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

  parseVttDoorCheckEffect(value: Record<string, unknown>): VttDoorCheckEffect | null {
    const type = value.type;
    const doorId = value.doorId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== "vttDoor" ||
      typeof doorId !== "string" ||
      typeof nodeId !== "string" ||
      (effect !== "open" && effect !== "broken") ||
      !mapPoint ||
      typeof mapPoint !== "object"
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number") {
      return null;
    }
    return {
      type,
      doorId,
      effect,
      nodeId,
      mapPoint: { x: point.x, y: point.y },
    };
  }

  parseVttHazardCheckEffect(value: Record<string, unknown>): VttHazardCheckEffect | null {
    const type = value.type;
    const hazardId = value.hazardId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== "vttHazard" ||
      typeof hazardId !== "string" ||
      typeof nodeId !== "string" ||
      effect !== "disarm" ||
      !mapPoint ||
      typeof mapPoint !== "object"
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number") {
      return null;
    }
    return {
      type,
      hazardId,
      effect,
      nodeId,
      mapPoint: { x: point.x, y: point.y },
    };
  }

  parseVttObjectCheckEffect(value: Record<string, unknown>): VttObjectCheckEffect | null {
    const type = value.type;
    const objectId = value.objectId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== "vttObject" ||
      typeof objectId !== "string" ||
      typeof nodeId !== "string" ||
      effect !== "broken" ||
      !mapPoint ||
      typeof mapPoint !== "object"
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number") {
      return null;
    }
    return {
      type,
      objectId,
      effect,
      nodeId,
      mapPoint: { x: point.x, y: point.y },
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

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => this.readString(item)).filter((item): item is string => Boolean(item)) : [];
  }

  private readPoint(value: unknown): { x: number; y: number } | null {
    if (!value || typeof value !== "object") {
      return null;
    }
    const point = value as Record<string, unknown>;
    return typeof point.x === "number" && typeof point.y === "number" ? { x: point.x, y: point.y } : null;
  }

  private readDc(value: unknown): number | null {
    const dc = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isInteger(dc) && dc >= 5 && dc <= 30 ? dc : null;
  }
}
