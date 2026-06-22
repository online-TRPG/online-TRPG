import { Injectable } from "@nestjs/common";
import { TerrainEffectResolution, TerrainEffectService } from "./terrain-effect.service";

const FEET_PER_GRID = 5;

export type ForcedMovementMode = "push" | "pull" | "slide";

export type ForcedMovementPoint = {
  x: number;
  y: number;
};

export type ForcedMovementHazard = {
  point: ForcedMovementPoint;
  terrainEffectId: string;
};

export type ForcedMovementEnteredTerrainEffect = ForcedMovementHazard & {
  effect: TerrainEffectResolution;
};

export type ForcedMovementToken = {
  id: string;
  point: ForcedMovementPoint;
  blocksMovement?: boolean;
};

export type ForcedMovementInput = {
  mode: ForcedMovementMode;
  origin: ForcedMovementPoint;
  target: ForcedMovementPoint;
  distanceFt: number;
  grid: {
    width: number;
    height: number;
  };
  obstacles?: ForcedMovementPoint[];
  hazards?: ForcedMovementHazard[];
  tokens?: ForcedMovementToken[];
  provokeOpportunityAttack?: boolean;
};

export type ForcedMovementResolution = {
  mode: ForcedMovementMode;
  start: ForcedMovementPoint;
  destination: ForcedMovementPoint;
  path: ForcedMovementPoint[];
  distanceMovedFt: number;
  movementCostFt: 0;
  provokesOpportunityAttack: boolean;
  stoppedReason: "completed" | "blocked" | "edge_of_map";
  collision: {
    point: ForcedMovementPoint;
    tokenId?: string;
  } | null;
  enteredHazards: ForcedMovementHazard[];
  enteredTerrainEffects: ForcedMovementEnteredTerrainEffect[];
  combinedEnteredTerrainEffect: TerrainEffectResolution | null;
  fall: {
    point: ForcedMovementPoint;
    distanceFt: number;
  } | null;
};

@Injectable()
export class ForcedMovementService {
  constructor(
    private readonly terrainEffects: TerrainEffectService = new TerrainEffectService(),
  ) {}

  resolveForcedMovement(input: ForcedMovementInput): ForcedMovementResolution {
    this.assertPositiveInteger(input.grid.width, "grid.width");
    this.assertPositiveInteger(input.grid.height, "grid.height");
    this.assertNonNegativeInteger(input.distanceFt, "distanceFt");

    const start = this.normalizePoint(input.target, input.grid);
    const direction = this.resolveDirection(input.mode, input.origin, start);
    const maxSteps = Math.floor(input.distanceFt / FEET_PER_GRID);
    const obstacleKeys = new Set((input.obstacles ?? []).map((point) => this.pointKey(point)));
    const blockingTokens = new Map(
      (input.tokens ?? [])
        .filter((token) => token.blocksMovement !== false)
        .map((token) => [this.pointKey(token.point), token.id]),
    );

    const path: ForcedMovementPoint[] = [start];
    let destination = start;
    let stoppedReason: ForcedMovementResolution["stoppedReason"] = "completed";
    let collision: ForcedMovementResolution["collision"] = null;

    for (let step = 1; step <= maxSteps; step += 1) {
      const next = {
        x: destination.x + direction.x,
        y: destination.y + direction.y,
      };
      const nextKey = this.pointKey(next);

      if (!this.isInsideGrid(next, input.grid)) {
        stoppedReason = "edge_of_map";
        break;
      }
      if (obstacleKeys.has(nextKey) || blockingTokens.has(nextKey)) {
        stoppedReason = "blocked";
        collision = {
          point: next,
          tokenId: blockingTokens.get(nextKey),
        };
        break;
      }

      destination = next;
      path.push(destination);
    }

    const hazardsByPoint = new Map<string, ForcedMovementHazard[]>();
    for (const hazard of input.hazards ?? []) {
      const key = this.pointKey(hazard.point);
      hazardsByPoint.set(key, [...(hazardsByPoint.get(key) ?? []), hazard]);
    }
    const enteredHazards = path
      .slice(1)
      .flatMap((point) => hazardsByPoint.get(this.pointKey(point)) ?? []);
    const enteredTerrainEffects = enteredHazards
      .map((hazard) => this.resolveEnteredTerrainEffect(hazard))
      .filter((effect): effect is ForcedMovementEnteredTerrainEffect => effect !== null);

    return {
      mode: input.mode,
      start,
      destination,
      path,
      distanceMovedFt: (path.length - 1) * FEET_PER_GRID,
      movementCostFt: 0,
      provokesOpportunityAttack: input.provokeOpportunityAttack ?? false,
      stoppedReason,
      collision,
      enteredHazards,
      enteredTerrainEffects,
      combinedEnteredTerrainEffect: enteredTerrainEffects.length
        ? this.terrainEffects.resolveCombinedEffects(
            enteredTerrainEffects.map((entered) => entered.terrainEffectId),
          )
        : null,
      fall: stoppedReason === "edge_of_map"
        ? {
            point: destination,
            distanceFt: FEET_PER_GRID,
          }
        : null,
    };
  }

  private resolveEnteredTerrainEffect(
    hazard: ForcedMovementHazard,
  ): ForcedMovementEnteredTerrainEffect | null {
    const effect = this.terrainEffects.resolveEffect(hazard.terrainEffectId);
    return effect ? { ...hazard, effect } : null;
  }

  private resolveDirection(
    mode: ForcedMovementMode,
    origin: ForcedMovementPoint,
    target: ForcedMovementPoint,
  ): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    if (mode === "slide") {
      return this.normalizeVector({
        x: target.x - origin.x,
        y: target.y - origin.y,
      });
    }
    if (mode === "push") {
      return this.normalizeVector({
        x: target.x - origin.x,
        y: target.y - origin.y,
      });
    }
    return this.normalizeVector({
      x: origin.x - target.x,
      y: origin.y - target.y,
    });
  }

  private normalizeVector(vector: { x: number; y: number }): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    const x = Math.sign(vector.x) as -1 | 0 | 1;
    const y = Math.sign(vector.y) as -1 | 0 | 1;
    if (x === 0 && y === 0) {
      throw new Error("origin and target must not be the same point.");
    }
    return { x, y };
  }

  private normalizePoint(
    point: ForcedMovementPoint,
    grid: ForcedMovementInput["grid"],
  ): ForcedMovementPoint {
    this.assertInteger(point.x, "point.x");
    this.assertInteger(point.y, "point.y");
    if (!this.isInsideGrid(point, grid)) {
      throw new Error("point must be inside the grid.");
    }
    return { ...point };
  }

  private isInsideGrid(point: ForcedMovementPoint, grid: ForcedMovementInput["grid"]): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < grid.width && point.y < grid.height;
  }

  private pointKey(point: ForcedMovementPoint): string {
    return `${point.x}:${point.y}`;
  }

  private assertInteger(value: number, field: string): void {
    if (!Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${field} must be a positive integer.`);
    }
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
  }
}
