import type { VttMapStateDto } from '@trpg/shared-types';

const feetPerGrid = 5;

type VisionPoint = { x: number; y: number };
type VisionSource = VisionPoint & { rangeFt?: number | null };
type VisionCell = { column: number; row: number };

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function getVisionCellKey(column: number, row: number) {
  return `${column}:${row}`;
}

export function getVisionGridIndex(value: number, gridSize: number, maxSize: number) {
  return Math.floor(clamp(value, 0, Math.max(0, maxSize - 1)) / gridSize);
}

function addRectCells(
  cells: Set<string>,
  rect: { x: number; y: number; width: number; height: number },
  map: Pick<VttMapStateDto, 'gridSize' | 'width' | 'height'>
) {
  const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
  const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
  const minColumn = Math.max(0, Math.floor(rect.x / map.gridSize));
  const maxRectColumn = Math.min(maxColumn, Math.ceil((rect.x + rect.width) / map.gridSize) - 1);
  const minRow = Math.max(0, Math.floor(rect.y / map.gridSize));
  const maxRectRow = Math.min(maxRow, Math.ceil((rect.y + rect.height) / map.gridSize) - 1);

  for (let row = minRow; row <= maxRectRow; row += 1) {
    for (let column = minColumn; column <= maxRectColumn; column += 1) {
      cells.add(getVisionCellKey(column, row));
    }
  }
}

export function getOpaqueVisionCells(map: VttMapStateDto) {
  const opaque = new Set<string>();
  const blockers = [
    ...(map.terrainCells ?? []),
    ...(map.wallCells ?? []),
    ...(map.doorCells ?? []).filter((door) => door.state !== 'open' && door.state !== 'broken'),
  ];

  blockers.forEach((blocker) => addRectCells(opaque, blocker, map));
  return opaque;
}

function isWithinRadius(origin: VisionCell, target: VisionCell, radiusCells: number) {
  const dx = target.column - origin.column;
  const dy = target.row - origin.row;
  return Math.sqrt(dx * dx + dy * dy) <= radiusCells + 0.0001;
}

const shadowcastTransforms = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
] as const;

function castShadow(
  visible: Set<string>,
  opaque: Set<string>,
  origin: VisionCell,
  radiusCells: number,
  bounds: { maxColumn: number; maxRow: number },
  row: number,
  startSlope: number,
  endSlope: number,
  transform: readonly [number, number, number, number]
) {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;
  const [xx, xy, yx, yy] = transform;

  for (let distance = row; distance <= radiusCells; distance += 1) {
    let blocked = false;
    let deltaY = -distance;

    for (let deltaX = -distance; deltaX <= 0; deltaX += 1) {
      const column = origin.column + deltaX * xx + deltaY * xy;
      const targetRow = origin.row + deltaX * yx + deltaY * yy;
      const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
      const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);

      if (startSlope < rightSlope) {
        continue;
      }
      if (endSlope > leftSlope) {
        break;
      }
      if (column < 0 || targetRow < 0 || column > bounds.maxColumn || targetRow > bounds.maxRow) {
        continue;
      }

      const key = getVisionCellKey(column, targetRow);
      const target = { column, row: targetRow };
      const targetOpaque = opaque.has(key);

      if (isWithinRadius(origin, target, radiusCells)) {
        visible.add(key);
      }

      if (blocked) {
        if (targetOpaque) {
          nextStartSlope = rightSlope;
          continue;
        }

        blocked = false;
        startSlope = nextStartSlope;
      } else if (targetOpaque && distance < radiusCells) {
        blocked = true;
        castShadow(
          visible,
          opaque,
          origin,
          radiusCells,
          bounds,
          distance + 1,
          startSlope,
          leftSlope,
          transform
        );
        nextStartSlope = rightSlope;
      }
    }

    if (blocked) {
      break;
    }
  }
}

function computeSourceFov(
  visible: Set<string>,
  opaque: Set<string>,
  map: VttMapStateDto,
  source: VisionSource,
  fallbackRangeFt: number
) {
  const origin = {
    column: getVisionGridIndex(source.x, map.gridSize, map.width),
    row: getVisionGridIndex(source.y, map.gridSize, map.height),
  };
  const radiusCells = Math.max(0, Math.ceil((source.rangeFt ?? fallbackRangeFt) / feetPerGrid));
  const bounds = {
    maxColumn: Math.max(0, Math.ceil(map.width / map.gridSize) - 1),
    maxRow: Math.max(0, Math.ceil(map.height / map.gridSize) - 1),
  };

  visible.add(getVisionCellKey(origin.column, origin.row));

  shadowcastTransforms.forEach((transform) => {
    castShadow(visible, opaque, origin, radiusCells, bounds, 1, 1, 0, transform);
  });
}

export function computeVisibleVisionCells(params: {
  map: VttMapStateDto;
  sources: VisionSource[];
  rangeFt: number;
}) {
  const visible = new Set<string>();
  if (!params.sources.length) return visible;

  const opaque = getOpaqueVisionCells(params.map);
  params.sources.forEach((source) =>
    computeSourceFov(visible, opaque, params.map, source, params.rangeFt)
  );
  return visible;
}
