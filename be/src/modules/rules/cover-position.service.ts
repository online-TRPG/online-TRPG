import { Injectable } from "@nestjs/common";
import { CoverLevel } from "./rule-engine.types";

export type CoverGridPoint = {
  x: number;
  y: number;
};

export type CoverBlocker = {
  point: CoverGridPoint;
  coverLevel: Exclude<CoverLevel, "none">;
  blocksLineOfEffect?: boolean;
};

export type CoverPositionInput = {
  attacker: CoverGridPoint;
  target: CoverGridPoint;
  blockers?: CoverBlocker[];
};

export type CoverPositionResolution = {
  coverLevel: CoverLevel;
  targetable: boolean;
  line: CoverGridPoint[];
  intersectingBlockers: CoverBlocker[];
};

const COVER_RANK: Record<CoverLevel, number> = {
  none: 0,
  half: 1,
  three_quarters: 2,
  full: 3,
};

@Injectable()
export class CoverPositionService {
  resolveCover(input: CoverPositionInput): CoverPositionResolution {
    this.assertPoint(input.attacker, "attacker");
    this.assertPoint(input.target, "target");

    const line = this.resolveLine(input.attacker, input.target);
    const relevantKeys = new Set(line.slice(1, -1).map((point) => this.pointKey(point)));
    const intersectingBlockers = (input.blockers ?? []).filter((blocker) => {
      this.assertPoint(blocker.point, "blocker.point");
      this.assertCoverLevel(blocker.coverLevel);
      return relevantKeys.has(this.pointKey(blocker.point));
    });
    const coverLevel = this.resolveCoverLevel(intersectingBlockers);

    return {
      coverLevel,
      targetable: coverLevel !== "full",
      line,
      intersectingBlockers,
    };
  }

  private resolveCoverLevel(blockers: CoverBlocker[]): CoverLevel {
    if (blockers.some((blocker) => blocker.blocksLineOfEffect || blocker.coverLevel === "full")) {
      return "full";
    }

    const strongest = blockers.reduce<CoverLevel>((current, blocker) =>
      COVER_RANK[blocker.coverLevel] > COVER_RANK[current] ? blocker.coverLevel : current,
    "none");
    if (strongest === "three_quarters") {
      return "three_quarters";
    }
    if (blockers.length >= 2) {
      return "three_quarters";
    }
    return strongest;
  }

  private resolveLine(start: CoverGridPoint, end: CoverGridPoint): CoverGridPoint[] {
    const points: CoverGridPoint[] = [];
    let x = start.x;
    let y = start.y;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let error = dx - dy;

    while (true) {
      points.push({ x, y });
      if (x === end.x && y === end.y) {
        return points;
      }
      const doubleError = error * 2;
      if (doubleError > -dy) {
        error -= dy;
        x += sx;
      }
      if (doubleError < dx) {
        error += dx;
        y += sy;
      }
    }
  }

  private pointKey(point: CoverGridPoint): string {
    return `${point.x}:${point.y}`;
  }

  private assertPoint(point: CoverGridPoint, field: string): void {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      throw new Error(`${field} must use integer grid coordinates.`);
    }
  }

  private assertCoverLevel(value: CoverLevel): void {
    if (!["half", "three_quarters", "full"].includes(value)) {
      throw new Error("blocker coverLevel must be half, three_quarters, or full.");
    }
  }
}
