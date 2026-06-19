import { Injectable } from "@nestjs/common";
import type { VttMapStateDto } from "@trpg/shared-types";
import { conflict } from "../../common/exceptions/domain-error";
import { TerrainEffectService } from "../rules/terrain-effect.service";
import type { TerrainEffectResolution } from "../rules/terrain-effect.service";

export type EnteredTerrainEffect = {
  terrainEffectId: string;
  effect: TerrainEffectResolution;
};

type MovementNode = {
  column: number;
  row: number;
  steps: number;
  previousKey: string | null;
};

@Injectable()
export class CombatMovementService {
  constructor(private readonly terrainEffects: TerrainEffectService = new TerrainEffectService()) {}

  normalizeCombatMovementPath(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    requestedPath: Array<{ x: number; y: number }> | null | undefined,
    to: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    const points = [
      { x: token.x, y: token.y },
      ...(requestedPath ?? []),
      to,
    ];
    const normalized: Array<{ x: number; y: number }> = [];
    for (const point of points) {
      const next = {
        x: this.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - token.size)),
        y: this.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - token.size)),
      };
      const previous = normalized[normalized.length - 1];
      if (!previous || previous.x !== next.x || previous.y !== next.y) {
        normalized.push(next);
      }
    }
    return normalized.length ? normalized : [{ x: token.x, y: token.y }];
  }

  calculateMovementPathDistanceFt(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
  ): number {
    let distanceFt = 0;
    for (let index = 1; index < path.length; index += 1) {
      distanceFt += this.getTokenGridDistanceFt(
        map,
        { ...token, ...path[index - 1] },
        { ...token, ...path[index] },
      );
    }
    return distanceFt;
  }

  calculateTerrainAdjustedMovementCostFt(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
  ): number {
    let costFt = 0;
    for (let index = 1; index < path.length; index += 1) {
      const segmentDistanceFt = this.getTokenGridDistanceFt(
        map,
        { ...token, ...path[index - 1] },
        { ...token, ...path[index] },
      );
      const multiplier = this.resolveMovementCostMultiplierAtPoint(map, path[index]);
      costFt += segmentDistanceFt * multiplier;
    }
    return costFt;
  }

  resolveMovementCostMultiplierAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): number {
    const terrainEffectIds = this.resolveTerrainEffectIdsAtPoint(map, point);
    if (!terrainEffectIds.length) {
      return 1;
    }
    return this.terrainEffects.resolveCombinedEffects(terrainEffectIds).movementCostMultiplier;
  }

  resolveEnteredTerrainEffectsForMovement(
    map: VttMapStateDto,
    path: Array<{ x: number; y: number }>,
  ): EnteredTerrainEffect[] {
    const seen = new Set<string>();
    const entered: EnteredTerrainEffect[] = [];
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      const gridPoint = this.mapPointToGridPoint(map, point);
      for (const enteredEffect of this.resolveTerrainEffectsAtPoint(map, point)) {
        const terrainEffectId = enteredEffect.terrainEffectId;
        const key = `${gridPoint.x}:${gridPoint.y}:${terrainEffectId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        entered.push(enteredEffect);
      }
    }
    return entered;
  }

  resolveExitedTerrainEffects(
    map: VttMapStateDto,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): EnteredTerrainEffect[] {
    const destinationEffectIds = new Set(
      this.resolveTerrainEffectsAtPoint(map, to).map((entered) => entered.terrainEffectId),
    );
    return this.resolveTerrainEffectsAtPoint(map, from).filter(
      (entered) =>
        !destinationEffectIds.has(entered.terrainEffectId) &&
        this.terrainEffects.supportsTrigger(entered.effect, "on_exit"),
    );
  }

  resolveTerrainEffectsAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): EnteredTerrainEffect[] {
    return this.resolveTerrainEffectIdsAtPoint(map, point).flatMap((terrainEffectId) => {
      const effect = this.terrainEffects.resolveEffect(terrainEffectId);
      return effect ? [{ terrainEffectId, effect }] : [];
    });
  }

  resolveTerrainEffectIdsAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): string[] {
    const gridPoint = this.mapPointToGridPoint(map, point);
    return (map.terrainCells ?? [])
      .filter((cell) => this.cellGridPoints(map, cell).some((cellPoint) =>
        cellPoint.x === gridPoint.x && cellPoint.y === gridPoint.y,
      ))
      .map((cell) => this.extractTerrainEffectId(cell))
      .filter((terrainEffectId): terrainEffectId is string => terrainEffectId !== null);
  }

  assertCombatMovementPathOpen(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
    movementMode: "normal" | "jump",
  ): void {
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      const isDestination = index === path.length - 1;
      const ignoreTokens = movementMode === "jump" && !isDestination;
      if (this.isCombatTokenPlacementBlocked(map, token, point.x, point.y, { ignoreTokens })) {
        throw conflict("COMBAT_409", "이동 경로가 막혀 있습니다.", {
          reason: isDestination ? "DESTINATION_BLOCKED" : "MOVEMENT_PATH_BLOCKED",
          movementMode,
        });
      }
    }
  }

  calculateCombatTokenStepTowardTarget(
    map: VttMapStateDto,
    params: {
      sourceTokenId: string;
      targetTokenId: string;
      maxDistanceFt: number;
      stopWithinFt: number;
    },
  ): { x: number; y: number; distanceMovedFt: number; path: Array<{ x: number; y: number }> } | null {
    const sourceToken = map.tokens.find((token) => token.id === params.sourceTokenId);
    const targetToken = map.tokens.find((token) => token.id === params.targetTokenId);
    if (!sourceToken || !targetToken) {
      return null;
    }

    const startColumn = this.getGridIndex(sourceToken.x, map.gridSize, map.width);
    const startRow = this.getGridIndex(sourceToken.y, map.gridSize, map.height);
    const targetColumn = this.getGridIndex(targetToken.x, map.gridSize, map.width);
    const targetRow = this.getGridIndex(targetToken.y, map.gridSize, map.height);
    const stopWithinCells = Math.max(1, Math.ceil(params.stopWithinFt / 5));
    const maxSteps = Math.max(0, Math.floor(params.maxDistanceFt / 5));
    if (!maxSteps || this.getChebyshevDistance(startColumn, startRow, targetColumn, targetRow) <= stopWithinCells) {
      return null;
    }

    const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
    const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
    const startKey = `${startColumn}:${startRow}`;
    const queue: MovementNode[] = [{ column: startColumn, row: startRow, steps: 0, previousKey: null }];
    const visited = new Set([startKey]);
    const nodeByKey = new Map<string, MovementNode>([[startKey, queue[0]]]);
    const reachable: Array<MovementNode & { targetDistance: number }> = [];
    const directions = [
      { column: 1, row: 0 },
      { column: -1, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: -1 },
      { column: 1, row: 1 },
      { column: 1, row: -1 },
      { column: -1, row: 1 },
      { column: -1, row: -1 },
    ];

    while (queue.length) {
      const current = queue.shift()!;
      const targetDistance = this.getChebyshevDistance(
        current.column,
        current.row,
        targetColumn,
        targetRow,
      );
      if (current.steps > 0 && targetDistance >= stopWithinCells) {
        reachable.push({ ...current, targetDistance });
      }
      if (current.steps >= maxSteps) {
        continue;
      }

      for (const direction of directions) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
          steps: current.steps + 1,
          previousKey: `${current.column}:${current.row}`,
        };
        const key = `${next.column}:${next.row}`;
        if (
          next.column < 0 ||
          next.row < 0 ||
          next.column > maxColumn ||
          next.row > maxRow ||
          visited.has(key)
        ) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - sourceToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - sourceToken.size);
        if (
          this.isCombatTokenPlacementBlocked(map, sourceToken, x, y) ||
          !this.canCombatTokenMoveBetweenGridCells(map, sourceToken, current, next)
        ) {
          continue;
        }

        visited.add(key);
        nodeByKey.set(key, next);
        queue.push(next);
      }
    }

    const best = reachable.sort((left, right) => {
      if (left.targetDistance !== right.targetDistance) {
        return left.targetDistance - right.targetDistance;
      }
      return right.steps - left.steps;
    })[0];
    if (!best || (best.column === startColumn && best.row === startRow)) {
      return null;
    }

    const path = this.buildCombatTokenMovementPath(map, sourceToken, best, nodeByKey);
    if (!path.length) {
      return null;
    }

    const destination = path[path.length - 1];
    return {
      x: destination.x,
      y: destination.y,
      distanceMovedFt: best.steps * 5,
      path,
    };
  }

  buildCombatTokenMovementPath(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    destination: { column: number; row: number; previousKey: string | null },
    nodeByKey: Map<string, { column: number; row: number; previousKey: string | null }>,
  ): Array<{ x: number; y: number }> {
    const cells: Array<{ column: number; row: number }> = [];
    let current: { column: number; row: number; previousKey: string | null } | undefined = destination;

    while (current) {
      cells.push({ column: current.column, row: current.row });
      current = current.previousKey ? nodeByKey.get(current.previousKey) : undefined;
    }

    return cells
      .reverse()
      .slice(1)
      .map((cell) => ({
        x: Math.min(Math.max(cell.column * map.gridSize, 0), map.width - token.size),
        y: Math.min(Math.max(cell.row * map.gridSize, 0), map.height - token.size),
      }));
  }

  canCombatTokenMoveBetweenGridCells(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    from: { column: number; row: number },
    to: { column: number; row: number },
  ): boolean {
    const deltaColumn = to.column - from.column;
    const deltaRow = to.row - from.row;
    if (Math.abs(deltaColumn) !== 1 || Math.abs(deltaRow) !== 1) {
      return true;
    }

    const horizontalX = Math.min(Math.max((from.column + deltaColumn) * map.gridSize, 0), map.width - token.size);
    const horizontalY = Math.min(Math.max(from.row * map.gridSize, 0), map.height - token.size);
    const verticalX = Math.min(Math.max(from.column * map.gridSize, 0), map.width - token.size);
    const verticalY = Math.min(Math.max((from.row + deltaRow) * map.gridSize, 0), map.height - token.size);

    return (
      !this.isCombatTokenPlacementBlocked(map, token, horizontalX, horizontalY) &&
      !this.isCombatTokenPlacementBlocked(map, token, verticalX, verticalY)
    );
  }

  getChebyshevDistance(
    sourceColumn: number,
    sourceRow: number,
    targetColumn: number,
    targetRow: number,
  ): number {
    return Math.max(Math.abs(sourceColumn - targetColumn), Math.abs(sourceRow - targetRow));
  }

  isCombatTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    const blockers = [
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
      ...(options.ignoreTokens
        ? []
        : map.tokens
            .filter((otherToken) => otherToken.id !== token.id && otherToken.hidden !== true)
            .map((otherToken) => ({
              x: otherToken.x,
              y: otherToken.y,
              width: otherToken.size,
              height: otherToken.size,
            }))),
    ];
    const tokenRect = { x, y, width: token.size, height: token.size };
    return blockers.some((blocker) => this.rectsOverlap(tokenRect, blocker));
  }

  rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  doesMovementLeaveThreatenedArea(
    map: VttMapStateDto,
    threatenerToken: VttMapStateDto["tokens"][number],
    moverToken: VttMapStateDto["tokens"][number],
    moverPath: Array<{ x: number; y: number }>,
  ): boolean {
    for (let index = 1; index < moverPath.length; index += 1) {
      const previousMoverToken = { ...moverToken, ...moverPath[index - 1] };
      const nextMoverToken = { ...moverToken, ...moverPath[index] };
      const wasAdjacent = this.getTokenGridDistanceFt(map, threatenerToken, previousMoverToken) <= 5;
      const isAdjacentAfter = this.getTokenGridDistanceFt(map, threatenerToken, nextMoverToken) <= 5;
      if (wasAdjacent && !isAdjacentAfter) {
        return true;
      }
    }
    return false;
  }

  getTokenGridDistanceFt(
    map: VttMapStateDto,
    sourceToken: VttMapStateDto["tokens"][number],
    targetToken: VttMapStateDto["tokens"][number],
  ): number {
    const sourceColumn = this.getGridIndex(sourceToken.x, map.gridSize, map.width);
    const sourceRow = this.getGridIndex(sourceToken.y, map.gridSize, map.height);
    const targetColumn = this.getGridIndex(targetToken.x, map.gridSize, map.width);
    const targetRow = this.getGridIndex(targetToken.y, map.gridSize, map.height);
    const horizontalDistanceFt =
      Math.max(Math.abs(sourceColumn - targetColumn), Math.abs(sourceRow - targetRow)) * 5;
    const elevationDeltaFt = Math.abs(
      this.resolveElevationDeltaFtAtPoint(map, sourceToken) -
        this.resolveElevationDeltaFtAtPoint(map, targetToken),
    );
    if (elevationDeltaFt <= 0) {
      return horizontalDistanceFt;
    }

    return Math.ceil(Math.hypot(horizontalDistanceFt, elevationDeltaFt) / 5) * 5;
  }

  resolveElevationDeltaFtAtPoint(map: VttMapStateDto, point: { x: number; y: number }): number {
    return this.resolveTerrainEffectsAtPoint(map, point).reduce(
      (sum, entered) => sum + entered.effect.elevationDeltaFt,
      0,
    );
  }

  getGridIndex(value: number, gridSize: number, maxSize: number): number {
    return Math.floor(Math.min(Math.max(value, 0), Math.max(0, maxSize - 1)) / gridSize);
  }

  mapPointToGridPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): { x: number; y: number } {
    return {
      x: this.getGridIndex(point.x, map.gridSize, map.width),
      y: this.getGridIndex(point.y, map.gridSize, map.height),
    };
  }

  cellGridPoints(
    map: VttMapStateDto,
    cell: { x: number; y: number; width: number; height: number },
  ): Array<{ x: number; y: number }> {
    const minColumn = this.getGridIndex(cell.x, map.gridSize, map.width);
    const minRow = this.getGridIndex(cell.y, map.gridSize, map.height);
    const maxColumn = this.getGridIndex(cell.x + Math.max(cell.width, 1) - 1, map.gridSize, map.width);
    const maxRow = this.getGridIndex(cell.y + Math.max(cell.height, 1) - 1, map.gridSize, map.height);
    const points: Array<{ x: number; y: number }> = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        points.push({ x: column, y: row });
      }
    }
    return points;
  }

  extractTerrainEffectId(cell: {
    id?: string;
    name?: string | null;
    description?: string | null;
    terrainEffectId?: string | null;
  }): string | null {
    const explicitEffectId =
      typeof cell.terrainEffectId === "string" && cell.terrainEffectId.trim()
        ? cell.terrainEffectId.trim().toLowerCase().replace(/[\s-]+/g, "_")
        : null;
    if (explicitEffectId) {
      return explicitEffectId;
    }

    const candidates = [cell.id, cell.name, cell.description].filter(
      (value): value is string => typeof value === "string",
    );
    return candidates
      .flatMap((value) => value.match(/terrain\.[a-z0-9_.-]+/gi) ?? [])
      .map((value) => value.toLowerCase().replace(/-/g, "_"))[0] ?? null;
  }

  private clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
