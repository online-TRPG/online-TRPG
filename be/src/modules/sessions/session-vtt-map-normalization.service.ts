import { Injectable } from "@nestjs/common";
import {
  VTT_CHECK_DC_MAX,
  VTT_CHECK_DC_MIN,
  VTT_DOOR_STATES,
  VTT_DOOR_STATE_VALUES,
  VTT_ENCOUNTER_PRIORITY_MAX,
  VTT_ENCOUNTER_PRIORITY_MIN,
  VttDoorState,
  VttMapStateDto,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";

@Injectable()
export class SessionVttMapNormalizationService {
  normalize(map: VttMapStateDto, scenarioNodeId: string | null): VttMapStateDto {
    const gridSize = this.clampNumber(map.gridSize, 16, 160);
    const width = this.clampNumber(map.width, 320, 4000);
    const height = this.clampNumber(map.height, 240, 4000);
    const tokens = map.tokens
      .slice(0, 80)
      .map((token) => ({
        id: token.id,
        npcId: token.npcId ?? null,
        sessionCharacterId: token.sessionCharacterId ?? null,
        name: token.name.slice(0, 80),
        imageUrl: token.imageUrl ?? null,
        x: Number(token.x) || 0,
        y: Number(token.y) || 0,
        size: this.clampNumber(token.size, 24, 160),
        hidden: token.hidden === true,
        isHostile: token.isHostile === true,
        ...(token.monster || token.isHostile
          ? {
              encounterRole: token.encounterRole === "fixed" ? ("fixed" as const) : ("scalable" as const),
              encounterGroupId: typeof token.encounterGroupId === "string" && token.encounterGroupId.trim() ? token.encounterGroupId.trim().slice(0, 80) : null,
              encounterPriority: this.clampNumber(
                Number(token.encounterPriority) || VTT_ENCOUNTER_PRIORITY_MIN,
                VTT_ENCOUNTER_PRIORITY_MIN,
                VTT_ENCOUNTER_PRIORITY_MAX,
              ),
            }
          : {}),
        monster: token.monster
          ? {
              id: token.monster.id,
              nameEn: token.monster.nameEn,
              nameKo: token.monster.nameKo ?? null,
              basicRaw: token.monster.basicRaw,
              armorClassRaw: token.monster.armorClassRaw ?? null,
              hitPointsRaw: token.monster.hitPointsRaw ?? null,
              speedRaw: token.monster.speedRaw ?? null,
              challengeRaw: token.monster.challengeRaw ?? null,
              sensesRaw: token.monster.sensesRaw ?? null,
              languagesRaw: token.monster.languagesRaw ?? null,
              traits: Array.isArray(token.monster.traits) ? token.monster.traits.slice(0, 20) : [],
              actions: Array.isArray(token.monster.actions) ? token.monster.actions.slice(0, 20) : [],
              legendaryActions: Array.isArray(token.monster.legendaryActions) ? token.monster.legendaryActions.slice(0, 20) : [],
              playReference: token.monster.playReference ?? null,
              source: token.monster.source
                ? {
                    file: token.monster.source.file ?? undefined,
                    page: token.monster.source.page ?? undefined,
                    heading: token.monster.source.heading ?? undefined,
                  }
                : null,
            }
          : null,
      }))
      .map((token) => ({
        ...token,
        x: this.clampNumber(token.x, 0, Math.max(0, width - token.size)),
        y: this.clampNumber(token.y, 0, Math.max(0, height - token.size)),
      }));
    const fogRects = map.fogRects.slice(0, 200).map((rect) => ({
      id: rect.id,
      x: this.clampNumber(rect.x, 0, width),
      y: this.clampNumber(rect.y, 0, height),
      width: this.clampNumber(rect.width, 1, width),
      height: this.clampNumber(rect.height, 1, height),
    }));
    const startingPositions = (map.startingPositions ?? []).slice(0, 12).map((position, index) => ({
      id: position.id || `start:${index + 1}`,
      label: typeof position.label === "string" && position.label.trim() ? position.label.trim() : null,
      x: this.clampNumber(position.x, 0, width - gridSize),
      y: this.clampNumber(position.y, 0, height - gridSize),
    }));
    const now = Date.now();
    const pings = (map.pings ?? [])
      .filter((ping) => {
        const expiresAt = Date.parse(ping.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt > now;
      })
      .slice(-12)
      .map((ping, index) => ({
        id: typeof ping.id === "string" && ping.id.trim() ? ping.id.trim().slice(0, 80) : `ping:${index + 1}`,
        x: this.clampNumber(ping.x, 0, width),
        y: this.clampNumber(ping.y, 0, height),
        label: typeof ping.label === "string" && ping.label.trim() ? ping.label.trim().slice(0, 8) : "!",
        expiresAt: ping.expiresAt,
      }));
    const lightSources = (map.lightSources ?? []).slice(-40).map((source, index) => ({
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : `light:${index + 1}`,
      x: this.clampNumber(source.x, 0, width - gridSize),
      y: this.clampNumber(source.y, 0, height - gridSize),
      rangeFt: this.clampNumber(source.rangeFt, 5, 120),
      label: typeof source.label === "string" && source.label.trim() ? source.label.trim().slice(0, 40) : null,
      createdBySessionCharacterId:
        typeof source.createdBySessionCharacterId === "string" && source.createdBySessionCharacterId.trim() ? source.createdBySessionCharacterId.trim() : null,
    }));
    const encounterScaling =
      map.encounterScaling && typeof map.encounterScaling === "object"
        ? {
            enabled: map.encounterScaling.enabled === true,
            basePartySize: this.clampNumber(Number(map.encounterScaling.basePartySize) || 4, 1, 12),
            minMonsterCount: this.clampNumber(Number(map.encounterScaling.minMonsterCount) || 1, 0, 80),
            mode: "by_party_ratio" as const,
          }
        : null;
    const normalizeStructureCell = (
      cell: {
        id?: string;
        name?: string | null;
        description?: string | null;
        terrainEffectId?: string | null;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        shapeCells?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      },
      prefix: string,
      index: number,
    ) => ({
      id: cell.id || `${prefix}:${index + 1}`,
      name: typeof cell.name === "string" && cell.name.trim() ? cell.name.trim().slice(0, 80) : null,
      description: typeof cell.description === "string" && cell.description.trim() ? cell.description.trim().slice(0, 500) : null,
      terrainEffectId:
        typeof cell.terrainEffectId === "string" && cell.terrainEffectId.trim()
          ? cell.terrainEffectId
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
              .slice(0, 80)
          : null,
      x: this.clampNumber(Number(cell.x), 0, width - gridSize),
      y: this.clampNumber(Number(cell.y), 0, height - gridSize),
      width: this.clampNumber(Number(cell.width) || gridSize, gridSize, width),
      height: this.clampNumber(Number(cell.height) || gridSize, gridSize, height),
    });
    const normalizeObjectShapeCells = (
      cell: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        shapeCells?: Array<{
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      },
      fallback: { x: number; y: number; width: number; height: number },
    ) => {
      const rawShapeCells = Array.isArray(cell.shapeCells) && cell.shapeCells.length ? cell.shapeCells : [fallback];
      const shapeByKey = new Map<string, { x: number; y: number; width: number; height: number }>();

      rawShapeCells.slice(0, 80).forEach((shapeCell) => {
        const normalized = {
          x: this.clampNumber(Number(shapeCell.x), 0, width - gridSize),
          y: this.clampNumber(Number(shapeCell.y), 0, height - gridSize),
          width: this.clampNumber(Number(shapeCell.width) || gridSize, gridSize, width),
          height: this.clampNumber(Number(shapeCell.height) || gridSize, gridSize, height),
        };
        shapeByKey.set(`${normalized.x}:${normalized.y}:${normalized.width}:${normalized.height}`, normalized);
      });

      const shapeCells = Array.from(shapeByKey.values()).sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y));
      const left = Math.min(...shapeCells.map((shapeCell) => shapeCell.x));
      const top = Math.min(...shapeCells.map((shapeCell) => shapeCell.y));
      const right = Math.max(...shapeCells.map((shapeCell) => shapeCell.x + shapeCell.width));
      const bottom = Math.max(...shapeCells.map((shapeCell) => shapeCell.y + shapeCell.height));

      return {
        shapeCells,
        bounds: {
          x: this.clampNumber(left, 0, width - gridSize),
          y: this.clampNumber(top, 0, height - gridSize),
          width: this.clampNumber(right - left, gridSize, width),
          height: this.clampNumber(bottom - top, gridSize, height),
        },
      };
    };
    const terrainCells = (map.terrainCells ?? []).slice(0, 400).map((cell, index) => normalizeStructureCell(cell, "terrain", index));
    const wallCells = (map.wallCells ?? []).slice(0, 400).map((cell, index) => normalizeStructureCell(cell, "wall", index));
    const doorCells = (map.doorCells ?? []).slice(0, 200).map((cell, index) => ({
      ...normalizeStructureCell(cell, "door", index),
      state: VTT_DOOR_STATE_VALUES.includes(cell.state as VttDoorState)
        ? (cell.state as VttDoorState)
        : VTT_DOOR_STATES.CLOSED,
      keyItemId: typeof cell.keyItemId === "string" && cell.keyItemId.trim() ? cell.keyItemId.trim() : null,
      canBreak: cell.canBreak === true,
      breakCheckDc:
        typeof cell.breakCheckDc === "number" && Number.isFinite(cell.breakCheckDc)
          ? this.clampNumber(cell.breakCheckDc, VTT_CHECK_DC_MIN, VTT_CHECK_DC_MAX)
          : null,
    }));
    const objectCells = (map.objectCells ?? []).slice(0, 300).map((cell, index) => {
      const baseCell = normalizeStructureCell(cell, "object", index);
      const normalizedShape = normalizeObjectShapeCells(cell, baseCell);

      return {
        ...baseCell,
        ...normalizedShape.bounds,
        shapeCells: normalizedShape.shapeCells,
        visibleToPlayers: cell.visibleToPlayers !== false,
        canBreak: cell.canBreak === true,
        broken: cell.broken === true,
        breakCheckDc:
          typeof cell.breakCheckDc === "number" && Number.isFinite(cell.breakCheckDc)
            ? this.clampNumber(cell.breakCheckDc, VTT_CHECK_DC_MIN, VTT_CHECK_DC_MAX)
            : null,
        hiddenClueIds: Array.isArray(cell.hiddenClueIds) ? cell.hiddenClueIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        hiddenItemIds: Array.isArray(cell.hiddenItemIds) ? cell.hiddenItemIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        hiddenEventIds: Array.isArray(cell.hiddenEventIds) ? cell.hiddenEventIds.filter((id) => typeof id === "string").slice(0, 30) : [],
        observedBySessionCharacterIds: Array.isArray(cell.observedBySessionCharacterIds)
          ? cell.observedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 30)
          : [],
        revealChecks: Array.isArray(cell.revealChecks)
          ? cell.revealChecks
              .map((check) => ({
                contentId: typeof check.contentId === "string" ? check.contentId.trim() : "",
                requiresCheck: check.requiresCheck !== false,
                ability: typeof check.ability === "string" && check.ability.trim() ? check.ability.trim() : null,
                skill: typeof check.skill === "string" && check.skill.trim() ? check.skill.trim() : null,
                dc: this.clampNumber(Number(check.dc) || 15, VTT_CHECK_DC_MIN, VTT_CHECK_DC_MAX),
              }))
              .filter((check) => check.contentId)
              .slice(0, 60)
          : [],
        events: Array.isArray(cell.events)
          ? cell.events
              .filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY")
              .slice(0, 20)
              .map((event, eventIndex) => ({
                id: typeof event.id === "string" && event.id.trim() ? event.id.trim().slice(0, 120) : `event:object:${index + 1}:${eventIndex + 1}`,
                name: typeof event.name === "string" && event.name.trim() ? event.name.trim().slice(0, 80) : null,
                type: "REVEAL_FOG_ON_PROXIMITY" as const,
                trigger: {
                  distanceFeet: this.clampNumber(Number(event.trigger?.distanceFeet), 0, 500),
                  once: event.trigger?.once !== false,
                },
                effect: {
                  revealRadiusFeet: this.clampNumber(Number(event.effect?.revealRadiusFeet), 5, 500),
                },
              }))
          : [],
        hazard:
          cell.hazard && typeof cell.hazard === "object"
            ? {
                kind: this.normalizeHazardKind(cell.hazard.kind),
                armed: cell.hazard.armed !== false,
                triggerOnce: cell.hazard.triggerOnce !== false,
                detectionRadiusCells: this.clampNumber(Number(cell.hazard.detectionRadiusCells) || 3, 1, 20),
                detectionDc: this.clampNumber(Number(cell.hazard.detectionDc) || 12, VTT_CHECK_DC_MIN, VTT_CHECK_DC_MAX),
                linkedClueIds: Array.isArray(cell.hazard.linkedClueIds) ? cell.hazard.linkedClueIds.filter((id) => typeof id === "string").slice(0, 30) : [],
                attemptedBySessionCharacterIds: Array.isArray(cell.hazard.attemptedBySessionCharacterIds)
                  ? cell.hazard.attemptedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 80)
                  : [],
                detectedBySessionCharacterIds: Array.isArray(cell.hazard.detectedBySessionCharacterIds)
                  ? cell.hazard.detectedBySessionCharacterIds.filter((id) => typeof id === "string").slice(0, 80)
                  : [],
              }
            : null,
      };
    });

    return {
      id: map.id || randomUUID(),
      scenarioNodeId: map.scenarioNodeId ?? scenarioNodeId,
      imageUrl: map.imageUrl ?? null,
      gridType: map.gridType === "hex" ? "hex" : "square",
      gridSize,
      width,
      height,
      tokens,
      encounterScaling,
      fogRects,
      startingPositions,
      pings,
      lightSources,
      terrainCells,
      wallCells,
      doorCells,
      objectCells,
      updatedAt: new Date().toISOString(),
    };
  }

  toVttMapOrNull(value: unknown): VttMapStateDto | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Partial<VttMapStateDto>;
    if (!candidate.id || !Array.isArray(candidate.tokens) || !Array.isArray(candidate.fogRects)) {
      return null;
    }

    return this.normalize(
      {
        id: candidate.id,
        scenarioNodeId: candidate.scenarioNodeId ?? null,
        imageUrl: candidate.imageUrl ?? null,
        gridType: candidate.gridType === "hex" ? "hex" : "square",
        gridSize: Number(candidate.gridSize) || 64,
        width: Number(candidate.width) || 1280,
        height: Number(candidate.height) || 832,
        tokens: candidate.tokens,
        encounterScaling: candidate.encounterScaling && typeof candidate.encounterScaling === "object" ? candidate.encounterScaling : null,
        fogRects: candidate.fogRects,
        lightSources: Array.isArray(candidate.lightSources) ? candidate.lightSources : [],
        startingPositions: Array.isArray(candidate.startingPositions) ? candidate.startingPositions : [],
        pings: Array.isArray(candidate.pings) ? candidate.pings : [],
        terrainCells: Array.isArray(candidate.terrainCells) ? candidate.terrainCells : [],
        wallCells: Array.isArray(candidate.wallCells) ? candidate.wallCells : [],
        doorCells: Array.isArray(candidate.doorCells) ? candidate.doorCells : [],
        objectCells: Array.isArray(candidate.objectCells) ? candidate.objectCells : [],
        updatedAt: candidate.updatedAt ?? new Date().toISOString(),
      },
      candidate.scenarioNodeId ?? null,
    );
  }

  private normalizeHazardKind(value: unknown): "TRAP" | "AMBUSH" | "HAZARD" {
    return value === "AMBUSH" || value === "HAZARD" ? value : "TRAP";
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }
}
