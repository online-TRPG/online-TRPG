import { VTT_DOOR_STATES } from '@trpg/shared-types/frontend';
import type { VttMapStateDto } from '@trpg/shared-types';

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function subtractRect(
  rect: VttMapStateDto['fogRects'][number],
  cut: { x: number; y: number; width: number; height: number }
) {
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const cutRight = cut.x + cut.width;
  const cutBottom = cut.y + cut.height;
  const left = Math.max(rect.x, cut.x);
  const top = Math.max(rect.y, cut.y);
  const right = Math.min(rectRight, cutRight);
  const bottom = Math.min(rectBottom, cutBottom);

  if (left >= right || top >= bottom) return [rect];

  return [
    { ...rect, id: `${rect.id}:gm-top:${Date.now()}`, height: top - rect.y },
    { ...rect, id: `${rect.id}:gm-bottom:${Date.now()}`, y: bottom, height: rectBottom - bottom },
    { ...rect, id: `${rect.id}:gm-left:${Date.now()}`, y: top, width: left - rect.x, height: bottom - top },
    { ...rect, id: `${rect.id}:gm-right:${Date.now()}`, x: right, y: top, width: rectRight - right, height: bottom - top },
  ].filter((piece) => piece.width > 0 && piece.height > 0);
}

function getMovementBlockers(map: VttMapStateDto) {
  return [
    ...(map.terrainCells ?? []),
    ...(map.wallCells ?? []),
    ...(map.doorCells ?? []).filter(
      (door) => door.state !== VTT_DOOR_STATES.OPEN && door.state !== VTT_DOOR_STATES.BROKEN
    ),
  ];
}

function isTokenPlacementBlocked(
  map: VttMapStateDto,
  token: VttMapStateDto['tokens'][number],
  column: number,
  row: number
) {
  const x = Math.min(Math.max(column * map.gridSize, 0), map.width - token.size);
  const y = Math.min(Math.max(row * map.gridSize, 0), map.height - token.size);
  const tokenRect = { x, y, width: token.size, height: token.size };
  return getMovementBlockers(map).some((blocker) => rectsOverlap(tokenRect, blocker));
}

export function getGridDistanceFt(
  map: VttMapStateDto,
  left: Pick<VttMapStateDto['tokens'][number], 'x' | 'y'>,
  right: Pick<VttMapStateDto['tokens'][number], 'x' | 'y'>
) {
  const leftColumn = Math.floor(
    Math.min(Math.max(left.x, 0), Math.max(0, map.width - 1)) / map.gridSize
  );
  const leftRow = Math.floor(
    Math.min(Math.max(left.y, 0), Math.max(0, map.height - 1)) / map.gridSize
  );
  const rightColumn = Math.floor(
    Math.min(Math.max(right.x, 0), Math.max(0, map.width - 1)) / map.gridSize
  );
  const rightRow = Math.floor(
    Math.min(Math.max(right.y, 0), Math.max(0, map.height - 1)) / map.gridSize
  );
  return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow)) * 5;
}

export function findReachableTokenMove(
  map: VttMapStateDto,
  token: VttMapStateDto['tokens'][number],
  tile: { column: number; row: number }
) {
  const start = {
    column: Math.floor(Math.min(Math.max(token.x, 0), Math.max(0, map.width - 1)) / map.gridSize),
    row: Math.floor(Math.min(Math.max(token.y, 0), Math.max(0, map.height - 1)) / map.gridSize),
  };
  const destination = {
    column: Math.max(0, tile.column - 1),
    row: Math.max(0, tile.row - 1),
  };
  const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
  const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
  if (
    destination.column > maxColumn ||
    destination.row > maxRow ||
    isTokenPlacementBlocked(map, token, destination.column, destination.row)
  ) {
    return null;
  }

  const queue: Array<{ column: number; row: number }> = [start];
  const visited = new Set([`${start.column}:${start.row}`]);
  // 상하좌우 + 대각 8방향. 대각 이동을 허용한다.
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
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (current.column === destination.column && current.row === destination.row) {
      return {
        x: Math.min(Math.max(destination.column * map.gridSize, 0), map.width - token.size),
        y: Math.min(Math.max(destination.row * map.gridSize, 0), map.height - token.size),
      };
    }

    directions.forEach((direction) => {
      const next = {
        column: current.column + direction.column,
        row: current.row + direction.row,
      };
      const key = `${next.column}:${next.row}`;
      if (
        next.column < 0 ||
        next.row < 0 ||
        next.column > maxColumn ||
        next.row > maxRow ||
        visited.has(key) ||
        isTokenPlacementBlocked(map, token, next.column, next.row)
      ) {
        return;
      }
      visited.add(key);
      queue.push(next);
    });
  }

  return null;
}
