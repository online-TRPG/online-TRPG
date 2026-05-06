import { Injectable } from "@nestjs/common";

const FEET_PER_GRID = 5;

export type RuleMapRuntimeToken = {
  sessionCharacterId: string | null;
  x: number;
  y: number;
  size: number;
  hidden: boolean;
  isHostile: boolean;
};

export type RuleMapRuntimeContext = {
  gridType: "square" | "hex";
  gridSize: number;
  tokens: RuleMapRuntimeToken[];
};

@Injectable()
export class MapPositionService {
  createRuntimeMapFromFlagsJson(
    flagsJson: string | null | undefined,
  ): RuleMapRuntimeContext | null {
    const flags = this.parseJsonRecord(flagsJson);
    if (!flags) {
      return null;
    }

    return this.createRuntimeMap(flags.vttMap);
  }

  createRuntimeMap(value: unknown): RuleMapRuntimeContext | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const gridSize = this.toPositiveNumber(value.gridSize);
    if (!gridSize) {
      return null;
    }

    const gridType = value.gridType === "hex" ? "hex" : "square";
    const tokens = Array.isArray(value.tokens)
      ? value.tokens
          .map((token) => this.toRuntimeToken(token, gridSize))
          .filter((token): token is RuleMapRuntimeToken => token !== null)
      : [];

    return { gridType, gridSize, tokens };
  }

  hasActorAllyWithinFeetOfTarget(params: {
    map: RuleMapRuntimeContext | null | undefined;
    actorSessionCharacterId: string;
    targetSessionCharacterId: string;
    feet: number;
  }): boolean {
    const map = params.map;
    if (!map) {
      return false;
    }

    const actorToken = this.findToken(map, params.actorSessionCharacterId);
    const targetToken = this.findToken(map, params.targetSessionCharacterId);
    if (!actorToken || !targetToken) {
      return false;
    }

    // Sneak Attack의 인접 조건은 "대상의 적"이 대상 근처에 있는지다.
    // 현재 VTT 모델에는 진영 테이블이 없으므로, 토큰의 isHostile 값을 임시 진영 기준으로 사용한다.
    if (actorToken.isHostile === targetToken.isHostile) {
      return false;
    }

    return map.tokens.some((token) => {
      if (
        !token.sessionCharacterId ||
        token.hidden ||
        token.sessionCharacterId === params.actorSessionCharacterId ||
        token.sessionCharacterId === params.targetSessionCharacterId ||
        token.isHostile !== actorToken.isHostile
      ) {
        return false;
      }

      return this.isWithinFeet(map, token, targetToken, params.feet);
    });
  }

  isWithinFeet(
    map: RuleMapRuntimeContext,
    source: RuleMapRuntimeToken,
    target: RuleMapRuntimeToken,
    feet: number,
  ): boolean {
    return this.calculateDistanceFeet(map, source, target) <= feet;
  }

  calculateDistanceFeet(
    map: RuleMapRuntimeContext,
    source: RuleMapRuntimeToken,
    target: RuleMapRuntimeToken,
  ): number {
    if (map.gridType === "hex") {
      return this.calculateCenterDistanceFeet(map, source, target);
    }

    return this.calculateSquareGridDistanceFeet(map, source, target);
  }

  private findToken(
    map: RuleMapRuntimeContext,
    sessionCharacterId: string,
  ): RuleMapRuntimeToken | null {
    return (
      map.tokens.find((token) => token.sessionCharacterId === sessionCharacterId) ?? null
    );
  }

  private calculateSquareGridDistanceFeet(
    map: RuleMapRuntimeContext,
    source: RuleMapRuntimeToken,
    target: RuleMapRuntimeToken,
  ): number {
    const sourceSpan = this.toGridSpan(source, map.gridSize);
    const targetSpan = this.toGridSpan(target, map.gridSize);
    const dx = this.rangeDistance(
      sourceSpan.left,
      sourceSpan.right,
      targetSpan.left,
      targetSpan.right,
    );
    const dy = this.rangeDistance(
      sourceSpan.top,
      sourceSpan.bottom,
      targetSpan.top,
      targetSpan.bottom,
    );

    return Math.max(dx, dy) * FEET_PER_GRID;
  }

  private calculateCenterDistanceFeet(
    map: RuleMapRuntimeContext,
    source: RuleMapRuntimeToken,
    target: RuleMapRuntimeToken,
  ): number {
    const sourceCenter = this.toCenterPoint(source);
    const targetCenter = this.toCenterPoint(target);
    const distancePx = Math.hypot(
      sourceCenter.x - targetCenter.x,
      sourceCenter.y - targetCenter.y,
    );

    return Math.round((distancePx / map.gridSize) * FEET_PER_GRID);
  }

  private toGridSpan(token: RuleMapRuntimeToken, gridSize: number): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    const left = Math.floor(token.x / gridSize);
    const top = Math.floor(token.y / gridSize);
    const right = Math.max(left, Math.ceil((token.x + token.size) / gridSize) - 1);
    const bottom = Math.max(top, Math.ceil((token.y + token.size) / gridSize) - 1);

    return { left, right, top, bottom };
  }

  private rangeDistance(startA: number, endA: number, startB: number, endB: number): number {
    if (endA >= startB && endB >= startA) {
      return 0;
    }

    return startB > endA ? startB - endA : startA - endB;
  }

  private toCenterPoint(token: RuleMapRuntimeToken): { x: number; y: number } {
    return {
      x: token.x + token.size / 2,
      y: token.y + token.size / 2,
    };
  }

  private toRuntimeToken(value: unknown, fallbackSize: number): RuleMapRuntimeToken | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const x = this.toFiniteNumber(value.x);
    const y = this.toFiniteNumber(value.y);
    if (x === null || y === null) {
      return null;
    }

    return {
      sessionCharacterId:
        typeof value.sessionCharacterId === "string" && value.sessionCharacterId.trim()
          ? value.sessionCharacterId
          : null,
      x,
      y,
      size: this.toPositiveNumber(value.size) ?? fallbackSize,
      hidden: value.hidden === true,
      isHostile: value.isHostile === true,
    };
  }

  private parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private toFiniteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toPositiveNumber(value: unknown): number | null {
    const numberValue = this.toFiniteNumber(value);
    return numberValue && numberValue > 0 ? numberValue : null;
  }
}
