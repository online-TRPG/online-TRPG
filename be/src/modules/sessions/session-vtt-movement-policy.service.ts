import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { VTT_DOOR_STATES, VttMapStateDto } from "@trpg/shared-types";

type VttToken = VttMapStateDto["tokens"][number];
type GridCell = { column: number; row: number };
type MovementNode = GridCell & { steps: number; previousKey: string | null };

@Injectable()
export class SessionVttMovementPolicyService {
  private readonly logger = new Logger(SessionVttMovementPolicyService.name);

  ensureTokenPathIsReachable(map: VttMapStateDto, fromToken: VttToken, toToken: VttToken): void {
    if (!this.hasReachableTokenPath(map, fromToken, toToken)) {
      throw new ForbiddenException("Token movement path is blocked by the map.");
    }
  }

  calculateTokenStepTowardTarget(
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
    const nodeByKey = new Map<string, MovementNode>();
    nodeByKey.set(startKey, queue[0]);
    const reachable: Array<MovementNode & { targetDistance: number }> = [];

    while (queue.length) {
      const current = queue.shift()!;
      const targetDistance = this.getChebyshevDistance(current.column, current.row, targetColumn, targetRow);
      if (current.steps > 0 && targetDistance >= stopWithinCells) {
        reachable.push({ ...current, targetDistance });
      }
      if (current.steps >= maxSteps) {
        continue;
      }

      for (const direction of this.getMovementDirections()) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
          steps: current.steps + 1,
          previousKey: `${current.column}:${current.row}`,
        };
        const key = `${next.column}:${next.row}`;
        if (next.column < 0 || next.row < 0 || next.column > maxColumn || next.row > maxRow || visited.has(key)) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - sourceToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - sourceToken.size);
        if (this.isTokenPlacementBlocked(map, sourceToken, x, y) || !this.canMoveBetweenGridCells(map, sourceToken, current, next)) {
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

    const path = this.buildTokenMovementPath(map, sourceToken, best, nodeByKey);
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

  isTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttToken,
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    const blockers = [
      ...(map.terrainCells ?? []).filter((cell) => !cell.terrainEffectId),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== VTT_DOOR_STATES.OPEN && door.state !== VTT_DOOR_STATES.BROKEN),
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

  getTokenDestinationFromMapPoint(map: VttMapStateDto, token: VttToken, point: { x: number; y: number }): { x: number; y: number } {
    const column = this.getGridIndex(point.x, map.gridSize, map.width);
    const row = this.getGridIndex(point.y, map.gridSize, map.height);

    return {
      x: this.clampNumber(column * map.gridSize, 0, map.width - token.size),
      y: this.clampNumber(row * map.gridSize, 0, map.height - token.size),
    };
  }

  ensurePlayerMapShellUnchanged(params: { baseline: VttMapStateDto; comparableBaseline: VttMapStateDto; requested: VttMapStateDto }): void {
    const { baseline, comparableBaseline, requested } = params;
    const isSameStartingPositions =
      requested.startingPositions?.length === 0 ||
      JSON.stringify(comparableBaseline.startingPositions ?? []) === JSON.stringify(requested.startingPositions ?? []);
    const sameFogRects = JSON.stringify(comparableBaseline.fogRects) === JSON.stringify(requested.fogRects);
    const sameTerrainCells = JSON.stringify(comparableBaseline.terrainCells ?? []) === JSON.stringify(requested.terrainCells ?? []);
    const sameWallCells = JSON.stringify(comparableBaseline.wallCells ?? []) === JSON.stringify(requested.wallCells ?? []);
    const sameDoorCells = JSON.stringify(comparableBaseline.doorCells ?? []) === JSON.stringify(requested.doorCells ?? []);
    const sameObjectCells = JSON.stringify(comparableBaseline.objectCells ?? []) === JSON.stringify(requested.objectCells ?? []);
    const sameShell =
      baseline.id === requested.id &&
      baseline.scenarioNodeId === requested.scenarioNodeId &&
      baseline.imageUrl === requested.imageUrl &&
      baseline.gridType === requested.gridType &&
      baseline.gridSize === requested.gridSize &&
      baseline.width === requested.width &&
      baseline.height === requested.height &&
      isSameStartingPositions &&
      sameFogRects &&
      sameTerrainCells &&
      sameWallCells &&
      sameDoorCells &&
      sameObjectCells;

    if (!sameShell) {
      this.logger.warn(
        `[VTT_SHELL_MISMATCH] baselineId=${baseline.id} requestedId=${requested.id} baselineNode=${baseline.scenarioNodeId ?? "null"} requestedNode=${requested.scenarioNodeId ?? "null"} starting=${isSameStartingPositions} fog=${sameFogRects} terrain=${sameTerrainCells} wall=${sameWallCells} door=${sameDoorCells} object=${sameObjectCells} baselineObjects=${(comparableBaseline.objectCells ?? []).length} requestedObjects=${(requested.objectCells ?? []).length}`,
      );
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  calculateTokenGridMovementFt(map: VttMapStateDto, fromToken: VttToken, toToken: VttToken): number {
    const fromColumn = this.getGridIndex(fromToken.x, map.gridSize, map.width);
    const fromRow = this.getGridIndex(fromToken.y, map.gridSize, map.height);
    const toColumn = this.getGridIndex(toToken.x, map.gridSize, map.width);
    const toRow = this.getGridIndex(toToken.y, map.gridSize, map.height);
    return this.getChebyshevDistance(fromColumn, fromRow, toColumn, toRow) * 5;
  }

  ensureOnlyTokenPositionChanged(baseline: VttToken, requested: VttToken): void {
    const baselineStatic = { ...baseline, x: 0, y: 0 };
    const requestedStatic = { ...requested, x: 0, y: 0 };

    if (JSON.stringify(baselineStatic) !== JSON.stringify(requestedStatic)) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }
  }

  private hasReachableTokenPath(map: VttMapStateDto, fromToken: VttToken, toToken: VttToken): boolean {
    const startColumn = this.getGridIndex(fromToken.x, map.gridSize, map.width);
    const startRow = this.getGridIndex(fromToken.y, map.gridSize, map.height);
    const endColumn = this.getGridIndex(toToken.x, map.gridSize, map.width);
    const endRow = this.getGridIndex(toToken.y, map.gridSize, map.height);
    const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
    const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
    const queue: GridCell[] = [{ column: startColumn, row: startRow }];
    const visited = new Set([`${startColumn}:${startRow}`]);

    while (queue.length) {
      const current = queue.shift()!;
      if (current.column === endColumn && current.row === endRow) {
        return true;
      }

      for (const direction of this.getMovementDirections()) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
        };
        const key = `${next.column}:${next.row}`;
        if (next.column < 0 || next.row < 0 || next.column > maxColumn || next.row > maxRow || visited.has(key)) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - toToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - toToken.size);
        if (this.isTokenPlacementBlocked(map, toToken, x, y, { ignoreTokens: true })) {
          continue;
        }

        visited.add(key);
        queue.push(next);
      }
    }

    return false;
  }

  private buildTokenMovementPath(
    map: VttMapStateDto,
    token: VttToken,
    destination: { column: number; row: number; previousKey: string | null },
    nodeByKey: Map<string, { column: number; row: number; previousKey: string | null }>,
  ): Array<{ x: number; y: number }> {
    const cells: GridCell[] = [];
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

  private canMoveBetweenGridCells(map: VttMapStateDto, token: VttToken, from: GridCell, to: GridCell): boolean {
    const deltaColumn = to.column - from.column;
    const deltaRow = to.row - from.row;
    if (Math.abs(deltaColumn) !== 1 || Math.abs(deltaRow) !== 1) {
      return true;
    }

    const horizontalX = Math.min(Math.max((from.column + deltaColumn) * map.gridSize, 0), map.width - token.size);
    const horizontalY = Math.min(Math.max(from.row * map.gridSize, 0), map.height - token.size);
    const verticalX = Math.min(Math.max(from.column * map.gridSize, 0), map.width - token.size);
    const verticalY = Math.min(Math.max((from.row + deltaRow) * map.gridSize, 0), map.height - token.size);

    return !this.isTokenPlacementBlocked(map, token, horizontalX, horizontalY) && !this.isTokenPlacementBlocked(map, token, verticalX, verticalY);
  }

  private getMovementDirections(): GridCell[] {
    return [
      { column: 1, row: 0 },
      { column: -1, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: -1 },
      { column: 1, row: 1 },
      { column: 1, row: -1 },
      { column: -1, row: 1 },
      { column: -1, row: -1 },
    ];
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private getChebyshevDistance(leftColumn: number, leftRow: number, rightColumn: number, rightRow: number): number {
    return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow));
  }

  private getGridIndex(value: number, gridSize: number, maxSize: number): number {
    return Math.floor(Math.min(Math.max(value, 0), Math.max(0, maxSize - 1)) / gridSize);
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }
}
