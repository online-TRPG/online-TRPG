import { Injectable } from "@nestjs/common";

const FEET_PER_GRID = 5;
const FLOATING_POINT_EPSILON = 0.000001;

export type AoeShape = "sphere" | "cone" | "line" | "cube";

export type AoeDirection =
  | "north"
  | "north_east"
  | "east"
  | "south_east"
  | "south"
  | "south_west"
  | "west"
  | "north_west";

export type AoeGridCell = {
  column: number;
  row: number;
};

export type AoeTargetToken = AoeGridCell & {
  id: string;
  hidden?: boolean;
};

export type AoeTargetingInput = {
  shape: AoeShape;
  origin: AoeGridCell;
  sizeFt: number;
  grid: {
    columns: number;
    rows: number;
  };
  direction?: AoeDirection;
  tokens?: AoeTargetToken[];
};

export type AoeTargetingResult = {
  shape: AoeShape;
  origin: AoeGridCell;
  sizeFt: number;
  cells: AoeGridCell[];
  tokenIds: string[];
};

@Injectable()
export class AoeTargetingService {
  resolveTargets(input: AoeTargetingInput): AoeTargetingResult {
    this.assertPositiveInteger(input.grid.columns, "grid.columns");
    this.assertPositiveInteger(input.grid.rows, "grid.rows");
    this.assertPositiveInteger(input.sizeFt, "sizeFt");

    const origin = {
      column: this.clampInteger(input.origin.column, 0, input.grid.columns - 1),
      row: this.clampInteger(input.origin.row, 0, input.grid.rows - 1),
    };
    const cells = this.resolveCells({
      ...input,
      origin,
    });
    const cellKeys = new Set(cells.map((cell) => this.cellKey(cell)));
    const tokenIds = Array.from(
      new Set(
        (input.tokens ?? [])
          .filter((token) => !token.hidden)
          .filter((token) => cellKeys.has(this.cellKey(token)))
          .map((token) => token.id),
      ),
    );

    return {
      shape: input.shape,
      origin,
      sizeFt: input.sizeFt,
      cells,
      tokenIds,
    };
  }

  private resolveCells(input: AoeTargetingInput): AoeGridCell[] {
    switch (input.shape) {
      case "sphere":
        return this.resolveSphereCells(input);
      case "cone":
        return this.resolveConeCells(input);
      case "line":
        return this.resolveLineCells(input);
      case "cube":
        return this.resolveCubeCells(input);
      default:
        throw new Error("shape must be one of sphere, cone, line, cube.");
    }
  }

  private resolveSphereCells(input: AoeTargetingInput): AoeGridCell[] {
    const radiusCells = Math.floor(input.sizeFt / FEET_PER_GRID);
    return this.allCells(input.grid).filter((cell) =>
      Math.hypot(cell.column - input.origin.column, cell.row - input.origin.row) <= radiusCells,
    );
  }

  private resolveConeCells(input: AoeTargetingInput): AoeGridCell[] {
    const lengthCells = Math.floor(input.sizeFt / FEET_PER_GRID);
    const direction = this.directionVector(input.direction);

    return this.allCells(input.grid).filter((cell) => {
      const dx = cell.column - input.origin.column;
      const dy = cell.row - input.origin.row;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) {
        return true;
      }
      if (distance > lengthCells) {
        return false;
      }

      const dot = dx * direction.x + dy * direction.y;
      if (dot <= 0) {
        return false;
      }
      const cosAngle = dot / (distance * Math.hypot(direction.x, direction.y));
      return cosAngle + FLOATING_POINT_EPSILON >= Math.SQRT1_2;
    });
  }

  private resolveLineCells(input: AoeTargetingInput): AoeGridCell[] {
    const lengthCells = Math.floor(input.sizeFt / FEET_PER_GRID);
    const direction = this.directionVector(input.direction);
    const cells: AoeGridCell[] = [];

    for (let step = 0; step <= lengthCells; step += 1) {
      const cell = {
        column: input.origin.column + direction.x * step,
        row: input.origin.row + direction.y * step,
      };
      if (this.isInsideGrid(cell, input.grid)) {
        cells.push(cell);
      }
    }

    return this.uniqueCells(cells);
  }

  private resolveCubeCells(input: AoeTargetingInput): AoeGridCell[] {
    const sideCells = Math.max(1, Math.floor(input.sizeFt / FEET_PER_GRID));
    const cells: AoeGridCell[] = [];

    for (let row = input.origin.row; row < input.origin.row + sideCells; row += 1) {
      for (let column = input.origin.column; column < input.origin.column + sideCells; column += 1) {
        const cell = { column, row };
        if (this.isInsideGrid(cell, input.grid)) {
          cells.push(cell);
        }
      }
    }

    return cells;
  }

  private allCells(grid: AoeTargetingInput["grid"]): AoeGridCell[] {
    const cells: AoeGridCell[] = [];
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        cells.push({ column, row });
      }
    }
    return cells;
  }

  private directionVector(direction: AoeDirection | undefined): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    switch (direction ?? "east") {
      case "north":
        return { x: 0, y: -1 };
      case "north_east":
        return { x: 1, y: -1 };
      case "east":
        return { x: 1, y: 0 };
      case "south_east":
        return { x: 1, y: 1 };
      case "south":
        return { x: 0, y: 1 };
      case "south_west":
        return { x: -1, y: 1 };
      case "west":
        return { x: -1, y: 0 };
      case "north_west":
        return { x: -1, y: -1 };
      default:
        throw new Error("direction must be a supported compass direction.");
    }
  }

  private isInsideGrid(cell: AoeGridCell, grid: AoeTargetingInput["grid"]): boolean {
    return cell.column >= 0 && cell.row >= 0 && cell.column < grid.columns && cell.row < grid.rows;
  }

  private uniqueCells(cells: AoeGridCell[]): AoeGridCell[] {
    const byKey = new Map<string, AoeGridCell>();
    for (const cell of cells) {
      byKey.set(this.cellKey(cell), cell);
    }
    return Array.from(byKey.values());
  }

  private cellKey(cell: AoeGridCell): string {
    return `${cell.column}:${cell.row}`;
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${field} must be a positive integer.`);
    }
  }

  private clampInteger(value: number, min: number, max: number): number {
    if (!Number.isInteger(value)) {
      throw new Error("grid coordinates must be integers.");
    }
    return Math.min(Math.max(value, min), max);
  }
}
